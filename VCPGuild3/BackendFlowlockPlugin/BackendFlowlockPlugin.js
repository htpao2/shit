'use strict';

const fs = require('fs');
const path = require('path');
const { createHash, randomUUID } = require('crypto');

let pluginManagerRef = null;
let debugMode = false;
let enabled = true;
let defaultDelaySeconds = 30;
let minDelaySeconds = 1;
let maxDelaySeconds = 86400;
let maxRetries = 3;
let maxRounds = 100;
let maxConcurrentSessions = 20;
let maxSessionsPerAgent = 3;
let recoveryDelaySeconds = 5;
let stateFile = '';
let auditFile = '';
let shuttingDown = false;

const sessions = new Map();
const inFlightKeys = new Set();
const recentTerminalSessions = [];
const TERMINAL_HISTORY_LIMIT = 100;

function initialize(config) {
    debugMode = String(config.DebugMode || 'false').toLowerCase() === 'true';
    enabled = String(config.BACKEND_FLOWLOCK_ENABLED || 'true').toLowerCase() === 'true';
    defaultDelaySeconds = toBoundedInteger(config.BACKEND_FLOWLOCK_DEFAULT_DELAY_SECONDS, 30, 1, 86400);
    minDelaySeconds = toBoundedInteger(config.BACKEND_FLOWLOCK_MIN_DELAY_SECONDS, 1, 1, 86400);
    maxDelaySeconds = toBoundedInteger(config.BACKEND_FLOWLOCK_MAX_DELAY_SECONDS, 86400, minDelaySeconds, 86400);
    maxRetries = toBoundedInteger(config.BACKEND_FLOWLOCK_MAX_RETRIES, 3, 0, 100);
    maxRounds = toBoundedInteger(config.BACKEND_FLOWLOCK_MAX_ROUNDS, 100, 1, 10000);
    maxConcurrentSessions = toBoundedInteger(config.BACKEND_FLOWLOCK_MAX_CONCURRENT_SESSIONS, 20, 1, 1000);
    maxSessionsPerAgent = toBoundedInteger(config.BACKEND_FLOWLOCK_MAX_SESSIONS_PER_AGENT, 3, 1, 100);
    recoveryDelaySeconds = toBoundedInteger(config.BACKEND_FLOWLOCK_RECOVERY_DELAY_SECONDS, 5, 1, 3600);

    const dataDir = config.BACKEND_FLOWLOCK_DATA_DIR
        ? path.resolve(__dirname, config.BACKEND_FLOWLOCK_DATA_DIR)
        : path.join(__dirname, 'data');
    fs.mkdirSync(dataDir, { recursive: true });
    stateFile = path.join(dataDir, 'sessions.json');
    auditFile = path.join(dataDir, 'audit.jsonl');

    try {
        pluginManagerRef = require('../../Plugin.js');
    } catch (error) {
        console.error('[BackendFlowlockPlugin] PluginManager unavailable:', error.message);
    }

    shuttingDown = false;
    loadPersistedSessions();
    setTimeout(() => {
        if (!shuttingDown && enabled) {
            reconcileSessions({ recover: true }).catch(error => {
                console.error('[BackendFlowlockPlugin] Recovery failed:', error.message);
            });
        }
    }, recoveryDelaySeconds * 1000);

    console.log(`[BackendFlowlockPlugin] Initialized with ${sessions.size} persisted session(s).`);
}

function shutdown() {
    shuttingDown = true;
    for (const session of sessions.values()) {
        clearSessionTimer(session);
        if (session.status === 'running') session.status = 'waiting';
    }
    persistSessions();
    console.log('[BackendFlowlockPlugin] Shutdown complete.');
}

function toBoundedInteger(value, fallback, minimum, maximum) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(minimum, Math.min(maximum, parsed));
}

function normalizeDelay(value, fallback = defaultDelaySeconds) {
    return toBoundedInteger(value, fallback, minDelaySeconds, maxDelaySeconds);
}

function sessionKey(agentName, taskId) {
    return `${agentName}::${taskId}`;
}

function stableSessionId(agentName, taskId) {
    const digest = createHash('sha256').update(`${agentName}\0${taskId}`).digest('hex').slice(0, 24);
    return `backend-flowlock-${digest}`;
}

function publicSession(session) {
    return {
        id: session.id,
        taskId: session.taskId,
        agentName: session.agentName,
        assignmentId: session.assignmentId || null,
        agentSessionId: session.agentSessionId,
        status: session.status,
        generation: session.generation,
        round: session.round,
        retryCount: session.retryCount,
        maxRetries: session.maxRetries,
        maxRounds: session.maxRounds,
        defaultDelaySeconds: session.defaultDelaySeconds,
        nextDelaySeconds: session.nextDelaySeconds,
        nextHeartbeatAt: session.nextHeartbeatAt,
        startedAt: session.startedAt,
        updatedAt: session.updatedAt,
        lastTriggeredAt: session.lastTriggeredAt,
        lastCompletedAt: session.lastCompletedAt,
        lastError: session.lastError,
        completionReason: session.completionReason,
        lastResponsePreview: session.lastResponsePreview || '',
        hasNextPrompt: !!session.nextPrompt
    };
}

function serializeSession(session) {
    const copy = { ...session };
    delete copy.pendingTimer;
    return copy;
}

function persistSessions() {
    if (!stateFile) return;
    const payload = {
        version: 1,
        savedAt: new Date().toISOString(),
        sessions: Array.from(sessions.values()).map(serializeSession),
        recentTerminalSessions
    };
    const temporaryFile = `${stateFile}.${process.pid}.${randomUUID()}.tmp`;
    fs.writeFileSync(temporaryFile, JSON.stringify(payload, null, 2), 'utf-8');
    fs.renameSync(temporaryFile, stateFile);
}

function loadPersistedSessions() {
    sessions.clear();
    if (!stateFile || !fs.existsSync(stateFile)) return;
    try {
        const payload = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
        for (const raw of Array.isArray(payload.sessions) ? payload.sessions : []) {
            if (!raw.agentName || !raw.taskId) continue;
            const session = {
                ...raw,
                status: ['active', 'waiting', 'running'].includes(raw.status) ? 'waiting' : raw.status,
                generation: Number(raw.generation || 0) + 1,
                pendingTimer: null,
                nextHeartbeatAt: null
            };
            if (['waiting', 'active'].includes(session.status)) {
                sessions.set(sessionKey(session.agentName, session.taskId), session);
            }
        }
        if (Array.isArray(payload.recentTerminalSessions)) {
            recentTerminalSessions.push(...payload.recentTerminalSessions.slice(0, TERMINAL_HISTORY_LIMIT));
        }
    } catch (error) {
        const corruptPath = `${stateFile}.corrupt-${Date.now()}`;
        fs.renameSync(stateFile, corruptPath);
        console.error('[BackendFlowlockPlugin] Corrupt state moved to:', corruptPath);
    }
}

function appendAudit(event, session, extra = {}) {
    if (!auditFile) return;
    const record = {
        timestamp: new Date().toISOString(),
        event,
        sessionId: session?.id || null,
        taskId: session?.taskId || extra.taskId || null,
        agentName: session?.agentName || extra.agentName || null,
        round: session?.round ?? null,
        ...extra
    };
    fs.appendFileSync(auditFile, `${JSON.stringify(record)}\n`, 'utf-8');
}

function extractTextResult(result) {
    if (typeof result === 'string') return result;
    if (typeof result?.result === 'string') return result.result;
    if (typeof result?.message === 'string') return result.message;
    if (Array.isArray(result?.content)) {
        return result.content.filter(part => part?.type === 'text').map(part => part.text || '').join('\n');
    }
    return '';
}

function maskDelimited(text, chars, startToken, endToken) {
    let cursor = 0;
    while (cursor < text.length) {
        const start = text.indexOf(startToken, cursor);
        if (start < 0) break;
        const foundEnd = text.indexOf(endToken, start + startToken.length);
        const end = foundEnd < 0 ? text.length : foundEnd + endToken.length;
        for (let index = start; index < end; index++) {
            if (chars[index] !== '\n' && chars[index] !== '\r') chars[index] = ' ';
        }
        cursor = Math.max(end, start + startToken.length);
    }
}

function createSafeScanText(rawText) {
    const text = typeof rawText === 'string' ? rawText : '';
    const chars = text.split('');
    const blocks = [
        ['<<<[TOOL_REQUEST]>>>', '<<<[END_TOOL_REQUEST]>>>'],
        ['[[VCP调用结果信息汇总:', 'VCP调用结果结束]]'],
        ['[本轮工具调用摘要:]', '[本轮工具调用摘要结束]'],
        ['<<<[DESKTOP_PUSH]>>>', '<<<[DESKTOP_PUSH_END]>>>'],
        ['[--- VCP元思考链', '[--- 元思考链结束 ---]'],
        ['<think>', '</think>'],
        ['<thinking>', '</thinking>']
    ];
    for (const [start, end] of blocks) maskDelimited(text, chars, start, end);

    const maskRegex = regex => {
        let match;
        while ((match = regex.exec(text)) !== null) {
            for (let index = match.index; index < match.index + match[0].length; index++) {
                if (chars[index] !== '\n' && chars[index] !== '\r') chars[index] = ' ';
            }
        }
    };
    maskRegex(/```[\s\S]*?(?:```|$)/g);
    maskRegex(/~~~[\s\S]*?(?:~~~|$)/g);
    maskRegex(/`+[^`\r\n]*`+/g);
    return chars.join('');
}

function collectLastBlock(text, safeText, name) {
    const startToken = `[[Flowlock::${name}]]`;
    const endToken = `[[/Flowlock::${name}]]`;
    let cursor = 0;
    let value = null;
    while (cursor < safeText.length) {
        const start = safeText.indexOf(startToken, cursor);
        if (start < 0) break;
        const contentStart = start + startToken.length;
        const end = safeText.indexOf(endToken, contentStart);
        value = text.slice(contentStart, end < 0 ? text.length : end).trim();
        cursor = end < 0 ? safeText.length : end + endToken.length;
    }
    return value;
}

function parseFlowlockProtocol(rawText) {
    const text = typeof rawText === 'string' ? rawText : '';
    const safeText = createSafeScanText(text);
    const commandRegex = /^[ \t]*\[\[Flowlock::(Start|Stop|Complete|Fail|NextHeartbeat)(?:::(\d+))?\]\][ \t]*$/gim;
    const commands = [];
    let match;
    while ((match = commandRegex.exec(safeText)) !== null) {
        commands.push({ type: match[1].toLowerCase(), value: match[2], index: match.index });
    }
    const types = new Set(commands.map(command => command.type));
    const terminalType = types.has('fail') ? 'fail' : types.has('complete') ? 'complete' : types.has('stop') ? 'stop' : null;
    const heartbeat = commands.filter(command => command.type === 'nextheartbeat').at(-1);
    return {
        hasCommands: commands.length > 0 || safeText.includes('[[Flowlock::NextPrompt]]'),
        shouldStart: !terminalType && types.has('start'),
        terminalType,
        failReason: collectLastBlock(text, safeText, 'Fail'),
        nextPrompt: collectLastBlock(text, safeText, 'NextPrompt'),
        nextHeartbeatSeconds: heartbeat ? normalizeDelay(heartbeat.value) : null
    };
}

async function callPlugin(name, args) {
    if (!pluginManagerRef?.processToolCall) throw new Error('PluginManager unavailable');
    return pluginManagerRef.processToolCall(name, args);
}

async function getTask(taskId) {
    const result = await callPlugin('TaskBoard', { command: 'GetTask', task_id: taskId });
    if (result?.status !== 'success' || !result.task) return null;
    return result.task;
}

async function readTaskDiary(taskId) {
    const result = await callPlugin('TaskBoard', { command: 'ReadTaskLog', task_id: taskId, lines: 120 });
    return result?.status === 'success' ? extractTextResult(result) : '(任务日记暂不可用)';
}

function validateTaskOwnership(session, task) {
    if (!task) return { valid: false, reason: 'task_not_found' };
    if (task.status !== 'in_progress') return { valid: false, reason: `task_status_${task.status}` };
    if (task.assignee !== session.agentName) return { valid: false, reason: 'assignee_changed' };
    if (session.assignmentId && task.assignment_id && task.assignment_id !== session.assignmentId) {
        return { valid: false, reason: 'assignment_changed' };
    }
    return { valid: true };
}

function buildRoundPrompt(session, task, diary, customPrompt) {
    const continuation = customPrompt || session.defaultPrompt || '继续推进任务，完成本轮可实际执行的工作。';
    return `[系统提示: Backend Flowlock 任务心跳]\n\n` +
        `你正在独立会话中持续处理任务。\n` +
        `任务ID: ${task.id}\n标题: ${task.title}\n描述: ${task.description || '无'}\n` +
        `当前进度: ${task.progress || 0}%\n优先级: ${task.priority || 'medium'}\n` +
        `本轮目标: ${continuation}\n\n` +
        `【最近任务日记】\n${diary || '(暂无日记)'}\n\n` +
        `请执行实际工作，并在本轮结束前调用 TaskBoard 的 AppendTaskLog 记录结果。` +
        `任务完成时调用 SubmitTask，并输出 [[Flowlock::Complete]]；完全无法继续时调用 FailTask 或 AbandonTask，并输出 [[Flowlock::Fail]]。` +
        `需要继续时可输出 [[Flowlock::NextHeartbeat::秒数]]，也可用 NextPrompt 块设置下一轮目标。`;
}

function clearSessionTimer(session) {
    if (session.pendingTimer) clearTimeout(session.pendingTimer);
    session.pendingTimer = null;
    session.nextHeartbeatAt = null;
}

function scheduleSession(session, delaySeconds) {
    if (shuttingDown || !enabled || !['active', 'waiting'].includes(session.status)) return;
    clearSessionTimer(session);
    const delay = normalizeDelay(delaySeconds, session.defaultDelaySeconds);
    const generation = session.generation;
    session.status = 'waiting';
    session.nextHeartbeatAt = Date.now() + delay * 1000;
    session.updatedAt = Date.now();
    persistSessions();
    session.pendingTimer = setTimeout(() => {
        if (session.generation !== generation || shuttingDown || !enabled) return;
        triggerSession(sessionKey(session.agentName, session.taskId)).catch(error => {
            console.error(`[BackendFlowlockPlugin] Trigger failed for ${session.taskId}:`, error.message);
        });
    }, delay * 1000);
}

async function stopSession(session, reason, error = null) {
    clearSessionTimer(session);
    session.generation++;
    session.status = reason === 'complete' ? 'completed' : reason === 'fail' ? 'failed' : 'stopped';
    session.completionReason = reason;
    session.lastError = error || session.lastError || null;
    session.updatedAt = Date.now();
    sessions.delete(sessionKey(session.agentName, session.taskId));
    recentTerminalSessions.unshift(publicSession(session));
    recentTerminalSessions.length = Math.min(recentTerminalSessions.length, TERMINAL_HISTORY_LIMIT);
    appendAudit('session_stopped', session, { reason, error: error || null });
    persistSessions();
}

async function triggerSession(key) {
    const session = sessions.get(key);
    if (!session || !['active', 'waiting'].includes(session.status) || inFlightKeys.has(key)) return;
    if (session.round >= session.maxRounds) {
        await stopSession(session, 'max_rounds', `Reached ${session.maxRounds} rounds`);
        return;
    }

    clearSessionTimer(session);
    inFlightKeys.add(key);
    session.status = 'running';
    session.round++;
    session.lastTriggeredAt = Date.now();
    session.updatedAt = Date.now();
    persistSessions();

    try {
        const task = await getTask(session.taskId);
        const ownership = validateTaskOwnership(session, task);
        if (!ownership.valid) {
            await stopSession(session, task?.status === 'submitted' || task?.status === 'completed' ? 'complete' : 'task_invalid', ownership.reason);
            return;
        }

        const diary = await readTaskDiary(session.taskId);
        const prompt = buildRoundPrompt(session, task, diary, session.nextPrompt);
        session.nextPrompt = null;
        session.nextDelaySeconds = null;

        const result = await callPlugin('AgentAssistant', {
            agent_name: session.agentName,
            prompt,
            maid: 'BackendFlowlockPlugin',
            session_id: session.agentSessionId,
            inject_tools: session.injectTools || 'TaskBoard'
        });
        const response = extractTextResult(result);
        if (!response) throw new Error('AgentAssistant returned empty response');

        session.lastResponsePreview = response.replace(/\s+/g, ' ').slice(0, 800);
        session.lastCompletedAt = Date.now();
        session.retryCount = 0;
        session.lastError = null;

        const latestTask = await getTask(session.taskId);
        if (!latestTask || ['submitted', 'completed'].includes(latestTask.status)) {
            await stopSession(session, 'complete');
            return;
        }
        if (latestTask.status !== 'in_progress' || latestTask.assignee !== session.agentName) {
            await stopSession(session, 'task_invalid', `task_status_${latestTask.status}`);
            return;
        }

        const protocol = parseFlowlockProtocol(response);
        if (protocol.terminalType === 'fail') {
            const failReason = protocol.failReason || 'Agent reported failure';
            const failResult = await callPlugin('TaskBoard', {
                command: 'FailTask',
                task_id: session.taskId,
                reason: failReason,
                maid: session.agentName
            });
            if (failResult?.status !== 'success') {
                throw new Error(`Agent reported failure but TaskBoard rejected FailTask: ${failResult?.error || 'unknown error'}`);
            }
            await stopSession(session, 'fail', failReason);
            return;
        }
        if (protocol.terminalType === 'complete') {
            // TaskBoard 是完成状态真源。模型只输出 Complete 但未提交任务时不得静默停锁。
            session.nextPrompt = '你声明任务已完成，但任务板仍为 in_progress。请先调用 SubmitTask 写入交付物和总结；提交成功后再输出 Flowlock Complete。';
            appendAudit('premature_complete_ignored', session);
        }
        if (protocol.terminalType === 'stop') {
            await stopSession(session, 'agent_stop');
            return;
        }

        if (protocol.nextPrompt !== null && protocol.terminalType !== 'complete') session.nextPrompt = protocol.nextPrompt;
        if (protocol.nextHeartbeatSeconds !== null) session.nextDelaySeconds = protocol.nextHeartbeatSeconds;
        session.status = 'active';
        appendAudit('round_completed', session);
        scheduleSession(session, session.nextDelaySeconds ?? session.defaultDelaySeconds);
    } catch (error) {
        session.retryCount++;
        session.lastError = error.message;
        session.updatedAt = Date.now();
        appendAudit('round_failed', session, { error: error.message, retryCount: session.retryCount });
        if (session.retryCount > session.maxRetries) {
            await stopSession(session, 'max_retries', error.message);
        } else {
            session.status = 'active';
            scheduleSession(session, session.defaultDelaySeconds);
        }
    } finally {
        inFlightKeys.delete(key);
    }
}

async function startTaskFlowlock(args) {
    if (!enabled) return { status: 'error', code: 'DISABLED', error: 'Backend Flowlock is disabled' };
    const taskId = String(args.task_id || '').trim();
    const agentName = String(args.agent_name || '').trim();
    if (!taskId || !agentName) return { status: 'error', code: 'INVALID_ARGUMENT', error: '缺少 task_id 或 agent_name' };

    const key = sessionKey(agentName, taskId);
    const existing = sessions.get(key);
    if (existing) return { status: 'success', message: '任务 Flowlock 已存在', session: publicSession(existing), idempotent: true };
    if (sessions.size >= maxConcurrentSessions) return { status: 'error', code: 'GLOBAL_LIMIT', error: '已达到全局后端 Flowlock 上限' };
    const agentCount = Array.from(sessions.values()).filter(session => session.agentName === agentName).length;
    if (agentCount >= maxSessionsPerAgent) return { status: 'error', code: 'AGENT_LIMIT', error: `${agentName} 已达到后端 Flowlock 上限` };

    const task = await getTask(taskId);
    const candidate = { agentName, taskId, assignmentId: args.assignment_id || task?.assignment_id || null };
    const ownership = validateTaskOwnership(candidate, task);
    if (!ownership.valid) return { status: 'error', code: 'TASK_INVALID', error: ownership.reason, task };

    const now = Date.now();
    const session = {
        id: randomUUID(),
        taskId,
        agentName,
        assignmentId: candidate.assignmentId,
        agentSessionId: stableSessionId(agentName, taskId),
        status: 'active',
        generation: 0,
        round: 0,
        retryCount: 0,
        maxRetries: toBoundedInteger(args.max_retries, maxRetries, 0, 100),
        maxRounds: toBoundedInteger(args.max_rounds, maxRounds, 1, 10000),
        defaultDelaySeconds: normalizeDelay(args.delay_seconds),
        nextDelaySeconds: null,
        defaultPrompt: args.prompt ? String(args.prompt) : null,
        nextPrompt: args.prompt ? String(args.prompt) : null,
        injectTools: args.inject_tools ? String(args.inject_tools) : 'TaskBoard',
        startedAt: now,
        updatedAt: now,
        lastTriggeredAt: null,
        lastCompletedAt: null,
        nextHeartbeatAt: null,
        lastError: null,
        completionReason: null,
        lastResponsePreview: '',
        pendingTimer: null
    };
    sessions.set(key, session);
    appendAudit('session_started', session);
    persistSessions();
    scheduleSession(session, args.start_immediately === false || String(args.start_immediately).toLowerCase() === 'false' ? session.defaultDelaySeconds : minDelaySeconds);
    return { status: 'success', message: '任务 Flowlock 已启动', session: publicSession(session) };
}

async function reconcileSessions(options = {}) {
    const results = [];
    for (const session of Array.from(sessions.values())) {
        try {
            const task = await getTask(session.taskId);
            const ownership = validateTaskOwnership(session, task);
            if (!ownership.valid) {
                await stopSession(session, task?.status === 'submitted' || task?.status === 'completed' ? 'complete' : 'rejected', ownership.reason);
                results.push({ taskId: session.taskId, action: 'stopped', reason: ownership.reason });
                continue;
            }
            if (options.recover && !session.pendingTimer && session.status !== 'running') {
                session.status = 'active';
                scheduleSession(session, recoveryDelaySeconds);
                results.push({ taskId: session.taskId, action: 'recovered' });
            } else {
                results.push({ taskId: session.taskId, action: 'valid' });
            }
        } catch (error) {
            results.push({ taskId: session.taskId, action: 'error', error: error.message });
        }
    }
    persistSessions();
    return { status: 'success', results };
}

async function processToolCall(args) {
    switch (args.command) {
        case 'StartTaskFlowlock':
            return startTaskFlowlock(args);
        case 'StopTaskFlowlock': {
            const session = sessions.get(sessionKey(args.agent_name, args.task_id));
            if (!session) return { status: 'error', code: 'NOT_FOUND', error: '未找到活动任务 Flowlock' };
            await stopSession(session, args.reason || 'manual_stop');
            return { status: 'success', message: '任务 Flowlock 已停止' };
        }
        case 'GetTaskFlowlock': {
            const session = sessions.get(sessionKey(args.agent_name, args.task_id));
            return { status: 'success', session: session ? publicSession(session) : null };
        }
        case 'ListTaskFlowlocks': {
            let list = Array.from(sessions.values());
            if (args.agent_name) list = list.filter(session => session.agentName === args.agent_name);
            return { status: 'success', sessions: list.map(publicSession), count: list.length, recent: recentTerminalSessions.slice(0, 20) };
        }
        case 'ReconcileTaskFlowlocks':
            return reconcileSessions({ recover: String(args.recover || 'false').toLowerCase() === 'true' });
        case 'GetBackendFlowlockStatus':
            return {
                status: 'success',
                backendFlowlock: {
                    enabled,
                    activeCount: sessions.size,
                    runningCount: inFlightKeys.size,
                    maxConcurrentSessions,
                    maxSessionsPerAgent,
                    sessions: Array.from(sessions.values()).map(publicSession)
                }
            };
        default:
            return { status: 'error', code: 'UNKNOWN_COMMAND', error: `未知命令: ${args.command}` };
    }
}

function setPluginManagerForTests(manager) {
    pluginManagerRef = manager;
}

module.exports = {
    initialize,
    shutdown,
    processToolCall,
    parseFlowlockProtocol,
    createSafeScanText,
    setPluginManagerForTests
};
