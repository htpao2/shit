# BackendFlowlockPlugin

`BackendFlowlockPlugin` 是面向 VCP 后端任务执行的自主循环服务。它不依赖 VCPChat 前端是否打开，也不修改 `AgentAssistant` 的现有委托实现。

## 职责边界

- `TaskBoard`：任务和分配状态的真源。
- `AutonomousSchedulerPlugin`：发现开放任务、匹配 Agent、原子接取并启动会话。
- `BackendFlowlockPlugin`：管理会话、心跳、恢复、重试、终止和审计。
- `AgentAssistant`：按指定独立 `session_id` 执行每一轮 Agent 推理。
- 前端 Flowlock：管理 VCPChat 的 Agent/Topic 自主续写，不是后端会话状态源。

前端与后端 Flowlock 共享控制协议语义，但 Session、定时器和持久化互不共享。

## 并发模型

会话唯一键为：

```text
agentName + taskId
```

同一个 Agent 可以并行处理多个任务。每个任务拥有独立的：

- Backend Flowlock Session
- AgentAssistant `session_id`
- `generation`
- 定时器
- 轮次、重试和下一跳设置
- 任务日记上下文

每 Agent 默认最多 3 个活动会话，与任务板默认 `MAX_ACTIVE_TASKS=3` 对齐。全局默认最多 20 个活动会话。

## 生命周期

```text
open
  -> AutonomousScheduler 原子 AcceptTask
  -> BackendFlowlockPlugin StartTaskFlowlock
  -> waiting/running 循环
  -> submitted/completed: Complete 并停止
  -> failed/abandoned/timeout/assignee changed: Stop 或 Fail
```

调度器在接取后启动会话失败时，会携带本次 `assignment_id` 调用 `AbandonTask` 补偿。任务板只在分配令牌仍一致时释放任务，避免误释放后续分配。

## 控制协议

后端支持：

```text
[[Flowlock::Start]]
[[Flowlock::Stop]]
[[Flowlock::Complete]]
[[Flowlock::Fail]]
[[Flowlock::NextHeartbeat::30]]
[[Flowlock::NextPrompt]]下一轮目标[[/Flowlock::NextPrompt]]
```

终止优先级：

```text
Fail > Complete > Stop
```

`NextHeartbeat` 和 `NextPrompt` 仅影响下一轮并在触发时消费。

解析器会屏蔽工具请求、工具结果、工具调用摘要、Desktop Push、VCP 思考链、`think` 块、Markdown 代码围栏和行内代码中的伪命令。

## 持久化与恢复

默认数据目录：

```text
BackendFlowlockPlugin/data/
├── sessions.json
└── audit.jsonl
```

`sessions.json` 使用临时文件加同目录重命名写入。插件重启后：

1. 将持久化的 `running` 会话降级为 `waiting`。
2. 增加 `generation`，使旧进程定时器无法复活。
3. 查询任务板校验任务仍为 `in_progress`。
4. 校验 `assignee` 和 `assignment_id`。
5. 只恢复通过校验的会话。
6. 将失效会话记录为终止状态并写入审计日志。

## 管理命令

- `StartTaskFlowlock`
- `StopTaskFlowlock`
- `GetTaskFlowlock`
- `ListTaskFlowlocks`
- `ReconcileTaskFlowlocks`
- `GetBackendFlowlockStatus`

`StartTaskFlowlock` 对相同 `agent_name + task_id` 幂等。

## 主要配置

```env
BACKEND_FLOWLOCK_ENABLED=true
BACKEND_FLOWLOCK_DEFAULT_DELAY_SECONDS=30
BACKEND_FLOWLOCK_MIN_DELAY_SECONDS=1
BACKEND_FLOWLOCK_MAX_DELAY_SECONDS=86400
BACKEND_FLOWLOCK_MAX_RETRIES=3
BACKEND_FLOWLOCK_MAX_ROUNDS=100
BACKEND_FLOWLOCK_MAX_CONCURRENT_SESSIONS=20
BACKEND_FLOWLOCK_MAX_SESSIONS_PER_AGENT=3
BACKEND_FLOWLOCK_RECOVERY_DELAY_SECONDS=5
BACKEND_FLOWLOCK_DATA_DIR=./data
```

## 安全约束

- 任务板结构化状态是任务所有权真源。
- `assignment_id` 防止旧会话操作新分配。
- 所有定时器受 `generation` 保护。
- 日志只保存响应预览，不记录 API Key。
- 任务间使用不同 AgentAssistant `session_id`，上下文不会互串。
- 单个会话失败、停止或达到重试上限，不影响同 Agent 的其他任务会话。
