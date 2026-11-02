'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

/**
 * Durable before/after images plus a SQLite commit marker.
 * Recoveries never overwrite an unrelated external edit. This does not replace
 * OS ACLs: an untrusted local process can race path validation on Windows.
 */
async function recoverJournal({ directory, store, readDisk, guard, trash }) {
    await fs.mkdir(directory, { recursive: true });
    for (const name of await fs.readdir(directory)) {
        if (!/^op-[a-f0-9-]+\.json$/.test(name)) continue;
        const file = path.join(directory, name);
        const journal = JSON.parse(await fs.readFile(file, 'utf8'));
        if (store.db.prepare('SELECT value FROM meta WHERE key = ?').get(journal.id)) {
            await fs.unlink(file);
            store.db.prepare('DELETE FROM meta WHERE key = ?').run(journal.id);
            continue;
        }
        for (const item of [...journal.items].reverse()) {
            guard(item.abs);
            const current = await readDisk(item.abs);
            if (current.hash === item.beforeHash) continue;
            if (current.hash !== item.afterHash) throw new Error(`未完成操作恢复冲突，未覆盖外部内容。请检查恢复日志：${file}`);
            if (item.before === null) await trash(item.abs);
            else {
                await fs.mkdir(path.dirname(item.abs), { recursive: true });
                await fs.writeFile(item.abs, Buffer.from(item.before, 'base64'));
            }
            if ((await readDisk(item.abs)).hash !== item.beforeHash) throw new Error(`恢复校验失败：${file}`);
        }
        await fs.unlink(file);
    }
}

async function commitMutation({ directory, store, changes, readDisk, guard, trash, record, logger = console, signal }) {
    const id = `op-${randomUUID()}`;
    const file = path.join(directory, `${id}.json`);
    const items = changes.map(c => ({
        abs: c.abs, beforeHash: c.disk.hash, afterHash: c.afterHash,
        before: c.disk.exists ? c.disk.buffer.toString('base64') : null,
    }));
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(file, JSON.stringify({ id, items }), { flag: 'wx', flush: true });
    const applied = [];
    try {
        for (const c of changes) {
            signal?.throwIfAborted();
            guard(c.abs);
            if ((await readDisk(c.abs)).hash !== c.disk.hash) throw new Error('文件在处理期间被外部修改，请重新读取');
            // Include the current operation in recovery even if a write partially fails.
            applied.push(c);
            if (c.content === null) await trash(c.abs);
            else {
                await fs.mkdir(path.dirname(c.abs), { recursive: true });
                await fs.writeFile(c.abs, c.content);
            }
            if ((await readDisk(c.abs)).hash !== c.afterHash) throw new Error('写入后内容校验失败');
        }
        signal?.throwIfAborted();
        store.transaction(() => {
            record();
            store.db.prepare('INSERT INTO meta(key,value) VALUES (?,?)').run(id, 'committed');
        });
    } catch (error) {
        const failed = [];
        for (const c of applied.reverse()) {
            try {
                guard(c.abs);
                const current = await readDisk(c.abs);
                if (current.hash === c.disk.hash) continue;
                if (current.hash !== c.afterHash) throw new Error('检测到额外改动或部分写入，保留恢复日志');
                if (c.disk.exists) await fs.writeFile(c.abs, c.disk.buffer);
                else await trash(c.abs);
                if ((await readDisk(c.abs)).hash !== c.disk.hash) throw new Error('恢复内容校验失败');
            } catch (restoreError) { failed.push(`${c.abs}: ${restoreError.message}`); }
        }
        if (failed.length) throw new Error(`操作未完成，需人工恢复：${failed.join('; ')}。恢复日志：${file}。原始错误：${error.message}`);
        await fs.unlink(file);
        throw new Error(`操作未完成，原文件已恢复：${error.message}`, { cause: error });
    }
    // Cleanup after commit must not transform success into a retryable failure.
    try {
        await fs.unlink(file);
        store.db.prepare('DELETE FROM meta WHERE key = ?').run(id);
    } catch (error) { logger.warn?.(`已提交操作的恢复日志清理失败：${file}: ${error.message}`); }
}

module.exports = { commitMutation, recoverJournal };