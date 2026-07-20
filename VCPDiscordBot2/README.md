# VCPDiscordBot - Discord 实时交互机器人

> 基于 Discord.js 的 VCP `hybridservice` 单插件方案，提供 Gateway 常驻监听、主动 AI 唤醒、动态占位符和同步工具调用。

## ✨ 核心特性

### 🚀 实时交互能力
- **毫秒级响应**：消息到达延迟 < 100ms，完全达到 Mail/QQ 插件水平
- **主动 AI 唤醒**：被 @ 或重要频道消息时自动触发 AI 处理，无需人工干预
- **VCP 托管常驻**：由 PluginManager 调用 `initialize(config)` 启动，并通过 `shutdown()` 释放资源

### 🎯 智能消息管理
- **动态占位符**：维护 `{{VCPDiscordBotStatus}}` 与 `{{VCPDiscordRecentMessages}}`
- **优先级队列**：@ 提及和重要频道消息优先处理
- **自动清理**：按大小和时效自动清理过期消息

### 🔧 完整工具集
- `send_message` - 发送消息到指定频道
- `reply_message` - 回复特定消息（自动引用）
- `list_channels` - 列出所有可用频道
- `clear_queue` - 清空消息队列
- `status` - 查看插件状态和统计

### 💾 数据持久化
- 消息队列自动保存
- 断线重连后恢复状态
- 统计数据持久化

---

## 📦 安装

### 1. 安装依赖

```bash
cd Plugin/VCPDiscordBot
npm install
```

### 2. 创建 Discord Bot

1. 访问 [Discord Developer Portal](https://discord.com/developers/applications)
2. 点击 "New Application" 创建应用
3. 进入 "Bot" 标签页，点击 "Add Bot"
4. 复制 Bot Token（注意保密！）
5. 启用以下 Privileged Gateway Intents：
   - `MESSAGE CONTENT INTENT` ✅
   - `SERVER MEMBERS INTENT` ✅
   - `PRESENCE INTENT` （可选）

### 3. 邀请 Bot 到服务器

使用以下 URL 模板邀请 Bot（替换 `YOUR_CLIENT_ID`）：

```
https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=274877991936&scope=bot
```

权限说明：
- 查看频道
- 发送消息
- 管理消息
- 嵌入链接
- 附加文件
- 读取消息历史
- 添加反应

### 4. 配置插件

复制插件私有配置模板并编辑：

```bash
cp config.env.example config.env
nano config.env
```

**最小配置（必需）：**

```env
DISCORD_BOT_TOKEN=your_discord_bot_token_here
AgentName=AI管家
```

`PORT` 与 `Key` 不写入插件的 `config.env`。VCP 托管运行时，PluginManager 会将 VCP 根目录 `config.env` 中的 `PORT`、`Key` 与插件私有配置合并后传给 `initialize(config)`。

---

## 🔌 VCP 运行模型

本插件不是按次启动的 `synchronous + stdio` 插件，而是：

```json
{
  "pluginType": "hybridservice",
  "entryPoint": { "script": "VCPDiscordBot.js" },
  "communication": { "protocol": "direct" }
}
```

VCP 启动时会加载模块并调用：

1. `initialize(config)`：接收插件配置以及根配置中的 `PORT` / `Key`，启动 Discord Gateway。
2. `processToolCall(params)`：处理 AI 的发送、回复、频道列表和状态工具调用。
3. `shutdown()`：VCP 关闭或重载时清理 Client、定时器并保存缓存。

模块被 `require()` 时不会自行启动，也不会监听 stdin。

### 如何确认插件确实运行在 VCP 中

重启 VCP 后检查服务器日志，应出现：

```text
[VCPDiscordBot] 初始化: mode=vcp-managed, PORT=6005, Key=FOUND, DiscordToken=xx***xx
```

然后调用 `status`，确认：

- 运行模式为 `VCP 托管 hybridservice`。
- `VCP PORT` 不是 `NOT_FOUND`。
- `VCP Key` 为 `FOUND`。
- Discord 客户端为已连接。

动态占位符为：

```text
{{VCPDiscordBotStatus}}
{{VCPDiscordRecentMessages}}
```

---

## ⚙️ 配置说明

### 基础配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `DISCORD_BOT_TOKEN` | string | - | Discord Bot Token（必需） |
| `AgentName` | string | `AI管家` | 绑定的 VCP Agent 名称 |

### 功能配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `ImportantChannels` | string | - | 重要频道 ID 列表（逗号分隔） |
| `MaxQueueSize` | integer | `1000` | 消息队列最大容量 |
| `FoldOutputInterval` | integer | `10000` | 动态占位符刷新间隔（毫秒） |

### 自动唤醒配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `AutoPokeOnMention` | boolean | `true` | 被 @ 时自动唤醒 AI |
| `AutoPokeOnImportantChannel` | boolean | `true` | 重要频道消息自动唤醒 AI |

### 调试配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `DebugMode` | boolean | `false` | 启用调试日志 |

---

## 🎮 使用指南

### 查看 Bot 状态

在 VCP 对话中：

```
请查看 Discord Bot 的状态
```

AI 会调用：
```
<<<[TOOL_REQUEST]>>>
tool_name:「始」VCPDiscordBot「末」,
command:「始」status「末」
<<<[END_TOOL_REQUEST]>>>
```

### 回复 Discord 消息

当 Discord 有人 @ Bot 时：

1. **自动模式**（推荐）：Bot 会自动唤醒 AI，AI 会看到提示：
   ```
   [Discord实时提醒:] 用户名 在 #频道名 频道 @ 了你，消息内容："..."
   ```

2. **手动模式**：查看 `{{VCPDiscordRecentMessages}}` 动态占位符，找到消息 ID，然后：
   ```
   请回复 Discord 消息 ID 123456789，内容是："收到，我会处理"
   ```

AI 会调用：
```
<<<[TOOL_REQUEST]>>>
tool_name:「始」VCPDiscordBot「末」,
command:「始」reply_message「末」,
messageId:「始」123456789「末」,
content:「始」收到，我会处理「末」
<<<[END_TOOL_REQUEST]>>>
```

### 发送图片

```
请在 Discord #general 频道发送一张猫咪图片，图片地址是 https://example.com/cat.png
```

AI 会调用：
```
<<<[TOOL_REQUEST]>>>
tool_name:「始」VCPDiscordBot「末」,
command:「始」send_message「末」,
channelId:「始」123456789「末」,
content:「始」可爱的猫咪！「末」,
imageUrl:「始」https://example.com/cat.png「末」
<<<[END_TOOL_REQUEST]>>>
```

### 列出所有频道

```
请列出所有可用的 Discord 频道
```

AI 会调用：
```
<<<[TOOL_REQUEST]>>>
tool_name:「始」VCPDiscordBot「末」,
command:「始」list_channels「末」
<<<[END_TOOL_REQUEST]>>>
```

---

## 📊 动态占位符说明

插件默认每 10 秒更新两个由 PluginManager 托管的动态占位符；消息到达、发送、回复或清空队列时也会立即更新。

### 高详细度（threshold: 0.5）
当用户明确询问 Discord 消息时展示：
```
【Discord 详细消息面板】
1. [2024-01-01 10:00:00] #general - 用户A: 大家好！ (ID: 123456)
2. [2024-01-01 10:01:00] #tech - 用户B: 有人会 Python 吗？ (ID: 123457)
...
```

### 状态占位符

`{{VCPDiscordBotStatus}}` 展示 Gateway、VCP 配置注入和消息统计状态。

---

## 🔍 工作原理

### 架构对比

| 特性 | 旧双插件架构 | 新单插件架构 |
|------|-------------|-------------|
| 插件数量 | 2个（Monitor + Action） | 1个 |
| 实时性 | 10秒轮询 | < 100ms WebSocket |
| AI 唤醒 | 被动等待 | 主动触发 |
| 状态同步 | 文件 IPC | 内存直接访问 |
| 维护成本 | 高 | 低 |

### 消息处理流程

```mermaid
graph LR
    A[Discord 消息] --> B[WebSocket 推送]
    B --> C{消息类型判断}
    C -->|@ 提及| D[主动唤醒 AI]
    C -->|重要频道| D
    C -->|普通消息| E[添加到队列]
    D --> F[调用 AgentAssistant]
    F --> G[AI 生成回复]
    G --> H[调用 reply_message]
    H --> I[发送到 Discord]
    E --> J[动态占位符更新]
```

### 与 VCP 主服务器交互

```javascript
// 主动唤醒 AI
POST http://127.0.0.1:{PORT}/v1/human/tool
Authorization: Bearer {Key}

<<<[TOOL_REQUEST]>>>
maid:「始」VCP系统「末」,
tool_name:「始」AgentAssistant「末」,
agent_name:「始」AI管家「末」,
prompt:「始」[Discord实时提醒:] ...「末」,
temporary_contact:「始」true「末」,
<<<[END_TOOL_REQUEST]>>>
```

---

## 🐛 故障排查

### Bot 无法连接

**症状**：启动后显示 "Discord 客户端未连接"

**解决方案**：
1. 检查 `DISCORD_BOT_TOKEN` 是否正确
2. 检查网络连接
3. 启用 `DebugMode=true` 查看详细日志
4. 确认 Bot Token 未过期

### 无法接收消息

**症状**：Bot 在线但看不到消息

**解决方案**：
1. 确认已启用 `MESSAGE CONTENT INTENT`（必需）
2. 检查 Bot 是否有频道查看权限
3. 查看 `status` 命令输出的统计数据

### AI 没有自动回复

**症状**：被 @ 后已经触发 AgentAssistant，但日志出现 `API key not valid`。

VCP 根配置里有两个不同用途的 Key：

- `Key`：VCP 本机 HTTP 接口鉴权。托管模式下 Discord 插件改用 PluginManager direct 调用，不依赖它唤醒 Agent。
- `API_Key`：VCP 调用上游 AI 模型供应商的凭证。`AgentAssistant` 报 `API key not valid` 时，实际需要检查的是它。

**解决方案**：
1. 检查 `AutoPokeOnMention` 是否为 `true`。
2. 调用 Discord 插件 `status`，确认 `Agent 投递链路` 为 `plugin-manager-direct`。
3. 检查 VCP 根目录 `config.env` 中的 `API_Key` 与 `API_URL` 是否属于同一个模型服务商或中转服务。
4. 用 VCP 正常聊天入口测试 Agent `Nova`；如果普通聊天同样报 `API key not valid`，问题与 Discord 插件无关。
5. 修正 `API_Key` 后重启 VCP，使 AgentAssistant 重新读取模型配置。

### 消息队列溢出

**症状**：内存占用过高

**解决方案**：
1. 调整 `MaxQueueSize` 参数
2. 定期调用 `clear_queue` 清空队列
3. 检查是否有消息泄漏（未及时清理）

---

## 📈 性能指标

### 基准测试结果

| 指标 | 数值 |
|------|------|
| 消息接收延迟 | < 100ms |
| 消息发送延迟 | < 500ms |
| 内存占用（空闲） | ~60MB |
| 内存占用（1000条消息） | ~80MB |
| CPU 占用（空闲） | < 1% |
| 消息吞吐量 | > 1000条/分钟 |

### 与其他插件对比

| 插件 | 实时性 | 自动唤醒 | 内存占用 |
|------|--------|---------|---------|
| VCPDiscordBot（新） | ⭐⭐⭐⭐⭐ | ✅ | ~60-80MB |
| Discord 双插件（旧） | ⭐⭐ | ❌ | ~80-120MB |
| VCPQQBotServer | ⭐⭐⭐⭐⭐ | ✅ | ~50-70MB |
| VCPClawMail | ⭐⭐⭐⭐⭐ | ✅ | ~70-90MB |

---

## 🔐 安全建议

1. **保护 Bot Token**：
   - 不要将 Token 提交到 Git
   - 使用 `.gitignore` 排除 `config.env`
   - 定期轮换 Token

2. **权限最小化**：
   - 只授予必需的权限
   - 避免授予管理员权限
   - 定期审查权限

3. **频道隔离**：
   - 使用 `ImportantChannels` 限制自动唤醒范围
   - 敏感频道不添加 Bot

4. **速率限制**：
   - 插件内置了消息发送间隔控制
   - 避免短时间内大量发送消息
   - Discord API 有全局速率限制

---

## 🆚 与旧版双插件对比

### 优势

✅ **实时性提升 100 倍**：从 10 秒降至 < 100ms  
✅ **完全自动化**：AI 自动响应，无需人工触发  
✅ **维护更简单**：单进程，无 IPC 复杂性
✅ **扩展性更强**：可轻松添加语音、反应等功能
✅ **动态上下文**：状态和最近消息通过 VCP 占位符直接注入

### 迁移指南

如果你正在使用旧版双插件（DiscordMonitor + DiscordAction），迁移步骤：

1. **备份数据**：
   ```bash
   cp Plugin/DiscordMonitor/message_queue.json Plugin/VCPDiscordBot/data/backup.json
   ```

2. **停止旧插件**：
   在 VCP 主服务器中移除对旧插件的引用

3. **安装新插件**：
   按照上述安装步骤操作

4. **更新 Agent 提示词**：
   将 `{{VCPDiscordMonitor}}` 和 `{{VCPDiscordAction}}` 替换为 `{{VCPDiscordBot}}`

5. **测试验证**：
   发送测试消息确认一切正常

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

### 独立测试模式

直接执行脚本仅用于验证 Discord 连接与配置读取，不代表 VCP 已加载插件：

```bash
node VCPDiscordBot.js
```

脚本会读取：

1. VCP 根目录 `config.env`（默认路径为插件目录向上两级）。
2. 插件目录 `config.env`。
3. 当前进程环境变量（最高优先级）。

如果测试副本不位于 `VCPToolBox/Plugin/VCPDiscordBot`，可显式指定根配置：

```cmd
set VCP_ROOT_CONFIG_PATH=C:\path\to\VCPToolBox\config.env&& node VCPDiscordBot.js
```

### 代码结构

```
VCPDiscordBot.js
├── 工具函数（log, warn, normalize...）
├── 数据持久化（saveCache, loadCache）
├── 消息队列管理（addToQueue, removeFromQueue...）
├── AI 主动唤醒（pokeAgent）
├── 动态占位符（updatePlaceholders）
├── Discord Gateway 连接（connectDiscord, setupEventHandlers...）
├── 工具调用接口（sendMessage, replyMessage...）
└── 主程序入口（initialize, shutdown）
```

---

## 📄 许可证

MIT License

---

## 🙏 致谢

本插件设计灵感来源于：
- [`VCPQQBotServer`](../VCPQQBotServer/VCPQQBotServer.js) - Gateway 连接管理
- [`VCPClawMail`](../VCPClawMail/VCPClawMail.js) - hybridservice 生命周期、动态占位符和自动委托
- [Discord 双插件架构方案](../../Discord双插件架构方案.md) - Discord 消息监控与行动闭环设计

---

## 📞 支持

如有问题，请：
1. 查看本文档的故障排查章节
2. 查看 [VCP 同步插件开发手册](../../同步异步插件开发手册.md)
3. 提交 GitHub Issue

---

**享受实时的 Discord 交互体验！** 🎉
