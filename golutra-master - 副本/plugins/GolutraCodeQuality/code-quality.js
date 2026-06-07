/**
 * GolutraCodeQuality — VCP 异步/同步混合插件入口
 *
 * 核心功能：运行静态代码分析和质量检查
 * runLinting 为异步命令（spawn 外部 linter）
 * analyzeComplexity/generateQualityReport 为同步命令
 *
 * 遵循 VCP 异步插件规范：
 *   异步命令: 立即返回占位符 → 后台执行 → HTTP 回调
 *   同步命令: 直接返回结果
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const https = require('https');

// ─── 配置 ───────────────────────────────────────────────────

const DEFAULT_LINTER = process.env.DEFAULT_LINTER || 'auto';
const MAX_FILES_PER_CHECK = parseInt(process.env.MAX_FILES_PER_CHECK) || 100;
const LINT_TIMEOUT = parseInt(process.env.LINT_TIMEOUT) || 60000;

// ─── 工具函数 ───────────────────────────────────────────────

function generateTaskId() {
  return crypto.randomUUID();
}

function logEvent(level, message, data) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    plugin: 'GolutraCodeQuality',
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

// ─── Linter 检测 ─────────────────────────────────────────────

const LINTER_CONFIGS = {
  eslint: {
    configFiles: ['.eslintrc.js', '.eslintrc.json', '.eslintrc.yml', '.eslintrc.yaml', '.eslintrc', 'eslint.config.js', 'eslint.config.mjs'],
    command: 'npx',
    args: ['eslint', '--format', 'json'],
    fixArgs: ['--fix'],
    languages: ['JavaScript', 'TypeScript', 'Vue']
  },
  clippy: {
    configFiles: ['Cargo.toml'],
    command: 'cargo',
    args: ['clippy', '--message-format=json'],
    fixArgs: ['--fix', '--allow-dirty'],
    languages: ['Rust']
  },
  pylint: {
    configFiles: ['.pylintrc', 'pyproject.toml', 'setup.cfg'],
    command: 'pylint',
    args: ['--output-format=json'],
    fixArgs: [],
    languages: ['Python']
  },
  golint: {
    configFiles: ['go.mod'],
    command: 'golangci-lint',
    args: ['run', '--out-format', 'json'],
    fixArgs: ['--fix'],
    languages: ['Go']
  }
};

function detectLinter(projectPath) {
  // eslint: 检查 Node.js 项目
  for (const configFile of LINTER_CONFIGS.eslint.configFiles) {
    if (fileExists(path.join(projectPath, configFile))) return 'eslint';
  }
  if (fileExists(path.join(projectPath, 'package.json'))) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(projectPath, 'package.json'), 'utf8'));
      if (pkg.devDependencies && pkg.devDependencies.eslint) return 'eslint';
    } catch { /* ignore */ }
  }

  // clippy: 检查 Rust 项目
  if (fileExists(path.join(projectPath, 'Cargo.toml'))) return 'clippy';

  // pylint: 检查 Python 项目
  if (fileExists(path.join(projectPath, 'requirements.txt')) || fileExists(path.join(projectPath, 'pyproject.toml'))) return 'pylint';

  // golint: 检查 Go 项目
  if (fileExists(path.join(projectPath, 'go.mod'))) return 'golint';

  return null;
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

// ─── 异步 Lint 执行 ─────────────────────────────────────────

function executeLintInBackground(taskId, linterName, projectPath, options) {
  const callbackBaseUrl = process.env.CALLBACK_BASE_URL;
  const pluginName = process.env.PLUGIN_NAME_FOR_CALLBACK || 'GolutraCodeQuality';

  const run = async () => {
    let stdout = '';
    let stderr = '';

    try {
      const config = LINTER_CONFIGS[linterName];
      if (!config) throw new Error(`Unsupported linter: ${linterName}`);

      const args = [...config.args];
      if (options.fix && config.fixArgs.length > 0) args.push(...config.fixArgs);
      if (options.files && options.files.length > 0) args.push(...options.files);
      else if (linterName === 'eslint') args.push('.');

      logEvent('info', `Running ${linterName}`, { taskId, command: config.command, args });

      const result = await new Promise((resolve, reject) => {
        const child = spawn(config.command, args, {
          cwd: projectPath,
          env: { ...process.env },
          shell: true,
          stdio: ['pipe', 'pipe', 'pipe']
        });

        const timeout = setTimeout(() => {
          child.kill('SIGTERM');
          setTimeout(() => { if (!child.killed) child.kill('SIGKILL'); }, 5000);
          reject(new Error(`Lint timed out after ${LINT_TIMEOUT}ms`));
        }, LINT_TIMEOUT);

        child.stdout.on('data', (data) => { stdout += data.toString(); });
        child.stderr.on('data', (data) => { stderr += data.toString(); });

        child.on('close', (code) => {
          clearTimeout(timeout);
          resolve({ stdout, stderr, exitCode: code });
        });

        child.on('error', (err) => { clearTimeout(timeout); reject(err); });
      });

      // 解析 lint 结果
      let parsedResults = null;
      try {
        parsedResults = JSON.parse(result.stdout);
      } catch { /* 输出可能不是 JSON */ }

      const callbackPayload = {
        requestId: taskId,
        status: result.exitCode === 0 ? 'Succeed' : 'Succeed',  // lint通常 exitCode!=0 也算成功（有 warning）
        linter: linterName,
        exitCode: result.exitCode,
        parsedResults,
        rawOutput: result.stdout.substring(0, 10000),
        stderr: result.stderr.substring(0, 5000),
        completedAt: new Date().toISOString(),
        message: `${linterName} 检查完成 (exit code: ${result.exitCode})`
      };

      if (callbackBaseUrl) {
        try {
          await sendCallback(callbackBaseUrl, pluginName, taskId, callbackPayload);
          logEvent('info', 'Callback sent successfully', { taskId });
        } catch (cbErr) {
          logEvent('error', `Callback failed: ${cbErr.message}`, { taskId });
        }
      }
    } catch (error) {
      logEvent('error', `Lint execution error: ${error.message}`, { taskId });
      if (callbackBaseUrl) {
        try {
          await sendCallback(callbackBaseUrl, pluginName, taskId, {
            requestId: taskId,
            status: 'Failed',
            linter: linterName,
            error: error.message,
            completedAt: new Date().toISOString()
          });
        } catch { /* ignore */ }
      }
    }
  };

  run().catch((err) => logEvent('error', `Background lint crashed: ${err.message}`, { taskId }));
}

// ─── 命令处理 ────────────────────────────────────────────────

function handleRunLinting(args) {
  const projectPath = args.projectPath || args.project_path || args.path;
  if (!projectPath) {
    printJsonOutput('error', '必须提供 projectPath 参数');
    process.exit(1);
  }
  if (!fileExists(projectPath)) {
    printJsonOutput('error', `项目路径不存在: ${projectPath}`);
    process.exit(1);
  }

  let linterName = (args.linter || args.Linter || DEFAULT_LINTER).toLowerCase();
  if (linterName === 'auto') {
    linterName = detectLinter(projectPath);
    if (!linterName) {
      printJsonOutput('error', '无法自动检测项目使用的检查工具，请通过 linter 参数指定');
      process.exit(1);
    }
  }

  if (!LINTER_CONFIGS[linterName]) {
    printJsonOutput('error', `不支持的检查工具: ${linterName}。可选: eslint, clippy, pylint, golint`);
    process.exit(1);
  }

  const fix = Boolean(args.fix);
  const files = Array.isArray(args.files) ? args.files.slice(0, MAX_FILES_PER_CHECK) : [];
  const taskId = generateTaskId();

  // 启动后台 lint 任务
  executeLintInBackground(taskId, linterName, projectPath, { fix, files });

  // 立即返回占位符
  const resultString =
    `代码检查任务 (ID: ${taskId}) 已提交。\n` +
    `使用 ${linterName} 对 ${projectPath} 进行检查${fix ? '（含自动修复）' : ''}。\n` +
    `这是一个动态上下文占位符，当任务完成时，它会被自动替换为实际结果。\n` +
    `请在你的回复中包含以下占位符原文：{{VCP_ASYNC_RESULT::GolutraCodeQuality::${taskId}}}`;

  printJsonOutput('success', resultString);
}

function handleAnalyzeComplexity(args) {
  const projectPath = args.projectPath || args.project_path || args.path;
  const maxDepth = args.maxDepth || 3;

  if (!projectPath) return { status: 'error', result: '必须提供 projectPath 参数' };
  if (!fileExists(projectPath)) return { status: 'error', result: `项目路径不存在: ${projectPath}` };

  const IGNORE_DIRS = ['node_modules', '.git', 'dist', 'build', 'target', '__pycache__', '.tmp'];
  const CODE_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go', '.java', '.vue'];

  const files = [];
  function scan(dir, depth) {
    if (depth > maxDepth) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (IGNORE_DIRS.includes(entry.name) || entry.name.startsWith('.')) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) { scan(fullPath, depth + 1); continue; }
      const ext = path.extname(entry.name).toLowerCase();
      if (CODE_EXTS.includes(ext)) {
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          const lines = content.split('\n');
          const nonEmpty = lines.filter(l => l.trim().length > 0).length;
          const functions = (content.match(/function\s+\w+|const\s+\w+\s*=\s*(?:async\s+)?\(|fn\s+\w+|def\s+\w+|func\s+\w+/g) || []).length;
          const imports = (content.match(/^import\s|^from\s|^require\s*\(|^use\s/gm) || []).length;

          files.push({
            file: path.relative(projectPath, fullPath),
            ext,
            totalLines: lines.length,
            codeLines: nonEmpty,
            functions,
            imports,
            complexity: Math.round((nonEmpty * 0.1 + functions * 5 + imports * 2) * 10) / 10
          });
        } catch { /* ignore unreadable files */ }
      }
    }
  }

  scan(projectPath, 0);
  files.sort((a, b) => b.complexity - a.complexity);

  const totalLines = files.reduce((sum, f) => sum + f.totalLines, 0);
  const totalCodeLines = files.reduce((sum, f) => sum + f.codeLines, 0);
  const totalFunctions = files.reduce((sum, f) => sum + f.functions, 0);

  return {
    status: 'success',
    result: {
      projectPath,
      summary: {
        totalFiles: files.length,
        totalLines,
        totalCodeLines,
        totalFunctions,
        avgComplexity: files.length > 0 ? Math.round(files.reduce((s, f) => s + f.complexity, 0) / files.length * 10) / 10 : 0
      },
      hotspots: files.slice(0, 10),
      allFiles: files
    }
  };
}

function handleGenerateQualityReport(args) {
  const projectPath = args.projectPath || args.project_path || args.path;
  const format = (args.format || 'json').toLowerCase();

  if (!projectPath) return { status: 'error', result: '必须提供 projectPath 参数' };
  if (!fileExists(projectPath)) return { status: 'error', result: `项目路径不存在: ${projectPath}` };

  // 复杂度分析
  const complexity = handleAnalyzeComplexity({ projectPath, maxDepth: 3 });
  if (complexity.status === 'error') return complexity;

  // 检测可用的 linter
  const detectedLinter = detectLinter(projectPath);

  // 检查配置文件和潜在问题
  const issues = [];
  if (!fileExists(path.join(projectPath, '.gitignore'))) issues.push({ severity: 'warning', message: '缺少 .gitignore 文件' });
  if (!fileExists(path.join(projectPath, 'README.md')) && !fileExists(path.join(projectPath, 'readme.md'))) issues.push({ severity: 'warning', message: '缺少 README.md 文件' });
  if (!fileExists(path.join(projectPath, 'LICENSE'))) issues.push({ severity: 'info', message: '缺少 LICENSE 文件' });

  // 检查大文件
  const bigFiles = complexity.result.allFiles.filter(f => f.totalLines > 500);
  for (const f of bigFiles) {
    issues.push({ severity: 'warning', message: `大文件: ${f.file} (${f.totalLines} 行)`, file: f.file });
  }

  // 检查高复杂度函数
  const complexFiles = complexity.result.allFiles.filter(f => f.complexity > 50);
  for (const f of complexFiles) {
    issues.push({ severity: 'warning', message: `高复杂度: ${f.file} (复杂度: ${f.complexity})`, file: f.file });
  }

  const report = {
    projectPath,
    generatedAt: new Date().toISOString(),
    detectedLinter,
    codeStats: complexity.result.summary,
    hotspots: complexity.result.hotspots,
    issues,
    score: calculateQualityScore(complexity.result, issues)
  };

  if (format === 'markdown') {
    return { status: 'success', result: { format: 'markdown', report: generateMarkdownQualityReport(report), data: report } };
  }

  return { status: 'success', result: { format: 'json', report } };
}

function calculateQualityScore(complexityResult, issues) {
  let score = 100;
  // 扣分项
  const warningCount = issues.filter(i => i.severity === 'warning').length;
  score -= warningCount * 3;
  // 平均复杂度过高扣分
  if (complexityResult.summary.avgComplexity > 30) score -= 10;
  if (complexityResult.summary.avgComplexity > 50) score -= 10;
  return Math.max(0, Math.min(100, score));
}

function generateMarkdownQualityReport(report) {
  const lines = [
    `# 代码质量报告`,
    ``,
    `> 项目: ${report.projectPath}`,
    `> 生成时间: ${report.generatedAt}`,
    `> 质量评分: **${report.score}/100**`,
    ``,
    `## 代码统计`,
    `- 源代码文件: ${report.codeStats.totalFiles}`,
    `- 总行数: ${report.codeStats.totalLines}`,
    `- 代码行数: ${report.codeStats.totalCodeLines}`,
    `- 函数/方法数: ${report.codeStats.totalFunctions}`,
    `- 平均复杂度: ${report.codeStats.avgComplexity}`,
    ``
  ];

  if (report.detectedLinter) {
    lines.push(`## 检查工具`);
    lines.push(`检测到项目使用: **${report.detectedLinter}**`);
    lines.push('');
  }

  if (report.hotspots.length > 0) {
    lines.push(`## 复杂度热点`);
    lines.push(`| 文件 | 行数 | 函数数 | 复杂度 |`);
    lines.push(`|------|------|--------|--------|`);
    for (const f of report.hotspots.slice(0, 10)) {
      lines.push(`| ${f.file} | ${f.totalLines} | ${f.functions} | ${f.complexity} |`);
    }
    lines.push('');
  }

  if (report.issues.length > 0) {
    lines.push(`## 发现的问题 (${report.issues.length})`);
    for (const issue of report.issues) {
      const icon = issue.severity === 'warning' ? '⚠️' : 'ℹ️';
      lines.push(`- ${icon} ${issue.message}`);
    }
    lines.push('');
  }

  return lines.join('\n');
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
    printJsonOutput('error', '必须提供 command 参数。可用: runLinting, analyzeComplexity, generateQualityReport');
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

      if (cmd === 'runLinting') {
        // 异步命令在批量模式中也按异步处理
        hasAsync = true;
        const taskId = generateTaskId();
        const linter = detectLinter(params.projectPath || '') || DEFAULT_LINTER;
        executeLintInBackground(taskId, linter, params.projectPath || '', { fix: Boolean(params.fix), files: [] });
        results.push({ command: cmd, index, status: 'submitted', taskId, placeholder: `{{VCP_ASYNC_RESULT::GolutraCodeQuality::${taskId}}}` });
      } else if (cmd === 'analyzeComplexity') {
        results.push({ command: cmd, index, ...handleAnalyzeComplexity(params) });
      } else if (cmd === 'generateQualityReport') {
        results.push({ command: cmd, index, ...handleGenerateQualityReport(params) });
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
    case 'runLinting':
      handleRunLinting(request);
      break;
    case 'analyzeComplexity': {
      const result = handleAnalyzeComplexity(request);
      console.log(JSON.stringify(result));
      process.exit(0);
      break;
    }
    case 'generateQualityReport': {
      const result = handleGenerateQualityReport(request);
      console.log(JSON.stringify(result));
      process.exit(0);
      break;
    }
    default:
      printJsonOutput('error', `Unknown command: ${command}. Available: runLinting, analyzeComplexity, generateQualityReport`);
      process.exit(1);
  }
}

main().catch((err) => {
  printJsonOutput('error', `Plugin execution failed: ${err.message}`);
  process.exit(1);
});
