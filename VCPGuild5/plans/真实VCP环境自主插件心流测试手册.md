# 真实 VCP 环境自主插件与 Flowlock 测试手册

## 1. 文档目标

本手册用于在完整 VCP 环境中验证以下插件的真实加载、跨插件调用、真实模型请求、官方 AgentAssistant Flowlock、任务日记、任务状态闭环和重启恢复：

- [`AgentAssistant`](../AgentAssistant/)
- [`TaskBoardPlugin`](../TaskBoardPlugin/)
- [`TaskFlowlockBridgePlugin`](../TaskFlowlockBridgePlugin/)
- [`AutonomousSchedulerPlugin`](../AutonomousSchedulerPlugin/)
- [`VCPSocietyScheduler`](../VCPSocietyScheduler/)

本文中的 `VCP根目录` 指实际运行 `server.js` 的完整 VCP 根目录，不是当前设计文件工作区。插件应复制到：

```text
VCP根目录/
├── server.js
├── Plugin.js
├── Plugin/
│   ├── AgentAssistant/
│   ├── TaskBoardPlugin/
│   ├── TaskFlowlockBridgePlugin/
│   ├── AutonomousSchedulerPlugin/
│   └── VCPSocietyScheduler/
└── ...
```

这是当前实现的必要目录关系。桥接插件和调度器会从插件目录执行 `require('../../Plugin.js')`，因此真实环境必须存在 `VCP根目录/Plugin.js`。

## 2. 先读结论

本项目当前已经通过本地协议解析测试和注入式桥接测试，但尚未在真实 VCP 根目录中验证以下内容：

- PluginManager 是否能发现并加载五个目标插件。
- manifest 中的 `pluginType`、`entryPoint`、`communication.protocol` 是否完全符合当前 VCP 版本的加载契约。
- `PluginManager.processToolCall()` 对 direct、stdio、hybridservice 的真实返回值格式。
- AgentAssistant 是否能在真实模型服务中完成工具调用并输出 Flowlock 标记。
- AgentAssistant 完成回调和归档文件是否能被桥接层实际查询到。
- VCP 重启时 PluginManager 的初始化顺序是否满足桥接恢复要求。
- 真实 TaskBoard 数据文件、桥接映射文件和 AA 归档文件在并发写入时是否符合预期。

因此，首次测试必须从低风险、短任务、可清理的数据开始，不要一开始启用长周期调度或 Society 随机唤醒。

## 3. 已知阻断项与风险

### 3.1 Society 未知 Agent 分支存在代码错误

[`VCPSocietyScheduler.js`](../VCPSocietyScheduler/VCPSocietyScheduler.js:760) 中的 `handleWakeAgentWithContext()` 对未找到的 Agent 使用了 `const profile`，随后又尝试重新赋值。调用未知 Agent 时预计会抛出 `Assignment to constant variable`。

因此，在该问题修复前：

- 只使用 AgentAssistant 配置中真实存在的 Agent 测试 `WakeAgentWithContext`。
- 必须额外执行一次未知 Agent 测试，并把该异常记录为已知缺陷，而不是环境配置故障。
- 不要把未知 Agent 作为自动调度默认 Agent。

### 3.2 TaskBoard 使用 direct 结构化调用

[`TaskBoardPlugin.js`](../TaskBoardPlugin/TaskBoardPlugin.js:24) 现在支持 `initialize(config)` 注入配置，并通过 `processToolCall()` 返回结构化任务对象。其 manifest 已从 `synchronous/stdio` 改为 `hybridservice/direct`，避免真实 VCP 跨插件调用只得到 `original_plugin_output` 展示文本。

TaskBoard 仍兼容从 `process.env` 读取配置，但真实 VCP 测试应优先确认 PluginManager 传入的配置是否生效。第一次测试建议显式设置：

```text
TASK_BOARD_DATA_DIR=VCP根目录/Plugin/TaskBoardPlugin/data-test
TASK_LOCK_STALE_MS=30000
MAX_ACTIVE_TASKS=3
TASK_TIMEOUT_HOURS=24
DEBUG_MODE=true
```

不要直接使用正式任务数据目录，除非已经完成备份。

### 3.3 AgentAssistant 的 Flowlock 首轮要求

[`AgentAssistant.js`](../AgentAssistant/AgentAssistant.js:1064) 使用 [`flowlockProtocol.js`](../AgentAssistant/flowlockProtocol.js:1) 解析模型回复。对于新 Flowlock 协议，模型首轮必须输出 `[[Flowlock::Start]]` 才会进入后续心跳；只输出 `NextHeartbeat` 或普通文本不会隐式启动。

桥接任务提示已经包含该要求，但真实模型不一定遵守。因此测试必须记录：

- 最终回复原文。
- `query_delegation` 返回的状态。
- AgentAssistant 日志中的 `flowlockActive`、协议模式和轮数。
- 是否因为没有 `Start` 而进入 `stopped`。

### 3.4 同一 Agent 不保证真正并行

[`AgentAssistant.js`](../AgentAssistant/AgentAssistant.js:973) 使用固定 delegation session 锁。同一 Agent 的第二个异步委托可能处于等待状态，而不是同时请求模型。

真实测试预期是：

- 第二个任务可以创建 delegationId。
- 第二个桥接映射最终显示 `queued` 或 AA 状态为等待。
- 不应把两个任务同时收到模型回复作为验收条件。

## 4. 测试前置条件

### 4.1 运行环境

确认真实机器具备：

- Windows 11 或与 VCP 正式部署一致的系统。
- 与完整 VCP 项目兼容的 Node.js 版本。
- VCP 所需的依赖已经在 `VCP根目录` 安装完成。
- VCP server 使用的端口未被其他实例占用。
- AgentAssistant 使用的 VCP API 地址、访问密钥和模型服务可用。
- 至少一个真实 Agent 已在 AgentAssistant 配置中定义。
- 该 Agent 对应模型能够返回普通文本。
- 如果要测试工具闭环，该 Agent 必须能看到 `TaskBoard` 工具说明。

### 4.2 备份正式数据

停止 VCP 后备份以下目录或文件：

```text
VCP根目录/Plugin/TaskBoardPlugin/data/
VCP根目录/Plugin/TaskFlowlockBridgePlugin/data/
VCP根目录/VCPAsyncResults/
VCP根目录/file/document/AgentTask/
```

首次测试推荐使用隔离目录，不要覆盖正式任务数据。备份至少包括：

- `tasks.json`
- `logs/`
- `task-delegations.json`
- `audit.jsonl`
- AgentAssistant 委托归档文件

### 4.3 复制插件

将以下目录复制到 `VCP根目录/Plugin/`：

- [`AgentAssistant`](../AgentAssistant/)
- [`TaskBoardPlugin`](../TaskBoardPlugin/)
- [`TaskFlowlockBridgePlugin`](../TaskFlowlockBridgePlugin/)
- [`AutonomousSchedulerPlugin`](../AutonomousSchedulerPlugin/)
- [`VCPSocietyScheduler`](../VCPSocietyScheduler/)

同时复制配置示例并按真实环境创建配置：

- [`AgentAssistant/config.env.example`](../AgentAssistant/config.env.example)
- [`AutonomousSchedulerPlugin/config.env.example`](../AutonomousSchedulerPlugin/config.env.example)
- [`TaskFlowlockBridgePlugin/config.env.example`](../TaskFlowlockBridgePlugin/config.env.example)

不要复制旧的 BackendFlowlockPlugin。真实 Plugin 目录中只能存在一套后端 Flowlock 实现。

## 5. 推荐测试配置

### 5.1 AgentAssistant

在 `VCP根目录/Plugin/AgentAssistant/` 使用一个专用测试 Agent。建议其模型配置满足：

- 能稳定返回文本。
- 上下文长度足够执行 3 至 5 轮。
- 测试期间不会调用高风险工具。
- 测试提示中明确要求输出 Flowlock 标记。
- `DELEGATION_MAX_ROUNDS` 先设为较小值，例如 3 或 5。
- `DELEGATION_TIMEOUT` 先设为较短值，例如 120000 毫秒，避免错误委托长期运行。

不要先使用生产 Agent 的复杂系统提示。第一轮使用一个行为可预测的测试 Agent 更容易判断协议问题还是模型问题。

### 5.2 TaskFlowlockBridgePlugin

复制 [`config.env.example`](../TaskFlowlockBridgePlugin/config.env.example)，测试阶段建议：

```env
TASK_FLOWLOCK_BRIDGE_ENABLED=true
TASK_FLOWLOCK_RECONCILE_INTERVAL_SECONDS=10
TASK_FLOWLOCK_RECOVERY_DELAY_SECONDS=5
TASK_FLOWLOCK_MAX_REDISPATCHES=1
TASK_FLOWLOCK_DATA_DIR=./data-test
```

10 秒对账便于观察；验证完成后再恢复生产值。`MAX_REDISPATCHES=1` 可以避免故障注入时生成大量真实委托。

### 5.3 AutonomousSchedulerPlugin

首次启动建议关闭自动定时，仅使用手动 `CheckTaskBoard`：

```env
AUTONOMOUS_SCHEDULER_ENABLED=false
AUTONOMOUS_SCHEDULE_INTERVAL_MINUTES=30
AUTONOMOUS_IDLE_PROBABILITY=0
DEFAULT_AGENT_NAME=实际存在的测试Agent名称
```

原因是调度器初始化后会在 30 秒后进行首次检查；如果测试任务已经存在，可能在你还没有观察状态前自动创建委托。

### 5.4 VCPSocietyScheduler

首次启动建议关闭：

```env
SOCIETY_ENABLED=false
RANDOM_WAKE_PROBABILITY=0
WEATHER_API_ENABLED=false
NEWS_API_ENABLED=false
FORUM_CHECK_ENABLED=false
```

Society 脉搏会在启动约 60 秒后首次执行，关闭可以先验证插件加载，不会立即产生真实 Agent 通讯。

## 6. 阶段一：启动前静态检查

在 `VCP根目录` 执行：

```powershell
node --check Plugin\AgentAssistant\AgentAssistant.js
node --check Plugin\AgentAssistant\flowlockProtocol.js
node --check Plugin\TaskBoardPlugin\TaskBoardPlugin.js
node --check Plugin\TaskFlowlockBridgePlugin\TaskFlowlockBridgePlugin.js
node --check Plugin\AutonomousSchedulerPlugin\AutonomousSchedulerPlugin.js
node --check Plugin\VCPSocietyScheduler\VCPSocietyScheduler.js
```

验证所有 manifest：

```powershell
node -e "const fs=require('fs'); const p=['AgentAssistant','TaskBoardPlugin','TaskFlowlockBridgePlugin','AutonomousSchedulerPlugin','VCPSocietyScheduler']; for (const n of p) JSON.parse(fs.readFileSync('Plugin/'+n+'/plugin-manifest.json','utf8')); console.log('manifest ok')"
```

预期结果：

```text
manifest ok
```

然后确认目录结构：

```powershell
Test-Path .\Plugin.js
Test-Path .\Plugin\AgentAssistant\AgentAssistant.js
Test-Path .\Plugin\TaskBoardPlugin\TaskBoardPlugin.js
Test-Path .\Plugin\TaskFlowlockBridgePlugin\TaskFlowlockBridgePlugin.js
```

四项都应返回 `True`。如果 `Plugin.js` 不存在，不要继续测试桥接和调度器，因为 direct 插件的跨插件调用一定会失败。

## 7. 阶段二：只验证插件发现和生命周期

执行：

```powershell
node server.js
```

启动日志中应确认：

1. `AgentAssistant` 初始化成功。
2. `TaskBoardPlugin` 被发现并可用。
3. `TaskFlowlockBridgePlugin` 初始化成功，并显示活动映射数量。
4. `AutonomousSchedulerPlugin` 初始化成功；测试配置为禁用时应明确显示 disabled。
5. `VCPSocietyScheduler` 初始化成功；测试配置为禁用时应明确显示 disabled。
6. 没有 `Cannot find module '../../Plugin.js'`。
7. 没有 manifest 解析错误、入口脚本错误或插件名称冲突。

若出现桥接初始化成功但后续调用报 `PluginManager unavailable`，说明插件自身被加载，但其运行目录与 `Plugin.js` 相对路径不匹配。

### 7.1 生命周期预期

停止 VCP 后，应看到：

- AgentAssistant 停止清理定时器。
- TaskFlowlockBridgePlugin 停止对账定时器并保存状态。
- AutonomousSchedulerPlugin 停止调度器。
- VCPSocietyScheduler 停止脉搏。

如果停止后 Node 进程仍保持运行，优先检查插件是否遗留 `setInterval` 或未结束的真实请求。

## 8. 阶段三：TaskBoard 单体真实测试

先不要启用调度器和 Society。通过 VCP 的真实工具入口调用 `TaskBoard`，或使用 VCP 管理面板提供的插件调用功能。

### 8.1 发布任务

调用 `PostTask`：

```text
maid: 测试者
command: PostTask
title: Flowlock真实环境冒烟测试
description: 只验证任务板、任务日记和官方AA委托闭环，不执行外部副作用。
required_skills: [programming]
priority: low
```

预期：

- 返回 `status: success`。
- 返回任务 ID。
- `ListTasks` 能查到该任务，状态为 `open`。
- `tasks.json` 中存在任务对象。
- 任务的 `assignment_id` 尚不存在或为空。

记下任务 ID，后续统一使用 `TASK_ID` 表示。

### 8.2 原子接取

调用：

```text
maid: 测试Agent名称
command: AcceptTask
task_id: TASK_ID
expected_status: open
```

预期：

- 返回 `status: success`。
- 返回 `assignment_id`。
- 任务状态变为 `in_progress`。
- `assignee` 等于测试 Agent。
- `assignment_id` 写入 `tasks.json`。
- `data/.taskboard-write.lock` 不会长期残留。

再次使用另一个调用快速接取同一任务，预期返回 `TASK_STATE_CONFLICT`，不能生成第二个分配令牌。

### 8.3 任务日记

使用负责人调用 `AppendTaskLog`：

```text
maid: 测试Agent名称
command: AppendTaskLog
task_id: TASK_ID
content: 真实环境冒烟测试已开始。
```

再调用 `ReadTaskLog`。预期：

- 写入返回 `status: success`。
- `TaskBoardPlugin/data-test/logs/TASK_ID.md` 存在。
- 读取结果包含刚写入的内容。
- 非负责人写入应失败。

## 9. 阶段四：AgentAssistant 官方 Flowlock 单体测试

该阶段先绕过调度器和桥接，直接确认 AA 能处理异步委托。

### 9.1 创建最小异步委托

通过真实 AgentAssistant 工具调用：

```text
agent_name: 测试Agent名称
prompt: 请只做协议测试。第一轮回复必须包含 [[Flowlock::Start]]，然后说明已进入测试状态。下一轮输出 [[Flowlock::Complete]] 并给出一句完成报告。不要调用外部工具。
task_delegation: true
```

预期：

- 立即返回包含 `aa-delegation-` 前缀的 `delegationId`。
- 不应阻塞到模型任务全部结束后才返回。
- `query_delegation` 在运行期间能返回“仍在进行中”与当前状态。
- 第一轮如果模型输出 `Start`，AA 会进入 Flowlock 心跳。
- 最终查询应显示成功完成或归档完成。
- `VCPAsyncResults/` 或 `file/document/AgentTask/` 中出现对应结果，具体目录以当前 VCP 实现为准。

### 9.2 验证未启动行为

再次创建委托，提示模型只输出普通文本或只输出 `[[Flowlock::NextHeartbeat::1]]`，不输出 `Start`。

预期：

- AA 不应隐式开启新 Flowlock。
- 查询结果最终显示停止、未启动或等价状态。
- 该行为必须与 [`flowlockProtocol.js`](../AgentAssistant/flowlockProtocol.js:1) 的“必须先 Start”规则一致。

### 9.3 验证停止和失败

分别创建两个短委托：

- 一个要求输出 `[[Flowlock::Stop]]`。
- 一个要求输出 `[[Flowlock::Fail]]`。

预期：

- Stop 不应被误判为成功。
- Fail 不应被误判为成功。
- `query_delegation`、归档报告和回调状态彼此一致。
- 如果模型不遵守提示，记录原始回复并把结果归类为模型遵循性问题，而不是协议解析器问题。

## 10. 阶段五：TaskFlowlockBridge 真实跨插件测试

### 10.1 启动任务心流

使用已经处于 `in_progress` 的 `TASK_ID` 和真实 `assignment_id` 调用：

```text
command: StartTaskFlowlock
task_id: TASK_ID
agent_name: 测试Agent名称
assignment_id: ASSIGNMENT_ID
prompt: 这是一次真实桥接测试。请先调用 TaskBoard.AppendTaskLog 记录开始，然后输出 [[Flowlock::Start]]。下一轮只做短验证，调用 TaskBoard.AppendTaskLog，最后调用 TaskBoard.SubmitTask 后输出 [[Flowlock::Complete]]。
```

预期：

- 返回 `status: success`。
- 返回可识别的 `delegationId`。
- 映射状态初始通常为 `queued`。
- `TaskFlowlockBridgePlugin/data-test/task-delegations.json` 出现记录。
- `audit.jsonl` 至少出现映射创建和委托派发事件。
- AgentAssistant 收到 `task_delegation: true` 和 `inject_tools: TaskBoard`。
- Agent 能看到任务信息、任务日记和 TaskBoard 工具说明。

### 10.2 幂等与分配令牌保护

重复使用同一个 `task_id`、Agent 和 `assignment_id` 调用 `StartTaskFlowlock`。

预期：

- 返回 `status: success`。
- `idempotent: true`。
- delegationId 不变。
- 不会创建第二个 AA 委托。

随后使用错误的 `assignment_id` 调用同一命令。

预期：

- 返回 `ASSIGNMENT_CONFLICT`。
- delegationId 不会变化。
- TaskBoard 任务不会被释放或重新接取。

### 10.3 查询与对账

依次调用：

```text
command: GetTaskFlowlock
task_id: TASK_ID
agent_name: 测试Agent名称
```

```text
command: ListTaskFlowlocks
agent_name: 测试Agent名称
```

```text
command: GetTaskFlowlockBridgeStatus
```

预期：

- 显示 `taskId`、`assignmentId`、`delegationId`、桥接状态和 AA 状态。
- 同一 Agent 的第二个委托若在 AA 等待，显示 `queuedBehindAgentWork: true` 或等价等待状态。
- 状态接口声明官方 AA 为 Flowlock 内核。

手动调用：

```text
command: ReconcileTaskFlowlocks
allow_redispatch: false
```

预期：

- 返回对账结果。
- 对账不会因为 `allow_redispatch=false` 创建新委托。
- 任务仍在正常运行时，映射保留。

### 10.4 成功闭环

确认 Agent 实际完成以下顺序：

1. 调用 `TaskBoard.AppendTaskLog`。
2. 调用 `TaskBoard.SubmitTask`，写入 deliverable 和 summary。
3. 输出 `[[Flowlock::Complete]]`。

预期：

- TaskBoard 状态至少变为 `submitted`。
- 桥接下一次对账将映射归档为 `completed`。
- `ListTaskFlowlocks` 的活动映射不再包含该任务。
- `recent` 中出现终态记录。
- AA 查询或归档报告体现成功完成。

`Complete` 不能单独替代 `SubmitTask`。如果 Agent 输出 Complete 但任务仍是 `in_progress`，桥接会进入 orphaned 并尝试限次重派，这是需要重点观察的异常闭环。

### 10.5 失败闭环

使用第二个测试任务，让 Agent 输出 `[[Flowlock::Fail]]`，或在测试提示中要求先调用 `TaskBoard.FailTask`。

预期：

- AA 状态是 failed、stopped 或 cancelled 中的失败类状态。
- 桥接调用 `TaskBoard.FailTask`。
- 任务回到 `open`，负责人和 `assignment_id` 被清空。
- 桥接映射归档为 failed。
- 任务历史中出现失败记录。

如果 FailTask 失败，桥接应保留 `orphaned` 映射并记录错误，不能直接假装闭环完成。

### 10.6 手动停止

对仍在运行的任务调用：

```text
command: StopTaskFlowlock
task_id: TASK_ID
agent_name: 测试Agent名称
reason: 真实环境停止测试
```

预期：

- AgentAssistant 收到 `cancel_delegation`。
- 桥接映射归档为 `stopped`。
- 当前实现不会自动调用 TaskBoard AbandonTask，因此任务可能仍为 `in_progress`，这是设计行为而不是测试失败。
- 停止后应人工决定是继续任务、调用 AbandonTask 释放任务，还是保留任务等待后续 WakeAgent。

## 11. 阶段六：调度器真实链路

确认前面单体测试通过后，设置：

```env
AUTONOMOUS_SCHEDULER_ENABLED=false
```

通过 `PostTask` 创建一个 `open` 任务，配置一个能匹配的技能，例如 `programming`。

调用：

```text
command: CheckTaskBoard
```

预期顺序：

1. 调度器调用 `TaskBoard.ListTasks`。
2. 按技能匹配真实 Agent。
3. 调用 `TaskBoard.AcceptTask`，得到 assignment_id。
4. 调用 `TaskFlowlockBridgePlugin.StartTaskFlowlock`。
5. 返回成功后任务为 `in_progress`，桥接记录包含 delegationId。
6. 如果桥接启动失败，调度器用相同 assignment_id 调用 `AbandonTask`。
7. 失败补偿不能释放已被其他调度轮次重新分配的任务。

调用：

```text
command: GetSchedulerStatus
```

预期：

- `scheduler.enabled` 与配置一致。
- `last_check_result.tasksFound` 和 `tasksAssigned` 正确。
- `task_flowlock_bridge` 不为 null，并包含活动映射。

然后调用 `SetSchedulerEnabled=true`，观察 30 秒后的首次检查。只在手动检查正确后进行此步骤。

## 12. 阶段七：重启恢复测试

这是本系统最重要的真实环境测试之一。

### 12.1 正常重启

1. 创建一个真实进行中的桥接任务。
2. 确认 `task-delegations.json` 已写入 delegationId。
3. 正常停止 VCP。
4. 确认桥接数据文件仍存在。
5. 重新启动 VCP。
6. 等待 `TASK_FLOWLOCK_RECOVERY_DELAY_SECONDS`。
7. 调用 `ListTaskFlowlocks` 和 `ReconcileTaskFlowlocks`。

预期：

- 如果 AA 委托仍在运行，桥接能查询到并继续保留映射。
- 如果 AA 委托因进程重启消失，桥接将其标记为 orphaned，并在重派上限内创建新的 delegationId。
- `assignment_id` 保持不变。
- 不会重新调用 TaskBoard.AcceptTask，不会生成第二个任务分配令牌。
- `dispatchCount` 增加，`redispatchCount` 按恢复重派增加。

### 12.2 重启后任务已提交

在关闭 VCP 前或停止期间，让 TaskBoard 任务成为 `submitted`，再重启。

预期：

- 桥接优先以 TaskBoard 为真源。
- 任务为 `submitted` 或 `completed` 时，映射归档为 completed。
- 不应因为原 delegationId 查询不到就重派一个已经提交的任务。

### 12.3 旧分配令牌冲突

记录旧任务的 assignment_id，然后释放任务并让它被新的负责人重新接取。再让旧桥接记录参与对账。

预期：

- 桥接检测到负责人或 assignment_id 变化。
- 旧映射被停止或拒绝。
- 旧调度器不能释放新负责人持有的任务。
- 任务的新 assignment_id 不被旧委托覆盖。

### 12.4 重派上限

在测试配置中设置 `TASK_FLOWLOCK_MAX_REDISPATCHES=1`，模拟 AA 委托消失并重启两次。

预期：

- 第一次失联允许一次重派。
- 超过上限后映射保持 `orphaned`。
- 不再创建新的 delegationId。
- 审计日志记录达到上限的原因。
- 任务不会被静默标记为 completed。

## 13. Society 脉搏测试

只有任务链路和重启恢复都通过后才测试 Society。

### 13.1 禁用外部数据源的手动脉搏

先保持天气、新闻和论坛开关关闭，启用 Society：

```env
SOCIETY_ENABLED=true
RANDOM_WAKE_PROBABILITY=0
WEATHER_API_ENABLED=false
NEWS_API_ENABLED=false
FORUM_CHECK_ENABLED=false
```

调用：

```text
command: GetWorldState
```

预期：

- 返回当前时间、时段、星期。
- 天气、新闻和论坛为空或显示不可用。
- 不应因为外部插件不存在而导致整个命令崩溃。

调用：

```text
command: TriggerPulse
```

预期：

- 返回脉搏触发成功。
- `GetSocietyStatus` 的 `last_pulse_time` 更新。
- `wokenAgents` 为空，除非配置或随机概率导致唤醒。
- 不应创建 TaskFlowlockBridge 映射，因为 Society 普通脉搏是单轮 AgentAssistant 通讯。

### 13.2 真实 Agent 的单轮唤醒

使用配置中实际存在的 Agent 调用：

```text
command: WakeAgentWithContext
agent_name: 测试Agent名称
context: 这是一次 Society 单轮唤醒测试，只需回复确认，不要创建长期委托。
```

预期：

- AgentAssistant 被调用时没有 `task_delegation=true`。
- 只产生一次普通通讯。
- 不会出现 `aa-delegation-`。
- TaskFlowlockBridge 活动映射数量不增加。

### 13.3 未知 Agent 缺陷确认

使用一个不存在的 Agent 名称调用 `WakeAgentWithContext`。

当前代码预期可能出现：

```text
Assignment to constant variable
```

该结果应记录为已知代码缺陷。修复后重新测试，目标结果应变为：

- 返回明确的 Agent 不存在错误，或使用安全的默认 profile。
- VCP 进程不崩溃。

## 14. 故障注入测试

故障注入必须使用测试数据目录和短委托，不要对生产任务执行。

### 14.1 AgentAssistant 不可用

暂时让 AgentAssistant 模型接口不可达，然后调用调度器 `CheckTaskBoard`。

预期：

- TaskBoard 先接取任务。
- 桥接返回 AA 启动失败。
- 调度器使用原 assignment_id 调用 AbandonTask。
- 任务回到 `open`。
- 任务历史出现 assignment rollback。
- 不应留下没有 delegationId 的永久桥接活动映射。

### 14.2 TaskBoard 不可用

让 TaskBoard direct 插件无法加载或暂时禁用，再调用桥接或调度器。

预期：

- 调度器检查失败并记录错误。
- 不应创建 AA 委托。
- 桥接不能凭空创建任务映射。
- 恢复 TaskBoard 后，重试应能继续。

### 14.3 桥接持久化文件损坏

停止 VCP 后备份并写入非法 JSON 到 `task-delegations.json`，再启动桥接。

预期：

- 原文件被重命名为 `.corrupt-时间戳`。
- 插件重新创建可用状态文件。
- VCP 不应因为桥接状态文件损坏而整体退出。
- 该场景会丢失无法解析的活动映射，必须通过 TaskBoard 和 AA 查询人工核对。

### 14.4 TaskBoard assignment_id 被改变

在有活动映射时，使用测试数据修改任务的负责人或 assignment_id，然后执行对账。

预期：

- 旧映射进入 stopped 或 rejected 终态。
- 不调用新的 AgentAssistant 委托。
- 不释放新的任务所有权。

## 15. 日志和文件验收清单

每个真实测试至少保存：

- VCP 启动日志。
- PluginManager 插件发现日志。
- AgentAssistant 委托提交、轮次和终态日志。
- TaskBoard `tasks.json` 测试前后快照。
- 任务日记文件。
- 桥接 `task-delegations.json`。
- 桥接 `audit.jsonl`。
- AA 查询结果。
- AA 归档报告路径和内容。
- 测试输入、时间和预期/实际结果。

重点字段：

```text
taskId
assignmentId
delegationId
status
aaStatus
dispatchCount
redispatchCount
lastReconciledAt
lastError
completionReason
```

## 16. 通过标准

### 最低通过标准

- 五个插件均能被 PluginManager 发现并初始化。
- VCP 启停无残留定时器导致的进程无法退出。
- TaskBoard 能完成发布、接取、日记、提交和释放。
- AgentAssistant 能返回 delegationId，并能查询活动委托。
- Flowlock Start、Complete、Fail、Stop 的真实结果可观察。
- 桥接能建立并持久化 taskId、assignment_id、delegationId 映射。
- 重复启动不会产生重复委托。
- 任务提交后桥接能归档，不会继续重派。
- AA 失联后桥接能限次重派或进入 orphaned。
- 旧 assignment_id 不能影响新任务所有权。
- Society 单轮脉搏不会自动创建长期 AA delegation。

### 暂不作为失败的结果

- 同一 Agent 的第二任务处于 queued 或 waiting。
- Agent 没有遵守提示输出 Flowlock Start，导致 AA 停止。
- 外部天气、新闻、论坛插件未安装时返回不可用数据，前提是主命令仍能安全返回。
- 手动 Stop 后 TaskBoard 仍为 `in_progress`，因为当前实现只取消 AA 委托，不自动 AbandonTask。

### 必须修复或阻断发布的结果

- PluginManager 找不到 [`Plugin.js`](../AUTONOMOUS_AGENT_DESIGN.md:1)。
- 插件目录不满足 `VCP根目录/Plugin/插件目录` 结构。
- 任务分配失败后任务永久卡在 `in_progress`。
- 旧 assignment_id 能释放新负责人任务。
- AA 委托成功但桥接没有持久化 delegationId。
- TaskBoard 已提交或完成的任务被桥接重新派发。
- Fail 或 Stop 被误判为 completed。
- VCP 重启后产生无限重派。
- Society 普通脉搏意外创建长期 Flowlock 委托。
- 未知 Agent 输入导致 VCP 主进程崩溃。

## 17. 测试记录模板

每个用例按以下格式记录：

```text
用例编号：
执行时间：
VCP 版本或提交：
Node.js 版本：
测试 Agent：
测试任务 ID：
assignment_id：
delegationId：
配置摘要：
操作步骤：
预期结果：
实际结果：
相关日志：
相关文件：
结论：通过 / 失败 / 已知缺陷 / 环境阻断
```

## 18. 推荐执行顺序

不要跳过顺序：

1. 备份并创建隔离数据目录。
2. 验证目录结构、依赖、manifest 和语法。
3. 只启动并确认五个插件生命周期。
4. 单独验证 TaskBoard。
5. 单独验证 AgentAssistant 异步委托和 Flowlock。
6. 验证 TaskFlowlockBridge 真实跨插件映射。
7. 验证成功、失败、停止和重复启动。
8. 验证 AutonomousSchedulerPlugin 手动检查。
9. 验证正常重启、AA 失联重派和 assignment_id 冲突。
10. 最后启用 Society 单轮脉搏。
11. 最后再启用自动调度定时器。
12. 故障注入并整理日志。

只有第 1 至 9 步通过后，才建议使用较长的 `DELEGATION_TIMEOUT`、更大的最大轮数和正式任务数据。
