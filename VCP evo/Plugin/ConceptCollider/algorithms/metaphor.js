/**
 * Metaphor Collision Algorithm
 * 隐喻模式：寻找两个概念之间的深层相似性
 */

const natural = require('natural');
const compromise = require('compromise');

/**
 * 生成隐喻模式的洞见
 */
async function generate(conceptA, conceptB, conceptPool) {
    const insights = [];

    // 1. 提取概念的核心特征
    const featuresA = extractFeatures(conceptA);
    const featuresB = extractFeatures(conceptB);

    // 2. 寻找结构性相似
    const structuralSimilarities = findStructuralSimilarities(featuresA, featuresB);

    // 3. 为每个相似性生成洞见
    for (const similarity of structuralSimilarities) {
        const insight = {
            title: generateMetaphorTitle(similarity, conceptA, conceptB),
            description: generateMetaphorDescription(similarity, conceptA, conceptB),
            novelty_score: calculateNoveltyScore(similarity),
            feasibility_score: calculateFeasibilityScore(similarity, 'metaphor')
        };
        insights.push(insight);
    }

    // 4. 如果没有找到足够的相似性，生成通用隐喻
    if (insights.length < 3) {
        insights.push(...generateGenericMetaphors(conceptA, conceptB));
    }

    return insights;
}

/**
 * 提取概念的核心特征
 */
function extractFeatures(concept) {
    const doc = compromise(concept);

    return {
        name: concept,
        nouns: doc.nouns().out('array'),
        verbs: doc.verbs().out('array'),
        adjectives: doc.adjectives().out('array'),
        // 模拟的语义特征
        properties: inferProperties(concept)
    };
}

/**
 * 推断概念的属性
 */
function inferProperties(concept) {
    const properties = [];
    const lowerConcept = concept.toLowerCase();

    // 基于关键词的简单推断
    const keywords = {
        dynamic: ['运动', '变化', '流动', '演化'],
        static: ['结构', '稳定', '固定', '不变'],
        complex: ['系统', '网络', '复杂', '多层'],
        simple: ['简单', '基础', '单一', '纯粹']
    };

    for (const [prop, words] of Object.entries(keywords)) {
        if (words.some(word => lowerConcept.includes(word))) {
            properties.push(prop);
        }
    }

    return properties;
}

/**
 * 寻找结构性相似
 */
function findStructuralSimilarities(featuresA, featuresB) {
    const similarities = [];

    // 检查共同属性
    const commonProperties = featuresA.properties.filter(
        prop => featuresB.properties.includes(prop)
    );

    for (const prop of commonProperties) {
        similarities.push({
            type: 'property',
            property: prop,
            strength: 0.7
        });
    }

    // 检查功能性相似（通过动词）
    if (featuresA.verbs.length > 0 && featuresB.verbs.length > 0) {
        similarities.push({
            type: 'function',
            strength: 0.6
        });
    }

    return similarities;
}

/**
 * 生成隐喻标题
 */
function generateMetaphorTitle(similarity, conceptA, conceptB) {
    const templates = [
        `${conceptA}的"${similarity.property || '本质'}"映射`,
        `从${conceptA}看${conceptB}`,
        `${conceptB}中的${conceptA}现象`,
        `跨界理解：${conceptA} ≈ ${conceptB}`
    ];

    return templates[Math.floor(Math.random() * templates.length)];
}

/**
 * 生成隐喻描述
 */
function generateMetaphorDescription(similarity, conceptA, conceptB) {
    if (similarity.type === 'property') {
        return `${conceptA}和${conceptB}都表现出"${similarity.property}"的特性。` +
            `我们可以将${conceptA}的运作方式作为理解${conceptB}的隐喻框架。` +
            `这种映射揭示了两者在深层结构上的相似性。`;
    } else if (similarity.type === 'function') {
        return `${conceptA}的功能性特征可以类比到${conceptB}的运作模式。` +
            `通过这种隐喻，我们能够从新的角度理解${conceptB}的核心机制。`;
    }

    return `${conceptA}与${conceptB}存在深层的结构性相似。` +
        `这种隐喻关系为跨领域理解提供了新的视角。`;
}

/**
 * 生成通用隐喻
 */
function generateGenericMetaphors(conceptA, conceptB) {
    return [
        {
            title: `系统视角下的${conceptA}与${conceptB}`,
            description: `将${conceptA}和${conceptB}都视为复杂系统，它们可能在输入-处理-输出的模式上存在相似性。`,
            novelty_score: 0.6,
            feasibility_score: 0.7
        },
        {
            title: `生命周期隐喻`,
            description: `${conceptA}和${conceptB}都可能经历诞生、成长、成熟和衰退的阶段，这种生命周期视角提供了跨界理解的桥梁。`,
            novelty_score: 0.55,
            feasibility_score: 0.75
        }
    ];
}

/**
 * 计算新颖度分数
 */
function calculateNoveltyScore(similarity) {
    // 基于相似性强度的简单计算
    const base = 0.5 + (similarity.strength || 0.5) * 0.3;
    const randomFactor = Math.random() * 0.2;
    return Math.min(0.95, base + randomFactor);
}

/**
 * 计算可行性分数
 */
function calculateFeasibilityScore(similarity, mode) {
    // 隐喻模式的可行性通常较低（因为是抽象的）
    const base = 0.4 + (similarity.strength || 0.5) * 0.3;
    const randomFactor = Math.random() * 0.2;
    return Math.min(0.85, base + randomFactor);
}

module.exports = { generate };