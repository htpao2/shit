# SnowAICodeWorker - Snow CLI Agent Worker

SnowAICodeWorker 是一个 VCP 同步插件外壳。它把代码分析、补丁建议和文件修改任务交给 Snow CLI 主 Agent，并把结构化结果返回 VCP Agent。

每个 job 会独立启动一个 Snow SSE 前台子进程，连接事件流，完成或失败后关闭整个进程树。这样不同项目、会话与任务的运行状态互相隔离。

## 前置条件

- Node.js >= 22（与当前 Snow CLI 包要求一致）
- 已安装并完成配置的 Snow CLI
- `snow --version` 可执行
- Snow 的 Profile、模型和 API 配置可正常使用

```bash
npm install -g snow-ai
snow --version
```

复制配置：

```bash
cp config.env.example config.env
```

至少设置：

```env
SNOW_BIN=snow
SNOW_BIN_ARGS=[]
ALLOWED_PROJECT_ROOTS=/app/VCPToolBox_new,/app/myproject
MAX_CONCURRENT_JOBS=1
```

Snow 自身仍读取 `~/.snow` 与项目 `.snow` 配置。插件不会写 API Key。`SNOW_BIN_ARGS` 通常保持 `[]`；仅在使用 `node /path/to/bundle/cli.mjs` 一类入口时填写固定前置参数。

## 最快上手

```text
<<<[TOOL_REQUEST]>>>
tool_name:「始」AICodeWorker「末」,
command:「始」run_and_wait「末」,
projectPath:「始」/app/myproject「末」,
task:「始」分析 src/auth.ts 的错误处理，指出根因，不修改文件。「末」,
mode:「始」analyze「末」
<<<[END_TOOL_REQUEST]>>>
```

`mode`：

| 值 | 行为 |
|---|---|
| `analyze` | 只读分析，不改文件 |
| `patch` | 只读分析，最终提供 unified diff |
| `write` | 允许 Snow 修改任务直接相关文件并验证 |

## Preset

仍支持 7 个快捷预设：

| preset | 必填参数 | 用途 |
|---|---|---|
| `index` | `targetPath` | 函数/方法索引 |
| `read` | `targetPath` | 读取文件 |
| `scan` | `targetPath` | 扫描目录；可选 `depth` |
| `bug` | `targetPath`, `error` | 分析报错；可选 `detail` |
| `set` | `targetPath`, `key`, `value` | 修改单一值 |
| `append` | `targetPath`, `content` | 追加内容；可选 `position` |
| `create` | `targetPath`, `what` | 创建或覆写文件 |

```text
command: run_and_wait
preset: index
targetPath: /app/myproject/src/auth.ts
```

未传 `projectPath` 时，preset 会从 `targetPath` 推导工作目录。

## 命令

| 命令 | 说明 |
|---|---|
| `capabilities` | 检查 Snow CLI 可用性和插件策略 |
| `run` | 提交任务并立即返回 `jobId` |
| `run_and_wait` | 提交并等待终态 |
| `query` | 查询任务；`detail=full` 返回受限长度完整转录 |
| `listJobs` | 列出近期任务；可选 `limit` |
| `cancel` | 取消运行中的任务并清理 Snow 进程树 |
| `answer` | 使用一次性 `resumeToken` 回答 Snow 的待答问题 |

状态：

- `running`：执行中
- `completed`：成功完成
- `waiting_for_answer`：Snow 需要用户输入，当前轮次已安全结束
- `failed`：执行失败
- `timeout`：超时并已清理进程
- `cancelled`：主动取消

## 默认返回内容

`run_and_wait` 和 `query` 默认返回：

```json
{
  "status": "success",
  "result": {
    "jobId": "job_...",
    "state": "completed",
    "sessionId": "snow-session-id",
    "summary": "【执行结果摘要】...",
    "finalResponse": "Snow 主 Agent 的最终回复",
    "fileChanges": {
      "modified": [],
      "created": [],
      "deleted": []
    },
    "toolStats": {
      "requested": 3,
      "approved": 2,
      "rejectedSensitive": 1,
      "succeeded": 2,
      "failed": 0,
      "byName": {}
    },
    "usage": null,
    "warnings": [],
    "error": null,
    "outputFile": "...",
    "transcriptFile": "...",
    "logFile": "..."
  }
}
```

完整 SSE 事件不会默认塞入 VCP 上下文。需要排查过程时调用：

```text
command: query
jobId: job_...
detail: full
```

`detail=full` 增加 `transcript` 和 `log`，长度受 `FULL_TRANSCRIPT_MAX_CHARS` 限制。

## Snow 提问与 answer

Snow 主 Agent 使用 ask-user 工具时，插件不会让任务悬挂：

1. 捕获 `user_question_request`。
2. 向 Snow 返回 `{cancelled: true}`，让 Snow 正常结束当前轮次并保存 session。
3. 返回 `waiting_for_answer`、问题、选项和一次性 `resumeToken`。
4. VCP Agent 获取用户答案后调用 `answer`。

返回示例：

```json
{
  "state": "waiting_for_answer",
  "sessionId": "abc-123",
  "pendingQuestion": {
    "question": "要使用哪种数据库？",
    "options": ["SQLite", "PostgreSQL"],
    "multiSelect": false,
    "requestId": "...",
    "resumeToken": "resume_..."
  }
}
```

续答：

```text
<<<[TOOL_REQUEST]>>>
tool_name:「始」AICodeWorker「末」,
command:「始」answer「末」,
resumeToken:「始」resume_...「末」,
answer:「始」使用 SQLite，并保持零额外服务依赖。「末」,
selectedOptions:「始」["SQLite"]「末」
<<<[END_TOOL_REQUEST]>>>
```

`answer` 默认像 `run_and_wait` 一样等待完成；传 `wait=false` 时立即返回新的 `jobId`。令牌会在启动续答前原子消费，不能重复使用。

## 普通 session 续聊

无需回答待答问题时，也可以直接用 `sessionId` 追问：

```text
command: run_and_wait
projectPath: /app/myproject
sessionId: abc-123
task: 再从性能角度复查刚才的修改。
mode: analyze
```

Session 由 Snow 按项目保存；`projectPath` 必须与会话所属项目一致。

## 无人值守安全策略

- 非敏感工具确认：自动 `approve` 一次，不写永久权限配置。
- 敏感终端命令：自动 `reject_with_reply`，并在 `warnings` 记录工具名和匹配规则；不回传完整敏感参数。
- 用户问题：不猜答案，回传 VCP Agent。
- 项目路径：必须位于 `ALLOWED_PROJECT_ROOTS`。
- 并发：`MAX_CONCURRENT_JOBS` 硬限制，默认 1。
- 超时/取消：清理 runner 和 Snow 子进程树。
- 输出：常见 API Key、Token 和密码模式自动脱敏。

`write` 仍然允许 Snow 修改项目文件；应只在用户明确授权修改时使用。敏感命令被拒绝不代表所有文件写入都无风险。

## 每任务 SSE 生命周期

每个 job 的流程：

1. 在配置端口范围内选择空闲 localhost 端口。
2. 启动 `snow --sse --sse-port <port> --work-dir <projectPath>`。
3. 轮询 `/health`，再连接 `/events`。
4. 向 `/message` 发送任务，并处理工具确认、提问、usage 和 complete 事件。
5. 将结构化状态、最终回复、JSONL 事件与日志持久化。
6. 关闭 SSE 连接并终止该 job 的 Snow 进程树。

插件不会复用全局 Snow SSE 服务，也不会暴露对外监听端口。

## Job 文件

默认位于 `AIcodeworker/jobs/`：

```text
jobs/
├── meta/      # 状态、session、统计、待答问题
├── output/    # 最终回复
├── events/    # SSE JSONL 完整转录
├── logs/      # Snow 进程日志
└── tokens/    # 预留目录
```

非运行中 job 超过 `JOB_RETAIN_DAYS` 后会渐进清理。

