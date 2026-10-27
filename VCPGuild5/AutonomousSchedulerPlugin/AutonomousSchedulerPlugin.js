// AutonomousSchedulerPlugin.js (Service Module)
// 自主Agent调度器 - hybridservice插件
// 在initialize()时自动启动后台定时任务，定期检查TaskBoardPlugin并唤醒Agent执行任务

const fs = require('fs');
const path = require('path');

let dotenv;
try {
    dotenv = require('dotenv');
} catch (error) {
    // 真实 VCP 通常会提供 dotenv；最小插件测试环境没有依赖时使用兼容解析器。
    dotenv = { parse: parseDotenvFallback };
}

function parseDotenvFallback(content) {
    const parsed = {};
    for (const rawLine of String(content || '').split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const separator = line.indexOf('=');
        if (separator <= 0) continue;
        const key = line.slice(0, separator).trim();
        let value = line.slice(separator + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        parsed[key] = value;
    }
    return parsed;
}

// --- State and Config Variables ---
let DEBUG_MODE = false;
let SCHEDULE_INTERVAL_MINUTES = 5;  // 检查间隔（分钟）
let IDLE_PROBABILITY = 0.2;         // 空闲维护概率；不影响进行中任务续跑
let SCHEDULER_ENABLED = true;       // 是否启用自动调度
let DEFAULT_AGENT_NAME = '小娜';    // 默认Agent

let schedulerInterval = null;
let schedulerStartupTimeout = null;
let schedulerCheckRunning = false;
let lastCheckTime = null;
let lastCheckResult = null;
let pluginManagerRef = null;

// Agent技能配置（动态加载）
let AGENT_SKILLS = {};
let agentSkillsLoaded = false;

// Task Diary 配置
const TASK_DIARY_MAX_LINES = 100;  // 注入日记时的最大行数

// --- Core Module Functions ---

/**
 * Initializes the AutonomousSchedulerPlugin service module.
 * This is called by the PluginManager when the plugin is loaded.
 * @param {object} config - The configuration object passed from PluginManager.
 * @param {object} dependencies - An object containing dependencies.
 */
function initialize(config = {}, dependencies) {
    DEBUG_MODE = String(config.DebugMode ?? 'false').toLowerCase() === 'true';
    
    // 读取配置；显式 false/0 是有效值，不能按“缺省”处理。
    SCHEDULE_INTERVAL_MINUTES = parseInt(config.AUTONOMOUS_SCHEDULE_INTERVAL_MINUTES ?? '5', 10);
    IDLE_PROBABILITY = parseFloat(config.AUTONOMOUS_IDLE_PROBABILITY ?? '0.2');
    SCHEDULER_ENABLED = String(config.AUTONOMOUS_SCHEDULER_ENABLED ?? 'true').toLowerCase() === 'true';
    
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
    if (schedulerInterval) clearInterval(schedulerInterval);
    if (schedulerStartupTimeout) clearTimeout(schedulerStartupTimeout);
    
    const intervalMs = SCHEDULE_INTERVAL_MINUTES * 60 * 1000;
    
    console.log(`[AutonomousSchedulerPlugin] Starting scheduler with ${SCHEDULE_INTERVAL_MINUTES} minute interval.`);
    
    schedulerInterval = setInterval(async () => {
        await performScheduledCheck();
    }, intervalMs);
    
    // 延迟30秒后执行第一次检查，给其他插件初始化时间。
    schedulerStartupTimeout = setTimeout(async () => {
        schedulerStartupTimeout = null;
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
    }
    if (schedulerStartupTimeout) {
        clearTimeout(schedulerStartupTimeout);
        schedulerStartupTimeout = null;
    }
    console.log('[AutonomousSchedulerPlugin] Scheduler stopped.');
}

/**
 * 每轮先对账桥接，再同时检查 open 与 in_progress。进行中任务的续跑不受空闲概率影响。
 */
async function performScheduledCheck() {
    if (schedulerCheckRunning) {
        return {
            status: 'skipped',
            reason: 'check_already_running',
            timestamp: lastCheckTime
        };
    }

    schedulerCheckRunning = true;
    lastCheckTime = new Date().toISOString();
    
    if (DEBUG_MODE) {
        console.error(`[AutonomousSchedulerPlugin] Performing scheduled check at ${lastCheckTime}`);
    }
    
    const summary = {
        status: 'active',
        tasksFound: 0,
        openTasksFound: 0,
        inProgressTasksFound: 0,
        tasksAssigned: 0,
        tasksResumed: 0,
        existingDelegations: 0,
        orphanedTasks: 0,
        taskErrors: [],
        timestamp: lastCheckTime
    };

    try {
        // 桥接先执行统一对账/限次恢复，调度器不能绕过现有映射自行创建第二个委托。
        const reconciliation = await reconcileTaskFlowlocks();
        const [openTasks, inProgressTasks] = await Promise.all([
            getTasksByStatus('open'),
            getTasksByStatus('in_progress')
        ]);

        summary.openTasksFound = openTasks.length;
        summary.inProgressTasksFound = inProgressTasks.length;
        summary.tasksFound = openTasks.length + inProgressTasks.length;

        if (summary.tasksFound === 0) {
            if (Math.random() < IDLE_PROBABILITY) {
                summary.idleCheck = await performIdleCheck();
            }
            summary.status = 'idle';
            summary.bridgeReconciliation = reconciliation;
            lastCheckResult = summary;
            return summary;
        }

        // 新任务仍走原子接取 -> 首次委托流程。
        for (const task of openTasks) {
            try {
                const result = await tryAssignTask(task);
                if (result.success) summary.tasksAssigned++;
                else summary.taskErrors.push({ taskId: task.id, phase: 'assign', reason: result.reason || 'assignment_failed' });
            } catch (error) {
                summary.taskErrors.push({ taskId: task.id, phase: 'assign', reason: error.message });
                console.error(`[AutonomousSchedulerPlugin] Error assigning task ${task.id}:`, error.message);
            }
        }

        // 对账后取一次映射快照。任何已有映射都不由调度器重复派发；orphaned 由桥接重派上限控制。
        const mappingResult = await getTaskFlowlockMappings();
        const mappingsByKey = new Map(mappingResult.mappings.map(mapping => [
            `${mapping.agentName}::${mapping.taskId}`,
            mapping
        ]));

        for (const task of inProgressTasks) {
            try {
                const result = await resumeTaskForContinuation(task, mappingsByKey);
                if (result.reason === 'assignment_changed') {
                    summary.taskErrors.push({ taskId: task.id, phase: 'resume', reason: result.reason });
                } else if (result.existing) {
                    if (result.mapping?.status === 'orphaned') summary.orphanedTasks++;
                    else summary.existingDelegations++;
                } else if (result.success && result.started) {
                    summary.tasksResumed++;
                    if (result.mapping) mappingsByKey.set(`${result.mapping.agentName}::${result.mapping.taskId}`, result.mapping);
                } else if (!result.success) {
                    summary.taskErrors.push({ taskId: task.id, phase: 'resume', reason: result.reason || 'resume_failed' });
                }
            } catch (error) {
                summary.taskErrors.push({ taskId: task.id, phase: 'resume', reason: error.message });
                console.error(`[AutonomousSchedulerPlugin] Error resuming task ${task.id}:`, error.message);
            }
        }

        summary.bridgeReconciliation = reconciliation;
        summary.status = summary.taskErrors.length > 0 || summary.orphanedTasks > 0 ? 'partial' : 'active';
        lastCheckResult = summary;

        if (DEBUG_MODE) {
            console.error(
                `[AutonomousSchedulerPlugin] Check complete: open=${summary.openTasksFound}, ` +
                `in_progress=${summary.inProgressTasksFound}, assigned=${summary.tasksAssigned}, ` +
                `resumed=${summary.tasksResumed}, active=${summary.existingDelegations}, errors=${summary.taskErrors.length}.`
            );
        }
        return summary;
    } catch (error) {
        console.error('[AutonomousSchedulerPlugin] Error during scheduled check:', error.message);
        summary.status = 'error';
        summary.error = error.message;
        lastCheckResult = summary;
        return summary;
    } finally {
        schedulerCheckRunning = false;
    }
}

async function reconcileTaskFlowlocks() {
    if (!pluginManagerRef?.processToolCall) throw new Error('PluginManager reference not available');
    const result = await pluginManagerRef.processToolCall('TaskFlowlockBridgePlugin', {
        command: 'ReconcileTaskFlowlocks',
        allow_redispatch: true
    });
    if (!result || result.status !== 'success') {
        throw new Error(result?.error || 'TaskFlowlockBridgePlugin reconciliation failed');
    }
    return result;
}

async function getTaskFlowlockMappings() {
    if (!pluginManagerRef?.processToolCall) throw new Error('PluginManager reference not available');
    const result = await pluginManagerRef.processToolCall('TaskFlowlockBridgePlugin', {
        command: 'ListTaskFlowlocks'
    });
    if (!result || result.status !== 'success' || !Array.isArray(result.mappings)) {
        throw new Error(result?.error || 'Unable to list TaskFlowlockBridge mappings');
    }
    return result;
}

/**
 * Reads all tasks of a state. Query failures are raised instead of being converted to an empty list/idle result.
 */
async function getTasksByStatus(status) {
    if (!pluginManagerRef?.processToolCall) {
        throw new Error('PluginManager reference not available');
    }

    const result = await pluginManagerRef.processToolCall('TaskBoard', {
        command: 'ListTasks',
        status
    });
    if (!result || result.status !== 'success' || !Array.isArray(result.tasks)) {
        throw new Error(result?.error || `TaskBoard ListTasks(${status}) failed`);
    }
    return result.tasks;
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
    
    // 2. 读取任务日记（用于首轮上下文注入）
    const diaryContent = await readTaskDiary(task.id);

    // 3. 先原子接取任务，再通过桥接层启动 AgentAssistant 官方 Flowlock 委托。
    let acceptedTask = null;
    try {
        const acceptResult = await pluginManagerRef.processToolCall('TaskBoard', {
            command: 'AcceptTask',
            task_id: task.id,
            expected_status: 'open',
            maid: matchedAgent
        });

        if (!acceptResult || acceptResult.status !== 'success' || !acceptResult.task) {
            return { success: false, reason: acceptResult?.code || 'task_accept_failed' };
        }
        acceptedTask = acceptResult.task;

        const wakePrompt = buildWakePrompt(acceptedTask, matchedAgent, diaryContent);
        const flowlockResult = await pluginManagerRef.processToolCall('TaskFlowlockBridgePlugin', {
            command: 'StartTaskFlowlock',
            task_id: acceptedTask.id,
            agent_name: matchedAgent,
            assignment_id: acceptedTask.assignment_id,
            prompt: wakePrompt
        });

        if (flowlockResult && flowlockResult.status === 'success') {
            if (DEBUG_MODE) {
                console.error(`[AutonomousSchedulerPlugin] Task ${task.id} assigned to ${matchedAgent} via official AA Flowlock.`);
            }
            return {
                success: true,
                agent: matchedAgent,
                task: acceptedTask.id,
                delegationId: flowlockResult.mapping?.delegationId || null,
                bridgeStatus: flowlockResult.mapping?.status || null
            };
        }

        throw new Error(flowlockResult?.error || 'task_flowlock_bridge_start_failed');
    } catch (error) {
        // 只用本次 assignment_id 补偿，避免释放已被其他调度轮次重新分配的任务。
        if (acceptedTask?.assignment_id) {
            try {
                await pluginManagerRef.processToolCall('TaskBoard', {
                    command: 'AbandonTask',
                    task_id: acceptedTask.id,
                    assignment_id: acceptedTask.assignment_id,
                    reason: `AgentAssistant Flowlock 委托启动失败，回滚分配: ${error.message}`,
                    maid: 'AutonomousSchedulerPlugin'
                });
            } catch (rollbackError) {
                console.error(`[AutonomousSchedulerPlugin] Failed to roll back task ${task.id}:`, rollbackError.message);
            }
        }
        console.error(`[AutonomousSchedulerPlugin] Error assigning task ${task.id}:`, error.message);
        return { success: false, reason: error.message };
    }
}

/**
 * Resumes one concrete in-progress task. Existing bridge mappings are authoritative;
 * the scheduler never creates a second delegation for the same agent/task mapping.
 */
async function resumeTaskForContinuation(task, mappingsByKey = new Map()) {
    const agentName = task?.assignee;
    if (!task?.id || !agentName) {
        return { success: false, taskId: task?.id || null, reason: 'task_missing_assignee' };
    }

    const key = `${agentName}::${task.id}`;
    const existing = mappingsByKey.get(key);
    if (existing) {
        const assignmentMatches = !existing.assignmentId || existing.assignmentId === task.assignment_id;
        if (!assignmentMatches) {
            return {
                success: false,
                existing: true,
                taskId: task.id,
                mapping: existing,
                reason: 'assignment_changed'
            };
        }
        return {
            success: existing.status !== 'orphaned',
            existing: true,
            started: false,
            taskId: task.id,
            mapping: existing,
            idempotent: true,
            reason: existing.status === 'orphaned' ? 'bridge_mapping_orphaned' : null
        };
    }

    const diaryContent = await readTaskDiary(task.id);
    const continuationPrompt = buildContinuationPrompt(task, agentName, diaryContent);
    const flowlockResult = await pluginManagerRef.processToolCall('TaskFlowlockBridgePlugin', {
        command: 'StartTaskFlowlock',
        task_id: task.id,
        agent_name: agentName,
        assignment_id: task.assignment_id,
        prompt: continuationPrompt
    });

    if (flowlockResult?.status === 'success' && flowlockResult.mapping) {
        if (DEBUG_MODE) {
            console.error(`[AutonomousSchedulerPlugin] Started continuation for ${agentName}, task ${task.id}`);
        }
        return {
            success: true,
            existing: false,
            started: true,
            taskId: task.id,
            mapping: flowlockResult.mapping,
            idempotent: !!flowlockResult.idempotent
        };
    }

    return {
        success: false,
        existing: false,
        started: false,
        taskId: task.id,
        reason: flowlockResult?.error || 'task_flowlock_bridge_start_failed'
    };
}

/**
 * Manually resumes every in-progress task owned by an Agent.
 * The automatic scheduler uses the same per-task helper, so behavior stays consistent.
 */
async function wakeAgentForContinuation(agentName) {
    if (!pluginManagerRef) {
        return { success: false, reason: 'PluginManager not available' };
    }
    
    try {
        await reconcileTaskFlowlocks();
        const inProgressTasks = await getTasksByStatus('in_progress');
        const agentTasks = inProgressTasks.filter(task => task.assignee === agentName);
        if (agentTasks.length === 0) {
            return { success: false, reason: 'no_active_task', agentName, tasks: [] };
        }

        const mappingResult = await getTaskFlowlockMappings();
        const mappingsByKey = new Map(mappingResult.mappings.map(mapping => [
            `${mapping.agentName}::${mapping.taskId}`,
            mapping
        ]));
        const tasks = [];
        for (const task of agentTasks) {
            try {
                tasks.push(await resumeTaskForContinuation(task, mappingsByKey));
            } catch (error) {
                tasks.push({ success: false, taskId: task.id, reason: error.message });
            }
        }

        const successful = tasks.filter(result => result.success);
        const first = tasks[0];
        return {
            success: successful.length > 0,
            agentName,
            task: first?.taskId || null,
            tasks,
            resumedCount: tasks.filter(result => result.started).length,
            existingCount: tasks.filter(result => result.existing && result.success).length,
            reason: successful.length > 0 ? null : (tasks[0]?.reason || 'resume_failed')
        };
    } catch (error) {
        console.error(`[AutonomousSchedulerPlugin] Error waking agent ${agentName}:`, error.message);
        return { success: false, reason: error.message, agentName, tasks: [] };
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
 * Reads task diary content from TaskBoardPlugin
 * @param {string} taskId - The task ID
 * @returns {Promise<string>} The diary content or empty string
 */
async function readTaskDiary(taskId) {
    if (!pluginManagerRef) {
        return '';
    }
    
    try {
        const result = await pluginManagerRef.processToolCall('TaskBoard', {
            command: 'ReadTaskLog',
            task_id: taskId,
            lines: TASK_DIARY_MAX_LINES
        });
        
        if (result && result.status === 'success' && result.result) {
            // 提取日记内容（去掉标题行）
            const content = result.result.replace(/【任务日记.*?】\n\n/s, '');
            return content.trim() || '(暂无日记内容)';
        }
        
        return '(暂无日记内容)';
    } catch (error) {
        if (DEBUG_MODE) {
            console.error(`[AutonomousSchedulerPlugin] Error reading task diary for ${taskId}:`, error.message);
        }
        return '(读取日记失败)';
    }
}

/**
 * Builds the wake prompt for an agent with task diary injection
 * @param {object} task - The task object
 * @param {string} agentName - The agent's name
 * @param {string} diaryContent - The task diary content
 */
function buildWakePrompt(task, agentName, diaryContent = '') {
    const now = new Date();
    const timeStr = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2,'0')}-${now.getDate().toString().padStart(2,'0')} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
    
    let prompt = `[自主调度系统通知 - ${timeStr}]

${agentName}你好，我是自主调度系统。任务板上有一个新任务需要你处理：

【任务信息】
- 任务ID: ${task.id}
- 标题: ${task.title}
- 描述: ${task.description || '无详细描述'}
- 优先级: ${task.priority || 'normal'}
- 发布者: ${task.posted_by || '未知'}
${task.required_skills ? `- 所需技能: ${task.required_skills.join(', ')}` : ''}
${task.deadline ? `- 截止时间: ${task.deadline}` : ''}

`;

    // 注入任务日记（如果有内容）
    if (diaryContent && diaryContent !== '(暂无日记内容)') {
        prompt += `【任务日记 - 前置上下文】
以下是之前其他Agent在此任务上的工作记录，请仔细阅读以了解进度：

${diaryContent}

---

`;
    }

    prompt += `请你处理这个任务，完成后使用TaskBoardPlugin提交成果。

**重要提醒**：在你完成本轮工作后，请务必使用 TaskBoard 的 AppendTaskLog 命令记录你做了什么，以便其他协作者了解进度。

如果任务描述不清楚，你可以：
1. 先接取任务，然后自行理解并执行
2. 如需澄清，联系发布者询问详情

请开始处理任务。`;

    return prompt;
}

/**
 * Builds a continuation prompt for an agent to continue their existing task
 * @param {object} task - The task object
 * @param {string} agentName - The agent's name
 * @param {string} diaryContent - The task diary content
 */
function buildContinuationPrompt(task, agentName, diaryContent = '') {
    const now = new Date();
    const timeStr = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2,'0')}-${now.getDate().toString().padStart(2,'0')} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
    
    let prompt = `[自主调度系统唤醒 - ${timeStr}]

${agentName}，你好！我是自主调度系统，现在唤醒你继续处理你的任务。

【你当前的任务】
- 任务ID: ${task.id}
- 标题: ${task.title}
- 当前进度: ${task.progress || 0}%
- 状态: ${task.status}

`;

    // 注入任务日记
    if (diaryContent) {
        prompt += `【任务日记 - 你之前的工作记录】
${diaryContent}

---

`;
    }

    prompt += `请继续你的工作。完成本轮工作后，记得使用 AppendTaskLog 记录进度。

如果任务已经完成，请使用 SubmitTask 提交成果。`;

    return prompt;
}

/**
 * 可选的低频空板维护，只在 open 与 in_progress 都为空时触发。
 * 它不负责续跑任务，进行中任务续跑由 performScheduledCheck 确定性处理。
 */
async function performIdleCheck() {
    if (DEBUG_MODE) {
        console.error('[AutonomousSchedulerPlugin] Performing empty-board maintenance check...');
    }

    return {
        status: 'empty_board',
        checkedAt: new Date().toISOString()
    };
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
            return await handleGetSchedulerStatus();
        
        case 'SetSchedulerEnabled':
            return handleSetSchedulerEnabled(args.enabled);
        
        case 'WakeAgent':
            return await handleWakeAgent(args.agent_name);
        
        case 'GetAgentTask':
            return await handleGetAgentTask(args.agent_name);
        
        default:
            return {
                status: 'error',
                error: `未知命令: ${command}。可用命令: CheckTaskBoard, GetSchedulerStatus, SetSchedulerEnabled, WakeAgent, GetAgentTask`
            };
    }
}

/**
 * Handles WakeAgent command - wakes a specific agent to continue their task
 */
async function handleWakeAgent(agentName) {
    if (!agentName) {
        return { status: 'error', error: '缺少必需参数: agent_name' };
    }
    
    const result = await wakeAgentForContinuation(agentName);
    
    if (result.success) {
        return {
            status: 'success',
            message: `已检查 ${agentName} 的进行中任务；新增续跑 ${result.resumedCount} 个，已有委托 ${result.existingCount} 个。`,
            result
        };
    } else {
        return {
            status: 'error',
            error: result.reason === 'no_active_task'
                ? `${agentName} 当前没有进行中的任务`
                : `唤醒 ${agentName} 失败: ${result.reason}`
        };
    }
}

/**
 * Handles GetAgentTask command - gets the current task for an agent
 */
async function handleGetAgentTask(agentName) {
    if (!agentName) {
        return { status: 'error', error: '缺少必需参数: agent_name' };
    }
    
    try {
        const inProgressTasks = await getTasksByStatus('in_progress');
        const agentTasks = inProgressTasks.filter(task => task.assignee === agentName);
        if (agentTasks.length === 0) {
            return {
                status: 'success',
                message: `${agentName} 当前没有进行中的任务`,
                task: null,
                tasks: []
            };
        }

        const diaries = {};
        const mappings = {};
        for (const agentTask of agentTasks) {
            diaries[agentTask.id] = await readTaskDiary(agentTask.id);
            try {
                const bridgeResult = await pluginManagerRef.processToolCall('TaskFlowlockBridgePlugin', {
                    command: 'GetTaskFlowlock',
                    task_id: agentTask.id,
                    agent_name: agentName
                });
                mappings[agentTask.id] = bridgeResult?.status === 'success' ? bridgeResult.mapping : null;
            } catch (bridgeError) {
                mappings[agentTask.id] = { available: false, error: bridgeError.message };
            }
        }

        return {
            status: 'success',
            task: agentTasks[0],
            tasks: agentTasks,
            diaries,
            flowlock_mappings: mappings
        };
    } catch (error) {
        return {
            status: 'error',
            error: `获取Agent任务失败: ${error.message}`
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
async function handleGetSchedulerStatus() {
    let taskFlowlockBridge = null;
    if (pluginManagerRef) {
        try {
            const result = await pluginManagerRef.processToolCall('TaskFlowlockBridgePlugin', {
                command: 'GetTaskFlowlockBridgeStatus'
            });
            if (result?.status === 'success') taskFlowlockBridge = result.bridge;
        } catch (error) {
            taskFlowlockBridge = { available: false, error: error.message };
        }
    }

    return {
        status: 'success',
        scheduler: {
            enabled: SCHEDULER_ENABLED,
            running: schedulerInterval !== null,
            interval_minutes: SCHEDULE_INTERVAL_MINUTES,
            idle_probability: IDLE_PROBABILITY,
            last_check_time: lastCheckTime,
            last_check_result: lastCheckResult,
            task_flowlock_bridge: taskFlowlockBridge
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

function setPluginManagerForTests(manager) {
    pluginManagerRef = manager;
}

function performCheckForTests() {
    return performScheduledCheck();
}

module.exports = {
    initialize,
    shutdown,
    processToolCall,
    setPluginManagerForTests,
    performCheckForTests
};