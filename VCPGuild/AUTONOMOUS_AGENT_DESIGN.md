# VCP 自主Agent系统设计文档

## 概述

本文档描述了VCP系统中实现Agent自主性的架构设计。该系统采用"冒险者公会"模式，允许Agent自主发布、接取、执行和完成任务，从而实现真正的AI自主性。

**重要特性**：本系统完全基于VCP插件架构实现，无需修改 `server.js`，通过 `hybridservice` 插件的 `initialize()` 方法自动启动后台调度任务。

## 核心理念

### 冒险者公会模型

想象一个RPG游戏中的冒险者公会：
- **任务板**：公会大厅里有一块任务板，上面贴满了各种委托
- **冒险者**：不同专长的冒险者（Agent）根据自己的能力选择任务
- **接取与完成**：冒险者接取任务后独立或组队完成，然后提交验收
- **奖励与声誉**：完成任务获得奖励，积累声誉

### 与现有系统的区别

| 特性 | 传统VCP | 自主Agent系统 |
|------|---------|---------------|
| 触发方式 | 用户发起请求 | 定时自动触发 + 用户请求 |
| 任务来源 | 用户指令 | 任务板 (Agent可发布) |
| 执行者选择 | 固定模型 | 智能匹配最合适的Agent |
| 协作模式 | 单Agent | 支持多Agent组队 |
| 状态管理 | 无状态 | 完整任务生命周期 |

## 系统架构

```
                                    ┌─────────────────────────────────────┐
                                    │          VCP Server (server.js)      │
                                    │          (无需修改)                   │
                                    └─────────────────────────────────────┘
                                                      │
                                                      │ PluginManager加载
                                                      ▼
                     ┌────────────────────────────────┼────────────────────────────────┐
                     │                                │                                │
                     ▼                                ▼                                ▼
        ┌─────────────────────┐          ┌─────────────────────┐          ┌─────────────────────┐
        │   TaskBoardPlugin    │          │AutonomousScheduler  │          │   AgentAssistant    │
        │   (同步插件/stdio)    │          │     Plugin           │          │  (混合服务/direct)   │
        │                      │          │ (混合服务/direct)    │          │                      │
        └─────────────────────┘          └─────────────────────┘          └─────────────────────┘
                     │                                │                                │
                     │                                │ initialize()时                 │
                     │                                │ 启动定时器                      │
                     ▼                                │                                ▼
        ┌─────────────────────┐                       │                   ┌─────────────────────┐
        │   data/tasks.json    │◀──── 读取任务 ────────┘                   │   小娜、小克、小吉... │
        │   (任务数据存储)      │                                          │   (各专长Agent)       │
        └─────────────────────┘                                           └─────────────────────┘
```

## 组件详解

### 1. TaskBoardPlugin (任务板插件)

**类型**: 同步插件 (pluginType: "synchronous")  
**协议**: stdio  
**位置**: `Plugin/TaskBoardPlugin/`

#### 功能

| 命令 | 描述 |
|------|------|
| `ListTasks` | 列出任务，支持按状态和技能过滤 |
| `GetTask` | 获取任务详情 |
| `PostTask` | 发布新任务 |
| `AcceptTask` | 接取任务 |
| `JoinTask` | 加入任务团队协作 |
| `UpdateProgress` | 更新任务进度 |
| `SubmitTask` | 提交任务成果 |
| `CompleteTask` | 验收完成任务 |
| `FailTask` | 标记任务失败 |
| `AbandonTask` | 放弃任务 |

#### 任务生命周期

```
     发布                接取               提交              验收
  ┌────────┐         ┌────────┐         ┌────────┐         ┌────────┐
  │  OPEN  │ ──────▶ │IN_PROG │ ──────▶ │SUBMITTED│ ──────▶ │COMPLETED│
  └────────┘         └────────┘         └────────┘         └────────┘
       ▲                  │                  │
       │                  │                  │
       │     放弃/失败    │      驳回        │
       └──────────────────┴──────────────────┘
```

#### 任务数据结构

```json
{
  "task-1732521600000-abc12345": {
    "id": "task-1732521600000-abc12345",
    "title": "开发天气查询API",
    "description": "创建一个Node.js模块...",
    "required_skills": ["programming", "nodejs", "api"],
    "priority": "medium",
    "status": "open",
    "posted_by": "小娜",
    "created_at": "2024-11-25T10:00:00.000Z",
    "assignee": null,
    "team": [],
    "progress": 0,
    "history": [...]
  }
}
```

#### 调用示例

```
<<<[TOOL_REQUEST]>>>
maid:「始」小娜「末」,
tool_name:「始」TaskBoardPlugin「末」,
command:「始」PostTask「末」,
title:「始」优化VCP日志系统「末」,
description:「始」重构VCPLog插件，增加日志级别过滤和归档功能「末」,
required_skills:「始」["programming", "nodejs", "logging"]「末」,
priority:「始」high「末」
<<<[END_TOOL_REQUEST]>>>
```

### 2. AutonomousSchedulerPlugin (自主调度器插件)

**类型**: 混合服务插件 (pluginType: "hybridservice")  
**协议**: direct  
**位置**: `Plugin/AutonomousSchedulerPlugin/`

#### 特点

- **无需修改server.js**：作为 hybridservice 插件，在 `initialize()` 时自动启动后台定时器
- **自动调度**：定期检查任务板，匹配合适的Agent执行任务
- **手动触发**：也可通过工具调用手动触发检查

#### 命令

| 命令 | 描述 |
|------|------|
| `CheckTaskBoard` | 手动触发任务板检查 |
| `GetSchedulerStatus` | 获取调度器状态 |
| `SetSchedulerEnabled` | 启用/禁用自动调度 |

#### 工作流程

```
1. PluginManager 加载插件
          │
          ▼
2. initialize() 被调用
          │
          ▼
3. 启动后台定时器 (setInterval)
          │
          ▼
4. 定时触发 (默认每5分钟)
          │
          ▼
5. 调用 TaskBoardPlugin.ListTasks
          │
     ┌────┴────┐
     │         │
     ▼         ▼
  有任务      无任务
     │         │
     ▼         ▼
 6a. 技能匹配   6b. 随机决定
     │             是否例行检查
     ▼             (20%概率)
 7. 选择最合适      │
    的Agent         │
     │              │
     └──────┬───────┘
            ▼
 8. 通过AgentAssistant唤醒Agent
            │
            ▼
 9. Agent自主执行任务
```

#### 技能匹配规则

技能配置支持两种方式（动态加载，无需硬编码）：

**方式1：在 AutonomousSchedulerPlugin 的 config.env 中直接配置**

```env
# 格式: AGENT_SKILLS_{Agent名称}=skill1,skill2,skill3
AGENT_SKILLS_小娜=management,philosophy,knowledge,general,planning
AGENT_SKILLS_小克=science,programming,data,math,analysis
AGENT_SKILLS_ResearchBot=research,analysis,data,information
```

**方式2：自动从 AgentAssistant 的 config.env 解析**

如果没有手动配置技能，调度器会自动读取 AgentAssistant 的配置文件，从每个 Agent 的 `DESCRIPTION` 字段中提取技能关键词。

支持的技能关键词包括：
- 编程类: programming, code, algorithm, debug, development
- 研究类: research, analysis, data, information, synthesis
- 创意类: creative, writing, story, character, plot
- 设计类: design, art, visual, ui, illustration, graphics
- AI类: ai, prompts, models, machine-learning
- 通用类: general, assistant, help

匹配算法：
1. 提取任务的 `required_skills`
2. 遍历每个Agent的技能列表（动态加载）
3. 计算技能匹配度（模糊匹配）
4. 选择匹配度最高的Agent
5. 没有匹配时使用配置的 `DEFAULT_AGENT_NAME`

### 3. AgentAssistant (Agent协作插件)

**类型**: 混合服务插件 (pluginType: "hybridservice")  
**协议**: direct  
**位置**: `Plugin/AgentAssistant/`

该插件是VCP系统中已有的组件，负责：
- 管理多个专属Agent
- 维护Agent对话上下文
- 支持即时通讯和定时通讯
- 与VCP Server进行API交互

## 配置说明

### 插件配置

在 `Plugin/AutonomousSchedulerPlugin/config.env` 中配置：

```env
# 是否启用自动调度器
AUTONOMOUS_SCHEDULER_ENABLED=true

# 检查间隔（分钟）
AUTONOMOUS_SCHEDULE_INTERVAL_MINUTES=5

# 空闲时例行检查概率 (0.0-1.0)
AUTONOMOUS_IDLE_PROBABILITY=0.2

# 默认Agent（当没有匹配到技能时使用）
DEFAULT_AGENT_NAME=小娜

# Agent技能配置（可选，如不配置则自动从AgentAssistant解析）
# 格式: AGENT_SKILLS_{Agent名称}=skill1,skill2,skill3
AGENT_SKILLS_小娜=management,philosophy,knowledge,general,planning
AGENT_SKILLS_小克=science,programming,data,math,analysis
# 如果使用通用版AgentAssistant:
# AGENT_SKILLS_ResearchBot=research,analysis,data,information
# AGENT_SKILLS_编程小能手=programming,code,debug,algorithm
```

## 使用场景

### 场景1：自动化开发任务

1. **用户**通过Agent发布任务："开发一个天气查询API"
2. **调度器**检测到新任务，匹配技能 `programming` → 选择**小克**
3. **小克**被唤醒，接取任务，使用 FileOperator 创建代码文件
4. **小克**使用 PowerShellExecutor 运行测试
5. **小克**提交任务成果
6. **小娜**（管理员）验收任务

### 场景2：自动化学习

1. **小娜**（管理员）在例行检查中发现知识库有新论文
2. **小娜**发布任务："分析并总结最新的AI安全研究论文"
3. **调度器**匹配 → **小绝**接取
4. **小绝**使用 WebReadFile 获取论文内容
5. **小绝**分析并总结，更新知识库
6. 知识库得到更新，其他Agent也可使用

### 场景3：多Agent协作

1. **用户**发布任务："设计并实现VCP的新UI"
2. **小芸**（设计师）接取任务
3. **小克**（开发）通过 JoinTask 加入团队
4. **小芸**使用设计工具创建UI草图
5. **小克**根据草图编写前端代码
6. 两人协作完成，**小芸**提交任务

## 与其他工具的集成

自主Agent系统可以充分利用VCP现有的插件生态：

| 工具 | 用途 |
|------|------|
| `FileOperator` | 读写代码文件、配置文件 |
| `PowerShellExecutor` | 执行系统命令、运行脚本 |
| `WebReadFile` | 获取网络资源、学习新知识 |
| `SciCalculator` | 数学计算 |
| `TavilySearch` | 网络搜索 |
| `DailyNoteManager` | 管理日记/笔记 |
| `VCPLog` | 推送通知 |

## 安全考虑

1. **权限控制**：敏感操作（如 PowerShellExecutor）需要验证码
2. **任务上限**：每个Agent同时最多接取3个任务
3. **超时机制**：任务超过24小时未完成自动释放
4. **失败重试**：任务失败后回到任务池，可被其他Agent接取

## 未来扩展

1. **任务优先级队列**：紧急任务优先处理
2. **Agent声誉系统**：根据完成质量累积声誉
3. **任务依赖关系**：支持任务前置条件
4. **资源竞争处理**：多Agent同时操作文件时的冲突解决
5. **学习反馈循环**：根据任务结果自动调优技能匹配

## 文件清单

```
VCPToolBox/
├── Plugin/
│   ├── TaskBoardPlugin/
│   │   ├── plugin-manifest.json      # 插件配置
│   │   ├── TaskBoardPlugin.js        # 主脚本 (stdio协议)
│   │   └── data/
│   │       └── tasks.json            # 任务数据存储
│   └── AutonomousSchedulerPlugin/
│       ├── plugin-manifest.json      # 插件配置
│       ├── AutonomousSchedulerPlugin.js  # 主脚本 (direct协议)
│       └── config.env.example        # 配置示例
└── AUTONOMOUS_AGENT_DESIGN.md        # 本文档
```

## 快速开始

1. **配置调度器**：复制 `Plugin/AutonomousSchedulerPlugin/config.env.example` 为 `config.env`
2. **启用调度器**：设置 `AUTONOMOUS_SCHEDULER_ENABLED=true`
3. **重启VCP**：`node server.js`（插件会自动加载并启动）
4. **发布任务**：通过Agent调用 TaskBoardPlugin 的 PostTask 命令
5. **观察日志**：调度器会每5分钟检查一次并唤醒Agent

## API参考

### TaskBoardPlugin 调用格式

```
<<<[TOOL_REQUEST]>>>
maid:「始」调用者名称「末」,
tool_name:「始」TaskBoardPlugin「末」,
command:「始」命令名称「末」,
参数1:「始」值1「末」,
参数2:「始」值2「末」
<<<[END_TOOL_REQUEST]>>>
```

### AutonomousSchedulerPlugin 调用格式

```
<<<[TOOL_REQUEST]>>>
maid:「始」调用者名称「末」,
tool_name:「始」AutonomousSchedulerPlugin「末」,
command:「始」CheckTaskBoard「末」
<<<[END_TOOL_REQUEST]>>>
```

详细参数请参考各插件目录下的 `plugin-manifest.json` 中的 `invocationCommands`。

## 技术实现说明

### 为什么使用 hybridservice 插件而非 routes 模块？

1. **无需修改 server.js**：VCP 的核心原则是通过插件扩展功能，而非修改核心代码
2. **自动生命周期管理**：PluginManager 会自动调用 `initialize()` 和 `shutdown()`
3. **统一的插件管理**：所有组件通过相同的机制加载、配置和管理
4. **热插拔能力**：可以动态启用/禁用调度器，无需重启服务

### hybridservice 插件的特点

- `pluginType: "hybridservice"` + `protocol: "direct"`
- 可以在 `initialize()` 中启动后台任务（如定时器）
- 可以通过 `processToolCall()` 响应外部调用
- 可以访问其他插件（通过 PluginManager）
