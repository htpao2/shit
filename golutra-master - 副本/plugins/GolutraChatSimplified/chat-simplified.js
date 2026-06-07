/**
 * GolutraChatSimplified — VCP 同步插件入口
 *
 * 核心功能：简化的消息管理和历史记录查询
 * 移植自：
 *   - src/features/chat/chatStore.ts:172-198 (normalizeConversation)
 *   - src/features/chat/chatStore.ts:200-223 (normalizeMessage)
 *   - src/features/chat/chatStore.ts:225-238 (sortConversations)
 *   - src/features/chat/chatStore.ts:607-651 (sendMessage, MAX_MESSAGE_LENGTH=1200)
 *   - src/features/chat/chatStore.ts:490-516 (分页, MESSAGES_PAGE_LIMIT=200)
 *   - src/features/chat/chatStore.ts:251-280 (applyUnreadSync)
 *
 * 遵循 VCP 同步插件规范
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ─── 配置 ───────────────────────────────────────────────────

const MESSAGE_LIMIT = parseInt(process.env.MESSAGE_LIMIT) || 1000;
const MAX_MESSAGE_LENGTH = parseInt(process.env.MAX_MESSAGE_LENGTH) || 1200;
const MESSAGES_PAGE_LIMIT = parseInt(process.env.MESSAGES_PAGE_LIMIT) || 200;
const HISTORY_RETENTION_DAYS = parseInt(process.env.HISTORY_RETENTION_DAYS) || 30;
const CHAT_STORAGE_PATH = process.env.CHAT_STORAGE_PATH || 'chat-data.json';

// ─── 存储 ───────────────────────────────────────────────────

function resolveStoragePath() {
  if (path.isAbsolute(CHAT_STORAGE_PATH)) return CHAT_STORAGE_PATH;
  return path.resolve(process.cwd(), CHAT_STORAGE_PATH);
}

function loadChatData() {
  const filePath = resolveStoragePath();
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch { /* ignore */ }
  return { conversations: {}, messages: {} };
}

function saveChatData(data) {
  const filePath = resolveStoragePath();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// ─── 归一化函数 ──────────────────────────────────────────────
// 移植自 chatStore.ts

/**
 * 归一化对话
 * 移植自 chatStore.ts:172-198 normalizeConversation()
 */
function normalizeConversation(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    id: raw.id || crypto.randomUUID(),
    workspaceId: raw.workspaceId || '',
    name: String(raw.name || '').trim() || 'Unnamed',
    participants: Array.isArray(raw.participants) ? raw.participants : [],
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || new Date().toISOString(),
    lastMessagePreview: raw.lastMessagePreview || '',
    lastMessageAt: raw.lastMessageAt || null,
    unreadCount: parseInt(raw.unreadCount) || 0,
    archived: Boolean(raw.archived)
  };
}

/**
 * 归一化消息
 * 移植自 chatStore.ts:200-223 normalizeMessage()
 */
function normalizeMessage(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (!raw.content && !raw.text) return null;

  const content = String(raw.content || raw.text || '').substring(0, MAX_MESSAGE_LENGTH);

  return {
    id: raw.id || crypto.randomUUID(),
    conversationId: raw.conversationId || '',
    senderId: raw.senderId || raw.sender_id || '',
    senderName: raw.senderName || raw.sender_name || raw.senderId || '',
    content,
    type: raw.type || 'text',
    timestamp: raw.timestamp || new Date().toISOString(),
    edited: Boolean(raw.edited),
    metadata: raw.metadata || null
  };
}

/**
 * 对话排序
 * 移植自 chatStore.ts:225-238 sortConversations()
 * 按最后消息时间倒序排列
 */
function sortConversations(conversations) {
  return Object.values(conversations)
    .filter(Boolean)
    .sort((a, b) => {
      const timeA = a.lastMessageAt || a.updatedAt || a.createdAt;
      const timeB = b.lastMessageAt || b.updatedAt || b.createdAt;
      return new Date(timeB) - new Date(timeA);
    });
}

/**
 * 未读同步
 * 移植自 chatStore.ts:251-280 applyUnreadSync()
 */
function applyUnreadSync(conversation, readerId) {
  if (!conversation || !readerId) return conversation;
  conversation.unreadCount = 0;
  conversation.updatedAt = new Date().toISOString();
  return conversation;
}

// ─── 命令处理 ────────────────────────────────────────────────

function handleSendMessage(args) {
  const conversationId = args.conversationId || args.conversation_id;
  const content = args.content || args.text || args.message;
  const senderId = args.senderId || args.sender_id;
  const senderName = args.senderName || args.sender_name || senderId;

  if (!conversationId) return { status: 'error', result: '必须提供 conversationId 参数' };
  if (!content) return { status: 'error', result: '必须提供 content 参数' };
  if (!senderId) return { status: 'error', result: '必须提供 senderId 参数' };

  // 长度检查 — 移植自 chatStore.ts MAX_MESSAGE_LENGTH=1200
  if (content.length > MAX_MESSAGE_LENGTH) {
    return { status: 'error', result: `消息过长 (${content.length} 字符)，最大允许 ${MAX_MESSAGE_LENGTH} 字符` };
  }

  const data = loadChatData();

  // 确保对话存在
  if (!data.conversations[conversationId]) {
    data.conversations[conversationId] = normalizeConversation({
      id: conversationId,
      name: `Conversation ${conversationId.substring(0, 8)}`,
      createdAt: new Date().toISOString()
    });
  }

  // 确保消息列表存在
  if (!data.messages[conversationId]) {
    data.messages[conversationId] = [];
  }

  // 创建消息
  const message = normalizeMessage({
    conversationId,
    senderId,
    senderName,
    content,
    type: 'text',
    timestamp: new Date().toISOString()
  });

  // 添加消息
  data.messages[conversationId].push(message);

  // 消息数量限制 — 移植自 chatStore 的滚动窗口概念
  if (data.messages[conversationId].length > MESSAGE_LIMIT) {
    data.messages[conversationId] = data.messages[conversationId].slice(-MESSAGE_LIMIT);
  }

  // 更新对话最后消息
  const conv = data.conversations[conversationId];
  conv.lastMessagePreview = content.substring(0, 100);
  conv.lastMessageAt = message.timestamp;
  conv.updatedAt = message.timestamp;
  conv.unreadCount = (conv.unreadCount || 0) + 1;

  try {
    saveChatData(data);
  } catch (err) {
    return { status: 'error', result: `保存消息失败: ${err.message}` };
  }

  return {
    status: 'success',
    result: {
      messageId: message.id,
      conversationId,
      senderId,
      content: message.content,
      timestamp: message.timestamp,
      message: '消息已发送'
    }
  };
}

function handleGetHistory(args) {
  const conversationId = args.conversationId || args.conversation_id;
  const limit = parseInt(args.limit) || MESSAGES_PAGE_LIMIT;
  const beforeId = args.beforeId || args.before_id;

  if (!conversationId) return { status: 'error', result: '必须提供 conversationId 参数' };

  const data = loadChatData();
  let messages = data.messages[conversationId] || [];

  // 分页 — 移植自 chatStore.ts:490-516 的分页逻辑
  if (beforeId) {
    const beforeIndex = messages.findIndex(m => m.id === beforeId);
    if (beforeIndex > 0) {
      messages = messages.slice(0, beforeIndex);
    }
  }

  // 取最后 N 条
  const paged = messages.slice(-limit);
  const hasMore = messages.length > limit;

  return {
    status: 'success',
    result: {
      conversationId,
      messages: paged,
      count: paged.length,
      total: (data.messages[conversationId] || []).length,
      hasMore,
      oldestId: paged.length > 0 ? paged[0].id : null,
      newestId: paged.length > 0 ? paged[paged.length - 1].id : null
    }
  };
}

function handleSearchMessages(args) {
  const query = (args.query || args.keyword || args.search || '').trim();
  const conversationId = args.conversationId || args.conversation_id;
  const limit = parseInt(args.limit) || 50;

  if (!query) return { status: 'error', result: '必须提供 query 参数' };

  const data = loadChatData();
  const results = [];
  const lowerQuery = query.toLowerCase();

  const conversationIds = conversationId
    ? [conversationId]
    : Object.keys(data.messages);

  for (const convId of conversationIds) {
    const messages = data.messages[convId] || [];
    for (const msg of messages) {
      if (results.length >= limit) break;
      if (msg.content && msg.content.toLowerCase().includes(lowerQuery)) {
        results.push({
          ...msg,
          conversationId: convId,
          conversationName: data.conversations[convId] ? data.conversations[convId].name : convId
        });
      }
    }
    if (results.length >= limit) break;
  }

  return {
    status: 'success',
    result: {
      query,
      results,
      count: results.length,
      searchScope: conversationId || 'all',
      message: `找到 ${results.length} 条匹配消息`
    }
  };
}

function handleListConversations(args) {
  const workspaceId = args.workspaceId || args.workspace_id;
  if (!workspaceId) return { status: 'error', result: '必须提供 workspaceId 参数' };

  const data = loadChatData();

  // 过滤并排序
  let conversations = sortConversations(data.conversations);

  // 按 workspaceId 过滤
  if (workspaceId !== '*') {
    conversations = conversations.filter(c => c.workspaceId === workspaceId || !c.workspaceId);
  }

  return {
    status: 'success',
    result: {
      workspaceId,
      conversations: conversations.map(c => ({
        id: c.id,
        name: c.name,
        lastMessagePreview: c.lastMessagePreview,
        lastMessageAt: c.lastMessageAt,
        unreadCount: c.unreadCount,
        participants: c.participants,
        archived: c.archived,
        messageCount: (data.messages[c.id] || []).length
      })),
      count: conversations.length
    }
  };
}

function handleCreateConversation(args) {
  const workspaceId = args.workspaceId || args.workspace_id;
  const name = args.name || '';
  const participants = Array.isArray(args.participants) ? args.participants : [];

  if (!workspaceId) return { status: 'error', result: '必须提供 workspaceId 参数' };

  const data = loadChatData();

  const conversation = normalizeConversation({
    workspaceId,
    name: name || `Conversation ${new Date().toLocaleString()}`,
    participants
  });

  data.conversations[conversation.id] = conversation;
  data.messages[conversation.id] = [];

  try {
    saveChatData(data);
  } catch (err) {
    return { status: 'error', result: `创建对话失败: ${err.message}` };
  }

  return {
    status: 'success',
    result: {
      conversationId: conversation.id,
      workspaceId,
      name: conversation.name,
      participants: conversation.participants,
      createdAt: conversation.createdAt,
      message: `对话 "${conversation.name}" 已创建`
    }
  };
}

// ─── 批量调用支持 ───────────────────────────────────────────

function extractParamsForIndex(request, index) {
  const params = {};
  const suffix = String(index);
  for (const [key, value] of Object.entries(request)) {
    if (key === `command${suffix}`) continue;
    if (key.endsWith(suffix)) {
      const baseKey = key.slice(0, -suffix.length);
      if (baseKey) params[baseKey] = value;
    }
  }
  return params;
}

function handleSingleCommand(command, params) {
  switch (command) {
    case 'sendMessage': return handleSendMessage(params);
    case 'getHistory': return handleGetHistory(params);
    case 'searchMessages': return handleSearchMessages(params);
    case 'listConversations': return handleListConversations(params);
    case 'createConversation': return handleCreateConversation(params);
    default:
      return { status: 'error', result: `Unknown command: ${command}. Available: sendMessage, getHistory, searchMessages, listConversations, createConversation` };
  }
}

// ─── 主入口 ─────────────────────────────────────────────────

async function main() {
  let inputData = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    inputData += chunk;
  }

  let request;
  try {
    request = JSON.parse(inputData.trim());
  } catch (err) {
    console.log(JSON.stringify({ status: 'error', result: `Invalid JSON input: ${err.message}` }));
    process.exit(1);
  }

  const command = request.command || request.command1;

  if (!command) {
    console.log(JSON.stringify({
      status: 'error',
      result: '必须提供 command 参数。可用: sendMessage, getHistory, searchMessages, listConversations, createConversation'
    }));
    process.exit(1);
  }

  // 批量调用
  if (request.command1 && request.command2) {
    const results = [];
    let index = 1;
    while (request[`command${index}`]) {
      const cmd = request[`command${index}`];
      const params = extractParamsForIndex(request, index);
      results.push({ command: cmd, index, ...handleSingleCommand(cmd, params) });
      index++;
    }
    console.log(JSON.stringify({
      status: 'success',
      result: { batchResults: results, totalCommands: index - 1 }
    }));
    process.exit(0);
  }

  // 单命令
  const result = handleSingleCommand(command, request);
  console.log(JSON.stringify(result));
  process.exit(0);
}

main().catch((err) => {
  console.log(JSON.stringify({ status: 'error', result: `Plugin execution failed: ${err.message}` }));
  process.exit(1);
});
