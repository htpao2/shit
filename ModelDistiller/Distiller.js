#!/usr/bin/env node
/**
 * ModelDistiller - 跨模型能力蒸馏流水线
 * VCP 同步插件 (stdio)
 * 
 * 功能：
 *   - RecordTrace: 记录强模型的思维链轨迹到知识库
 *   - DistillTrace: 为弱模型检索并注入蒸馏上下文
 * 
 * 支持串行批量调用 (command1, command2, ...)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ============================================================
//  常量与配置
// ============================================================

const PLUGIN_DIR = __dirname;
const TRACE_STORE_DIR = path.join(PLUGIN_DIR, process.env.TRACE_STORE_DIR || 'trace-store');
const TRACE_INDEX_FILE = path.join(TRACE_STORE_DIR, '_index.json');

const TOP_K = parseInt(process.env.TOP_K_TRACES, 10) || 5;
const SIMILARITY_THRESHOLD = parseFloat(process.env.SIMILARITY_THRESHOLD) || 0.6;
const MAX_CONTEXT_TOKENS = parseInt(process.env.MAX_CONTEXT_TOKENS, 10) || 4000;
const KB_ENDPOINT = process.env.KNOWLEDGE_BASE_ENDPOINT || '';

/** 解析师徒制配对配置 */
function parsePairConfig() {
    const raw = process.env.PAIR_CONFIG || 'gemini-2.5-pro:gemini-2.0-flash';
    const pairs = {};
    raw.split(';').forEach(segment => {
        const [pro, flash] = segment.trim().split(':');
        if (pro && flash) {
            // 双向映射：flash -> pro
            pairs[flash.trim()] = pro.trim();
        }
    });
    return pairs;
}

const PAIR_MAP = parsePairConfig();

// ============================================================
//  工具函数
// ============================================================

/** 确保存储目录存在 */
function ensureStoreDir() {
    if (!fs.existsSync(TRACE_STORE_DIR)) {
        fs.mkdirSync(TRACE_STORE_DIR, { recursive: true });
    }
}

/** 读取轨迹索引 */
function loadIndex() {
    ensureStoreDir();
    if (fs.existsSync(TRACE_INDEX_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(TRACE_INDEX_FILE, 'utf-8'));
        } catch {
            return { traces: [] };
        }
    }
    return { traces: [] };
}

/** 保存轨迹索引 */
function saveIndex(index) {
    ensureStoreDir();
    fs.writeFileSync(TRACE_INDEX_FILE, JSON.stringify(index, null, 2), 'utf-8');
}

/** 生成唯一 traceId */
function generateTraceId() {
    return 'trace-' + crypto.randomUUID();
}

/** 估算文本 token 数（粗略：1 token ≈ 4 字符 中文约 1.5 字符/token） */
function estimateTokens(text) {
    if (!text) return 0;
    // 简单混合估算：英文按 4 字符/token，中文按 1.5 字符/token
    const cjkChars = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
    const otherChars = text.length - cjkChars;
    return Math.ceil(cjkChars / 1.5 + otherChars / 4);
}

/**
 * 基于 TF-IDF 简化版的文本相似度计算
 * 使用 bag-of-words 余弦相似度
 */
function computeSimilarity(textA, textB) {
    if (!textA || !textB) return 0;

    const tokenize = (text) => {
        // 中英文分词：英文按空格/标点，中文按单字
        const tokens = [];
        const englishWords = text.toLowerCase().match(/[a-z0-9_]+/g) || [];
        tokens.push(...englishWords);
        const cjkChars = text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || [];
        tokens.push(...cjkChars);
        return tokens;
    };

    const tokensA = tokenize(textA);
    const tokensB = tokenize(textB);

    if (tokensA.length === 0 || tokensB.length === 0) return 0;

    // 构建词频表
    const freqA = {};
    const freqB = {};
    tokensA.forEach(t => { freqA[t] = (freqA[t] || 0) + 1; });
    tokensB.forEach(t => { freqB[t] = (freqB[t] || 0) + 1; });

    // 余弦相似度
    const allTokens = new Set([...Object.keys(freqA), ...Object.keys(freqB)]);
    let dotProduct = 0, normA = 0, normB = 0;

    for (const token of allTokens) {
        const a = freqA[token] || 0;
        const b = freqB[token] || 0;
        dotProduct += a * b;
        normA += a * a;
        normB += b * b;
    }

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * 标签匹配度计算
 * 返回 Jaccard 相似系数
 */
function computeTagSimilarity(tagsA, tagsB) {
    if (!tagsA || !tagsB || tagsA.length === 0 || tagsB.length === 0) return 0;
    const setA = new Set(tagsA.map(t => t.toLowerCase().trim()));
    const setB = new Set(tagsB.map(t => t.toLowerCase().trim()));
    const intersection = [...setA].filter(x => setB.has(x)).length;
    const union = new Set([...setA, ...setB]).size;
    return union === 0 ? 0 : intersection / union;
}

// ============================================================
//  参数规范化（鲁棒性处理）
// ============================================================

/**
 * 规范化参数名称（支持同义词和大小写容错）
 */
function normalizeArgs(args) {
    const normalized = {};
    const lowerMap = {};

    // 先建立小写映射
    for (const [key, value] of Object.entries(args)) {
        lowerMap[key.toLowerCase()] = value;
    }

    // command 同义词
    normalized.command = lowerMap.command || lowerMap.action || lowerMap.cmd || lowerMap.type;

    // RecordTrace 参数
    normalized.modelId = lowerMap.modelid || lowerMap.model_id || lowerMap.model || lowerMap.modelname;
    normalized.modelTier = lowerMap.modeltier || lowerMap.model_tier || lowerMap.tier || 'pro';
    normalized.agentName = lowerMap.agentname || lowerMap.agent_name || lowerMap.agent || lowerMap.maid || '';
    normalized.taskTopic = lowerMap.tasktopic || lowerMap.task_topic || lowerMap.topic;
    normalized.tags = lowerMap.tags || lowerMap.tag || lowerMap.labels || '';
    normalized.chainOfThought = lowerMap.chainofthought || lowerMap.chain_of_thought || lowerMap.cot || lowerMap.thinking;
    normalized.intermediateResults = lowerMap.intermediateresults || lowerMap.intermediate_results || lowerMap.intermediate || '';
    normalized.finalOutput = lowerMap.finaloutput || lowerMap.final_output || lowerMap.output || lowerMap.result;
    normalized.contextUsed = lowerMap.contextused || lowerMap.context_used || lowerMap.context || '';
    normalized.qualityScore = parseFloat(lowerMap.qualityscore || lowerMap.quality_score || lowerMap.quality || lowerMap.score || '0.8');

    // DistillTrace 参数
    normalized.taskDescription = lowerMap.taskdescription || lowerMap.task_description || lowerMap.description || lowerMap.task;
    normalized.targetModelId = lowerMap.targetmodelid || lowerMap.target_model_id || lowerMap.targetmodel || lowerMap.target;
    normalized.topK = parseInt(lowerMap.topk || lowerMap.top_k || lowerMap.k || String(TOP_K), 10);
    normalized.maxTokens = parseInt(lowerMap.maxtokens || lowerMap.max_tokens || String(MAX_CONTEXT_TOKENS), 10);

    return normalized;
}

// ============================================================
//  核心命令实现
// ============================================================

/**
 * RecordTrace - 记录强模型的思维链轨迹
 */
async function handleRecordTrace(args) {
    const {
        modelId, modelTier, agentName, taskTopic, tags,
        chainOfThought, intermediateResults, finalOutput, contextUsed, qualityScore
    } = normalizeArgs(args);

    // 参数校验
    if (!modelId) return { success: false, error: '缺少必需参数 modelId（模型标识）' };
    if (!taskTopic) return { success: false, error: '缺少必需参数 taskTopic（任务主题）' };
    if (!chainOfThought) return { success: false, error: '缺少必需参数 chainOfThought（思维链）' };
    if (!finalOutput) return { success: false, error: '缺少必需参数 finalOutput（最终输出）' };

    const traceId = generateTraceId();
    const tagList = typeof tags === 'string' ? tags.split(',').map(t => t.trim()).filter(Boolean) : (tags || []);
    const intermediateList = typeof intermediateResults === 'string'
        ? intermediateResults.split('|||').map(r => r.trim()).filter(Boolean)
        : (intermediateResults || []);

    // 构建轨迹对象
    const traceObj = {
        traceId,
        modelId,
        modelTier,
        agentName,
        taskTopic,
        tags: tagList,
        timestamp: new Date().toISOString(),
        trace: {
            chainOfThought,
            intermediateResults: intermediateList,
            finalOutput,
            contextUsed
        },
        metadata: {
            tokenCount: estimateTokens(chainOfThought + finalOutput),
            qualityScore: isNaN(qualityScore) ? 0.8 : Math.max(0, Math.min(1, qualityScore)),
            pairConfig: findPairForModel(modelId)
        }
    };

    // 尝试通过 KnowledgeBaseManager 存储
    if (KB_ENDPOINT) {
        try {
            const stored = await storeToKnowledgeBase(traceObj);
            if (stored) {
                return {
                    success: true,
                    result: `###轨迹记录成功###\n` +
                        `轨迹ID: ${traceId}\n` +
                        `模型: ${modelId} (${modelTier})\n` +
                        `主题: ${taskTopic}\n` +
                        `标签: ${tagList.join(', ')}\n` +
                        `Token数: ${traceObj.metadata.tokenCount}\n` +
                        `存储方式: KnowledgeBase\n` +
                        `###请将此记录确认信息告知用户###`
                };
            }
        } catch (e) {
            // fallback to local storage
        }
    }

    // 本地文件存储
    ensureStoreDir();
    const traceFile = path.join(TRACE_STORE_DIR, `${traceId}.json`);
    fs.writeFileSync(traceFile, JSON.stringify(traceObj, null, 2), 'utf-8');

    // 更新索引
    const index = loadIndex();
    index.traces.push({
        traceId,
        modelId,
        modelTier,
        taskTopic,
        tags: tagList,
        timestamp: traceObj.timestamp,
        qualityScore: traceObj.metadata.qualityScore,
        tokenCount: traceObj.metadata.tokenCount
    });
    saveIndex(index);

    return {
        success: true,
        result: `###轨迹记录成功###\n` +
            `轨迹ID: ${traceId}\n` +
            `模型: ${modelId} (${modelTier})\n` +
            `主题: ${taskTopic}\n` +
            `标签: ${tagList.join(', ')}\n` +
            `Token数: ${traceObj.metadata.tokenCount}\n` +
            `存储方式: 本地文件\n` +
            `###请将此记录确认信息告知用户###`
    };
}

/**
 * DistillTrace - 为弱模型检索并注入蒸馏上下文
 */
async function handleDistillTrace(args) {
    const {
        taskDescription, taskTopic, targetModelId, tags, topK, maxTokens
    } = normalizeArgs(args);

    // 参数校验
    if (!taskDescription && !taskTopic) {
        return { success: false, error: '缺少必需参数 taskDescription（任务描述）或 taskTopic（任务主题）' };
    }

    const queryText = [taskDescription, taskTopic].filter(Boolean).join(' ');
    const queryTags = typeof tags === 'string' ? tags.split(',').map(t => t.trim()).filter(Boolean) : (tags || []);
    const effectiveTopK = topK || TOP_K;
    const effectiveMaxTokens = maxTokens || MAX_CONTEXT_TOKENS;

    // 确定配对的强模型
    const pairedProModel = targetModelId ? PAIR_MAP[targetModelId] : null;

    // 尝试从 KnowledgeBaseManager 检索
    if (KB_ENDPOINT) {
        try {
            const kbResults = await searchKnowledgeBase(queryText, queryTags, effectiveTopK);
            if (kbResults && kbResults.length > 0) {
                return formatDistillResult(kbResults, queryText, pairedProModel, effectiveMaxTokens);
            }
        } catch (e) {
            // fallback to local search
        }
    }

    // 本地文件检索
    const index = loadIndex();
    if (!index.traces || index.traces.length === 0) {
        return {
            success: true,
            result: '###蒸馏检索结果###\n当前知识库中没有任何轨迹记录。请先让强模型使用 RecordTrace 命令记录轨迹。\n###蒸馏检索结束###'
        };
    }

    // 计算每条轨迹的综合相似度分数
    const scoredTraces = [];
    for (const entry of index.traces) {
        // 文本相似度（主题匹配）
        const topicSim = computeSimilarity(queryText, entry.taskTopic);
        // 标签匹配
        const tagSim = computeTagSimilarity(queryTags, entry.tags);
        // 配对加成：如果轨迹来自配对的强模型，给予额外分数
        const pairBonus = (pairedProModel && entry.modelId === pairedProModel) ? 0.15 : 0;
        // 质量加权
        const qualityWeight = entry.qualityScore || 0.8;

        // 综合分数 = 0.5 * 主题相似度 + 0.25 * 标签相似度 + 0.25 * 质量分 + 配对加成
        const totalScore = 0.5 * topicSim + 0.25 * tagSim + 0.25 * qualityWeight + pairBonus;

        if (totalScore >= SIMILARITY_THRESHOLD) {
            scoredTraces.push({ ...entry, score: totalScore });
        }
    }

    // 排序并取 Top-K
    scoredTraces.sort((a, b) => b.score - a.score);
    const topTraces = scoredTraces.slice(0, effectiveTopK);

    if (topTraces.length === 0) {
        return {
            success: true,
            result: `###蒸馏检索结果###\n知识库中有 ${index.traces.length} 条轨迹，但没有与当前任务相似度达到阈值(${SIMILARITY_THRESHOLD})的记录。\n查询文本: "${queryText}"\n建议: 尝试提供更具体的任务描述或相关标签。\n###蒸馏检索结束###`
        };
    }

    // 加载完整轨迹数据并格式化
    const fullTraces = [];
    let totalTokens = 0;

    for (const entry of topTraces) {
        const traceFile = path.join(TRACE_STORE_DIR, `${entry.traceId}.json`);
        if (!fs.existsSync(traceFile)) continue;

        try {
            const traceData = JSON.parse(fs.readFileSync(traceFile, 'utf-8'));
            const traceTokens = estimateTokens(
                traceData.trace.chainOfThought + traceData.trace.finalOutput
            );

            // 检查 token 预算
            if (totalTokens + traceTokens > effectiveMaxTokens) {
                // 如果已经有至少一条，就停止
                if (fullTraces.length > 0) break;
                // 如果第一条就超了，截断
                const ratio = effectiveMaxTokens / traceTokens;
                const cotLen = Math.floor(traceData.trace.chainOfThought.length * ratio * 0.7);
                const outLen = Math.floor(traceData.trace.finalOutput.length * ratio * 0.3);
                traceData.trace.chainOfThought = traceData.trace.chainOfThought.substring(0, cotLen) + '... [已截断]';
                traceData.trace.finalOutput = traceData.trace.finalOutput.substring(0, outLen) + '... [已截断]';
            }

            totalTokens += traceTokens;
            fullTraces.push({ ...traceData, score: entry.score });
        } catch {
            continue;
        }
    }

    return formatDistillResult(fullTraces, queryText, pairedProModel, effectiveMaxTokens);
}

/**
 * 格式化蒸馏结果为可注入的上下文文本
 */
function formatDistillResult(traces, queryText, pairedProModel, maxTokens) {
    if (!traces || traces.length === 0) {
        return {
            success: true,
            result: '###蒸馏检索结果###\n未找到可用的蒸馏轨迹。\n###蒸馏检索结束###'
        };
    }

    let output = '###蒸馏检索结果###\n';
    output += `查询: "${queryText}"\n`;
    if (pairedProModel) output += `配对强模型: ${pairedProModel}\n`;
    output += `找到 ${traces.length} 条相关轨迹:\n\n`;

    for (let i = 0; i < traces.length; i++) {
        const t = traces[i];
        const score = (t.score || 0).toFixed(2);
        const trace = t.trace || {};

        output += `━━━ 蒸馏上下文 #${i + 1} ━━━\n`;
        output += `来源: ${t.modelId} (${t.modelTier}) | 相关度: ${score} | 主题: ${t.taskTopic}\n`;
        output += `时间: ${t.timestamp} | 质量分: ${(t.metadata?.qualityScore || 0).toFixed(2)}\n`;
        if (t.tags && t.tags.length) output += `标签: ${t.tags.join(', ')}\n`;
        output += '\n';

        output += '[思维链摘要]\n';
        output += (trace.chainOfThought || '无') + '\n\n';

        if (trace.intermediateResults && trace.intermediateResults.length > 0) {
            output += '[关键中间结果]\n';
            trace.intermediateResults.forEach((r, j) => {
                output += `  ${j + 1}. ${r}\n`;
            });
            output += '\n';
        }

        output += '[最终输出]\n';
        output += (trace.finalOutput || '无') + '\n\n';
    }

    output += '###蒸馏检索结束###\n';
    output += '提示: 以上是从强模型经验中蒸馏的上下文，请参考这些思路来完成当前任务，但要根据具体情况进行调整。';

    return { success: true, result: output };
}

/**
 * 查找模型的配对关系描述
 */
function findPairForModel(modelId) {
    // 检查是否是某个弱模型的配对强模型
    for (const [flash, pro] of Object.entries(PAIR_MAP)) {
        if (pro === modelId) return `${modelId} → ${flash}`;
    }
    // 检查是否是弱模型
    if (PAIR_MAP[modelId]) return `${PAIR_MAP[modelId]} → ${modelId}`;
    return 'unpaired';
}

// ============================================================
//  KnowledgeBase / TagMemo 远程交互（当配置了 endpoint 时使用）
// ============================================================

/**
 * 存储轨迹到 KnowledgeBaseManager
 */
async function storeToKnowledgeBase(traceObj) {
    if (!KB_ENDPOINT) return false;

    try {
        const http = KB_ENDPOINT.startsWith('https') ? require('https') : require('http');
        const url = new URL(`${KB_ENDPOINT}/store`);

        const payload = JSON.stringify({
            type: 'model_trace',
            id: traceObj.traceId,
            content: traceObj.trace.chainOfThought + '\n' + traceObj.trace.finalOutput,
            metadata: {
                traceId: traceObj.traceId,
                modelId: traceObj.modelId,
                modelTier: traceObj.modelTier,
                taskTopic: traceObj.taskTopic,
                tags: traceObj.tags,
                qualityScore: traceObj.metadata.qualityScore
            },
            tags: ['model_trace', traceObj.modelTier, ...traceObj.tags]
        });

        return new Promise((resolve, reject) => {
            const req = http.request(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload)
                }
            }, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => {
                    resolve(res.statusCode >= 200 && res.statusCode < 300);
                });
            });
            req.on('error', reject);
            req.write(payload);
            req.end();
        });
    } catch {
        return false;
    }
}

/**
 * 从 KnowledgeBaseManager 检索轨迹
 */
async function searchKnowledgeBase(queryText, tags, topK) {
    if (!KB_ENDPOINT) return null;

    try {
        const http = KB_ENDPOINT.startsWith('https') ? require('https') : require('http');
        const url = new URL(`${KB_ENDPOINT}/search`);

        const payload = JSON.stringify({
            type: 'model_trace',
            query: queryText,
            tags: ['model_trace', ...tags],
            topK
        });

        return new Promise((resolve, reject) => {
            const req = http.request(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload)
                }
            }, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => {
                    try {
                        const data = JSON.parse(body);
                        resolve(data.results || []);
                    } catch {
                        resolve(null);
                    }
                });
            });
            req.on('error', () => resolve(null));
            req.write(payload);
            req.end();
        });
    } catch {
        return null;
    }
}

// ============================================================
//  串行调用 (Batch) 处理
// ============================================================

/**
 * 检测并处理串行调用
 * 识别 command1, command2, ... 模式
 */
async function handleBatchRequest(request) {
    const batchCommands = [];
    let i = 1;

    while (request[`command${i}`] !== undefined) {
        // 提取属于当前命令的所有参数
        const commandArgs = { command: request[`command${i}`] };
        for (const [key, value] of Object.entries(request)) {
            // 匹配以数字 i 结尾的参数，如 modelId1, taskTopic1
            const match = key.match(new RegExp(`^(.+?)${i}$`));
            if (match && match[1] !== 'command') {
                commandArgs[match[1]] = value;
            }
        }
        batchCommands.push(commandArgs);
        i++;
    }

    if (batchCommands.length === 0) return null;

    const results = [];
    for (let j = 0; j < batchCommands.length; j++) {
        const cmd = batchCommands[j];
        const cmdResult = await processCommand(cmd);
        results.push({
            commandIndex: j + 1,
            command: cmd.command,
            ...cmdResult
        });
    }

    // 汇总报告
    const successCount = results.filter(r => r.success).length;
    const failCount = results.length - successCount;

    let report = `###批量执行报告###\n`;
    report += `总计: ${results.length} 条命令 | 成功: ${successCount} | 失败: ${failCount}\n\n`;

    for (const r of results) {
        report += `── 命令 #${r.commandIndex} (${r.command}) ──\n`;
        if (r.success) {
            report += r.result + '\n\n';
        } else {
            report += `错误: ${r.error}\n\n`;
        }
    }

    report += '###批量执行结束###';

    return { status: 'success', result: report };
}

// ============================================================
//  请求分发
// ============================================================

/**
 * 处理单个命令
 */
async function processCommand(args) {
    const normalized = normalizeArgs(args);
    const command = (normalized.command || '').trim();

    switch (command) {
        case 'RecordTrace':
        case 'recordtrace':
        case 'record_trace':
        case 'record':
            return await handleRecordTrace(args);

        case 'DistillTrace':
        case 'distilltrace':
        case 'distill_trace':
        case 'distill':
            return await handleDistillTrace(args);

        default:
            return {
                success: false,
                error: `未知命令: "${command}"。支持的命令: RecordTrace, DistillTrace`
            };
    }
}

/**
 * 处理完整请求（单命令或批量）
 */
async function processRequest(request) {
    // 检查是否为批量请求
    if (request.command1 !== undefined) {
        return await handleBatchRequest(request);
    }

    // 单命令请求
    const command = request.command || request.Command || request.action || request.Action || request.cmd;
    if (!command) {
        return {
            status: 'error',
            result: '缺少 command 字段。支持的命令: RecordTrace（记录轨迹）, DistillTrace（蒸馏检索）'
        };
    }

    const result = await processCommand({ ...request, command });

    if (result.success) {
        return { status: 'success', result: result.result };
    } else {
        return { status: 'error', result: result.error };
    }
}

// ============================================================
//  主入口 (stdin/stdout)
// ============================================================

async function main() {
    let inputData = '';

    // 读取 stdin
    process.stdin.setEncoding('utf-8');

    await new Promise((resolve) => {
        process.stdin.on('data', (chunk) => {
            inputData += chunk;
        });
        process.stdin.on('end', resolve);
    });

    try {
        const request = JSON.parse(inputData.trim());
        const output = await processRequest(request);
        console.log(JSON.stringify(output));
        process.exit(0);
    } catch (e) {
        console.log(JSON.stringify({
            status: 'error',
            result: `解析输入失败: ${e.message}。请确保输入是有效的 JSON 格式。`
        }));
        process.exit(1);
    }
}

main();
