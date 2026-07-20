'use strict';

const assert = require('assert');
const path = require('path');

async function run() {
    const manifest = require('./plugin-manifest.json');
    assert.strictEqual(manifest.pluginType, 'hybridservice');
    assert.strictEqual(manifest.communication?.protocol, 'direct');
    assert.strictEqual(manifest.entryPoint?.script, 'VCPDiscordBot.js');
    assert.ok(Array.isArray(manifest.capabilities?.systemPromptPlaceholders));
    assert.deepStrictEqual(
        manifest.capabilities.systemPromptPlaceholders.map(item => item.placeholder).sort(),
        ['{{VCPDiscordBotStatus}}', '{{VCPDiscordRecentMessages}}'].sort()
    );

    const plugin = require('./VCPDiscordBot.js');
    assert.strictEqual(typeof plugin.initialize, 'function');
    assert.strictEqual(typeof plugin.processToolCall, 'function');
    assert.strictEqual(typeof plugin.shutdown, 'function');

    const originalRootConfigPath = process.env.VCP_ROOT_CONFIG_PATH;
    process.env.VCP_ROOT_CONFIG_PATH = path.resolve(__dirname, '..', '..', 'vcpconfig.env.example');
    const standaloneConfig = plugin._private.loadStandaloneConfig();
    assert.strictEqual(standaloneConfig.PORT, '6005');
    assert.ok(standaloneConfig.Key);
    if (originalRootConfigPath === undefined) delete process.env.VCP_ROOT_CONFIG_PATH;
    else process.env.VCP_ROOT_CONFIG_PATH = originalRootConfigPath;

    const staticPlaceholderValues = new Map();
    await plugin.initialize({
        PORT: '6005',
        Key: 'test-key',
        DISCORD_BOT_TOKEN: '',
        DebugMode: 'false'
    }, {
        pluginManager: { staticPlaceholderValues }
    });

    assert.ok(staticPlaceholderValues.has('{{VCPDiscordBotStatus}}'));
    assert.ok(staticPlaceholderValues.has('{{VCPDiscordRecentMessages}}'));

    const status = await plugin.processToolCall({ command: 'status' });
    const statusText = status.content.find(part => part.type === 'text')?.text || '';
    assert.match(statusText, /VCP 托管 hybridservice/);
    assert.match(statusText, /VCP PORT: 6005/);
    assert.match(statusText, /VCP Key: FOUND/);
    assert.match(statusText, /Discord Token: NOT_FOUND/);

    await plugin.processToolCall({ command: 'clear_queue' });
    await plugin.shutdown();

    console.log('VCPDiscordBot lifecycle tests passed.');
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
