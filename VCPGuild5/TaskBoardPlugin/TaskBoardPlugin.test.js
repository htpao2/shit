'use strict';

const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const board = require('./TaskBoardPlugin');

function run() {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'taskboard-direct-test-'));

    try {
        board.initialize({
            TASK_BOARD_DATA_DIR: dataDir,
            MAX_ACTIVE_TASKS: 3,
            TASK_TIMEOUT_HOURS: 24,
            DEBUG_MODE: false
        });

        const posted = board.processToolCall({
            command: 'PostTask',
            maid: '测试主控',
            title: 'direct contract test',
            description: 'verify structured direct responses',
            required_skills: ['programming'],
            priority: 'low'
        });
        assert.equal(posted.status, 'success');

        const listed = board.processToolCall({ command: 'ListTasks', status: 'open' });
        assert.equal(listed.status, 'success');
        assert.equal(listed.count, 1);
        assert.equal(Array.isArray(listed.tasks), true);
        assert.equal(listed.tasks[0].title, 'direct contract test');
        const taskId = listed.tasks[0].id;

        const detail = board.processToolCall({ command: 'GetTask', task_id: taskId });
        assert.equal(detail.status, 'success');
        assert.equal(detail.task.id, taskId);
        assert.equal(detail.task.status, 'open');

        const accepted = board.processToolCall({
            command: 'AcceptTask',
            task_id: taskId,
            expected_status: 'open',
            maid: '小娜'
        });
        assert.equal(accepted.status, 'success');
        assert.equal(accepted.task.status, 'in_progress');
        assert.equal(accepted.task.assignee, '小娜');
        assert.match(accepted.assignment_id, /^[0-9a-f-]{36}$/i);
        assert.equal(accepted.task.assignment_id, accepted.assignment_id);

        const conflict = board.processToolCall({
            command: 'AcceptTask',
            task_id: taskId,
            expected_status: 'open',
            maid: '小克'
        });
        assert.equal(conflict.status, 'error');
        assert.equal(conflict.code, 'TASK_STATE_CONFLICT');
        assert.equal(conflict.task.assignment_id, accepted.assignment_id);

        const persisted = JSON.parse(fs.readFileSync(path.join(dataDir, 'tasks.json'), 'utf8'));
        assert.equal(persisted[taskId].assignment_id, accepted.assignment_id);

        board.shutdown();

        const cliDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'taskboard-cli-test-'));
        try {
            const cli = spawnSync(process.execPath, [path.join(__dirname, 'TaskBoardPlugin.js')], {
                input: JSON.stringify({ command: 'ListTasks', status: 'all' }),
                encoding: 'utf8',
                env: { ...process.env, TASK_BOARD_DATA_DIR: cliDataDir }
            });
            assert.equal(cli.status, 0, cli.stderr);
            const cliResult = JSON.parse(cli.stdout.trim());
            assert.equal(cliResult.status, 'success');
            assert.equal(Array.isArray(cliResult.tasks), true);
        } finally {
            fs.rmSync(cliDataDir, { recursive: true, force: true });
        }

        console.log('TaskBoardPlugin direct contract tests passed.');
    } finally {
        board.shutdown();
        fs.rmSync(dataDir, { recursive: true, force: true });
    }
}

try {
    run();
} catch (error) {
    console.error(error);
    process.exit(1);
}
