const fs = require('fs');
const path = require('path');
const https = require('https');
const { XMLParser } = require('fast-xml-parser');

// ================= 配置初始化 =================
const RSS_FEED_URL = process.env.RSS_FEED_URL || 'https://imjuya.github.io/juya-ai-daily/rss.xml';
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



抓取 RSS 内容 (增强版：带 Header 和 Timeout)
 */
async function fetchRSS() {
 return new Promise((resolve, reject) => {
 const options = {
     timeout: 8000,
     headers: {
         'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) VCP-RSS-Bot/1.0'
     }
 };

 const req = https.get(RSS_FEED_URL, options, (res) => {
     if (res.statusCode !== 200) {
         return reject(new Error(`HTTP ${res.statusCode}`));
     }
     let data = '';
     res.on('data', (chunk) => { data += chunk; });
     res.on('end', () => {
         try { resolve(parser.parse(data)); } catch (e) { reject(e); }
     });
 });

 req.on('error', reject);
 req.on('timeout', () => {
     req.destroy();
     reject(new Error('请求超时 (8s)'));
 });
 });


}


function saveToDailyFile(content) {
    const today = new Date().toISOString().split('T')[0];
    const filePath = path.join(RSS_SAVE_PATH, `daily_news_${today}.json`);
    fs.writeFileSync(filePath, JSON.stringify(content, null, 2, 'utf-8'));
    return filePath;
}


function extractDailyOverview(fullMarkdown) {
    if (!fullMarkdown) return "暂无正文内容。";
    // 增强正则：兼容多种空格和层级
    const regex = /##\s*概览([\s\S]*?)(?=\n##|$)/i;
    const match = fullMarkdown.match(regex);
    if (match && match[1]) {
        return match[1].trim();
    }
    // 兜底：如果没找到概览，截取前300字
    return fullMarkdown.slice(0, 300).replace(/[\r\n]+/g, ' ') + '...';
}


// ================= 核心运行逻辑 =================


async function runStaticPlugin() {
    try {
        const rssData = await fetchRSS();


    let items = [];
    // 路径兼容性处理
    if (rssData.rss?.channel?.item) {
        items = Array.isArray(rssData.rss.channel.item) ? rssData.rss.channel.item : [rssData.rss.channel.item];
    } else if (rssData.feed?.entry) {
        items = Array.isArray(rssData.feed.entry) ? rssData.feed.entry : [rssData.feed.entry];
    }

    if (items.length === 0) throw new Error("未解析到条目");

    const latest = items[0]; 
    const title = latest.title || "今日早报";
    const link = latest.link?.href || latest.link || "";
    const content = latest.description || latest.summary || latest.content || "";
    const overview = extractDailyOverview(content);

    saveToDailyFile({ updateTime: new Date().toLocaleString(), title, link, overview });

    // VCP 协议输出
    const vcpOutput = {
        vcp_dynamic_fold: true,
        plugin_description: "橘鸦 AI 早报插件。提供每日最新的 AI 行业动态、模型发布及产品应用简报。当用户询问“早报”、“新闻”、“AI进展”时展示详细概览。",
        fold_blocks: [
            {
                threshold: 0.5,
                content: `### 📰 ${title}\n\n${overview}\n\n> 🔗 完整阅读: ${link}`
            },
            {
                threshold: 0.3,
                content: `【AI早报】${title} (已更新)`
            },
            {
                threshold: 0.0,
                content: `早报就绪: ${title}`
            }
        ]
    };
    console.log(JSON.stringify(vcpOutput));

} catch (err) {
    console.log(JSON.stringify({
        vcp_dynamic_fold: true,
        plugin_description: "RSS 异常",
        fold_blocks: [{
            threshold: 0.0,
            content: `[RSS 离线: ${err.message}]`
        }]
    }));
}


}


runStaticPlugin();
setInterval(runStaticPlugin, FETCH_INTERVAL_MS);