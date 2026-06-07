# VCP 插件改造 — 续作计划

## 1. 当前进度概览

### 已完成（4/10 插件）

| 插件 | 阶段 | 类型 | 文件完整度 | 备注 |
|------|------|------|-----------|------|
| **GolutraCLIExecutor** | Phase 1 | async | manifest ✅ / 入口 ✅ / config.env ✅ / lib/ ✅ | Phase 1 核心，代码完整 |
| **GolutraTerminalManager** | Phase 1 | sync | manifest ✅ / 入口 ✅ / config.env ✅ / lib/ ❌ | 代码内联在入口文件中 |
| **GolutraContextAware** | Phase 2 | sync | manifest ✅ / 入口 ✅ / config.env ❌ / lib/ ❌ | 缺 config.env |
| **GolutraFileOps** | Phase 2 | sync | manifest ✅ / 入口 ✅ / config.env ❌ / lib/ ❌ | 缺 config.env |

### 未完成（6/10 插件）

| 插件 | 阶段 | 类型 | 源码映射 |
|------|------|------|---------|
| **GolutraProjectAnalyzer** | Phase 2 | sync | projectStore.ts:270-294 |
| **GolutraSettingsSimplified** | Phase 2 | sync | settingsStore.ts |
| **GolutraResultAggregator** | Phase 3 | sync | 新增功能 |
| **GolutraCodeQuality** | Phase 3 | async | 新增功能 |
| **GolutraBuildAutomation** | Phase 3 | async | 新增功能 |
| **GolutraChatSimplified** | Phase 3 | sync | chatStore.ts, chatBridge.ts |

---

## 2. 执行任务清单

### Task 0: 补全已有插件的缺失文件

- 为 `GolutraContextAware` 创建 `config.env`
- 为 `GolutraFileOps` 创建 `config.env`

### Task 1: GolutraProjectAnalyzer（Phase 2 同步插件）

**职责**: 分析项目结构、依赖关系和技术栈

**需要创建的文件**:
- `plugins/GolutraProjectAnalyzer/plugin-manifest.json`
- `plugins/GolutraProjectAnalyzer/config.env`
- `plugins/GolutraProjectAnalyzer/project-analyzer.js`

**核心 commands**:
- `analyzeDependencies` — 解析 package.json/Cargo.toml 等依赖文件
- `detectFramework` — 检测使用的框架和技术栈
- `generateProjectReport` — 生成项目综合分析报告

**源码参考**: `projectStore.ts:271-294` normalizeProjectData

### Task 2: GolutraSettingsSimplified（Phase 2 同步插件）

**职责**: 管理应用配置的读取、修改和持久化

**需要创建的文件**:
- `plugins/GolutraSettingsSimplified/plugin-manifest.json`
- `plugins/GolutraSettingsSimplified/config.env`
- `plugins/GolutraSettingsSimplified/settings-simplified.js`

**核心 commands**:
- `getSetting` — 读取配置项
- `setSetting` — 修改配置项
- `exportSettings` — 导出配置文件
- `importSettings` — 导入配置文件
- `resetSettings` — 恢复默认设置

**源码参考**: settingsStore.ts 的 normalizeSettings/persistSettings/normalizeCustomMember

### Task 3: GolutraResultAggregator（Phase 3 同步插件）

**职责**: 收集和整理多个任务的执行结果

**需要创建的文件**:
- `plugins/GolutraResultAggregator/plugin-manifest.json`
- `plugins/GolutraResultAggregator/config.env`
- `plugins/GolutraResultAggregator/result-aggregator.js`

**核心 commands**:
- `collectResults` — 收集多个异步任务结果
- `generateReport` — 生成聚合报告

### Task 4: GolutraCodeQuality（Phase 3 异步插件）

**职责**: 运行静态代码分析和质量检查

**需要创建的文件**:
- `plugins/GolutraCodeQuality/plugin-manifest.json`
- `plugins/GolutraCodeQuality/config.env`
- `plugins/GolutraCodeQuality/code-quality.js`

**核心 commands**:
- `runLinting` — 运行代码检查
- `analyzeComplexity` — 分析代码复杂度
- `generateQualityReport` — 生成质量报告

### Task 5: GolutraBuildAutomation（Phase 3 异步插件）

**职责**: 检测构建系统并执行自动化构建

**需要创建的文件**:
- `plugins/GolutraBuildAutomation/plugin-manifest.json`
- `plugins/GolutraBuildAutomation/config.env`
- `plugins/GolutraBuildAutomation/build-automation.js`

**核心 commands**:
- `detectBuildSystem` — 检测项目使用的构建系统
- `executeBuild` — 执行构建任务
- `getBuildStatus` — 获取构建状态

### Task 6: GolutraChatSimplified（Phase 3 同步插件）

**职责**: 简化的消息管理和历史记录查询

**需要创建的文件**:
- `plugins/GolutraChatSimplified/plugin-manifest.json`
- `plugins/GolutraChatSimplified/config.env`
- `plugins/GolutraChatSimplified/chat-simplified.js`

**核心 commands**:
- `sendMessage` — 发送消息
- `getHistory` — 获取对话历史
- `searchMessages` — 搜索历史消息
- `listConversations` — 列出所有对话

**源码参考**: chatStore.ts 的 normalizeConversation/normalizeMessage/sortConversations/sendMessage

---

## 3. 所有插件通用规范（编码时遵循）

每个插件必须遵循以下模式：

1. **stdin/stdout 通信** — 从 stdin 读 JSON，结果输出到 stdout
2. **批量调用** — 支持 command1/command2 模式
3. **鲁棒参数识别** — 处理参数同义词和大小写
4. **结构化日志** — 通过 stderr 输出 JSON 日志
5. **超栈追踪** — 文件操作类插件需支持 FILE_NOT_FOUND_LOCALLY
6. **异步插件** — 需实现两阶段执行 + HTTP 回调 + webSocketPush 配置
