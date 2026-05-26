const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');

// --- 配置 ---
// 要扫描的目录
const SOURCE_DIR = path.join(__dirname, '..', 'mail_store', 'support_storkapp.me');
// 临时索引文件路径 (为了兼容，这里仍存储 PMID 列表)
const TEMP_INDEX_FILE = path.join(__dirname, 'stork_paper_ids.tmp.txt');
// 永久索引文件路径 (现在存 PMID)
const PERMANENT_INDEX_FILE = path.join(__dirname, 'stork_paper_ids.txt');
 // 抓取脚本的路径 (已不再使用，但在配置中保留以防引用)
 const FETCH_SCRIPT_PATH = path.join(__dirname, 'fetch_stork_pages.js');
 const FETCH_PUBMED_SIMILARS_SCRIPT_PATH = path.join(__dirname, 'fetch_pubmed_similars.js');
 // 仅本次新增 PMID\tDOI 列表文件
 const NEW_STORK_TMP_FILE = path.join(__dirname, 'stork_paper_ids.new.tmp.txt');
 // 旧的链接文件，脚本会尝试删除它
 const OLD_LINKS_FILE = path.join(__dirname, 'stork_links.txt');
 // --- 配置结束 ---

/**
 * 从给定的文本内容中提取 PubMed ID 和 DOI。
 * @param {string} content - 文件内容。
 * @returns {Array<{pmid: string, doi: string}>} - 提取到的论文信息数组
 */
function extractPaperInfo(content) {
    const papers = [];
    // 匹配示例: PMID: 41197329 doi: 10.1016/j.ijmedinf.2025.106171
    const regex = /PMID:\s*(\d+)\s+doi:\s*([^\s"'\)]+)/g;
    
    let match;
    while ((match = regex.exec(content)) !== null) {
        const pmid = match[1];
        const doi = match[2];
        papers.push({ pmid, doi });
    }
    return papers;
}

/**
 * 读取永久索引文件。
 * @returns {Promise<Set<string>>}
 */
async function readPermanentIndex() {
    try {
        const content = await fs.readFile(PERMANENT_INDEX_FILE, 'utf-8');
        return new Set(content.split('\n').map(s => s.trim()).filter(Boolean));
    } catch (error) {
        if (error.code === 'ENOENT') {
            return new Set();
        }
        throw error;
    }
}

/**
 * 调用抓取脚本
 * @param {Array<{pmid: string, doi: string}>} newPapers - 需要抓取的新论文列表
 * @returns {Promise<void>}
 */
async function triggerPipeline(newPapers) {
    if (!Array.isArray(newPapers) || newPapers.length === 0) {
        console.log("- 没有新的 ID，跳过相似抓取流程。");
        return;
    }

    // 1) 写入仅本次新增的 PMID\tDOI 列表，格式为 "pmid\tdoi"
    // 后续 fetch_pubmed_similars.js 会读取这个文件
    const lines = newPapers.map(p => `${p.pmid}\t${p.doi}`);
    await fs.writeFile(NEW_STORK_TMP_FILE, lines.join('\n'));
    console.log(`- 已写入新增 ID 到: ${NEW_STORK_TMP_FILE}`);

    // 2) 先运行相似文献抓取（生成 pubmed_ids.tmp.txt 并链式触发后续流程）
    console.log(`\n--- 开始调用相似文献抓取脚本 ---`);
    await new Promise((resolve, reject) => {
        const p = spawn('node', [FETCH_PUBMED_SIMILARS_SCRIPT_PATH], { stdio: 'inherit' });
        p.on('close', (code) => {
            console.log(`--- 相似文献抓取脚本结束，退出码: ${code} ---`);
            code === 0 ? resolve() : reject(new Error(`相似抓取失败，退出码: ${code}`));
        });
        p.on('error', (err) => reject(err));
    });

    // 注意：fetch_pubmed_similars.js 脚本内部已经包含了对 fetch_stork_pages.js 的链式调用，
    // 而 fetch_stork_pages.js 会根据 PMID 请求 https://www.storkapp.me/pubpaper/ID
    // 这样就跳过了原本的 https://www.storkapp.cn/paper/showPaper.php?id=ID
}

/**
 * 主执行函数
 */
async function main() {
    console.log(`开始扫描目录: ${SOURCE_DIR}`);
    
    const permanentIds = await readPermanentIndex();
    const uniquePapers = new Map(); // key: pmid, value: doi
    let processedFileCount = 0;
    let totalPapersFound = 0;

    try {
        const files = await fs.readdir(SOURCE_DIR);
        const mdFiles = files.filter(file => file.endsWith('.md'));
        console.log(`发现 ${mdFiles.length} 个 .md 文件。`);

        for (const file of mdFiles) {
            const filePath = path.join(SOURCE_DIR, file);
            try {
                const content = await fs.readFile(filePath, 'utf-8');
                const extracted = extractPaperInfo(content);
                extracted.forEach(p => {
                    if (!uniquePapers.has(p.pmid)) {
                        uniquePapers.set(p.pmid, p.doi);
                    }
                });
                totalPapersFound += extracted.length;
                processedFileCount++;
            } catch (readError) {
                console.error(`读取文件失败: ${filePath}`, readError);
            }
        }

        const paperArray = Array.from(uniquePapers.entries()).map(([pmid, doi]) => ({ pmid, doi }));
        
        if (paperArray.length > 0) {
            // 写入 PMID 列表到临时文件（供参考）
            await fs.writeFile(TEMP_INDEX_FILE, paperArray.map(p => p.pmid).join('\n'));
            console.log(`\n- 本次扫描发现 ${totalPapersFound} 个记录，提取到 ${paperArray.length} 个唯一 PMID。`);
            console.log(`- 临时索引已保存到: ${TEMP_INDEX_FILE}`);
        } else {
            console.log('\n- 本次扫描未找到任何符合条件的 PMID。');
            return;
        }

        const newPapers = paperArray.filter(p => !permanentIds.has(p.pmid));

        if (newPapers.length > 0) {
            console.log(`- 发现 ${newPapers.length} 个新 PMID，将启动处理流程（相似抓取 -> 页面抓取）。`);
            await triggerPipeline(newPapers);
            
            // 更新永久索引（简单追加 PMID）
            const newIdsText = newPapers.map(p => p.pmid).join('\n') + '\n';
            await fs.appendFile(PERMANENT_INDEX_FILE, newIdsText);
            console.log(`- 已更新永久索引文件。`);
        } else {
            console.log(`- 未发现新 ID，无需处理。`);
        }

        // 打印当前永久索引总数
        const finalPermanentIds = await readPermanentIndex();
        console.log(`- 当前永久索引总数: ${finalPermanentIds.size}`);
        console.log(`- 永久索引文件: ${PERMANENT_INDEX_FILE}`);

        // 尝试删除旧文件
        try {
            await fs.unlink(OLD_LINKS_FILE);
            console.log(`- 已成功删除旧的链接文件: ${OLD_LINKS_FILE}`);
        } catch (unlinkError) {
            if (unlinkError.code !== 'ENOENT') {
                console.warn(`- 删除旧链接文件失败: ${OLD_LINKS_FILE}`, unlinkError);
            }
        }

    } catch (error) {
        console.error(`\n执行过程中发生严重错误:`, error);
        if (error.code === 'ENOENT') {
            console.error(`错误详情: 目录不存在，请检查路径 '${SOURCE_DIR}' 是否正确。`);
        }
    }
}

main();
