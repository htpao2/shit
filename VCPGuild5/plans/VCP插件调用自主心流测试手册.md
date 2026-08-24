# 通过 VCP 插件调用测试自主 Agent 与 Flowlock

## 0. 2026-08-24 真实环境故障修复与复测

真实测试曾在 `TaskFlowlockBridgePlugin.StartTaskFlowlock` 返回：

```text
{"plugin_error":"task_not_found","code":"TASK_INVALID"}
```

当时任务实际上存在且为 `in_progress`。根因不是任务丢失，而是旧版 `TaskBoard` 使用 `synchronous/stdio`：真实 VCP 的跨插件调用结果只保留了 `original_plugin_output` 展示文本，丢失 `task`、`tasks` 和 `assignment_id` 等结构化字段。桥接内部因此把任务判为不存在；调度器和 Society 的 TaskBoard 查询也会受同一问题影响。

当前修复将 `TaskBoard` 改为 `hybridservice/direct`：

- PluginManager 内部调用直接获得结构化对象。
- `GetTask` 返回结构化 `task`。
- `ListTasks` 返回结构化 `tasks` 和 `count`。
- `AcceptTask` 返回结构化 `task` 和真实 `assignment_id`。
- 仍保留独立 CLI 兼容入口，但真实插件链路不再依赖 stdio 展示文本。

### 0.1 升级文件

把修复后的以下文件覆盖到真实 VCP：

```text
VCP根目录/Plugin/TaskBoardPlugin/TaskBoardPlugin.js
VCP根目录/Plugin/TaskBoardPlugin/plugin-manifest.json
VCP根目录/Plugin/VCPSocietyScheduler/VCPSocietyScheduler.js
```

不要删除或覆盖：

```text
VCP根目录/Plugin/TaskBoardPlugin/data/
```

完全重启 VCP，不能只刷新聊天页面。启动后确认 TaskBoard manifest 显示：

```text
pluginType = hybridservice
communication.protocol = direct
entryPoint.script = TaskBoardPlugin.js
```

### 0.2 对当前失败任务的最短复测

当前失败任务：

```text
task-1787485486654-a018a328
负责人：小娜
状态：in_progress
```

首次复测建议省略 `assignment_id`，让桥接直接从 TaskBoard 的结构化 `task.assignment_id` 读取真实令牌：

```text
<<<[TOOL_REQUEST]>>>
maid:「始」测试主控「末」,
tool_name:「始」TaskFlowlockBridgePlugin「末」,
command:「始」StartTaskFlowlock「末」,
task_id:「始」task-1787485486654-a018a328「末」,
agent_name:「始」小娜「末」,
prompt:「始」这是一次修复后的真实 VCP 插件桥接复测。请先用 TaskBoard.AppendTaskLog 记录开始，然后输出 [[Flowlock::Start]]。下一轮记录简短日记；完成后调用 TaskBoard.SubmitTask，填写 deliverable 和 summary，最后输出 [[Flowlock::Complete]]。不要访问外部网站，不要执行危险命令。「末」
<<<[END_TOOL_REQUEST]>>>
```

预期不再返回 `task_not_found`，而是：

```text
status: success
mapping.taskId: task-1787485486654-a018a328
mapping.agentName: 小娜
mapping.assignmentId: 一个真实 UUID，而不是 task ID
mapping.delegationId: aa-delegation-...
mapping.status: queued 或 running
```

如果仍返回 `task_not_found`，优先确认 VCP 实际加载的是新版 direct manifest，而不是旧 stdio 插件缓存。如果返回 `assignee_changed`，说明任务负责人已经变化。如果返回 `assignment_changed`，说明桥接已有旧映射或任务已经重新分配。

注意：VCP 对话日志仍可能把 direct 插件的外部显示结果包装成 `original_plugin_output`。这不等于内部结构化字段再次丢失；判断修复是否生效，应以桥接能否成功读取任务并返回映射为准。

## 1. 适用范围

本手册只描述一种测试方式：插件已经被完整 VCP 环境正确发现和加载，测试者通过 VCP 对话让主 Agent 调用插件完成验证。

不使用以下方式作为主测试入口：

- 直接 `require()` 插件 JavaScript。
- 直接运行 stdio 插件脚本。
- 直接修改任务数据文件模拟正常操作。
- 直接调用 AgentAssistant 内部函数。
- 直接用 Node.js 伪造 PluginManager 返回值。

默认插件名称以当前 manifest 为准：

- `TaskBoard`
- `AgentAssistant`
- `TaskFlowlockBridgePlugin`
- `AutonomousSchedulerPlugin`
- `VCPSocietyScheduler`

所有测试请求都应从 VCP 聊天入口发送给主 Agent，由主 Agent 解析并调用对应插件。

## 2. 测试规则

### 2.1 测试前配置

首次测试应使用：

```env
AUTONOMOUS_SCHEDULER_ENABLED=false
SOCIETY_ENABLED=false
TASK_FLOWLOCK_RECONCILE_INTERVAL_SECONDS=10
TASK_FLOWLOCK_RECOVERY_DELAY_SECONDS=5
TASK_FLOWLOCK_MAX_REDISPATCHES=1
```

这样可以先手动测试，不会因为后台定时器自动创建委托。

### 2.2 测试身份

准备以下名称：

```text
测试发起者：测试主控
测试 Agent：必须是 AgentAssistant 配置中真实存在的名称，例如 小克 或 小娜
```

下文使用：

```text
AGENT_NAME = 真实存在的测试 Agent 名称
TASK_ID = 测试任务 ID
ASSIGNMENT_ID = 任务接取后返回的 assignment_id
DELEGATION_ID = 桥接或 AgentAssistant 返回的 aa-delegation-... ID
```

不要直接照抄 `AGENT_NAME`、`TASK_ID` 等占位符；发送前替换成真实值。

### 2.3 每一步都记录

至少记录：

- VCP 工具请求原文。
- 插件返回的 `status`、`code`、`error`。
- `TASK_ID`。
- `ASSIGNMENT_ID`。
- `DELEGATION_ID`。
- 任务状态变化。
- 桥接状态变化。
- AgentAssistant 查询结果。

如果主 Agent 没有实际调用工具，而只是用文字回答“已完成”，该步骤不算通过。

## 3. 工具调用格式

VCP 工具请求使用项目现有格式：

```text
<<<[TOOL_REQUEST]>>>
maid:「始」测试主控「末」,
tool_name:「始」TaskBoard「末」,
command:「始」GetTask「末」,
task_id:「始」TASK_ID「末」
<<<[END_TOOL_REQUEST]>>>
```

多个参数继续使用逗号分隔。字符串值必须放在 `「始」` 和 `「末」` 之间。

如果你的 VCP 前端要求主 Agent 代为调用工具，不要把工具请求发送给测试 Agent；测试 Agent 是被测对象，主 Agent 是测试控制器。

## 4. 阶段一：确认插件可通过 VCP 调用

### 4.1 TaskBoard 状态查询

发送给主 Agent：

```text
请调用 TaskBoard 的 ListTasks 命令，只查询状态为 all 的任务，limit 设为 10。不要修改任何任务。
```

等价工具请求：

```text
<<<[TOOL_REQUEST]>>>
maid:「始」测试主控「末」,
tool_name:「始」TaskBoard「末」,
command:「始」ListTasks「末」,
status:「始」all「末」,
limit:「始」10「末」
<<<[END_TOOL_REQUEST]>>>
```

预期：

- 主 Agent 确实调用 `TaskBoard`。
- 返回 `status: success`。
- 返回 `tasks` 数组和 `count`。
- 不修改任务数据。

### 4.2 桥接服务状态

发送：

```text
请调用 TaskFlowlockBridgePlugin 的 GetTaskFlowlockBridgeStatus，不要启动任何任务。
```

等价请求：

```text
<<<[TOOL_REQUEST]>>>
maid:「始」测试主控「末」,
tool_name:「始」TaskFlowlockBridgePlugin「末」,
command:「始」GetTaskFlowlockBridgeStatus「末」
<<<[END_TOOL_REQUEST]>>>
```

预期返回中应包含：

```json
{
  "status": "success",
  "bridge": {
    "enabled": true,
    "activeCount": 0,
    "officialAAFlowlock": true,
    "sameAgentConcurrency": "serialized_by_agent_assistant"
  }
}
```

`activeCount` 如果不是 0，先调用 `ListTaskFlowlocks` 检查是否有上一次遗留测试，不要直接覆盖。

### 4.3 调度器状态

发送：

```text
请调用 AutonomousSchedulerPlugin 的 GetSchedulerStatus，不要执行 CheckTaskBoard。
```

预期：

- `status: success`。
- `scheduler.enabled` 与测试配置一致，首次应为 `false`。
- `scheduler.running` 应为 `false`。
- `task_flowlock_bridge` 不应为 null。

### 4.4 Society 状态

发送：

```text
请调用 VCPSocietyScheduler 的 GetSocietyStatus，不要触发脉搏，不要唤醒 Agent。
```

预期：

- `status: success`。
- `society.enabled` 首次应为 `false`。
- `society.running` 应为 `false`。
- 不产生 AgentAssistant 委托。

## 5. 阶段二：通过 TaskBoard 创建测试任务

### 5.1 发布任务

发送：

```text
请通过 TaskBoard 发布一个低风险、无外部副作用的测试任务：
标题：VCP插件心流冒烟测试
描述：验证 TaskBoard、任务日记、AgentAssistant 官方 Flowlock 和 TaskFlowlockBridgePlugin 的闭环。不要访问外部网站，不要修改测试任务之外的文件，不要执行危险命令。
所需技能：programming
优先级：low
发布者身份使用 测试主控。
```

等价请求：

```text
<<<[TOOL_REQUEST]>>>
maid:「始」测试主控「末」,
tool_name:「始」TaskBoard「末」,
command:「始」PostTask「末」,
title:「始」VCP插件心流冒烟测试「末」,
description:「始」验证 TaskBoard、任务日记、AgentAssistant 官方 Flowlock 和 TaskFlowlockBridgePlugin 的闭环。不要访问外部网站，不要修改测试任务之外的文件，不要执行危险命令。「末」,
required_skills:「始」["programming"]「末」,
priority:「始」low「末」
<<<[END_TOOL_REQUEST]>>>
```

预期：

- 返回 `status: success`。
- 返回任务 ID。
- 任务初始状态为 `open`。
- 记录返回的 `TASK_ID`。

如果主 Agent 没有返回结构化任务 ID，可再调用 `ListTasks` 或 `GetTask`，不要凭标题猜 ID。

### 5.2 查询并确认任务

发送：

```text
请调用 TaskBoard.GetTask 查询刚创建的 TASK_ID，只读，不要接取。
```

预期字段：

```text
status = open
assignee = null
assignment_id = null 或不存在
progress = 0
```

## 6. 阶段三：通过 TaskBoard 接取并写入日记

### 6.1 接取任务

让主 Agent 调用：

```text
<<<[TOOL_REQUEST]>>>
maid:「始」AGENT_NAME「末」,
tool_name:「始」TaskBoard「末」,
command:「始」AcceptTask「末」,
task_id:「始」TASK_ID「末」,
expected_status:「始」open「末」
<<<[END_TOOL_REQUEST]>>>
```

预期：

- `status: success`。
- `task.status = in_progress`。
- `task.assignee = AGENT_NAME`。
- 返回新的 `assignment_id`。
- 记录 `ASSIGNMENT_ID`。

注意：`AcceptTask` 的 `maid` 必须是被分配的 Agent 名称。不能使用不存在的 Agent 名称。

### 6.2 写入任务日记

让主 Agent 以测试 Agent 身份调用：

```text
<<<[TOOL_REQUEST]>>>
maid:「始」AGENT_NAME「末」,
tool_name:「始」TaskBoard「末」,
command:「始」AppendTaskLog「末」,
task_id:「始」TASK_ID「末」,
content:「始」真实 VCP 插件调用测试已开始。当前测试阶段：TaskBoard 接取和日记。「末」
<<<[END_TOOL_REQUEST]>>>
```

再调用：

```text
<<<[TOOL_REQUEST]>>>
maid:「始」测试主控「末」,
tool_name:「始」TaskBoard「末」,
command:「始」ReadTaskLog「末」,
task_id:「始」TASK_ID「末」,
lines:「始」20「末」
<<<[END_TOOL_REQUEST]>>>
```

预期：

- 写入和读取均为 `status: success`。
- 读取结果包含“真实 VCP 插件调用测试已开始”。
- 日记内容按任务 ID 隔离。

用错误的 `maid` 再写一次，预期失败，因为只有负责人或团队成员可写入任务日记。

## 7. 阶段四：直接通过 AgentAssistant 测试官方 Flowlock

这一阶段不使用桥接，先确认 AA 本身工作正常。

### 7.1 创建短委托

发送给主 Agent：

```text
请调用 AgentAssistant 启动一个异步委托给 AGENT_NAME。任务只做 Flowlock 协议测试，不调用任何外部工具：第一轮必须输出 [[Flowlock::Start]] 并说明已进入心流；下一轮输出 [[Flowlock::Complete]] 和一句完成报告。设置 task_delegation=true。
```

等价请求：

```text
<<<[TOOL_REQUEST]>>>
maid:「始」测试主控「末」,
tool_name:「始」AgentAssistant「末」,
agent_name:「始」AGENT_NAME「末」,
prompt:「始」请只做 Flowlock 协议测试。第一轮必须输出 [[Flowlock::Start]] 并说明已进入心流；下一轮输出 [[Flowlock::Complete]] 和一句完成报告。不要调用任何外部工具。「末」,
task_delegation:「始」true「末」
<<<[END_TOOL_REQUEST]>>>
```

预期：

- 立即返回包含 `aa-delegation-` 的 `DELEGATION_ID`。
- 不应等待所有轮次结束后才返回。
- 主 Agent 必须把完整 ID 记录下来。

### 7.2 查询委托

发送：

```text
请调用 AgentAssistant 查询 DELEGATION_ID 的委托状态，只查询，不要取消。
```

等价请求：

```text
<<<[TOOL_REQUEST]>>>
maid:「始」测试主控「末」,
tool_name:「始」AgentAssistant「末」,
query_delegation:「始」DELEGATION_ID「末」
<<<[END_TOOL_REQUEST]>>>
```

运行中预期包含：

```text
仍在进行中
当前状态: running 或 waiting
```

结束后预期包含完成信息或归档信息。不要只根据主 Agent 的自然语言总结判断完成，必须看到 AgentAssistant 工具返回。

### 7.3 测试未输出 Start

再次启动一个短委托，提示：

```text
只输出普通文本，不要输出任何 Flowlock::Start、Complete、Fail 或 Stop 标记。
```

预期：

- 新协议模式不会隐式进入心流。
- 查询最终应体现未启动、停止或等价终态。
- 记录真实返回文本，确认是 Agent 未遵守提示还是协议解析异常。

## 8. 阶段五：通过桥接启动真实任务心流

此阶段使用前面已经处于 `in_progress` 的任务。

### 8.1 启动桥接

让主 Agent 调用：

```text
<<<[TOOL_REQUEST]>>>
maid:「始」测试主控「末」,
tool_name:「始」TaskFlowlockBridgePlugin「末」,
command:「始」StartTaskFlowlock「末」,
task_id:「始」TASK_ID「末」,
agent_name:「始」AGENT_NAME「末」,
assignment_id:「始」ASSIGNMENT_ID「末」,
prompt:「始」这是一次真实 VCP 插件桥接测试。请先用 TaskBoard.AppendTaskLog 记录开始，然后输出 [[Flowlock::Start]]。下一轮继续记录一条简短日记；完成后调用 TaskBoard.SubmitTask，填写 deliverable 和 summary，最后输出 [[Flowlock::Complete]]。不要访问外部网站，不要执行危险命令。「末」
<<<[END_TOOL_REQUEST]>>>
```

预期返回：

```json
{
  "status": "success",
  "mapping": {
    "taskId": "TASK_ID",
    "assignmentId": "ASSIGNMENT_ID",
    "agentName": "AGENT_NAME",
    "delegationId": "DELEGATION_ID",
    "status": "queued"
  }
}
```

`status` 也可能很快变成 `running`，两者都属于正常启动结果。

必须确认：

- `DELEGATION_ID` 是由真实 AgentAssistant 返回的。
- 没有重复的第二个委托。
- `assignmentId` 与 TaskBoard 当前值一致。
- 桥接调用的不是旧的 BackendFlowlockPlugin。

### 8.2 查询桥接映射

发送：

```text
请调用 TaskFlowlockBridgePlugin.GetTaskFlowlock 查询 TASK_ID 和 AGENT_NAME，只读。
```

等价请求：

```text
<<<[TOOL_REQUEST]>>>
maid:「始」测试主控「末」,
tool_name:「始」TaskFlowlockBridgePlugin「末」,
command:「始」GetTaskFlowlock「末」,
task_id:「始」TASK_ID「末」,
agent_name:「始」AGENT_NAME「末」
<<<[END_TOOL_REQUEST]>>>
```

预期：

- `mapping.delegationId` 与 `DELEGATION_ID` 相同。
- `mapping.assignmentId` 与 `ASSIGNMENT_ID` 相同。
- `mapping.status` 为 `queued`、`running`、`waiting` 或 `orphaned`。
- 如果刚启动就出现 `orphaned`，立即查询 AgentAssistant 委托和 VCP 日志。

### 8.3 手动对账

发送：

```text
请调用 TaskFlowlockBridgePlugin.ReconcileTaskFlowlocks，allow_redispatch=false。只对账，不允许创建新的委托。
```

等价请求：

```text
<<<[TOOL_REQUEST]>>>
maid:「始」测试主控「末」,
tool_name:「始」TaskFlowlockBridgePlugin「末」,
command:「始」ReconcileTaskFlowlocks「末」,
allow_redispatch:「始」false「末」
<<<[END_TOOL_REQUEST]>>>
```

预期：

- 返回 `status: success`。
- 活动委托正常时，结果为 `queued`、`running`、`waiting` 或等价活动状态。
- `allow_redispatch=false` 时不能凭空产生新 `delegationId`。

## 9. 阶段六：验证成功、失败和停止闭环

### 9.1 成功闭环

被测 Agent 必须完成以下顺序：

1. 调用 `TaskBoard.AppendTaskLog`。
2. 调用 `TaskBoard.SubmitTask`。
3. 输出 `[[Flowlock::Complete]]`。

主控调用：

```text
请循环查询 TASK_ID 的 TaskBoard 状态和 TaskFlowlockBridge 映射，直到任务提交或出现明确失败。每次只调用一个查询工具，不要修改任务。
```

预期：

- TaskBoard 状态变为 `submitted`。
- 桥接对账后活动映射消失。
- `ListTaskFlowlocks` 的 `recent` 中出现 `status: completed`。
- 不会因为 AA delegation 查询不到而重新接取任务。

如果 Agent 输出 Complete 但没有调用 SubmitTask，预期桥接会将映射标记为 `orphaned` 并按重派上限处理。这是异常闭环，应记录为测试失败或 Agent 提示词不合格。

### 9.2 失败闭环

创建第二个任务并完成接取，然后让主 Agent 调用：

```text
请通过 AgentAssistant 的异步委托执行失败路径测试：先调用 TaskBoard.FailTask 写入明确原因，再输出 [[Flowlock::Fail]]。不要调用 SubmitTask。
```

预期：

- TaskBoard 任务回到 `open`。
- `assignee` 和 `assignment_id` 被清空。
- 任务历史出现 failed 记录。
- 桥接映射最终出现在 `recent`，状态为 failed。
- 不会误记录为 completed。

### 9.3 Stop 闭环

创建并启动第三个短任务，在委托还运行时让主控调用：

```text
<<<[TOOL_REQUEST]>>>
maid:「始」测试主控「末」,
tool_name:「始」TaskFlowlockBridgePlugin「末」,
command:「始」StopTaskFlowlock「末」,
task_id:「始」TASK_ID「末」,
agent_name:「始」AGENT_NAME「末」,
reason:「始」插件调用停止路径测试「末」
<<<[END_TOOL_REQUEST]>>>
```

预期：

- AgentAssistant 收到取消请求。
- 桥接映射归档为 stopped。
- 当前实现不会自动调用 TaskBoard.AbandonTask。
- 因此任务可能仍为 `in_progress`，需要主控随后明确决定是否释放：

```text
请以 AGENT_NAME 身份调用 TaskBoard.AbandonTask 释放 TASK_ID，原因是停止测试清理。
```

## 10. 阶段七：幂等和 assignment_id 冲突

### 10.1 重复启动

再次发送与首次完全相同的 `StartTaskFlowlock` 请求。

预期：

```json
{
  "status": "success",
  "idempotent": true
}
```

并且：

- `delegationId` 不变。
- AgentAssistant 不会新增委托。
- TaskBoard 不会生成新的 `assignment_id`。

### 10.2 错误 assignment_id

用故意错误的令牌调用：

```text
请调用 TaskFlowlockBridgePlugin.StartTaskFlowlock，参数使用真实 TASK_ID、真实 AGENT_NAME，但 assignment_id 使用 stale-assignment-test。不要重试其他参数。
```

预期：

- 返回 `status: error`。
- `code: ASSIGNMENT_CONFLICT`。
- 原映射和任务状态保持不变。
- 不创建新的 delegationId。

## 11. 阶段八：调度器插件调用测试

先创建一个 `open` 任务，所需技能设置为测试 Agent 能匹配的技能。

### 11.1 手动检查任务板

发送：

```text
请调用 AutonomousSchedulerPlugin.CheckTaskBoard，执行一次任务板检查。检查前先说明将使用的测试 Agent，但不要自行修改任务描述。
```

预期调用链：

```text
AutonomousSchedulerPlugin.CheckTaskBoard
  -> TaskBoard.ListTasks
  -> TaskBoard.AcceptTask
  -> TaskFlowlockBridgePlugin.StartTaskFlowlock
  -> AgentAssistant task_delegation=true
```

预期：

- 返回 `status: success`。
- `tasksFound >= 1`。
- 至少一个任务 `tasksAssigned = 1`，前提是技能匹配和 Agent 配置正确。
- 任务变成 `in_progress`。
- 任务有 `assignment_id`。
- 桥接有 `delegationId`。

### 11.2 调度器状态

发送：

```text
请调用 AutonomousSchedulerPlugin.GetSchedulerStatus，并完整返回 scheduler 和 task_flowlock_bridge 字段。
```

预期：

- `last_check_result.status` 为 `active` 或 `idle`。
- `tasksAssigned` 与检查结果一致。
- `task_flowlock_bridge.activeCount` 与当前活动桥接数量一致。

### 11.3 WakeAgent 幂等唤醒

对已有 `in_progress` 任务调用：

```text
请调用 AutonomousSchedulerPlugin.WakeAgent，agent_name 使用 AGENT_NAME。该操作只允许幂等查询或启动现有任务，不要接取新任务。
```

预期：

- 返回当前任务 ID。
- 如果已有桥接映射，返回 `idempotent: true` 或等价结果。
- 不产生新的 assignment_id。
- 不产生第二个 delegationId。

### 11.4 GetAgentTask

发送：

```text
请调用 AutonomousSchedulerPlugin.GetAgentTask 查询 AGENT_NAME，并返回 task、diary、flowlock_mapping。
```

预期返回包含：

- 当前任务对象。
- 任务日记内容。
- `flowlock_mapping.delegationId`。
- 桥接状态、AA 状态和重派次数。

## 12. 阶段九：Society 插件调用测试

Society 普通脉搏是单轮通讯，不应自动创建长期 AA delegation。

### 12.1 查询世界状态

发送：

```text
请调用 VCPSocietyScheduler.GetWorldState。测试配置已关闭天气、新闻和论坛外部数据源，不要唤醒 Agent。
```

预期：

- 返回当前时间、时段和星期。
- 外部数据源关闭时，命令仍安全返回。
- 不出现 `aa-delegation-`。

### 12.2 触发一次脉搏

发送：

```text
请调用 VCPSocietyScheduler.TriggerPulse。只执行一次社区脉搏，并返回 wokenAgents；不要创建 TaskBoard 任务。
```

测试配置 `RANDOM_WAKE_PROBABILITY=0` 时预期：

- 返回 `status: success`。
- `lastPulseTime` 更新。
- `wokenAgents` 通常为空。
- TaskFlowlockBridge 活动数量不增加。

### 12.3 真实 Agent 单轮唤醒

发送：

```text
请调用 VCPSocietyScheduler.WakeAgentWithContext，agent_name 使用 AGENT_NAME，context 为“只回复一条确认消息，不创建异步委托，不调用 TaskBoard”。
```

预期：

- 只调用普通 `AgentAssistant` 通讯。
- 不传 `task_delegation=true`。
- 不产生新的 `DELEGATION_ID`。
- 桥接活动映射数量不增加。

### 12.4 未知 Agent 测试

发送：

```text
请调用 VCPSocietyScheduler.WakeAgentWithContext，agent_name 使用 NotExistingTestAgent，context 为“只返回错误”。
```

当前代码已知风险：可能返回或抛出 `Assignment to constant variable`。记录该结果，不要把它判定为插件加载失败。修复代码后，目标结果应是结构化的 Agent 不存在错误或安全的默认 profile 行为。

## 13. 阶段十：通过插件调用验证重启恢复

这部分需要人工重启 VCP，但重启前后的查询仍然全部使用 VCP 插件调用。

### 13.1 重启前

1. 通过 TaskBoard 创建并接取任务。
2. 通过 TaskFlowlockBridgePlugin 启动委托。
3. 通过 `GetTaskFlowlock` 记录 `DELEGATION_ID`、`ASSIGNMENT_ID` 和状态。
4. 让 Agent 保持短暂运行，不要完成任务。
5. 正常停止 VCP。

### 13.2 重启后

VCP 完全启动后，等待桥接恢复延迟，再发送：

```text
请调用 TaskFlowlockBridgePlugin.ListTaskFlowlocks，返回所有活动映射和 recent，不要启动新的任务。
```

然后发送：

```text
请调用 TaskFlowlockBridgePlugin.ReconcileTaskFlowlocks，allow_redispatch=false，只报告当前任务和委托是否匹配。
```

预期：

- 若 AA 委托还存在，原 `DELEGATION_ID` 仍可查询。
- 若 AA 委托因重启丢失，映射可能变为 `orphaned`。
- `allow_redispatch=false` 时不会新建委托。

再发送：

```text
请调用 TaskFlowlockBridgePlugin.ReconcileTaskFlowlocks，allow_redispatch=true，允许在重派上限内恢复失联任务。
```

预期：

- 失联任务可能得到新的 `DELEGATION_ID`。
- `ASSIGNMENT_ID` 不应变化。
- 不调用 TaskBoard.AcceptTask。
- `redispatchCount` 增加。
- 超过重派上限后保持 `orphaned`，不再创建委托。

## 14. 清理测试数据

每个测试任务完成后，优先通过插件调用清理，不直接编辑 JSON。

### 14.1 清理运行中的桥接

```text
请调用 TaskFlowlockBridgePlugin.StopTaskFlowlock 停止 TASK_ID 的心流。
```

### 14.2 清理任务所有权

如果任务仍为 `in_progress`：

```text
请以 AGENT_NAME 身份调用 TaskBoard.AbandonTask，task_id 为 TASK_ID，reason 为“VCP插件调用测试清理”。
```

如果任务已经回到 `open`，无需再次放弃。

### 14.3 清理验收任务

如果任务为 `submitted`，可以通过任务发布者或管理员调用：

```text
请调用 TaskBoard.CompleteTask 验收 TASK_ID，review_comment 为“VCP插件调用测试清理”。
```

不要把生产任务作为清理对象。测试任务应有明显的标题前缀，例如 `VCP插件调用测试-`。

## 15. 通过标准

### 必须通过

- VCP 对话确实能调用五个插件。
- TaskBoard 能通过插件调用完成发布、接取、日记和清理。
- AgentAssistant 能通过插件调用返回真实 `DELEGATION_ID`。
- TaskFlowlockBridge 能通过插件调用建立和查询映射。
- 重复启动返回幂等结果，不产生重复委托。
- 错误 `assignment_id` 返回 `ASSIGNMENT_CONFLICT`。
- 任务提交后映射最终归档，不无限重派。
- Society 普通唤醒不创建长期 AA delegation。
- 调度器手动检查能走通 TaskBoard -> Bridge -> AA 链路。

### 需要单独记录但不一定失败

- 同一 Agent 的第二个委托处于 `queued` 或 `waiting`。
- Agent 没有遵守提示输出 `[[Flowlock::Start]]`。
- 外部天气、新闻或论坛插件未启用导致对应数据为空。
- 手动 Stop 后任务仍为 `in_progress`，因为当前 Stop 只取消 AA 委托，不自动放弃 TaskBoard 任务。

### 判定为失败

- 主 Agent 声称调用成功，但没有实际工具请求和返回值。
- TaskBoard 已提交任务仍被桥接重新派发。
- 旧 assignment_id 能释放新分配任务。
- 同一请求创建多个 delegationId。
- Fail、Stop 被当成成功完成。
- VCP 重启后无限生成委托。
- Society 单轮唤醒创建长期 AA delegation。
- 插件调用异常导致 VCP 主进程退出。

## 16. 一次性回归脚本式对话顺序

下面是推荐的最短手工回归顺序：

1. `TaskBoard.ListTasks`。
2. `TaskFlowlockBridgePlugin.GetTaskFlowlockBridgeStatus`。
3. `AutonomousSchedulerPlugin.GetSchedulerStatus`。
4. `VCPSocietyScheduler.GetSocietyStatus`。
5. `TaskBoard.PostTask`。
6. `TaskBoard.GetTask`。
7. `TaskBoard.AcceptTask`。
8. `TaskBoard.AppendTaskLog`。
9. `TaskBoard.ReadTaskLog`。
10. `TaskFlowlockBridgePlugin.StartTaskFlowlock`。
11. `TaskFlowlockBridgePlugin.GetTaskFlowlock`。
12. `AgentAssistant.query_delegation`，查询同一个 `DELEGATION_ID`。
13. 重复 `StartTaskFlowlock`，验证幂等。
14. 错误 `assignment_id` 的 `StartTaskFlowlock`，验证冲突。
15. 等待 Agent 完成后查询 `TaskBoard.GetTask`。
16. 查询 `TaskFlowlockBridgePlugin.ListTaskFlowlocks`。
17. `AutonomousSchedulerPlugin.GetAgentTask`。
18. 清理测试任务。
19. `VCPSocietyScheduler.GetWorldState`。
20. `VCPSocietyScheduler.GetSocietyStatus`。

每一步都必须以插件返回为准，不能只看主 Agent 的总结文本。
