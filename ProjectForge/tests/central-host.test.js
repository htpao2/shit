'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const Module = require('node:module');
const base = path.resolve(__dirname, '../../..');
const plugin = path.resolve(__dirname, '..');

test('real central loader, direct execution bridge, static stdout parsing and hot reload (isolated host dependencies)', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-host-'));
    const root = path.join(tmp, 'workspace');
    fs.mkdirSync(root);
    const originalFs = fs.promises;
    const fsShim = new Proxy(originalFs, {
        get(target, key) {
            if (key === 'readdir') return async (dir, options) => {
                const rows = await target.readdir(dir, options);
                return path.resolve(dir) === path.join(base, 'Plugin')
                    ? rows.filter(row => ['ProjectForge', 'ProjectForgeStatus'].includes(row.name || row)) : rows;
            };
            if (key === 'readFile') return async (file, ...args) => {
                if (path.resolve(file) === path.join(plugin, 'config.env')) {
                    return `ALLOWED_DIRECTORIES=${JSON.stringify([root])}\nDEFAULT_WORKSPACE_PATH=${root}\n`;
                }
                return target.readFile(file, ...args);
            };
            return target[key];
        },
    });
    const stubs = {
        './FileFetcherServer.js': { resolveFileUrl() { throw new Error('no file URLs expected'); } },
        './modules/captchaDecoder': { getAuthCode: async () => null },
        './modules/toolApprovalManager': class {
            getApprovalDecision() { return { requiresApproval: false }; }
            getPrivacyProtectionConfig() { return { enabled: false }; }
        },
        './modules/toolCallRecordStore': { beginRecord: () => null, finishRecord() {} },
        './modules/jevThirdPartyRegistry': {
            reloadConfig() {}, build: () => ({ total: 0 }), getSnapshot: () => ({}),
        },
        './jevClient': {},
        'chokidar': {},
        'express': { Router() { throw new Error('no routes expected'); } },
        'node-schedule': { scheduleJob: () => ({ cancel() {} }) },
        'dotenv': {
            parse: text => Object.fromEntries(String(text).split(/\r?\n/).filter(Boolean).map(line => {
                const split = line.indexOf('=');
                return [line.slice(0, split), line.slice(split + 1)];
            })),
        },
    };
    const cache = new Map();
    function loadCentral(file) {
        file = path.resolve(file);
        if (cache.has(file)) return cache.get(file).exports;
        const mod = new Module(file);
        mod.filename = file;
        mod.paths = Module._nodeModulePaths(plugin);
        cache.set(file, mod);
        const nativeRequire = Module.createRequire(file);
        mod.require = request => {
            if (Object.hasOwn(stubs, request)) return stubs[request];
            if (request === 'fs') return file === path.join(base, 'Plugin.js') ? { ...fs, promises: fsShim } : fs;
            if (request.startsWith('./modules/') || request === './modules/pluginBridgeRegistry') {
                return loadCentral(path.resolve(path.dirname(file), `${request}.js`));
            }
            return nativeRequire(request);
        };
        mod._compile(fs.readFileSync(file, 'utf8'), file);
        return mod.exports;
    }
    const manager = loadCentral(path.join(base, 'Plugin.js'));
    manager.setProjectBasePath(tmp);
    try {
        await manager.loadPlugins();
        assert.equal(manager.plugins.size, 2);
        assert.ok(manager.getServiceModule('ServerProjectForge'));
        assert.match(manager.getIndividualPluginDescriptions().get('VCPServerProjectForge'), /RegisterWorkspace/);
        const created = await manager.processToolCall('ServerProjectForge', { command: 'CreateProject', name: 'host', dir: 'app', maid: 'HostAgent' });
        assert.ok(created.details.project.id);
        assert.equal(created.MaidName, 'HostAgent');
        assert.ok(created.timestamp);
        const projectId = created.details.project.id;
        await manager.processToolCall('ServerProjectForge', {
            command: 'CreateFile', projectId, path: 'a.txt', content: 'host test', reason: 'integration',
        });
        const staticManifest = manager.getPlugin('ServerProjectForgeStatus');
        await manager._updateStaticPluginValue(staticManifest);
        const folded = manager.getPlaceholderValue('VCPServerProjectForgeStatus');
        assert.equal(folded.vcp_dynamic_fold, true);
        assert.match(folded.fold_blocks[0].content, /host/);
        assert.equal(folded.fold_blocks.at(-1).threshold, 0);
        await manager.loadPlugins(); // Calls shutdown(config, dependencies) and reinitializes the same module.
        const listed = await manager.processToolCall('ServerProjectForge', { command: 'ListProjects' });
        assert.ok(listed.details.projects.some(p => p.id === projectId));
    } finally {
        await manager.shutdownAllPlugins();
        await assert.rejects(manager.getServiceModule('ServerProjectForge').processToolCall({ command: 'ListProjects' }), /not initialized/);
        fs.rmSync(tmp, { recursive: true, force: true });
    }
});