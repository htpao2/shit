'use strict';

const { Client, GatewayIntentBits, Events, AttachmentBuilder, Partials } = require('discord.js');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const axios = require('axios');

const STATUS_PLACEHOLDER = '{{VCPDiscordBotStatus}}';
const RECENT_PLACEHOLDER = '{{VCPDiscordRecentMessages}}';

// ============================================
// 全局配置和状态
// ============================================

let config = {};
let debugMode = false;
let client = null;
let pluginManagerRef = null;
let placeholderTimer = null;
let cacheTimer = null;
let reconnectTimer = null;
let stopped = false;
let connecting = false;
let retryCount = 0;

// 连接状态
let readyUser = null;
let lastConnectedAt = null;
let lastDisconnectedAt = null;
let lastError = null;
let lastAgentDispatchTransport = null;

// 待处理消息队列与频道上下文缓存
let messageQueue = [];
let channelHistoryCache = new Map();
const CHANNEL_HISTORY_LIMIT = 20;
const MAX_CONTEXT_CHARS = 24000;

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

function maskSecret(value) {
    const text = String(value || '');
    if (!text) return 'NOT_FOUND';
    if (text.length <= 4) return '*'.repeat(text.length);
    return `${text.slice(0, 2)}***${text.slice(-2)}`;
}

function resolvePluginManager(injectedDependencies = {}) {
    if (injectedDependencies.pluginManager) return injectedDependencies.pluginManager;
    try {
        return require('../../Plugin.js');
    } catch (error) {
        log('PluginManager 在独立测试模式下不可用:', error.message);
        return null;
    }
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
            channelHistoryCache: Object.fromEntries(channelHistoryCache),
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
            if (data.channelHistoryCache && typeof data.channelHistoryCache === 'object') {
                channelHistoryCache = new Map(Object.entries(data.channelHistoryCache));
            }
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

function normalizeHistoryMessage(message) {
    return {
        id: String(message.id || ''),
        author: message.author?.username || message.author || 'unknown',
        authorId: message.author?.id || message.authorId || '',
        isBot: Boolean(message.author?.bot || message.isBot),
        content: String(message.content || '').trim(),
        timestamp: message.createdTimestamp || message.timestamp || Date.now(),
        channelId: String(message.channelId || message.channel?.id || '')
    };
}

function mergeChannelHistory(channelId, messages) {
    const key = String(channelId);
    const previous = channelHistoryCache.get(key) || [];
    const merged = new Map(previous.map(item => [String(item.id), item]));
    for (const message of messages || []) {
        const normalized = normalizeHistoryMessage(message);
        if (normalized.id && normalized.content) merged.set(normalized.id, normalized);
    }
    const result = Array.from(merged.values())
        .sort((a, b) => Number(a.timestamp) - Number(b.timestamp))
        .slice(-CHANNEL_HISTORY_LIMIT);
    channelHistoryCache.set(key, result);
    return result;
}

async function fetchChannelHistory(channelId) {
    const cached = channelHistoryCache.get(String(channelId)) || [];
    if (!client || !client.isReady()) return cached;
    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel?.messages?.fetch) return cached;
        const fetched = await channel.messages.fetch({ limit: CHANNEL_HISTORY_LIMIT });
        return mergeChannelHistory(channelId, Array.from(fetched.values()));
    } catch (error) {
        log(`读取 Discord 频道历史失败，使用缓存: channel=${channelId}, error=${error.message}`);
        return cached;
    }
}

async function fetchReferencedMessage(message) {
    const referencedId = message.reference?.messageId;
    if (!referencedId) return null;

    try {
        const channel = message.channel?.messages?.fetch
            ? message.channel
            : await client?.channels?.fetch(message.channel?.id);
        if (!channel?.messages?.fetch) return null;
        return await channel.messages.fetch(referencedId);
    } catch (error) {
        log(`读取被引用 Discord 消息失败: messageId=${referencedId}, error=${error.message}`);
        return null;
    }
}

function formatChannelHistory(history) {
    const lines = history.map((item, index) => {
        const time = new Date(item.timestamp).toLocaleString('zh-CN');
        const role = item.isBot ? 'Bot' : '用户';
        return `${index + 1}. [${time}] ${role} ${item.author} (messageId=${item.id}): ${item.content}`;
    });
    const text = lines.join('\n');
    return text.length > MAX_CONTEXT_CHARS ? text.slice(-MAX_CONTEXT_CHARS) : text;
}

function rememberBotMessage(channelId, messageId, content) {
    if (!channelId || !messageId || !content) return;
    mergeChannelHistory(channelId, [{
        id: messageId,
        author: readyUser?.username || 'VCPDiscordBot',
        authorId: readyUser?.id || '',
        isBot: true,
        content,
        timestamp: Date.now(),
        channelId
    }]);
}

// ============================================
// AI 主动唤醒功能（核心创新）
// ============================================

async function pokeAgent(message, reason = 'mention') {
    const port = config.PORT;
    const key = config.Key;
    const agentName = config.AgentName || 'AI管家';
    const channelName = message.channel.name || '私信';
    mergeChannelHistory(message.channel.id, [message]);
    let history = await fetchChannelHistory(message.channel.id);
    const referencedMessage = await fetchReferencedMessage(message);
    if (referencedMessage) {
        history = mergeChannelHistory(message.channel.id, [...history, referencedMessage]);
    }
    const historyText = formatChannelHistory(history) || '(当前频道暂无可读取的历史消息)';
    const referencedText = referencedMessage
        ? `\n\n【本次消息明确回复的消息（即使早于最近 ${CHANNEL_HISTORY_LIMIT} 条也必须参考）】\n${formatChannelHistory([referencedMessage])}`
        : '';
    const prompt = `[Discord实时提醒:] ${reason === 'mention' ? `${message.author.username} 在 #${channelName} @ 了你` : `#${channelName} 有新消息`}。

【当前消息】
消息 ID：${message.id}
频道 ID：${message.channel.id}
消息内容：“${message.content}”${referencedText}

【当前频道最近 ${CHANNEL_HISTORY_LIMIT} 条消息】
${historyText}

请基于以上频道上下文判断是否需要回复；如果当前消息是对某条历史消息的回复，优先结合“本次消息明确回复的消息”理解语义。如需回复，请调用 VCPDiscordBot 的 reply_message，使用当前消息 ID ${message.id}，不要只输出文字回复。`;

    try {
        if (typeof pluginManagerRef?.processToolCall === 'function') {
            lastAgentDispatchTransport = 'plugin-manager-direct';
            await pluginManagerRef.processToolCall('AgentAssistant', {
                maid: 'VCP系统',
                agent_name: agentName,
                prompt,
                temporary_contact: 'true',
                inject_tools: 'VCPDiscordBot'
            });
        } else {
            if (!port || !key) {
                throw new Error('独立测试模式缺少 VCP PORT 或 Key，无法使用 HTTP fallback 唤醒 Agent');
            }
            lastAgentDispatchTransport = 'http-fallback';
            const payload = `<<<[TOOL_REQUEST]>>>
maid:「始」VCP系统「末」,
tool_name:「始」AgentAssistant「末」,
agent_name:「始」${agentName}「末」,
prompt:「始」${prompt}「末」,
temporary_contact:「始」true「末」,
inject_tools:「始」VCPDiscordBot「末」,
<<<[END_TOOL_REQUEST]>>>`;
            await axios.post(`http://127.0.0.1:${port}/v1/human/tool`, payload, {
                headers: {
                    'Content-Type': 'text/plain;charset=UTF-8',
                    'Authorization': `Bearer ${key}`
                },
                timeout: normalizeInteger(config.AgentDispatchTimeoutMs, 300000)
            });
        }

        stats.totalPokes++;
        lastError = null;
        log(`成功唤醒 Agent: transport=${lastAgentDispatchTransport}, reason=${reason}, messageId=${message.id}`);
    } catch (error) {
        const detail = error.response?.data
            ? `${error.message}; response=${JSON.stringify(error.response.data)}`
            : error.message;
        lastError = `Agent 唤醒失败 (${lastAgentDispatchTransport || 'unknown'}): ${detail}`;
        updatePlaceholders();
        warn(lastError);
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

function buildStatusPlaceholderText() {
    return [
        '# VCPDiscordBot 状态',
        '',
        `- Gateway：${client?.isReady() ? 'connected' : connecting ? 'connecting' : 'disconnected'}`,
        `- Bot：${readyUser ? `${readyUser.tag} (${readyUser.id})` : '未知'}`,
        `- VCP PORT：${config.PORT || 'NOT_FOUND'}`,
        `- VCP Key：${config.Key ? 'FOUND' : 'NOT_FOUND'}`,
        `- Discord Token：${config.DISCORD_BOT_TOKEN ? 'FOUND' : 'NOT_FOUND'}`,
        `- 最近连接：${lastConnectedAt || '无'}`,
        `- 最近断开：${lastDisconnectedAt || '无'}`,
        `- Agent 投递链路：${lastAgentDispatchTransport || '尚未触发'}`,
        `- 最近错误：${lastError || '无'}`,
        `- 待处理消息：${messageQueue.length}`,
        `- 总接收/发送/唤醒：${stats.totalReceived}/${stats.totalSent}/${stats.totalPokes}`
    ].join('\n');
}

function updatePlaceholders() {
    if (!pluginManagerRef?.staticPlaceholderValues) return;
    pluginManagerRef.staticPlaceholderValues.set(STATUS_PLACEHOLDER, {
        value: buildStatusPlaceholderText(),
        serverId: 'local'
    });
    pluginManagerRef.staticPlaceholderValues.set(RECENT_PLACEHOLDER, {
        value: buildDetailedMessageList(),
        serverId: 'local'
    });
}

function startPlaceholderLoop() {
    stopPlaceholderLoop();
    const interval = normalizeInteger(config.FoldOutputInterval, 10000);
    updatePlaceholders();
    placeholderTimer = setInterval(updatePlaceholders, interval);
    if (placeholderTimer.unref) placeholderTimer.unref();
    log(`动态占位符刷新已启动，间隔: ${interval}ms`);
}

function stopPlaceholderLoop() {
    if (placeholderTimer) {
        clearInterval(placeholderTimer);
        placeholderTimer = null;
    }
}

// ============================================
// Discord Gateway 连接管理（参考 VCPQQBotServer）
// ============================================

async function connectDiscord() {
    if (stopped || connecting) return;
    if (client && client.isReady()) return;

    if (client) {
        try { client.destroy(); } catch (_) {}
        client = null;
    }
    connecting = true;
    
    try {
        client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.DirectMessages
            ],
            partials: [Partials.Channel]
        });
        
        setupEventHandlers();
        
        await client.login(config.DISCORD_BOT_TOKEN);
        
        lastConnectedAt = new Date().toISOString();
        lastError = null;
        retryCount = 0;
        connecting = false;
        
        console.log('[VCPDiscordBot] Discord Gateway 登录请求已完成，等待 ClientReady。');
    } catch (error) {
        connecting = false;
        lastError = error.message;
        if (client) {
            try { client.destroy(); } catch (_) {}
            client = null;
        }
        warn('Discord 连接失败:', error.message);
        updatePlaceholders();
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
        
        console.log(`[VCPDiscordBot] Discord Gateway 已就绪: bot=${readyClient.user.tag}, guilds=${readyClient.guilds.cache.size}`);
        updatePlaceholders();
    });
    
    client.on(Events.MessageCreate, handleMessage);
    
    client.on(Events.Error, (error) => {
        lastError = error.message;
        warn('Discord 客户端错误:', error.message);
        updatePlaceholders();
    });
    
    client.on(Events.ShardDisconnect, () => {
        lastDisconnectedAt = new Date().toISOString();
        log('Discord Gateway 分片已断开');
        updatePlaceholders();
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
    
    updatePlaceholders();
    saveCache().catch(error => warn('消息到达后保存缓存失败:', error.message));
}

function scheduleReconnect(reason) {
    if (stopped || reconnectTimer) return;

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
    stopPlaceholderLoop();

    if (cacheTimer) {
        clearInterval(cacheTimer);
        cacheTimer = null;
    }
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
    rememberBotMessage(channelId, sentMessage.id, content || '(图片)');
    updatePlaceholders();
    saveCache().catch(error => warn('发送消息后保存缓存失败:', error.message));

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
    
    const sentMessage = await originalMessage.reply(messageOptions);
    stats.totalSent++;
    rememberBotMessage(queuedMsg.channelId, sentMessage.id, content || '(图片)');

    // 从队列中移除已回复的消息
    removeFromQueue(messageId);
    updatePlaceholders();
    saveCache().catch(error => warn('回复消息后保存缓存失败:', error.message));

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
        `- Bot 用户: ${readyUser ? readyUser.tag : '未知'}`,
        `- 最近连接: ${lastConnectedAt || '从未连接'}`,
        `- 最近断开: ${lastDisconnectedAt || '从未断开'}`,
        `- 重试次数: ${retryCount}`,
        `- Agent 投递链路: ${lastAgentDispatchTransport || '尚未触发'}`,
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
        '## 配置注入',
        '',
        `- 运行模式: ${pluginManagerRef ? 'VCP 托管 hybridservice' : '独立测试'}`,
        `- VCP PORT: ${config.PORT || 'NOT_FOUND'}`,
        `- VCP Key: ${config.Key ? 'FOUND（仅独立模式 HTTP fallback 使用）' : 'NOT_FOUND'}`,
        `- Discord Token: ${config.DISCORD_BOT_TOKEN ? 'FOUND' : 'NOT_FOUND'}`,
        `- Agent 名称: ${config.AgentName || 'AI管家'}`,
        `- 队列容量: ${config.MaxQueueSize || 1000}`,
        `- 占位符刷新间隔: ${config.FoldOutputInterval || 10000}ms`,
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
            updatePlaceholders();
            await saveCache();
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

async function initialize(initialConfig = {}, injectedDependencies = {}) {
    if (client || placeholderTimer || cacheTimer) await shutdown();

    config = { ...process.env, ...(initialConfig || {}) };
    debugMode = normalizeBoolean(config.DebugMode, false);
    stopped = false;
    connecting = false;
    retryCount = 0;
    pluginManagerRef = resolvePluginManager(injectedDependencies);

    await loadCache();
    startPlaceholderLoop();
    cacheTimer = setInterval(() => {
        saveCache().catch(error => warn('定时保存缓存失败:', error.message));
    }, 60000);
    if (cacheTimer.unref) cacheTimer.unref();

    console.log(
        `[VCPDiscordBot] 初始化: mode=${pluginManagerRef ? 'vcp-managed' : 'standalone'}, ` +
        `PORT=${config.PORT || 'NOT_FOUND'}, Key=${config.Key ? 'FOUND' : 'NOT_FOUND'}, ` +
        `DiscordToken=${maskSecret(config.DISCORD_BOT_TOKEN)}`
    );

    if (!config.DISCORD_BOT_TOKEN) {
        lastError = '缺少 DISCORD_BOT_TOKEN，插件不会连接 Discord Gateway';
        warn(lastError);
        updatePlaceholders();
        return;
    }

    await connectDiscord();
    updatePlaceholders();
}

async function shutdown() {
    log('正在关闭 VCPDiscordBot...');
    disconnect();
    await saveCache();
    pluginManagerRef = null;
}

function loadEnvFile(filePath) {
    if (!fs.existsSync(filePath)) return {};
    const dotenv = require('dotenv');
    return dotenv.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadStandaloneConfig() {
    const rootConfigPath = process.env.VCP_ROOT_CONFIG_PATH
        ? path.resolve(process.env.VCP_ROOT_CONFIG_PATH)
        : path.resolve(__dirname, '..', '..', 'config.env');
    const pluginConfigPath = path.join(__dirname, 'config.env');
    return {
        ...loadEnvFile(rootConfigPath),
        ...loadEnvFile(pluginConfigPath),
        ...process.env
    };
}

if (require.main === module) {
    process.once('SIGINT', async () => {
        await shutdown();
        process.exit(0);
    });
    process.once('SIGTERM', async () => {
        await shutdown();
        process.exit(0);
    });
    initialize(loadStandaloneConfig()).catch(error => {
        warn('独立测试初始化失败:', error.message);
        process.exitCode = 1;
    });
}

module.exports = {
    initialize,
    processToolCall,
    shutdown,
    _private: {
        loadStandaloneConfig,
        buildStatusPlaceholderText,
        buildDetailedMessageList,
        updatePlaceholders,
        pokeAgent,
        fetchChannelHistory,
        formatChannelHistory
    }
};
