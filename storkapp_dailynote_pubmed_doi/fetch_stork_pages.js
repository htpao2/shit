#!/usr/bin/env node
const axios = require('axios');
const fs = require('fs').promises;
const fssync = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// --- 配置 ---
const WORK_DIR = __dirname;
const TARGET_DIR = path.join(WORK_DIR, 'fetched_webpages');
const STORK_IDS_NEW_TMP = path.join(WORK_DIR, 'stork_paper_ids.new.tmp.txt'); // 本身已存 PMID\tDOI
const PUBMED_IDS_TMP = path.join(WORK_DIR, 'pubmed_ids.tmp.txt');            // 相似文献 PMID\tDOI

const NCBI_EFETCH_BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi';
const DOI_RESOLVER_BASE = 'https://doi.org/';

const HTML_TO_MD_SCRIPT_PATH = path.join(WORK_DIR, 'html_to_md.js');
const PERMANENT_INDEX_FILE = path.join(WORK_DIR, 'paper_doi.index.txt');

const FETCH_INTERVAL_MS = parseInt(process.env.STORK_FETCH_INTERVAL_MS || '1000', 10);
const HTML_BATCH_SIZE = parseInt(process.env.HTML_BATCH_SIZE || '50', 10);

const COMMON_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
};
// --- 配置结束 ---

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function doiToKey(doi) {
  return String(doi).trim().replace(/\//g, '_');
}

function sanitizeFilename(name) {
  let n = String(name).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
  n = n.replace(/\s+/g, ' ').trim();
  n = n.replace(/[\. ]+$/g, '');
  return n || 'unknown';
}

async function readLines(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return content.split('\n').map(s => s.trim()).filter(Boolean);
  } catch (err) {
    return [];
  }
}

async function readTsvPairs(filePath) {
  const lines = await readLines(filePath);
  const pairs = [];
  for (const line of lines) {
    const [idRaw, doiRaw] = line.split('\t');
    const id = (idRaw || '').trim();
    const doi = (doiRaw || '').trim();
    if (id) {
      pairs.push({ id, doi });
    }
  }
  return pairs;
}

async function readPermanentIndex() {
  try {
    const txt = await fs.readFile(PERMANENT_INDEX_FILE, 'utf-8');
    return new Set(txt.split('\n').map(s => s.trim()).filter(Boolean));
  } catch (e) {
    if (e.code === 'ENOENT') return new Set();
    throw e;
  }
}

async function ensureCleanTargetDir() {
  await fs.rm(TARGET_DIR, { recursive: true, force: true });
  await fs.mkdir(TARGET_DIR, { recursive: true });
}

/**
 * 抓取并保存。优先保存为 .html (即使是 XML 也存为 .html 以便后续 html_to_md 统一处理)
 */
async function fetchAndSave(url, destPath, headers = {}) {
  try {
    const resp = await axios.get(url, { 
      headers: { ...COMMON_HEADERS, ...headers }, 
      timeout: 30000, 
      maxRedirects: 10 
    });
    if (resp.status === 200) {
      const data = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);
      await fs.writeFile(destPath, data);
      return true;
    }
    return false;
  } catch (err) {
    console.error(`[ERROR] 抓取失败: url=${url} -> ${err.message}`);
    return false;
  }
}

/**
 * 通过 DOI 获取页面 HTML (作为备用)
 */
async function fetchViaDoi(doi, destPath) {
  const url = `${DOI_RESOLVER_BASE}${encodeURIComponent(doi)}`;
  // 一些出版商可能需要特定的 Accept 头才能返回 HTML 页面而不是元数据
  return await fetchAndSave(url, destPath);
}

/**
 * 通过 PMID 获取 XML (主选)
 */
async function fetchViaPmid(pmid, destPath) {
  const url = `${NCBI_EFETCH_BASE}?db=pubmed&id=${encodeURIComponent(pmid)}&retmode=xml`;
  // 虽然是 XML，我们仍保存为 .html，html_to_md.js 会尝试解析它
  return await fetchAndSave(url, destPath);
}

async function buildTasks() {
  const mainPairs = await readTsvPairs(STORK_IDS_NEW_TMP);
  const similarPairs = await readTsvPairs(PUBMED_IDS_TMP);
  const permanent = await readPermanentIndex();

  const byDoi = new Map();

  const all = [...mainPairs, ...similarPairs];
  for (const { id, doi } of all) {
    if (!doi) continue;
    const key = sanitizeFilename(doiToKey(doi));
    if (permanent.has(key)) continue;
    // 如果重复，保留前面的
    if (!byDoi.has(key)) {
      byDoi.set(key, { pmid: id, doi });
    }
  }
  return byDoi;
}

function spawnHtmlToMdBatch(doiKeys) {
  if (!doiKeys || doiKeys.length === 0) return null;
  console.log(`--- 触发批次转换 (size=${doiKeys.length}) ---`);
  const p = spawn('node', [HTML_TO_MD_SCRIPT_PATH, ...doiKeys], { stdio: 'inherit', cwd: WORK_DIR });
  return p;
}

async function main() {
  console.log('--- fetch_stork_pages (无 Stork 版): 通过 NCBI/DOI 获取文献 ---');
  
  const tasks = await buildTasks();
  const entries = Array.from(tasks.entries());

  if (entries.length === 0) {
    console.log('无待抓取条目。');
    return;
  }

  await ensureCleanTargetDir();

  let ok = 0;
  let batchKeys = [];

  for (let i = 0; i < entries.length; i++) {
    const [doiKey, info] = entries[i];
    const dest = path.join(TARGET_DIR, `${doiKey}.html`);
    
    console.log(`[${i + 1}/${entries.length}] 处理: ${doiKey} (PMID: ${info.pmid})`);
    
    // 1. 尝试通过 PMID 获取 XML
    let success = await fetchViaPmid(info.pmid, dest);
    
    // 2. 如果 XML 抓取失败或为空，尝试抓取 DOI 页面
    if (!success && info.doi) {
      console.log(`  - PMID 抓取失败，尝试解析 DOI: ${info.doi}`);
      success = await fetchViaDoi(info.doi, dest);
    }

    if (success) {
      ok++;
      batchKeys.push(doiKey);
      if (batchKeys.length >= HTML_BATCH_SIZE) {
        spawnHtmlToMdBatch(batchKeys);
        batchKeys = [];
      }
    }
    
    if (i < entries.length - 1) await delay(FETCH_INTERVAL_MS);
  }

  if (batchKeys.length > 0) {
    spawnHtmlToMdBatch(batchKeys);
  }

  console.log(`抓取完成：成功 ${ok}/${entries.length}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
