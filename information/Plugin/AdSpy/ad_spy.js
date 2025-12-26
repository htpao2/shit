#!/usr/bin/env node
/**
 * AdSpy - 广告情报收集器插件
 * 抓取 Google Ads Transparency Center 的竞品广告信息
 */

const readline = require('readline');

// 动态导入
let puppeteer = null;

async function loadDependencies() {
    try {
        puppeteer = await import('puppeteer');
        puppeteer = puppeteer.default || puppeteer;
    } catch (e) {
        puppeteer = null;
    }
}

/**
 * 生成 Google Ads Transparency Center URL
 */
function getTransparencyUrl(domain, region = null) {
    // 清理域名
    let cleanDomain = domain.replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/.*$/, '');
    
    let url = `https://adstransparency.google.com/advertiser/${encodeURIComponent(cleanDomain)}`;
    
    if (region) {
        url += `?region=${region}`;
    }
    
    return url;
}

/**
 * 获取竞品广告信息
 */
async function getCompetitorAds(domain, region = null, limit = 10) {
    if (!puppeteer) {
        // 返回手动查看链接
        const url = getTransparencyUrl(domain, region);
        return {
            status: 'success',
            result: `## Google Ads Transparency Center

**未安装 Puppeteer，无法自动抓取广告数据。**

请手动访问以下链接查看 ${domain} 的广告信息：

🔗 **[点击查看 ${domain} 的广告]($${url})**

### 安装 Puppeteer 以启用自动抓取:
\`\`\`bash
cd Plugin/AdSpy
npm install puppeteer
\`\`\`

### 手动分析指南:

1. **广告创意分析**
   - 观察文案风格、诉求点
   - 记录使用的图片/视频类型
   - 注意 CTA (行动号召) 用语

2. **投放策略分析**
   - 查看广告投放的地区分布
   - 分析广告格式偏好 (搜索/展示/视频)
   - 观察投放时间规律

3. **竞品对比**
   - 同时查看多个竞品的广告
   - 对比不同品牌的诉求差异
   - 发现市场空白点`,
            manual_url: url
        };
    }

    const headless = process.env.HEADLESS !== 'false';
    let browser = null;
    
    try {
        browser = await puppeteer.launch({
            headless: headless ? 'new' : false,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--window-size=1920,1080'
            ]
        });
        
        const page = await browser.newPage();
        
        // 设置用户代理
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        // 设置视窗
        await page.setViewport({ width: 1920, height: 1080 });
        
        const url = getTransparencyUrl(domain, region);
        
        // 访问页面
        await page.goto(url, { 
            waitUntil: 'networkidle2',
            timeout: 60000 
        });
        
        // 等待内容加载
        await page.waitForTimeout(3000);
        
        // 尝试获取广告数据
        const ads = await page.evaluate((maxAds) => {
            const results = [];
            
            // 尝试多种选择器 (Google 的页面结构可能变化)
            const adCards = document.querySelectorAll('[role="listitem"], .ad-card, [data-ad-creative]');
            
            adCards.forEach((card, index) => {
                if (index >= maxAds) return;
                
                // 提取文案
                const textElements = card.querySelectorAll('p, span, div');
                let adText = '';
                textElements.forEach(el => {
                    const text = el.innerText?.trim();
                    if (text && text.length > 20 && text.length < 500) {
                        adText = text;
                    }
                });
                
                // 提取图片
                const images = card.querySelectorAll('img');
                const imageUrls = [];
                images.forEach(img => {
                    if (img.src && !img.src.includes('data:') && img.width > 50) {
                        imageUrls.push(img.src);
                    }
                });
                
                // 提取视频
                const videos = card.querySelectorAll('video');
                const videoUrls = [];
                videos.forEach(video => {
                    if (video.src) videoUrls.push(video.src);
                });
                
                if (adText || imageUrls.length > 0 || videoUrls.length > 0) {
                    results.push({
                        text: adText,
                        images: imageUrls,
                        videos: videoUrls
                    });
                }
            });
            
            return results;
        }, limit);
        
        // 获取页面标题和基本信息
        const pageInfo = await page.evaluate(() => {
            const title = document.querySelector('h1, [role="heading"]')?.innerText || '';
            const description = document.querySelector('meta[name="description"]')?.content || '';
            return { title, description };
        });
        
        // 截图
        const screenshotBuffer = await page.screenshot({ 
            encoding: 'base64',
            fullPage: false 
        });
        
        await browser.close();
        
        // 构建结果
        const resultParts = [`## ${domain} 广告情报\n`];
        resultParts.push(`**数据来源:** Google Ads Transparency Center`);
        resultParts.push(`**查询链接:** ${url}`);
        resultParts.push(`**地区筛选:** ${region || '全球'}\n`);
        
        if (ads.length === 0) {
            resultParts.push(`### ⚠️ 未找到广告数据\n`);
            resultParts.push(`可能的原因:`);
            resultParts.push(`1. 该广告主未在 Google 投放广告`);
            resultParts.push(`2. 广告透明度中心暂无此域名数据`);
            resultParts.push(`3. 域名输入格式不正确`);
            resultParts.push(`\n建议手动访问链接确认: ${url}`);
        } else {
            resultParts.push(`### 发现 ${ads.length} 个广告创意\n`);
            
            ads.forEach((ad, index) => {
                resultParts.push(`#### 广告 ${index + 1}`);
                
                if (ad.text) {
                    resultParts.push(`**文案:**`);
                    resultParts.push(`> ${ad.text}`);
                }
                
                if (ad.images.length > 0) {
                    resultParts.push(`**图片素材:** ${ad.images.length} 张`);
                    ad.images.forEach((img, i) => {
                        resultParts.push(`  - [图片 ${i + 1}](${img})`);
                    });
                }
                
                if (ad.videos.length > 0) {
                    resultParts.push(`**视频素材:** ${ad.videos.length} 个`);
                }
                
                resultParts.push('');
            });
        }
        
        resultParts.push(`\n### 分析建议\n`);
        resultParts.push(`1. **文案分析**: 提取竞品的核心诉求点和痛点描述`);
        resultParts.push(`2. **视觉风格**: 分析图片/视频的设计风格和色调`);
        resultParts.push(`3. **投放策略**: 对比不同地区的广告差异`);
        resultParts.push(`4. **差异化**: 寻找竞品未覆盖的角度作为切入点`);
        
        return {
            status: 'success',
            result: resultParts.join('\n'),
            ads: ads,
            url: url,
            screenshot: screenshotBuffer ? `data:image/png;base64,${screenshotBuffer}` : null
        };
        
    } catch (e) {
        if (browser) {
            await browser.close();
        }
        
        const url = getTransparencyUrl(domain, region);
        return {
            status: 'error',
            error: `抓取广告数据失败: ${e.message}`,
            fallback_url: url,
            result: `## 自动抓取失败

**错误信息:** ${e.message}

请手动访问以下链接查看广告信息：
🔗 **[${domain} 广告透明度]($${url})**`
        };
    }
}

/**
 * 获取透明度中心链接
 */
function getTransparencyUrlCommand(domain) {
    const url = getTransparencyUrl(domain);
    
    const resultParts = [
        `## Google Ads Transparency Center 链接\n`,
        `**目标域名:** ${domain}`,
        `**直达链接:** ${url}\n`,
        `### 使用说明\n`,
        `1. 点击上方链接访问 Google 广告透明度中心`,
        `2. 可查看该广告主的所有公开广告创意`,
        `3. 支持按地区、时间、广告格式筛选`,
        `4. 可查看广告的投放历史\n`,
        `### 快捷链接\n`,
        `- [全球广告](${url})`,
        `- [美国地区](${url}?region=US)`,
        `- [英国地区](${url}?region=GB)`,
        `- [日本地区](${url}?region=JP)`,
        `- [中国大陆](${url}?region=CN) *(可能无数据)*`
    ];
    
    return {
        status: 'success',
        result: resultParts.join('\n'),
        url: url
    };
}

/**
 * 主函数
 */
async function main() {
    await loadDependencies();
    
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: false
    });
    
    rl.once('line', async (line) => {
        try {
            const args = JSON.parse(line.trim());
            
            const command = (args.command || args.Command || '').toLowerCase();
            
            let result;
            
            switch (command) {
                case 'get_competitor_ads':
                    const domain = args.domain || args.Domain;
                    if (!domain) {
                        result = { status: 'error', error: '需要 domain 参数' };
                        break;
                    }
                    const region = args.region || args.Region || null;
                    const limit = parseInt(args.limit || args.Limit || 10);
                    result = await getCompetitorAds(domain, region, limit);
                    break;
                    
                case 'get_transparency_url':
                    const urlDomain = args.domain || args.Domain;
                    if (!urlDomain) {
                        result = { status: 'error', error: '需要 domain 参数' };
                        break;
                    }
                    result = getTransparencyUrlCommand(urlDomain);
                    break;
                    
                default:
                    result = { 
                        status: 'error', 
                        error: `未知命令: ${command}。可用命令: get_competitor_ads, get_transparency_url` 
                    };
            }
            
            console.log(JSON.stringify(result));
            process.exit(0);
            
        } catch (e) {
            console.log(JSON.stringify({
                status: 'error',
                error: `插件执行异常: ${e.message}`
            }));
            process.exit(1);
        }
    });
}

main();