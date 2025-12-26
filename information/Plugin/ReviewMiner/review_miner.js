#!/usr/bin/env node
/**
 * ReviewMiner - App 差评挖掘器插件
 * 抓取 App Store 和 Google Play 的低分评论
 */

const readline = require('readline');

// 动态导入 ES modules
let appStore = null;
let gplay = null;

async function loadDependencies() {
    try {
        appStore = await import('app-store-scraper');
        appStore = appStore.default || appStore;
    } catch (e) {
        appStore = null;
    }
    
    try {
        gplay = await import('google-play-scraper');
        gplay = gplay.default || gplay;
    } catch (e) {
        gplay = null;
    }
}

/**
 * 获取 iOS App Store 评论
 */
async function fetchIosReviews(appId, country = 'us', maxRating = 3, limit = 50) {
    if (!appStore) {
        return {
            status: 'error',
            error: 'app-store-scraper 未安装。请在插件目录运行: npm install app-store-scraper'
        };
    }
    
    try {
        // 先获取应用信息
        let appInfo;
        try {
            if (/^\d+$/.test(appId)) {
                appInfo = await appStore.app({ id: appId, country });
            } else {
                appInfo = await appStore.app({ appId: appId, country });
            }
        } catch (e) {
            // 尝试搜索
            const searchResults = await appStore.search({ term: appId, country, num: 1 });
            if (searchResults.length > 0) {
                appInfo = searchResults[0];
            } else {
                return { status: 'error', error: `未找到应用: ${appId}` };
            }
        }
        
        // 获取评论
        const reviews = await appStore.reviews({
            id: appInfo.id,
            country: country,
            sort: appStore.sort.RECENT,
            page: 1
        });
        
        // 过滤低分评论
        const negativeReviews = reviews
            .filter(r => r.score <= maxRating)
            .slice(0, limit);
        
        // 构建结果
        const resultParts = [
            `## ${appInfo.title} - iOS 低分评论分析\n`,
            `**应用信息:**`,
            `- 名称: ${appInfo.title}`,
            `- 开发者: ${appInfo.developer}`,
            `- 当前评分: ${appInfo.score?.toFixed(1) || 'N/A'} ⭐`,
            `- 评分数量: ${appInfo.reviews?.toLocaleString() || 'N/A'}`,
            `- App Store 链接: ${appInfo.url}`,
            `\n**筛选条件:** ${maxRating}星及以下`,
            `**找到 ${negativeReviews.length} 条差评:**\n`
        ];
        
        if (negativeReviews.length === 0) {
            resultParts.push('未找到符合条件的差评。这可能是一个好迹象！');
        } else {
            negativeReviews.forEach((review, index) => {
                const stars = '⭐'.repeat(review.score);
                resultParts.push(`### ${index + 1}. ${stars} (${review.score}星)`);
                if (review.title) {
                    resultParts.push(`**标题:** ${review.title}`);
                }
                resultParts.push(`**内容:** ${review.text}`);
                resultParts.push(`**用户:** ${review.userName || '匿名'} | **版本:** ${review.version || 'N/A'}`);
                resultParts.push('');
            });
        }
        
        return {
            status: 'success',
            result: resultParts.join('\n'),
            appInfo: {
                id: appInfo.id,
                title: appInfo.title,
                score: appInfo.score,
                url: appInfo.url
            },
            reviewCount: negativeReviews.length
        };
        
    } catch (e) {
        return {
            status: 'error',
            error: `获取 iOS 评论失败: ${e.message}`
        };
    }
}

/**
 * 获取 Google Play 评论
 */
async function fetchAndroidReviews(appId, lang = 'en', country = 'us', maxRating = 3, limit = 50) {
    if (!gplay) {
        return {
            status: 'error',
            error: 'google-play-scraper 未安装。请在插件目录运行: npm install google-play-scraper'
        };
    }
    
    try {
        // 获取应用信息
        const appInfo = await gplay.app({ appId, lang, country });
        
        // 获取评论
        const reviewResult = await gplay.reviews({
            appId: appId,
            lang: lang,
            country: country,
            sort: gplay.sort.NEWEST,
            num: limit * 2  // 多获取一些用于过滤
        });
        
        const reviews = reviewResult.data || reviewResult;
        
        // 过滤低分评论
        const negativeReviews = reviews
            .filter(r => r.score <= maxRating)
            .slice(0, limit);
        
        const resultParts = [
            `## ${appInfo.title} - Google Play 低分评论分析\n`,
            `**应用信息:**`,
            `- 名称: ${appInfo.title}`,
            `- 开发者: ${appInfo.developer}`,
            `- 当前评分: ${appInfo.score?.toFixed(1) || 'N/A'} ⭐`,
            `- 评分数量: ${appInfo.ratings?.toLocaleString() || 'N/A'}`,
            `- 安装量: ${appInfo.installs || 'N/A'}`,
            `- Play Store 链接: ${appInfo.url}`,
            `\n**筛选条件:** ${maxRating}星及以下`,
            `**找到 ${negativeReviews.length} 条差评:**\n`
        ];
        
        if (negativeReviews.length === 0) {
            resultParts.push('未找到符合条件的差评。');
        } else {
            negativeReviews.forEach((review, index) => {
                const stars = '⭐'.repeat(review.score);
                resultParts.push(`### ${index + 1}. ${stars} (${review.score}星)`);
                resultParts.push(`**内容:** ${review.text}`);
                resultParts.push(`**用户:** ${review.userName || '匿名'}`);
                if (review.replyText) {
                    resultParts.push(`**开发者回复:** ${review.replyText}`);
                }
                resultParts.push('');
            });
        }
        
        return {
            status: 'success',
            result: resultParts.join('\n'),
            appInfo: {
                appId: appInfo.appId,
                title: appInfo.title,
                score: appInfo.score,
                url: appInfo.url
            },
            reviewCount: negativeReviews.length
        };
        
    } catch (e) {
        return {
            status: 'error',
            error: `获取 Android 评论失败: ${e.message}`
        };
    }
}

/**
 * 搜索应用
 */
async function searchApp(term, platform = 'ios', country = 'us', limit = 5) {
    try {
        let results = [];
        
        if (platform.toLowerCase() === 'ios') {
            if (!appStore) {
                return { status: 'error', error: 'app-store-scraper 未安装' };
            }
            results = await appStore.search({ term, country, num: limit });
            
            const resultParts = [`## iOS App Store 搜索结果: "${term}"\n`];
            results.forEach((app, index) => {
                resultParts.push(`### ${index + 1}. ${app.title}`);
                resultParts.push(`- **App ID:** ${app.id}`);
                resultParts.push(`- **开发者:** ${app.developer}`);
                resultParts.push(`- **评分:** ${app.score?.toFixed(1) || 'N/A'} ⭐`);
                resultParts.push(`- **链接:** ${app.url}`);
                resultParts.push('');
            });
            
            return { status: 'success', result: resultParts.join('\n') };
            
        } else {
            if (!gplay) {
                return { status: 'error', error: 'google-play-scraper 未安装' };
            }
            results = await gplay.search({ term, country, num: limit });
            
            const resultParts = [`## Google Play 搜索结果: "${term}"\n`];
            results.forEach((app, index) => {
                resultParts.push(`### ${index + 1}. ${app.title}`);
                resultParts.push(`- **Package ID:** ${app.appId}`);
                resultParts.push(`- **开发者:** ${app.developer}`);
                resultParts.push(`- **评分:** ${app.score?.toFixed(1) || 'N/A'} ⭐`);
                resultParts.push(`- **链接:** ${app.url}`);
                resultParts.push('');
            });
            
            return { status: 'success', result: resultParts.join('\n') };
        }
        
    } catch (e) {
        return {
            status: 'error',
            error: `搜索失败: ${e.message}`
        };
    }
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
                case 'fetch_ios_reviews':
                    const iosAppId = args.appId || args.AppId || args.app_id;
                    if (!iosAppId) {
                        result = { status: 'error', error: '需要 appId 参数' };
                        break;
                    }
                    const iosCountry = args.country || args.Country || 'us';
                    const iosMaxRating = parseInt(args.maxRating || args.max_rating || 3);
                    const iosLimit = parseInt(args.limit || args.Limit || 50);
                    result = await fetchIosReviews(iosAppId, iosCountry, iosMaxRating, iosLimit);
                    break;
                    
                case 'fetch_android_reviews':
                    const androidAppId = args.appId || args.AppId || args.app_id;
                    if (!androidAppId) {
                        result = { status: 'error', error: '需要 appId 参数 (包名格式如 com.example.app)' };
                        break;
                    }
                    const androidLang = args.lang || args.Lang || 'en';
                    const androidCountry = args.country || args.Country || 'us';
                    const androidMaxRating = parseInt(args.maxRating || args.max_rating || 3);
                    const androidLimit = parseInt(args.limit || args.Limit || 50);
                    result = await fetchAndroidReviews(androidAppId, androidLang, androidCountry, androidMaxRating, androidLimit);
                    break;
                    
                case 'search_app':
                    const searchTerm = args.term || args.Term || args.keyword;
                    if (!searchTerm) {
                        result = { status: 'error', error: '需要 term 参数' };
                        break;
                    }
                    const searchPlatform = args.platform || args.Platform || 'ios';
                    const searchCountry = args.country || args.Country || 'us';
                    const searchLimit = parseInt(args.limit || args.Limit || 5);
                    result = await searchApp(searchTerm, searchPlatform, searchCountry, searchLimit);
                    break;
                    
                default:
                    result = { 
                        status: 'error', 
                        error: `未知命令: ${command}。可用命令: fetch_ios_reviews, fetch_android_reviews, search_app` 
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