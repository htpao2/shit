#!/usr/bin/env node
"use strict";

const http = require("http");

const args = process.argv.slice(2);
if (args.includes("--version")) {
    process.stdout.write("mock-snow 1.0.0\n");
    process.exit(0);
}

const readArg = (name, fallback) => {
    const index = args.indexOf(name);
    return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const port = Number(readArg("--sse-port", "32100"));
let client = null;
let activeSession = null;
let pendingMode = null;

function send(type, data, requestId) {
    if (!client) return;
    client.write(`data: ${JSON.stringify({type, data, requestId, timestamp: new Date().toISOString()})}\n\n`);
}

function readBody(request) {
    return new Promise(resolve => {
        let body = "";
        request.on("data", chunk => { body += chunk; });
        request.on("end", () => resolve(body ? JSON.parse(body) : {}));
    });
}

function finish(content, cancelled = false) {
    send("message", {role: "assistant", content, streaming: false});
    send("usage", {prompt_tokens: 10, completion_tokens: 5, total_tokens: 15});
    send("complete", {
        sessionId: activeSession,
        usage: {input_tokens: 10, output_tokens: 5},
        ...(cancelled ? {cancelled: true} : {}),
    });
}

const server = http.createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/health") {
        response.writeHead(200, {"Content-Type": "application/json"});
        response.end(JSON.stringify({status: "ok", connections: client ? 1 : 0}));
        return;
    }
    if (request.method === "GET" && request.url === "/events") {
        client = response;
        response.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
        });
        send("connected", {connectionId: "mock-connection"});
        request.on("close", () => { client = null; });
        return;
    }
    if (request.method === "POST" && request.url === "/message") {
        const body = await readBody(request);
        response.writeHead(200, {"Content-Type": "application/json"});
        response.end(JSON.stringify({success: true}));

        if (body.type === "chat") {
            activeSession = body.sessionId || `mock-session-${Date.now()}`;
            send("message", {role: "system", sessionId: activeSession, content: `Session ID: ${activeSession}`});
            send("message", {role: "user", content: body.content});
            if (String(body.content).includes("SCENARIO_HANG")) {
                pendingMode = "hang";
                return;
            }
            if (String(body.content).includes("SCENARIO_QUESTION")) {
                pendingMode = "question";
                send("user_question_request", {
                    question: "选择数据库",
                    options: ["SQLite", "PostgreSQL"],
                    multiSelect: false,
                    toolCall: {function: {name: "askuser-ask_question", arguments: "{}"}},
                }, "question-1");
                return;
            }
            if (String(body.content).includes("SCENARIO_SENSITIVE")) {
                pendingMode = "sensitive";
                send("tool_confirmation_request", {
                    toolCall: {function: {name: "terminal-execute", arguments: "{\"command\":\"rm -rf target\"}"}},
                    isSensitive: true,
                    sensitiveInfo: {pattern: "rm -rf", description: "危险删除"},
                }, "tool-sensitive");
                return;
            }
            pendingMode = "normal";
            send("tool_call", {name: "filesystem-read", arguments: {filePath: "README.md"}});
            send("tool_confirmation_request", {
                toolCall: {function: {name: "filesystem-read", arguments: "{\"filePath\":\"README.md\"}"}},
                isSensitive: false,
            }, "tool-safe");
            return;
        }
        if (body.type === "tool_confirmation_response") {
            if (pendingMode === "normal") {
                send("tool_result", {content: "ok", status: "success"});
                finish("任务完成\n【读取文件清单】README.md\n【文件变更】修改:无 | 新增:无 | 删除:无\n【执行结果摘要】模拟普通任务完成");
            } else if (pendingMode === "sensitive") {
                finish("敏感操作已改用安全方案\n【读取文件清单】无\n【文件变更】修改:无 | 新增:无 | 删除:无\n【执行结果摘要】敏感命令已拒绝");
            }
            return;
        }
        if (body.type === "user_question_response") {
            finish("等待用户选择后继续\n【读取文件清单】无\n【文件变更】修改:无 | 新增:无 | 删除:无\n【执行结果摘要】已暂停并等待用户回答", true);
        }
        return;
    }
    response.writeHead(404);
    response.end();
});

server.listen(port, "127.0.0.1");

const shutdown = () => server.close(() => process.exit(0));
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
