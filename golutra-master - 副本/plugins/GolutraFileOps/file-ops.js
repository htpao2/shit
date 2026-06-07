/**
 * GolutraFileOps — VCP 同步插件入口
 *
 * 核心功能：增强的文件操作和项目文件理解
 * 支持超栈追踪 (Hyper-Stack-Trace) 的分布式文件访问
 * 参考：VCP 插件开发手册 4.4 节
 */

const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE) || 10485760; // 10MB
const DEFAULT_ENCODING = process.env.DEFAULT_ENCODING || 'utf8';

// ─── 超栈追踪支持 ───────────────────────────────────────────
// 移植自 VCP 手册 4.4 节 — 处理分布式文件 URL

function resolveFilePath(filePath) {
  if (filePath.startsWith('file://')) {
    try {
      return new URL(filePath).pathname;
    } catch {
      return filePath.replace('file://', '');
    }
  }
  return filePath;
}

function readFileWithFallback(filePath, encoding) {
  const resolved = resolveFilePath(filePath);
  try {
    return fs.readFileSync(resolved, encoding || DEFAULT_ENCODING);
  } catch (err) {
    if (err.code === 'ENOENT' && filePath.startsWith('file://')) {
      // 超栈追踪：本地未找到，需要远程获取
      return {
        _hyperStackTrace: true,
        status: 'error',
        code: 'FILE_NOT_FOUND_LOCALLY',
        error: '本地文件未找到，需要远程获取。',
        fileUrl: filePath
      };
    }
    throw err;
  }
}

// ─── 文件操作 ────────────────────────────────────────────────

function handleReadFile(args) {
  const filePath = args.filePath || args.filepath || args.path;
  const encoding = args.encoding || DEFAULT_ENCODING;

  if (!filePath) return { status: 'error', result: '必须提供 filePath 参数' };

  const resolved = resolveFilePath(filePath);
  if (!fs.existsSync(resolved)) {
    // 超栈追踪检查
    if (filePath.startsWith('file://')) {
      return {
        status: 'error',
        code: 'FILE_NOT_FOUND_LOCALLY',
        error: '本地文件未找到，需要远程获取。',
        fileUrl: filePath
      };
    }
    return { status: 'error', result: `文件不存在: ${filePath}` };
  }

  const stats = fs.statSync(resolved);
  if (stats.size > MAX_FILE_SIZE) {
    return { status: 'error', result: `文件过大 (${stats.size} 字节)，最大限制 ${MAX_FILE_SIZE} 字节` };
  }

  try {
    const content = fs.readFileSync(resolved, encoding);
    return {
      status: 'success',
      result: {
        filePath: resolved,
        content,
        size: stats.size,
        encoding,
        modifiedAt: stats.mtime.toISOString()
      }
    };
  } catch (err) {
    return { status: 'error', result: `读取文件失败: ${err.message}` };
  }
}

function handleWriteFile(args) {
  const filePath = args.filePath || args.filepath || args.path;
  const content = args.content;
  const encoding = args.encoding || DEFAULT_ENCODING;
  const createDirs = args.createDirs !== false;

  if (!filePath) return { status: 'error', result: '必须提供 filePath 参数' };
  if (content === undefined || content === null) return { status: 'error', result: '必须提供 content 参数' };

  try {
    const resolved = resolveFilePath(filePath);
    if (createDirs) {
      const dir = path.dirname(resolved);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(resolved, content, encoding);
    const stats = fs.statSync(resolved);
    return {
      status: 'success',
      result: {
        filePath: resolved,
        size: stats.size,
        encoding,
        message: `文件已写入: ${resolved}`
      }
    };
  } catch (err) {
    return { status: 'error', result: `写入文件失败: ${err.message}` };
  }
}

function handleListDirectory(args) {
  const dirPath = args.directoryPath || args.directorypath || args.path || args.dir;
  const showHidden = Boolean(args.showHidden);
  const recursive = Boolean(args.recursive);
  const maxDepth = args.maxDepth || 3;

  if (!dirPath) return { status: 'error', result: '必须提供 directoryPath 参数' };
  if (!fs.existsSync(dirPath)) return { status: 'error', result: `目录不存在: ${dirPath}` };

  const entries = [];
  function scan(currentPath, depth) {
    if (depth > maxDepth) return;
    let items;
    try { items = fs.readdirSync(currentPath, { withFileTypes: true }); } catch { return; }
    for (const item of items) {
      if (!showHidden && item.name.startsWith('.')) continue;
      const fullPath = path.join(currentPath, item.name);
      const relativePath = path.relative(dirPath, fullPath);
      const entry = { name: item.name, path: relativePath, type: item.isDirectory() ? 'directory' : 'file' };
      if (!item.isDirectory()) {
        try {
          const stats = fs.statSync(fullPath);
          entry.size = stats.size;
          entry.modifiedAt = stats.mtime.toISOString();
        } catch { /* ignore */ }
      }
      entries.push(entry);
      if (recursive && item.isDirectory() && item.name !== 'node_modules' && item.name !== '.git') {
        scan(fullPath, depth + 1);
      }
    }
  }

  scan(dirPath, 0);
  return {
    status: 'success',
    result: { directoryPath: dirPath, entries, count: entries.length, recursive, showHidden }
  };
}

function handleDeleteFile(args) {
  const filePath = args.filePath || args.filepath || args.path;
  if (!filePath) return { status: 'error', result: '必须提供 filePath 参数' };

  const resolved = resolveFilePath(filePath);
  if (!fs.existsSync(resolved)) return { status: 'error', result: `文件不存在: ${filePath}` };

  try {
    fs.unlinkSync(resolved);
    return { status: 'success', result: { filePath: resolved, message: `文件已删除: ${resolved}` } };
  } catch (err) {
    return { status: 'error', result: `删除文件失败: ${err.message}` };
  }
}

function handleFileInfo(args) {
  const filePath = args.filePath || args.filepath || args.path;
  if (!filePath) return { status: 'error', result: '必须提供 filePath 参数' };

  const resolved = resolveFilePath(filePath);
  if (!fs.existsSync(resolved)) return { status: 'error', result: `文件不存在: ${filePath}` };

  try {
    const stats = fs.statSync(resolved);
    return {
      status: 'success',
      result: {
        filePath: resolved,
        type: stats.isDirectory() ? 'directory' : stats.isFile() ? 'file' : 'other',
        size: stats.size,
        createdAt: stats.birthtime.toISOString(),
        modifiedAt: stats.mtime.toISOString(),
        accessedAt: stats.atime.toISOString(),
        permissions: stats.mode.toString(8),
        extension: path.extname(resolved)
      }
    };
  } catch (err) {
    return { status: 'error', result: `获取文件信息失败: ${err.message}` };
  }
}

// ─── 批量调用 + 主入口 ───────────────────────────────────────

function handleSingle(command, params) {
  switch (command) {
    case 'ReadFile': return handleReadFile(params);
    case 'WriteFile': return handleWriteFile(params);
    case 'ListDirectory': return handleListDirectory(params);
    case 'DeleteFile': return handleDeleteFile(params);
    case 'FileInfo': return handleFileInfo(params);
    default: return { status: 'error', result: `Unknown command: ${command}` };
  }
}

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

async function main() {
  let inputData = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) { inputData += chunk; }

  let request;
  try { request = JSON.parse(inputData.trim()); }
  catch (err) { console.log(JSON.stringify({ status: 'error', result: `Invalid JSON: ${err.message}` })); process.exit(1); }

  const command = request.command || request.command1;
  if (!command) {
    console.log(JSON.stringify({ status: 'error', result: '必须提供 command。可用: ReadFile, WriteFile, ListDirectory, DeleteFile, FileInfo' }));
    process.exit(1);
  }

  // 批量调用
  if (request.command1 && request.command2) {
    const results = [];
    let i = 1;
    while (request[`command${i}`]) {
      results.push({ command: request[`command${i}`], index: i, ...handleSingle(request[`command${i}`], extractParamsForIndex(request, i)) });
      i++;
    }
    console.log(JSON.stringify({ status: 'success', result: { batchResults: results, totalCommands: i - 1 } }));
    process.exit(0);
  }

  const result = handleSingle(command, request);
  console.log(JSON.stringify(result));
  process.exit(result.status === 'error' && result.code === 'FILE_NOT_FOUND_LOCALLY' ? 1 : 0);
}

main().catch(err => { console.log(JSON.stringify({ status: 'error', result: err.message })); process.exit(1); });
