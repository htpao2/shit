// Plugin/ToolResultRAG/index.js
// 工具结果RAG插件 - 为过长的工具返回结果提供语义检索能力

const { getEmbeddingsBatch } = require('../../EmbeddingUtils');

let knowledgeBaseManager = null;
let config = {};

/**
 * 初始化插件
 * @param {Object} initialConfig - 配置对象
 * @param {Object} dependencies - 依赖注入
 */
async function initialize(initialConfig, dependencies) {
    config = initialConfig;
    
    // 从依赖中获取 KnowledgeBaseManager 实例
    // 注意：这需要在 Plugin.js 中进行注入
    if (dependencies && dependencies.knowledgeBaseManager) {
        knowledgeBaseManager = dependencies.knowledgeBaseManager;
        if (config.DebugMode) console.log('[ToolResultRAG] KnowledgeBaseManager injected successfully.');
    } else {
        // 回退：尝试直接 require（单例模式）
        try {
            knowledgeBaseManager = require('../../KnowledgeBaseManager');
            if (config.DebugMode) console.log('[ToolResultRAG] KnowledgeBaseManager loaded via require.');
        } catch (e) {
            console.error('[ToolResultRAG] ❌ Critical: Failed to get KnowledgeBaseManager.', e.message);
        }
    }
    
    console.log('[ToolResultRAG] ✅ Plugin initialized.');
}

/**
 * 将长内容建立索引（内部API，供 PluginManager 调用）
 * @param {string} content - 需要索引的内容
 * @param {Object} options - 选项 { ttlMs: number }
 * @returns {Promise<string|null>} resultId 或 null
 */
async function indexContent(content, options = {}) {
    if (!knowledgeBaseManager) {
        console.error('[ToolResultRAG] Cannot index content: KnowledgeBaseManager not available.');
        return null;
    }
    
    const ttlMs = options.ttlMs || 30 * 60 * 1000; // 默认30分钟
    
    try {
        const resultId = await knowledgeBaseManager.addTransientContent(content, ttlMs);
        if (config.DebugMode) console.log(`[ToolResultRAG] Content indexed with ID: ${resultId}`);
        return resultId;
    } catch (e) {
        console.error('[ToolResultRAG] Error indexing content:', e);
        return null;
    }
}

/**
 * 处理工具调用（用于 hybridservice 类型插件）
 * @param {Object} args - 工具参数
 * @returns {Promise<Object>} 查询结果
 */
async function processToolCall(args) {
    const { result_id, query, top_k } = args;
    
    if (!result_id || !query) {
        return {
            status: 'error',
            error: '缺少必需参数：result_id 和 query 都是必填项。'
        };
    }
    
    if (!knowledgeBaseManager) {
        return {
            status: 'error',
            error: '系统错误：KnowledgeBaseManager 不可用。'
        };
    }
    
    try {
        // 1. 将查询文本向量化
        const [queryVector] = await getEmbeddingsBatch([query], {
            apiKey: process.env.API_Key,
            apiUrl: process.env.API_URL,
            model: process.env.WhitelistEmbeddingModel || 'google/gemini-embedding-001'
        });
        
        if (!queryVector) {
            return {
                status: 'error',
                error: '无法生成查询向量。请稍后重试。'
            };
        }
        
        // 2. 在临时索引中搜索
        const k = parseInt(top_k) || 5;
        const results = await knowledgeBaseManager.searchTransientContent(result_id, queryVector, k);
        
        if (results.length === 0) {
            return {
                status: 'success',
                data: {
                    message: `未找到与查询 "${query}" 相关的内容。索引ID可能已过期或查询不匹配。`,
                    result_id: result_id,
                    query: query,
                    results: []
                }
            };
        }
        
        // 3. 格式化返回结果
        const formattedResults = results.map((r, i) => ({
            rank: i + 1,
            score: r.score ? r.score.toFixed(4) : 'N/A',
            content: r.text
        }));
        
        // 合并所有结果为一个易读的文本块
        const combinedText = formattedResults
            .map(r => `[相关度: ${r.score}]\n${r.content}`)
            .join('\n\n---\n\n');
        
        return {
            status: 'success',
            data: {
                result_id: result_id,
                query: query,
                total_found: results.length,
                combined_content: combinedText,
                results: formattedResults
            }
        };
        
    } catch (e) {
        console.error('[ToolResultRAG] Error processing query:', e);
        return {
            status: 'error',
            error: `查询处理失败: ${e.message}`
        };
    }
}

/**
 * 关闭插件时的清理工作
 */
async function shutdown() {
    console.log('[ToolResultRAG] Shutting down...');
    // 临时索引的清理由 KnowledgeBaseManager 的 TTL 机制处理
}

module.exports = {
    initialize,
    indexContent,
    processToolCall,
    shutdown
};