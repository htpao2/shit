const { Client, GatewayIntentBits, Events, AttachmentBuilder } = require('discord.js');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const axios = require('axios');
const readline = require('readline');

// ============================================
// 全局配置和状态
// ============================================

let config = {};
let debugMode = false;
let client = null;
let heartbeatTimer = null;
let foldOutputTimer = null;
let reconnectTimer = null;
let stopped = false;
let connecting = false;
let retryCount = 0;

// 连接状态
let readyUser = null;
let lastConnectedAt = null;
let lastDisconnectedAt = null;
let lastError = null;

// 消息队列和历史
let messageQueue = [];
let channelHistories = new Map();
let processingLocks = new Set();

// 统计数据
let stats = {
    totalReceived: 0,
    totalSent: 0,
    totalPokes: 0,
    startTime: Date.now()
};

// ============================================
// 工具函数
// ============================================

function log(...args) {
    if (debugMode) console.error('[VCPDiscordBot]', ...args);
}

function warn(...args) {
    console.error('[VCPDiscordBot]', ...args);
}

function normalizeBoolean(value, fallback = false) {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'boolean') return value;
    return String(value).trim().toLowerCase() === 'true';
}

function normalizeInteger(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function splitList(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.map(String).map(v => v.trim()).filter(Boolean);
    return String(value).split(/[,;\n]/).map(v => v.trim()).filter(Boolean);
}

function escapeMd(value) {
    return String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function truncateInline(value, max) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    return text.length > max ? `${text.slice(0, max)}...` : text;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// 数据持久化
// ============================================

function getDataDir() {
    return path.join(__dirname, 'data');
}

async function ensureDataDir() {
    try {
        await fsp.mkdir(getDataDir(), { recursive: true });
    } catch (e) {
        // 目录已存在
    }
}

async function saveCache() {
    try {
        await ensureDataDir();
        const cacheData = {
            lastUpdate: new Date().toISOString(),
            messageQueue,
            stats,
            lastError
        };
        await fsp.writeFile(
            path.join(getDataDir(), 'message-cache.json'),
            JSON.stringify(cacheData, null, 2)
        );
    } catch (error) {
        warn('保存缓存失败:', error.message);
    }
}

async function loadCache() {
    try {
        const cachePath = path.join(getDataDir(), 'message-cache.json');
        if (fs.existsSync(cachePath)) {
            const data = JSON.parse(await fsp.readFile(cachePath, 'utf8'));
            if (data.messageQueue) messageQueue = data.messageQueue;
            if (data.stats) stats = { ...stats, ...data.stats };
            log('已加载缓存数据');
        }
    } catch (error) {
        warn('加载缓存失败:', error.message);
    }
}

// ============================================
// 消息队列管理
// ============================================

function addToQueue(message) {
    const maxSize = normalizeInteger(config.MaxQueueSize, 1000);
    const maxAge = 24 * 60 * 60 * 1000; // 24小时
    
    messageQueue.push({
        id: message.id,
        channelId: message.channel.id,
        channelName: message.channel.name || 'DM',
        guildName: message.guild?.name || 'Private',
        author: message.author.username,
        authorId: message.author.id,
        content: message.content,
        timestamp: Date.now(),
        mentions: message.mentions.users.map(u => u.username),
        hasAttachments: message.attachments.size > 0
    });
    
    stats.totalReceived++;
    
    // 按大小裁剪
    if (messageQueue.length > maxSize) {
        messageQueue = messageQueue.slice(-maxSize);
    }
    
    // 按时效清理
    const now = Date.now();
    messageQueue = messageQueue.filter(msg => now - msg.timestamp < maxAge);
}

function removeFromQueue(messageId) {
    messageQueue = messageQueue.filter(msg => msg.id !== messageId);
}

function clearQueue() {
    messageQueue = [];
}

function getMessageFromQueue(messageId) {
    return messageQueue.find(msg => msg.id === messageId);
}

// ============================================
// 会话历史管理（参考 VCPQQBotServer）
// ============================================

function appendHistory(channelId, message) {
    const key = String(channelId);
    const history = channelHistories.get(key) || [];
    history.push(message);
    
    const maxTurns = normalizeInteger(config.HistoryTurns, 8);
    const maxMessages = Math.max(2, maxTurns * 2);
    channelHistories.set(key, history.slice(-maxMessages));
}

function getHistory(channelId) {
    return channelHistories.get(String(channelId)) || [];
}

// ============================================
// AI 主动唤醒功能（核心创新）
// ============================================

async function pokeAgent(message, reason = 'mention') {
    const port = config.PORT;
    const key = config.Key;
    const agentName = config.AgentName || 'AI管家';
    
    if (!port || !key) {
        warn('缺少 VCP PORT 或 Key，无法唤醒 Agent');
        return;
    }
    
    const payload = `<<<[TOOL_REQUEST]>>>
maid:「始」VCP系统「末」,
tool_name:「始」AgentAssistant「末」,
agent_name:「始」${agentName}「末」,
prompt:「始」[Discord实时提醒:] ${reason === 'mention' ? `${message.author.username} 在 #${message.channel.name} 频道 @ 了你` : `#${message.channel.name} 频道有新消息`}，消息内容："${message.content}"。请查看 Discord 消息面板并使用 VCPDiscordBot 工具决定如何回复。「末」,
temporary_contact:「始」true「末」,
<<<[END_TOOL_REQUEST]>>>`;
    
    try {
        await axios.post(`http://127.0.0.1:${port}/v1/human/tool`, payload, {
            headers: {
                'Content-Type': 'text/plain;charset=UTF-8',
                'Authorization': `Bearer ${key}`
            },
            timeout: 10000
        });
        
        stats.totalPokes++;
        log(`成功唤醒 Agent: ${reason}, 消息ID: ${message.id}`);
    } catch (error) {
        warn('主动唤醒 Agent 失败:', error.message);
    }
}

// ============================================
// 折叠协议输出（保留双插件优势）
// ============================================

function buildDetailedMessageList() {
    if (messageQueue.length === 0) {
        return '【Discord 消息面板】当前无未读消息。';
    }
    
    const lines = ['【Discord 详细消息面板】\n'];
    messageQueue.slice(-20).forEach((msg, index) => {
        const time = new Date(msg.timestamp).toLocaleString('zh-CN');
        const mentions = msg.mentions.length > 0 ? ` (@${msg.mentions.join(', ')})` : '';
        lines.push(`${index + 1}. [${time}] #${msg.channelName} - ${msg.author}: ${msg.content}${mentions} (ID: ${msg.id})`);
    });
    
    return lines.join('\n');
}

function buildSummary() {
    if (messageQueue.length === 0) {
        return '【Discord 消息摘要】当前无未读消息。';
    }
    
    const mentionCount = messageQueue.filter(msg => 
        client && msg.mentions.includes(client.user.username)
    ).length;
    
    let summary = `【Discord 消息摘要】当前有 ${messageQueue.length} 条未读消息`;
    if (mentionCount > 0) {
        summary += `，其中 ${mentionCount} 条提到了你`;
    }
    summary += '。';
    
    return summary;
}

function buildMinimalStatus() {
    const status = client && client.user ? 'connected' : 'disconnected';
    return `【Discord】状态: ${status}, 未读: ${messageQueue.length}`;
}

function outputFoldProtocol() {
    const output = {
        vcp_dynamic_fold: true,
        plugin_description: "Discord 实时消息监控。包含频道聊天、私信和 @ 提醒。提供毫秒级响应和主动 AI 唤醒。",
        fold_blocks: [
            { threshold: 0.5, content: buildDetailedMessageList() },
            { threshold: 0.35, content: buildSummary() },
            { threshold: 0.0, content: buildMinimalStatus() }
        ]
    };
    
    console.log(JSON.stringify(output));
}

function startFoldOutputLoop() {
    stopFoldOutputLoop();
    const interval = normalizeInteger(config.FoldOutputInterval, 10000);
    
    foldOutputTimer = setInterval(() => {
        outputFoldProtocol();
    }, interval);
    
    if (foldOutputTimer.unref) foldOutputTimer.unref();
    log(`折叠协议输出已启动，间隔: ${interval}ms`);
}

function stopFoldOutputLoop() {
    if (foldOutputTimer) {
        clearInterval(foldOutputTimer);
        foldOutputTimer = null;
    }
}

// ============================================
// Discord Gateway 连接管理（参考 VCPQQBotServer）
// ============================================

async function connectDiscord() {
    if (stopped || connecting) return;
    if (client && client.isReady()) return;
    
    connecting = true;
    
    try {
        client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.DirectMessages
            ]
        });
        
        setupEventHandlers();
        
        await client.login(config.DISCORD_BOT_TOKEN);
        
        lastConnectedAt = new Date().toISOString();
        lastError = null;
        retryCount = 0;
        connecting = false;
        
        log('Discord 客户端已连接');
    } catch (error) {
        connecting = false;
        lastError = error.message;
        warn('Discord 连接失败:', error.message);
        scheduleReconnect(error.message);
    }
}

function setupEventHandlers() {
    client.once(Events.ClientReady, async (readyClient) => {
        readyUser = {
            id: readyClient.user.id,
            username: readyClient.user.username,
            tag: readyClient.user.tag
        };
        
        log(`Discord Bot 已登录: ${readyClient.user.tag}`);
        
        // 启动折叠协议输出
        startFoldOutputLoop();
        
        // 加载缓存数据
        await loadCache();
        
        // 定期保存缓存
        setInterval(saveCache, 60000); // 每分钟保存一次
    });
    
    client.on(Events.MessageCreate, handleMessage);
    
    client.on(Events.Error, (error) => {
        lastError = error.message;
        warn('Discord 客户端错误:', error.message);
    });
    
    client.on(Events.Disconnect, () => {
        lastDisconnectedAt = new Date().toISOString();
        log('Discord 客户端已断开');
        if (!stopped) scheduleReconnect('disconnect');
    });
}

async function handleMessage(message) {
    // 忽略 bot 消息
    if (message.author.bot) return;
    
    // 添加到队列
    addToQueue(message);
    
    // 检查是否需要主动唤醒
    const isMentioned = message.mentions.has(client.user.id);
    const importantChannels = splitList(config.ImportantChannels);
    const isImportantChannel = importantChannels.includes(message.channel.id);
    
    const autoPokeOnMention = normalizeBoolean(config.AutoPokeOnMention, true);
    const autoPokeOnImportantChannel = normalizeBoolean(config.AutoPokeOnImportantChannel, true);
    
    if (isMentioned && autoPokeOnMention) {
        await pokeAgent(message, 'mention');
    } else if (isImportantChannel && autoPokeOnImportantChannel) {
        await pokeAgent(message, 'important_channel');
    }
    
    // 立即输出一次折叠协议（确保 AI 能快速看到）
    outputFoldProtocol();
}

function scheduleReconnect(reason) {
    if (stopped) return;
    
    const delays = [1000, 2000, 5000, 10000, 30000, 60000];
    const delay = delays[Math.min(retryCount, delays.length - 1)];
    retryCount++;
    
    warn(`将在 ${delay}ms 后重连 Discord，原因: ${reason}`);
    
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connectDiscord().catch(error => {
            warn('重连失败:', error.message);
        });
    }, delay);
    
    if (reconnectTimer.unref) reconnectTimer.unref();
}

function disconnect() {
    stopped = true;
    stopFoldOutputLoop();
    
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
    
    if (client) {
        try {
            client.destroy();
        } catch (e) {
            // 忽略断开错误
        }
        client = null;
    }
}

// ============================================
// 工具调用接口（同步插件标准）
// ============================================

async function sendMessage(params) {
    const { channelId, content, imageUrl } = params;
    
    if (!channelId) throw new Error('缺少 channelId 参数');
    if (!content && !imageUrl) throw new Error('必须提供 content 或 imageUrl');
    
    if (!client || !client.isReady()) {
        throw new Error('Discord 客户端未连接');
    }
    
    const channel = await client.channels.fetch(channelId);
    if (!channel) throw new Error(`未找到频道: ${channelId}`);
    
    const messageOptions = {};
    if (content) messageOptions.content = content;
    
    if (imageUrl) {
        try {
            const response = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 30000 });
            const buffer = Buffer.from(response.data);
            const filename = path.basename(new URL(imageUrl).pathname) || 'image.png';
            messageOptions.files = [new AttachmentBuilder(buffer, { name: filename })];
        } catch (error) {
            warn('下载图片失败，将仅发送文本:', error.message);
        }
    }
    
    const sentMessage = await channel.send(messageOptions);
    stats.totalSent++;
    
    return {
        content: [{
            type: 'text',
            text: `# Discord 消息发送成功\n\n- 频道: ${channel.name}\n- 消息ID: ${sentMessage.id}\n- 内容: ${content || '(图片)'}\n- 时间: ${new Date().toLocaleString('zh-CN')}`
        }],
        meta: {
            plugin: 'VCPDiscordBot',
            command: 'send_message',
            channelId,
            messageId: sentMessage.id
        }
    };
}

async function replyMessage(params) {
    const { messageId, content, imageUrl } = params;
    
    if (!messageId) throw new Error('缺少 messageId 参数');
    if (!content && !imageUrl) throw new Error('必须提供 content 或 imageUrl');
    
    if (!client || !client.isReady()) {
        throw new Error('Discord 客户端未连接');
    }
    
    // 从队列中查找消息信息
    const queuedMsg = getMessageFromQueue(messageId);
    if (!queuedMsg) {
        throw new Error(`未在消息队列中找到消息ID: ${messageId}。可能已被清空或过期。`);
    }
    
    const channel = await client.channels.fetch(queuedMsg.channelId);
    if (!channel) throw new Error(`未找到频道: ${queuedMsg.channelId}`);
    
    const originalMessage = await channel.messages.fetch(messageId);
    if (!originalMessage) throw new Error(`未找到原始消息: ${messageId}`);
    
    const messageOptions = { reply: { messageReference: originalMessage } };
    if (content) messageOptions.content = content;
    
    if (imageUrl) {
        try {
            const response = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 30000 });
            const buffer = Buffer.from(response.data);
            const filename = path.basename(new URL(imageUrl).pathname) || 'image.png';
            messageOptions.files = [new AttachmentBuilder(buffer, { name: filename })];
        } catch (error) {
            warn('下载图片失败，将仅发送文本:', error.message);
        }
    }
    
    const sentMessage = await originalMessage.reply(messageOptions);
    stats.totalSent++;
    
    // 从队列中移除已回复的消息
    removeFromQueue(messageId);
    
    return {
        content: [{
            type: 'text',
            text: `# Discord 回复成功\n\n- 频道: ${channel.name}\n- 原消息作者: ${queuedMsg.author}\n- 回复ID: ${sentMessage.id}\n- 内容: ${content || '(图片)'}\n- 时间: ${new Date().toLocaleString('zh-CN')}\n\n该消息已从未读队列中移除。`
        }],
        meta: {
            plugin: 'VCPDiscordBot',
            command: 'reply_message',
            messageId,
            replyId: sentMessage.id
        }
    };
}

async function listChannels() {
    if (!client || !client.isReady()) {
        throw new Error('Discord 客户端未连接');
    }
    
    const guilds = client.guilds.cache;
    const lines = ['# Discord 可用频道列表\n'];
    
    for (const [guildId, guild] of guilds) {
        lines.push(`## ${guild.name}\n`);
        const channels = guild.channels.cache.filter(ch => ch.isTextBased());
        
        lines.push('| 频道名称 | 频道ID | 类型 |');
        lines.push('|----------|--------|------|');
        
        for (const [channelId, channel] of channels) {
            lines.push(`| ${channel.name} | \`${channelId}\` | ${channel.type} |`);
        }
        
        lines.push('');
    }
    
    return {
        content: [{
            type: 'text',
            text: lines.join('\n')
        }],
        meta: {
            plugin: 'VCPDiscordBot',
            command: 'list_channels',
            guildCount: guilds.size
        }
    };
}

function getStatus() {
    const uptime = Math.floor((Date.now() - stats.startTime) / 1000);
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = uptime % 60;
    
    const lines = [
        '# VCPDiscordBot 状态报告\n',
        '## 连接状态',
        '',
        `- Discord 客户端: ${client && client.isReady() ? '✅ 已连接' : '❌ 未连接'}`,
        `- Bot 用户: ${readyUser ? `${readyUser.username}#${readyUser.tag}` : '未知'}`,
        `- 最近连接: ${lastConnectedAt || '从未连接'}`,
        `- 最近断开: ${lastDisconnectedAt || '从未断开'}`,
        `- 重试次数: ${retryCount}`,
        `- 最近错误: ${lastError || '无'}`,
        '',
        '## 消息统计',
        '',
        `- 未读消息: ${messageQueue.length}`,
        `- 总接收: ${stats.totalReceived}`,
        `- 总发送: ${stats.totalSent}`,
        `- 总唤醒: ${stats.totalPokes}`,
        `- 运行时长: ${hours}小时${minutes}分${seconds}秒`,
        '',
        '## 配置信息',
        '',
        `- Agent 名称: ${config.AgentName || 'AI管家'}`,
        `- 历史轮数: ${config.HistoryTurns || 8}`,
        `- 队列容量: ${config.MaxQueueSize || 1000}`,
        `- 折叠输出间隔: ${config.FoldOutputInterval || 10000}ms`,
        `- 自动唤醒(@): ${normalizeBoolean(config.AutoPokeOnMention, true) ? '启用' : '禁用'}`,
        `- 自动唤醒(重要频道): ${normalizeBoolean(config.AutoPokeOnImportantChannel, true) ? '启用' : '禁用'}`,
        `- 重要频道数: ${splitList(config.ImportantChannels).length}`
    ];
    
    return {
        content: [{
            type: 'text',
            text: lines.join('\n')
        }],
        meta: {
            plugin: 'VCPDiscordBot',
            command: 'status',
            connected: client && client.isReady()
        }
    };
}

async function processToolCall(params) {
    const command = String(params.command || 'status').trim();
    
    switch (command) {
        case 'send_message':
            return await sendMessage(params);
        
        case 'reply_message':
            return await replyMessage(params);
        
        case 'list_channels':
            return await listChannels();
        
        case 'clear_queue':
            clearQueue();
            return {
                content: [{
                    type: 'text',
                    text: '# Discord 消息队列已清空\n\n所有未读消息已被移除。'
                }],
                meta: {
                    plugin: 'VCPDiscordBot',
                    command: 'clear_queue'
                }
            };
        
        case 'status':
            return getStatus();
        
        default:
            throw new Error(`未知指令: ${command}`);
    }
}

// ============================================
// 主程序入口
// ============================================

async function initialize(initialConfig = {}) {
    config = initialConfig || {};
    debugMode = normalizeBoolean(config.DebugMode, false);
    
    if (!config.DISCORD_BOT_TOKEN) {
        lastError = '缺少 DISCORD_BOT_TOKEN，插件无法启动';
        warn(lastError);
        return;
    }
    
    log('VCPDiscordBot 初始化完成');
    
    // 连接 Discord
    await connectDiscord();
}

async function shutdown() {
    log('正在关闭 VCPDiscordBot...');
    disconnect();
    await saveCache();
}

// stdin 监听（同步插件标准接口）
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});

rl.on('line', async (line) => {
    try {
        const request = JSON.parse(line);
        const result = await processToolCall(request);
        console.log(JSON.stringify({ status: 'success', result }));
    } catch (error) {
        console.log(JSON.stringify({ 
            status: 'error', 
            error: error.message,
            stack: debugMode ? error.stack : undefined
        }));
    }
});

// 优雅退出
process.on('SIGINT', async () => {
    await shutdown();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    await shutdown();
    process.exit(0);
});

// 启动插件
(async () => {
    try {
        // 从环境变量加载配置（由 Plugin.js 注入）
        const envConfig = {
            DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN,
            AgentName: process.env.AgentName,
            ImportantChannels: process.env.ImportantChannels,
            HistoryTurns: process.env.HistoryTurns,
            MaxQueueSize: process.env.MaxQueueSize,
            FoldOutputInterval: process.env.FoldOutputInterval,
            AutoPokeOnMention: process.env.AutoPokeOnMention,
            AutoPokeOnImportantChannel: process.env.AutoPokeOnImportantChannel,
            DebugMode: process.env.DebugMode,
            PORT: process.env.PORT,
            Key: process.env.Key
        };
        
        await initialize(envConfig);
    } catch (error) {
        warn('初始化失败:', error.message);
        process.exit(1);
    }
})();

module.exports = {
    initialize,
    processToolCall,
    shutdown
};
