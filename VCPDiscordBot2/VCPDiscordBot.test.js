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
    const directCalls = [];
    await plugin.initialize({
        PORT: '6005',
        Key: 'test-key',
        DISCORD_BOT_TOKEN: '',
        AgentName: 'Nova',
        DebugMode: 'false'
    }, {
        pluginManager: {
            staticPlaceholderValues,
            async processToolCall(name, args) {
                directCalls.push({ name, args });
                return { status: 'success' };
            }
        }
    });

    assert.ok(staticPlaceholderValues.has('{{VCPDiscordBotStatus}}'));
    assert.ok(staticPlaceholderValues.has('{{VCPDiscordRecentMessages}}'));

    const status = await plugin.processToolCall({ command: 'status' });
    const statusText = status.content.find(part => part.type === 'text')?.text || '';
    assert.match(statusText, /VCP 托管 hybridservice/);
    assert.match(statusText, /VCP PORT: 6005/);
    assert.match(statusText, /VCP Key: FOUND/);
    assert.match(statusText, /Discord Token: NOT_FOUND/);

    await plugin._private.pokeAgent({
        id: 'discord-message-1',
        content: '你好',
        author: { username: 'tester' },
        channel: { id: 'discord-channel-1', name: 'general' }
    }, 'mention');
    assert.strictEqual(directCalls.length, 1);
    assert.strictEqual(directCalls[0].name, 'AgentAssistant');
    assert.strictEqual(directCalls[0].args.agent_name, 'Nova');
    assert.strictEqual(directCalls[0].args.inject_tools, 'VCPDiscordBot');
    assert.match(directCalls[0].args.prompt, /discord-message-1/);

    const directStatus = await plugin.processToolCall({ command: 'status' });
    const directStatusText = directStatus.content.find(part => part.type === 'text')?.text || '';
    assert.match(directStatusText, /Agent 投递链路: plugin-manager-direct/);

    await plugin.processToolCall({ command: 'clear_queue' });
    await plugin.shutdown();

    console.log('VCPDiscordBot lifecycle tests passed.');
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
