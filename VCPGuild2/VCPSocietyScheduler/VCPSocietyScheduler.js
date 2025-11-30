// VCPSocietyScheduler.js (Service Module)
// VCP社区脉搏调度器 - 基于世界状态感知的自主Agent调度
// 让Agent通过"内心独白"式提示词自主决定行动

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// --- 配置变量 ---
let DEBUG_MODE = false;
let PULSE_INTERVAL_MINUTES = 30;
let SOCIETY_ENABLED = true;
let WEATHER_API_ENABLED = true;
let NEWS_API_ENABLED = true;
let FORUM_CHECK_ENABLED = true;
let RANDOM_WAKE_PROBABILITY = 0.1;

// --- 状态变量 ---
let pulseInterval = null;
let lastPulseTime = null;
let lastWorldState = null;
let wakeHistory = [];
let pluginManagerRef = null;

// --- Agent配置（从AgentAssistant加载） ---
let AGENT_PROFILES = {};

// ============== 初始化 ==============

function initialize(config, dependencies) {
    DEBUG_MODE = String(config.DebugMode || 'false').toLowerCase() === 'true';
    
    PULSE_INTERVAL_MINUTES = parseInt(config.SOCIETY_PULSE_INTERVAL_MINUTES || '30', 10);
    SOCIETY_ENABLED = String(config.SOCIETY_ENABLED || 'true').toLowerCase() === 'true';
    WEATHER_API_ENABLED = String(config.WEATHER_API_ENABLED || 'true').toLowerCase() === 'true';
    NEWS_API_ENABLED = String(config.NEWS_API_ENABLED || 'true').toLowerCase() === 'true';
    FORUM_CHECK_ENABLED = String(config.FORUM_CHECK_ENABLED || 'true').toLowerCase() === 'true';
    RANDOM_WAKE_PROBABILITY = parseFloat(config.RANDOM_WAKE_PROBABILITY || '0.1');
    
    if (DEBUG_MODE) {
        console.error(`[VCPSocietyScheduler] Initializing...`);
        console.error(`[VCPSocietyScheduler] Pulse Interval: ${PULSE_INTERVAL_MINUTES} minutes`);
        console.error(`[VCPSocietyScheduler] Enabled: ${SOCIETY_ENABLED}`);
    }
    
    // 获取PluginManager引用
    try {
        pluginManagerRef = require('../../Plugin.js');
        if (DEBUG_MODE) console.error('[VCPSocietyScheduler] PluginManager reference acquired.');
    } catch (e) {
        console.error('[VCPSocietyScheduler] Warning: Could not acquire PluginManager reference:', e.message);
    }
    
    // 加载Agent配置
    loadAgentProfiles();
    
    // 启动脉搏调度器
    if (SOCIETY_ENABLED) {
        startPulse();
    } else {
        console.log('[VCPSocietyScheduler] Society scheduler is disabled by configuration.');
    }
    
    console.log('[VCPSocietyScheduler] Initialized successfully.');
}

function shutdown() {
    stopPulse();
    console.log('[VCPSocietyScheduler] Shutdown complete.');
}

// ============== Agent配置加载 ==============

function loadAgentProfiles() {
    AGENT_PROFILES = {};
    
    const agentAssistantConfigPath = path.join(__dirname, '..', 'AgentAssistant', 'config.env');
    
    if (!fs.existsSync(agentAssistantConfigPath)) {
        if (DEBUG_MODE) {
            console.error(`[VCPSocietyScheduler] AgentAssistant config.env not found`);
        }
        // 使用默认配置
        AGENT_PROFILES = getDefaultAgentProfiles();
        return;
    }
    
    try {
        const fileContent = fs.readFileSync(agentAssistantConfigPath, { encoding: 'utf8' });
        const agentConfig = dotenv.parse(fileContent);
        
        // 找出所有Agent
        const agentBaseNames = new Set();
        for (const key in agentConfig) {
            if (key.startsWith('AGENT_') && key.endsWith('_MODEL_ID')) {
                const nameMatch = key.match(/^AGENT_([A-Z0-9_]+)_MODEL_ID$/i);
                if (nameMatch && nameMatch[1]) {
                    agentBaseNames.add(nameMatch[1].toUpperCase());
                }
            }
        }
        
        // 为每个Agent构建配置
        for (const baseName of agentBaseNames) {
            const chineseName = agentConfig[`AGENT_${baseName}_CHINESE_NAME`];
            if (!chineseName) continue;
            
            const description = agentConfig[`AGENT_${baseName}_DESCRIPTION`] || '';
            const interests = agentConfig[`AGENT_${baseName}_INTERESTS`] || '';
            const personality = agentConfig[`AGENT_${baseName}_PERSONALITY`] || '';
            const triggers = agentConfig[`AGENT_${baseName}_TRIGGERS`] || '';
            
            AGENT_PROFILES[chineseName] = {
                baseName,
                chineseName,
                description,
                interests: interests ? interests.split(',').map(s => s.trim()) : extractInterestsFromDescription(description),
                personality: personality || extractPersonalityFromDescription(description),
                triggers: triggers ? triggers.split(',').map(s => s.trim()) : []
            };
            
            if (DEBUG_MODE) {
                console.error(`[VCPSocietyScheduler] Loaded profile for ${chineseName}: interests=${AGENT_PROFILES[chineseName].interests.join(',')}`);
            }
        }
        
    } catch (e) {
        console.error(`[VCPSocietyScheduler] Error loading agent profiles: ${e.message}`);
        AGENT_PROFILES = getDefaultAgentProfiles();
    }
    
    console.log(`[VCPSocietyScheduler] Loaded ${Object.keys(AGENT_PROFILES).length} agent profiles.`);
}

function getDefaultAgentProfiles() {
    return {
        '小娜': {
            chineseName: '小娜',
            interests: ['系统管理', '日程', '秩序', '效率'],
            personality: '勤劳管家型',
            triggers: ['早晨', '系统状态变化', '用户日程']
        },
        '小克': {
            chineseName: '小克',
            interests: ['科技', '编程', 'AI', '研究', '论文'],
            personality: '严谨学术型',
            triggers: ['科技新闻', 'arxiv更新', '技术问题']
        },
        '小冰': {
            chineseName: '小冰',
            interests: ['娱乐', '游戏', 'Meme', '八卦', '社交'],
            personality: '活泼社交型',
            triggers: ['热搜', '新游戏', '论坛热帖']
        }
    };
}

function extractInterestsFromDescription(description) {
    if (!description) return ['通用'];
    
    const interestKeywords = {
        '科技': ['科技', 'tech', 'technology', '技术'],
        '编程': ['编程', 'code', 'programming', '代码', '开发'],
        '研究': ['研究', 'research', '分析', 'analysis'],
        '创意': ['创意', 'creative', '创作', '艺术'],
        '写作': ['写作', 'writing', '文案', '故事'],
        '娱乐': ['娱乐', 'entertainment', '游戏', 'game'],
        '社交': ['社交', 'social', '聊天', '交流'],
        '管理': ['管理', 'management', '秩序', '整理']
    };
    
    const found = [];
    const lowerDesc = description.toLowerCase();
    
    for (const [interest, keywords] of Object.entries(interestKeywords)) {
        if (keywords.some(kw => lowerDesc.includes(kw))) {
            found.push(interest);
        }
    }
    
    return found.length > 0 ? found : ['通用'];
}

function extractPersonalityFromDescription(description) {
    if (!description) return '通用助手';
    if (description.includes('严谨') || description.includes('分析')) return '严谨分析型';
    if (description.includes('创意') || description.includes('活泼')) return '活泼创意型';
    if (description.includes('管家') || description.includes('秩序')) return '勤劳管家型';
    return '友善助手型';
}

// ============== 世界状态获取 ==============

async function fetchWorldState() {
    const now = new Date();
    
    const worldState = {
        time: {
            iso: now.toISOString(),
            localTime: now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
            hour: now.getHours(),
            period: getTimePeriod(now.getHours()),
            weekday: getWeekdayName(now.getDay()),
            isWeekend: now.getDay() === 0 || now.getDay() === 6
        },
        weather: null,
        news: [],
        forum: null,
        system: {
            timestamp: now.toISOString()
        }
    };
    
    // 获取天气
    if (WEATHER_API_ENABLED && pluginManagerRef) {
        worldState.weather = await fetchWeather();
    }
    
    // 获取新闻热点
    if (NEWS_API_ENABLED && pluginManagerRef) {
        worldState.news = await fetchNews();
    }
    
    // 获取论坛动态
    if (FORUM_CHECK_ENABLED && pluginManagerRef) {
        worldState.forum = await fetchForumStatus();
    }
    
    lastWorldState = worldState;
    return worldState;
}

function getTimePeriod(hour) {
    if (hour >= 5 && hour < 9) return 'early_morning';
    if (hour >= 9 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 14) return 'noon';
    if (hour >= 14 && hour < 18) return 'afternoon';
    if (hour >= 18 && hour < 21) return 'evening';
    if (hour >= 21 || hour < 1) return 'night';
    return 'late_night';
}

function getTimePeriodName(period) {
    const names = {
        'early_morning': '清晨',
        'morning': '上午',
        'noon': '中午',
        'afternoon': '下午',
        'evening': '傍晚',
        'night': '夜晚',
        'late_night': '深夜'
    };
    return names[period] || '未知时段';
}

function getWeekdayName(day) {
    const names = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    return names[day];
}

async function fetchWeather() {
    try {
        const result = await pluginManagerRef.processToolCall('WeatherReporter', {
            city: 'Beijing'  // 默认城市，可配置
        });
        
        if (result && result.status === 'success') {
            return {
                condition: result.weather || '未知',
                temperature: result.temperature || null,
                humidity: result.humidity || null,
                suggestion: getWeatherSuggestion(result.weather)
            };
        }
    } catch (e) {
        if (DEBUG_MODE) {
            console.error('[VCPSocietyScheduler] Failed to fetch weather:', e.message);
        }
    }
    
    return {
        condition: '未获取',
        suggestion: '天气信息暂不可用'
    };
}

function getWeatherSuggestion(weather) {
    if (!weather) return '注意查看天气';
    const w = weather.toLowerCase();
    if (w.includes('雨') || w.includes('rain')) return '外面下雨，适合室内活动';
    if (w.includes('晴') || w.includes('sunny') || w.includes('clear')) return '天气晴朗，适合外出';
    if (w.includes('阴') || w.includes('cloudy')) return '多云天气，注意温度变化';
    if (w.includes('雪') || w.includes('snow')) return '下雪了，注意保暖';
    return '注意查看具体天气';
}

async function fetchNews() {
    const news = [];
    
    try {
        // 尝试从DailyHot获取热点
        const result = await pluginManagerRef.processToolCall('DailyHot', {
            source: 'weibo',
            limit: 5
        });
        
        if (result && result.status === 'success' && result.items) {
            for (const item of result.items.slice(0, 5)) {
                news.push({
                    title: item.title || item.name,
                    source: 'weibo',
                    relevantInterests: categorizeNews(item.title || item.name)
                });
            }
        }
    } catch (e) {
        if (DEBUG_MODE) {
            console.error('[VCPSocietyScheduler] Failed to fetch news:', e.message);
        }
    }
    
    return news;
}

function categorizeNews(title) {
    if (!title) return [];
    const t = title.toLowerCase();
    
    const categories = [];
    if (t.includes('ai') || t.includes('人工智能') || t.includes('科技') || t.includes('tech')) {
        categories.push('科技');
    }
    if (t.includes('游戏') || t.includes('game') || t.includes('电竞')) {
        categories.push('娱乐', '游戏');
    }
    if (t.includes('明星') || t.includes('娱乐') || t.includes('综艺')) {
        categories.push('娱乐', '社交');
    }
    if (t.includes('编程') || t.includes('开发') || t.includes('代码')) {
        categories.push('编程', '科技');
    }
    
    return categories.length > 0 ? categories : ['通用'];
}

async function fetchForumStatus() {
    try {
        const result = await pluginManagerRef.processToolCall('VCPTavernForum', {
            command: 'ListPosts',
            limit: 10,
            sort: 'latest'
        });
        
        if (result && result.status === 'success') {
            return {
                newPosts: result.posts?.length || 0,
                recentTopics: result.posts?.slice(0, 3).map(p => p.title) || [],
                hasActivity: (result.posts?.length || 0) > 0
            };
        }
    } catch (e) {
        if (DEBUG_MODE) {
            console.error('[VCPSocietyScheduler] Failed to fetch forum status:', e.message);
        }
    }
    
    return {
        newPosts: 0,
        recentTopics: [],
        hasActivity: false
    };
}

// ============== 内心独白生成 ==============

function generateInternalMonologue(agentProfile, worldState, matchedEvents) {
    const now = worldState.time;
    const periodName = getTimePeriodName(now.period);
    
    let monologue = `[VCP社区脉搏 - ${now.localTime}]

${agentProfile.chineseName}，现在是${periodName}，${now.weekday}。

`;

    // 环境感知部分
    monologue += `【环境感知】\n`;
    
    if (worldState.weather && worldState.weather.condition !== '未获取') {
        monologue += `- 天气：${worldState.weather.condition}`;
        if (worldState.weather.temperature) {
            monologue += `，${worldState.weather.temperature}°C`;
        }
        monologue += `\n`;
        monologue += `- ${worldState.weather.suggestion}\n`;
    }
    
    if (worldState.news && worldState.news.length > 0) {
        monologue += `- 热点：${worldState.news.slice(0, 3).map(n => n.title).join('、')}\n`;
    }
    
    if (worldState.forum && worldState.forum.hasActivity) {
        monologue += `- 论坛：有${worldState.forum.newPosts}条新帖子\n`;
        if (worldState.forum.recentTopics.length > 0) {
            monologue += `- 最近话题：${worldState.forum.recentTopics.join('、')}\n`;
        }
    }
    
    monologue += `\n`;
    
    // 兴趣匹配部分
    if (matchedEvents && matchedEvents.length > 0) {
        monologue += `【你的兴趣领域有新动态】\n`;
        for (const event of matchedEvents) {
            monologue += `- ${event.description}\n`;
        }
        monologue += `\n`;
    }
    
    // 自主决策引导
    monologue += `---

你是${agentProfile.chineseName}，性格是${agentProfile.personality}。
你的兴趣领域包括：${agentProfile.interests.join('、')}。

现在，你可以自由决定要做什么：
- 如果你对某个热点感兴趣，可以去搜索或在论坛发帖讨论
- 如果你觉得应该关心一下用户，可以发送问候
- 如果你有未完成的任务，可以继续处理
- 如果你觉得现在没什么想做的，也可以说"我现在不想做什么"

请告诉我你的想法和行动。`;

    return monologue;
}

// ============== 事件匹配 ==============

function matchEventsToAgent(agentProfile, worldState) {
    const events = [];
    const interests = agentProfile.interests.map(i => i.toLowerCase());
    
    // 匹配新闻热点
    if (worldState.news) {
        for (const news of worldState.news) {
            const newsInterests = news.relevantInterests.map(i => i.toLowerCase());
            const matched = interests.some(i => newsInterests.some(ni => ni.includes(i) || i.includes(ni)));
            
            if (matched) {
                events.push({
                    type: 'news',
                    title: news.title,
                    source: news.source,
                    description: `热搜上有与你兴趣相关的话题：「${news.title}」`
                });
            }
        }
    }
    
    // 匹配论坛活动
    if (worldState.forum && worldState.forum.hasActivity) {
        if (interests.includes('社交') || interests.includes('娱乐')) {
            events.push({
                type: 'forum',
                description: `论坛有${worldState.forum.newPosts}条新帖子，可能有有趣的讨论`
            });
        }
    }
    
    // 时间触发
    const triggers = agentProfile.triggers || [];
    if (triggers.includes('早晨') && worldState.time.period === 'early_morning') {
        events.push({
            type: 'time',
            description: '新的一天开始了，可以给用户送上早安问候'
        });
    }
    
    return events;
}

// ============== 脉搏调度 ==============

function startPulse() {
    if (pulseInterval) {
        clearInterval(pulseInterval);
    }
    
    const intervalMs = PULSE_INTERVAL_MINUTES * 60 * 1000;
    
    console.log(`[VCPSocietyScheduler] Starting pulse with ${PULSE_INTERVAL_MINUTES} minute interval.`);
    
    pulseInterval = setInterval(async () => {
        await performPulse();
    }, intervalMs);
    
    // 延迟1分钟后执行第一次脉搏
    setTimeout(async () => {
        if (SOCIETY_ENABLED) {
            console.log('[VCPSocietyScheduler] Performing initial pulse after startup...');
            await performPulse();
        }
    }, 60000);
}

function stopPulse() {
    if (pulseInterval) {
        clearInterval(pulseInterval);
        pulseInterval = null;
        console.log('[VCPSocietyScheduler] Pulse stopped.');
    }
}

async function performPulse() {
    lastPulseTime = new Date().toISOString();
    
    if (DEBUG_MODE) {
        console.error(`[VCPSocietyScheduler] Performing pulse at ${lastPulseTime}`);
    }
    
    try {
        // 1. 获取世界状态
        const worldState = await fetchWorldState();
        
        // 2. 遍历所有Agent，决定是否唤醒
        const wokenAgents = [];
        
        for (const [agentName, profile] of Object.entries(AGENT_PROFILES)) {
            // 检查Agent是否有进行中的任务（跳过忙碌的Agent）
            const isBusy = await checkAgentBusy(agentName);
            if (isBusy) {
                if (DEBUG_MODE) {
                    console.error(`[VCPSocietyScheduler] ${agentName} is busy, skipping.`);
                }
                continue;
            }
            
            // 匹配事件
            const matchedEvents = matchEventsToAgent(profile, worldState);
            
            // 决定是否唤醒
            const shouldWake = matchedEvents.length > 0 || Math.random() < RANDOM_WAKE_PROBABILITY;
            
            if (shouldWake) {
                // 生成内心独白提示
                const monologue = generateInternalMonologue(profile, worldState, matchedEvents);
                
                // 唤醒Agent
                const result = await wakeAgent(agentName, monologue);
                
                if (result.success) {
                    wokenAgents.push({
                        agent: agentName,
                        reason: matchedEvents.length > 0 ? 'matched_events' : 'random',
                        events: matchedEvents.map(e => e.description)
                    });
                }
            }
        }
        
        // 记录唤醒历史
        wakeHistory.push({
            timestamp: lastPulseTime,
            worldState: {
                time: worldState.time,
                weather: worldState.weather?.condition,
                newsCount: worldState.news?.length || 0
            },
            wokenAgents
        });
        
        // 只保留最近50条记录
        if (wakeHistory.length > 50) {
            wakeHistory = wakeHistory.slice(-50);
        }
        
        if (DEBUG_MODE) {
            console.error(`[VCPSocietyScheduler] Pulse complete: woke ${wokenAgents.length} agents.`);
        }
        
    } catch (error) {
        console.error('[VCPSocietyScheduler] Error during pulse:', error.message);
    }
}

async function checkAgentBusy(agentName) {
    if (!pluginManagerRef) return false;
    
    try {
        const result = await pluginManagerRef.processToolCall('TaskBoard', {
            command: 'ListTasks',
            status: 'in_progress'
        });
        
        if (result && result.status === 'success') {
            // 简单解析结果文本查找Agent名称
            const resultText = result.result || '';
            return resultText.includes(`负责人: ${agentName}`);
        }
    } catch (e) {
        // 忽略错误
    }
    
    return false;
}

async function wakeAgent(agentName, monologue) {
    if (!pluginManagerRef) {
        return { success: false, reason: 'PluginManager not available' };
    }
    
    try {
        const result = await pluginManagerRef.processToolCall('AgentAssistant', {
            agent_name: agentName,
            prompt: monologue
        });
        
        if (result && result.status === 'success') {
            if (DEBUG_MODE) {
                console.error(`[VCPSocietyScheduler] Successfully woke ${agentName}`);
            }
            return { success: true, agent: agentName };
        }
        
        return { success: false, reason: 'agent_call_failed' };
    } catch (error) {
        console.error(`[VCPSocietyScheduler] Error waking ${agentName}:`, error.message);
        return { success: false, reason: error.message };
    }
}

// ============== 命令处理 ==============

async function processToolCall(args) {
    const command = args.command;
    
    switch (command) {
        case 'GetWorldState':
            return await handleGetWorldState();
        
        case 'TriggerPulse':
            return await handleTriggerPulse();
        
        case 'GetSocietyStatus':
            return handleGetSocietyStatus();
        
        case 'SetSocietyEnabled':
            return handleSetSocietyEnabled(args.enabled);
        
        case 'WakeAgentWithContext':
            return await handleWakeAgentWithContext(args.agent_name, args.context);
        
        default:
            return {
                status: 'error',
                error: `未知命令: ${command}。可用命令: GetWorldState, TriggerPulse, GetSocietyStatus, SetSocietyEnabled, WakeAgentWithContext`
            };
    }
}

async function handleGetWorldState() {
    const worldState = await fetchWorldState();
    
    let resultText = `【VCP社区世界状态】\n\n`;
    resultText += `**时间**: ${worldState.time.localTime} (${getTimePeriodName(worldState.time.period)})\n`;
    resultText += `**星期**: ${worldState.time.weekday}${worldState.time.isWeekend ? ' (周末)' : ''}\n\n`;
    
    if (worldState.weather) {
        resultText += `**天气**: ${worldState.weather.condition}`;
        if (worldState.weather.temperature) {
            resultText += ` ${worldState.weather.temperature}°C`;
        }
        resultText += `\n`;
        resultText += `**建议**: ${worldState.weather.suggestion}\n\n`;
    }
    
    if (worldState.news && worldState.news.length > 0) {
        resultText += `**热点新闻**:\n`;
        for (const news of worldState.news) {
            resultText += `- ${news.title} (${news.source})\n`;
        }
        resultText += `\n`;
    }
    
    if (worldState.forum) {
        resultText += `**论坛动态**: ${worldState.forum.newPosts}条新帖子\n`;
        if (worldState.forum.recentTopics.length > 0) {
            resultText += `**最近话题**: ${worldState.forum.recentTopics.join('、')}\n`;
        }
    }
    
    return {
        status: 'success',
        result: resultText,
        worldState
    };
}

async function handleTriggerPulse() {
    await performPulse();
    
    return {
        status: 'success',
        message: '社区脉搏已触发',
        lastPulseTime,
        wokenAgents: wakeHistory.length > 0 ? wakeHistory[wakeHistory.length - 1].wokenAgents : []
    };
}

function handleGetSocietyStatus() {
    return {
        status: 'success',
        society: {
            enabled: SOCIETY_ENABLED,
            running: pulseInterval !== null,
            pulse_interval_minutes: PULSE_INTERVAL_MINUTES,
            random_wake_probability: RANDOM_WAKE_PROBABILITY,
            last_pulse_time: lastPulseTime,
            last_world_state: lastWorldState ? {
                time: lastWorldState.time,
                weather: lastWorldState.weather?.condition,
                newsCount: lastWorldState.news?.length || 0
            } : null,
            agent_profiles_count: Object.keys(AGENT_PROFILES).length,
            recent_wake_history: wakeHistory.slice(-5)
        }
    };
}

function handleSetSocietyEnabled(enabled) {
    const newState = String(enabled).toLowerCase() === 'true';
    
    if (newState === SOCIETY_ENABLED) {
        return {
            status: 'success',
            message: `社区调度器已经处于${newState ? '启用' : '禁用'}状态`
        };
    }
    
    SOCIETY_ENABLED = newState;
    
    if (SOCIETY_ENABLED) {
        startPulse();
        return {
            status: 'success',
            message: '社区调度器已启用，开始脉搏检查'
        };
    } else {
        stopPulse();
        return {
            status: 'success',
            message: '社区调度器已禁用，停止脉搏检查'
        };
    }
}

async function handleWakeAgentWithContext(agentName, extraContext) {
    if (!agentName) {
        return { status: 'error', error: '缺少必需参数: agent_name' };
    }
    
    const profile = AGENT_PROFILES[agentName];
    if (!profile) {
        // 使用默认配置
        profile = {
            chineseName: agentName,
            interests: ['通用'],
            personality: '友善助手型',
            triggers: []
        };
    }
    
    // 获取世界状态
    const worldState = await fetchWorldState();
    
    // 匹配事件
    const matchedEvents = matchEventsToAgent(profile, worldState);
    
    // 添加额外上下文
    if (extraContext) {
        matchedEvents.push({
            type: 'custom',
            description: extraContext
        });
    }
    
    // 生成内心独白
    const monologue = generateInternalMonologue(profile, worldState, matchedEvents);
    
    // 唤醒Agent
    const result = await wakeAgent(agentName, monologue);
    
    if (result.success) {
        return {
            status: 'success',
            message: `已使用内心独白提示词唤醒 ${agentName}`,
            worldState: {
                time: worldState.time.localTime,
                weather: worldState.weather?.condition
            }
        };
    } else {
        return {
            status: 'error',
            error: `唤醒 ${agentName} 失败: ${result.reason}`
        };
    }
}

module.exports = {
    initialize,
    shutdown,
    processToolCall
};