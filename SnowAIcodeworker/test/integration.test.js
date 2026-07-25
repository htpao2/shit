"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {spawnSync} = require("child_process");

const pluginDir = path.resolve(__dirname, "..");
const entry = path.join(pluginDir, "AICodeWorker.js");
const mockSnow = path.join(__dirname, "mock-snow.js");
const configPath = path.join(pluginDir, "config.env");
const backup = fs.existsSync(configPath) ? fs.readFileSync(configPath) : null;
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aicodeworker-snow-test-"));
const projectRoot = path.join(tempRoot, "project");
const jobRoot = path.join(tempRoot, "jobs");
fs.mkdirSync(projectRoot, {recursive: true});
fs.writeFileSync(path.join(projectRoot, "README.md"), "mock project\n");

const portable = value => value.replace(/\\/g, "/");

function invoke(payload, timeout = 30000) {
    const result = spawnSync(process.execPath, [entry], {
        cwd: pluginDir,
        input: JSON.stringify(payload),
        encoding: "utf8",
        timeout,
        windowsHide: true,
    });
    if (result.error) throw result.error;
    assert.strictEqual(result.status, 0, result.stderr || result.stdout);
    let parsed;
    try {
        parsed = JSON.parse(result.stdout);
    } catch {
        throw new Error(`插件未返回 JSON：${result.stdout}\n${result.stderr}`);
    }
    return parsed;
}

function assertSuccess(response) {
    assert.strictEqual(response.status, "success", JSON.stringify(response));
    assert(response.result, "缺少 result");
    return response.result;
}

async function main() {
    fs.writeFileSync(configPath, [
        `SNOW_BIN=${portable(process.execPath)}`,
        `SNOW_BIN_ARGS=${JSON.stringify([portable(mockSnow)])}`,
        `ALLOWED_PROJECT_ROOTS=${portable(projectRoot)}`,
        `JOB_ROOT=${portable(jobRoot)}`,
        "DEFAULT_TIMEOUT_SEC=15",
        "SNOW_STARTUP_TIMEOUT_SEC=5",
        "SNOW_INTERACTION_TIMEOUT_MS=5000",
        "SNOW_SSE_PORT_MIN=33100",
        "SNOW_SSE_PORT_MAX=33200",
        "MAX_CONCURRENT_JOBS=1",
        "FULL_TRANSCRIPT_MAX_CHARS=100000",
        "REDACT_SECRETS=true",
    ].join("\n"));

    const capabilities = assertSuccess(invoke({command: "capabilities"}));
    assert.strictEqual(capabilities.available, true);
    assert(capabilities.commands.includes("answer"));

    const normal = assertSuccess(invoke({
        command: "run_and_wait",
        projectPath: projectRoot,
        task: "SCENARIO_NORMAL",
        mode: "analyze",
        detail: "full",
    }));
    assert.strictEqual(normal.state, "completed");
    assert(normal.sessionId.startsWith("mock-session-"));
    assert(normal.summary.includes("模拟普通任务完成"));
    assert.strictEqual(normal.toolStats.approved, 1);
    assert.strictEqual(normal.toolStats.succeeded, 1);
    assert(normal.transcript.includes("tool_confirmation_request"));

    const followUp = assertSuccess(invoke({
        command: "run_and_wait",
        projectPath: projectRoot,
        sessionId: normal.sessionId,
        task: "SCENARIO_NORMAL follow up",
        mode: "analyze",
    }));
    assert.strictEqual(followUp.sessionId, normal.sessionId);

    const sensitive = assertSuccess(invoke({
        command: "run_and_wait",
        projectPath: projectRoot,
        task: "SCENARIO_SENSITIVE",
        mode: "write",
    }));
    assert.strictEqual(sensitive.state, "completed");
    assert.strictEqual(sensitive.toolStats.rejectedSensitive, 1);
    assert(sensitive.warnings.some(item => item.code === "SENSITIVE_TOOL_REJECTED"));

    const question = assertSuccess(invoke({
        command: "run_and_wait",
        projectPath: projectRoot,
        task: "SCENARIO_QUESTION",
        mode: "write",
    }));
    assert.strictEqual(question.state, "waiting_for_answer");
    assert.strictEqual(question.pendingQuestion.question, "选择数据库");
    assert(question.pendingQuestion.resumeToken.startsWith("resume_"));

    const answered = assertSuccess(invoke({
        command: "answer",
        resumeToken: question.pendingQuestion.resumeToken,
        answer: "SQLite",
        selectedOptions: ["SQLite"],
    }));
    assert.strictEqual(answered.state, "completed");
    assert.strictEqual(answered.sessionId, question.sessionId);

    const reused = invoke({
        command: "answer",
        resumeToken: question.pendingQuestion.resumeToken,
        answer: "PostgreSQL",
    });
    assert.strictEqual(reused.status, "error");
    assert.strictEqual(reused.code, "INVALID_RESUME_TOKEN");

    const hanging = assertSuccess(invoke({
        command: "run",
        projectPath: projectRoot,
        task: "SCENARIO_HANG",
        mode: "analyze",
        timeoutSec: 30,
    }));
    assert.strictEqual(hanging.state, "running");
    await new Promise(resolve => setTimeout(resolve, 1200));
    const cancelled = assertSuccess(invoke({command: "cancel", jobId: hanging.jobId}));
    assert.strictEqual(cancelled.state, "cancelled");
    const cancelledQuery = assertSuccess(invoke({command: "query", jobId: hanging.jobId}));
    assert.strictEqual(cancelledQuery.state, "cancelled");

    const listed = assertSuccess(invoke({command: "listJobs", limit: 10}));
    assert(listed.total >= 6);

    const invalidPath = invoke({
        command: "run",
        projectPath: path.dirname(projectRoot),
        task: "should reject",
    });
    assert.strictEqual(invalidPath.status, "error");
    assert.strictEqual(invalidPath.code, "PATH_NOT_ALLOWED");

    process.stdout.write("integration-ok\n");
}

let succeeded = false;
main().then(() => {
    succeeded = true;
}).catch(error => {
    process.stderr.write(`\nTEST_TEMP_ROOT=${tempRoot}\n`);
    try {
        const metaDir = path.join(jobRoot, "meta");
        for (const file of fs.readdirSync(metaDir)) {
            if (file.endsWith(".json") && !file.endsWith(".args.json")) {
                process.stderr.write(`META ${file}:\n${fs.readFileSync(path.join(metaDir, file), "utf8")}\n`);
            }
        }
        const logDir = path.join(jobRoot, "logs");
        for (const file of fs.readdirSync(logDir)) {
            process.stderr.write(`LOG ${file}:\n${fs.readFileSync(path.join(logDir, file), "utf8")}\n`);
        }
    } catch {}
    throw error;
}).finally(() => {
    try {
        if (backup === null) fs.unlinkSync(configPath);
        else fs.writeFileSync(configPath, backup);
    } catch {}
    if (succeeded) fs.rmSync(tempRoot, {recursive: true, force: true});
});
