/**
 * ConceptCollider - 概念碰撞器
 * 将两个不相关的概念进行深度碰撞，生成创新组合方案
 */

const fs = require('fs').promises;
const path = require('path');
const natural = require('natural');
const compromise = require('compromise');

// 导入碰撞算法
const metaphorCollision = require('./algorithms/metaphor.js');
const practicalCollision = require('./algorithms/practical.js');
const artisticCollision = require('./algorithms/artistic.js');

// 配置加载
const CONFIG = {
    conceptPoolPath: process.env.CONCEPT_POOL_PATH || './data/concept_pool.json',
    inspirationVaultPath: process.env.INSPIRATION_VAULT_PATH || './data/inspiration_vault.json',
    similarityThreshold: parseFloat(process.env.SIMILARITY_THRESHOLD) || 0.3,
    maxInsights: parseInt(process.env.MAX_INSIGHTS_PER_COLLISION) || 5
};

/**
 * 主处理函数
 */
async function main() {
    try {
        // 1. 读取 stdin
        const input = await readStdin();
        const args = JSON.parse(input);

        // 2. 参数验证
        if (!args.concept_a || !args.concept_b) {
            throw new Error("必须提供 concept_a 和 concept_b 参数");
        }

        const conceptA = args.concept_a;
        const conceptB = args.concept_b;
        const mode = args.collision_mode || 'metaphor';

        // 3. 加载概念库
        const conceptPool = await loadConceptPool();

        // 4. 执行碰撞
        const collisionResult = await performCollision(
            conceptA,
            conceptB,
            mode,
            conceptPool
        );

        // 5. 保存到灵感库
        await saveToInspirationVault(collisionResult);

        // 6. 返回结果
        const output = {
            status: "success",
            result: collisionResult
        };

        console.log(JSON.stringify(output));
        process.exit(0);

    } catch (error) {
        const errorOutput = {
            status: "error",
            error: error.message
        };
        console.log(JSON.stringify(errorOutput));
        process.exit(1);
    }
}

/**
 * 读取标准输入
 */
function readStdin() {
    return new Promise((resolve) => {
        let data = '';
        process.stdin.on('data', chunk => data += chunk);
        process.stdin.on('end', () => resolve(data.trim()));
    });
}

/**
 * 加载概念库
 */
async function loadConceptPool() {
    try {
        const data = await fs.readFile(CONFIG.conceptPoolPath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        // 如果概念库不存在，返回默认结构
        return {
            domains: [],
            metaphors: []
        };
    }
}

/**
 * 执行概念碰撞
 */
async function performCollision(conceptA, conceptB, mode, conceptPool) {
    const collisionId = generateCollisionId();

    // 根据模式选择算法
    let insights;
    switch (mode) {
        case 'metaphor':
            insights = await metaphorCollision.generate(conceptA, conceptB, conceptPool);
            break;
        case 'practical':
            insights = await practicalCollision.generate(conceptA, conceptB, conceptPool);
            break;
        case 'artistic':
            insights = await artisticCollision.generate(conceptA, conceptB, conceptPool);
            break;
        default:
            throw new Error(`不支持的碰撞模式: ${mode}`);
    }

    // 限制洞见数量
    const limitedInsights = insights.slice(0, CONFIG.maxInsights);

    // 生成推荐的后续步骤
    const nextSteps = generateNextSteps(conceptA, conceptB, mode, limitedInsights);

    return {
        collision_id: collisionId,
        concepts: {
            primary: conceptA,
            secondary: conceptB
        },
        mode: mode,
        insights: limitedInsights,
        recommended_next_steps: nextSteps,
        saved_to_inspiration_vault: true,
        timestamp: new Date().toISOString()
    };
}

/**
 * 生成唯一的碰撞ID
 */
function generateCollisionId() {
    const date = new Date();
    const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
    const randomStr = Math.random().toString(36).substring(2, 5).toUpperCase();
    return `COL_${dateStr}_${randomStr}`;
}

/**
 * 生成推荐的后续步骤
 */
function generateNextSteps(conceptA, conceptB, mode, insights) {
    const steps = [];

    if (mode === 'metaphor') {
        steps.push(`探索 "${conceptA}" 的核心特性如何映射到 "${conceptB}" 的具体场景`);
        steps.push(`研究 "${conceptB}" 中是否存在类似 "${conceptA}" 的底层模式`);
    } else if (mode === 'practical') {
        steps.push(`评估将 "${conceptA}" 应用于 "${conceptB}" 的技术可行性`);
        steps.push(`寻找 "${conceptB}" 领域中可能受益于 "${conceptA}" 的具体问题`);
    } else if (mode === 'artistic') {
        steps.push(`设计一个融合 "${conceptA}" 和 "${conceptB}" 的概念艺术作品`);
        steps.push(`探索 "${conceptA}" 与 "${conceptB}" 的美学共鸣点`);
    }

    // 基于洞见质量添加步骤
    const highQualityInsights = insights.filter(i => i.novelty_score > 0.7);
    if (highQualityInsights.length > 0) {
        steps.push(`深入研究高新颖度洞见：${highQualityInsights[0].title}`);
    }

    return steps;
}

/**
 * 保存到灵感库
 */
async function saveToInspirationVault(collisionResult) {
    try {
        let vault;
        try {
            const data = await fs.readFile(CONFIG.inspirationVaultPath, 'utf8');
            vault = JSON.parse(data);
        } catch (error) {
            // 如果文件不存在，创建新的灵感库
            vault = { collisions: [] };
        }

        // 添加新的碰撞结果
        vault.collisions.push({
            id: collisionResult.collision_id,
            timestamp: collisionResult.timestamp,
            concepts: [collisionResult.concepts.primary, collisionResult.concepts.secondary],
            mode: collisionResult.mode,
            insights: collisionResult.insights,
            usage_count: 0,
            effectiveness_rating: 0
        });

        // 保存回文件
        await fs.writeFile(
            CONFIG.inspirationVaultPath,
            JSON.stringify(vault, null, 2),
            'utf8'
        );

    } catch (error) {
        console.error('保存到灵感库失败:', error.message);
        // 不抛出错误，因为这不是关键操作
    }
}

// 启动主函数
if (require.main === module) {
    main();
}

module.exports = { main };