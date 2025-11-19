# ConfidenceEstimator - 置信度评估器

## 功能概述

ConfidenceEstimator 是一个同步插件，用于评估推理结果的可信度，从多个维度分析质量，识别不确定性来源，并提供具体的改进建议。

## 核心功能

### 1. 四维度评估体系

#### 逻辑一致性 (Logic Consistency)
- **目标**: 检查推理过程中的逻辑连贯性
- **评估内容**:
  - 推理步骤之间的逻辑关系
  - 不同推理模式结论的一致性
  - 前后论述的矛盾检测
- **评分公式**: `1 - (矛盾数 / 总步骤数)`

#### 证据充分性 (Evidence Sufficiency)
- **目标**: 评估支持结论的证据质量和数量
- **评估内容**:
  - 归纳推理的案例数量
  - 演绎推理的前提数量
  - 类比推理的相似案例数
- **加分项**: 证据数量 ≥ 10个

#### 前提可靠性 (Premise Reliability)
- **目标**: 分析推理前提的可信程度
- **评估内容**:
  - 知识图谱加载状态
  - 知识库的丰富程度
  - 各推理模式的内部置信度
- **加分项**: 概念数 > 500，规则数 > 50

#### 结论合理性 (Conclusion Rationality)
- **目标**: 判断最终结论的合理性
- **评估内容**:
  - 答案完整性和详细度
  - 不确定性词汇数量
  - 答案与问题的相关性
- **扣分项**: 答案过短、不确定词汇过多

### 2. 不确定性分析
- **来源识别**: 精确定位导致不确定性的因素
- **影响评估**: 标注每个问题的影响程度（low/medium/high）
- **建议生成**: 为每个问题提供具体的改进建议

### 3. 风险等级判定
- **Low**: 置信度 ≥ 0.8，无严重问题
- **Medium**: 置信度 0.6-0.8，存在一些问题
- **High**: 置信度 < 0.6，存在严重缺陷

### 4. 质量等级评定
- **A级** (0.9-1.0): 极高质量，可直接采纳
- **B级** (0.8-0.9): 高质量，基本可信
- **C级** (0.7-0.8): 中等质量，需要验证
- **D级** (0.6-0.7): 较低质量，谨慎使用
- **F级** (< 0.6): 低质量，不建议采纳

## 安装

无需额外依赖，使用Node.js内置模块。

```bash
cd Plugin/ConfidenceEstimator
# 检查Node.js版本
node --version  # 需要 >= 14.0.0
```

## 配置说明

编辑 `config.env` 文件：

```env
# 评估严格程度 (lenient/normal/strict)
EVALUATION_STRICTNESS=normal

# 最低置信度阈值
MIN_CONFIDENCE_THRESHOLD=0.5

# 是否启用详细分析
ENABLE_DETAILED_ANALYSIS=true
```

### 严格程度说明

- **lenient** (宽松): 评分 × 1.1，容忍度高
- **normal** (标准): 评分 × 1.0，平衡标准
- **strict** (严格): 评分 × 0.9，要求更高

## 使用方式

### 基础评估

```
<<<[TOOL_REQUEST]>>>
tool_name:「始」ConfidenceEstimator「末」,
reasoning_result:「始」{
  "answer": "应该使用间隔重复法提高记忆效率",
  "reasoning_process": {
    "deductive": {"conclusion": "...", "confidence": 0.9},
    "inductive": {"pattern": "...", "confidence": 0.8}
  },
  "confidence": 0.85
}「末」
<<<[END_TOOL_REQUEST]>>>
```

### 指定评估维度

```
<<<[TOOL_REQUEST]>>>
tool_name:「始」ConfidenceEstimator「末」,
reasoning_result:「始」{
  "answer": "该技术方案可行",
  "reasoning_process": {...}
}「末」,
evaluation_criteria:「始」["logic", "evidence"]「末」,
strictness:「始」strict「末」
<<<[END_TOOL_REQUEST]>>>
```

### 简单答案评估

```
<<<[TOOL_REQUEST]>>>
tool_name:「始」ConfidenceEstimator「末」,
reasoning_result:「始」{
  "answer": "明天可能会下雨",
  "query": "明天天气如何？"
}「末」
<<<[END_TOOL_REQUEST]>>>
```

## 参数说明

| 参数 | 类型 | 必需 | 默认值 | 说明 |
|------|------|------|--------|------|
| reasoning_result | object | 是 | - | 推理结果对象 |
| evaluation_criteria | array | 否 | 全部 | 评估维度选择 |
| strictness | string | 否 | 'normal' | 评估严格程度 |

### reasoning_result 结构

必需字段：
```json
{
  "answer": "推理得出的答案"  // 必需
}
```

推荐包含：
```json
{
  "answer": "推理答案",
  "query": "原始问题",
  "reasoning_process": {
    "deductive": {...},
    "inductive": {...},
    "analogical": {...}
  },
  "confidence": 0.85
}
```

### evaluation_criteria 选项

- `["logic"]`: 仅评估逻辑一致性
- `["evidence"]`: 仅评估证据充分性
- `["premise"]`: 仅评估前提可靠性
- `["conclusion"]`: 仅评估结论合理性
- 不指定或 `null`: 评估所有维度（推荐）

## 输出格式

```json
{
  "status": "success",
  "result": {
    "overall_confidence": 0.82,
    "dimension_scores": {
      "logic_consistency": 0.85,
      "evidence_sufficiency": 0.78,
      "premise_reliability": 0.83,
      "conclusion_rationality": 0.82
    },
    "uncertainty_sources": [
      {
        "type": "insufficient_cases",
        "description": "归纳推理的案例数量不足（少于2个）",
        "impact": "medium",
        "suggestion": "收集更多相关案例以支持归纳推理"
      },
      {
        "type": "low_dimension_score",
        "description": "evidence_sufficiency维度得分较低（78%）",
        "impact": "medium",
        "suggestion": "收集更多证据和案例支持"
      }
    ],
    "risk_level": "medium",
    "improvement_suggestions": [
      "关注2个中等影响问题",
      "重点改进evidence_sufficiency（当前78%）"
    ],
    "quality_grade": "B",
    "evaluation_details": {
      "strictness": "normal",
      "evaluated_dimensions": [
        "logic_consistency",
        "evidence_sufficiency",
        "premise_reliability",
        "conclusion_rationality"
      ],
      "total_issues": 2
    }
  }
}
```

## 评估逻辑详解

### 综合置信度计算

采用加权平均方法：

```
overall_confidence = 
    logic_consistency × 0.3 +
    evidence_sufficiency × 0.25 +
    premise_reliability × 0.25 +
    conclusion_rationality × 0.2
```

如果输入中已有置信度，则取平均：
```
final_confidence = (calculated_confidence + input_confidence) / 2
```

### 评分调整因子

**逻辑一致性**:
- 缺少推理过程: × 0.7
- 检测到结论冲突: × 0.6
- 存在逻辑缺口: × 0.9

**证据充分性**:
- 案例数 < 2: × 0.7
- 案例数 ≥ 5: × 1.1
- 缺少前提: × 0.6
- 证据总数 ≥ 10: × 1.15

**前提可靠性**:
- 未加载知识库: × 0.8
- 知识库为空: × 0.6
- 概念数 > 500: × 1.05
- 规则数 > 50: × 1.05
- 模式置信度 < 0.6: × 0.9

**结论合理性**:
- 答案为空: 固定0.2
- 答案过短: × 0.95
- 不确定词汇 > 2: × 0.85
- 问答相关性 < 0.3: × 0.7

## 与其他插件协同

### 典型工作流程

```
1. OmniscientReasoner 执行推理
   ↓
2. ConfidenceEstimator 评估置信度
   ↓
3. 如果置信度过低，识别问题
   ↓
4. ReasoningTracer 记录评估结果
   ↓
5. 根据建议优化推理策略
```

### 集成示例

```javascript
// 推理完成后评估
const reasoningResult = await omniscientReasoner.reason(query);

// 评估置信度
const assessment = await confidenceEstimator.estimate(reasoningResult);

// 如果置信度不足，给出警告
if (assessment.overall_confidence < 0.7) {
  console.warn('推理置信度较低:', assessment.quality_grade);
  console.warn('主要问题:', assessment.uncertainty_sources);
  console.warn('改进建议:', assessment.improvement_suggestions);
}

// 记录评估历史
await reasoningTracer.trace({
  ...reasoningResult,
  confidence_assessment: assessment
});
```

## 使用场景

### 1. 推理质量控制
在关键决策前评估推理可信度，避免采纳低质量结论。

### 2. 推理过程优化
识别推理弱点，针对性改进推理策略和证据收集。

### 3. 不确定性管理
明确标注不确定性来源，帮助用户理解结论的局限性。

### 4. 历史分析
结合ReasoningTracer，分析推理质量趋势，持续改进。

## 最佳实践

### 1. 完整输入
提供尽可能完整的推理结果，包括：
- 详细的推理过程
- 原始问题
- 各模式的中间结果

### 2. 合理选择严格程度
- 探索性分析: lenient
- 日常使用: normal  
- 关键决策: strict

### 3. 关注高影响问题
优先解决标记为 "high" 影响的不确定性来源。

### 4. 迭代改进
根据评估建议优化推理，然后重新评估验证效果。

### 5. 建立基线
记录典型问题的置信度水平，建立质量基准。

## 性能优化

### 1. 选择性评估
如只需特定维度，使用 `evaluation_criteria` 参数：
```javascript
{
  evaluation_criteria: ["logic", "conclusion"]  // 只评估这两个维度
}
```

### 2. 缓存结果
对相同或相似的推理结果，可缓存评估结果。

### 3. 批量评估
如需评估多个结果，考虑并行处理。

## 故障排查

### 问题：评估分数异常低
- 检查是否提供了完整的推理过程
- 验证strictness设置是否过于严格
- 确认reasoning_result格式正确

### 问题：无法识别不确定性
- 提供更详细的reasoning_process
- 检查各推理模式是否包含置信度信息
- 确保知识库状态信息完整

### 问题：JSON解析错误
- 确保reasoning_result是有效的JSON对象
- 检查特殊字符是否正确转义
- 验证必需字段（answer）存在

## 扩展开发

### 自定义评估维度

可以扩展评估器添加新的评估维度：

```javascript
class CustomDimensionEvaluator {
  evaluate(reasoningResult) {
    // 自定义评估逻辑
    return {
      score: 0.8,
      issues: [...],
      details: "..."
    };
  }
}

// 在ComprehensiveConfidenceEstimator中集成
```

### 调整权重

修改维度权重以适应特定场景：

```javascript
const weights = {
  logic_consistency: 0.4,      // 提高逻辑权重
  evidence_sufficiency: 0.3,
  premise_reliability: 0.2,
  conclusion_rationality: 0.1
};
```

## 版本历史

- v1.0.0 (2025-01-15): 初始版本
  - 四维度评估体系
  - 不确定性来源分析
  - 风险等级和质量评定
  - 改进建议生成
  - 支持自定义评估标准
  - 三种严格程度模式