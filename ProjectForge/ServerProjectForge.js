'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const core = require('./ProjectForgeService');
const A = require('./args');
const { textResult } = require('./fileKit/output');
const { BackendWorkspaceService, parseRoots } = require('./backendWorkspace');

let state = null;
let queue = Promise.resolve();
let closing = false;
let heartbeat = null;

function enabled(value) { return value === true || String(value).toLowerCase() === 'true'; }
let serviceAbort = new AbortController();
function atomicJson(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temp = `${file}.${crypto.randomUUID()}.tmp`;
    try {
        fs.writeFileSync(temp, JSON.stringify(value), { flag: 'wx' });
        fs.renameSync(temp, file);
    } finally { fs.rmSync(temp, { force: true }); }
}
function clean(value, max = 160) {
    return String(value || '').replace(/[\r\n\x00-\x1f]/g, ' ').slice(0, max);
}
function publish(online = true) {
    if (!state) return;
    const runtime = core._test.getRuntime();
    const rows = runtime.store?.listProjects({ limit: 20 }) || [];
    const projects = rows.filter(p => runtime.resolver.projectRoot(p).writable).map(p => {
        const todos = runtime.store.listTodos(p.id);
        return {
            id: p.id, name: clean(p.name), status: p.status,
            done: todos.filter(t => t.status === 'done').length, total: todos.length,
            updatedAt: p.updated_at,
            pending: todos.filter(t => t.status !== 'done').slice(0, 5).map(t => ({ seq: t.seq, status: t.status, title: clean(t.title) })),
        };
    });
    atomicJson(state.statusFile, { version: 1, online, updatedAt: new Date().toISOString(), projects });
}

async function initialize(config = {}, dependencies = {}) {
    await shutdown();
    closing = false;
    serviceAbort = new AbortController();
    const base = path.resolve(config.PROJECT_BASE_PATH || path.join(__dirname, '../..'));
    const dataDir = path.resolve(base, config.PROJECTFORGE_DATA_DIR || 'AppData/ServerProjectForge');
    const roots = parseRoots(config.ALLOWED_DIRECTORIES);
    const dbPath = path.resolve(base, config.PROJECTFORGE_DB_PATH || path.join(dataDir, 'projectforge.db'));
    const statusFile = path.resolve(base, config.PROJECTFORGE_STATUS_PATH || path.join(dataDir, 'status.json'));
    const protectedPaths = [__dirname, path.join(__dirname, '../ProjectForgeStatus'), dataDir, dbPath, `${dbPath}-wal`, `${dbPath}-shm`, statusFile, path.join(path.dirname(dbPath), 'recovery')];
    // Prevent a second server instance from sharing an in-memory lock / ticket domain.
    fs.mkdirSync(dataDir, { recursive: true });
    const lock = await require('proper-lockfile').lock(dataDir, { realpath: true, stale: 30000, update: 10000, retries: 0 });
    let dbLock;
    try {
        fs.mkdirSync(path.dirname(dbPath), { recursive: true });
        dbLock = await require('proper-lockfile').lock(dbPath, { realpath: false, stale: 30000, update: 10000, retries: 0 });
        const workspaces = new BackendWorkspaceService({
            file: path.join(dataDir, 'workspaces.json'), allowedRoots: roots, protectedPaths,
            defaultRoot: config.DEFAULT_WORKSPACE_PATH || '', defaultAlias: config.DEFAULT_WORKSPACE_ALIAS || 'default',
        });
        core.initialize({
            config: { ...config, ALLOWED_DIRECTORIES: '', PROJECTFORGE_DB_PATH: dbPath },
            workspaceService: workspaces,
            executePreloadDeclarations: enabled(config.EVAL_ENABLED),
            protectedPaths,
            indexerBinaryPath: config.INDEXER_BINARY_PATH ? path.resolve(base, config.INDEXER_BINARY_PATH) : undefined,
            logger: dependencies.logger || console,
        });
        state = {
            workspaces, lock: async () => { await dbLock(); await lock(); }, dataDir, dbPath,
            statusFile,
            evalEnabled: enabled(config.EVAL_ENABLED),
        };
        // Open/migrate now: initialization errors must not become a silently usable service.
        core.gui.listProjects();
        await core.recoverPendingMutations();
        publish();
        heartbeat = setInterval(() => {
            try { publish(); } catch (error) { console.warn('[ServerProjectForge] status publish failed:', error.message); }
        }, 30000);
        heartbeat.unref();
    } catch (error) {
        state = null;
        await core.cleanup();
        if (dbLock) await dbLock();
        await lock();
        throw error;
    }
}

async function shutdown() {
    closing = true;
    serviceAbort.abort(new Error('ServerProjectForge shutting down'));
    clearInterval(heartbeat);
    heartbeat = null;
    await core.cancelExecutions();
    await queue.catch(() => {});
    if (!state) return;
    const previous = state;
    try { publish(false); } catch (error) { console.warn('[ServerProjectForge] offline status failed:', error.message); }
    try { await core.cleanup(); }
    finally {
        state = null;
        await previous.lock();
    }
}

function signature(args) {
    let raw = args.maid;
    if (typeof raw === 'string' && raw.startsWith('{')) {
        try { raw = JSON.parse(raw); } catch {}
    }
    return clean(typeof raw === 'object' && raw ? raw.name || raw.id : raw, 100);
}

async function dispatch(args, context) {
    const cmd = A.str(args, 'command', 'action').toLowerCase();
    const ws = state.workspaces;
    switch (cmd) {
        case 'registerworkspace':
            {
                const workspace = ws.register(A.str(args, 'alias'), A.str(args, 'path'));
                return textResult(`工作区已登记：${workspace.alias}（${workspace.id}）`, { command: 'RegisterWorkspace', workspace });
            }
        case 'setworkspaceenabled':
            if (args.enabled === undefined) throw new Error('SetWorkspaceEnabled requires enabled=true/false');
            return textResult('工作区状态已更新', { command: 'SetWorkspaceEnabled', workspace: ws.update(A.str(args, 'workspace'), A.bool(args.enabled, false)) });
        case 'setactiveworkspace':
            return textResult('当前工作区已切换', { command: 'SetActiveWorkspace', workspace: ws.activate(A.str(args, 'workspace')) });
        case 'getbatch':
            return textResult(JSON.stringify(core.gui.getBatchNodes(A.str(args, 'projectId'), Number(A.str(args, 'batch').replace(/^b/i, ''))), null, 2), { command: 'GetBatch' });
        case 'getnode': {
            const data = core.gui.getNodeDetail(A.str(args, 'projectId'), Number(A.str(args, 'node').replace(/^n/i, '')));
            for (const image of [data.before, data.after]) {
                if (image.text.length > 32000) { image.text = image.text.slice(0, 32000); image.truncated = true; }
            }
            return textResult(JSON.stringify(data, null, 2), { command: 'GetNode' });
        }
        case 'revertfilechange': {
            if (args.mode !== undefined && !['before', 'after'].includes(A.str(args, 'mode'))) throw new Error('mode must be before or after');
            const result = await core.gui.revertFileChange({
                projectId: A.str(args, 'projectId'), nodeId: Number(A.str(args, 'node').replace(/^n/i, '')),
                mode: A.str(args, 'mode') || 'before', signature: signature(args),
                reason: A.str(args, 'reason'), dryRun: A.bool(args.dryrun, false),
                force: A.bool(args.force, false), expectedHash: args.expectedhash === 'missing' ? null : args.expectedhash,
            });
            return textResult(JSON.stringify(result, null, 2), { command: 'RevertFileChange', ...result });
        }
        case 'acceptproject': {
            const who = signature(args);
            if (!who) throw new Error('AcceptProject requires maid signature');
            const result = core.gui.acceptProject(A.str(args, 'projectId'), who);
            return textResult('工程已验收，原报告及署名已保留', { command: 'AcceptProject', ...result });
        }
        case 'evalsymbol':
            if (!state.evalEnabled) throw new Error('函数试跑默认关闭；管理员需在 config.env 显式设置 EVAL_ENABLED=true。它执行可信工程代码，不是安全沙箱。');
            break;
    }
    return core.processToolCall(args, context);
}

async function processToolCall(rawArgs, context = {}) {
    if (!state || closing) throw new Error('ServerProjectForge is not initialized or is shutting down');
    if (!rawArgs || typeof rawArgs !== 'object' || Array.isArray(rawArgs)) throw new Error('Invalid tool arguments');
    const args = A.lowerKeys(rawArgs);
    // All calls share one queue: two project IDs may refer to the same physical file.
    const run = queue.then(async () => {
        if (!state || closing) throw new Error('ServerProjectForge is shutting down');
        const signal = context.signal
            ? AbortSignal.any([context.signal, serviceAbort.signal])
            : serviceAbort.signal;
        signal.throwIfAborted();
        const abort = () => { void core.cancelExecutions(); };
        signal.addEventListener('abort', abort, { once: true });
        try {
            await core.recoverPendingMutations();
            signal.throwIfAborted();
            const result = await core.withExecutionContext({ ...context, signal }, () => dispatch(args, { ...context, signal }));
            try { publish(); } catch (error) { console.warn('[ServerProjectForge] status publish failed:', error.message); }
            if (['error', 'rejected'].includes(result?.details?.status)
                || (result?.details?.command === 'RemoveFile' && result.details.removed === 0 && result.details.failed?.length)) {
                return { status: 'error', error: '工程操作未完成，请查看返回内容', result };
            }
            return result;
        } finally { signal.removeEventListener('abort', abort); }
    });
    queue = run.catch(() => {});
    return run;
}

module.exports = { initialize, processToolCall, shutdown };