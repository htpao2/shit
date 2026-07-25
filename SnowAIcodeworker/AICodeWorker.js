"use strict";

const { spawn, spawnSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const TERMINAL_STATES = new Set([
    "completed",
    "failed",
    "timeout",
    "cancelled",
    "waiting_for_answer",
]);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function parseEnvFile(filePath) {
    const values = {};
    if (!fs.existsSync(filePath)) return values;
    for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const separator = trimmed.indexOf("=");
        if (separator < 0) continue;
        const key = trimmed.slice(0, separator).trim();
        const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
        values[key] = value;
    }
    return values;
}

function parseJsonArray(value) {
    if (!value) return [];
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) && parsed.every(item => typeof item === "string") ? parsed : [];
    } catch {
        return [];
    }
}

function loadConfig() {
    const raw = parseEnvFile(path.join(__dirname, "config.env"));
    const roots = raw.ALLOWED_PROJECT_ROOTS || process.cwd();
    return {
        snowBin: raw.SNOW_BIN || "snow",
        snowBinArgs: parseJsonArray(raw.SNOW_BIN_ARGS),
        allowedRoots: roots.split(",").map(value => value.trim()).filter(Boolean),
        jobRoot: raw.JOB_ROOT || path.join(__dirname, "jobs"),
        maxTaskChars: Number.parseInt(raw.MAX_TASK_CHARS || "20000", 10),
        defaultTimeoutSec: Number.parseInt(raw.DEFAULT_TIMEOUT_SEC || "900", 10),
        startupTimeoutSec: Number.parseInt(raw.SNOW_STARTUP_TIMEOUT_SEC || "45", 10),
        interactionTimeoutMs: Number.parseInt(raw.SNOW_INTERACTION_TIMEOUT_MS || "300000", 10),
        portMin: Number.parseInt(raw.SNOW_SSE_PORT_MIN || "32100", 10),
        portMax: Number.parseInt(raw.SNOW_SSE_PORT_MAX || "32999", 10),
        maxConcurrentJobs: Math.max(1, Number.parseInt(raw.MAX_CONCURRENT_JOBS || "1", 10)),
        retainDays: Math.max(1, Number.parseInt(raw.JOB_RETAIN_DAYS || "7", 10)),
        fullTranscriptMaxChars: Math.max(10000, Number.parseInt(raw.FULL_TRANSCRIPT_MAX_CHARS || "100000", 10)),
        redactSecrets: (raw.REDACT_SECRETS || "true").toLowerCase() !== "false",
        projectContext: (raw.PROJECT_CONTEXT || "").replace(/\\n/g, "\n"),
    };
}

function resolveSnowLaunch(bin, fixedArgs) {
    if (process.platform !== "win32") return {bin, args: fixedArgs, viaCmd: false};
    const extension = path.extname(bin).toLowerCase();
    let resolved = bin;
    if (!extension) {
        const lookup = spawnSync("where.exe", [bin], {encoding: "utf8", windowsHide: true});
        const candidates = String(lookup.stdout || "").split(/\r?\n/).map(value => value.trim()).filter(Boolean);
        resolved = candidates.find(candidate => candidate.toLowerCase().endsWith(".cmd")) || candidates[0] || bin;
    }
    if ([".cmd", ".bat"].includes(path.extname(resolved).toLowerCase())) {
        return {bin: process.env.ComSpec || "cmd.exe", args: ["/d", "/s", "/c", resolved, ...fixedArgs], viaCmd: true};
    }
    return {bin: resolved, args: fixedArgs, viaCmd: false};
}

const CFG = loadConfig();
const SNOW_LAUNCH = resolveSnowLaunch(CFG.snowBin, CFG.snowBinArgs);
const LOCK_FILE = path.join(CFG.jobRoot, ".job_lock");
const SECRET_PATTERNS = [
    /\b(?:api[_-]?key|token|secret|password)\b\s*[=:]\s*["']?[^\s"']{6,}["']?/gi,
    /Authorization\s*:\s*Bearer\s+\S+/gi,
    /\bsk-[A-Za-z0-9_-]{16,}\b/g,
];

function redact(value) {
    if (!CFG.redactSecrets || !value) return value || "";
    let output = String(value);
    for (const pattern of SECRET_PATTERNS) output = output.replace(pattern, "***MASKED***");
    return output;
}

function ensureJobDirs() {
    for (const name of ["meta", "output", "logs", "events", "tokens"]) {
        fs.mkdirSync(path.join(CFG.jobRoot, name), {recursive: true});
    }
}

function generateJobId() {
    const now = new Date();
    const pad = value => String(value).padStart(2, "0");
    return `job_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}_${crypto.randomBytes(2).toString("hex")}`;
}

function jobPaths(jobId) {
    return {
        meta: path.join(CFG.jobRoot, "meta", `${jobId}.json`),
        args: path.join(CFG.jobRoot, "meta", `${jobId}.args.json`),
        output: path.join(CFG.jobRoot, "output", `${jobId}.txt`),
        log: path.join(CFG.jobRoot, "logs", `${jobId}.log`),
        events: path.join(CFG.jobRoot, "events", `${jobId}.jsonl`),
    };
}

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

function readMeta(jobId) {
    return readJson(jobPaths(jobId).meta);
}

function saveMeta(jobId, meta) {
    writeJsonAtomic(jobPaths(jobId).meta, meta);
}

function normalizeForComparison(candidate) {
    const resolved = path.resolve(candidate);
    return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isPathInside(candidate, root) {
    const normalizedCandidate = normalizeForComparison(candidate);
    const normalizedRoot = normalizeForComparison(root);
    const relative = path.relative(normalizedRoot, normalizedCandidate);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function validateProjectPath(projectPath) {
    if (typeof projectPath !== "string" || !projectPath.trim()) {
        return {code: "INVALID_ARGS", message: "projectPath 是必填参数。"};
    }
    const resolved = path.resolve(projectPath);
    if (!CFG.allowedRoots.some(root => isPathInside(resolved, root))) {
        return {
            code: "PATH_NOT_ALLOWED",
            message: `projectPath \"${resolved}\" 不在白名单内。允许的根目录: ${CFG.allowedRoots.join(", ")}`,
        };
    }
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
        return {code: "NOT_FOUND", message: `projectPath \"${resolved}\" 不存在或不是目录。`};
    }
    return null;
}

function acquireLock() {
    ensureJobDirs();
    try {
        if (fs.existsSync(LOCK_FILE)) {
            const age = Date.now() - fs.statSync(LOCK_FILE).mtimeMs;
            if (age > (CFG.defaultTimeoutSec + 120) * 1000) fs.unlinkSync(LOCK_FILE);
        }
        const descriptor = fs.openSync(LOCK_FILE, "wx");
        fs.writeFileSync(descriptor, `${process.pid}:${Date.now()}`, "utf8");
        fs.closeSync(descriptor);
        return true;
    } catch {
        return false;
    }
}

function releaseLock() {
    try { fs.unlinkSync(LOCK_FILE); } catch {}
}

function isProcessRunning(pid) {
    if (!pid) return false;
    try {
        process.kill(Number(pid), 0);
        return true;
    } catch {
        return false;
    }
}

function markDeadRunner(meta) {
    if (meta && meta.state === "running" && meta.runnerPid && !isProcessRunning(meta.runnerPid)) {
        meta.state = "failed";
        meta.error = {code: "RUNNER_EXITED", message: "Snow runner 意外退出。"};
        meta.completedAt = new Date().toISOString();
        saveMeta(meta.jobId, meta);
    }
    return meta;
}

function listMetaFiles(limit = 200) {
    ensureJobDirs();
    return fs.readdirSync(path.join(CFG.jobRoot, "meta"))
        .filter(name => name.endsWith(".json") && !name.endsWith(".args.json"))
        .sort()
        .reverse()
        .slice(0, limit);
}

function countActiveJobs() {
    let count = 0;
    for (const file of listMetaFiles()) {
        const meta = markDeadRunner(readJson(path.join(CFG.jobRoot, "meta", file)));
        if (meta?.state === "running") count++;
    }
    return count;
}

function cleanupOldJobs() {
    const cutoff = Date.now() - CFG.retainDays * 86400000;
    let removed = 0;
    for (const file of listMetaFiles(1000).reverse()) {
        if (removed >= 50) break;
        const meta = readJson(path.join(CFG.jobRoot, "meta", file));
        if (!meta || meta.state === "running") continue;
        const timestamp = new Date(meta.completedAt || meta.startedAt || 0).getTime();
        if (!timestamp || timestamp >= cutoff) continue;
        const paths = jobPaths(meta.jobId);
        for (const target of Object.values(paths)) {
            try { fs.unlinkSync(target); } catch {}
        }
        removed++;
    }
}

const PRESETS = {
    index: {
        mode: "analyze",
        required: ["targetPath"],
        create: input => `读取 ${input.targetPath}，列出所有函数/方法索引。每行格式：行号 | 名称 | 功能（20字以内）。不要修改文件。`,
    },
    read: {
        mode: "analyze",
        required: ["targetPath"],
        create: input => `读取 ${input.targetPath} 的完整内容并原样输出，不要修改任何文件。`,
    },
    scan: {
        mode: "analyze",
        required: ["targetPath"],
        create: input => `扫描 ${input.targetPath}${input.depth ? `，最多 ${input.depth} 层` : ""}，输出目录树并说明各文件用途，不要修改文件。`,
    },
    bug: {
        mode: "analyze",
        required: ["targetPath", "error"],
        create: input => `分析 ${input.targetPath} 中错误的根因：${input.error}${input.detail ? `\n补充：${input.detail}` : ""}\n只输出分析与修复建议，不要修改文件。`,
    },
    set: {
        mode: "write",
        required: ["targetPath", "key", "value"],
        create: input => `修改 ${input.targetPath}，仅将 ${input.key} 的值改为 ${input.value}。禁止修改其他文件；完成后读取相关行验证。`,
    },
    append: {
        mode: "write",
        required: ["targetPath", "content"],
        create: input => `在 ${input.targetPath} 的${input.position || "末尾"}追加以下内容：\n${input.content}\n只允许追加，不得改动已有内容或其他文件；完成后读取文件末尾验证。`,
    },
    create: {
        mode: "write",
        required: ["targetPath", "what"],
        create: input => `创建或覆写 ${input.targetPath}，内容要求：${input.what}\n只操作该文件；完成后读取文件验证。`,
    },
};

function applyPreset(input) {
    if (!input.preset) return {input};
    const name = String(input.preset).trim().toLowerCase();
    const preset = PRESETS[name];
    if (!preset) return {error: {code: "INVALID_PRESET", message: `未知 preset: ${name}`}};
    const missing = preset.required.filter(key => input[key] === undefined || input[key] === "");
    if (missing.length) {
        return {error: {code: "INVALID_ARGS", message: `preset ${name} 缺少参数: ${missing.join(", ")}`}};
    }
    let projectPath = input.projectPath;
    if (!projectPath) {
        const target = path.resolve(String(input.targetPath));
        try {
            projectPath = fs.statSync(target).isDirectory() ? target : path.dirname(target);
        } catch {
            projectPath = path.dirname(target);
        }
    }
    return {
        input: {
            ...input,
            projectPath,
            task: preset.create(input),
            mode: input.mode || preset.mode,
        },
    };
}

function wrapTask(task, mode) {
    const rules = {
        analyze: [
            "仅可读取和分析；禁止创建、修改、移动或删除文件。",
            "禁止安装依赖、停止服务或执行破坏性命令。",
        ],
        patch: [
            "仅可读取；禁止直接修改文件。",
            "修改建议必须以 unified diff 输出。",
        ],
        write: [
            "只修改任务明确要求或为实现目标直接必要的文件。",
            "除非任务明确要求，否则禁止删除文件、安装依赖或修改密钥配置。",
            "修改后执行最小必要验证。",
        ],
    };
    const selectedMode = Object.hasOwn(rules, mode) ? mode : "analyze";
    const context = CFG.projectContext ? `\n【项目背景】\n${CFG.projectContext}\n` : "";
    return `【AICodeWorker / Snow 主 Agent】\n模式：${selectedMode}\n安全约束：\n- ${rules[selectedMode].join("\n- ")}${context}\n【任务】\n${task}\n\n【最终回复格式】\n请在回复末尾严格输出：\n【读取文件清单】<路径列表；无则写无>\n【文件变更】修改:<列表> | 新增:<列表> | 删除:<列表>（无则写无）\n【执行结果摘要】<80字以内的一句话>`;
}

function extractLine(text, label) {
    const match = String(text || "").match(new RegExp(`${label}[^\\r\\n]*`));
    return match ? match[0].trim() : "";
}

function readTranscript(filePath, maxChars) {
    if (!fs.existsSync(filePath)) return "";
    const content = redact(fs.readFileSync(filePath, "utf8"));
    if (content.length <= maxChars) return content;
    return `[转录已截断，仅返回最后 ${maxChars} 字符]\n${content.slice(-maxChars)}`;
}

function buildResult(jobId, detail = "summary") {
    const paths = jobPaths(jobId);
    let meta = readMeta(jobId);
    if (!meta) return errorResult("NOT_FOUND", `Job ${jobId} 不存在。`);
    meta = markDeadRunner(meta);
    const finalResponse = redact(meta.finalResponse || "");
    const result = {
        jobId,
        state: meta.state,
        sessionId: meta.sessionId || null,
        mode: meta.mode,
        projectPath: meta.projectPath,
        startedAt: meta.startedAt,
        completedAt: meta.completedAt || null,
        summary: meta.summary || extractLine(finalResponse, "【执行结果摘要】") || finalResponse.slice(-500),
        fileChanges: meta.fileChanges || {modified: [], created: [], deleted: []},
        toolStats: meta.toolStats || {requested: 0, approved: 0, rejectedSensitive: 0, succeeded: 0, failed: 0, byName: {}},
        usage: meta.usage || null,
        warnings: meta.warnings || [],
        finalResponse,
        error: meta.error || null,
        outputFile: paths.output,
        transcriptFile: paths.events,
        logFile: paths.log,
    };
    if (meta.state === "waiting_for_answer" && meta.pendingQuestion) {
        result.pendingQuestion = {
            question: meta.pendingQuestion.question,
            options: meta.pendingQuestion.options || [],
            multiSelect: Boolean(meta.pendingQuestion.multiSelect),
            requestId: meta.pendingQuestion.requestId,
            resumeToken: meta.pendingQuestion.resumeToken,
        };
    }
    if (detail === "full") {
        result.transcript = readTranscript(paths.events, CFG.fullTranscriptMaxChars);
        result.log = readTranscript(paths.log, Math.min(CFG.fullTranscriptMaxChars, 50000));
    }
    return {status: "success", result};
}

function errorResult(code, message, extra = {}) {
    return {status: "error", code, error: message, ...extra};
}

async function checkSnowVersion() {
    return new Promise(resolve => {
        const child = spawn(SNOW_LAUNCH.bin, [...SNOW_LAUNCH.args, "--version"], {stdio: ["ignore", "pipe", "ignore"], shell: false});
        let output = "";
        const timer = setTimeout(() => {
            try { child.kill(); } catch {}
            resolve({available: false, version: ""});
        }, 5000);
        child.stdout.on("data", chunk => { output += chunk.toString(); });
        child.on("error", () => {
            clearTimeout(timer);
            resolve({available: false, version: ""});
        });
        child.on("close", code => {
            clearTimeout(timer);
            resolve({available: code === 0, version: output.trim()});
        });
    });
}

async function cmdCapabilities() {
    const snow = await checkSnowVersion();
    return {
        status: "success",
        result: {
            worker: "snow",
            available: snow.available,
            version: snow.version || "unknown",
            transport: "per-job-sse",
            commands: ["capabilities", "run", "run_and_wait", "query", "listJobs", "cancel", "answer"],
            states: [...TERMINAL_STATES, "running"],
            interactionPolicy: {
                nonSensitiveTools: "approve_once",
                sensitiveTools: "reject_with_reply",
                userQuestions: "return_to_vcp_agent",
            },
            supportsSessions: true,
            supportsFullTranscript: true,
        },
    };
}

async function cmdRun(originalInput) {
    const presetResult = applyPreset(originalInput);
    if (presetResult.error) return {status: "error", ...presetResult.error, error: presetResult.error.message};
    const input = presetResult.input;
    const task = typeof input.task === "string" ? input.task.trim() : "";
    if (!task) return errorResult("INVALID_ARGS", "task 是必填参数。可改用 preset + targetPath。 ");
    if (task.length > CFG.maxTaskChars) return errorResult("TASK_TOO_LARGE", `task 超过 ${CFG.maxTaskChars} 字符。`);
    const pathError = validateProjectPath(input.projectPath);
    if (pathError) return errorResult(pathError.code, pathError.message);
    const mode = ["analyze", "patch", "write"].includes(input.mode) ? input.mode : "analyze";
    const timeoutSec = Math.max(10, Number(input.timeoutSec) || CFG.defaultTimeoutSec);

    cleanupOldJobs();
    if (!acquireLock()) return errorResult("BUSY", "另一任务正在启动，请稍后重试。 ");
    try {
        const active = countActiveJobs();
        if (active >= CFG.maxConcurrentJobs) {
            return errorResult("CONCURRENCY_LIMIT", `已有 ${active} 个任务运行，达到上限 ${CFG.maxConcurrentJobs}。`);
        }
        const snow = await checkSnowVersion();
        if (!snow.available) return errorResult("SNOW_NOT_AVAILABLE", `无法执行 ${CFG.snowBin} --version，请安装或配置 Snow CLI。`);

        ensureJobDirs();
        const jobId = generateJobId();
        const paths = jobPaths(jobId);
        const meta = {
            jobId,
            state: "running",
            mode,
            projectPath: path.resolve(input.projectPath),
            sessionId: input.sessionId ? String(input.sessionId) : null,
            startedAt: new Date().toISOString(),
            completedAt: null,
            runnerPid: null,
            snowPid: null,
            ssePort: null,
            summary: "",
            finalResponse: "",
            fileChanges: {modified: [], created: [], deleted: []},
            toolStats: {requested: 0, approved: 0, rejectedSensitive: 0, succeeded: 0, failed: 0, byName: {}},
            usage: null,
            warnings: [],
            pendingQuestion: null,
            error: null,
        };
        const runnerArguments = {
            jobId,
            jobRoot: CFG.jobRoot,
            snowBin: SNOW_LAUNCH.bin,
            snowBinArgs: SNOW_LAUNCH.args,
            projectPath: meta.projectPath,
            task: wrapTask(task, mode),
            sessionId: meta.sessionId,
            timeoutSec,
            startupTimeoutSec: CFG.startupTimeoutSec,
            interactionTimeoutMs: CFG.interactionTimeoutMs,
            portMin: CFG.portMin,
            portMax: CFG.portMax,
            redactSecrets: CFG.redactSecrets,
        };
        saveMeta(jobId, meta);
        fs.writeFileSync(paths.args, JSON.stringify(runnerArguments), "utf8");
        fs.writeFileSync(paths.output, `=== Snow AICodeWorker Job ===\nJob: ${jobId}\nMode: ${mode}\nProject: ${meta.projectPath}\n\n`, "utf8");
        fs.writeFileSync(paths.log, "", "utf8");
        fs.writeFileSync(paths.events, "", "utf8");

        const runner = spawn(process.execPath, [path.join(__dirname, "runner.js"), paths.args], {
            detached: true,
            stdio: "ignore",
            windowsHide: true,
        });
        meta.runnerPid = runner.pid;
        saveMeta(jobId, meta);
        runner.unref();
        return {
            status: "success",
            result: {
                jobId,
                state: "running",
                sessionId: meta.sessionId,
                message: `Snow 任务已提交。使用 query(jobId=${jobId}) 查询。`,
            },
        };
    } finally {
        releaseLock();
    }
}

async function waitForJob(jobId, timeoutSec, detail) {
    const deadline = Date.now() + timeoutSec * 1000;
    let delay = 500;
    while (Date.now() < deadline) {
        const meta = readMeta(jobId);
        if (!meta) return errorResult("NOT_FOUND", `Job ${jobId} 元数据丢失。`);
        if (TERMINAL_STATES.has(meta.state)) return buildResult(jobId, detail);
        await sleep(delay);
        delay = Math.min(3000, Math.round(delay * 1.4));
    }
    await cmdCancel({jobId, reason: "run_and_wait timeout", markState: "timeout"});
    return buildResult(jobId, detail);
}

async function cmdRunAndWait(input) {
    const run = await cmdRun(input);
    if (run.status === "error") return run;
    const timeoutSec = Math.max(10, Number(input.timeoutSec) || CFG.defaultTimeoutSec) + CFG.startupTimeoutSec + 10;
    return waitForJob(run.result.jobId, timeoutSec, input.detail === "full" ? "full" : "summary");
}

async function cmdQuery(input) {
    if (!input.jobId) return errorResult("INVALID_ARGS", "jobId 是必填参数。 ");
    return buildResult(String(input.jobId), input.detail === "full" ? "full" : "summary");
}

async function cmdListJobs(input) {
    cleanupOldJobs();
    const limit = Math.min(50, Math.max(1, Number.parseInt(input.limit || "10", 10)));
    const jobs = [];
    for (const file of listMetaFiles(limit)) {
        let meta = readJson(path.join(CFG.jobRoot, "meta", file));
        meta = markDeadRunner(meta);
        if (!meta) continue;
        jobs.push({
            jobId: meta.jobId,
            state: meta.state,
            mode: meta.mode,
            projectPath: meta.projectPath,
            sessionId: meta.sessionId || null,
            startedAt: meta.startedAt,
            completedAt: meta.completedAt || null,
            summary: meta.summary || "",
        });
    }
    return {status: "success", result: {total: jobs.length, jobs}};
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

async function cmdCancel(input) {
    if (!input.jobId) return errorResult("INVALID_ARGS", "jobId 是必填参数。 ");
    const jobId = String(input.jobId);
    const meta = readMeta(jobId);
    if (!meta) return errorResult("NOT_FOUND", `Job ${jobId} 不存在。`);
    if (meta.state !== "running") return errorResult("INVALID_STATE", `Job ${jobId} 当前状态为 ${meta.state}，不能取消。`);
    killTree(meta.snowPid);
    killTree(meta.runnerPid);
    meta.state = input.markState === "timeout" ? "timeout" : "cancelled";
    meta.completedAt = new Date().toISOString();
    meta.error = input.markState === "timeout"
        ? {code: "TIMEOUT", message: "任务超过等待时限，Snow 进程已终止。"}
        : null;
    saveMeta(jobId, meta);
    return {status: "success", result: {jobId, state: meta.state, message: "Snow runner 与子进程已终止。"}};
}

function findPendingToken(resumeToken) {
    for (const file of listMetaFiles(500)) {
        const meta = readJson(path.join(CFG.jobRoot, "meta", file));
        const question = meta?.pendingQuestion;
        if (meta?.state === "waiting_for_answer" && question?.resumeToken === resumeToken) return meta;
    }
    return null;
}

async function cmdAnswer(input, wait) {
    const token = typeof input.resumeToken === "string" ? input.resumeToken.trim() : "";
    const answer = typeof input.answer === "string" ? input.answer.trim() : "";
    if (!token || !answer) return errorResult("INVALID_ARGS", "resumeToken 和 answer 均为必填参数。 ");
    if (!acquireLock()) return errorResult("BUSY", "恢复令牌正在被处理，请稍后重试。 ");
    let source;
    try {
        source = findPendingToken(token);
        if (!source) return errorResult("INVALID_RESUME_TOKEN", "resumeToken 无效、已消费或已过期。 ");
        source.pendingQuestion.consumedAt = new Date().toISOString();
        source.pendingQuestion.resumeToken = null;
        saveMeta(source.jobId, source);
    } finally {
        releaseLock();
    }
    const options = Array.isArray(input.selectedOptions) && input.selectedOptions.length
        ? `\n选择项：${input.selectedOptions.join(", ")}`
        : "";
    const custom = input.customInput ? `\n补充输入：${input.customInput}` : "";
    const followUp = `针对你上一轮提出的问题“${source.pendingQuestion.question}”，用户回答如下：\n${answer}${options}${custom}\n请基于原会话继续完成任务。`;
    const nextInput = {
        projectPath: source.projectPath,
        task: followUp,
        mode: source.mode,
        sessionId: source.sessionId,
        timeoutSec: input.timeoutSec,
        detail: input.detail,
    };
    return wait ? cmdRunAndWait(nextInput) : cmdRun(nextInput);
}

async function dispatch(input) {
    const command = String(input.command || "").trim().toLowerCase();
    switch (command) {
        case "capabilities": return cmdCapabilities();
        case "run": return cmdRun(input);
        case "run_and_wait": return cmdRunAndWait(input);
        case "query": return cmdQuery(input);
        case "listjobs": return cmdListJobs(input);
        case "cancel": return cmdCancel(input);
        case "answer": return cmdAnswer(input, input.wait !== false);
        default: return errorResult("UNKNOWN_COMMAND", `未知命令 ${command}。支持 capabilities, run, run_and_wait, query, listJobs, cancel, answer。`);
    }
}

async function main() {
    let raw = "";
    process.stdin.setEncoding("utf8");
    for await (const chunk of process.stdin) raw += chunk;
    let input;
    try {
        input = JSON.parse(raw.replace(/^\uFEFF/, ""));
    } catch {
        process.stdout.write(JSON.stringify(errorResult("INVALID_JSON", "stdin 不是合法 JSON。")));
        return;
    }
    let response;
    try {
        response = await dispatch(input);
    } catch (error) {
        response = errorResult("INTERNAL_ERROR", redact(error instanceof Error ? error.message : String(error)));
    }
    process.stdout.write(JSON.stringify(response));
}

if (require.main === module) {
    main().catch(error => {
        process.stdout.write(JSON.stringify(errorResult("PLUGIN_CRASH", redact(error instanceof Error ? error.message : String(error)))));
    });
}

module.exports = {
    applyPreset,
    buildResult,
    isPathInside,
    loadConfig,
    redact,
    wrapTask,
};
