#!/usr/bin/env node
/**
 * OmniscientReasoner - VCP Multi-Mode Reasoning Engine
 * 执行演绎、归纳、类比三种推理模式
 */

const fs = require('fs');
const path = require('path');

// 配置
const CONFIG = {
    reasoningModel: process.env.REASONING_MODEL || 'hybrid',
    maxDepth: parseInt(process.env.MAX_REASONING_DEPTH || '5'),
    knowledgeIndexPath: process.env.KNOWLEDGE_INDEX_PATH || './KnowledgeIndex',
    defaultConfidenceThreshold: parseFloat(process.env.DEFAULT_CONFIDENCE_THRESHOLD || '0.7')
};

/**
 * 演绎推理引擎
 * 从一般到特殊：大前提 + 小前提 => 结论
 */
class DeductiveEngine {
    constructor(knowledgeBase) {
        this.knowledgeBase = knowledgeBase;
    }

    /**
     * 执行演绎推理
     */
    async reason(query, depth = 3) {
        const steps = [];
        let confidence = 0.8;

        // 步骤1: 识别相关规则
        const relevantRules = this.findRelevantRules(query);
        steps.push({
            step: 1,
            type: 'rule_identification',
            description: '识别相关规则',
            rules: relevantRules,
            count: relevantRules.length
        });

        if (relevantRules.length === 0) {
            confidence *= 0.6;
        }

        // 步骤2: 应用逻辑推导
        const deductions = [];
        for (const rule of relevantRules.slice(0, 5)) {
            const deduction = this.applyRule(query, rule);
            if (deduction) {
                deductions.push(deduction);
            }
        }

        steps.push({
            step: 2,
            type: 'logical_deduction',
            description: '应用逻辑推导',
            deductions: deductions
        });

        // 步骤3: 验证结论
        const conclusion = this.synthesizeConclusion(query, deductions);
        steps.push({
            step: 3,
            type: 'conclusion_validation',
            description: '验证结论',
            conclusion: conclusion
        });

        // 计算最终置信度
        if (deductions.length > 0) {
            confidence *= (0.7 + Math.min(deductions.length, 5) * 0.06);
        } else {
            confidence *= 0.5;
        }

        return {
            mode: 'deductive',
            steps: steps,
            premises: relevantRules.map(r => r.condition),
            conclusion: conclusion,
            confidence: Math.min(confidence, 1.0),
            reasoning_chain: this.buildReasoningChain(relevantRules, deductions)
        };
    }

    findRelevantRules(query) {
        if (!this.knowledgeBase || !this.knowledgeBase.rules) {
            return [];
        }

        const queryLower = query.toLowerCase();
        return this.knowledgeBase.rules.filter(rule => {
            const condition = (rule.condition || '').toLowerCase();
            const action = (rule.action || '').toLowerCase();
            return condition.includes(queryLower.slice(0, 10)) ||
                   queryLower.includes(condition.slice(0, 10)) ||
                   action.includes(queryLower.slice(0, 10));
        });
    }

    applyRule(query, rule) {
        return {
            rule: rule,
            premise: rule.condition,
            conclusion: rule.action,
            confidence: rule.confidence || 0.7,
            applied: true
        };
    }

    synthesizeConclusion(query, deductions) {
        if (deductions.length === 0) {
            return `基于演绎推理，暂无充分规则支持该查询："${query}"`;
        }

        const topDeduction = deductions.sort((a, b) => b.confidence - a.confidence)[0];
        return `基于规则"${topDeduction.premise}"，可以推导出：${topDeduction.conclusion}`;
    }

    buildReasoningChain(rules, deductions) {
        const chain = [];
        for (const deduction of deductions) {
            chain.push(`IF ${deduction.premise} THEN ${deduction.conclusion}`);
        }
        return chain;
    }
}

/**
 * 归纳推理引擎
 * 从特殊到一般：案例1 + 案例2 + ... => 一般规律
 */
class InductiveEngine {
    constructor(knowledgeBase) {
        this.knowledgeBase = knowledgeBase;
    }

    async reason(query, depth = 3) {
        const steps = [];
        let confidence = 0.75;

        // 步骤1: 收集相关案例
        const cases = this.findRelatedCases(query);
        steps.push({
            step: 1,
            type: 'case_collection',
            description: '收集相关案例',
            cases: cases.slice(0, 10),
            count: cases.length
        });

        if (cases.length < 2) {
            confidence *= 0.5;
        }

        // 步骤2: 识别共同模式
        const patterns = this.identifyPatterns(cases);
        steps.push({
            step: 2,
            type: 'pattern_recognition',
            description: '识别共同模式',
            patterns: patterns
        });

        // 步骤3: 总结一般规律
        const generalRule = this.generalizeRule(query, patterns, cases);
        steps.push({
            step: 3,
            type: 'generalization',
            description: '总结一般规律',
            rule: generalRule
        });

        // 调整置信度
        if (cases.length >= 5) {
            confidence *= 1.1;
        }
        if (patterns.length > 0) {
            confidence *= 1.05;
        }

        return {
            mode: 'inductive',
            steps: steps,
            cases: cases.slice(0, 5),
            pattern: generalRule,
            confidence: Math.min(confidence, 1.0),
            sample_size: cases.length
        };
    }

    findRelatedCases(query) {
        const cases = [];
        
        if (!this.knowledgeBase || !this.knowledgeBase.graph) {
            return cases;
        }

        // 从知识图谱中提取案例
        const queryTerms = this.extractKeyTerms(query);
        
        for (const node of this.knowledgeBase.graph.nodes || []) {
            if (queryTerms.some(term => node.label.includes(term))) {
                cases.push({
                    concept: node.label,
                    frequency: node.frequency,
                    documents: node.documents || [],
                    relevance: this.calculateRelevance(query, node)
                });
            }
        }

        return cases.sort((a, b) => b.relevance - a.relevance);
    }

    extractKeyTerms(text) {
        // 简单的关键词提取
        const terms = text.match(/[\u4e00-\u9fa5]{2,}|[a-zA-Z]{3,}/g) || [];
        return [...new Set(terms)];
    }

    calculateRelevance(query, node) {
        const queryTerms = this.extractKeyTerms(query);
        let score = 0;
        
        for (const term of queryTerms) {
            if (node.label.includes(term)) {
                score += 1;
            }
        }
        
        return score * node.frequency;
    }

    identifyPatterns(cases) {
        if (!this.knowledgeBase || !this.knowledgeBase.patterns) {
            return [];
        }

        // 返回已识别的模式
        return this.knowledgeBase.patterns.slice(0, 5);
    }

    generalizeRule(query, patterns, cases) {
        if (cases.length === 0) {
            return `无法从案例中归纳出关于"${query}"的一般规律（样本不足）`;
        }

        const topConcepts = cases.slice(0, 3).map(c => c.concept);
        return `基于${cases.length}个案例的观察，涉及"${query}"的场景通常与以下概念相关：${topConcepts.join('、')}。这表明存在某种模式或规律。`;
    }
}

/**
 * 类比推理引擎
 * 基于相似性：源域 + 目标域 => 映射推断
 */
class AnalogicalEngine {
    constructor(knowledgeBase) {
        this.knowledgeBase = knowledgeBase;
    }

    async reason(query, depth = 3) {
        const steps = [];
        let confidence = 0.7;

        // 步骤1: 查找相似案例
        const similarCases = this.findSimilarCases(query);
        steps.push({
            step: 1,
            type: 'similarity_search',
            description: '查找相似场景',
            cases: similarCases.slice(0, 5),
            count: similarCases.length
        });

        if (similarCases.length === 0) {
            confidence *= 0.4;
        }

        // 步骤2: 映射关系结构
        const mappings = this.mapRelationships(query, similarCases);
        steps.push({
            step: 2,
            type: 'relationship_mapping',
            description: '映射关系结构',
            mappings: mappings
        });

        // 步骤3: 迁移解决方案
        const solution = this.transferSolution(query, similarCases, mappings);
        steps.push({
            step: 3,
            type: 'solution_transfer',
            description: '迁移解决方案',
            solution: solution
        });

        // 调整置信度
        if (similarCases.length > 0) {
            const avgSimilarity = similarCases.reduce((sum, c) => sum + c.similarity, 0) / similarCases.length;
            confidence *= (0.5 + avgSimilarity * 0.5);
        }

        return {
            mode: 'analogical',
            steps: steps,
            similar_cases: similarCases.slice(0, 3),
            mapping: mappings,
            confidence: Math.min(confidence, 1.0),
            transferred_solution: solution
        };
    }

    findSimilarCases(query) {
        const cases = [];
        
        if (!this.knowledgeBase || !this.knowledgeBase.graph) {
            return cases;
        }

        const queryTerms = this.extractKeyTerms(query);
        
        // 查找具有相似概念的案例
        for (const node of this.knowledgeBase.graph.nodes || []) {
            const similarity = this.calculateSimilarity(queryTerms, node);
            if (similarity > 0.3) {
                cases.push({
                    concept: node.label,
                    similarity: similarity,
                    frequency: node.frequency,
                    context: node.documents || []
                });
            }
        }

        return cases.sort((a, b) => b.similarity - a.similarity);
    }

    extractKeyTerms(text) {
        const terms = text.match(/[\u4e00-\u9fa5]{2,}|[a-zA-Z]{3,}/g) || [];
        return [...new Set(terms)];
    }

    calculateSimilarity(queryTerms, node) {
        let matchCount = 0;
        const nodeTerms = this.extractKeyTerms(node.label);
        
        for (const qTerm of queryTerms) {
            for (const nTerm of nodeTerms) {
                if (qTerm.includes(nTerm) || nTerm.includes(qTerm)) {
                    matchCount++;
                }
            }
        }
        
        return matchCount / Math.max(queryTerms.length, 1);
    }

    mapRelationships(query, cases) {
        const mappings = [];
        
        if (!this.knowledgeBase || !this.knowledgeBase.graph) {
            return mappings;
        }

        // 查找案例之间的关系
        for (const edge of this.knowledgeBase.graph.edges || []) {
            const sourceCase = cases.find(c => c.concept === edge.source);
            const targetCase = cases.find(c => c.concept === edge.target);
            
            if (sourceCase && targetCase) {
                mappings.push({
                    from: edge.source,
                    to: edge.target,
                    relationship: edge.type,
                    context: edge.context
                });
            }
        }

        return mappings.slice(0, 5);
    }

    transferSolution(query, cases, mappings) {
        if (cases.length === 0) {
            return `无法找到与"${query}"相似的案例进行类比推理`;
        }

        const topCase = cases[0];
        return `通过类比，"${query}"与"${topCase.concept}"具有${(topCase.similarity * 100).toFixed(0)}%的相似度。基于此相似性，可以借鉴相关经验和模式。`;
    }
}

/**
 * 混合推理协调器
 */
class HybridReasoner {
    constructor(knowledgeBase) {
        this.deductiveEngine = new DeductiveEngine(knowledgeBase);
        this.inductiveEngine = new InductiveEngine(knowledgeBase);
        this.analogicalEngine = new AnalogicalEngine(knowledgeBase);
    }

    async reason(query, depth, mode = 'all') {
        const results = {};

        if (mode === 'all' || mode === 'deductive') {
            results.deductive = await this.deductiveEngine.reason(query, depth);
        }

        if (mode === 'all' || mode === 'inductive') {
            results.inductive = await this.inductiveEngine.reason(query, depth);
        }

        if (mode === 'all' || mode === 'analogical') {
            results.analogical = await this.analogicalEngine.reason(query, depth);
        }

        return results;
    }

    synthesizeFinalAnswer(query, results) {
        const sections = [];
        let totalConfidence = 0;
        let count = 0;

        if (results.deductive) {
            sections.push(`**演绎推理结论** (置信度: ${(results.deductive.confidence * 100).toFixed(1)}%)\n${results.deductive.conclusion}`);
            totalConfidence += results.deductive.confidence;
            count++;
        }

        if (results.inductive) {
            sections.push(`**归纳推理结论** (置信度: ${(results.inductive.confidence * 100).toFixed(1)}%)\n${results.inductive.pattern}`);
            totalConfidence += results.inductive.confidence;
            count++;
        }

        if (results.analogical) {
            sections.push(`**类比推理结论** (置信度: ${(results.analogical.confidence * 100).toFixed(1)}%)\n${results.analogical.transferred_solution}`);
            totalConfidence += results.analogical.confidence;
            count++;
        }

        const avgConfidence = count > 0 ? totalConfidence / count : 0.5;

        return {
            answer: sections.join('\n\n'),
            confidence: avgConfidence
        };
    }
}

/**
 * 加载知识库
 */
function loadKnowledgeBase() {
    const graphPath = path.join(CONFIG.knowledgeIndexPath, 'concept_graph.json');
    const rulesPath = path.join(CONFIG.knowledgeIndexPath, 'rules_database.json');
    const patternsPath = path.join(CONFIG.knowledgeIndexPath, 'pattern_library.json');

    const knowledgeBase = {};

    try {
        if (fs.existsSync(graphPath)) {
            knowledgeBase.graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
        }
    } catch (e) {
        console.error('Failed to load knowledge graph:', e.message, { level: 'stderr' });
    }

    try {
        if (fs.existsSync(rulesPath)) {
            knowledgeBase.rules = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
        }
    } catch (e) {
        console.error('Failed to load rules:', e.message, { level: 'stderr' });
    }

    try {
        if (fs.existsSync(patternsPath)) {
            knowledgeBase.patterns = JSON.parse(fs.readFileSync(patternsPath, 'utf8'));
        }
    } catch (e) {
        console.error('Failed to load patterns:', e.message, { level: 'stderr' });
    }

    return knowledgeBase;
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
        if (!args.query) {
            throw new Error('缺少必需参数: query');
        }

        const query = args.query;
        const reasoningDepth = parseInt(args.reasoning_depth || CONFIG.maxDepth);
        const confidenceThreshold = parseFloat(args.confidence_threshold || CONFIG.defaultConfidenceThreshold);
        const reasoningMode = args.reasoning_mode || 'all';

        // 加载知识库
        const knowledgeBase = loadKnowledgeBase();

        // 创建推理器
        const reasoner = new HybridReasoner(knowledgeBase);

        // 执行推理
        const reasoningResults = await reasoner.reason(query, reasoningDepth, reasoningMode);

        // 综合答案
        const finalAnswer = reasoner.synthesizeFinalAnswer(query, reasoningResults);

        // 识别不确定性来源
        const uncertaintySources = [];
        for (const [mode, result] of Object.entries(reasoningResults)) {
            if (result.confidence < confidenceThreshold) {
                uncertaintySources.push({
                    mode: mode,
                    confidence: result.confidence,
                    reason: `${mode}推理的置信度 (${(result.confidence * 100).toFixed(1)}%) 低于阈值 (${(confidenceThreshold * 100).toFixed(1)}%)`
                });
            }
        }

        // 构建输出
        const output = {
            status: 'success',
            result: {
                query: query,
                answer: finalAnswer.answer,
                confidence: finalAnswer.confidence,
                reasoning_process: reasoningResults,
                uncertainty_sources: uncertaintySources,
                parameters: {
                    reasoning_depth: reasoningDepth,
                    confidence_threshold: confidenceThreshold,
                    reasoning_mode: reasoningMode
                },
                knowledge_base_status: {
                    graph_loaded: !!knowledgeBase.graph,
                    rules_count: (knowledgeBase.rules || []).length,
                    patterns_count: (knowledgeBase.patterns || []).length,
                    concepts_count: (knowledgeBase.graph?.nodes || []).length
                }
            }
        };

        console.log(JSON.stringify(output, null, 2));
        process.exit(0);

    } catch (error) {
        const errorOutput = {
            status: 'error',
            error: `推理执行失败: ${error.message}`,
            stack: error.stack
        };
        console.log(JSON.stringify(errorOutput, null, 2));
        process.exit(1);
    }
}

// 运行主函数
main();