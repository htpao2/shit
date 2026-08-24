'use strict';

const fs = require('fs');
const path = require('path');

let pluginManagerRef = null;
let enabled = true;
let debugMode = false;
let reconcileIntervalMs = 30000;
let recoveryDelayMs = 5000;
let maxRedispatches = 2;
let dataFile = '';
let auditFile = '';
let reconcileTimer = null;
let recoveryTimer = null;
let shuttingDown = false;
let reconcileRunning = false;

const records = new Map();
const terminalRecords = [];
const TERMINAL_HISTORY_LIMIT = 100;
const ACTIVE_STATES = new Set(['starting', 'queued', 'running', 'waiting', 'orphaned', 'redispatching']);

function initialize(config = {}) {
    enabled = String(config.TASK_FLOWLOCK_BRIDGE_ENABLED || 'true').toLowerCase() === 'true';
    debugMode = String(config.DebugMode || 'false').toLowerCase() === 'true';
    reconcileIntervalMs = boundedInteger(config.TASK_FLOWLOCK_RECONCILE_INTERVAL_SECONDS, 30, 5, 3600) * 1000;
    recoveryDelayMs = boundedInteger(config.TASK_FLOWLOCK_RECOVERY_DELAY_SECONDS, 5, 1, 3600) * 1000;
    maxRedispatches = boundedInteger(config.TASK_FLOWLOCK_MAX_REDISPATCHES, 2, 0, 20);

    const dataDir = config.TASK_FLOWLOCK_DATA_DIR
        ? path.resolve(__dirname, config.TASK_FLOWLOCK_DATA_DIR)
        : path.join(__dirname, 'data');
    fs.mkdirSync(dataDir, { recursive: true });
    dataFile = path.join(dataDir, 'task-delegations.json');
    auditFile = path.join(dataDir, 'audit.jsonl');

    try {
        pluginManagerRef = require('../../Plugin.js');
    } catch (error) {
        console.error('[TaskFlowlockBridgePlugin] PluginManager unavailable:', error.message);
    }

    shuttingDown = false;
    loadState();
    if (enabled) {
        recoveryTimer = setTimeout(() => {
            reconcileAll({ allowRedispatch: true, source: 'startup' }).catch(logUnhandled);
        }, recoveryDelayMs);
        reconcileTimer = setInterval(() => {
            reconcileAll({ allowRedispatch: true, source: 'interval' }).catch(logUnhandled);
        }, reconcileIntervalMs);
    }
    console.log(`[TaskFlowlockBridgePlugin] Initialized with ${records.size} active mapping(s).`);
}

function shutdown() {
    shuttingDown = true;
    if (recoveryTimer) clearTimeout(recoveryTimer);
    if (reconcileTimer) clearInterval(reconcileTimer);
    recoveryTimer = null;
    reconcileTimer = null;
    persistState();
    console.log('[TaskFlowlockBridgePlugin] Shutdown complete.');
}

function boundedInteger(value, fallback, minimum, maximum) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(minimum, Math.min(maximum, parsed));
}

function mappingKey(agentName, taskId) {
    return `${agentName}::${taskId}`;
}

function publicRecord(record) {
    return {
        taskId: record.taskId,
        assignmentId: record.assignmentId || null,
        agentName: record.agentName,
        delegationId: record.delegationId || null,
        status: record.status,
        aaStatus: record.aaStatus || null,
        dispatchCount: record.dispatchCount || 0,
        redispatchCount: record.redispatchCount || 0,
        startedAt: record.startedAt,
        updatedAt: record.updatedAt,
        lastReconciledAt: record.lastReconciledAt || null,
        lastError: record.lastError || null,
        completionReason: record.completionReason || null,
        queuedBehindAgentWork: !!record.queuedBehindAgentWork
    };
}

function persistState() {
    if (!dataFile) return;
    const payload = {
        version: 1,
        savedAt: new Date().toISOString(),
        records: Array.from(records.values()),
        terminalRecords
    };
    const temporaryFile = `${dataFile}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(temporaryFile, JSON.stringify(payload, null, 2), 'utf-8');
    fs.renameSync(temporaryFile, dataFile);
}

function loadState() {
    records.clear();
    terminalRecords.length = 0;
    if (!dataFile || !fs.existsSync(dataFile)) return;
    try {
        const payload = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
        for (const record of Array.isArray(payload.records) ? payload.records : []) {
            if (!record.taskId || !record.agentName || !ACTIVE_STATES.has(record.status)) continue;
            record.status = record.delegationId ? 'orphaned' : 'starting';
            record.updatedAt = Date.now();
            records.set(mappingKey(record.agentName, record.taskId), record);
        }
        if (Array.isArray(payload.terminalRecords)) {
            terminalRecords.push(...payload.terminalRecords.slice(0, TERMINAL_HISTORY_LIMIT));
        }
    } catch (error) {
        const corruptFile = `${dataFile}.corrupt-${Date.now()}`;
        fs.renameSync(dataFile, corruptFile);
        console.error('[TaskFlowlockBridgePlugin] Corrupt state moved to:', corruptFile);
    }
}

function appendAudit(event, record, extra = {}) {
    if (!auditFile) return;
    fs.appendFileSync(auditFile, `${JSON.stringify({
        timestamp: new Date().toISOString(),
        event,
        taskId: record?.taskId || null,
        agentName: record?.agentName || null,
        delegationId: record?.delegationId || null,
        ...extra
    })}\n`, 'utf-8');
}

function extractText(result) {
    if (typeof result === 'string') return result;
    if (typeof result?.result === 'string') return result.result;
    if (typeof result?.message === 'string') return result.message;
    if (Array.isArray(result?.content)) {
        return result.content.filter(part => part?.type === 'text').map(part => part.text || '').join('\n');
    }
    return '';
}

function extractDelegationId(text) {
    return String(text || '').match(/aa-delegation-\d+-[a-f0-9-]+/i)?.[0] || null;
}

async function callPlugin(name, args) {
    if (!pluginManagerRef?.processToolCall) throw new Error('PluginManager unavailable');
    return pluginManagerRef.processToolCall(name, args);
}

async function getTask(taskId) {
    const result = await callPlugin('TaskBoard', { command: 'GetTask', task_id: taskId });
    return result?.status === 'success' ? result.task || null : null;
}

async function readTaskDiary(taskId) {
    const result = await callPlugin('TaskBoard', { command: 'ReadTaskLog', task_id: taskId, lines: 120 });
    return result?.status === 'success' ? extractText(result) : '(任务日记暂不可用)';
}

function validateOwnership(record, task) {
    if (!task) return { valid: false, reason: 'task_not_found' };
    if (task.status !== 'in_progress') return { valid: false, reason: `task_status_${task.status}` };
    if (task.assignee !== record.agentName) return { valid: false, reason: 'assignee_changed' };
    if (record.assignmentId && record.assignmentId !== task.assignment_id) {
        return { valid: false, reason: 'assignment_changed' };
    }
    return { valid: true };
}

function buildDelegationPrompt(record, task, diary, customPrompt = '') {
    return `[TaskBoard 自主任务]\n` +
        `任务ID: ${task.id}\n标题: ${task.title}\n描述: ${task.description || '无'}\n` +
        `优先级: ${task.priority || 'medium'}\n当前进度: ${task.progress || 0}%\n\n` +
        `【最近任务日记】\n${diary || '(暂无日记)'}\n\n` +
        `${customPrompt ? `【补充目标】\n${customPrompt}\n\n` : ''}` +
        `请使用官方 AgentAssistant Flowlock 持续推进本任务。首轮若需继续，必须输出 [[Flowlock::Start]]。\n` +
        `每轮结束前调用 TaskBoard.AppendTaskLog 记录已完成工作、问题和下一步。\n` +
        `任务真正完成时必须先调用 TaskBoard.SubmitTask 写入 deliverable 与 summary，成功后再输出 [[Flowlock::Complete]]。\n` +
        `完全无法完成时先调用 TaskBoard.FailTask 或 AbandonTask，再输出 [[Flowlock::Fail]]。\n` +
        `仅希望停止自主心跳但保留任务时输出 [[Flowlock::Stop]]。`;
}

async function dispatchDelegation(record, task, customPrompt = '') {
    const diary = await readTaskDiary(task.id);
    const prompt = buildDelegationPrompt(record, task, diary, customPrompt);
    record.status = record.dispatchCount > 0 ? 'redispatching' : 'starting';
    record.updatedAt = Date.now();
    record.lastError = null;
    persistState();

    const result = await callPlugin('AgentAssistant', {
        agent_name: record.agentName,
        prompt,
        maid: 'TaskFlowlockBridgePlugin',
        task_delegation: true,
        inject_tools: 'TaskBoard'
    });
    const receipt = extractText(result);
    const delegationId = extractDelegationId(receipt);
    if (!delegationId) throw new Error('AgentAssistant 未返回可识别的 delegationId');

    record.delegationId = delegationId;
    record.status = 'queued';
    record.aaStatus = 'submitted';
    record.dispatchCount = (record.dispatchCount || 0) + 1;
    record.updatedAt = Date.now();
    appendAudit('delegation_dispatched', record);
    persistState();
    return record;
}

async function startTaskFlowlock(args) {
    if (!enabled) return { status: 'error', code: 'DISABLED', error: 'Task Flowlock bridge is disabled' };
    const taskId = String(args.task_id || '').trim();
    const agentName = String(args.agent_name || '').trim();
    const requestedAssignmentId = String(args.assignment_id || '').trim() || null;
    if (!taskId || !agentName) return { status: 'error', code: 'INVALID_ARGUMENT', error: '缺少 task_id 或 agent_name' };

    const key = mappingKey(agentName, taskId);
    const existing = records.get(key);
    if (existing) {
        if (requestedAssignmentId && existing.assignmentId !== requestedAssignmentId) {
            return {
                status: 'error',
                code: 'ASSIGNMENT_CONFLICT',
                error: '任务分配令牌与现有心流映射不一致',
                mapping: publicRecord(existing)
            };
        }
        return { status: 'success', idempotent: true, mapping: publicRecord(existing) };
    }

    const task = await getTask(taskId);
    const now = Date.now();
    const record = {
        taskId,
        assignmentId: requestedAssignmentId || task?.assignment_id || null,
        agentName,
        delegationId: null,
        status: 'starting',
        aaStatus: null,
        dispatchCount: 0,
        redispatchCount: 0,
        startedAt: now,
        updatedAt: now,
        lastReconciledAt: null,
        lastError: null,
        completionReason: null,
        queuedBehindAgentWork: false
    };
    const ownership = validateOwnership(record, task);
    if (!ownership.valid) return { status: 'error', code: 'TASK_INVALID', error: ownership.reason, task };

    records.set(key, record);
    appendAudit('mapping_created', record);
    persistState();
    try {
        await dispatchDelegation(record, task, args.prompt ? String(args.prompt) : '');
        return { status: 'success', mapping: publicRecord(record) };
    } catch (error) {
        record.lastError = error.message;
        record.updatedAt = Date.now();
        appendAudit('delegation_dispatch_failed', record, { error: error.message });
        if (!record.delegationId) {
            records.delete(key);
        } else {
            record.status = 'orphaned';
        }
        persistState();
        return { status: 'error', code: 'AA_DISPATCH_FAILED', error: error.message, mapping: publicRecord(record) };
    }
}

async function queryDelegation(record) {
    if (!record.delegationId) return { state: 'missing', text: '' };
    try {
        const result = await callPlugin('AgentAssistant', { query_delegation: record.delegationId });
        const text = extractText(result);
        if (/仍在进行中|当前状态:/i.test(text)) {
            const status = text.match(/当前状态:\s*([^。\n]+)/)?.[1]?.trim() || 'running';
            return { state: 'active', status, text };
        }
        const normalizedStatusText = text.replace(/\*/g, '');
        if (/任务状态:\s*(?:Failed|Cancelled|Stopped)\b/i.test(normalizedStatusText)) {
            return { state: 'failed', text };
        }
        if (/任务状态:\s*Succeed\b|已经完成|处理完毕/i.test(normalizedStatusText)) {
            return { state: 'completed', text };
        }
        return { state: 'unknown', text };
    } catch (error) {
        return { state: 'missing', error: error.message, text: '' };
    }
}

async function finalizeRecord(record, status, reason) {
    records.delete(mappingKey(record.agentName, record.taskId));
    record.status = status;
    record.completionReason = reason;
    record.updatedAt = Date.now();
    terminalRecords.unshift(publicRecord(record));
    terminalRecords.length = Math.min(terminalRecords.length, TERMINAL_HISTORY_LIMIT);
    appendAudit('mapping_finalized', record, { status, reason });
    persistState();
}

async function reconcileRecord(record, options = {}) {
    const task = await getTask(record.taskId);
    record.lastReconciledAt = Date.now();

    if (!task) {
        await finalizeRecord(record, 'rejected', 'task_not_found');
        return { taskId: record.taskId, action: 'rejected', reason: 'task_not_found' };
    }
    if (['submitted', 'completed'].includes(task.status)) {
        await finalizeRecord(record, 'completed', `task_status_${task.status}`);
        return { taskId: record.taskId, action: 'completed', reason: task.status };
    }
    const ownership = validateOwnership(record, task);
    if (!ownership.valid) {
        await finalizeRecord(record, 'stopped', ownership.reason);
        return { taskId: record.taskId, action: 'stopped', reason: ownership.reason };
    }

    const delegation = await queryDelegation(record);
    record.aaStatus = delegation.status || delegation.state;
    record.queuedBehindAgentWork = delegation.state === 'active' && /wait|queued|等待/i.test(delegation.status || '');
    record.updatedAt = Date.now();

    if (delegation.state === 'active') {
        record.status = record.queuedBehindAgentWork ? 'queued' : 'running';
        persistState();
        return { taskId: record.taskId, action: record.status, delegationId: record.delegationId };
    }

    if (delegation.state === 'failed') {
        const failResult = await callPlugin('TaskBoard', {
            command: 'FailTask',
            task_id: task.id,
            reason: `AgentAssistant 委托失败或停止: ${record.delegationId}`,
            maid: record.agentName
        });
        if (failResult?.status !== 'success') {
            record.status = 'orphaned';
            record.lastError = failResult?.error || 'TaskBoard FailTask failed';
            persistState();
            return { taskId: record.taskId, action: 'orphaned', reason: record.lastError };
        }
        await finalizeRecord(record, 'failed', 'aa_delegation_failed');
        return { taskId: record.taskId, action: 'failed' };
    }

    if (delegation.state === 'completed') {
        // AA 宣告完成但任务未提交时，重新委托一次纠正状态闭环。
        record.status = 'orphaned';
        record.lastError = 'AA delegation completed while TaskBoard remains in_progress';
    } else if (delegation.state === 'missing') {
        record.status = 'orphaned';
        record.lastError = delegation.error || 'AA delegation missing after restart';
    } else {
        record.status = 'waiting';
        persistState();
        return { taskId: record.taskId, action: 'waiting' };
    }

    if (options.allowRedispatch && record.redispatchCount < maxRedispatches) {
        record.redispatchCount++;
        record.delegationId = null;
        appendAudit('delegation_redispatch_requested', record, { reason: record.lastError });
        await dispatchDelegation(record, task, record.lastError);
        return { taskId: record.taskId, action: 'redispatched', delegationId: record.delegationId };
    }

    persistState();
    return { taskId: record.taskId, action: 'orphaned', reason: record.lastError };
}

async function reconcileAll(options = {}) {
    if (reconcileRunning || shuttingDown) return { status: 'success', skipped: true, results: [] };
    reconcileRunning = true;
    const results = [];
    try {
        for (const record of Array.from(records.values())) {
            try {
                results.push(await reconcileRecord(record, options));
            } catch (error) {
                record.status = 'orphaned';
                record.lastError = error.message;
                record.updatedAt = Date.now();
                appendAudit('reconcile_failed', record, { error: error.message });
                persistState();
                results.push({ taskId: record.taskId, action: 'error', error: error.message });
            }
        }
        return { status: 'success', source: options.source || 'manual', results };
    } finally {
        reconcileRunning = false;
    }
}

async function stopTaskFlowlock(args) {
    const record = records.get(mappingKey(args.agent_name, args.task_id));
    if (!record) return { status: 'error', code: 'NOT_FOUND', error: '未找到任务心流映射' };
    if (record.delegationId) {
        try {
            await callPlugin('AgentAssistant', {
                cancel_delegation: record.delegationId,
                maid: 'TaskFlowlockBridgePlugin'
            });
        } catch (error) {
            record.lastError = error.message;
            persistState();
            return { status: 'error', code: 'AA_CANCEL_FAILED', error: error.message, mapping: publicRecord(record) };
        }
    }
    await finalizeRecord(record, 'stopped', args.reason || 'manual_stop');
    return { status: 'success', message: '任务心流委托已取消', mapping: publicRecord(record) };
}

async function processToolCall(args) {
    switch (args.command) {
        case 'StartTaskFlowlock':
            return startTaskFlowlock(args);
        case 'StopTaskFlowlock':
            return stopTaskFlowlock(args);
        case 'GetTaskFlowlock': {
            const record = records.get(mappingKey(args.agent_name, args.task_id));
            return { status: 'success', mapping: record ? publicRecord(record) : null };
        }
        case 'ListTaskFlowlocks': {
            let list = Array.from(records.values());
            if (args.agent_name) list = list.filter(record => record.agentName === args.agent_name);
            return { status: 'success', mappings: list.map(publicRecord), count: list.length, recent: terminalRecords.slice(0, 20) };
        }
        case 'ReconcileTaskFlowlocks':
            return reconcileAll({
                allowRedispatch: String(args.allow_redispatch ?? 'true').toLowerCase() === 'true',
                source: 'manual'
            });
        case 'GetTaskFlowlockBridgeStatus':
            return {
                status: 'success',
                bridge: {
                    enabled,
                    activeCount: records.size,
                    reconcileRunning,
                    maxRedispatches,
                    officialAAFlowlock: true,
                    sameAgentConcurrency: 'serialized_by_agent_assistant',
                    mappings: Array.from(records.values()).map(publicRecord)
                }
            };
        default:
            return { status: 'error', code: 'UNKNOWN_COMMAND', error: `未知命令: ${args.command}` };
    }
}

function setPluginManagerForTests(manager) {
    pluginManagerRef = manager;
}

function logUnhandled(error) {
    if (debugMode) console.error('[TaskFlowlockBridgePlugin] Reconcile error:', error);
}

module.exports = {
    initialize,
    shutdown,
    processToolCall,
    setPluginManagerForTests,
    extractDelegationId
};
