#!/usr/bin/env node

/**
 * DeepwikiProcessor VCP插件 - 简化版本
 * 直接使用TypeScript源码，无需预构建
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 动态导入核心模块（使用TypeScript源码）
let crawl, htmlToMarkdown, resolveRepo, extractKeyword;

async function initializeModules() {
  try {
    // 直接导入TypeScript源文件（Node.js会处理）
    const crawlerModule = await import('./src/lib/httpCrawler.js');
    const converterModule = await import('./src/converter/htmlToMarkdown.js');
    const resolveModule = await import('./src/utils/resolveRepoFetch.js');
    const extractModule = await import('./src/utils/extractKeyword.js');
    
    crawl = crawlerModule.crawl;
    htmlToMarkdown = converterModule.htmlToMarkdown;
    resolveRepo = resolveModule.resolveRepo;
    extractKeyword = extractModule.extractKeyword;
  } catch (error) {
    console.error('Failed to load modules:', error);
    throw error;
  }
}

/**
 * 从stdin读取输入
 */
async function readStdin() {
  return new Promise((resolve, reject) => {
    let input = '';
    process.stdin.setEncoding('utf8');
    
    process.stdin.on('data', (chunk) => {
      input += chunk;
    });
    
    process.stdin.on('end', () => {
      resolve(input.trim());
    });
    
    process.stdin.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * 规范化URL，支持多种格式
 */
async function normalizeUrl(url) {
  if (typeof url !== 'string') {
    throw new Error('URL must be a string');
  }
  
  let normalizedUrl = url.trim();
  
  // 如果已经是完整的HTTP(S) URL，直接返回
  if (/^https?:\/\//.test(normalizedUrl)) {
    return normalizedUrl;
  }
  
  // 处理 owner/repo 格式
  if (/^[^/]+\/[^/]+$/.test(normalizedUrl)) {
    return `https://deepwiki.com/${normalizedUrl}`;
  }
  
  // 处理单个词或短语
  if (/^[^/]+$/.test(normalizedUrl)) {
    // 如果包含空格，先提取关键词
    if (normalizedUrl.includes(' ')) {
      try {
        const extracted = extractKeyword(normalizedUrl);
        if (extracted) {
          normalizedUrl = extracted;
        }
      } catch (e) {
        // 忽略关键词提取错误
      }
    }
    
    // 尝试通过GitHub API解析
    try {
      const repo = await resolveRepo(normalizedUrl);
      return `https://deepwiki.com/${repo}`;
    } catch {
      // 回退到默认处理
      return `https://deepwiki.com/${normalizedUrl}`;
    }
  }
  
  // 处理其他格式的短语
  try {
    const extracted = extractKeyword(normalizedUrl);
    if (extracted) {
      try {
        const repo = await resolveRepo(extracted);
        return `https://deepwiki.com/${repo}`;
      } catch {
        return `https://deepwiki.com/${extracted}`;
      }
    }
  } catch (e) {
    // 忽略关键词提取错误
  }
  
  throw new Error(`Unable to normalize URL: ${url}`);
}

/**
 * 清理文件名，确保可以安全地用作文件名
 */
function sanitizeFilename(filename) {
  return filename
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/^\.+/, '')
    .replace(/\.+$/, '')
    .substring(0, 200); // 限制文件名长度
}

/**
 * 移除Markdown格式，返回纯文本
 */
function stripMarkdown(content) {
  return content
    .replace(/#{1,6}\s+/g, '') // 标题
    .replace(/\*\*(.*?)\*\*/g, '$1') // 粗体
    .replace(/\*(.*?)\*/g, '$1') // 斜体
    .replace(/`(.*?)`/g, '$1') // 行内代码
    .replace(/```[\s\S]*?```/g, '') // 代码块
    .replace(/\[(.*?)\]\(.*?\)/g, '$1') // 链接
    .replace(/!\[(.*?)\]\(.*?\)/g, '$1') // 图片
    .replace(/^\s*[-*+]\s+/gm, '') // 列表项
    .replace(/^\s*\d+\.\s+/gm, '') // 有序列表
    .replace(/^\s*>\s+/gm, '') // 引用
    .replace(/\n{3,}/g, '\n\n') // 多余的换行
    .trim();
}

/**
 * 保存内容到文件
 */
async function saveToFiles(pages, options) {
  const outputDir = options.outputPath || process.env.OUTPUT_DIR || './deepwiki-output';
  await fs.mkdir(outputDir, { recursive: true });
  
  const savedFiles = [];
  
  for (const page of pages) {
    const filename = sanitizeFilename(page.path || 'index');
    const extension = options.saveFormat === 'txt' ? 'txt' : 'md';
    const filepath = path.join(outputDir, `${filename}.${extension}`);
    
    let content = page.markdown;
    if (options.saveFormat === 'txt') {
      content = stripMarkdown(content);
    }
    
    await fs.writeFile(filepath, content, 'utf8');
    savedFiles.push(filepath);
  }
  
  return savedFiles;
}

/**
 * 处理FetchContent命令
 */
async function handleFetchContent(request) {
  // 规范化URL
  const normalizedUrl = await normalizeUrl(request.url);
  
  // 验证域名
  const url = new URL(normalizedUrl);
  if (url.hostname !== 'deepwiki.com') {
    throw new Error('Only deepwiki.com domains are allowed');
  }
  
  // 验证爬取深度
  const maxDepth = request.maxDepth || 1;
  if (maxDepth > 1) {
    throw new Error('maxDepth > 1 is not allowed');
  }
  
  // 执行爬取
  const crawlResult = await crawl({
    root: url,
    maxDepth: maxDepth,
    emit: (progress) => {
      // 在VCP模式下，不输出进度信息到stdout
      if (request.verbose) {
        console.error(`Progress: ${progress.url} - ${progress.bytes} bytes`);
      }
    },
    verbose: request.verbose || false
  });
  
  // 转换为Markdown
  const pages = await Promise.all(
    Object.entries(crawlResult.html).map(async ([path, html]) => ({
      path,
      markdown: await htmlToMarkdown(html, request.mode || 'aggregate')
    }))
  );
  
  // 保存文件（如果需要）
  let savedFiles = null;
  if (request.saveFormat) {
    savedFiles = await saveToFiles(pages, request);
  }
  
  // 返回结果
  const result = {
    content: pages.map(page => ({
      type: 'text',
      text: `# ${page.path}\n\n${page.markdown}`
    })),
    totalPages: pages.length,
    totalBytes: crawlResult.bytes,
    elapsedMs: crawlResult.elapsedMs
  };
  
  if (savedFiles) {
    result.savedFiles = savedFiles;
    result.message = `内容已保存到 ${savedFiles.length} 个文件`;
  }
  
  return result;
}

/**
 * 处理SearchContent命令
 */
async function handleSearchContent(request) {
  // 规范化URL
  const normalizedUrl = await normalizeUrl(request.url);
  const url = new URL(normalizedUrl);
  
  if (url.hostname !== 'deepwiki.com') {
    throw new Error('Only deepwiki.com domains are allowed');
  }
  
  // 执行爬取
  const crawlResult = await crawl({
    root: url,
    maxDepth: request.maxDepth || 1,
    emit: () => {},
    verbose: request.verbose || false
  });
  
  // 搜索匹配
  const query = request.query;
  const maxMatches = request.maxMatches || 10;
  const safe = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(safe, 'i');
  const matches = [];
  
  for (const [path, html] of Object.entries(crawlResult.html)) {
    if (matches.length >= maxMatches) break;
    
    const markdown = await htmlToMarkdown(html, request.mode || 'aggregate');
    let match;
    while ((match = re.exec(markdown)) !== null) {
      const start = Math.max(0, match.index - 80);
      const end = Math.min(markdown.length, match.index + match[0].length + 80);
      const rawSnippet = markdown.slice(start, end);
      const snippet = rawSnippet.replace(re, s => `**${s}**`);
      
      matches.push({ path, snippet });
      
      if (matches.length >= maxMatches) break;
    }
  }
  
  const result = {
    query: query,
    matches: matches,
    totalSearchedPages: Object.keys(crawlResult.html).length,
    totalMatches: matches.length
  };
  
  // 保存搜索结果（如果需要）
  if (request.saveResults) {
    const outputDir = request.outputPath || process.env.OUTPUT_DIR || './deepwiki-output';
    await fs.mkdir(outputDir, { recursive: true });
    
    const filename = `search_${sanitizeFilename(query)}_${Date.now()}.json`;
    const filepath = path.join(outputDir, filename);
    
    await fs.writeFile(filepath, JSON.stringify(result, null, 2), 'utf8');
    result.savedFile = filepath;
    result.message = `搜索结果已保存到 ${filepath}`;
  }
  
  return result;
}

/**
 * 主函数
 */
async function main() {
  try {
    // 初始化模块
    await initializeModules();
    
    // 读取stdin输入
    const input = await readStdin();
    const request = JSON.parse(input);
    
    // 处理命令
    let result;
    
    switch (request.command) {
      case 'FetchContent':
        result = await handleFetchContent(request);
        break;
      case 'SearchContent':
        result = await handleSearchContent(request);
        break;
      default:
        throw new Error(`Unknown command: ${request.command}`);
    }
    
    // 输出结果
    const output = {
      status: "success",
      result: result
    };
    
    console.log(JSON.stringify(output));
    
  } catch (error) {
    console.log(JSON.stringify({
      status: "error",
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }));
  }
  
  process.exit(0);
}

// 启动主函数
main().catch(console.error);