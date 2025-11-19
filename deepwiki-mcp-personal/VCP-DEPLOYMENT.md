# VCP插件部署指南

本指南详细说明如何将DeepwikiProcessor插件部署到VCP服务器环境中。

## 🚀 快速开始

### 1. 环境准备

确保系统满足以下要求：

- Node.js >= 18.0.0
- npm 或 pnpm 包管理器
- 可访问deepwiki.com的网络环境

### 2. 插件安装

```bash
# 克隆项目
git clone https://github.com/regenrek/deepwiki-mcp.git
cd deepwiki-mcp

# 安装依赖
npm install
# 或使用 pnpm
pnpm install

# 构建项目
npm run build

# 设置执行权限（Linux/macOS）
chmod +x deepwiki-processor.mjs

# Windows下通过npm脚本设置
npm run vcp:install
```

### 3. 配置插件

编辑 `config.env` 文件：

```env
# 基础配置
OUTPUT_DIR=./deepwiki-output
MAX_CONCURRENCY=5
REQUEST_TIMEOUT=30000

# 可选：GitHub API令牌（提高API限制）
GITHUB_TOKEN=your_github_token_here

# 爬虫优化配置
DEEPWIKI_MAX_CONCURRENCY=5
DEEPWIKI_REQUEST_TIMEOUT=30000
DEEPWIKI_MAX_RETRIES=3
DEEPWIKI_RETRY_DELAY=250
```

### 4. 测试插件

```bash
# 基础功能测试
npm run test:plugin

# 完整VCP测试套件
npm run test:vcp

# 手动测试单个命令
echo '{"command":"FetchContent","url":"react","saveFormat":"md"}' | node deepwiki-processor.mjs
```

## 📁 VCP服务器集成

### 插件文件结构

确保以下文件存在于插件目录中：

```
DeepwikiProcessor/
├── plugin-manifest.json     # VCP插件配置（必需）
├── config.env              # 环境配置（必需）
├── deepwiki-processor.mjs   # 主插件文件（必需）
├── package.json            # 依赖配置
├── dist/                   # 构建输出目录
│   ├── lib/                # 核心库模块
│   ├── converter/          # HTML转换模块
│   ├── utils/              # 工具函数模块
│   └── schemas/            # 数据模式模块
└── node_modules/           # 依赖包
```

### VCP服务器配置

1. **将插件目录复制到VCP服务器的插件目录**
2. **确保VCP服务器能识别 `plugin-manifest.json`**
3. **验证Node.js环境和依赖包可用性**

### 系统提示词配置

在VCP服务器的Agent系统提示词中添加以下占位符：

```
{{VCPDeepwikiProcessor}}
```

这会自动注入插件的功能描述，使AI能够理解和调用插件。

## 🔧 高级配置

### 性能优化

**并发设置**：
```env
# 根据服务器性能调整
DEEPWIKI_MAX_CONCURRENCY=10  # 高性能服务器
DEEPWIKI_MAX_CONCURRENCY=3   # 低配置服务器
```

**超时配置**：
```env
# 网络较慢时增加超时时间
DEEPWIKI_REQUEST_TIMEOUT=60000
REQUEST_TIMEOUT=60000
```

**内存优化**：
```env
# Node.js内存限制（适用于大量并发）
NODE_OPTIONS="--max-old-space-size=4096"
```

### 安全配置

**文件系统权限**：
```bash
# 限制输出目录权限
chmod 755 ./deepwiki-output
chown vcp-user:vcp-group ./deepwiki-output
```

**网络安全**：
- 确保只允许访问deepwiki.com域名
- 配置防火墙规则限制出站连接
- 使用代理服务器进行网络访问控制

### 监控和日志

**启用详细日志**：
```env
NODE_ENV=production
DEBUG_MODE=false  # 生产环境关闭调试
```

**日志文件配置**：
```javascript
// 在插件中添加日志记录
const logFile = process.env.VCP_LOG_FILE || './deepwiki-processor.log';
```

## 🚨 故障排除

### 常见问题解决

#### 1. 模块导入失败

**症状**：`Error: Cannot find module`

**解决方案**：
```bash
# 重新构建项目
npm run build

# 检查dist目录是否生成
ls -la dist/

# 手动安装缺失的依赖
npm install --production
```

#### 2. 权限错误

**症状**：`EACCES: permission denied`

**解决方案**：
```bash
# Linux/macOS
chmod +x deepwiki-processor.mjs
chmod -R 755 dist/

# Windows（以管理员权限运行）
icacls deepwiki-processor.mjs /grant Users:F
```

#### 3. 网络连接问题

**症状**：`ENOTFOUND` 或超时错误

**解决方案**：
```env
# 增加超时时间
DEEPWIKI_REQUEST_TIMEOUT=90000

# 配置代理（如需要）
HTTP_PROXY=http://proxy.company.com:8080
HTTPS_PROXY=http://proxy.company.com:8080
```

#### 4. GitHub API限制

**症状**：`GitHub error: 403`

**解决方案**：
```env
# 设置GitHub Personal Access Token
GITHUB_TOKEN=ghp_your_token_here
```

### 性能问题诊断

#### 内存使用过高

```bash
# 监控Node.js进程内存使用
ps aux | grep node
top -p $(pgrep node)

# 限制内存使用
NODE_OPTIONS="--max-old-space-size=2048" node deepwiki-processor.mjs
```

#### 响应时间慢

```bash
# 使用性能分析
NODE_OPTIONS="--prof" node deepwiki-processor.mjs

# 启用详细计时
time echo '{"command":"FetchContent","url":"react"}' | node deepwiki-processor.mjs
```

## 📋 维护清单

### 日常维护

- [ ] 检查日志文件大小和内容
- [ ] 监控输出目录磁盘使用
- [ ] 验证网络连接和API可用性
- [ ] 更新GitHub Token（如使用）

### 定期维护

- [ ] 更新Node.js依赖包
- [ ] 清理临时文件和缓存
- [ ] 备份重要配置文件
- [ ] 测试插件功能完整性

### 版本升级

```bash
# 备份当前配置
cp config.env config.env.backup
cp plugin-manifest.json plugin-manifest.json.backup

# 拉取最新代码
git pull origin main

# 重新安装依赖
npm install

# 重新构建
npm run build

# 运行测试验证
npm run test:vcp
```

## 🔐 安全最佳实践

1. **最小权限原则**：只给插件必要的文件系统权限
2. **网络隔离**：限制插件的网络访问范围
3. **输入验证**：确保所有输入都经过严格验证
4. **日志审计**：记录所有插件调用和结果
5. **定期更新**：保持依赖包和Node.js版本最新

## 📞 支持和反馈

如遇到问题或需要支持，请：

1. 查看本文档的故障排除部分
2. 检查 `README-VCP.md` 中的使用说明
3. 运行 `npm run test:vcp` 诊断问题
4. 提交Issue到GitHub仓库

---

**注意**：此插件基于原deepwiki-mcp项目改造，保持了核心功能的稳定性和可靠性。在生产环境部署前，请充分测试所有功能。