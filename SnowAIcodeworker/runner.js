"use strict";

const {spawn, spawnSync} = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const net = require("net");
const path = require("path");

function readJson(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch {
        return null;
    }
}

function writeJsonAtomic(filePath, value) {
    const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2), "utf8");
    fs.renameSync(temporary, filePath);
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function redact(text, enabled) {
    if (!enabled || !text) return text || "";
    return String(text)
        .replace(/\b(?:api[_-]?key|token|secret|password)\b\s*[=:]\s*["']?[^\s"']{6,}["']?/gi, "***MASKED***")
        .replace(/Authorization\s*:\s*Bearer\s+\S+/gi, "Authorization: Bearer ***MASKED***")
        .replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g, "***MASKED***");
}

function killTree(pid) {
    if (!pid) return;
    if (process.platform === "win32") {
        spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {stdio: "ignore", windowsHide: true});
        return;
    }
    try { process.kill(-Number(pid), "SIGTERM"); } catch { try { process.kill(Number(pid), "SIGTERM"); } catch {} }
    spawnSync("sh", ["-c", "sleep 1"], {stdio: "ignore"});
    try { process.kill(-Number(pid), "SIGKILL"); } catch { try { process.kill(Number(pid), "SIGKILL"); } catch {} }
}

function findFreePort(minimum, maximum) {
    return new Promise((resolve, reject) => {
        const attempts = Math.min(100, Math.max(1, maximum - minimum + 1));
        const tried = new Set();
        const tryNext = () => {
            if (tried.size >= attempts) {
                reject(new Error(`无法在端口范围 ${minimum}-${maximum} 找到空闲端口。`));
                return;
            }
            let port;
            do {
                port = minimum + Math.floor(Math.random() * (maximum - minimum + 1));
            } while (tried.has(port));
            tried.add(port);
            const server = net.createServer();
            server.unref();
            server.once("error", tryNext);
            server.listen({host: "127.0.0.1", port, exclusive: true}, () => {
                server.close(() => resolve(port));
            });
        };
        tryNext();
    });
}

function httpJson(port, method, pathname, payload, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
        const body = payload === undefined ? "" : JSON.stringify(payload);
        const request = http.request({
            hostname: "127.0.0.1",
            port,
            path: pathname,
            method,
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(body),
            },
            timeout: timeoutMs,
        }, response => {
            let raw = "";
            response.setEncoding("utf8");
            response.on("data", chunk => { raw += chunk; });
            response.on("end", () => {
                let data = raw;
                try { data = raw ? JSON.parse(raw) : {}; } catch {}
                if ((response.statusCode || 500) >= 400) {
                    reject(new Error(`HTTP ${response.statusCode}: ${typeof data === "string" ? data : JSON.stringify(data)}`));
                    return;
                }
                resolve(data);
            });
        });
        request.on("timeout", () => request.destroy(new Error(`HTTP ${method} ${pathname} 超时`)));
        request.on("error", reject);
        if (body) request.write(body);
        request.end();
    });
}

async function waitForHealth(port, timeoutMs, child) {
    const deadline = Date.now() + timeoutMs;
    let lastError;
    while (Date.now() < deadline) {
        if (child.exitCode !== null) throw new Error(`Snow SSE 进程提前退出，退出码 ${child.exitCode}`);
        try {
            const health = await httpJson(port, "GET", "/health", undefined, 2000);
            if (health && health.status === "ok") return;
        } catch (error) {
            lastError = error;
        }
        await delay(300);
    }
    throw new Error(`Snow SSE 启动超时：${lastError instanceof Error ? lastError.message : "health check failed"}`);
}

function connectSse(port, onEvent) {
    let request;
    let response;
    let closed = false;
    const connected = new Promise((resolve, reject) => {
        request = http.request({
            hostname: "127.0.0.1",
            port,
            path: "/events",
            method: "GET",
            headers: {Accept: "text/event-stream"},
        }, incoming => {
            response = incoming;
            if (incoming.statusCode !== 200) {
                reject(new Error(`SSE 连接失败：HTTP ${incoming.statusCode}`));
                incoming.resume();
                return;
            }
            incoming.setEncoding("utf8");
            let buffer = "";
            incoming.on("data", chunk => {
                buffer += chunk.replace(/\r\n/g, "\n");
                let boundary;
                while ((boundary = buffer.indexOf("\n\n")) >= 0) {
                    const frame = buffer.slice(0, boundary);
                    buffer = buffer.slice(boundary + 2);
                    const data = frame.split("\n")
                        .filter(line => line.startsWith("data:"))
                        .map(line => line.slice(5).trimStart())
                        .join("\n");
                    if (!data) continue;
                    try {
                        const event = JSON.parse(data);
                        if (event.type === "connected") resolve(event);
                        Promise.resolve(onEvent(event)).catch(() => {});
                    } catch {}
                }
            });
            incoming.on("error", error => {
                if (!closed) reject(error);
            });
        });
        request.on("error", error => {
            if (!closed) reject(error);
        });
        request.end();
    });
    return {
        connected,
        close() {
            closed = true;
            try { response?.destroy(); } catch {}
            try { request?.destroy(); } catch {}
        },
    };
}

function extractSummary(text) {
    const match = String(text || "").match(/【执行结果摘要】[^\r\n]*/);
    return match ? match[0].trim() : String(text || "").trim().slice(-500);
}

function splitList(value) {
    const cleaned = String(value || "").trim();
    if (!cleaned || /^(无|none)$/i.test(cleaned)) return [];
    return cleaned.split(/[,，、]/).map(item => item.trim()).filter(item => item && !/^(无|none)$/i.test(item));
}

function extractFileChanges(text) {
    const line = String(text || "").match(/【文件变更】[^\r\n]*/)?.[0] || "";
    const readPart = label => {
        const match = line.match(new RegExp(`${label}\\s*[:：]\\s*([^|｜]+)`, "i"));
        return splitList(match?.[1]);
    };
    return {
        modified: readPart("修改"),
        created: readPart("新增"),
        deleted: readPart("删除"),
    };
}

function incrementTool(stats, name) {
    const toolName = name || "unknown";
    stats.byName[toolName] = (stats.byName[toolName] || 0) + 1;
}

async function run() {
    const argsFile = process.argv[2];
    if (!argsFile || !fs.existsSync(argsFile)) process.exit(1);
    const args = readJson(argsFile);
    if (!args) process.exit(1);

    const {jobId, jobRoot, snowBin, snowBinArgs = [], projectPath, task, sessionId, timeoutSec,
        startupTimeoutSec, interactionTimeoutMs, portMin, portMax, redactSecrets} = args;
    const metaPath = path.join(jobRoot, "meta", `${jobId}.json`);
    const outputPath = path.join(jobRoot, "output", `${jobId}.txt`);
    const logPath = path.join(jobRoot, "logs", `${jobId}.log`);
    const eventsPath = path.join(jobRoot, "events", `${jobId}.jsonl`);
    let meta = readJson(metaPath);
    if (!meta) process.exit(1);

    const saveMeta = () => writeJsonAtomic(metaPath, meta);
    const appendLog = message => fs.appendFileSync(logPath, `${new Date().toISOString()} ${redact(message, redactSecrets)}\n`, "utf8");
    const appendEvent = event => fs.appendFileSync(eventsPath, `${JSON.stringify(event)}\n`, "utf8");

    let snowProcess;
    let eventStream;
    let timeoutHandle;
    let completed = false;
    let pendingQuestion = null;
    let lastToolName = null;
    let postMessagePromise = null;

    const finishPromise = new Promise((resolve, reject) => {
        const finish = event => {
            if (completed) return;
            completed = true;
            resolve(event);
        };
        const fail = error => {
            if (completed) return;
            completed = true;
            reject(error);
        };
        run.finish = finish;
        run.fail = fail;
    });

    try {
        const port = await findFreePort(portMin, portMax);
        const outputFd = fs.openSync(logPath, "a");
        snowProcess = spawn(snowBin, [
            ...snowBinArgs,
            "--sse",
            "--sse-port", String(port),
            "--sse-timeout", String(interactionTimeoutMs),
            "--work-dir", projectPath,
        ], {
            cwd: projectPath,
            env: {...process.env, NO_COLOR: "1", FORCE_COLOR: "0"},
            stdio: ["ignore", outputFd, outputFd],
            detached: true,
            windowsHide: true,
            shell: false,
        });
        fs.closeSync(outputFd);
        meta.snowPid = snowProcess.pid;
        meta.ssePort = port;
        saveMeta();
        snowProcess.once("error", error => run.fail(error));
        snowProcess.once("exit", (code, signal) => {
            if (!completed) run.fail(new Error(`Snow SSE 进程退出：code=${code}, signal=${signal || "none"}`));
        });

        await waitForHealth(port, startupTimeoutSec * 1000, snowProcess);
        appendLog(`Snow SSE 已就绪，端口 ${port}`);

        eventStream = connectSse(port, async event => {
            appendEvent(event);
            const eventType = event?.type;
            const data = event?.data || {};
            if (eventType === "message") {
                if (data.sessionId) {
                    meta.sessionId = data.sessionId;
                    saveMeta();
                }
                if (data.role === "assistant" && typeof data.content === "string" && !data.streaming) {
                    meta.finalResponse = redact(data.content, redactSecrets);
                    saveMeta();
                }
                return;
            }
            if (eventType === "tool_call") {
                const name = data.name || data.function?.name || "unknown";
                lastToolName = name;
                meta.toolStats.requested++;
                incrementTool(meta.toolStats, name);
                saveMeta();
                return;
            }
            if (eventType === "tool_result") {
                if (data.status === "success") meta.toolStats.succeeded++;
                else meta.toolStats.failed++;
                saveMeta();
                return;
            }
            if (eventType === "usage") {
                meta.usage = data;
                saveMeta();
                return;
            }
            if (eventType === "tool_confirmation_request") {
                const name = data.toolCall?.function?.name || lastToolName || "unknown";
                if (data.isSensitive) {
                    meta.toolStats.rejectedSensitive++;
                    meta.warnings.push({
                        code: "SENSITIVE_TOOL_REJECTED",
                        tool: name,
                        pattern: data.sensitiveInfo?.pattern || null,
                        message: "敏感工具已按无人值守策略拒绝。",
                    });
                    await httpJson(port, "POST", "/message", {
                        type: "tool_confirmation_response",
                        requestId: event.requestId,
                        response: {rejectWithReply: "该操作被 AICodeWorker 无人值守安全策略判定为敏感操作并拒绝。请改用安全方案，或向上游用户说明需要人工执行。"},
                    });
                } else {
                    meta.toolStats.approved++;
                    await httpJson(port, "POST", "/message", {
                        type: "tool_confirmation_response",
                        requestId: event.requestId,
                        response: "approve",
                    });
                }
                saveMeta();
                return;
            }
            if (eventType === "user_question_request") {
                pendingQuestion = {
                    question: String(data.question || ""),
                    options: Array.isArray(data.options) ? data.options : [],
                    multiSelect: Boolean(data.multiSelect),
                    requestId: event.requestId,
                };
                await httpJson(port, "POST", "/message", {
                    type: "user_question_response",
                    requestId: event.requestId,
                    response: {selected: data.multiSelect ? [] : "", customInput: "", cancelled: true},
                });
                return;
            }
            if (eventType === "error") {
                run.fail(new Error(data.message || "Snow SSE 返回未知错误"));
                return;
            }
            if (eventType === "complete") {
                if (data.sessionId) meta.sessionId = data.sessionId;
                if (data.usage) meta.usage = data.usage;
                run.finish(event);
            }
        });
        await eventStream.connected;

        timeoutHandle = setTimeout(() => run.fail(new Error(`任务执行超过 ${timeoutSec} 秒`)), timeoutSec * 1000);
        postMessagePromise = httpJson(port, "POST", "/message", {
            type: "chat",
            content: task,
            ...(sessionId ? {sessionId} : {}),
            yoloMode: false,
        }, (timeoutSec + startupTimeoutSec + 30) * 1000).catch(error => {
            if (!completed) run.fail(error);
        });

        await finishPromise;
        await Promise.race([postMessagePromise, delay(2000)]);
        clearTimeout(timeoutHandle);

        const finalResponse = redact(meta.finalResponse || "", redactSecrets);
        meta.summary = extractSummary(finalResponse);
        meta.fileChanges = extractFileChanges(finalResponse);
        meta.completedAt = new Date().toISOString();
        if (pendingQuestion) {
            meta.state = "waiting_for_answer";
            meta.pendingQuestion = {
                ...pendingQuestion,
                resumeToken: `resume_${crypto.randomBytes(24).toString("base64url")}`,
                createdAt: meta.completedAt,
                consumedAt: null,
            };
        } else {
            meta.state = "completed";
        }
        saveMeta();
        fs.appendFileSync(outputPath, `${finalResponse}\n\n=== ${meta.state} (${meta.completedAt}) ===\n`, "utf8");
    } catch (error) {
        clearTimeout(timeoutHandle);
        meta = readJson(metaPath) || meta;
        if (meta.state === "running") {
            const message = redact(error instanceof Error ? error.message : String(error), redactSecrets);
            meta.state = message.includes("任务执行超过") ? "timeout" : "failed";
            meta.error = {code: meta.state === "timeout" ? "TIMEOUT" : "SNOW_EXECUTION_FAILED", message};
            meta.completedAt = new Date().toISOString();
            saveMeta();
            fs.appendFileSync(outputPath, `\n=== ${meta.state}: ${message} ===\n`, "utf8");
            appendLog(message);
        }
    } finally {
        clearTimeout(timeoutHandle);
        try { eventStream?.close(); } catch {}
        if (snowProcess?.pid) killTree(snowProcess.pid);
        meta = readJson(metaPath) || meta;
        if (meta) {
            meta.snowPid = null;
            saveMeta();
        }
    }
}

run().catch(() => process.exit(1));
