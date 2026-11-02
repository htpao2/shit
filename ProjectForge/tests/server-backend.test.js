'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const service = require('../ServerProjectForge');
const core = require('../ProjectForgeService');
const { loadStatus } = require('../../ProjectForgeStatus/status');
const { executionEnv } = require('../executionEnv');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-backend-'));
const root = path.join(tmp, 'workspace');
fs.mkdirSync(root);
const config = {
    PROJECT_BASE_PATH: tmp, ALLOWED_DIRECTORIES: JSON.stringify([root]),
    DEFAULT_WORKSPACE_PATH: root, DEFAULT_WORKSPACE_ALIAS: 'demo',
};
const call = (command, args = {}, context = {}) => service.processToolCall({ command, ...args }, context);
test.after(async () => {
    await service.shutdown();
    fs.rmSync(tmp, { recursive: true, force: true });
});

test('central lifecycle, persistent workspaces, Agent-only acceptance and static summary', async () => {
    await assert.rejects(call('ListProjects'), /not initialized/);
    await service.initialize(config, {});
    const workspaces = (await call('ListWorkspaces')).details.workspaces;
    assert.equal(workspaces.length, 1);
    const p = (await call('CreateProject', { name: 'backend', dir: 'app', todos: '实现\n验证' })).details.project;
    const projectId = p.id;
    const created = await call('CreateFile', { projectId, path: 'a.cjs', content: 'exports.add=(a,b)=>a+b;\n', reason: 'fixture', maid: 'Kerr' });
    const node = created.details.nodeId;
    assert.equal((await call('GetNode', { projectId, node: `n${node}` })).details.command, 'GetNode');
    await assert.rejects(call('EvalSymbol', { projectId, path: 'a.cjs#add', args: '[1,2]' }), /EVAL_ENABLED/);
    await call('SubmitReport', { projectId, conclusion: '原报告', maid: 'Kerr' });
    await call('AcceptProject', { projectId, maid: 'Reviewer' });
    const info = await call('GetProject', { projectId });
    assert.match(info.content[0].text, /原报告/);
    assert.match(info.content[0].text, /Reviewer/);
    const status = loadStatus({ PROJECT_BASE_PATH: tmp });
    assert.equal(status.vcp_dynamic_fold, true);
    assert.deepEqual(status.fold_blocks.map(b => b.threshold), [0.55, 0.35, 0]);
    assert.match(status.fold_blocks[0].content, /backend/);
    assert.ok(!JSON.stringify(status).includes(root));
    await assert.rejects(call('RegisterWorkspace', { alias: 'escape', path: os.tmpdir() }), /不能扩大授权|内部数据路径重叠/);
    await call('SetWorkspaceEnabled', { workspace: 'demo', enabled: false });
    await assert.rejects(call('CreateFile', { projectId, path: 'b.txt', content: 'x', reason: 'x' }), /停用/);
    await call('SetWorkspaceEnabled', { workspace: 'demo', enabled: true });
    await service.shutdown();
    assert.match(loadStatus({ PROJECT_BASE_PATH: tmp }).fold_blocks[0].content, /关闭/);
    await service.initialize({ ...config, EVAL_ENABLED: true }, {});
    assert.equal((await call('ListWorkspaces')).details.workspaces[0].id, workspaces[0].id);
    const evalResult = await call('EvalSymbol', { projectId, path: 'a.cjs#add', args: '[1,2]' });
    assert.equal(evalResult.details.status, 'returned');
    assert.equal(evalResult.details.value, 3);
    await service.shutdown();
});

test('junction escape and nonexistent descendants rejected for read/write/create project', async () => {
    const outside = path.join(tmp, 'outside');
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, 'secret.txt'), 'secret');
    const link = path.join(root, 'escape-link');
    fs.symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
    await service.initialize(config);
    const projectId = (await call('CreateProject', { name: 'root' })).details.project.id;
    await assert.rejects(call('ReadCode', { projectId, path: 'escape-link/secret.txt' }), /junction|越出/);
    await assert.rejects(call('CreateFile', { projectId, path: 'escape-link/new/file.txt', content: 'x', reason: 'x' }), /junction|越出|允许/);
    await assert.rejects(call('CreateProject', { name: 'escape', dir: 'escape-link/new' }), /junction|越出/);
    assert.equal(fs.existsSync(path.join(outside, 'new')), false);
    await service.shutdown();
});

test('no configured roots means no authorization; context cancellation fails queued calls', async () => {
    await service.initialize({ PROJECT_BASE_PATH: tmp });
    await assert.rejects(call('RegisterWorkspace', { alias: 'no', path: root }), /不能扩大授权/);
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(call('ListProjects', {}, { signal: controller.signal }), /abort/i);
    await service.shutdown();
});

test('status fails closed on stale, invalid and filtered summaries; environment excludes secrets', () => {
    const file = path.join(tmp, 'summary.json');
    const write = value => fs.writeFileSync(file, JSON.stringify(value));
    const env = { PROJECTFORGE_STATUS_PATH: file };
    write({ version: 1, online: true, updatedAt: '2000-01-01', projects: [] });
    assert.match(loadStatus(env).fold_blocks[0].content, /过期/);
    fs.writeFileSync(file, '{');
    assert.match(loadStatus(env).fold_blocks[0].content, /尚无/);
    write({ version: 1, online: true, updatedAt: new Date().toISOString(), projects: [{ id: 'p1', name: 'hidden' }] });
    assert.ok(!JSON.stringify(loadStatus({ ...env, STATUS_PROJECT_IDS: 'p2' })).includes('hidden'));
    assert.deepEqual(executionEnv({ PATH: 'bin', VCP_KEY: 'secret', NODE_OPTIONS: '--require evil' }), { PATH: 'bin' });
});

test('CSS/JavaScript validators execute rather than silently degrade', async () => {
    const { validateCode } = require('../fileKit/validator');
    for (const [name, text] of [['a.css', 'a { color: red; }'], ['a.js', 'const x = ;']]) {
        const diagnostics = await validateCode(name, text);
        assert.ok(!diagnostics.some(d => d.ruleId === 'linter-error'), JSON.stringify(diagnostics));
    }
    assert.ok((await validateCode('a.js', 'const x = ;')).some(d => d.fatal));
});

test('Windows binary outline uses real project absolute path', async () => {
    await service.initialize(config);
    const projectId = (await call('CreateProject', { name: 'binary', dir: 'binary' })).details.project.id;
    const file = path.join(root, 'binary', 'indexer.exe');
    fs.copyFileSync(path.join(__dirname, '../bin/win32-x64/projectforge_indexer.exe'), file);
    const result = await call('Outline', { projectId, path: 'indexer.exe' });
    assert.equal(result.details.files[0].isBinary, true);
    assert.ok(result.details.files[0].sections.length > 0);
    await service.shutdown();
});

test('recycle-bin failure never hard-deletes; real Windows recycle and snapshot restore', async () => {
    await service.initialize(config);
    const projectId = (await call('CreateProject', { name: 'recycle', dir: 'recycle' })).details.project.id;
    await call('CreateFile', { projectId, path: 'scratch.txt', content: 'recover me', reason: 'fixture' });
    const abs = path.join(root, 'recycle/scratch.txt');
    const runtime = core._test.getRuntime();
    runtime.trash = async () => { throw new Error('simulated service-account denial'); };
    const failed = await call('RemoveFile', { projectId, path: 'scratch.txt', reason: 'denial test' });
    assert.equal(failed.status, 'error');
    assert.equal(fs.readFileSync(abs, 'utf8'), 'recover me');
    runtime.trash = null;
    const removed = await call('RemoveFile', { projectId, path: 'scratch.txt', reason: 'real recycle test' });
    assert.equal(removed.details.removed, 1, JSON.stringify(removed));
    assert.equal(fs.existsSync(abs), false);
    await call('Rollback', { projectId, batch: `b${removed.details.batchId}` });
    assert.equal(fs.readFileSync(abs, 'utf8'), 'recover me');
    await service.shutdown();
});

test('active execution cancellation and shutdown stop workers; reinitialize remains usable', async () => {
    await service.initialize({ ...config, EVAL_ENABLED: true });
    const projectId = (await call('CreateProject', { name: 'cancel', dir: 'cancel' })).details.project.id;
    await call('CreateFile', {
        projectId, path: 'loop.cjs', content: 'function loop(){ while(true){} }\nmodule.exports={loop};\n', reason: 'fixture',
    });
    const controller = new AbortController();
    const pending = call('EvalSymbol', { projectId, path: 'loop.cjs#loop', timeoutMs: 10000 }, { signal: controller.signal });
    const timer = setTimeout(() => controller.abort(), 150);
    try { assert.equal((await pending).details.status, 'cancelled'); }
    finally { clearTimeout(timer); }
    const second = call('EvalSymbol', { projectId, path: 'loop.cjs#loop', timeoutMs: 10000 });
    await new Promise(resolve => setTimeout(resolve, 150));
    const shutdown = service.shutdown();
    assert.equal((await second).details.status, 'cancelled');
    await shutdown;
    await service.initialize(config);
    assert.ok((await call('ListProjects')).details.count > 0);
    await service.shutdown();

    const { runProcess } = require('../evalProcess');
    const neverSpawned = await runProcess('nonexistent-runtime', [], { signal: AbortSignal.abort() });
    assert.equal(neverSpawned.status, 'cancelled');
});

test('global queue serializes two project IDs targeting the same file', async () => {
    await service.initialize(config);
    const first = (await call('CreateProject', { name: 'one', dir: 'shared' })).details.project.id;
    const second = (await call('CreateProject', { name: 'two', dir: 'shared' })).details.project.id;
    await call('CreateFile', { projectId: first, path: 'shared.txt', content: 'a\nb\n', reason: 'init' });
    await Promise.all([
        call('EditCode', { projectId: first, path: 'shared.txt', target: 'a', replace: 'A', reason: 'first' }),
        call('EditCode', { projectId: second, path: 'shared.txt', target: 'b', replace: 'B', reason: 'second' }),
    ]);
    assert.equal(fs.readFileSync(path.join(root, 'shared/shared.txt'), 'utf8'), 'A\nB\n');
    assert.equal(core._test.getRuntime().tickets.tickets?.size || 0, 0);
    await service.shutdown();
});