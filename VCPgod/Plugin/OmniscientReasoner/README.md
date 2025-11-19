# OmniscientReasoner - 全知推理器

## 功能概述

OmniscientReasoner 是一个同步插件，结合知识图谱执行三种推理模式（演绎、归纳、类比），为复杂问题提供多角度的推理分析和答案。

## 三种推理模式

### 1. 演绎推理 (Deductive Reasoning)
**从一般到特殊**

- **逻辑形式**: 大前提 + 小前提 => 结论
- **示例**: 
  - 大前提: 所有哺乳动物都是温血动物
  - 小前提: 狗是哺乳动物
  - 结论: 因此，狗是温血动物

- **应用场景**: 
  - 基于已知规则推导新结论
  - 验证假设的逻辑有效性
  - 从理论推导实践

### 2. 归纳推理 (Inductive Reasoning)
**从特殊到一般**

- **逻辑形式**: 案例1 + 案例2 + 案例N => 一般规律
- **示例**:
  - 观察: 太阳今天升起了
  - 观察: 太阳昨天也升起了
  - 观察: 历史记录显示太阳每天都升起
  - 结论: 太阳明天也会升起

- **应用场景**:
  - 从经验中总结规律
  - 发现数据中的模式
  - 预测未来趋势

### 3. 类比推理 (Analogical Reasoning)
**基于相似性**

- **逻辑形式**: A与B相似 + A有特性X => B可能也有特性X
- **示例**:
  - 源域: 地球有水和生命
  - 目标域: 火星与地球在某些方面相似
  - 推论: 火星可能曾有水和生命

- **应用场景**:
  - 解决新问题时借鉴类似案例
  - 创新思维和迁移学习
  - 跨领域知识应用

## 核心功能

### 1. 多模式推理
- 可选择单一推理模式或组合使用
- 每种模式独立分析并给出置信度
- 综合多个角度得出最终结论

### 2. 知识图谱集成
- 自动加载 `{{KnowledgeGraph}}` 提供的知识库
- 利用概念关系图增强推理
- 基于规则库进行演绎推理
- 使用模式库辅助归纳推理

### 3. 置信度评估
- 每个推理步骤都有置信度标注
- 综合评估最终结论的可靠性
- 识别不确定性来源

### 4. 推理过程追踪
- 详细记录每个推理步骤
- 展示推理链和中间结果
- 便于理解和审查推理过程

## 安装

无需额外依赖，使用Node.js内置模块。

```bash
cd Plugin/OmniscientReasoner
# 检查Node.js版本
node --version  # 需要 >= 14.0.0
```

## 配置说明

编辑 `config.env` 文件：

```env
# 推理模型选择 (deductive/inductive/analogical/hybrid)
REASONING_MODEL=hybrid

# 最大推理深度 (1-10)
MAX_REASONING_DEPTH=5

# 知识索引路径
KNOWLEDGE_INDEX_PATH=./KnowledgeIndex

# 默认置信度阈值 (0-1)
DEFAULT_CONFIDENCE_THRESHOLD=0.7
```

## 使用方式

### 基础调用
```
<<<[TOOL_REQUEST]>>>
tool_name:「始」OmniscientReasoner「末」,
query:「始」如何提高记忆效率？「末」
<<<[END_TOOL_REQUEST]>>>
```

### 指定推理模式
```
<<<[TOOL_REQUEST]>>>
tool_name:「始」OmniscientReasoner「末」,
query:「始」基于过往经验，明天的工作重点是什么？「末」,
reasoning_mode:「始」inductive「末」,
reasoning_depth:「始」7「末」
<<<[END_TOOL_REQUEST]>>>
```

### 高置信度推理
```
<<<[TOOL_REQUEST]>>>
tool_name:「始」OmniscientReasoner「末」,
query:「始」这个技术方案是否可行？「末」,
confidence_threshold:「始」0.85「末」,
reasoning_mode:「始」all「末」
<<<[END_TOOL_REQUEST]>>>
```

## 参数说明

| 参数 | 类型 | 必需 | 默认值 | 说明 |
|------|------|------|--------|------|
| query | string | 是 | - | 需要推理的问题或命题 |
| reasoning_depth | integer | 否 | 5 | 推理深度 (1-10) |
| confidence_threshold | float | 否 | 0.7 | 置信度阈值 (0-1) |
| reasoning_mode | string | 否 | 'all' | 推理模式选择 |

### reasoning_mode 选项
- `'deductive'`: 仅演绎推理
- `'inductive'`: 仅归纳推理
- `'analogical'`: 仅类比推理
- `'all'`: 所有模式（推荐）

## 输出格式

```json
{
  "status": "success",
  "result": {
    "query": "如何提高记忆效率？",
    "answer": "综合三种推理模式的分析结果...",
    "confidence": 0.82,
    "reasoning_process": {
      "deductive": {
        "mode": "deductive",
        "steps": [...],
        "premises": [...],
        "conclusion": "...",
        "confidence": 0.85
      },
      "inductive": {
        "mode": "inductive",
        "steps": [...],
        "cases": [...],
        "pattern": "...",
        "confidence": 0.78
      },
      "analogical": {
        "mode": "analogical",
        "steps": [...],
        "similar_cases": [...],
        "transferred_solution": "...",
        "confidence": 0.83
      }
    },
    "uncertainty_sources": [
      {
        "mode": "inductive",
        "confidence": 0.78,
        "reason": "归纳推理的置信度低于阈值"
      }
    ],
    "knowledge_base_status": {
      "graph_loaded": true,
      "rules_count": 123,
      "patterns_count": 45,
      "concepts_count": 856
    }
  }
}
```

## 推理深度说明

推理深度影响分析的详细程度：

- **1-3**: 快速推理，给出简要结论
- **4-6**: 标准推理，平衡深度和速度（推荐）
- **7-10**: 深度推理，详尽分析但耗时较长

## 与其他插件协同

### 与 KnowledgeIndexer 协同
- 自动加载知识图谱数据
- 利用概念关系增强推理上下文
- 基于规则库和模式库进行推理

### 与 ReasoningTracer 协同
- 推理过程可以被追踪记录
- 保存推理历史到日记系统
- 便于回顾和学习

### 与 ConfidenceEstimator 协同
- 推理结果会被自动评估置信度
- 识别不确定性来源
- 提供改进建议

## 最佳实践

### 1. 选择合适的推理模式
- **已知规则场景**: 使用演绎推理
- **经验总结场景**: 使用归纳推理
- **新问题求解**: 使用类比推理
- **复杂问题**: 使用全部模式

### 2. 调整推理深度
- 简单问题使用较浅深度（3-4）
- 复杂问题使用中等深度（5-6）
- 关键决策使用深度推理（7-8）

### 3. 设置置信度阈值
- 一般性问题: 0.6-0.7
- 重要决策: 0.8-0.9
- 探索性分析: 0.5-0.6

### 4. 充分利用知识图谱
- 确保 KnowledgeIndexer 定期更新
- 丰富的记忆数据提供更好的推理基础
- 高质量的规则库提升演绎推理效果

## 性能优化

1. **知识库优化**
   - 定期清理无用数据
   - 保持规则库和模式库的质量

2. **参数调优**
   - 根据实际需求调整深度
   - 避免不必要的全模式推理

3. **缓存机制**
   - 相似问题会利用已有推理结果
   - 知识库加载使用缓存

## 故障排查

### 问题：推理结果置信度过低
- 检查知识图谱是否已更新
- 增加相关记忆数据
- 降低置信度阈值

### 问题：推理速度慢
- 减少推理深度
- 使用单一推理模式而非'all'
- 优化知识库规模

### 问题：无法加载知识库
- 确认 KNOWLEDGE_INDEX_PATH 配置正确
- 确保 KnowledgeIndexer 已执行
- 检查文件权限

## 版本历史

- v1.0.0 (2025-01-15): 初始版本
  - 实现三种推理引擎
  - 知识图谱集成
  - 置信度评估
  - 详细推理过程追踪