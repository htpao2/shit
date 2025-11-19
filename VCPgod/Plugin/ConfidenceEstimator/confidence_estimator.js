#!/usr/bin/env node
/**
 * ConfidenceEstimator - VCP Confidence Assessment Engine
 * 评估推理结果的置信度，识别不确定性来源
 */

// 配置
const CONFIG = {
    evaluationStrictness: process.env.EVALUATION_STRICTNESS || 'normal',
    minConfidenceThreshold: parseFloat(process.env.MIN_CONFIDENCE_THRESHOLD || '0.5'),
    enableDetailedAnalysis: process.env.ENABLE_DETAILED_ANALYSIS !== 'false'
};

// 严格程度权重
const STRICTNESS_WEIGHTS = {
    'lenient': 1.1,   // 宽松模式，提高评分
    'normal': 1.0,    // 标准模式
    'strict': 0.9     // 严格模式，降低评分
};

/**
 * 逻辑一致性检查器
 */
class LogicConsistencyChecker {
    check(reasoningResult) {
        const process = reasoningResult.reasoning_process || {};
        let score = 0.8; // 基础分数
        const issues = [];
        
        // 检查是否有推理过程
        if (!process || Object.keys(process).length === 0) {
            issues.push({
                type: 'missing_process',
                description: '缺少详细的推理过程',
                impact: 'medium'
            });
            score *= 0.7;
        }
        
        // 检查各推理模式的结论一致性
        const conclusions = [];
        for (const [mode, data] of Object.entries(process)) {
            if (data.conclusion) conclusions.push(data.conclusion);
            if (data.pattern) conclusions.push(data.pattern);
            if (data.transferred_solution) conclusions.push(data.transferred_solution);
        }
        
        // 如果有多个结论，检查它们是否冲突
        if (conclusions.length > 1) {
            const conflictDetected = this.detectConflicts(conclusions);
            if (conflictDetected) {
                issues.push({
                    type: 'conclusion_conflict',
                    description: '不同推理模式的结论存在冲突',
                    impact: 'high'
                });
                score *= 0.6;
            }
        }
        
        // 检查推理步骤的逻辑链
        for (const [mode, data] of Object.entries(process)) {
            if (data.steps && Array.isArray(data.steps)) {
                const stepIssues = this.checkStepsLogic(data.steps);
                issues.push(...stepIssues);
                if (stepIssues.length > 0) {
                    score *= Math.max(0.5, 1 - stepIssues.length * 0.1);
                }
            }
        }
        
        return {
            score: Math.max(0, Math.min(1, score)),
            issues: issues,
            details: `检测到${issues.length}个逻辑问题`
        };
    }
    
    detectConflicts(conclusions) {
        // 简单的冲突检测：查找否定词
        const negativePatterns = ['不', '否', '无', '没有', '不是', '不能', '不会'];
        const positiveCount = conclusions.filter(c => 
            !negativePatterns.some(p => c.includes(p))
        ).length;
        
        const negativeCount = conclusions.length - positiveCount;
        
        // 如果正面和负面结论都存在，可能有冲突
        return positiveCount > 0 && negativeCount > 0;
    }
    
    checkStepsLogic(steps) {
        const issues = [];
        
        for (let i = 0; i < steps.length - 1; i++) {
            const current = steps[i];
            const next = steps[i + 1];
            
            // 检查步骤之间的连贯性
            if (current.type === 'deductive' && next.type === 'deductive') {
                // 演绎推理步骤应该有逻辑递进
                if (!this.hasLogicalProgression(current, next)) {
                    issues.push({
                        type: 'logical_gap',
                        description: `步骤${i + 1}到${i + 2}之间缺少逻辑连接`,
                        impact: 'low'
                    });
                }
            }
        }
        
        return issues;
    }
    
    hasLogicalProgression(step1, step2) {
        // 简化的逻辑递进检查
        return true; // 默认认为有递进关系
    }
}

/**
 * 证据充分性评估器
 */
class EvidenceSufficiencyEvaluator {
    evaluate(reasoningResult) {
        const process = reasoningResult.reasoning_process || {};
        let score = 0.7; // 基础分数
        const issues = [];
        
        // 统计证据数量
        let evidenceCount = 0;
        
        // 从归纳推理中获取案例数
        if (process.inductive) {
            const cases = process.inductive.cases || [];
            evidenceCount += cases.length;
            
            if (cases.length < 2) {
                issues.push({
                    type: 'insufficient_cases',
                    description: '归纳推理的案例数量不足（少于2个）',
                    impact: 'medium'
                });
                score *= 0.7;
            } else if (cases.length >= 5) {
                score *= 1.1; // 案例充分，提高分数
            }
        }
        
        // 从演绎推理中获取前提数
        if (process.deductive) {
            const premises = process.deductive.premises || [];
            evidenceCount += premises.length;
            
            if (premises.length === 0) {
                issues.push({
                    type: 'missing_premises',
                    description: '演绎推理缺少明确的前提',
                    impact: 'high'
                });
                score *= 0.6;
            }
        }
        
        // 从类比推理中获取相似案例数
        if (process.analogical) {
            const similarCases = process.analogical.similar_cases || [];
            evidenceCount += similarCases.length;
            
            if (similarCases.length === 0) {
                issues.push({
                    type: 'no_analogies',
                    description: '类比推理未找到相似案例',
                    impact: 'medium'
                });
                score *= 0.8;
            }
        }
        
        // 根据总证据数量调整分数
        if (evidenceCount === 0) {
            score *= 0.5;
        } else if (evidenceCount >= 10) {
            score *= 1.15;
        }
        
        return {
            score: Math.max(0, Math.min(1, score)),
            issues: issues,
            evidence_count: evidenceCount,
            details: `共找到${evidenceCount}个证据/案例`
        };
    }
}

/**
 * 前提可靠性分析器
 */
class PremiseReliabilityAnalyzer {
    analyze(reasoningResult) {
        const process = reasoningResult.reasoning_process || {};
        let score = 0.75; // 基础分数
        const issues = [];
        
        // 检查知识库状态
        const kbStatus = process.knowledge_base_status || 
                        (process.deductive && process.deductive.knowledge_base_status);
        
        if (kbStatus) {
            if (!kbStatus.graph_loaded) {
                issues.push({
                    type: 'no_knowledge_base',
                    description: '未加载知识图谱，推理缺少知识支持',
                    impact: 'medium'
                });
                score *= 0.8;
            } else {
                // 知识库越丰富，前提越可靠
                const conceptsCount = kbStatus.concepts_count || 0;
                const rulesCount = kbStatus.rules_count || 0;
                
                if (conceptsCount > 500) score *= 1.05;
                if (rulesCount > 50) score *= 1.05;
                
                if (conceptsCount === 0 && rulesCount === 0) {
                    issues.push({
                        type: 'empty_knowledge_base',
                        description: '知识库为空，缺少可靠的前提基础',
                        impact: 'high'
                    });
                    score *= 0.6;
                }
            }
        }
        
        // 检查各推理模式的置信度
        for (const [mode, data] of Object.entries(process)) {
            if (typeof data === 'object' && data.confidence !== undefined) {
                if (data.confidence < 0.6) {
                    issues.push({
                        type: 'low_mode_confidence',
                        description: `${mode}推理的内部置信度过低（${(data.confidence * 100).toFixed(0)}%）`,
                        impact: 'medium'
                    });
                    score *= 0.9;
                }
            }
        }
        
        return {
            score: Math.max(0, Math.min(1, score)),
            issues: issues,
            details: `基于${issues.length}个可靠性问题评估`
        };
    }
}

/**
 * 结论合理性评估器
 */
class ConclusionRationalityEvaluator {
    evaluate(reasoningResult) {
        const answer = reasoningResult.answer || '';
        const query = reasoningResult.query || '';
        let score = 0.8; // 基础分数
        const issues = [];
        
        // 检查答案是否为空
        if (!answer || answer.trim().length === 0) {
            issues.push({
                type: 'empty_answer',
                description: '结论为空或缺失',
                impact: 'high'
            });
            return {
                score: 0.2,
                issues: issues,
                details: '未提供有效结论'
            };
        }
        
        // 检查答案长度的合理性
        if (answer.length < 10) {
            issues.push({
                type: 'too_brief',
                description: '结论过于简短，可能不够详细',
                impact: 'low'
            });
            score *= 0.95;
        }
        
        // 检查答案是否包含不确定性词汇
        const uncertainWords = ['可能', '也许', '大概', '似乎', '或许', '不确定', '不清楚'];
        const uncertainCount = uncertainWords.filter(word => answer.includes(word)).length;
        
        if (uncertainCount > 2) {
            issues.push({
                type: 'high_uncertainty',
                description: `答案包含较多不确定性词汇（${uncertainCount}个）`,
                impact: 'medium'
            });
            score *= 0.85;
        }
        
        // 检查答案是否直接回应了问题
        if (query && query.length > 0) {
            const queryKeywords = this.extractKeywords(query);
            const answerKeywords = this.extractKeywords(answer);
            
            const relevance = this.calculateRelevance(queryKeywords, answerKeywords);
            
            if (relevance < 0.3) {
                issues.push({
                    type: 'low_relevance',
                    description: '答案与问题的相关性较低',
                    impact: 'high'
                });
                score *= 0.7;
            }
        }
        
        return {
            score: Math.max(0, Math.min(1, score)),
            issues: issues,
            details: `结论长度${answer.length}字符，包含${uncertainCount}个不确定性词汇`
        };
    }
    
    extractKeywords(text) {
        // 简单的关键词提取
        const words = text.match(/[\u4e00-\u9fa5]{2,}|[a-zA-Z]{3,}/g) || [];
        return [...new Set(words)];
    }
    
    calculateRelevance(keywords1, keywords2) {
        if (keywords1.length === 0 || keywords2.length === 0) return 0;
        
        let matchCount = 0;
        for (const k1 of keywords1) {
            for (const k2 of keywords2) {
                if (k1.includes(k2) || k2.includes(k1)) {
                    matchCount++;
                }
            }
        }
        
        return matchCount / Math.max(keywords1.length, keywords2.length);
    }
}

/**
 * 综合置信度评估器
 */
class ComprehensiveConfidenceEstimator {
    constructor() {
        this.logicChecker = new LogicConsistencyChecker();
        this.evidenceEvaluator = new EvidenceSufficiencyEvaluator();
        this.premiseAnalyzer = new PremiseReliabilityAnalyzer();
        this.conclusionEvaluator = new ConclusionRationalityEvaluator();
    }
    
    estimate(reasoningResult, criteria = null, strictness = null) {
        // 使用配置的严格程度
        strictness = strictness || CONFIG.evaluationStrictness;
        const strictnessWeight = STRICTNESS_WEIGHTS[strictness] || 1.0;
        
        // 决定评估哪些维度
        const shouldEvaluate = {
            logic: !criteria || criteria.includes('logic'),
            evidence: !criteria || criteria.includes('evidence'),
            premise: !criteria || criteria.includes('premise'),
            conclusion: !criteria || criteria.includes('conclusion')
        };
        
        const dimensionScores = {};
        const allIssues = [];
        
        // 逻辑一致性
        if (shouldEvaluate.logic) {
            const logicResult = this.logicChecker.check(reasoningResult);
            dimensionScores.logic_consistency = logicResult.score * strictnessWeight;
            allIssues.push(...logicResult.issues);
        }
        
        // 证据充分性
        if (shouldEvaluate.evidence) {
            const evidenceResult = this.evidenceEvaluator.evaluate(reasoningResult);
            dimensionScores.evidence_sufficiency = evidenceResult.score * strictnessWeight;
            allIssues.push(...evidenceResult.issues);
        }
        
        // 前提可靠性
        if (shouldEvaluate.premise) {
            const premiseResult = this.premiseAnalyzer.analyze(reasoningResult);
            dimensionScores.premise_reliability = premiseResult.score * strictnessWeight;
            allIssues.push(...premiseResult.issues);
        }
        
        // 结论合理性
        if (shouldEvaluate.conclusion) {
            const conclusionResult = this.conclusionEvaluator.evaluate(reasoningResult);
            dimensionScores.conclusion_rationality = conclusionResult.score * strictnessWeight;
            allIssues.push(...conclusionResult.issues);
        }
        
        // 计算综合置信度（加权平均）
        const weights = {
            logic_consistency: 0.3,
            evidence_sufficiency: 0.25,
            premise_reliability: 0.25,
            conclusion_rationality: 0.2
        };
        
        let overallConfidence = 0;
        let totalWeight = 0;
        
        for (const [dimension, score] of Object.entries(dimensionScores)) {
            overallConfidence += score * weights[dimension];
            totalWeight += weights[dimension];
        }
        
        if (totalWeight > 0) {
            overallConfidence /= totalWeight;
        }
        
        // 如果原始结果中有置信度，可以综合考虑
        if (reasoningResult.confidence !== undefined) {
            overallConfidence = (overallConfidence + reasoningResult.confidence) / 2;
        }
        
        // 确保在0-1范围内
        overallConfidence = Math.max(0, Math.min(1, overallConfidence));
        
        // 分析不确定性来源
        const uncertaintySources = this.analyzeUncertaintySources(allIssues, dimensionScores);
        
        // 生成改进建议
        const improvementSuggestions = this.generateImprovementSuggestions(allIssues, dimensionScores);
        
        // 判定风险等级
        const riskLevel = this.determineRiskLevel(overallConfidence, uncertaintySources);
        
        // 质量等级
        const qualityGrade = this.assignQualityGrade(overallConfidence);
        
        return {
            overall_confidence: overallConfidence,
            dimension_scores: dimensionScores,
            uncertainty_sources: uncertaintySources,
            risk_level: riskLevel,
            improvement_suggestions: improvementSuggestions,
            quality_grade: qualityGrade,
            evaluation_details: {
                strictness: strictness,
                evaluated_dimensions: Object.keys(dimensionScores),
                total_issues: allIssues.length
            }
        };
    }
    
    analyzeUncertaintySources(issues, scores) {
        const sources = [];
        
        // 从问题中提取不确定性来源
        for (const issue of issues) {
            sources.push({
                type: issue.type,
                description: issue.description,
                impact: issue.impact,
                suggestion: this.getSuggestionForIssue(issue)
            });
        }
        
        // 从低分维度中识别不确定性
        for (const [dimension, score] of Object.entries(scores)) {
            if (score < 0.7) {
                sources.push({
                    type: 'low_dimension_score',
                    description: `${dimension}维度得分较低（${(score * 100).toFixed(0)}%）`,
                    impact: score < 0.5 ? 'high' : 'medium',
                    suggestion: this.getSuggestionForDimension(dimension)
                });
            }
        }
        
        return sources;
    }
    
    getSuggestionForIssue(issue) {
        const suggestions = {
            'missing_process': '提供详细的推理步骤和中间过程',
            'conclusion_conflict': '检查并解决不同推理模式之间的矛盾',
            'insufficient_cases': '收集更多相关案例以支持归纳推理',
            'missing_premises': '明确列出演绎推理的前提条件',
            'no_analogies': '寻找更多相似的案例进行类比',
            'no_knowledge_base': '加载或更新知识图谱以增强推理基础',
            'empty_answer': '提供明确的结论性陈述',
            'low_relevance': '确保答案直接回应原始问题'
        };
        
        return suggestions[issue.type] || '审查并改进此方面';
    }
    
    getSuggestionForDimension(dimension) {
        const suggestions = {
            'logic_consistency': '检查推理步骤之间的逻辑连贯性',
            'evidence_sufficiency': '收集更多证据和案例支持',
            'premise_reliability': '验证前提的可靠性和准确性',
            'conclusion_rationality': '确保结论合理且直接回应问题'
        };
        
        return suggestions[dimension] || '提升此维度的质量';
    }
    
    generateImprovementSuggestions(issues, scores) {
        const suggestions = [];
        
        // 基于问题优先级排序
        const highImpactIssues = issues.filter(i => i.impact === 'high');
        const mediumImpactIssues = issues.filter(i => i.impact === 'medium');
        
        if (highImpactIssues.length > 0) {
            suggestions.push(`优先解决${highImpactIssues.length}个高影响问题`);
        }
        
        if (mediumImpactIssues.length > 0) {
            suggestions.push(`关注${mediumImpactIssues.length}个中等影响问题`);
        }
        
        // 基于最低分维度
        const sortedDimensions = Object.entries(scores).sort((a, b) => a[1] - b[1]);
        if (sortedDimensions.length > 0) {
            const [lowestDim, lowestScore] = sortedDimensions[0];
            if (lowestScore < 0.7) {
                suggestions.push(`重点改进${lowestDim}（当前${(lowestScore * 100).toFixed(0)}%）`);
            }
        }
        
        return suggestions;
    }
    
    determineRiskLevel(confidence, uncertaintySources) {
        const highImpactCount = uncertaintySources.filter(s => s.impact === 'high').length;
        
        if (confidence >= 0.8 && highImpactCount === 0) {
            return 'low';
        } else if (confidence < 0.6 || highImpactCount >= 2) {
            return 'high';
        } else {
            return 'medium';
        }
    }
    
    assignQualityGrade(confidence) {
        if (confidence >= 0.9) return 'A';
        if (confidence >= 0.8) return 'B';
        if (confidence >= 0.7) return 'C';
        if (confidence >= 0.6) return 'D';
        return 'F';
    }
}

/**
 * 主函数
 */
async function main() {
    try {
        // 读取stdin
        let inputData = '';
        for await (const chunk of process.stdin) {
            inputData += chunk;
        }

        const args = JSON.parse(inputData.trim());

        // 验证必需参数
        if (!args.reasoning_result) {
            throw new Error('缺少必需参数: reasoning_result');
        }

        let reasoningResult = args.reasoning_result;
        
        // 如果是字符串，尝试解析
        if (typeof reasoningResult === 'string') {
            reasoningResult = JSON.parse(reasoningResult);
        }

        // 验证结果对象
        if (!reasoningResult.answer && !reasoningResult.result) {
            throw new Error('reasoning_result必须包含answer或result字段');
        }

        // 标准化字段名
        if (reasoningResult.result && !reasoningResult.answer) {
            reasoningResult.answer = reasoningResult.result;
        }

        // 获取评估标准和严格程度
        const criteria = args.evaluation_criteria;
        const strictness = args.strictness;

        // 创建评估器
        const estimator = new ComprehensiveConfidenceEstimator();

        // 执行评估
        const assessment = estimator.estimate(reasoningResult, criteria, strictness);

        // 构建输出
        const output = {
            status: 'success',
            result: assessment
        };

        console.log(JSON.stringify(output, null, 2));
        process.exit(0);

    } catch (error) {
        const errorOutput = {
            status: 'error',
            error: `置信度评估失败: ${error.message}`,
            stack: error.stack
        };
        console.log(JSON.stringify(errorOutput, null, 2));
        process.exit(1);
    }
}

// 运行主函数
main();