/**
 * GolutraResultAggregator — VCP 同步插件入口
 *
 * 核心功能：收集和整理多个异步任务的执行结果
 * 与 GolutraCLIExecutor 的异步回调结果配合使用
 *
 * 工作方式：
 *   - 读取 VCPAsyncResults 目录下的 JSON 结果文件
 *   - 按任务ID收集结果
 *   - 生成聚合报告
 *
 * 遵循 VCP 同步插件规范
 */

const fs = require('fs');
const path = require('path');

// ─── 配置 ───────────────────────────────────────────────────

const RESULTS_DIR = process.env.RESULTS_DIR || 'VCPAsyncResults';
const MAX_RESULTS = parseInt(process.env.MAX_RESULTS) || 50;
const RESULT_RETENTION_HOURS = parseInt(process.env.RESULT_RETENTION_HOURS) || 72;

// ─── 工具函数 ───────────────────────────────────────────────

function resolveResultsDir() {
  if (path.isAbsolute(RESULTS_DIR)) return RESULTS_DIR;
  return path.resolve(process.cwd(), RESULTS_DIR);
}

function safeReadJSON(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function getAllResultFiles() {
  const dir = resolveResultsDir();
  if (!fs.existsSync(dir)) return [];

  try {
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    return files.map(f => {
      const fullPath = path.join(dir, f);
      const data = safeReadJSON(fullPath);
      if (!data) return null;

      let mtime;
      try { mtime = fs.statSync(fullPath).mtime; } catch { mtime = new Date(); }

      return {
        fileName: f,
        filePath: fullPath,
        data,
        taskId: data.requestId || f.replace('.json', ''),
        status: data.status || 'Unknown',
        completedAt: data.completedAt || mtime.toISOString(),
        mtime
      };
    }).filter(Boolean);
  } catch {
    return [];
  }
}

function getResultByTaskId(taskId) {
  // 先尝试直接按文件名查找
  const dir = resolveResultsDir();
  const directPath = path.join(dir, `${taskId}.json`);
  if (fs.existsSync(directPath)) {
    const data = safeReadJSON(directPath);
    if (data) return data;
  }

  // 遍历查找
  const allFiles = getAllResultFiles();
  const match = allFiles.find(f => f.taskId === taskId);
  return match ? match.data : null;
}

function isExpired(dateStr) {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  const now = new Date();
  const hoursDiff = (now - date) / (1000 * 60 * 60);
  return hoursDiff > RESULT_RETENTION_HOURS;
}

// ─── 命令处理 ────────────────────────────────────────────────

function handleCollectResults(args) {
  let taskIds = args.taskIds || args.task_ids || args.ids;
  const includeRaw = Boolean(args.includeRaw || args.include_raw);

  if (!taskIds) return { status: 'error', result: '必须提供 taskIds 参数 (任务ID数组)' };

  // 处理字符串形式的数组
  if (typeof taskIds === 'string') {
    try { taskIds = JSON.parse(taskIds); } catch {
      taskIds = taskIds.split(',').map(s => s.trim());
    }
  }

  if (!Array.isArray(taskIds) || taskIds.length === 0) {
    return { status: 'error', result: 'taskIds 必须是非空数组' };
  }

  const results = [];
  let succeeded = 0;
  let failed = 0;
  let pending = 0;

  for (const taskId of taskIds) {
    const data = getResultByTaskId(taskId);
    if (!data) {
      results.push({ taskId, status: 'NotFound', result: null });
      pending++;
      continue;
    }

    const entry = {
      taskId,
      status: data.status || 'Unknown',
      tool: data.tool || null,
      exitCode: data.exitCode !== undefined ? data.exitCode : null,
      completedAt: data.completedAt || null,
      message: data.message || null
    };

    if (includeRaw) {
      entry.stdout = data.stdout || null;
      entry.stderr = data.stderr || null;
    } else {
      // 只包含摘要
      if (data.stdout) {
        entry.outputPreview = data.stdout.substring(0, 500) + (data.stdout.length > 500 ? '...' : '');
        entry.outputLength = data.stdout.length;
      }
    }

    results.push(entry);

    if (data.status === 'Succeed') succeeded++;
    else if (data.status === 'Failed') failed++;
    else pending++;
  }

  return {
    status: 'success',
    result: {
      results,
      summary: {
        total: taskIds.length,
        succeeded,
        failed,
        pending,
        notFound: taskIds.length - succeeded - failed - pending + pending
      }
    }
  };
}

function handleGenerateReport(args) {
  let taskIds = args.taskIds || args.task_ids || args.ids;
  const format = (args.format || 'summary').toLowerCase();
  const since = args.since || null;

  let allFiles;
  if (taskIds) {
    // 如果给了 taskIds，用指定的
    if (typeof taskIds === 'string') {
      try { taskIds = JSON.parse(taskIds); } catch { taskIds = taskIds.split(',').map(s => s.trim()); }
    }
    allFiles = taskIds.map(id => {
      const data = getResultByTaskId(id);
      if (!data) return null;
      return {
        taskId: id,
        data,
        status: data.status || 'Unknown',
        completedAt: data.completedAt || null
      };
    }).filter(Boolean);
  } else {
    allFiles = getAllResultFiles();
  }

  // 时间过滤
  if (since) {
    const sinceDate = new Date(since);
    allFiles = allFiles.filter(f => new Date(f.completedAt || f.mtime) >= sinceDate);
  }

  // 限制数量
  allFiles = allFiles.slice(0, MAX_RESULTS);

  // 统计
  const stats = {
    total: allFiles.length,
    succeeded: allFiles.filter(f => (f.data || f).status === 'Succeed').length,
    failed: allFiles.filter(f => (f.data || f).status === 'Failed').length,
    other: 0
  };
  stats.other = stats.total - stats.succeeded - stats.failed;

  // 按工具统计
  const toolStats = {};
  for (const file of allFiles) {
    const tool = (file.data || file).tool || 'unknown';
    if (!toolStats[tool]) toolStats[tool] = { total: 0, succeeded: 0, failed: 0 };
    toolStats[tool].total++;
    if ((file.data || file).status === 'Succeed') toolStats[tool].succeeded++;
    if ((file.data || file).status === 'Failed') toolStats[tool].failed++;
  }

  const report = {
    generatedAt: new Date().toISOString(),
    period: since ? { since } : { last: `${RESULT_RETENTION_HOURS}h` },
    statistics: stats,
    byTool: toolStats,
    tasks: allFiles.map(f => ({
      taskId: f.taskId,
      status: (f.data || f).status,
      tool: (f.data || f).tool || null,
      completedAt: f.completedAt || (f.data || f).completedAt || null,
      message: (f.data || f).message || null
    }))
  };

  if (format === 'markdown') {
    return {
      status: 'success',
      result: { format: 'markdown', report: generateMarkdownReport(report), data: report }
    };
  }

  if (format === 'summary') {
    return {
      status: 'success',
      result: {
        format: 'summary',
        summary: `共 ${stats.total} 个任务: ${stats.succeeded} 成功, ${stats.failed} 失败, ${stats.other} 其他`,
        statistics: stats,
        byTool: toolStats
      }
    };
  }

  return { status: 'success', result: { format: 'json', report } };
}

function handleGetResult(args) {
  const taskId = args.taskId || args.task_id || args.id;
  if (!taskId) return { status: 'error', result: '必须提供 taskId 参数' };

  const data = getResultByTaskId(taskId);
  if (!data) return { status: 'error', result: `未找到任务 ${taskId} 的结果` };

  return {
    status: 'success',
    result: {
      taskId,
      ...data
    }
  };
}

function handleListResults(args) {
  const statusFilter = args.status || args.Status;
  const limit = parseInt(args.limit) || MAX_RESULTS;

  let files = getAllResultFiles();

  // 状态过滤
  if (statusFilter) {
    files = files.filter(f => f.status.toLowerCase() === statusFilter.toLowerCase());
  }

  // 按时间倒序
  files.sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));

  // 限制数量
  files = files.slice(0, limit);

  return {
    status: 'success',
    result: {
      results: files.map(f => ({
        taskId: f.taskId,
        status: f.status,
        tool: f.data.tool || null,
        completedAt: f.completedAt,
        fileName: f.fileName
      })),
      count: files.length,
      filter: statusFilter || 'all'
    }
  };
}

function generateMarkdownReport(report) {
  const lines = [
    `# 任务执行聚合报告`,
    ``,
    `> 生成时间: ${report.generatedAt}`,
    ``,
    `## 总体统计`,
    `- 总任务数: **${report.statistics.total}**`,
    `- 成功: **${report.statistics.succeeded}** ✅`,
    `- 失败: **${report.statistics.failed}** ❌`,
    `- 其他: **${report.statistics.other}**`,
    ``
  ];

  if (Object.keys(report.byTool).length > 0) {
    lines.push(`## 按工具统计`);
    lines.push(`| 工具 | 总数 | 成功 | 失败 |`);
    lines.push(`|------|------|------|------|`);
    for (const [tool, stats] of Object.entries(report.byTool)) {
      lines.push(`| ${tool} | ${stats.total} | ${stats.succeeded} | ${stats.failed} |`);
    }
    lines.push('');
  }

  if (report.tasks.length > 0) {
    lines.push(`## 任务详情`);
    lines.push(`| 任务ID | 状态 | 工具 | 完成时间 |`);
    lines.push(`|--------|------|------|----------|`);
    for (const task of report.tasks.slice(0, 20)) {
      const statusIcon = task.status === 'Succeed' ? '✅' : task.status === 'Failed' ? '❌' : '⏳';
      lines.push(`| ${task.taskId.substring(0, 8)}... | ${statusIcon} ${task.status} | ${task.tool || '-'} | ${task.completedAt || '-'} |`);
    }
    if (report.tasks.length > 20) {
      lines.push(`> ... 还有 ${report.tasks.length - 20} 个任务`);
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

function handleSingleCommand(command, params) {
  switch (command) {
    case 'collectResults': return handleCollectResults(params);
    case 'generateReport': return handleGenerateReport(params);
    case 'getResult': return handleGetResult(params);
    case 'listResults': return handleListResults(params);
    default:
      return { status: 'error', result: `Unknown command: ${command}. Available: collectResults, generateReport, getResult, listResults` };
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
      result: '必须提供 command 参数。可用: collectResults, generateReport, getResult, listResults'
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
