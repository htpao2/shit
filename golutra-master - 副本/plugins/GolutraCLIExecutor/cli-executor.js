/**
 * GolutraCLIExecutor — VCP 异步插件入口
 *
 * 核心功能：统一管理多种 AI CLI 工具的执行
 * 移植自：
 *   - src-tauri/src/terminal_engine/default_members/registry.rs (工具注册表)
 *   - src-tauri/src/terminal_engine/session/ (会话执行)
 *
 * 遵循 VCP 异步插件规范：
 *   1. 从 stdin 读取 JSON 参数
 *   2. 同步阶段：立即返回包含占位符的 JSON 到 stdout
 *   3. 异步阶段：后台执行 CLI 命令，完成后通过 HTTP POST 回调
 */

const { spawn } = require('child_process');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { buildCommand, listAllTools, getToolConfig, resolveDefaultMember } = require('./lib/tool-registry');

// ─── 工具函数 ───────────────────────────────────────────────

function generateTaskId() {
  return crypto.randomUUID();
}

function logEvent(level, message, data) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    plugin: 'GolutraCLIExecutor',
    message,
    ...(data || {})
  };
  process.stderr.write(JSON.stringify(entry) + '\n');
}

function printJsonOutput(status, result, extra) {
  const output = { status, result, ...(extra || {}) };
  console.log(JSON.stringify(output));
}

// ─── 异步回调 ───────────────────────────────────────────────

/**
 * 向 VCP 主服务发送异步回调
 * 移植自 VCP 异步插件规范 5.3 节
 */
function sendCallback(callbackBaseUrl, pluginName, taskId, payload) {
  return new Promise((resolve, reject) => {
    const callbackUrl = `${callbackBaseUrl}/${pluginName}/${taskId}`;
    logEvent('info', `Sending callback to ${callbackUrl}`, { taskId });

    const url = new URL(callbackUrl);
    const transport = url.protocol === 'https:' ? https : http;
    const bodyStr = JSON.stringify(payload);

    const req = transport.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyStr)
        },
        timeout: 30000
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          logEvent('info', `Callback response: ${res.statusCode}`, { taskId });
          resolve({ statusCode: res.statusCode, body: data });
        });
      }
    );

    req.on('error', (err) => {
      logEvent('error', `Callback failed: ${err.message}`, { taskId });
      reject(err);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Callback request timed out'));
    });

    req.write(bodyStr);
    req.end();
  });
}

// ─── CLI 执行 ───────────────────────────────────────────────

/**
 * 在后台执行 CLI 命令
 * 使用 child_process.spawn 启动子进程
 */
function executeCLIInBackground(taskId, tool, prompt, options) {
  const callbackBaseUrl = process.env.CALLBACK_BASE_URL;
  const pluginName = process.env.PLUGIN_NAME_FOR_CALLBACK || 'GolutraCLIExecutor';
  const executionTimeout = parseInt(process.env.EXECUTION_TIMEOUT) || 300000;

  const run = async () => {
    let stdout = '';
    let stderr = '';
    let exitCode = null;

    try {
      // 构建完整命令
      const fullCommand = buildCommand(tool, {
        unlimitedAccess: options.unlimitedAccess || false,
        resumeSessionId: options.resumeSessionId || null
      });

      logEvent('info', `Executing CLI command`, {
        taskId,
        tool,
        command: fullCommand,
        cwd: options.cwd || process.cwd()
      });

      // 解析命令和参数
      const parts = fullCommand.split(/\s+/);
      const executable = parts[0];
      const baseArgs = parts.slice(1);

      // 组合额外参数
      const allArgs = [...baseArgs, ...(options.args || [])];

      // 如果有 prompt，根据工具类型决定如何传递
      if (prompt) {
        // 大多数 AI CLI 工具接受直接传递 prompt 作为参数
        allArgs.push(prompt);
      }

      const result = await new Promise((resolve, reject) => {
        const child = spawn(executable, allArgs, {
          cwd: options.cwd || process.cwd(),
          shell: tool === 'shell',
          env: { ...process.env },
          stdio: ['pipe', 'pipe', 'pipe']
        });

        const timeout = setTimeout(() => {
          child.kill('SIGTERM');
          setTimeout(() => {
            if (!child.killed) child.kill('SIGKILL');
          }, 5000);
          reject(new Error(`Execution timed out after ${executionTimeout}ms`));
        }, executionTimeout);

        child.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        child.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        child.on('close', (code) => {
          clearTimeout(timeout);
          exitCode = code;
          resolve({ stdout, stderr, exitCode: code });
        });

        child.on('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });

      // 构建回调数据
      const callbackPayload = {
        requestId: taskId,
        status: result.exitCode === 0 ? 'Succeed' : 'Failed',
        tool,
        command: fullCommand,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        completedAt: new Date().toISOString(),
        message: result.exitCode === 0
          ? `CLI 工具 ${tool} 执行成功`
          : `CLI 工具 ${tool} 执行失败 (exit code: ${result.exitCode})`
      };

      // 发送回调
      if (callbackBaseUrl) {
        try {
          await sendCallback(callbackBaseUrl, pluginName, taskId, callbackPayload);
          logEvent('info', `Callback sent successfully`, { taskId });
        } catch (cbErr) {
          logEvent('error', `Callback failed: ${cbErr.message}`, { taskId });
        }
      } else {
        logEvent('warn', `No CALLBACK_BASE_URL configured, skipping callback`, { taskId });
      }
    } catch (error) {
      logEvent('error', `Execution error: ${error.message}`, { taskId });

      if (callbackBaseUrl) {
        try {
          await sendCallback(callbackBaseUrl, pluginName, taskId, {
            requestId: taskId,
            status: 'Failed',
            tool,
            exitCode: -1,
            stdout,
            stderr: stderr || error.message,
            error: error.message,
            completedAt: new Date().toISOString()
          });
        } catch (cbErr) {
          logEvent('error', `Error callback also failed: ${cbErr.message}`, { taskId });
        }
      }
    }
  };

  // 启动后台任务（非阻塞）
  run().catch((err) => {
    logEvent('error', `Background task crashed: ${err.message}`, { taskId });
  });
}

// ─── 命令处理 ───────────────────────────────────────────────

/**
 * 处理 executeCLI 命令（异步模式）
 */
function handleExecuteCLI(args) {
  const tool = (args.tool || args.Tool || '').trim().toLowerCase();
  const prompt = args.prompt || args.Prompt || args.command || '';
  const cwd = args.cwd || args.Cwd || args.workingDirectory || undefined;
  const unlimitedAccess = Boolean(args.unlimitedAccess || args.unlimited_access);
  const resumeSessionId = args.resumeSessionId || args.resume_session_id || null;
  const extraArgs = Array.isArray(args.args) ? args.args : [];

  if (!tool) {
    printJsonOutput('error', '必须提供 tool 参数，可选值: claude/gemini/codex/opencode/qwen/shell');
    process.exit(1);
  }

  const member = resolveDefaultMember(tool);
  if (!member) {
    printJsonOutput('error', `未知的 CLI 工具: ${tool}。可选值: claude, gemini, codex, opencode, qwen, shell`);
    process.exit(1);
  }

  if (!prompt) {
    printJsonOutput('error', '必须提供 prompt 参数');
    process.exit(1);
  }

  const taskId = generateTaskId();

  // 启动后台执行任务
  executeCLIInBackground(taskId, tool, prompt, {
    cwd,
    unlimitedAccess,
    resumeSessionId,
    args: extraArgs
  });

  // 立即返回包含占位符的结果
  const resultString =
    `CLI 工具 ${tool} 的任务 (ID: ${taskId}) 已成功提交。\n` +
    `命令将在后台执行，完成后结果会自动更新。\n` +
    `这是一个动态上下文占位符，当任务完成时，它会被自动替换为实际结果。\n` +
    `请在你的回复中包含以下占位符原文：{{VCP_ASYNC_RESULT::GolutraCLIExecutor::${taskId}}}`;

  printJsonOutput('success', resultString);
  // 注意：异步插件不能立即退出，需要等待后台任务完成
}

/**
 * 处理 listTools 命令（同步模式）
 */
function handleListTools() {
  const tools = listAllTools();
  printJsonOutput('success', {
    tools,
    count: tools.length,
    message: `共有 ${tools.length} 个可用的 CLI 工具`
  });
  process.exit(0);
}

/**
 * 处理 getToolConfig 命令（同步模式）
 */
function handleGetToolConfig(args) {
  const tool = (args.tool || args.Tool || '').trim().toLowerCase();
  if (!tool) {
    printJsonOutput('error', '必须提供 tool 参数');
    process.exit(1);
  }

  const config = getToolConfig(tool);
  if (config.error) {
    printJsonOutput('error', config);
    process.exit(1);
  }

  printJsonOutput('success', config);
  process.exit(0);
}

// ─── 批量调用支持 ───────────────────────────────────────────

/**
 * 处理批量调用请求
 * 遵循 VCP 手册 4.2 节的 command1/command2 批量调用规范
 */
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

// ─── 主入口 ─────────────────────────────────────────────────

async function main() {
  let inputData = '';

  // 从 stdin 读取输入
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    inputData += chunk;
  }

  let request;
  try {
    request = JSON.parse(inputData.trim());
  } catch (err) {
    printJsonOutput('error', `Invalid JSON input: ${err.message}`);
    process.exit(1);
  }

  // 判断是单个命令还是批量命令
  const command = request.command || request.command1;

  if (!command) {
    printJsonOutput('error', '必须提供 command 参数。可用命令: executeCLI, listTools, getToolConfig');
    process.exit(1);
  }

  // 检查是否是批量调用
  if (request.command1 && request.command2) {
    // 批量模式：依次处理每个命令
    logEvent('info', 'Batch request detected');
    const results = [];
    let index = 1;

    while (request[`command${index}`]) {
      const cmd = request[`command${index}`];
      const params = extractParamsForIndex(request, index);
      logEvent('info', `Processing batch command ${index}: ${cmd}`);

      // 对于异步命令 executeCLI，在批量模式下也按异步处理
      if (cmd === 'executeCLI') {
        const tool = (params.tool || '').trim().toLowerCase();
        const prompt = params.prompt || '';
        const taskId = generateTaskId();

        executeCLIInBackground(taskId, tool, prompt, {
          cwd: params.cwd,
          unlimitedAccess: Boolean(params.unlimitedAccess),
          resumeSessionId: params.resumeSessionId,
          args: Array.isArray(params.args) ? params.args : []
        });

        results.push({
          command: cmd,
          index,
          status: 'submitted',
          taskId,
          placeholder: `{{VCP_ASYNC_RESULT::GolutraCLIExecutor::${taskId}}}`
        });
      } else if (cmd === 'listTools') {
        results.push({ command: cmd, index, status: 'success', result: listAllTools() });
      } else if (cmd === 'getToolConfig') {
        results.push({ command: cmd, index, status: 'success', result: getToolConfig(params.tool || '') });
      } else {
        results.push({ command: cmd, index, status: 'error', error: `Unknown command: ${cmd}` });
      }
      index++;
    }

    printJsonOutput('success', {
      batchResults: results,
      totalCommands: index - 1
    });
    // 如果有异步任务则不退出
    const hasAsync = results.some(r => r.status === 'submitted');
    if (!hasAsync) process.exit(0);
    return;
  }

  // 单个命令模式
  switch (command) {
    case 'executeCLI':
      handleExecuteCLI(request);
      break;
    case 'listTools':
      handleListTools();
      break;
    case 'getToolConfig':
      handleGetToolConfig(request);
      break;
    default:
      printJsonOutput('error', `Unknown command: ${command}. Available: executeCLI, listTools, getToolConfig`);
      process.exit(1);
  }
}

main().catch((err) => {
  printJsonOutput('error', `Plugin execution failed: ${err.message}`);
  process.exit(1);
});
