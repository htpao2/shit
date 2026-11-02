'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { commitMutation, recoverJournal } = require('../mutationJournal');
const { ProjectStore, sha256 } = require('../store');

async function fixture(fn) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pf-journal-'));
    const store = new ProjectStore(path.join(root, 'db.sqlite'));
    const readDisk = async abs => {
        try {
            const buffer = await fs.readFile(abs);
            return { exists: true, buffer, hash: sha256(buffer) };
        } catch (error) {
            if (error.code === 'ENOENT') return { exists: false, hash: null, buffer: null };
            throw error;
        }
    };
    const options = {
        directory: path.join(root, 'recovery'), store, readDisk,
        guard: () => {}, trash: abs => fs.unlink(abs),
    };
    try { await fn({ root, store, readDisk, options }); }
    finally { store.close(); await fs.rm(root, { recursive: true, force: true }); }
}
test('SQLite record failure compensates changed bytes and leaves no false history', async () => fixture(async ({ root, store, readDisk, options }) => {
    const abs = path.join(root, 'a.txt');
    await fs.writeFile(abs, 'before');
    const disk = await readDisk(abs);
    await assert.rejects(commitMutation({
        ...options, changes: [{ abs, disk, content: Buffer.from('after'), afterHash: sha256(Buffer.from('after')) }],
        record() { store.db.prepare('INSERT INTO meta(key,value) VALUES (?,?)').run('must-rollback', 'x'); throw new Error('injected DB failure'); },
    }), /原文件已恢复/);
    assert.equal(await fs.readFile(abs, 'utf8'), 'before');
    assert.equal(store.db.prepare('SELECT value FROM meta WHERE key=?').get('must-rollback'), undefined);
    assert.deepEqual(await fs.readdir(options.directory), []);
}));
test('second-file failure restores first; external second-file edit remains untouched', async () => fixture(async ({ root, readDisk, options }) => {
    const a = path.join(root, 'a.txt');
    const b = path.join(root, 'b.txt');
    await fs.writeFile(a, 'a1'); await fs.writeFile(b, 'b1');
    const changes = [
        { abs: a, disk: await readDisk(a), content: Buffer.from('a2'), afterHash: sha256(Buffer.from('a2')) },
        { abs: b, disk: await readDisk(b), content: Buffer.from('b2'), afterHash: sha256(Buffer.from('b2')) },
    ];
    let guarded = 0;
    await assert.rejects(commitMutation({
        ...options, changes,
        guard: abs => { if (++guarded === 2) require('node:fs').writeFileSync(abs, 'external'); },
        record() { assert.fail('must not record partial operation'); },
    }), /原文件已恢复/);
    assert.equal(await fs.readFile(a, 'utf8'), 'a1');
    assert.equal(await fs.readFile(b, 'utf8'), 'external');
}));
test('startup restores unfinished journal, retains committed write, refuses drift', async () => fixture(async ({ root, store, options }) => {
    await fs.mkdir(options.directory);
    const abs = path.join(root, 'a.txt');
    const before = Buffer.from('old'), after = Buffer.from('new');
    const item = { abs, before: before.toString('base64'), beforeHash: sha256(before), afterHash: sha256(after) };
    const file = path.join(options.directory, 'op-aaaaaaaa.json');
    await fs.writeFile(abs, after);
    await fs.writeFile(file, JSON.stringify({ id: 'op-aaaaaaaa', items: [item] }));
    await recoverJournal(options);
    assert.equal(await fs.readFile(abs, 'utf8'), 'old');
    await fs.writeFile(abs, after);
    await fs.writeFile(file, JSON.stringify({ id: 'op-aaaaaaaa', items: [item] }));
    store.db.prepare('INSERT INTO meta(key,value) VALUES (?,?)').run('op-aaaaaaaa', 'committed');
    await recoverJournal(options);
    assert.equal(await fs.readFile(abs, 'utf8'), 'new');
    await fs.writeFile(abs, 'external');
    await fs.writeFile(file, JSON.stringify({ id: 'op-aaaaaaaa', items: [item] }));
    await assert.rejects(recoverJournal(options), /恢复冲突/);
    assert.equal(await fs.readFile(abs, 'utf8'), 'external');
    assert.ok((await fs.stat(file)).size > 0);
}));
test('cancel before commit restores disk and never records success', async () => fixture(async ({ root, readDisk, options }) => {
    const abs = path.join(root, 'a.txt');
    await fs.writeFile(abs, 'before');
    const signal = AbortSignal.abort(new Error('cancelled'));
    await assert.rejects(commitMutation({
        ...options, signal,
        changes: [{ abs, disk: await readDisk(abs), content: Buffer.from('after'), afterHash: sha256(Buffer.from('after')) }],
        record() { assert.fail('cancelled operation cannot commit'); },
    }), /cancelled/);
    assert.equal(await fs.readFile(abs, 'utf8'), 'before');
}));