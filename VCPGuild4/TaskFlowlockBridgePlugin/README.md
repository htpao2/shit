# TaskFlowlockBridgePlugin

`TaskFlowlockBridgePlugin` 是 TaskBoard 与 AgentAssistant 官方 Flowlock 之间的任务适配层。

它不是 Flowlock 内核，不解析控制协议，不调用模型循环，也不安排心跳。所有 `Start`、`Stop`、`Complete`、`Fail`、`NextHeartbeat` 和 `NextPrompt` 均由 `AgentAssistant/flowlockProtocol.js` 与 AgentAssistant 异步委托循环处理。

## 职责

- 校验 TaskBoard 任务仍为 `in_progress` 且负责人和 `assignment_id` 一致。
- 调用 AgentAssistant，并设置 `task_delegation=true`、`inject_tools=TaskBoard`。
- 持久化 `taskId -> delegationId` 映射。
- 定期查询 AgentAssistant 委托与 TaskBoard 状态并对账。
- 服务重启后识别失联委托，并在任务所有权仍有效时限次重派。
- 取消指定任务的 AgentAssistant 委托。
- 保留审计记录和最近终态映射。

## 唯一心流内核

```text
AgentAssistant/flowlockProtocol.js
        +
AgentAssistant.executeDelegation()
```

旧 `BackendFlowlockPlugin` 已删除，避免两套心流循环同时运行。

## 启动流程

```text
AutonomousSchedulerPlugin
  -> TaskBoard.AcceptTask（原子接取，生成 assignment_id）
  -> TaskFlowlockBridgePlugin.StartTaskFlowlock
  -> 持久化 starting 占位映射
  -> AgentAssistant(task_delegation=true, inject_tools=TaskBoard)
  -> 从回执提取 delegationId
  -> 原子持久化 queued 映射
```

若 AA 在返回 `delegationId` 前失败，桥接会删除 starting 占位映射，调度器再用 `assignment_id` 补偿释放任务。

## 对账规则

1. TaskBoard 为 `submitted/completed`：桥接完成，不再关心 AA 内存状态。
2. TaskBoard 负责人、状态或 `assignment_id` 变化：停止桥接映射。
3. AA 委托仍活动：映射为 `running` 或 `queued`。
4. AA 委托失败/停止：调用 TaskBoard.FailTask 后结束映射。
5. AA 宣告完成但 TaskBoard 仍为 `in_progress`：视为状态闭环不完整，可限次重派，要求 Agent 调用 SubmitTask。
6. 服务重启后 AA 内存委托丢失：任务所有权仍有效时限次重派；超过上限后保持 `orphaned`，等待人工处理。

## 并发语义

桥接允许同时保存多个任务映射，但不承诺同一 Agent 真并行。

官方 AgentAssistant 当前使用固定的 delegation session 锁，同一 Agent 的多个异步委托会串行等待。管理状态通过：

```text
sameAgentConcurrency = serialized_by_agent_assistant
```

明确暴露该限制。

## 持久化

默认目录：

```text
TaskFlowlockBridgePlugin/data/
├── task-delegations.json
└── audit.jsonl
```

映射记录包含：

- `taskId`
- `assignmentId`
- `agentName`
- `delegationId`
- `status`
- `aaStatus`
- `dispatchCount`
- `redispatchCount`
- `startedAt`
- `updatedAt`
- `lastReconciledAt`
- `lastError`
- `completionReason`

## 管理命令

- `StartTaskFlowlock`
- `StopTaskFlowlock`
- `GetTaskFlowlock`
- `ListTaskFlowlocks`
- `ReconcileTaskFlowlocks`
- `GetTaskFlowlockBridgeStatus`

## 配置

完整示例见 `config.env.example`：

```env
TASK_FLOWLOCK_BRIDGE_ENABLED=true
TASK_FLOWLOCK_RECONCILE_INTERVAL_SECONDS=30
TASK_FLOWLOCK_RECOVERY_DELAY_SECONDS=5
TASK_FLOWLOCK_MAX_REDISPATCHES=2
TASK_FLOWLOCK_DATA_DIR=./data
```

相同 `taskId + agentName + assignment_id` 的重复启动是幂等请求，不会重复创建 AA 委托。相同任务与 Agent 已有活动映射、但传入不同 `assignment_id` 时返回 `ASSIGNMENT_CONFLICT`，防止旧调度请求误绑定新一轮任务分配。

AgentAssistant 的循环上限和总超时仍由 AA 自己配置，例如 `DELEGATION_MAX_ROUNDS` 和 `DELEGATION_TIMEOUT`。桥接不会覆盖这些参数。
