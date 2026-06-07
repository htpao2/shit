/**
 * GolutraBuildAutomation — VCP 异步/同步混合插件入口
 *
 * 核心功能：检测构建系统并执行自动化构建
 * detectBuildSystem/getBuildStatus 为同步命令
 * executeBuild 为异步命令（spawn 构建进程）
 *
 * 遵循 VCP 异步插件规范
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const https = require('https');

// ─── 配置 ───────────────────────────────────────────────────

const BUILD_TIMEOUT = parseInt(process.env.BUILD_TIMEOUT) || 300000;
const DEFAULT_BUILD_SCRIPT = process.env.DEFAULT_BUILD_SCRIPT || 'build';
const ENABLE_CACHE_DETECTION = process.env.ENABLE_CACHE_DETECTION !== 'false';

// ─── 构建系统定义 ────────────────────────────────────────────

const BUILD_SYSTEMS = {
  npm: {
    detectFiles: ['package.json', 'package-lock.json'],
    buildCommand: 'npm',
    buildArgs: ['run'],
    installCommand: 'npm install',
    lockFile: 'package-lock.json',
    outputDirs: ['dist', 'build', 'out'],
    cacheDirs: ['node_modules']
  },
  pnpm: {
    detectFiles: ['pnpm-lock.yaml', 'pnpm-workspace.yaml'],
    buildCommand: 'pnpm',
    buildArgs: ['run'],
    installCommand: 'pnpm install',
    lockFile: 'pnpm-lock.yaml',
    outputDirs: ['dist', 'build', 'out'],
    cacheDirs: ['node_modules']
  },
  yarn: {
    detectFiles: ['yarn.lock'],
    buildCommand: 'yarn',
    buildArgs: ['run'],
    installCommand: 'yarn install',
    lockFile: 'yarn.lock',
    outputDirs: ['dist', 'build', 'out'],
    cacheDirs: ['node_modules']
  },
  bun: {
    detectFiles: ['bun.lockb'],
    buildCommand: 'bun',
    buildArgs: ['run'],
    installCommand: 'bun install',
    lockFile: 'bun.lockb',
    outputDirs: ['dist', 'build', 'out'],
    cacheDirs: ['node_modules']
  },
  cargo: {
    detectFiles: ['Cargo.toml'],
    buildCommand: 'cargo',
    buildArgs: ['build'],
    installCommand: null,
    lockFile: 'Cargo.lock',
    outputDirs: ['target/debug', 'target/release'],
    cacheDirs: ['target']
  },
  go: {
    detectFiles: ['go.mod'],
    buildCommand: 'go',
    buildArgs: ['build'],
    installCommand: null,
    lockFile: 'go.sum',
    outputDirs: ['.'],
    cacheDirs: []
  },
  maven: {
    detectFiles: ['pom.xml'],
    buildCommand: 'mvn',
    buildArgs: ['package'],
    installCommand: 'mvn install',
    lockFile: null,
    outputDirs: ['target'],
    cacheDirs: ['.m2']
  },
  gradle: {
    detectFiles: ['build.gradle', 'build.gradle.kts'],
    buildCommand: 'gradle',
    buildArgs: ['build'],
    installCommand: null,
    lockFile: 'gradle.lockfile',
    outputDirs: ['build'],
    cacheDirs: ['.gradle']
  },
  make: {
    detectFiles: ['Makefile', 'makefile', 'GNUmakefile'],
    buildCommand: 'make',
    buildArgs: [],
    installCommand: null,
    lockFile: null,
    outputDirs: [],
    cacheDirs: []
  },
  cmake: {
    detectFiles: ['CMakeLists.txt'],
    buildCommand: 'cmake',
    buildArgs: ['--build', '.'],
    installCommand: null,
    lockFile: null,
    outputDirs: ['build'],
    cacheDirs: ['build']
  }
};

// ─── 工具函数 ───────────────────────────────────────────────

function generateTaskId() {
  return crypto.randomUUID();
}

function logEvent(level, message, data) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    plugin: 'GolutraBuildAutomation',
    message,
    ...(data || {})
  };
  process.stderr.write(JSON.stringify(entry) + '\n');
}

function printJsonOutput(status, result, extra) {
  const output = { status, result, ...(extra || {}) };
  console.log(JSON.stringify(output));
}

function fileExists(p) {
  try { return fs.existsSync(p); } catch { return false; }
}

function getDirSize(dirPath) {
  let size = 0;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isFile()) {
        try { size += fs.statSync(fullPath).size; } catch { /* ignore */ }
      } else if (entry.isDirectory()) {
        size += getDirSize(fullPath);
      }
    }
  } catch { /* ignore */ }
  return size;
}

function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
}

// ─── 异步回调 ───────────────────────────────────────────────

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
        res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
      }
    );

    req.on('error', (err) => reject(err));
    req.on('timeout', () => { req.destroy(); reject(new Error('Callback timed out')); });
    req.write(bodyStr);
    req.end();
  });
}

// ─── 构建系统检测 ────────────────────────────────────────────

function detectBuildSystem(projectPath) {
  const detected = [];

  // 按优先级检测：先检测包管理器特定文件
  const priority = ['pnpm', 'yarn', 'bun', 'npm', 'cargo', 'go', 'gradle', 'maven', 'cmake', 'make'];

  for (const system of priority) {
    const config = BUILD_SYSTEMS[system];
    for (const file of config.detectFiles) {
      if (fileExists(path.join(projectPath, file))) {
        detected.push(system);
        break;
      }
    }
  }

  return detected;
}

function getAvailableScripts(projectPath, buildSystem) {
  if (['npm', 'pnpm', 'yarn', 'bun'].includes(buildSystem)) {
    try {
      const pkgContent = fs.readFileSync(path.join(projectPath, 'package.json'), 'utf8');
      const pkg = JSON.parse(pkgContent);
      return pkg.scripts ? Object.keys(pkg.scripts) : [];
    } catch { return []; }
  }

  if (buildSystem === 'make') {
    try {
      const makefileContent = fs.readFileSync(path.join(projectPath, 'Makefile'), 'utf8');
      const targets = makefileContent.match(/^([a-zA-Z_][a-zA-Z0-9_-]*):/gm);
      return targets ? targets.map(t => t.replace(':', '')) : [];
    } catch { return []; }
  }

  return [];
}

// ─── 构建执行 ────────────────────────────────────────────────

function executeBuildInBackground(taskId, buildSystem, projectPath, script, extraArgs) {
  const callbackBaseUrl = process.env.CALLBACK_BASE_URL;
  const pluginName = process.env.PLUGIN_NAME_FOR_CALLBACK || 'GolutraBuildAutomation';

  const run = async () => {
    let stdout = '';
    let stderr = '';
    const startTime = Date.now();

    try {
      const config = BUILD_SYSTEMS[buildSystem];
      if (!config) throw new Error(`Unsupported build system: ${buildSystem}`);

      let command = config.buildCommand;
      let args = [...config.buildArgs];

      // Node.js 包管理器使用 script 名
      if (['npm', 'pnpm', 'yarn', 'bun'].includes(buildSystem)) {
        args.push(script || DEFAULT_BUILD_SCRIPT);
      }

      // 追加额外参数
      if (extraArgs && extraArgs.length > 0) args.push(...extraArgs);

      logEvent('info', `Executing build`, { taskId, buildSystem, command, args });

      const result = await new Promise((resolve, reject) => {
        const child = spawn(command, args, {
          cwd: projectPath,
          env: { ...process.env },
          shell: true,
          stdio: ['pipe', 'pipe', 'pipe']
        });

        const timeout = setTimeout(() => {
          child.kill('SIGTERM');
          setTimeout(() => { if (!child.killed) child.kill('SIGKILL'); }, 5000);
          reject(new Error(`Build timed out after ${BUILD_TIMEOUT}ms`));
        }, BUILD_TIMEOUT);

        child.stdout.on('data', (data) => { stdout += data.toString(); });
        child.stderr.on('data', (data) => { stderr += data.toString(); });

        child.on('close', (code) => {
          clearTimeout(timeout);
          resolve({ stdout, stderr, exitCode: code });
        });

        child.on('error', (err) => { clearTimeout(timeout); reject(err); });
      });

      const duration = Date.now() - startTime;

      const callbackPayload = {
        requestId: taskId,
        status: result.exitCode === 0 ? 'Succeed' : 'Failed',
        buildSystem,
        script: script || DEFAULT_BUILD_SCRIPT,
        exitCode: result.exitCode,
        duration,
        durationHuman: `${(duration / 1000).toFixed(1)}s`,
        stdout: result.stdout.substring(0, 10000),
        stderr: result.stderr.substring(0, 5000),
        completedAt: new Date().toISOString(),
        message: result.exitCode === 0
          ? `构建成功 (${buildSystem}, 耗时 ${(duration / 1000).toFixed(1)}s)`
          : `构建失败 (exit code: ${result.exitCode})`
      };

      if (callbackBaseUrl) {
        try {
          await sendCallback(callbackBaseUrl, pluginName, taskId, callbackPayload);
          logEvent('info', 'Build callback sent', { taskId, duration });
        } catch (cbErr) {
          logEvent('error', `Build callback failed: ${cbErr.message}`, { taskId });
        }
      }
    } catch (error) {
      logEvent('error', `Build error: ${error.message}`, { taskId });
      if (callbackBaseUrl) {
        try {
          await sendCallback(callbackBaseUrl, pluginName, taskId, {
            requestId: taskId,
            status: 'Failed',
            buildSystem,
            error: error.message,
            duration: Date.now() - startTime,
            completedAt: new Date().toISOString()
          });
        } catch { /* ignore */ }
      }
    }
  };

  run().catch((err) => logEvent('error', `Background build crashed: ${err.message}`, { taskId }));
}

// ─── 命令处理 ────────────────────────────────────────────────

function handleDetectBuildSystem(args) {
  const projectPath = args.projectPath || args.project_path || args.path;
  if (!projectPath) return { status: 'error', result: '必须提供 projectPath 参数' };
  if (!fileExists(projectPath)) return { status: 'error', result: `项目路径不存在: ${projectPath}` };

  const detected = detectBuildSystem(projectPath);
  const primary = detected.length > 0 ? detected[0] : null;

  const details = detected.map(system => {
    const config = BUILD_SYSTEMS[system];
    const scripts = getAvailableScripts(projectPath, system);
    return {
      name: system,
      command: config.buildCommand,
      defaultBuildArgs: config.buildArgs,
      availableScripts: scripts,
      hasLockFile: config.lockFile ? fileExists(path.join(projectPath, config.lockFile)) : false,
      outputDirs: config.outputDirs.filter(d => fileExists(path.join(projectPath, d)))
    };
  });

  return {
    status: 'success',
    result: {
      projectPath,
      primary,
      detected: details,
      count: detected.length,
      message: primary ? `检测到主要构建系统: ${primary}` : '未检测到已知的构建系统'
    }
  };
}

function handleExecuteBuild(args) {
  const projectPath = args.projectPath || args.project_path || args.path;
  if (!projectPath) {
    printJsonOutput('error', '必须提供 projectPath 参数');
    process.exit(1);
  }
  if (!fileExists(projectPath)) {
    printJsonOutput('error', `项目路径不存在: ${projectPath}`);
    process.exit(1);
  }

  let buildSystem = (args.buildSystem || args.build_system || 'auto').toLowerCase();
  if (buildSystem === 'auto') {
    const detected = detectBuildSystem(projectPath);
    if (detected.length === 0) {
      printJsonOutput('error', '无法自动检测构建系统，请通过 buildSystem 参数指定');
      process.exit(1);
    }
    buildSystem = detected[0];
  }

  if (!BUILD_SYSTEMS[buildSystem]) {
    printJsonOutput('error', `不支持的构建系统: ${buildSystem}。可选: ${Object.keys(BUILD_SYSTEMS).join(', ')}`);
    process.exit(1);
  }

  const script = args.script || DEFAULT_BUILD_SCRIPT;
  const extraArgs = Array.isArray(args.args) ? args.args : [];
  const taskId = generateTaskId();

  // 启动后台构建
  executeBuildInBackground(taskId, buildSystem, projectPath, script, extraArgs);

  // 立即返回占位符
  const resultString =
    `构建任务 (ID: ${taskId}) 已提交。\n` +
    `使用 ${buildSystem} 在 ${projectPath} 执行构建脚本 "${script}"。\n` +
    `这是一个动态上下文占位符，当任务完成时，它会被自动替换为实际结果。\n` +
    `请在你的回复中包含以下占位符原文：{{VCP_ASYNC_RESULT::GolutraBuildAutomation::${taskId}}}`;

  printJsonOutput('success', resultString);
}

function handleGetBuildStatus(args) {
  const projectPath = args.projectPath || args.project_path || args.path;
  if (!projectPath) return { status: 'error', result: '必须提供 projectPath 参数' };
  if (!fileExists(projectPath)) return { status: 'error', result: `项目路径不存在: ${projectPath}` };

  const detected = detectBuildSystem(projectPath);
  const status = {};

  for (const system of detected) {
    const config = BUILD_SYSTEMS[system];
    const info = { name: system };

    // 检查输出目录
    info.outputDirs = config.outputDirs.map(d => {
      const dirPath = path.join(projectPath, d);
      if (fileExists(dirPath)) {
        try {
          const stat = fs.statSync(dirPath);
          const size = getDirSize(dirPath);
          return { path: d, exists: true, size: formatSize(size), modifiedAt: stat.mtime.toISOString() };
        } catch { return { path: d, exists: true }; }
      }
      return { path: d, exists: false };
    });

    // 检查缓存
    if (ENABLE_CACHE_DETECTION) {
      info.cacheDirs = config.cacheDirs.map(d => {
        const dirPath = path.join(projectPath, d);
        if (fileExists(dirPath)) {
          const size = getDirSize(dirPath);
          return { path: d, exists: true, size: formatSize(size) };
        }
        return { path: d, exists: false };
      });
    }

    // 检查 lock 文件
    if (config.lockFile) {
      const lockPath = path.join(projectPath, config.lockFile);
      info.lockFile = {
        name: config.lockFile,
        exists: fileExists(lockPath)
      };
      if (info.lockFile.exists) {
        try { info.lockFile.modifiedAt = fs.statSync(lockPath).mtime.toISOString(); } catch { /* ignore */ }
      }
    }

    status[system] = info;
  }

  return {
    status: 'success',
    result: {
      projectPath,
      buildSystems: status,
      detectedCount: detected.length
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
    printJsonOutput('error', `Invalid JSON input: ${err.message}`);
    process.exit(1);
  }

  const command = request.command || request.command1;

  if (!command) {
    printJsonOutput('error', '必须提供 command 参数。可用: detectBuildSystem, executeBuild, getBuildStatus');
    process.exit(1);
  }

  // 批量调用
  if (request.command1 && request.command2) {
    const results = [];
    let index = 1;
    let hasAsync = false;

    while (request[`command${index}`]) {
      const cmd = request[`command${index}`];
      const params = extractParamsForIndex(request, index);

      if (cmd === 'executeBuild') {
        hasAsync = true;
        const taskId = generateTaskId();
        const detected = detectBuildSystem(params.projectPath || '');
        const bs = detected[0] || 'npm';
        executeBuildInBackground(taskId, bs, params.projectPath || '', params.script, []);
        results.push({ command: cmd, index, status: 'submitted', taskId, placeholder: `{{VCP_ASYNC_RESULT::GolutraBuildAutomation::${taskId}}}` });
      } else if (cmd === 'detectBuildSystem') {
        results.push({ command: cmd, index, ...handleDetectBuildSystem(params) });
      } else if (cmd === 'getBuildStatus') {
        results.push({ command: cmd, index, ...handleGetBuildStatus(params) });
      } else {
        results.push({ command: cmd, index, status: 'error', result: `Unknown command: ${cmd}` });
      }
      index++;
    }

    printJsonOutput('success', { batchResults: results, totalCommands: index - 1 });
    if (!hasAsync) process.exit(0);
    return;
  }

  // 单命令
  switch (command) {
    case 'detectBuildSystem': {
      const result = handleDetectBuildSystem(request);
      console.log(JSON.stringify(result));
      process.exit(0);
      break;
    }
    case 'executeBuild':
      handleExecuteBuild(request);
      break;
    case 'getBuildStatus': {
      const result = handleGetBuildStatus(request);
      console.log(JSON.stringify(result));
      process.exit(0);
      break;
    }
    default:
      printJsonOutput('error', `Unknown command: ${command}. Available: detectBuildSystem, executeBuild, getBuildStatus`);
      process.exit(1);
  }
}

main().catch((err) => {
  printJsonOutput('error', `Plugin execution failed: ${err.message}`);
  process.exit(1);
});
