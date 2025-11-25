// AutonomousSchedulerPlugin.js (Service Module)
// 自主Agent调度器 - hybridservice插件
// 在initialize()时自动启动后台定时任务，定期检查TaskBoardPlugin并唤醒Agent执行任务

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// --- State and Config Variables ---
let DEBUG_MODE = false;
let SCHEDULE_INTERVAL_MINUTES = 5;  // 检查间隔（分钟）
let IDLE_PROBABILITY = 0.2;         // 空闲时随机检查概率
let SCHEDULER_ENABLED = true;       // 是否启用自动调度
let DEFAULT_AGENT_NAME = '小娜';    // 默认Agent

let schedulerInterval = null;
let lastCheckTime = null;
let lastCheckResult = null;
let pluginManagerRef = null;

// Agent技能配置（动态加载）
let AGENT_SKILLS = {};
let agentSkillsLoaded = false;

// --- Core Module Functions ---

/**
 * Initializes the AutonomousSchedulerPlugin service module.
 * This is called by the PluginManager when the plugin is loaded.
 * @param {object} config - The configuration object passed from PluginManager.
 * @param {object} dependencies - An object containing dependencies.
 */
function initialize(config, dependencies) {
    DEBUG_MODE = String(config.DebugMode || 'false').toLowerCase() === 'true';
    
    // 读取配置
    SCHEDULE_INTERVAL_MINUTES = parseInt(config.AUTONOMOUS_SCHEDULE_INTERVAL_MINUTES || '5', 10);
    IDLE_PROBABILITY = parseFloat(config.AUTONOMOUS_IDLE_PROBABILITY || '0.2');
    SCHEDULER_ENABLED = String(config.AUTONOMOUS_SCHEDULER_ENABLED || 'true').toLowerCase() === 'true';
    
    if (DEBUG_MODE) {
        console.error(`[AutonomousSchedulerPlugin] Initializing...`);
        console.error(`[AutonomousSchedulerPlugin] Schedule Interval: ${SCHEDULE_INTERVAL_MINUTES} minutes`);
        console.error(`[AutonomousSchedulerPlugin] Idle Probability: ${IDLE_PROBABILITY}`);
        console.error(`[AutonomousSchedulerPlugin] Enabled: ${SCHEDULER_ENABLED}`);
    }
    
    // 读取默认Agent配置
    DEFAULT_AGENT_NAME = config.DEFAULT_AGENT_NAME || '小娜';
    
    // 获取PluginManager引用，用于调用其他插件
    try {
        pluginManagerRef = require('../../Plugin.js');
        if (DEBUG_MODE) console.error('[AutonomousSchedulerPlugin] PluginManager reference acquired.');
    } catch (e) {
        console.error('[AutonomousSchedulerPlugin] Warning: Could not acquire PluginManager reference:', e.message);
    }
    
    // 加载Agent技能配置
    loadAgentSkills(config);
    
    // 启动定时调度器
    if (SCHEDULER_ENABLED) {
        startScheduler();
    } else {
        console.log('[AutonomousSchedulerPlugin] Scheduler is disabled by configuration.');
    }
    
    console.log('[AutonomousSchedulerPlugin] Initialized successfully.');
}

/**
 * Shuts down the service, clearing any intervals.
 */
function shutdown() {
    stopScheduler();
    console.log('[AutonomousSchedulerPlugin] Shutdown complete.');
}

/**
 * Loads agent skills configuration from local config or AgentAssistant
 * @param {object} config - The configuration object from PluginManager
 */
function loadAgentSkills(config) {
    AGENT_SKILLS = {};
    
    // 1. 首先从本插件的 config 中加载技能配置
    // 格式: AGENT_SKILLS_AgentName=skill1,skill2,skill3
    for (const key in config) {
        if (key.startsWith('AGENT_SKILLS_')) {
            const agentName = key.replace('AGENT_SKILLS_', '');
            const skillsStr = config[key];
            if (skillsStr && typeof skillsStr === 'string') {
                AGENT_SKILLS[agentName] = skillsStr.split(',').map(s => s.trim().toLowerCase());
                if (DEBUG_MODE) {
                    console.error(`[AutonomousSchedulerPlugin] Loaded skills for ${agentName}: ${AGENT_SKILLS[agentName].join(', ')}`);
                }
            }
        }
    }
    
    // 2. 如果没有配置任何技能，尝试从 AgentAssistant 的 config.env 加载
    if (Object.keys(AGENT_SKILLS).length === 0) {
        loadSkillsFromAgentAssistant();
    }
    
    agentSkillsLoaded = true;
    console.log(`[AutonomousSchedulerPlugin] Loaded skills for ${Object.keys(AGENT_SKILLS).length} agents.`);
}

/**
 * Loads agent skills from AgentAssistant's config.env by parsing DESCRIPTION fields
 */
function loadSkillsFromAgentAssistant() {
    const agentAssistantConfigPath = path.join(__dirname, '..', 'AgentAssistant', 'config.env');
    
    if (!fs.existsSync(agentAssistantConfigPath)) {
        if (DEBUG_MODE) {
            console.error(`[AutonomousSchedulerPlugin] AgentAssistant config.env not found at: ${agentAssistantConfigPath}`);
        }
        return;
    }
    
    try {
        const fileContent = fs.readFileSync(agentAssistantConfigPath, { encoding: 'utf8' });
        const agentConfig = dotenv.parse(fileContent);
        
        // 找出所有 Agent 的基础名
        const agentBaseNames = new Set();
        for (const key in agentConfig) {
            if (key.startsWith('AGENT_') && key.endsWith('_MODEL_ID')) {
                const nameMatch = key.match(/^AGENT_([A-Z0-9_]+)_MODEL_ID$/i);
                if (nameMatch && nameMatch[1]) {
                    agentBaseNames.add(nameMatch[1].toUpperCase());
                }
            }
        }
        
        // 为每个 Agent 提取技能
        for (const baseName of agentBaseNames) {
            const chineseName = agentConfig[`AGENT_${baseName}_CHINESE_NAME`];
            const description = agentConfig[`AGENT_${baseName}_DESCRIPTION`] || '';
            
            if (!chineseName) continue;
            
            // 从 description 中提取技能关键词
            const skills = extractSkillsFromDescription(description);
            
            if (skills.length > 0) {
                AGENT_SKILLS[chineseName] = skills;
                if (DEBUG_MODE) {
                    console.error(`[AutonomousSchedulerPlugin] Extracted skills for ${chineseName} from description: ${skills.join(', ')}`);
                }
            }
        }
        
    } catch (e) {
        console.error(`[AutonomousSchedulerPlugin] Error loading AgentAssistant config: ${e.message}`);
    }
}

/**
 * Extracts skill keywords from an agent's description
 * @param {string} description - The agent's description
 * @returns {string[]} Array of skill keywords
 */
function extractSkillsFromDescription(description) {
    if (!description) return [];
    
    // 常见技能关键词映射
    const skillKeywords = {
        // 编程相关
        'programming': ['programming', 'code', 'coding', '编程', '代码'],
        'algorithm': ['algorithm', 'algorithms', '算法'],
        'debug': ['debug', 'debugging', '调试'],
        'development': ['development', 'dev', '开发'],
        
        // 研究相关
        'research': ['research', 'researching', '研究'],
        'analysis': ['analysis', 'analyze', 'analyzing', '分析'],
        'data': ['data', '数据'],
        'information': ['information', 'info', '信息'],
        'synthesis': ['synthesis', 'synthesize', '综合'],
        
        // 创意相关
        'creative': ['creative', 'creativity', '创意', '创作'],
        'writing': ['writing', 'write', '写作', '文案'],
        'story': ['story', 'stories', '故事'],
        'character': ['character', '角色'],
        'plot': ['plot', '情节'],
        
        // 设计相关
        'design': ['design', 'designing', '设计'],
        'art': ['art', 'artistic', '艺术'],
        'visual': ['visual', '视觉'],
        'ui': ['ui', 'ux', '界面'],
        'illustration': ['illustration', '插画'],
        'graphics': ['graphics', '图形'],
        
        // AI相关
        'ai': ['ai', 'artificial intelligence', '人工智能'],
        'prompts': ['prompt', 'prompts', '提示词'],
        'models': ['model', 'models', '模型'],
        'machine-learning': ['machine learning', 'ml', '机器学习'],
        
        // 通用
        'general': ['general', 'versatile', '通用'],
        'assistant': ['assistant', '助手'],
        'help': ['help', 'helping', '帮助']
    };
    
    const foundSkills = new Set();
    const lowerDesc = description.toLowerCase();
    
    for (const [skill, keywords] of Object.entries(skillKeywords)) {
        for (const keyword of keywords) {
            if (lowerDesc.includes(keyword)) {
                foundSkills.add(skill);
                break;
            }
        }
    }
    
    return Array.from(foundSkills);
}

/**
 * Starts the periodic scheduler
 */
function startScheduler() {
    if (schedulerInterval) {
        clearInterval(schedulerInterval);
    }
    
    const intervalMs = SCHEDULE_INTERVAL_MINUTES * 60 * 1000;
    
    console.log(`[AutonomousSchedulerPlugin] Starting scheduler with ${SCHEDULE_INTERVAL_MINUTES} minute interval.`);
    
    schedulerInterval = setInterval(async () => {
        await performScheduledCheck();
    }, intervalMs);
    
    // 延迟30秒后执行第一次检查，给其他插件初始化时间
    setTimeout(async () => {
        if (SCHEDULER_ENABLED) {
            console.log('[AutonomousSchedulerPlugin] Performing initial check after startup...');
            await performScheduledCheck();
        }
    }, 30000);
}

/**
 * Stops the periodic scheduler
 */
function stopScheduler() {
    if (schedulerInterval) {
        clearInterval(schedulerInterval);
        schedulerInterval = null;
        console.log('[AutonomousSchedulerPlugin] Scheduler stopped.');
    }
}

/**
 * Performs a scheduled check of the task board
 */
async function performScheduledCheck() {
    lastCheckTime = new Date().toISOString();
    
    if (DEBUG_MODE) {
        console.error(`[AutonomousSchedulerPlugin] Performing scheduled check at ${lastCheckTime}`);
    }
    
    try {
        // 1. 获取任务板上的开放任务
        const openTasks = await getOpenTasks();
        
        if (openTasks.length === 0) {
            // 没有任务时，根据概率决定是否进行空闲检查
            if (Math.random() < IDLE_PROBABILITY) {
                await performIdleCheck();
            }
            lastCheckResult = { status: 'idle', tasksFound: 0, timestamp: lastCheckTime };
            return;
        }
        
        // 2. 处理每个开放任务
        let tasksAssigned = 0;
        for (const task of openTasks) {
            const result = await tryAssignTask(task);
            if (result.success) {
                tasksAssigned++;
            }
        }
        
        lastCheckResult = { 
            status: 'active', 
            tasksFound: openTasks.length, 
            tasksAssigned,
            timestamp: lastCheckTime 
        };
        
        if (DEBUG_MODE) {
            console.error(`[AutonomousSchedulerPlugin] Check complete: ${tasksAssigned}/${openTasks.length} tasks assigned.`);
        }
        
    } catch (error) {
        console.error('[AutonomousSchedulerPlugin] Error during scheduled check:', error.message);
        lastCheckResult = { status: 'error', error: error.message, timestamp: lastCheckTime };
    }
}

/**
 * Gets open tasks from TaskBoardPlugin
 */
async function getOpenTasks() {
    if (!pluginManagerRef) {
        throw new Error('PluginManager reference not available');
    }
    
    try {
        // 调用TaskBoardPlugin的ListTasks命令
        const result = await pluginManagerRef.processToolCall('TaskBoardPlugin', {
            command: 'ListTasks',
            status: 'open',
            limit: 10
        });
        
        if (result && result.status === 'success' && result.tasks) {
            return result.tasks;
        }
        
        return [];
    } catch (error) {
        if (DEBUG_MODE) {
            console.error('[AutonomousSchedulerPlugin] Error fetching tasks from TaskBoardPlugin:', error.message);
        }
        return [];
    }
}

/**
 * Tries to assign a task to an appropriate Agent
 */
async function tryAssignTask(task) {
    // 1. 根据任务的required_skills匹配最合适的Agent
    const matchedAgent = matchAgentToTask(task);
    
    if (!matchedAgent) {
        if (DEBUG_MODE) {
            console.error(`[AutonomousSchedulerPlugin] No suitable agent found for task ${task.id}`);
        }
        return { success: false, reason: 'no_matching_agent' };
    }
    
    // 2. 通过AgentAssistant唤醒Agent并分配任务
    try {
        const wakePrompt = buildWakePrompt(task, matchedAgent);
        
        const agentResult = await pluginManagerRef.processToolCall('AgentAssistant', {
            agent_name: matchedAgent,
            prompt: wakePrompt
        });
        
        if (agentResult && agentResult.status === 'success') {
            // 3. 更新任务状态为进行中
            await pluginManagerRef.processToolCall('TaskBoardPlugin', {
                command: 'AcceptTask',
                task_id: task.id,
                agent_id: matchedAgent
            });
            
            if (DEBUG_MODE) {
                console.error(`[AutonomousSchedulerPlugin] Task ${task.id} assigned to ${matchedAgent}`);
            }
            
            return { success: true, agent: matchedAgent };
        }
        
        return { success: false, reason: 'agent_wake_failed' };
        
    } catch (error) {
        console.error(`[AutonomousSchedulerPlugin] Error assigning task ${task.id}:`, error.message);
        return { success: false, reason: error.message };
    }
}

/**
 * Matches an agent to a task based on required skills
 * Uses dynamically loaded AGENT_SKILLS from config or AgentAssistant
 */
function matchAgentToTask(task) {
    const requiredSkills = task.required_skills || [];
    
    // 如果没有加载任何Agent技能，返回默认Agent
    if (Object.keys(AGENT_SKILLS).length === 0) {
        if (DEBUG_MODE) {
            console.error(`[AutonomousSchedulerPlugin] No agent skills loaded, using default agent: ${DEFAULT_AGENT_NAME}`);
        }
        return DEFAULT_AGENT_NAME;
    }
    
    if (requiredSkills.length === 0) {
        // 没有特定技能要求，使用配置的默认Agent
        return DEFAULT_AGENT_NAME;
    }
    
    let bestMatch = null;
    let bestScore = 0;
    
    for (const [agentName, skills] of Object.entries(AGENT_SKILLS)) {
        let matchScore = 0;
        for (const required of requiredSkills) {
            const normalizedRequired = required.toLowerCase();
            for (const skill of skills) {
                if (skill.includes(normalizedRequired) || normalizedRequired.includes(skill)) {
                    matchScore++;
                }
            }
        }
        
        if (matchScore > bestScore) {
            bestScore = matchScore;
            bestMatch = agentName;
        }
    }
    
    // 如果没有匹配，使用配置的默认Agent
    return bestMatch || DEFAULT_AGENT_NAME;
}

/**
 * Builds the wake prompt for an agent
 */
function buildWakePrompt(task, agentName) {
    const now = new Date();
    const timeStr = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2,'0')}-${now.getDate().toString().padStart(2,'0')} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
    
    return `[自主调度系统通知 - ${timeStr}]

${agentName}你好，我是自主调度系统。任务板上有一个新任务需要你处理：

【任务信息】
- 任务ID: ${task.id}
- 标题: ${task.title}
- 描述: ${task.description || '无详细描述'}
- 优先级: ${task.priority || 'normal'}
- 发布者: ${task.posted_by || '未知'}
${task.required_skills ? `- 所需技能: ${task.required_skills.join(', ')}` : ''}
${task.deadline ? `- 截止时间: ${task.deadline}` : ''}

请你处理这个任务，完成后使用TaskBoardPlugin提交成果。

如果任务描述不清楚，你可以：
1. 先接取任务，然后自行理解并执行
2. 如需澄清，联系发布者询问详情

请开始处理任务。`;
}

/**
 * Performs an idle check when no tasks are available
 */
async function performIdleCheck() {
    if (DEBUG_MODE) {
        console.error('[AutonomousSchedulerPlugin] Performing idle check...');
    }
    
    // 可以扩展：
    // - 检查是否有需要跟进的进行中任务
    // - 检查是否有过期任务需要处理
    // - 触发Agent进行例行巡检
    
    try {
        // 获取进行中的任务，检查是否需要提醒
        const inProgressTasks = await getTasksByStatus('in_progress');
        
        for (const task of inProgressTasks) {
            // 检查任务是否接近截止时间
            if (task.deadline) {
                const deadline = new Date(task.deadline);
                const now = new Date();
                const hoursRemaining = (deadline - now) / (1000 * 60 * 60);
                
                if (hoursRemaining > 0 && hoursRemaining < 24) {
                    // 任务即将到期，可以发送提醒
                    if (DEBUG_MODE) {
                        console.error(`[AutonomousSchedulerPlugin] Task ${task.id} is due in ${hoursRemaining.toFixed(1)} hours`);
                    }
                }
            }
        }
    } catch (error) {
        if (DEBUG_MODE) {
            console.error('[AutonomousSchedulerPlugin] Error during idle check:', error.message);
        }
    }
}

/**
 * Gets tasks by status from TaskBoardPlugin
 */
async function getTasksByStatus(status) {
    if (!pluginManagerRef) {
        return [];
    }
    
    try {
        const result = await pluginManagerRef.processToolCall('TaskBoardPlugin', {
            command: 'ListTasks',
            status: status,
            limit: 20
        });
        
        if (result && result.status === 'success' && result.tasks) {
            return result.tasks;
        }
        
        return [];
    } catch (error) {
        return [];
    }
}

/**
 * This is the main entry point for handling tool calls from PluginManager.
 * @param {object} args - The arguments for the tool call.
 * @returns {Promise<object>} A promise that resolves to the result of the tool call.
 */
async function processToolCall(args) {
    const command = args.command;
    
    switch (command) {
        case 'CheckTaskBoard':
            return await handleCheckTaskBoard();
        
        case 'GetSchedulerStatus':
            return handleGetSchedulerStatus();
        
        case 'SetSchedulerEnabled':
            return handleSetSchedulerEnabled(args.enabled);
        
        default:
            return {
                status: 'error',
                error: `未知命令: ${command}。可用命令: CheckTaskBoard, GetSchedulerStatus, SetSchedulerEnabled`
            };
    }
}

/**
 * Handles manual CheckTaskBoard command
 */
async function handleCheckTaskBoard() {
    await performScheduledCheck();
    
    return {
        status: 'success',
        message: '任务板检查已完成',
        result: lastCheckResult
    };
}

/**
 * Handles GetSchedulerStatus command
 */
function handleGetSchedulerStatus() {
    return {
        status: 'success',
        scheduler: {
            enabled: SCHEDULER_ENABLED,
            running: schedulerInterval !== null,
            interval_minutes: SCHEDULE_INTERVAL_MINUTES,
            idle_probability: IDLE_PROBABILITY,
            last_check_time: lastCheckTime,
            last_check_result: lastCheckResult
        }
    };
}

/**
 * Handles SetSchedulerEnabled command
 */
function handleSetSchedulerEnabled(enabled) {
    const newState = String(enabled).toLowerCase() === 'true';
    
    if (newState === SCHEDULER_ENABLED) {
        return {
            status: 'success',
            message: `调度器已经处于${newState ? '启用' : '禁用'}状态`
        };
    }
    
    SCHEDULER_ENABLED = newState;
    
    if (SCHEDULER_ENABLED) {
        startScheduler();
        return {
            status: 'success',
            message: '调度器已启用，开始定期检查任务板'
        };
    } else {
        stopScheduler();
        return {
            status: 'success',
            message: '调度器已禁用，停止自动检查'
        };
    }
}

module.exports = {
    initialize,
    shutdown,
    processToolCall
};