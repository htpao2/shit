const fs = require('fs');
const path = require('path');

// 配置路径
const VIBE_DIR = path.join(process.cwd(), '.vibe');
const STATE_FILE = path.join(VIBE_DIR, 'state.json');
const HISTORY_DIR = path.join(VIBE_DIR, 'history');
const DAILYNOTE_DIR = path.join(process.cwd(), 'dailynote');
const TASKS_DIR = path.join(DAILYNOTE_DIR, 'tasks');
const COLLAB_DIR = path.join(DAILYNOTE_DIR, 'collaboration');
const INDEX_FILE = path.join(DAILYNOTE_DIR, 'Project_Status.md');

// 确保目录存在
const dirs = [VIBE_DIR, HISTORY_DIR, DAILYNOTE_DIR, TASKS_DIR, COLLAB_DIR, path.join(TASKS_DIR, 'active'), path.join(TASKS_DIR, 'done')];
dirs.forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

/**
 * 读取标准输入
 */
async function readStdin() {
    return new Promise((resolve) => {
        let data = '';
        process.stdin.on('data', (chunk) => {
            data += chunk;
        });
        process.stdin.on('end', () => {
            try {
                resolve(JSON.parse(data));
            } catch (e) {
                resolve({});
            }
        });
    });
}

/**
 * 将任务同步到独立文件
 */
function syncTaskToFile(task) {
    const subDir = task.status === 'done' ? 'done' : 'active';
    const taskPath = path.join(TASKS_DIR, subDir, `${task.id}.md`);
    
    // 如果状态改变，删除旧位置的文件
    const oldSubDir = task.status === 'done' ? 'active' : 'done';
    const oldPath = path.join(TASKS_DIR, oldSubDir, `${task.id}.md`);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);

    const content = `
# 任务详情: ${task.id}
- **标题**: ${task.title}
- **描述**: ${task.description}
- **分配给**: ${task.assignee}
- **当前状态**: ${task.status}
- **执行 Agent**: ${task.agentName || '未分配'}

## 历史记录
${task.history.map(h => `- [${h.timestamp}] **${h.action}** ${h.agent ? `(Agent: ${h.agent})` : ''} ${h.deliverables ? `\n  - 交付物: ${h.deliverables}` : ''} ${h.feedback ? `\n  - 反馈: ${h.feedback}` : ''}`).join('\n')}
`.trim();
    fs.writeFileSync(taskPath, content);
}

/**
 * 将协作区域同步到独立文件
 */
function syncCollabToFile(section, content) {
    const collabPath = path.join(COLLAB_DIR, `${section.toLowerCase()}.md`);
    const mdContent = `# ${section}\n\n${content || '暂无内容'}`;
    fs.writeFileSync(collabPath, mdContent);
}

/**
 * 更新索引文件
 */
function updateIndex(state) {
    const content = `
# 项目索引: ${state.project.name}
> 状态: \`${state.project.stage}\` | 最后更新: ${state.meta.lastUpdated}

## 1. 任务看板
- [进行中任务列表](./tasks/active/)
- [已完成任务归档](./tasks/done/)

## 2. 协作中心
- [阻塞与问题 (Blockers)](./collaboration/blockers.md)
- [评审反馈 (Review Feedback)](./collaboration/reviewfeedback.md)
- [决策记录 (Decision Log)](./collaboration/decisionlog.md)

---
*Powered by VibeOrchestrator Structured Storage*
`.trim();
    fs.writeFileSync(INDEX_FILE, content);
}

/**
 * 保存状态并同步文件系统
 */
function saveState(state) {
    state.meta = state.meta || {};
    state.meta.lastUpdated = new Date().toISOString();
    const snapshotId = Date.now();
    state.meta.snapshotId = `snap-${snapshotId}`;

    const stateContent = JSON.stringify(state, null, 2);
    fs.writeFileSync(STATE_FILE, stateContent);

    // 同步到文件系统
    Object.values(state.tasks).forEach(syncTaskToFile);
    Object.keys(state.collaboration).forEach(section => {
        syncCollabToFile(section, state.collaboration[section]);
    });
    updateIndex(state);

    // 创建历史快照
    const snapshotPath = path.join(HISTORY_DIR, `state-${snapshotId}.json`);
    fs.writeFileSync(snapshotPath, stateContent);
}

/**
 * 加载状态
 */
function loadState() {
    if (!fs.existsSync(STATE_FILE)) return null;
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
}

/**
 * 主逻辑
 */
async function main() {
    const args = await readStdin();
    const command = args.command;
    let state = loadState();

    try {
        switch (command) {
            case 'InitProject':
                state = {
                    project: { name: args.projectName || 'New Project', stage: 'Planning', description: args.description || '' },
                    collaboration: { Blockers: "", ReviewFeedback: "", DecisionLog: "" },
                    tasks: {},
                    taskCounter: 0
                };
                saveState(state);
                console.log(JSON.stringify({ status: "success", result: "项目初始化成功，结构化目录已创建" }));
                break;

            case 'GetState':
                if (!state) throw new Error("项目未初始化");
                console.log(JSON.stringify({ status: "success", result: state }));
                break;

            case 'GetContext':
                if (!state) throw new Error("项目未初始化");
                const agentName = args.agentName;
                const role = args.role; // Archon, Weaver, Observer
                
                let context = `### 当前项目阶段: ${state.project.stage}\n\n`;
                
                // 1. 获取分配给该 Agent 的任务
                const myTasks = Object.values(state.tasks).filter(t => 
                    (role === 'Weaver' && t.status === 'in_progress' && t.agentName === agentName) ||
                    (role === 'Observer' && t.status === 'review') ||
                    (role === 'Archon')
                );

                context += `## 你的相关任务\n`;
                if (myTasks.length > 0) {
                    myTasks.forEach(t => {
                        context += `### [${t.id}] ${t.title}\n- 描述: ${t.description}\n- 状态: ${t.status}\n\n`;
                    });
                } else {
                    context += `暂无直接分配的任务。\n\n`;
                }

                // 2. 获取全局协作信息
                context += `## 全局协作信息\n`;
                context += `### 阻塞项 (Blockers):\n${state.collaboration.Blockers || '无'}\n\n`;
                context += `### 决策记录 (Decision Log):\n${state.collaboration.DecisionLog || '无'}\n\n`;
                
                if (role === 'Weaver' || role === 'Observer') {
                    context += `### 评审反馈 (Review Feedback):\n${state.collaboration.ReviewFeedback || '无'}\n`;
                }

                console.log(JSON.stringify({ status: "success", result: context }));
                break;

            case 'CreateTask':
                if (!state) throw new Error("项目未初始化");
                state.taskCounter++;
                const taskId = `TASK-${state.taskCounter}`;
                state.tasks[taskId] = {
                    id: taskId,
                    title: args.title,
                    description: args.description,
                    assignee: args.assignee,
                    status: 'pending',
                    history: [{ action: 'created', timestamp: new Date().toISOString() }]
                };
                saveState(state);
                console.log(JSON.stringify({ status: "success", result: `任务创建并同步成功: ${taskId}` }));
                break;

            case 'StartTask':
                if (!state) throw new Error("项目未初始化");
                if (!state.tasks[args.taskId]) throw new Error("任务不存在");
                state.tasks[args.taskId].status = 'in_progress';
                state.tasks[args.taskId].agentName = args.agentName;
                state.tasks[args.taskId].history.push({ action: 'started', agent: args.agentName, timestamp: new Date().toISOString() });
                saveState(state);
                console.log(JSON.stringify({ status: "success", result: `任务已启动并同步: ${args.taskId}` }));
                break;

            case 'SubmitTask':
                if (!state) throw new Error("项目未初始化");
                if (!state.tasks[args.taskId]) throw new Error("任务不存在");
                state.tasks[args.taskId].status = 'review';
                state.tasks[args.taskId].deliverables = args.deliverables;
                state.tasks[args.taskId].history.push({ action: 'submitted', deliverables: args.deliverables, timestamp: new Date().toISOString() });
                saveState(state);
                console.log(JSON.stringify({ status: "success", result: `任务已提交评审并同步: ${args.taskId}` }));
                break;

            case 'ApproveTask':
                if (!state) throw new Error("项目未初始化");
                if (!state.tasks[args.taskId]) throw new Error("任务不存在");
                state.tasks[args.taskId].status = 'done';
                state.tasks[args.taskId].history.push({ action: 'approved', feedback: args.feedback, timestamp: new Date().toISOString() });
                saveState(state);
                console.log(JSON.stringify({ status: "success", result: `任务已通过并归档: ${args.taskId}` }));
                break;

            case 'RejectTask':
                if (!state) throw new Error("项目未初始化");
                if (!state.tasks[args.taskId]) throw new Error("任务不存在");
                state.tasks[args.taskId].status = 'in_progress';
                state.tasks[args.taskId].history.push({ action: 'rejected', feedback: args.feedback, timestamp: new Date().toISOString() });
                saveState(state);
                console.log(JSON.stringify({ status: "success", result: `任务已驳回并同步: ${args.taskId}` }));
                break;

            case 'UpdateSection':
                if (!state) throw new Error("项目未初始化");
                const section = args.section;
                const mode = args.mode || 'append';
                if (mode === 'overwrite') {
                    state.collaboration[section] = args.content;
                } else {
                    state.collaboration[section] = (state.collaboration[section] || "") + "\n" + args.content;
                }
                saveState(state);
                console.log(JSON.stringify({ status: "success", result: `区域 ${section} 更新并同步成功` }));
                break;

            case 'TransitionStage':
                state.project.stage = args.targetStage;
                saveState(state);
                console.log(JSON.stringify({ status: "success", result: `阶段已切换: ${args.targetStage}` }));
                break;

            default:
                console.log(JSON.stringify({ status: "error", error: `未知指令: ${command}` }));
        }
    } catch (e) {
        console.log(JSON.stringify({ status: "error", error: e.message }));
    }
}

main();