'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const plugin = require('./BackendFlowlockPlugin');

async function waitFor(predicate, timeoutMs = 4000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await predicate()) return;
        await new Promise(resolve => setTimeout(resolve, 25));
    }
    throw new Error('Timed out waiting for condition');
}

async function run() {
    const safeProtocol = plugin.parseFlowlockProtocol([
        '```text',
        '[[Flowlock::Fail]]',
        '```',
        '[[Flowlock::Start]]',
        '[[Flowlock::NextHeartbeat::2]]',
        '[[Flowlock::NextHeartbeat::9]]',
        '[[Flowlock::NextPrompt]]next step[[/Flowlock::NextPrompt]]'
    ].join('\n'));
    assert.strictEqual(safeProtocol.terminalType, null);
    assert.strictEqual(safeProtocol.shouldStart, true);
    assert.strictEqual(safeProtocol.nextHeartbeatSeconds, 9);
    assert.strictEqual(safeProtocol.nextPrompt, 'next step');

    const terminalProtocol = plugin.parseFlowlockProtocol([
        '[[Flowlock::Start]]',
        '[[Flowlock::Stop]]',
        '[[Flowlock::Complete]]',
        '[[Flowlock::Fail]]',
        'reason',
        '[[/Flowlock::Fail]]'
    ].join('\n'));
    assert.strictEqual(terminalProtocol.terminalType, 'fail');
    assert.strictEqual(terminalProtocol.shouldStart, false);
    assert.strictEqual(terminalProtocol.failReason, 'reason');

    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'backend-flowlock-test-'));
    const tasks = new Map([
        ['task-a', { id: 'task-a', title: 'A', description: 'A task', status: 'in_progress', assignee: 'AgentX', assignment_id: 'assign-a', progress: 0 }],
        ['task-b', { id: 'task-b', title: 'B', description: 'B task', status: 'in_progress', assignee: 'AgentX', assignment_id: 'assign-b', progress: 0 }]
    ]);
    const seenSessionIds = new Map();

    plugin.initialize({
        BACKEND_FLOWLOCK_ENABLED: true,
        BACKEND_FLOWLOCK_MIN_DELAY_SECONDS: 1,
        BACKEND_FLOWLOCK_DEFAULT_DELAY_SECONDS: 1,
        BACKEND_FLOWLOCK_RECOVERY_DELAY_SECONDS: 30,
        BACKEND_FLOWLOCK_MAX_SESSIONS_PER_AGENT: 3,
        BACKEND_FLOWLOCK_DATA_DIR: dataDir
    });

    plugin.setPluginManagerForTests({
        async processToolCall(name, args) {
            if (name === 'TaskBoard' && args.command === 'GetTask') {
                const task = tasks.get(args.task_id);
                return task ? { status: 'success', task } : { status: 'error' };
            }
            if (name === 'TaskBoard' && args.command === 'ReadTaskLog') {
                return { status: 'success', result: '(test diary)' };
            }
            if (name === 'AgentAssistant') {
                const taskId = args.prompt.includes('任务ID: task-a') ? 'task-a' : 'task-b';
                seenSessionIds.set(taskId, args.session_id);
                if (taskId === 'task-a') {
                    tasks.get(taskId).status = 'submitted';
                    return { content: [{ type: 'text', text: 'done\n[[Flowlock::Complete]]' }] };
                }
                return { content: [{ type: 'text', text: 'continue\n[[Flowlock::NextHeartbeat::30]]' }] };
            }
            throw new Error(`Unexpected call: ${name}/${args.command || ''}`);
        }
    });

    const first = await plugin.processToolCall({ command: 'StartTaskFlowlock', task_id: 'task-a', agent_name: 'AgentX', assignment_id: 'assign-a', start_immediately: true });
    const second = await plugin.processToolCall({ command: 'StartTaskFlowlock', task_id: 'task-b', agent_name: 'AgentX', assignment_id: 'assign-b', start_immediately: true });
    assert.strictEqual(first.status, 'success');
    assert.strictEqual(second.status, 'success');
    assert.notStrictEqual(first.session.agentSessionId, second.session.agentSessionId);

    await waitFor(async () => {
        const list = await plugin.processToolCall({ command: 'ListTaskFlowlocks' });
        return list.count === 1 && list.sessions[0].taskId === 'task-b';
    });

    assert.ok(seenSessionIds.get('task-a'));
    assert.ok(seenSessionIds.get('task-b'));
    assert.notStrictEqual(seenSessionIds.get('task-a'), seenSessionIds.get('task-b'));

    const stopped = await plugin.processToolCall({ command: 'StopTaskFlowlock', task_id: 'task-b', agent_name: 'AgentX', reason: 'test_stop' });
    assert.strictEqual(stopped.status, 'success');
    const empty = await plugin.processToolCall({ command: 'ListTaskFlowlocks' });
    assert.strictEqual(empty.count, 0);

    const persisted = JSON.parse(fs.readFileSync(path.join(dataDir, 'sessions.json'), 'utf-8'));
    assert.deepStrictEqual(persisted.sessions, []);
    assert.ok(persisted.recentTerminalSessions.some(session => session.taskId === 'task-a'));
    assert.ok(persisted.recentTerminalSessions.some(session => session.taskId === 'task-b'));

    plugin.shutdown();
    fs.rmSync(dataDir, { recursive: true, force: true });
    console.log('BackendFlowlockPlugin tests passed.');
}

run().catch(error => {
    try {
        plugin.shutdown();
    } catch (_) {
        // Ignore cleanup failure in a failing test.
    }
    console.error(error);
    process.exit(1);
});
