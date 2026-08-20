'use strict';

const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const bridge = require('./TaskFlowlockBridgePlugin');

async function run() {
    assert.equal(
        bridge.extractDelegationId('委托任务 (ID: aa-delegation-1718901234567-a1b2c3d4) 已提交'),
        'aa-delegation-1718901234567-a1b2c3d4'
    );

    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-flowlock-bridge-test-'));
    const tasks = new Map([
        ['task-a', { id: 'task-a', title: 'A', description: 'A task', status: 'in_progress', assignee: 'AgentX', assignment_id: 'assign-a', progress: 0 }],
        ['task-b', { id: 'task-b', title: 'B', description: 'B task', status: 'in_progress', assignee: 'AgentX', assignment_id: 'assign-b', progress: 0 }]
    ]);
    const delegations = new Map();
    const calls = [];
    let delegationSequence = 0;

    bridge.initialize({
        TASK_FLOWLOCK_BRIDGE_ENABLED: true,
        TASK_FLOWLOCK_RECOVERY_DELAY_SECONDS: 3600,
        TASK_FLOWLOCK_RECONCILE_INTERVAL_SECONDS: 3600,
        TASK_FLOWLOCK_MAX_REDISPATCHES: 2,
        TASK_FLOWLOCK_DATA_DIR: dataDir
    });

    bridge.setPluginManagerForTests({
        async processToolCall(name, args) {
            calls.push({ name, args: { ...args } });
            if (name === 'TaskBoard' && args.command === 'GetTask') {
                const task = tasks.get(args.task_id);
                return task ? { status: 'success', task } : { status: 'error' };
            }
            if (name === 'TaskBoard' && args.command === 'ReadTaskLog') {
                return { status: 'success', result: '(test diary)' };
            }
            if (name === 'TaskBoard' && args.command === 'FailTask') {
                const task = tasks.get(args.task_id);
                task.status = 'open';
                task.assignee = null;
                return { status: 'success', task };
            }
            if (name === 'AgentAssistant' && args.task_delegation === true) {
                delegationSequence++;
                const id = `aa-delegation-1718901234567-${String(delegationSequence).padStart(8, '0')}`;
                delegations.set(id, { status: delegationSequence === 2 ? 'waiting' : 'running' });
                return { content: [{ type: 'text', text: `委托任务 (ID: ${id}) 已成功提交。` }] };
            }
            if (name === 'AgentAssistant' && args.query_delegation) {
                const delegation = delegations.get(args.query_delegation);
                if (!delegation) throw new Error('delegation missing');
                return {
                    content: [{
                        type: 'text',
                        text: `委托任务仍在进行中。当前状态: ${delegation.status}。`
                    }]
                };
            }
            if (name === 'AgentAssistant' && args.cancel_delegation) {
                delegations.delete(args.cancel_delegation);
                return { content: [{ type: 'text', text: '已请求取消。' }] };
            }
            throw new Error(`Unexpected call: ${name}/${args.command || ''}`);
        }
    });

    const first = await bridge.processToolCall({
        command: 'StartTaskFlowlock',
        task_id: 'task-a',
        agent_name: 'AgentX',
        assignment_id: 'assign-a'
    });
    assert.equal(first.status, 'success');
    assert.match(first.mapping.delegationId, /^aa-delegation-/);
    assert.equal(first.mapping.status, 'queued');

    const duplicate = await bridge.processToolCall({
        command: 'StartTaskFlowlock',
        task_id: 'task-a',
        agent_name: 'AgentX',
        assignment_id: 'assign-a'
    });
    assert.equal(duplicate.idempotent, true);
    assert.equal(duplicate.mapping.delegationId, first.mapping.delegationId);
    assert.equal(calls.filter(call => call.name === 'AgentAssistant' && call.args.task_delegation).length, 1);

    const assignmentConflict = await bridge.processToolCall({
        command: 'StartTaskFlowlock',
        task_id: 'task-a',
        agent_name: 'AgentX',
        assignment_id: 'stale-assignment'
    });
    assert.equal(assignmentConflict.status, 'error');
    assert.equal(assignmentConflict.code, 'ASSIGNMENT_CONFLICT');
    assert.equal(calls.filter(call => call.name === 'AgentAssistant' && call.args.task_delegation).length, 1);

    const second = await bridge.processToolCall({
        command: 'StartTaskFlowlock',
        task_id: 'task-b',
        agent_name: 'AgentX',
        assignment_id: 'assign-b'
    });
    assert.equal(second.status, 'success');
    assert.notEqual(second.mapping.delegationId, first.mapping.delegationId);

    const reconciled = await bridge.processToolCall({ command: 'ReconcileTaskFlowlocks' });
    const secondResult = reconciled.results.find(result => result.taskId === 'task-b');
    assert.equal(secondResult.action, 'queued');
    const listed = await bridge.processToolCall({ command: 'ListTaskFlowlocks' });
    const secondMapping = listed.mappings.find(mapping => mapping.taskId === 'task-b');
    assert.equal(secondMapping.queuedBehindAgentWork, true);

    tasks.get('task-a').status = 'submitted';
    await bridge.processToolCall({ command: 'ReconcileTaskFlowlocks' });
    const afterSubmit = await bridge.processToolCall({ command: 'ListTaskFlowlocks' });
    assert.equal(afterSubmit.mappings.some(mapping => mapping.taskId === 'task-a'), false);
    assert.equal(afterSubmit.recent.some(mapping => mapping.taskId === 'task-a' && mapping.status === 'completed'), true);

    delegations.delete(second.mapping.delegationId);
    const redispatched = await bridge.processToolCall({ command: 'ReconcileTaskFlowlocks', allow_redispatch: true });
    const redispatchResult = redispatched.results.find(result => result.taskId === 'task-b');
    assert.equal(redispatchResult.action, 'redispatched');
    assert.notEqual(redispatchResult.delegationId, second.mapping.delegationId);

    bridge.shutdown();
    bridge.initialize({
        TASK_FLOWLOCK_BRIDGE_ENABLED: true,
        TASK_FLOWLOCK_RECOVERY_DELAY_SECONDS: 3600,
        TASK_FLOWLOCK_RECONCILE_INTERVAL_SECONDS: 3600,
        TASK_FLOWLOCK_MAX_REDISPATCHES: 2,
        TASK_FLOWLOCK_DATA_DIR: dataDir
    });
    const afterRestart = await bridge.processToolCall({
        command: 'GetTaskFlowlock',
        task_id: 'task-b',
        agent_name: 'AgentX'
    });
    assert.equal(afterRestart.mapping.status, 'orphaned');
    assert.equal(afterRestart.mapping.redispatchCount, 1);

    const recovered = await bridge.processToolCall({ command: 'ReconcileTaskFlowlocks', allow_redispatch: true });
    assert.equal(recovered.results.find(result => result.taskId === 'task-b').action, 'running');

    let current = await bridge.processToolCall({ command: 'GetTaskFlowlock', task_id: 'task-b', agent_name: 'AgentX' });
    delegations.delete(current.mapping.delegationId);
    const secondRedispatch = await bridge.processToolCall({ command: 'ReconcileTaskFlowlocks', allow_redispatch: true });
    assert.equal(secondRedispatch.results.find(result => result.taskId === 'task-b').action, 'redispatched');

    current = await bridge.processToolCall({ command: 'GetTaskFlowlock', task_id: 'task-b', agent_name: 'AgentX' });
    delegations.delete(current.mapping.delegationId);
    const capped = await bridge.processToolCall({ command: 'ReconcileTaskFlowlocks', allow_redispatch: true });
    assert.equal(capped.results.find(result => result.taskId === 'task-b').action, 'orphaned');
    current = await bridge.processToolCall({ command: 'GetTaskFlowlock', task_id: 'task-b', agent_name: 'AgentX' });
    assert.equal(current.mapping.redispatchCount, 2);
    assert.equal(current.mapping.status, 'orphaned');

    const stopped = await bridge.processToolCall({
        command: 'StopTaskFlowlock',
        task_id: 'task-b',
        agent_name: 'AgentX',
        reason: 'test stop'
    });
    assert.equal(stopped.status, 'success');
    const empty = await bridge.processToolCall({ command: 'ListTaskFlowlocks' });
    assert.equal(empty.count, 0);

    const persisted = JSON.parse(fs.readFileSync(path.join(dataDir, 'task-delegations.json'), 'utf-8'));
    assert.deepEqual(persisted.records, []);
    assert.ok(persisted.terminalRecords.length >= 2);

    bridge.shutdown();
    fs.rmSync(dataDir, { recursive: true, force: true });
    console.log('TaskFlowlockBridgePlugin tests passed.');
}

run().catch(error => {
    try {
        bridge.shutdown();
    } catch (_) {
        // Ignore cleanup failures in a failing test.
    }
    console.error(error);
    process.exit(1);
});
