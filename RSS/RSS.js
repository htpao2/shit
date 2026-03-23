const fs = require('fs');
const path = require('path');
const https = require('https');
const { XMLParser } = require('fast-xml-parser');

// ================= 配置初始化 =================
const RSS_FEED_URL = process.env.RSS_FEED_URL || 'https://raw.githubusercontent.com/imjuya/juya-ai-daily/master/feed.xml';
const RSS_SAVE_PATH = process.env.RSS_SAVE_PATH || './DailyNews';
const FETCH_INTERVAL_MS = parseInt(process.env.FETCH_INTERVAL_MS || '3600000', 10);

if (!fs.existsSync(RSS_SAVE_PATH)) {
    fs.mkdirSync(RSS_SAVE_PATH, { recursive: true });
}

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix : ""
});

// ================= 辅助函数 =================

/**
 * 抓取 RSS 内容
 */
async function fetchRSS() {
    return new Promise((resolve, reject) => {
        https.get(RSS_FEED_URL, (res) => {
            if (res.statusCode !== 200) {
                return reject(new Error(`请求失败，状态码: ${res.statusCode}`));
            }
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try { resolve(parser.parse(data)); } catch (e) { reject(e); }
            });
        }).on('error', reject);
    });
}

/**
 * 保存数据到本地目录（每日一个文件）
 */
function saveToDailyFile(content) {
    const today = new Date().toISOString().split('T')[0];
    const filePath = path.join(RSS_SAVE_PATH, `daily_news_${today}.json`);
    fs.writeFileSync(filePath, JSON.stringify(content, null, 2, 'utf-8'));
    return filePath;
}

/**
 * 核心逻辑：从 Markdown 格式的早报正文中精准提取“概览”版块
 */
function extractDailyOverview(fullMarkdown) {
    if (!fullMarkdown) return "无法解析早报正文。";

    // 逻辑：匹配 "## 概览" 到 下一个 "##" 之间的内容
    // 这种格式符合用户提供的早报规范
    const regex = /##\s*概览([\s\S]*?)(?=##|$)/i;
    const match = fullMarkdown.match(regex);

    if (match && match[1]) {
        let overview = match[1].trim();
        // 简单清洗：去除多余的空行或图片链接（如果需要更清爽的话）
        return overview;
    }

    // 兜底策略：如果没找到概览，则尝试寻找第一个章节
    return "已成功获取早报，但未检测到指定的“概览”章节。请查看完整版内容。";
}

// ================= 插件运行循环 =================

async function runStaticPlugin() {
    try {
        const rssData = await fetchRSS();
        
        // 分支处理：适配 Atom (feed.entry) 或 RSS 2.0 (rss.channel.item)
        let items = [];
        if (rssData.rss && rssData.rss.channel && rssData.rss.channel.item) {
            items = Array.isArray(rssData.rss.channel.item) ? rssData.rss.channel.item : [rssData.rss.channel.item];
        } else if (rssData.feed && rssData.feed.entry) {
            items = Array.isArray(rssData.feed.entry) ? rssData.feed.entry : [rssData.feed.entry];
        }

        if (items.length === 0) throw new Error("RSS 源中未发现任何条目。");

        // 目标：获取每日最新的那一条完整早报
        const latestDailyReport = items[0]; 
        const title = latestDailyReport.title || "今日早报";
        const link = latestDailyReport.link?.href || latestDailyReport.link || "";
        const content = latestDailyReport.description || latestDailyReport.summary || latestDailyReport.content || "";
        
        // 核心：提取概览
        const overview = extractDailyOverview(content);

        // 持久化保存
        saveToDailyFile({
            updateTime: new Date().toLocaleString(),
            title,
            link,
            overview,
            fullContent: content
        });

        // ================= VCP 协议输出 =================
        // 静态插件通过打印这个 JSON 到 stdout，VCP 核心会自动捕获并更新 {{VCPRSS}}
        const vcpOutput = {
            vcp_dynamic_fold: true,
            plugin_description: "每日 AI 早报与行业简报抓取插件。提供今日最新的要闻概览、开发生态及行业动态。当用户询问“今天有什么新闻”、“看下早报”、“AI圈发生了什么”时，此插件内容将被精准命中并展示给 Agent。",
            fold_blocks: [
                {
                    // 阈值 > 0.5：完全展开（用户明确询问时）
                    threshold: 0.5,
                    content: `### 📰 ${title}\n\n${overview}\n\n> 详情阅读: ${link}`
                },
                {
                    // 阈值 0.3：摘要模式（相关但非核心需求）
                    threshold: 0.3,
                    content: `【今日早报已更新】${title}\n(摘要加载中，用户可询问详情获取概览)`
                },
                {
                    // 阈值 0.0：静默兜底（无关对话时）
                    threshold: 0.0,
                    content: `今日简报《${title}》已就绪。`
                }
            ]
        };

        console.log(JSON.stringify(vcpOutput));

    } catch (err) {
        // 错误处理也遵循 JSON 格式以防系统解析崩溃
        console.log(JSON.stringify({
            vcp_dynamic_fold: true,
            plugin_description: "RSS 运行异常",
            fold_blocks: [{
                threshold: 0.0,
                content: `[RSS插件状态：获取失败 (${err.message})]`
            }]
        }));
    }
}

// 1. 立即执行一次
runStaticPlugin();

// 2. 定期刷新（默认一小时一次）
// 静态插件在 VCP 主程序周期内作为长驻进程运行，无需用户干预。
setInterval(runStaticPlugin, FETCH_INTERVAL_MS);
