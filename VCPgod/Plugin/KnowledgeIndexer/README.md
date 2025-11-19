# KnowledgeIndexer - 知识索引器

## 功能概述

KnowledgeIndexer 是一个静态插件，用于定期扫描所有记忆数据，构建概念关系图、规则库和模式库。它通过 `{{KnowledgeGraph}}` 占位符为AI提供结构化的知识上下文。

## 核心功能

### 1. 记忆扫描
- 递归扫描Memory目录中的所有Markdown文档
- 解析文档内容，提取关键信息
- 记录文档元数据（路径、大小、修改时间）

### 2. 概念提取
- 使用NLP分词（可选jieba）提取关键词
- 识别Markdown标题和加粗文本作为重要概念
- 统计概念出现频率和分布
- 过滤停用词和低频概念

### 3. 关系构建
- **共现关系**: 识别同一句话中出现的多个概念
- **因果关系**: 识别"因为...所以..."、"导致"等因果模式
- 记录关系上下文，便于理解

### 4. 规则识别
- 提取"如果...那么..."形式的规则
- 识别"当...时"的条件规则
- 为每条规则分配置信度

### 5. 模式识别
- 识别步骤序列模式（1. 2. 3. 或 一、二、三）
- 发现重复出现的句式结构

### 6. 知识图谱生成
- 构建节点（概念）和边（关系）的图结构
- 生成Mermaid可视化图表
- 保存为JSON格式便于查询

## 安装依赖

```bash
cd Plugin/KnowledgeIndexer
pip install -r requirements.txt
```

**可选依赖**:
- `jieba`: 中文分词，提高概念提取质量（推荐安装）

## 配置说明

编辑 `config.env` 文件：

```env
# 记忆数据存储路径
MEMORY_DATA_PATH=./Memory

# 索引输出路径
INDEX_OUTPUT_PATH=./KnowledgeIndex

# 最大索引概念数量
MAX_CONCEPTS=1000

# 概念最小出现频率（低于此值不索引）
MIN_CONCEPT_FREQUENCY=2

# 是否启用NLP分析
ENABLE_NLP=true
```

## 使用方式

### 自动定期执行（推荐）

插件配置为每60分钟自动执行一次，无需手动干预。执行后会自动更新系统提示词中的 `{{KnowledgeGraph}}` 占位符。

### 手动触发

AI可以手动调用以立即构建索引：

```
<<<[TOOL_REQUEST]>>>
tool_name:「始」KnowledgeIndexer「末」
<<<[END_TOOL_REQUEST]>>>
```

## 输出文件

索引构建完成后，会在 `KnowledgeIndex/` 目录下生成以下文件：

### 1. concept_graph.json
```json
{
  "nodes": [
    {
      "id": "推理",
      "label": "推理",
      "frequency": 45,
      "documents": ["2025/01/15-notes.md", ...]
    }
  ],
  "edges": [
    {
      "id": "e0",
      "source": "推理",
      "target": "逻辑",
      "type": "co-occurrence",
      "context": "推理需要严密的逻辑"
    }
  ],
  "metadata": {
    "total_concepts": 1523,
    "indexed_concepts": 856,
    "total_relationships": 2847,
    "total_documents": 342
  }
}
```

### 2. rules_database.json
```json
[
  {
    "type": "if-then",
    "condition": "需要提高记忆效率",
    "action": "应该使用间隔重复法",
    "confidence": 0.7
  }
]
```

### 3. pattern_library.json
```json
[
  {
    "type": "sequential-steps",
    "steps": ["分析需求", "设计方案", "实现代码", "测试验证"],
    "count": 4
  }
]
```

## 输出格式

插件返回的JSON结构：

```json
{
  "status": "success",
  "result": "# 知识索引摘要\n\n## 统计信息\n...",
  "metadata": {
    "conceptCount": 856,
    "relationCount": 2847,
    "documentCount": 342,
    "ruleCount": 123,
    "patternCount": 45,
    "files": {
      "graph_file": "KnowledgeIndex/concept_graph.json",
      "rules_file": "KnowledgeIndex/rules_database.json",
      "patterns_file": "KnowledgeIndex/pattern_library.json"
    }
  }
}
```

## 性能优化建议

1. **控制文档数量**: 如果Memory目录过大，考虑归档旧文档
2. **调整频率阈值**: 提高 `MIN_CONCEPT_FREQUENCY` 可减少索引的概念数量
3. **限制概念数量**: 调整 `MAX_CONCEPTS` 控制图谱规模
4. **禁用NLP**: 如果性能是瓶颈，可设置 `ENABLE_NLP=false` 使用简单提取

## 与其他插件协同

### 与 OmniscientReasoner 协同
- OmniscientReasoner 在执行推理时，会自动访问 `{{KnowledgeGraph}}` 占位符
- 知识图谱提供概念关系，增强推理的上下文理解

### 与 ReasoningTracer 协同
- 推理过程会被保存为新的记忆文档
- 下次索引更新时，这些推理历史会被纳入知识图谱

## 故障排查

### 问题：未找到任何文档
- 检查 `MEMORY_DATA_PATH` 配置是否正确
- 确保Memory目录中有 `.md` 文件

### 问题：概念提取质量差
- 安装并启用jieba: `pip install jieba` 和 `ENABLE_NLP=true`
- 调整 `MIN_CONCEPT_FREQUENCY` 过滤噪音

### 问题：索引构建时间过长
- 减少 `MAX_CONCEPTS` 数量
- 提高 `MIN_CONCEPT_FREQUENCY` 阈值
- 考虑清理或归档旧文档

## 版本历史

- v1.0.0 (2025-01-15): 初始版本
  - 基础的概念提取和关系构建
  - 支持规则和模式识别
  - 生成Mermaid可视化图表