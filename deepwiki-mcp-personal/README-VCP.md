# DeepwikiProcessor VCP插件

基于原有deepwiki-mcp项目改造的VCP（Virtual Cherry-Var Protocol）同步插件，专门用于从deepwiki.com爬取内容并转换为Markdown格式，支持文件保存功能。

## 功能特性

- 🔒 **域名安全**: 仅处理来自deepwiki.com的URL
- 🧹 **HTML清理**: 移除页眉、页脚、导航、脚本和广告
- 🔗 **链接重写**: 调整链接以在Markdown中正常工作
- 📄 **多种输出格式**: 支持聚合模式和分页模式
- 💾 **文件保存**: 支持保存为.md和.txt格式
- 🚀 **高性能**: 支持可调并发和深度的快速爬取
- 🔍 **搜索功能**: 支持在内容中搜索关键词并高亮显示
- 📦 **批量处理**: 支持VCP串行调用语法

## 安装和配置

### 1. 安装依赖

```bash
npm install
# 或使用 pnpm
pnpm install
```

### 2. 构建项目

```bash
npm run build
```

### 3. 配置文件

编辑 `config.env` 文件来配置插件参数：

```env
# 文件保存配置
OUTPUT_DIR=./deepwiki-output
MAX_CONCURRENCY=5
REQUEST_TIMEOUT=30000

# GitHub API配置（可选，用于解析库名）
GITHUB_TOKEN=your_github_token_here

# 爬虫配置
DEEPWIKI_MAX_CONCURRENCY=5
DEEPWIKI_REQUEST_TIMEOUT=30000
DEEPWIKI_MAX_RETRIES=3
DEEPWIKI_RETRY_DELAY=250
```

## VCP插件使用

### 基本调用格式

#### FetchContent 命令

从deepwiki.com获取内容并转换为Markdown格式：

```
<<<[TOOL_REQUEST]>>>
tool_name:「始」DeepwikiProcessor「末」,
command:「始」FetchContent「末」,
url:「始」https://deepwiki.com/shadcn-ui/ui「末」,
mode:「始」aggregate「末」,
saveFormat:「始」md「末」
<<<[END_TOOL_REQUEST]>>>
```

**参数说明:**
- `url` (必需): deepwiki URL、owner/repo格式或关键词
- `mode` (可选): 'aggregate'或'pages'模式，默认'aggregate'
- `maxDepth` (可选): 爬取深度，默认1，最大1
- `saveFormat` (可选): 保存格式'md'或'txt'，默认不保存
- `outputPath` (可选): 自定义保存路径
- `verbose` (可选): 是否显示详细日志，默认false

#### SearchContent 命令

在deepwiki内容中搜索关键词：

```
<<<[TOOL_REQUEST]>>>
tool_name:「始」DeepwikiProcessor「末」,
command:「始」SearchContent「末」,
url:「始」vercel/ai「末」,
query:「始」streaming「末」,
maxMatches:「始」10「末」
<<<[END_TOOL_REQUEST]>>>
```

**参数说明:**
- `url` (必需): deepwiki URL或关键词
- `query` (必需): 搜索关键词
- `maxMatches` (可选): 最大匹配数，默认10
- `maxDepth` (可选): 爬取深度，默认1
- `saveResults` (可选): 是否保存搜索结果，默认false
- `outputPath` (可选): 保存路径（当saveResults为true时）

### 支持的URL格式

1. **完整URL**: `https://deepwiki.com/shadcn-ui/ui`
2. **简短格式**: `shadcn-ui/ui`
3. **关键词**: `react` (会自动解析为最匹配的仓库)
4. **短语**: `how to use react hooks` (会提取关键词进行匹配)

### 批量调用

支持在一次调用中执行多个操作：

```
<<<[TOOL_REQUEST]>>>
tool_name:「始」DeepwikiProcessor「末」,
command1:「始」FetchContent「末」,
url1:「始」react「末」,
saveFormat1:「始」md「末」,
command2:「始」SearchContent「末」,
url2:「始」vercel/ai「末」,
query2:「始」streaming「末」
<<<[END_TOOL_REQUEST]>>>
```

## 直接测试

### 命令行测试

```bash
# 测试FetchContent命令
echo '{"command":"FetchContent","url":"react","saveFormat":"md"}' | node deepwiki-processor.mjs

# 测试SearchContent命令
echo '{"command":"SearchContent","url":"vercel/ai","query":"stream","maxMatches":5}' | node deepwiki-processor.mjs
```

### npm脚本测试

```bash
npm run test:plugin
```

## 输出格式

### 成功响应

```json
{
  "status": "success",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "# 页面标题\n\n页面内容..."
      }
    ],
    "totalPages": 3,
    "totalBytes": 25000,
    "elapsedMs": 1200,
    "savedFiles": ["./deepwiki-output/index.md", "./deepwiki-output/getting-started.md"],
    "message": "内容已保存到 2 个文件"
  }
}
```

### 错误响应

```json
{
  "status": "error",
  "error": "Only deepwiki.com domains are allowed"
}
```

## 环境变量

| 变量名 | 描述 | 默认值 |
|--------|------|--------|
| `OUTPUT_DIR` | 文件保存目录 | `./deepwiki-output` |
| `MAX_CONCURRENCY` | 最大并发数 | `5` |
| `REQUEST_TIMEOUT` | 请求超时时间(ms) | `30000` |
| `GITHUB_TOKEN` | GitHub API令牌 | - |
| `DEEPWIKI_MAX_CONCURRENCY` | 爬虫并发数 | `5` |
| `DEEPWIKI_REQUEST_TIMEOUT` | 爬虫超时时间(ms) | `30000` |
| `DEEPWIKI_MAX_RETRIES` | 最大重试次数 | `3` |
| `DEEPWIKI_RETRY_DELAY` | 重试延迟(ms) | `250` |

## 故障排除

### 常见问题

1. **模块导入错误**: 确保运行了 `npm run build` 来构建必要的模块
2. **权限错误**: 确保插件文件有执行权限：`chmod +x deepwiki-processor.mjs`
3. **网络超时**: 增加 `REQUEST_TIMEOUT` 环境变量的值
4. **GitHub API限制**: 设置 `GITHUB_TOKEN` 环境变量以提高API速率限制

### 调试模式

设置环境变量 `NODE_ENV=development` 来获取详细的错误堆栈信息：

```bash
NODE_ENV=development echo '{"command":"FetchContent","url":"invalid"}' | node deepwiki-processor.mjs
```

## 开发

### 项目结构

```
deepwiki-mcp/
├── plugin-manifest.json     # VCP插件配置
├── config.env              # 环境配置
├── deepwiki-processor.mjs   # 主插件文件
├── src/                    # 源代码
│   ├── lib/                # 核心库
│   ├── converter/          # HTML转换器
│   ├── utils/              # 工具函数
│   └── schemas/            # 数据模式
└── dist/                   # 构建输出
```

### 贡献

1. Fork 本项目
2. 创建功能分支: `git checkout -b feature/new-feature`
3. 提交更改: `git commit -am 'Add new feature'`
4. 推送分支: `git push origin feature/new-feature`
5. 创建 Pull Request

## 许可证

MIT License

## 相关链接

- 原项目: [deepwiki-mcp](https://github.com/regenrek/deepwiki-mcp)
- VCP协议文档: 见 `同步异步插件开发手册.md`