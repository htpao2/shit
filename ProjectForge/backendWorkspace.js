'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { isPathInside } = require('./fileKit/paths');

/** Resolve existing ancestors as well as not-yet-created descendants. */
function realLocation(input) {
    const abs = path.resolve(input);
    let cursor = abs;
    const tail = [];
    for (;;) {
        try {
            // lstat distinguishes a dangling link from a genuinely absent component.
            fs.lstatSync(cursor);
            return path.resolve(fs.realpathSync.native(cursor), ...tail);
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
            try {
                if (fs.lstatSync(cursor).isSymbolicLink()) throw new Error('Dangling symbolic link is not allowed');
            } catch (probe) {
                if (probe.code !== 'ENOENT') throw probe;
            }
            const parent = path.dirname(cursor);
            if (parent === cursor) throw error;
            tail.unshift(path.basename(cursor));
            cursor = parent;
        }
    }
}

function safePath(input) {
    const abs = path.resolve(input);
    if (process.platform === 'win32') {
        if (/^\\\\[?.]\\/.test(abs) || abs.slice(2).includes(':')) {
            throw new Error('Device paths and alternate data streams are not allowed');
        }
        for (const part of abs.slice(3).split(/[\\/]/)) {
            if (/[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)) {
                throw new Error('Reserved Windows path component');
            }
        }
    }
    return abs;
}

function assertInsideReal(input, root) {
    const abs = safePath(input);
    if (!isPathInside(abs, root) || !isPathInside(realLocation(abs), realLocation(root))) {
        throw new Error('路径越出授权根目录（含 junction / symbolic link）');
    }
    return abs;
}

function parseRoots(value) {
    const absolute = input => {
        if (typeof input !== 'string' || !path.isAbsolute(input)) throw new Error('ALLOWED_DIRECTORIES must contain absolute paths');
        return safePath(input);
    };
    if (Array.isArray(value)) return value.map(absolute);
    const raw = String(value || '').trim();
    if (!raw) return [];
    if (raw.startsWith('[')) {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed) || parsed.some(v => typeof v !== 'string')) throw new Error('ALLOWED_DIRECTORIES JSON must be a string array');
        return parsed.map(absolute);
    }
    return raw.split(',').map(v => v.trim()).filter(Boolean).map(absolute);
}

class BackendWorkspaceService {
    constructor({ file, allowedRoots = [], defaultRoot = '', defaultAlias = 'default', protectedPaths = [] }) {
        this.file = file;
        this.allowedRoots = allowedRoots;
        this.protectedPaths = protectedPaths;
        this.state = { version: 1, activeId: null, workspaces: [] };
        if (fs.existsSync(file)) {
            const value = JSON.parse(fs.readFileSync(file, 'utf8'));
            if (value.version !== 1 || !Array.isArray(value.workspaces)) throw new Error('Invalid workspace registry');
            this.state = value;
        }
        if (defaultRoot && !this.state.workspaces.length) this.register(defaultAlias, defaultRoot);
    }

    assertAllowed(input) {
        const abs = safePath(input);
        const real = realLocation(abs);
        if (this.protectedPaths.some(p => isPathInside(real, realLocation(p)) || isPathInside(realLocation(p), real))) {
            throw new Error('工作区不能与插件代码、数据库或内部数据路径重叠');
        }
        if (!this.allowedRoots.some(root => {
            try { assertInsideReal(abs, root); return true; } catch { return false; }
        })) throw new Error('工作区不在管理员配置的 ALLOWED_DIRECTORIES 内；Agent 不能扩大授权');
        return abs;
    }

    save(next) {
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        const temp = `${this.file}.${crypto.randomUUID()}.tmp`;
        try {
            fs.writeFileSync(temp, JSON.stringify(next, null, 2), { flag: 'wx' });
            fs.renameSync(temp, this.file);
            this.state = next;
        } finally {
            fs.rmSync(temp, { force: true });
        }
    }

    list() {
        return this.state.workspaces.map(ws => {
            let allowed = true;
            try { this.assertAllowed(ws.path); } catch { allowed = false; }
            return { ...ws, enabled: ws.enabled && allowed, authorized: allowed };
        });
    }

    getActiveWorkspaceId() { return this.state.activeId; }

    find(ref) {
        const key = String(ref || '').toLowerCase();
        const found = this.state.workspaces.find(w => w.id === ref || w.alias.toLowerCase() === key);
        if (!found) throw new Error('工作区不存在');
        return found;
    }

    register(alias, input) {
        alias = String(alias || '').trim().toLowerCase();
        if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(alias)) throw new Error('alias must match [a-z0-9][a-z0-9_-]{0,63}');
        if (!input || !path.isAbsolute(String(input))) throw new Error('RegisterWorkspace requires an absolute path');
        const abs = this.assertAllowed(input);
        if (!fs.statSync(abs).isDirectory()) throw new Error('工作区目录必须已存在');
        if (this.state.workspaces.some(w => w.alias === alias)) throw new Error('工作区别名已存在');
        const ws = { id: `ws-${crypto.randomUUID()}`, alias, path: abs, enabled: true };
        this.save({ ...this.state, activeId: this.state.activeId || ws.id, workspaces: [...this.state.workspaces, ws] });
        return ws;
    }

    update(ref, enabled) {
        const ws = this.find(ref);
        if (enabled) this.assertAllowed(ws.path);
        const next = { ...ws, enabled };
        this.save({ ...this.state, workspaces: this.state.workspaces.map(w => w.id === ws.id ? next : w) });
        return next;
    }

    activate(ref) {
        const ws = this.list().find(w => w.id === this.find(ref).id);
        if (!ws.enabled) throw new Error('工作区已停用或不再授权');
        this.save({ ...this.state, activeId: ws.id });
        return ws;
    }
}

module.exports = { BackendWorkspaceService, realLocation, assertInsideReal, parseRoots, safePath };