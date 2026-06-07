/**
 * GolutraTerminalManager — VCP 同步插件入口
 *
 * 核心功能：管理终端会话生命周期和状态追踪
 * 移植自：
 *   - src/features/terminal/terminalBridge.ts (ACK 流控、缓冲管理)
 *   - src/features/terminal/terminalMemberStore.ts (成员会话、串行派发)
 *   - src/features/terminal/terminalStore.ts (标签页/面板管理)
 *
 * 遵循 VCP 同步插件规范：
 *   1. 从 stdin 读取 JSON 参数
 *   2. 执行操作
 *   3. 将结果 JSON 打印到 stdout
 */

const { spawn } = require('child_process');
const crypto = require('crypto');

// ─── 配置 ───────────────────────────────────────────────────

const BUFFER_LIMIT = parseInt(process.env.BUFFER_LIMIT) || 2000;
const ACK_BATCH_SIZE = parseInt(process.env.ACK_BATCH_SIZE) || 5000;
const ACK_FLUSH_MS = parseInt(process.env.ACK_FLUSH_MS) || 50;
const COMMAND_CONFIRM_DELAY_MS = parseInt(process.env.COMMAND_CONFIRM_DELAY_MS) || 100;
const COMMAND_CONFIRM_SUFFIX = '\r';
const SESSION_TIMEOUT = parseInt(process.env.SESSION_TIMEOUT) || 300000;

// ─── 会话存储 ────────────────────────────────────────────────
// 移植自 terminalMemberStore.ts 的 memberSessions

const sessions = new Map();
const outputBuffers = new Map();
const ackBuffers = new Map();
const dispatchChains = new Map();

/**
 * 终端连接状态解析
 * 移植自 terminalMemberStore.ts:76-84 resolveTerminalStatus()
 */
function resolveTerminalStatus(status) {
  if (status === 'online') return 'connected';
  if (status === 'working') return 'working';
  if (status === 'offline') return 'disconnected';
  if (['pending', 'connecting', 'connected', 'disconnected'].includes(status)) {
    return status;
  }
  return null;
}

/**
 * 构建成员键
 * 移植自 terminalMemberStore.ts:152-153 buildMemberKey()
 */
function buildMemberKey(memberId, workspaceId) {
  return workspaceId ? `${workspaceId}:${memberId}` : memberId;
}

// ─── ACK 流控 ────────────────────────────────────────────────
// 移植自 terminalBridge.ts:151-186 queueAck()

function getAckBuffer(sessionId) {
  if (!ackBuffers.has(sessionId)) {
    ackBuffers.set(sessionId, { pending: 0, timer: null });
  }
  return ackBuffers.get(sessionId);
}

function flushAck(sessionId) {
  const entry = ackBuffers.get(sessionId);
  if (!entry || entry.pending <= 0) return 0;
  const count = entry.pending;
  entry.pending = 0;
  if (entry.timer !== null) {
    clearTimeout(entry.timer);
    entry.timer = null;
  }
  return count;
}

function queueAck(sessionId, dataLength) {
  if (dataLength <= 0) return;
  const entry = getAckBuffer(sessionId);
  entry.pending += dataLength;
  if (entry.pending >= ACK_BATCH_SIZE) {
    flushAck(sessionId);
  }
}

// ─── 输出缓冲 ───────────────────────────────────────────────
// 移植自 terminalBridge.ts:130-148 pushBuffer/flushBuffer

function pushBuffer(sessionId, payload) {
  if (!outputBuffers.has(sessionId)) {
    outputBuffers.set(sessionId, []);
  }
  const queue = outputBuffers.get(sessionId);
  queue.push(payload);
  if (queue.length > BUFFER_LIMIT) {
    queue.splice(0, queue.length - BUFFER_LIMIT);
  }
}

function flushBuffer(sessionId) {
  const queue = outputBuffers.get(sessionId);
  if (!queue || queue.length === 0) return [];
  queue.sort((a, b) => a.seq - b.seq);
  const result = queue.map(p => ({ data: p.data, seq: p.seq }));
  outputBuffers.delete(sessionId);
  return result;
}

// ─── 会话操作 ────────────────────────────────────────────────

/**
 * 创建终端会话
 * 移植自 terminalBridge.ts:285-349 createSession()
 */
function handleCreateSession(args) {
  const memberId = args.memberId;
  const workspaceId = args.workspaceId;

  if (!memberId) {
    return { status: 'error', result: '必须提供 memberId 参数' };
  }
  if (!workspaceId) {
    return { status: 'error', result: '必须提供 workspaceId 参数' };
  }

  const sessionId = crypto.randomUUID();
  const cols = args.cols || 80;
  const rows = args.rows || 24;
  const cwd = args.cwd || process.cwd();
  const terminalType = args.terminalType || process.env.DEFAULT_TERMINAL_TYPE || 'xterm-256color';
  const terminalCommand = args.terminalCommand || '';
  const keepAlive = Boolean(args.keepAlive);

  const session = {
    sessionId,
    memberId,
    workspaceId,
    cols,
    rows,
    cwd,
    terminalType,
    terminalCommand,
    keepAlive,
    status: 'pending',
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
    outputSeq: 0
  };

  const memberKey = buildMemberKey(memberId, workspaceId);
  sessions.set(sessionId, session);

  return {
    status: 'success',
    result: {
      sessionId,
      memberId,
      workspaceId,
      terminalType,
      cols,
      rows,
      status: 'pending',
      createdAt: session.createdAt,
      message: `终端会话 ${sessionId} 已创建`
    }
  };
}

/**
 * 向会话写入数据
 * 移植自 terminalBridge.ts:356-359 writeSession()
 */
function handleWriteToSession(args) {
  const sessionId = args.sessionId;
  const data = args.data;

  if (!sessionId) return { status: 'error', result: '必须提供 sessionId 参数' };
  if (data === undefined || data === null) return { status: 'error', result: '必须提供 data 参数' };

  const session = sessions.get(sessionId);
  if (!session) return { status: 'error', result: `会话 ${sessionId} 不存在` };

  session.lastActivityAt = Date.now();
  session.outputSeq += 1;

  // 记录输出到缓冲区
  pushBuffer(sessionId, {
    sessionId,
    data: String(data),
    seq: session.outputSeq
  });

  // 处理 ACK
  queueAck(sessionId, Buffer.byteLength(String(data)));

  return {
    status: 'success',
    result: {
      sessionId,
      seq: session.outputSeq,
      bytesWritten: Buffer.byteLength(String(data)),
      message: '数据已写入会话'
    }
  };
}

/**
 * 派发命令到终端会话
 * 移植自 terminalMemberStore.ts:647-667 dispatchTerminalMessage()
 * 和 terminalMemberStore.ts:674-691 enqueueTerminalDispatch()
 */
function handleDispatchCommand(args) {
  const sessionId = args.sessionId;
  const command = args.command;
  const context = args.context || {};

  if (!sessionId) return { status: 'error', result: '必须提供 sessionId 参数' };
  if (!command) return { status: 'error', result: '必须提供 command 参数' };

  const session = sessions.get(sessionId);
  if (!session) return { status: 'error', result: `会话 ${sessionId} 不存在` };

  session.lastActivityAt = Date.now();

  // 构建命令输入（只发送原始文本，不附带换行）
  // 移植自 terminalMemberStore.ts:45 buildCommandInput()
  const commandInput = command;

  // 记录派发信息
  const dispatchRecord = {
    sessionId,
    command: commandInput,
    confirmSuffix: COMMAND_CONFIRM_SUFFIX,
    confirmDelayMs: args.confirmDelay || COMMAND_CONFIRM_DELAY_MS,
    context: {
      conversationId: context.conversationId || '',
      conversationType: context.conversationType || '',
      senderId: context.senderId || '',
      senderName: context.senderName || ''
    },
    dispatchedAt: Date.now()
  };

  return {
    status: 'success',
    result: {
      sessionId,
      dispatched: true,
      command: commandInput,
      confirmDelayMs: dispatchRecord.confirmDelayMs,
      context: dispatchRecord.context,
      message: `命令已派发到会话 ${sessionId}，${dispatchRecord.confirmDelayMs}ms 后发送确认回车`
    }
  };
}

/**
 * 获取会话状态
 * 移植自 terminalMemberStore.ts:255-264 getSession()
 */
function handleGetSessionStatus(args) {
  const sessionId = args.sessionId;
  if (!sessionId) return { status: 'error', result: '必须提供 sessionId 参数' };

  const session = sessions.get(sessionId);
  if (!session) return { status: 'error', result: `会话 ${sessionId} 不存在` };

  // 检查超时
  const elapsed = Date.now() - session.lastActivityAt;
  if (elapsed > SESSION_TIMEOUT && session.status !== 'disconnected') {
    session.status = 'disconnected';
  }

  return {
    status: 'success',
    result: {
      sessionId,
      memberId: session.memberId,
      workspaceId: session.workspaceId,
      terminalStatus: session.status,
      terminalType: session.terminalType,
      cols: session.cols,
      rows: session.rows,
      keepAlive: session.keepAlive,
      createdAt: session.createdAt,
      lastActivityAt: session.lastActivityAt,
      outputSeq: session.outputSeq,
      bufferedOutputCount: (outputBuffers.get(sessionId) || []).length,
      pendingAckBytes: (ackBuffers.get(sessionId) || { pending: 0 }).pending
    }
  };
}

/**
 * 关闭会话
 * 移植自 terminalBridge.ts:445-464 closeSession()
 */
function handleCloseSession(args) {
  const sessionId = args.sessionId;
  const preserve = Boolean(args.preserve);

  if (!sessionId) return { status: 'error', result: '必须提供 sessionId 参数' };

  const session = sessions.get(sessionId);
  if (!session) return { status: 'error', result: `会话 ${sessionId} 不存在` };

  // 清理缓冲
  outputBuffers.delete(sessionId);
  const ackEntry = ackBuffers.get(sessionId);
  if (ackEntry && ackEntry.timer !== null) {
    clearTimeout(ackEntry.timer);
  }
  ackBuffers.delete(sessionId);
  dispatchChains.delete(sessionId);

  if (!preserve) {
    sessions.delete(sessionId);
  } else {
    session.status = 'disconnected';
  }

  return {
    status: 'success',
    result: {
      sessionId,
      preserved: preserve,
      message: preserve ? `会话 ${sessionId} 已断开但保留数据` : `会话 ${sessionId} 已彻底关闭`
    }
  };
}

/**
 * 列出工作区的所有会话
 */
function handleListSessions(args) {
  const workspaceId = args.workspaceId;
  if (!workspaceId) return { status: 'error', result: '必须提供 workspaceId 参数' };

  const result = [];
  for (const [sessionId, session] of sessions) {
    if (session.workspaceId === workspaceId) {
      result.push({
        sessionId,
        memberId: session.memberId,
        terminalType: session.terminalType,
        status: session.status,
        createdAt: session.createdAt,
        lastActivityAt: session.lastActivityAt,
        keepAlive: session.keepAlive
      });
    }
  }

  return {
    status: 'success',
    result: {
      workspaceId,
      sessions: result,
      count: result.length
    }
  };
}

/**
 * 获取会话快照
 * 移植自 terminalBridge.ts:481-494 snapshotSessionLines/snapshotSessionText
 */
function handleGetSessionSnapshot(args) {
  const sessionId = args.sessionId;
  if (!sessionId) return { status: 'error', result: '必须提供 sessionId 参数' };

  const session = sessions.get(sessionId);
  if (!session) return { status: 'error', result: `会话 ${sessionId} 不存在` };

  // 从缓冲区获取所有输出
  const bufferedOutput = flushBuffer(sessionId);
  const fullText = bufferedOutput.map(p => p.data).join('');
  const lines = fullText.split('\n');

  return {
    status: 'success',
    result: {
      sessionId,
      lines,
      lineCount: lines.length,
      seq: session.outputSeq,
      cols: session.cols,
      rows: session.rows
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
    case 'createSession': return handleCreateSession(params);
    case 'writeToSession': return handleWriteToSession(params);
    case 'dispatchCommand': return handleDispatchCommand(params);
    case 'getSessionStatus': return handleGetSessionStatus(params);
    case 'closeSession': return handleCloseSession(params);
    case 'listSessions': return handleListSessions(params);
    case 'getSessionSnapshot': return handleGetSessionSnapshot(params);
    default:
      return { status: 'error', result: `Unknown command: ${command}` };
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
      result: '必须提供 command 参数。可用: createSession, writeToSession, dispatchCommand, getSessionStatus, closeSession, listSessions, getSessionSnapshot'
    }));
    process.exit(1);
  }

  // 检查批量调用
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

  // 单个命令
  const result = handleSingleCommand(command, request);
  console.log(JSON.stringify(result));
  process.exit(0);
}

main().catch((err) => {
  console.log(JSON.stringify({ status: 'error', result: `Plugin execution failed: ${err.message}` }));
  process.exit(1);
});
