# VCPDiscordBot 快速入门指南

> 5 分钟快速部署 Discord 实时交互机器人

## 🚀 快速开始

### 第一步：获取 Discord Bot Token

1. 访问 https://discord.com/developers/applications
2. 点击 **New Application**，输入名称（如 "VCP Bot"）
3. 进入 **Bot** 标签页
4. 点击 **Add Bot** 确认创建
5. 点击 **Reset Token** 并复制 Token（⚠️ 只显示一次，请妥善保存）
6. 启用以下选项：
   - ✅ **MESSAGE CONTENT INTENT**（必需）
   - ✅ **SERVER MEMBERS INTENT**（推荐）

### 第二步：邀请 Bot 到服务器

1. 在左侧菜单选择 **OAuth2** > **URL Generator**
2. 勾选 Scopes:
   - ✅ `bot`
3. 勾选 Bot Permissions:
   - ✅ View Channels
   - ✅ Send Messages
   - ✅ Send Messages in Threads
   - ✅ Embed Links
   - ✅ Attach Files
   - ✅ Read Message History
   - ✅ Add Reactions
4. 复制生成的 URL 并在浏览器中打开
5. 选择目标服务器并授权

### 第三步：安装插件

**Windows:**
```cmd
cd Indiscord\Plugin\VCPDiscordBot
install.bat
```

**Linux/Mac:**
```bash
cd Indiscord/Plugin/VCPDiscordBot
chmod +x install.sh
./install.sh
```

**手动安装:**
```bash
npm install
cp config.env.example config.env
```

### 第四步：配置插件

编辑 `config.env` 文件：

```env
# 必需：填入你的 Discord Bot Token
DISCORD_BOT_TOKEN=你的Token

# 推荐：设置绑定的 Agent 名称
AgentName=AI管家

# 可选：设置重要频道（逗号分隔）
ImportantChannels=1234567890,9876543210
```

### 第五步：在 VCP 中启动

把插件放在 `VCPToolBox/Plugin/VCPDiscordBot` 后重启 VCP 主服务器。插件是 `hybridservice`，由 PluginManager 直接加载，不需要单独启动子进程。

VCP 日志出现以下内容表示生命周期和配置注入成功：

```text
[VCPDiscordBot] 初始化: mode=vcp-managed, PORT=6005, Key=FOUND, DiscordToken=xx***xx
```

独立执行仅用于排障，不代表 VCP 已加载插件：

```bash
node VCPDiscordBot.js
```

独立模式默认读取：

- `VCPToolBox/config.env` 中的 `PORT` 和 `Key`。
- `VCPToolBox/Plugin/VCPDiscordBot/config.env` 中的 Discord 配置。

如果插件副本不在标准目录，可设置 `VCP_ROOT_CONFIG_PATH` 指向根配置。

## ✅ 验证功能

### 测试 1：确认 VCP 托管状态

通过 VCP 调用 `status`，确认运行模式为 `VCP 托管 hybridservice`，并且 `VCP PORT`、`VCP Key` 和 Discord Token 均已找到。

在 Agent 系统提示词中按需加入：

```text
{{VCPDiscordBotStatus}}
{{VCPDiscordRecentMessages}}
```

### 测试 2：@ 提及

在 Discord 中 @ 你的 Bot：
```
@VCPBot 你好！
```

如果配置了 VCP 主服务器，AI 应该会被自动唤醒。

### 测试 3：工具调用

通过 VCP 对话测试：
```
请查看 Discord Bot 状态
```

AI 会调用 `status` 命令并返回详细信息。

## 🔧 常见问题

### Q: Bot 显示离线？
**A:** 检查 Token 是否正确，是否启用了 MESSAGE CONTENT INTENT。

### Q: 收不到消息？
**A:** 确认 Bot 有查看频道的权限，并且 MESSAGE CONTENT INTENT 已启用。

### Q: AI 没有自动回复？
**A:** `PORT` 和 `Key` 位于 VCP 根目录 `config.env`，不位于插件 `config.env`。调用 `status` 检查是否分别显示端口值和 `FOUND`；若为 `NOT_FOUND`，说明 PluginManager 没有把根配置合并传入插件。

### Q: 安装依赖失败？
**A:** 确保 Node.js 版本 >= 16.9.0，npm 版本 >= 7.0.0。

## 📝 下一步

- 📖 阅读完整文档：[`README.md`](README.md)
- 🔍 查看 VCP 插件开发手册
- 🎯 配置重要频道实现自动唤醒
- 🔧 调整队列大小和输出间隔

## 🆘 需要帮助？

1. 查看 [`README.md`](README.md) 的故障排查章节
2. 启用 `DebugMode=true` 查看详细日志
3. 提交 GitHub Issue

---

**享受实时的 Discord 交互！** 🎉
