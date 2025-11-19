/**
 * Practical Collision Algorithm
 * 实践模式：探索跨界应用的可行性
 */

/**
 * 生成实践模式的洞见
 */
async function generate(conceptA, conceptB, conceptPool) {
    const insights = [];

    // 实践模式更关注可行性和实际应用
    const applications = [
        {
            title: `${conceptA}技术在${conceptB}领域的直接应用`,
            description: `分析${conceptA}的核心技术或方法论如何直接移植到${conceptB}中。` +
                `识别${conceptB}领域中可能受益的具体场景和问题。`,
            novelty_score: 0.65,
            feasibility_score: 0.75
        },
        {
            title: `${conceptB}流程的${conceptA}化改造`,
            description: `使用${conceptA}的原理重新设计${conceptB}的工作流程，` +
                `提升效率、降低成本或增强用户体验。`,
            novelty_score: 0.70,
            feasibility_score: 0.80
        },
        {
            title: `混合解决方案：${conceptA}+${conceptB}`,
            description: `创建一个融合两者优势的新系统或产品，` +
                `例如结合${conceptA}的技术特性和${conceptB}的领域知识。`,
            novelty_score: 0.75,
            feasibility_score: 0.65
        },
        {
            title: `${conceptB}数据驱动的${conceptA}优化`,
            description: `利用${conceptB}领域积累的数据和经验，` +
                `反向优化和改进${conceptA}的设计或实现。`,
            novelty_score: 0.68,
            feasibility_score: 0.72
        }
    ];

    return applications;
}

module.exports = { generate };