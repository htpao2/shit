#!/usr/bin/env node
/**
 * TaskBoardPlugin - 冒险者公会任务板
 * 
 * VCP同步插件，通过stdio协议与主服务通信。
 * 提供去中心化的任务管理功能，允许Agent自主发布、接取、更新和完成任务。
 */

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

// ============== 配置 ==============
const DATA_DIR = process.env.TASK_BOARD_DATA_DIR || path.join(__dirname, 'data');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');
const LOGS_DIR = path.join(DATA_DIR, 'logs');
const TASK_LOCK_DIR = path.join(DATA_DIR, '.taskboard-write.lock');
const TASK_LOCK_STALE_MS = parseInt(process.env.TASK_LOCK_STALE_MS || '30000', 10);
const MAX_ACTIVE_TASKS = parseInt(process.env.MAX_ACTIVE_TASKS || '3', 10);
const TASK_TIMEOUT_HOURS = parseInt(process.env.TASK_TIMEOUT_HOURS || '24', 10);
const DEBUG_MODE = String(process.env.DEBUG_MODE || 'false').toLowerCase() === 'true';

// ============== 数据存储 ==============

/**
 * 确保数据目录存在
 */
function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(LOGS_DIR)) {
        fs.mkdirSync(LOGS_DIR, { recursive: true });
    }
}

/**
 * 加载任务列表
 */
function loadTasks() {
    ensureDataDir();
    if (!fs.existsSync(TASKS_FILE)) {
        return {};
    }
    try {
        const data = fs.readFileSync(TASKS_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (e) {
        if (DEBUG_MODE) console.error(`[TaskBoard] Error loading tasks: ${e.message}`);
        return {};
    }
}

/**
 * 保存任务列表
 */
function saveTasks(tasks) {
    ensureDataDir();
    try {
        fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2), 'utf-8');
        return true;
    } catch (e) {
        if (DEBUG_MODE) console.error(`[TaskBoard] Error saving tasks: ${e.message}`);
        return false;
    }
}

function acquireTaskWriteLock() {
    ensureDataDir();

    try {
        fs.mkdirSync(TASK_LOCK_DIR);
        fs.writeFileSync(path.join(TASK_LOCK_DIR, 'owner.json'), JSON.stringify({
            pid: process.pid,
            createdAt: Date.now()
        }), 'utf-8');
        return true;
    } catch (error) {
        if (error.code !== 'EEXIST') throw error;

        try {
            const lockStat = fs.statSync(TASK_LOCK_DIR);
            if (Date.now() - lockStat.mtimeMs > TASK_LOCK_STALE_MS) {
                fs.rmSync(TASK_LOCK_DIR, { recursive: true, force: true });
                fs.mkdirSync(TASK_LOCK_DIR);
                fs.writeFileSync(path.join(TASK_LOCK_DIR, 'owner.json'), JSON.stringify({
                    pid: process.pid,
                    createdAt: Date.now(),
                    recoveredStaleLock: true
                }), 'utf-8');
                return true;
            }
        } catch (lockError) {
            if (lockError.code === 'ENOENT') {
                return acquireTaskWriteLock();
            }
            throw lockError;
        }

        return false;
    }
}

function releaseTaskWriteLock() {
    try {
        fs.rmSync(TASK_LOCK_DIR, { recursive: true, force: true });
    } catch (error) {
        if (DEBUG_MODE) console.error(`[TaskBoard] Failed to release write lock: ${error.message}`);
    }
}

/**
 * 检查并释放超时的任务
 */
function releaseTimedOutTasks(tasks) {
    const now = Date.now();
    const timeoutMs = TASK_TIMEOUT_HOURS * 60 * 60 * 1000;
    let released = 0;

    for (const taskId in tasks) {
        const task = tasks[taskId];
        if (task.status === 'in_progress' && task.accepted_at) {
            const acceptedTime = new Date(task.accepted_at).getTime();
            if (now - acceptedTime > timeoutMs) {
                // 超时，释放回任务池
                task.status = 'open';
                task.history.push({
                    action: 'timeout_release',
                    timestamp: new Date().toISOString(),
                    assignment_id: task.assignment_id || null,
                    note: `任务超时 (${TASK_TIMEOUT_HOURS}小时)，自动释放回任务池`
                });
                task.assignee = null;
                task.team = [];
                task.accepted_at = null;
                task.assignment_id = null;
                released++;
            }
        }
    }

    if (released > 0) {
        saveTasks(tasks);
        if (DEBUG_MODE) console.error(`[TaskBoard] Released ${released} timed-out tasks`);
    }

    return released;
}

// ============== 命令处理器 ==============

/**
 * ListTasks - 列出任务
 */
function listTasks(args) {
    const tasks = loadTasks();
    releaseTimedOutTasks(tasks);

    const status = args.status || 'open';
    const skillFilter = args.skill_filter;

    let filteredTasks = Object.values(tasks);

    // 按状态过滤
    if (status !== 'all') {
        filteredTasks = filteredTasks.filter(t => t.status === status);
    }

    // 按技能过滤
    if (skillFilter) {
        const requiredSkill = skillFilter.toLowerCase();
        filteredTasks = filteredTasks.filter(t => 
            t.required_skills && t.required_skills.some(s => s.toLowerCase().includes(requiredSkill))
        );
    }

    // 按优先级排序，并在结构化返回中应用可选数量上限。
    const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
    filteredTasks.sort((a, b) => (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2));

    const requestedLimit = parseInt(args.limit, 10);
    if (!isNaN(requestedLimit) && requestedLimit > 0) {
        filteredTasks = filteredTasks.slice(0, requestedLimit);
    }

    if (filteredTasks.length === 0) {
        return {
            status: 'success',
            result: `【任务板】当前没有符合条件的任务 (状态: ${status}${skillFilter ? ', 技能: ' + skillFilter : ''})。`,
            tasks: [],
            count: 0
        };
    }

    let resultText = `【任务板】共找到 ${filteredTasks.length} 个任务 (状态: ${status}):\n\n`;
    
    for (const task of filteredTasks) {
        const priorityEmoji = { urgent: '🔴', high: '🟠', medium: '🟡', low: '🟢' };
        const statusEmoji = { open: '📋', in_progress: '⚙️', submitted: '📤', completed: '✅', failed: '❌' };
        
        resultText += `${statusEmoji[task.status] || '📋'} ${priorityEmoji[task.priority] || '🟡'} **${task.title}**\n`;
        resultText += `   ID: \`${task.id}\`\n`;
        resultText += `   发布者: ${task.posted_by || '未知'} | 状态: ${task.status}\n`;
        if (task.required_skills && task.required_skills.length > 0) {
            resultText += `   技能: ${task.required_skills.join(', ')}\n`;
        }
        if (task.assignee) {
            resultText += `   负责人: ${task.assignee}\n`;
        }
        if (task.deadline) {
            resultText += `   截止: ${task.deadline}\n`;
        }
        resultText += '\n';
    }

    return {
        status: 'success',
        result: resultText,
        tasks: filteredTasks,
        count: filteredTasks.length
    };
}

/**
 * GetTask - 获取任务详情
 */
function getTask(args) {
    if (!args.task_id) {
        return { status: 'error', error: '缺少必需参数: task_id' };
    }

    const tasks = loadTasks();
    const task = tasks[args.task_id];

    if (!task) {
        return { status: 'error', error: `任务 ${args.task_id} 不存在` };
    }

    let resultText = `【任务详情】\n\n`;
    resultText += `📋 **${task.title}**\n\n`;
    resultText += `**ID:** \`${task.id}\`\n`;
    resultText += `**状态:** ${task.status}\n`;
    resultText += `**优先级:** ${task.priority}\n`;
    resultText += `**发布者:** ${task.posted_by || '未知'}\n`;
    resultText += `**发布时间:** ${task.created_at}\n`;
    
    if (task.assignee) {
        resultText += `**负责人:** ${task.assignee}\n`;
        resultText += `**接取时间:** ${task.accepted_at}\n`;
    }
    
    if (task.team && task.team.length > 0) {
        resultText += `**团队成员:** ${task.team.map(m => `${m.name}(${m.role})`).join(', ')}\n`;
    }
    
    if (task.required_skills && task.required_skills.length > 0) {
        resultText += `**所需技能:** ${task.required_skills.join(', ')}\n`;
    }
    
    if (task.deadline) {
        resultText += `**截止时间:** ${task.deadline}\n`;
    }
    
    if (task.reward) {
        resultText += `**奖励:** ${task.reward}\n`;
    }

    resultText += `\n**描述:**\n${task.description}\n`;

    if (task.progress !== undefined) {
        resultText += `\n**进度:** ${task.progress}%\n`;
    }

    if (task.deliverable) {
        resultText += `\n**交付物:** ${task.deliverable}\n`;
    }

    if (task.summary) {
        resultText += `\n**工作总结:** ${task.summary}\n`;
    }

    if (task.history && task.history.length > 0) {
        resultText += `\n**历史记录:**\n`;
        for (const entry of task.history.slice(-5)) { // 只显示最近5条
            resultText += `- [${entry.timestamp}] ${entry.action}: ${entry.note || ''}\n`;
        }
    }

    return { status: 'success', result: resultText, task };
}

/**
 * PostTask - 发布新任务
 */
function postTask(args, maid) {
    if (!args.title || !args.description) {
        return { status: 'error', error: '缺少必需参数: title 和 description' };
    }

    const tasks = loadTasks();
    const taskId = `task-${Date.now()}-${randomUUID().substring(0, 8)}`;

    // 解析 required_skills (可能是JSON字符串或已经是数组)
    let requiredSkills = [];
    if (args.required_skills) {
        if (typeof args.required_skills === 'string') {
            try {
                requiredSkills = JSON.parse(args.required_skills);
            } catch (e) {
                // 尝试按逗号分割
                requiredSkills = args.required_skills.split(',').map(s => s.trim());
            }
        } else if (Array.isArray(args.required_skills)) {
            requiredSkills = args.required_skills;
        }
    }

    const newTask = {
        id: taskId,
        title: args.title,
        description: args.description,
        required_skills: requiredSkills,
        priority: args.priority || 'medium',
        reward: args.reward || null,
        deadline: args.deadline || null,
        status: 'open',
        posted_by: maid || 'Unknown',
        created_at: new Date().toISOString(),
        assignee: null,
        accepted_at: null,
        team: [],
        progress: 0,
        deliverable: null,
        summary: null,
        history: [{
            action: 'created',
            timestamp: new Date().toISOString(),
            by: maid || 'Unknown',
            note: '任务已创建并发布到任务板'
        }]
    };

    tasks[taskId] = newTask;
    
    if (!saveTasks(tasks)) {
        return { status: 'error', error: '保存任务失败' };
    }

    return {
        status: 'success',
        result: `【任务已发布】\n\n📋 **${newTask.title}**\n\n任务ID: \`${taskId}\`\n优先级: ${newTask.priority}\n所需技能: ${requiredSkills.length > 0 ? requiredSkills.join(', ') : '无特殊要求'}\n\n任务已成功发布到任务板，等待有能力的Agent接取。`
    };
}

/**
 * AcceptTask - 接取任务
 */
function acceptTask(args, maid) {
    if (!args.task_id) {
        return { status: 'error', error: '缺少必需参数: task_id' };
    }
    if (!maid) {
        return { status: 'error', error: '无法识别调用者身份 (maid)' };
    }

    if (!acquireTaskWriteLock()) {
        return { status: 'error', code: 'TASK_BOARD_BUSY', error: '任务板正在处理其他状态变更，请稍后重试' };
    }

    try {
        // 必须在取得跨进程锁后重新读取，确保状态检查与写入属于同一原子区间。
        const tasks = loadTasks();
        releaseTimedOutTasks(tasks);
        const task = tasks[args.task_id];

        if (!task) {
            return { status: 'error', code: 'TASK_NOT_FOUND', error: `任务 ${args.task_id} 不存在` };
        }

        const expectedStatus = args.expected_status || 'open';
        if (task.status !== expectedStatus || expectedStatus !== 'open') {
            return {
                status: 'error',
                code: 'TASK_STATE_CONFLICT',
                error: `任务 ${args.task_id} 当前状态为 ${task.status}，预期状态为 ${expectedStatus}`,
                task
            };
        }

        const agentActiveTasks = Object.values(tasks).filter(t =>
            t.assignee === maid && t.status === 'in_progress'
        ).length;

        if (agentActiveTasks >= MAX_ACTIVE_TASKS) {
            return {
                status: 'error',
                code: 'AGENT_TASK_LIMIT_REACHED',
                error: `你已接取 ${agentActiveTasks} 个任务，达到上限 (${MAX_ACTIVE_TASKS})。请先完成现有任务。`
            };
        }

        task.status = 'in_progress';
        task.assignee = maid;
        task.accepted_at = new Date().toISOString();
        task.assignment_id = randomUUID();
        task.history.push({
            action: 'accepted',
            timestamp: new Date().toISOString(),
            by: maid,
            assignment_id: task.assignment_id,
            note: `任务被 ${maid} 接取`
        });

        if (!saveTasks(tasks)) {
            return { status: 'error', code: 'TASK_SAVE_FAILED', error: '保存任务失败' };
        }

        return {
            status: 'success',
            result: `【任务已接取】\n\n⚙️ **${task.title}**\n\n你已成功接取此任务！\n\n**任务ID:** \`${task.id}\`\n**截止时间:** ${task.deadline || '无限制'}\n**所需技能:** ${task.required_skills?.join(', ') || '无特殊要求'}\n\n**下一步:**\n1. 仔细阅读任务描述\n2. 使用 UpdateProgress 记录进度\n3. 完成后使用 SubmitTask 提交`,
            task,
            assignment_id: task.assignment_id
        };
    } finally {
        releaseTaskWriteLock();
    }
}

/**
 * JoinTask - 加入任务团队
 */
function joinTask(args, maid) {
    if (!args.task_id) {
        return { status: 'error', error: '缺少必需参数: task_id' };
    }
    if (!maid) {
        return { status: 'error', error: '无法识别调用者身份 (maid)' };
    }

    const tasks = loadTasks();
    const task = tasks[args.task_id];

    if (!task) {
        return { status: 'error', error: `任务 ${args.task_id} 不存在` };
    }

    if (task.status !== 'in_progress') {
        return { status: 'error', error: `任务 ${args.task_id} 当前状态为 ${task.status}，只有 'in_progress' 状态的任务可以加入。` };
    }

    if (task.assignee === maid) {
        return { status: 'error', error: '你已经是这个任务的负责人了' };
    }

    // 检查是否已在团队中
    if (task.team.some(m => m.name === maid)) {
        return { status: 'error', error: '你已经是这个任务的团队成员了' };
    }

    const role = args.role || 'assistant';
    task.team.push({
        name: maid,
        role: role,
        joined_at: new Date().toISOString()
    });

    task.history.push({
        action: 'joined',
        timestamp: new Date().toISOString(),
        by: maid,
        note: `${maid} 以 ${role} 身份加入团队`
    });

    if (!saveTasks(tasks)) {
        return { status: 'error', error: '保存任务失败' };
    }

    return {
        status: 'success',
        result: `【已加入团队】\n\n你已成功加入任务 **${task.title}** 的团队！\n\n**你的角色:** ${role}\n**负责人:** ${task.assignee}\n**团队成员:** ${task.team.map(m => m.name).join(', ')}\n\n请与团队成员协作完成任务。`
    };
}

/**
 * UpdateProgress - 更新进度
 */
function updateProgress(args, maid) {
    if (!args.task_id || !args.progress_note) {
        return { status: 'error', error: '缺少必需参数: task_id 和 progress_note' };
    }

    const tasks = loadTasks();
    const task = tasks[args.task_id];

    if (!task) {
        return { status: 'error', error: `任务 ${args.task_id} 不存在` };
    }

    if (task.status !== 'in_progress') {
        return { status: 'error', error: `任务 ${args.task_id} 当前状态为 ${task.status}，只有 'in_progress' 状态的任务可以更新进度。` };
    }

    // 检查权限（负责人或团队成员）
    const isTeamMember = task.assignee === maid || task.team.some(m => m.name === maid);
    if (!isTeamMember) {
        return { status: 'error', error: '只有任务负责人或团队成员可以更新进度' };
    }

    if (args.percentage !== undefined) {
        const percentage = parseInt(args.percentage, 10);
        if (!isNaN(percentage) && percentage >= 0 && percentage <= 100) {
            task.progress = percentage;
        }
    }

    task.history.push({
        action: 'progress_update',
        timestamp: new Date().toISOString(),
        by: maid,
        note: args.progress_note,
        percentage: task.progress
    });

    if (!saveTasks(tasks)) {
        return { status: 'error', error: '保存任务失败' };
    }

    return {
        status: 'success',
        result: `【进度已更新】\n\n**任务:** ${task.title}\n**当前进度:** ${task.progress}%\n**更新内容:** ${args.progress_note}\n\n继续加油！💪`
    };
}

/**
 * SubmitTask - 提交任务
 */
function submitTask(args, maid) {
    if (!args.task_id || !args.deliverable || !args.summary) {
        return { status: 'error', error: '缺少必需参数: task_id, deliverable 和 summary' };
    }

    const tasks = loadTasks();
    const task = tasks[args.task_id];

    if (!task) {
        return { status: 'error', error: `任务 ${args.task_id} 不存在` };
    }

    if (task.status !== 'in_progress') {
        return { status: 'error', error: `任务 ${args.task_id} 当前状态为 ${task.status}，只有 'in_progress' 状态的任务可以提交。` };
    }

    // 检查权限
    if (task.assignee !== maid) {
        return { status: 'error', error: '只有任务负责人可以提交任务' };
    }

    task.status = 'submitted';
    task.progress = 100;
    task.deliverable = args.deliverable;
    task.summary = args.summary;
    task.submitted_at = new Date().toISOString();
    
    task.history.push({
        action: 'submitted',
        timestamp: new Date().toISOString(),
        by: maid,
        note: '任务已提交，等待验收'
    });

    if (!saveTasks(tasks)) {
        return { status: 'error', error: '保存任务失败' };
    }

    return {
        status: 'success',
        result: `【任务已提交】\n\n📤 **${task.title}**\n\n任务已成功提交，等待验收！\n\n**交付物:** ${task.deliverable}\n**工作总结:** ${task.summary}\n\n感谢你的辛勤工作！🎉`
    };
}

/**
 * CompleteTask - 完成任务
 */
function completeTask(args, maid) {
    if (!args.task_id) {
        return { status: 'error', error: '缺少必需参数: task_id' };
    }

    const tasks = loadTasks();
    const task = tasks[args.task_id];

    if (!task) {
        return { status: 'error', error: `任务 ${args.task_id} 不存在` };
    }

    if (task.status !== 'submitted') {
        return { status: 'error', error: `任务 ${args.task_id} 当前状态为 ${task.status}，只有 'submitted' 状态的任务可以完成验收。` };
    }

    task.status = 'completed';
    task.completed_at = new Date().toISOString();
    task.reviewed_by = maid;
    
    task.history.push({
        action: 'completed',
        timestamp: new Date().toISOString(),
        by: maid,
        note: args.review_comment || '任务验收通过'
    });

    if (!saveTasks(tasks)) {
        return { status: 'error', error: '保存任务失败' };
    }

    return {
        status: 'success',
        result: `【任务已完成】\n\n✅ **${task.title}**\n\n恭喜！任务已验收通过！\n\n**负责人:** ${task.assignee}\n**验收评语:** ${args.review_comment || '工作完成得很好！'}\n\n感谢所有参与者的努力！🏆`
    };
}

/**
 * FailTask - 标记任务失败
 */
function failTask(args, maid) {
    if (!args.task_id || !args.reason) {
        return { status: 'error', error: '缺少必需参数: task_id 和 reason' };
    }

    const tasks = loadTasks();
    const task = tasks[args.task_id];

    if (!task) {
        return { status: 'error', error: `任务 ${args.task_id} 不存在` };
    }

    if (!['in_progress', 'submitted'].includes(task.status)) {
        return { status: 'error', error: `任务 ${args.task_id} 当前状态为 ${task.status}，无法标记失败。` };
    }

    task.status = 'open'; // 释放回任务池
    task.failed_attempts = (task.failed_attempts || 0) + 1;
    
    task.history.push({
        action: 'failed',
        timestamp: new Date().toISOString(),
        by: maid,
        previous_assignee: task.assignee,
        note: args.reason
    });

    // 清空分配信息
    task.assignee = null;
    task.accepted_at = null;
    task.assignment_id = null;
    task.team = [];
    task.progress = 0;
    task.deliverable = null;
    task.summary = null;

    if (!saveTasks(tasks)) {
        return { status: 'error', error: '保存任务失败' };
    }

    return {
        status: 'success',
        result: `【任务失败】\n\n❌ **${task.title}**\n\n任务已标记为失败并释放回任务池。\n\n**失败原因:** ${args.reason}\n**失败次数:** ${task.failed_attempts}\n\n任务现在可以被其他Agent接取。`
    };
}

/**
 * AbandonTask - 放弃任务
 */
function abandonTask(args, maid) {
    if (!args.task_id) {
        return { status: 'error', error: '缺少必需参数: task_id' };
    }

    if (!acquireTaskWriteLock()) {
        return { status: 'error', code: 'TASK_BOARD_BUSY', error: '任务板正在处理其他状态变更，请稍后重试' };
    }

    try {
        const tasks = loadTasks();
        const task = tasks[args.task_id];

        if (!task) {
            return { status: 'error', error: `任务 ${args.task_id} 不存在` };
        }

        if (task.status !== 'in_progress') {
            return { status: 'error', error: `任务 ${args.task_id} 当前状态为 ${task.status}，无法放弃。` };
        }

        const isCompensation = args.assignment_id && task.assignment_id === args.assignment_id;
        if (task.assignee !== maid && !isCompensation) {
            return { status: 'error', error: '只有任务负责人或持有当前分配令牌的调度器可以放弃任务' };
        }

        if (args.assignment_id && task.assignment_id !== args.assignment_id) {
            return { status: 'error', code: 'ASSIGNMENT_CONFLICT', error: '任务分配令牌已变化，拒绝释放' };
        }

        task.status = 'open';
        task.history.push({
            action: isCompensation ? 'assignment_rollback' : 'abandoned',
            timestamp: new Date().toISOString(),
            by: maid,
            assignment_id: task.assignment_id || null,
            note: args.reason || '负责人主动放弃任务'
        });

        task.assignee = null;
        task.accepted_at = null;
        task.assignment_id = null;
        task.team = [];

        if (!saveTasks(tasks)) {
            return { status: 'error', error: '保存任务失败' };
        }

        return {
            status: 'success',
            result: `【任务已放弃】\n\n📋 **${task.title}**\n\n任务已释放回任务池。\n\n**放弃原因:** ${args.reason || '无'}\n\n任务现在可以被其他Agent接取。`,
            task
        };
    } finally {
        releaseTaskWriteLock();
    }
}

/**
 * AppendTaskLog - 追加任务日记
 */
function appendTaskLog(args, maid) {
    if (!args.task_id || !args.content) {
        return { status: 'error', error: '缺少必需参数: task_id 和 content' };
    }

    const tasks = loadTasks();
    const task = tasks[args.task_id];

    if (!task) {
        return { status: 'error', error: `任务 ${args.task_id} 不存在` };
    }

    // 允许 in_progress, submitted, completed 状态写入日记
    if (!['in_progress', 'submitted', 'completed'].includes(task.status)) {
         return { status: 'error', error: `任务 ${args.task_id} 当前状态为 ${task.status}，无法写入日记。` };
    }

    // 检查权限
    const isTeamMember = task.assignee === maid || (task.team && task.team.some(m => m.name === maid));
    if (!isTeamMember) {
        return { status: 'error', error: '只有任务负责人或团队成员可以写入日记' };
    }

    ensureDataDir();
    const logFile = path.join(LOGS_DIR, `${args.task_id}.md`);
    
    const timestamp = new Date().toISOString();
    const logEntry = `\n## [${timestamp}] ${maid}\n\n${args.content}\n`;

    try {
        fs.appendFileSync(logFile, logEntry, 'utf-8');
        
        // 更新最后日志时间
        task.last_log_at = timestamp;
        saveTasks(tasks);

        return {
            status: 'success',
            result: `【日记已追加】\n已成功向任务 ${task.title} 的日记本写入内容。`
        };
    } catch (e) {
        return { status: 'error', error: `写入日记失败: ${e.message}` };
    }
}

/**
 * ReadTaskLog - 读取任务日记
 */
function readTaskLog(args) {
    if (!args.task_id) {
        return { status: 'error', error: '缺少必需参数: task_id' };
    }

    const tasks = loadTasks();
    const task = tasks[args.task_id];

    if (!task) {
        return { status: 'error', error: `任务 ${args.task_id} 不存在` };
    }

    ensureDataDir();
    const logFile = path.join(LOGS_DIR, `${args.task_id}.md`);

    if (!fs.existsSync(logFile)) {
        return { status: 'success', result: `【任务日记】\n(暂无日记内容)` };
    }

    try {
        let content = fs.readFileSync(logFile, 'utf-8');
        
        // 如果指定了 lines 参数，只返回最后 N 行
        if (args.lines) {
            const linesCount = parseInt(args.lines, 10);
            if (!isNaN(linesCount) && linesCount > 0) {
                const lines = content.split('\n');
                if (lines.length > linesCount) {
                    content = '... (前文省略) ...\n' + lines.slice(-linesCount).join('\n');
                }
            }
        }

        return {
            status: 'success',
            result: `【任务日记: ${task.title}】\n\n${content}`
        };
    } catch (e) {
        return { status: 'error', error: `读取日记失败: ${e.message}` };
    }
}

// ============== 主入口 ==============

/**
 * 处理请求
 */
function processRequest(request) {
    const command = request.command;
    const maid = request.maid; // 调用者身份

    // 移除command和maid，剩余的作为参数
    const args = { ...request };
    delete args.command;
    delete args.maid;

    switch (command) {
        case 'ListTasks':
            return listTasks(args);
        case 'GetTask':
            return getTask(args);
        case 'PostTask':
            return postTask(args, maid);
        case 'AcceptTask':
            return acceptTask(args, maid);
        case 'JoinTask':
            return joinTask(args, maid);
        case 'UpdateProgress':
            return updateProgress(args, maid);
        case 'SubmitTask':
            return submitTask(args, maid);
        case 'CompleteTask':
            return completeTask(args, maid);
        case 'FailTask':
            return failTask(args, maid);
        case 'AbandonTask':
            return abandonTask(args, maid);
        case 'AppendTaskLog':
            return appendTaskLog(args, maid);
        case 'ReadTaskLog':
            return readTaskLog(args);
        default:
            return {
                status: 'error',
                error: `未知命令: ${command}。可用命令: ListTasks, GetTask, PostTask, AcceptTask, JoinTask, UpdateProgress, SubmitTask, CompleteTask, FailTask, AbandonTask, AppendTaskLog, ReadTaskLog`
            };
    }
}

/**
 * 主函数 - 读取stdin，处理请求，输出到stdout
 */
function main() {
    let inputData = '';

    process.stdin.setEncoding('utf-8');

    process.stdin.on('data', (chunk) => {
        inputData += chunk;
    });

    process.stdin.on('end', () => {
        try {
            // 解析输入JSON
            const request = JSON.parse(inputData.trim());
            
            if (DEBUG_MODE) {
                console.error(`[TaskBoard] Received request: ${JSON.stringify(request)}`);
            }

            // 处理请求
            const result = processRequest(request);

            // 输出结果到stdout
            console.log(JSON.stringify(result));
            process.exit(result.status === 'success' ? 0 : 1);

        } catch (e) {
            const errorResult = {
                status: 'error',
                error: `解析请求失败: ${e.message}`
            };
            console.log(JSON.stringify(errorResult));
            process.exit(1);
        }
    });

    process.stdin.on('error', (e) => {
        const errorResult = {
            status: 'error',
            error: `读取输入失败: ${e.message}`
        };
        console.log(JSON.stringify(errorResult));
        process.exit(1);
    });
}

// 执行主函数
main();