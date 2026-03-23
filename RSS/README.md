# RSS 新闻推送插件 (VCP 静态插件)

本插件是基于 VCP (Virtual Cherry-Var Protocol) 架构开发的**静态插件**。它能够在后台常驻运行，每日自动抓取指定的 RSS 源（默认为 AI 早报），提取关键的“概览”内容，并无缝注入到所有 Agent 的系统提示词中。

## 🌟 核心功能

- **自动化拉取**：按照配置的时间间隔（默认一小时）自动请求 RSS/Atom 订阅源。
- **每日持久化**：将每日抓取的新闻内容以 JSON 格式保存到本地指定目录（如 `./DailyNews`），按日期命名。
- **智能摘要提取**：专门适配了 MD 格式的早报规范，能够自动正则匹配并提取 `## 概览` 章节的内容。
- **动态语义折叠 (vcp_dynamic_fold)**：
  - **按需展示**：仅当用户询问与新闻、时事、简报相关的内容时，VCP Server 才会将详细的“概览”内容注入提示词。
  - **极简消耗**：在无关闲聊时，它只输出一条极短的占位文本，几乎不消耗 Token。

## 🛠️ 安装与部署

1. **依赖准备**：
   插件使用 Node.js 开发，需要安装 `fast-xml-parser`。
   ```bash
   cd Plugin/RSS
   npm install
   ```

2. **配置文件 (`config.env`)**：
   你可以根据需要修改以下配置：
   ```env
   RSS_FEED_URL=https://raw.githubusercontent.com/imjuya/juya-ai-daily/master/feed.xml
   RSS_SAVE_PATH=./DailyNews
   FETCH_INTERVAL_MS=3600000
   ```

3. **启用插件**：
   在 Agent 的系统提示词（System Prompt）中添加该占位符：
   ```text
   {{VCPRSS}}
   ```

## 📄 协议说明

本插件遵循 **VCP 静态插件规范**：
- **占位符**：`{{VCPRSS}}`
- **注入逻辑**：插件启动后长驻进程，通过向 `stdout` 实时输出 JSON 对象，主服务器会自动捕获并更新缓存。
- **匹配描述**：插件自带语义描述，RAG Embedding 模型会根据用户的问题（如“看下今天新闻”）自动调整内容的展示精细度。

## 📁 存储结构

```text
RSS/
├── RSS.js              # 插件核心逻辑
├── plugin-manifest.json # 插件元数据定义
├── config.env          # 环境变量配置
├── package.json
└── DailyNews/          # 自动生成的每日新闻归档
    └── daily_news_2026-03-23.json
```

## 🤝 鸣谢

- 订阅源支持：[Juya AI Daily](https://github.com/imjuya/juya-ai-daily)
