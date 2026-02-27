/**
 * EvoLang - 自进化语言与协议孵化器
 * VCP hybridservice 插件（direct 协议，常驻内存）
 * 
 * 导出接口：
 *   - initialize(config, dependencies) - 初始化
 *   - processMessages(messages, config) - 消息预处理（语言路由层）
 *   - processToolCall(args) - 工具调用处理
 *   - shutdown() - 关闭清理
 *   - getPlaceholderValue(placeholder) - 动态占位符获取
 * 
 * 工具命令：
 *   - EncryptMessage - 加密消息
 *   - DecryptMessage - 解密消息
 *   - LanguageGame - 语言创造游戏
 *   - EvolveDictionary - 词典演化
 *   - QueryDictionary - 词典查询
 */

'use strict';

const path = require('path');
const DictionaryManager = require('./lib/dictionary');
const CryptoEngine = require('./lib/crypto');
const EvolutionEngine = require('./lib/evolution');
const DialectRouter = require('./lib/dialect');

// ============================================================
//  模块级状态
// ============================================================

/** @type {DictionaryManager} */
let dictionary = null;
/** @type {CryptoEngine} */
let cryptoEngine = null;
/** @type {EvolutionEngine} */
let evolutionEngine = null;
/** @type {DialectRouter} */
let dialectRouter = null;
/** @type {boolean} */
let initialized = false;
/** @type {object} */
let pluginConfig = {};

// ============================================================
//  hybridservice 标准接口
// ============================================================

/**
 * 初始化插件
 * @param {object} config - 来自 config.env 的配置
 * @param {object} dependencies - 主服务注入的依赖（如 KnowledgeBaseManager）
 */
async function initialize(config, dependencies) {
    pluginConfig = config || {};

    const dataDir = path.resolve(__dirname, pluginConfig.DATA_DIR || 'evolang-data');

    // 初始化词典管理器
    dictionary = new DictionaryManager(dataDir, {
        maxSize: parseInt(pluginConfig.MAX_DICTIONARY_SIZE, 10) || 10000,
        defaultDialect: pluginConfig.DEFAULT_DIALECT || 'default'
    });
    dictionary.load();

    // 初始化加密引擎
    cryptoEngine = new CryptoEngine(dataDir, {
        algorithm: pluginConfig.CRYPTO_ALGORITHM || 'aes-256-cbc',
        masterKey: pluginConfig.MASTER_KEY || ''
    });
    cryptoEngine.initialize();

    // 初始化演化引擎
    evolutionEngine = new EvolutionEngine({
        frequencyThreshold: parseInt(pluginConfig.EVOLUTION_FREQUENCY_THRESHOLD, 10) || 3,
        mergeThreshold: parseFloat(pluginConfig.EVOLUTION_MERGE_THRESHOLD) || 0.8
    });
    evolutionEngine.setLogFile(path.join(dataDir, 'evolution-log.json'));

    // 初始化方言路由
    dialectRouter = new DialectRouter(dictionary, cryptoEngine);

    initialized = true;

    return { status: 'ok', message: 'EvoLang 初始化完成', dialects: dictionary.listDialects() };
}

/**
 * 消息预处理（语言路由层）
 * 在 Agent 消息传递链中自动执行：
 * - 密文自动解密
 * - 方言自动翻译/切换
 * - EvoLang 词汇标注
 * 
 * @param {object[]} messages - 消息数组
 * @param {object} config - 运行时配置
 * @returns {object[]} 处理后的消息
 */
async function processMessages(messages, config) {
    if (!initialized) {
        await initialize(pluginConfig, {});
    }

    return dialectRouter.processMessages(messages, config);
}

/**
 * 工具调用处理
 * @param {object} args - 来自 AI 的调用参数
 * @returns {object} { status, result } 或 { status, error }
 */
async function processToolCall(args) {
    if (!initialized) {
        await initialize(pluginConfig, {});
    }

    try {
        // 检查批量调用
        if (args.command1 !== undefined) {
            return await handleBatchRequest(args);
        }

        const command = normalizeCommand(args);
        if (!command) {
            return {
                status: 'error',
                result: '缺少 command 字段。支持的命令: EncryptMessage, DecryptMessage, LanguageGame, EvolveDictionary, QueryDictionary'
            };
        }

        const result = await dispatchCommand(command, args);
        return result;
    } catch (e) {
        return { status: 'error', result: `插件内部错误: ${e.message}` };
    }
}

/**
 * 动态占位符获取
 * @param {string} placeholder - 占位符名称
 * @returns {string} 占位符值
 */
function getPlaceholderValue(placeholder) {
    if (!initialized || !dictionary) return '(EvoLang 未初始化)';

    if (placeholder === '{{VCPEvoLangDialect}}') {
        return dictionary.getSummary();
    }

    return '';
}

/**
 * 关闭清理
 */
async function shutdown() {
    if (dictionary) {
        dictionary.save();
    }
    if (cryptoEngine) {
        cryptoEngine.shutdown();
    }
    initialized = false;
    return { status: 'ok', message: 'EvoLang 已安全关闭' };
}

// ============================================================
//  命令分发
// ============================================================

/**
 * 规范化命令名称
 */
function normalizeCommand(args) {
    const lowerArgs = {};
    for (const [k, v] of Object.entries(args)) {
        lowerArgs[k.toLowerCase()] = v;
    }
    const raw = lowerArgs.command || lowerArgs.action || lowerArgs.cmd || '';
    return raw.toString().trim();
}

/**
 * 规范化参数（支持同义词和大小写容错）
 */
function normalizeArgs(args) {
    const n = {};
    const lower = {};
    for (const [k, v] of Object.entries(args)) {
        lower[k.toLowerCase()] = v;
    }

    // 通用参数
    n.text = lower.text || lower.message || lower.content || lower.plaintext || '';
    n.agentId = lower.agentid || lower.agent_id || lower.agent || lower.maid || '';
    n.dialect = lower.dialect || lower.dialectname || lower.dialect_name || '';
    n.cipherText = lower.ciphertext || lower.cipher_text || lower.cipher || lower.encrypted || '';
    n.recipientAgentId = lower.recipientagentid || lower.recipient_agent_id || lower.recipient || lower.to || '';

    // LanguageGame 参数
    n.theme = lower.theme || lower.topic || lower.subject || '';
    n.baseDialect = lower.basedialect || lower.base_dialect || lower.base || '';
    n.wordCount = parseInt(lower.wordcount || lower.word_count || lower.count || '5', 10);
    n.rules = lower.rules || lower.rule || lower.constraints || '';

    // EvolveDictionary 参数
    n.dryRun = lower.dryrun === 'true' || lower.dryrun === true || lower.dry_run === 'true' || lower.dry_run === true || false;

    // QueryDictionary 参数
    n.word = lower.word || lower.key || lower.term || '';
    n.filter = lower.filter || lower.category || lower.tag || '';
    n.limit = parseInt(lower.limit || lower.max || '20', 10);

    return n;
}

/**
 * 命令分发
 */
async function dispatchCommand(command, args) {
    const cmd = command.toLowerCase().replace(/[_\-\s]/g, '');

    switch (cmd) {
        case 'encryptmessage':
        case 'encrypt':
            return handleEncrypt(args);

        case 'decryptmessage':
        case 'decrypt':
            return handleDecrypt(args);

        case 'languagegame':
        case 'game':
            return handleLanguageGame(args);

        case 'evolvedictionary':
        case 'evolve':
            return handleEvolveDictionary(args);

        case 'querydictionary':
        case 'query':
            return handleQueryDictionary(args);

        default:
            return {
                status: 'error',
                result: `未知命令: "${command}"。支持的命令: EncryptMessage, DecryptMessage, LanguageGame, EvolveDictionary, QueryDictionary`
            };
    }
}

// ============================================================
//  命令处理器
// ============================================================

/**
 * EncryptMessage - 加密消息
 */
function handleEncrypt(rawArgs) {
    const args = normalizeArgs(rawArgs);

    if (!args.text) return { status: 'error', result: '缺少必需参数 text（需要加密的明文）' };
    if (!args.agentId) return { status: 'error', result: '缺少必需参数 agentId（发送方 Agent 标识）' };

    const { cipherText, signature } = cryptoEngine.encrypt(
        args.text,
        args.agentId,
        args.recipientAgentId || undefined
    );

    return {
        status: 'success',
        result: `###消息加密成功###\n` +
            `发送方: ${args.agentId}\n` +
            `${args.recipientAgentId ? `接收方: ${args.recipientAgentId}\n` : ''}` +
            `方言签名: ${signature}\n` +
            `密文:\n${cipherText}\n` +
            `###请将密文发送给目标接收方###`
    };
}

/**
 * DecryptMessage - 解密消息
 */
function handleDecrypt(rawArgs) {
    const args = normalizeArgs(rawArgs);

    if (!args.cipherText) return { status: 'error', result: '缺少必需参数 cipherText（密文）' };
    if (!args.agentId) return { status: 'error', result: '缺少必需参数 agentId（接收方 Agent 标识）' };

    const result = cryptoEngine.decrypt(args.cipherText, args.agentId);

    if (result.plaintext) {
        return {
            status: 'success',
            result: `###消息解密结果###\n` +
                `发送方: ${result.senderAgentId}\n` +
                `签名验证: ${result.signatureValid ? '✅ 通过' : '❌ 失败'}\n` +
                `${!result.signatureValid ? `⚠️ ${result.error}\n` : ''}` +
                `原文:\n${result.plaintext}\n` +
                `###解密完成###`
        };
    } else {
        return { status: 'error', result: `解密失败: ${result.error}` };
    }
}

/**
 * LanguageGame - 语言创造游戏
 */
function handleLanguageGame(rawArgs) {
    const args = normalizeArgs(rawArgs);

    if (!args.theme) return { status: 'error', result: '缺少必需参数 theme（游戏主题）' };

    const dialectName = args.baseDialect || dictionary.defaultDialect;
    const dialect = dictionary.getDialect(dialectName);
    const grammar = dialect ? dialect.grammar : {};

    // 生成新词
    const newWords = evolutionEngine.generateGameWords(
        args.theme,
        args.wordCount,
        grammar,
        args.rules
    );

    // 添加到词典
    const added = dictionary.addWords(newWords, dialectName);
    dictionary.save();

    // 格式化输出
    let output = `###语言游戏结果###\n`;
    output += `主题: ${args.theme}\n`;
    output += `方言: ${dialectName}\n`;
    output += `${args.rules ? `规则: ${args.rules}\n` : ''}`;
    output += `生成了 ${newWords.length} 个新词（已添加 ${added} 个到词典）:\n\n`;

    for (const w of newWords) {
        output += `  📝 ${w.key} = ${w.meaning}\n`;
        output += `     分类: ${w.category} | 来源: ${w.origin}\n\n`;
    }

    output += `当前词典总词数: ${Object.keys(dictionary.getWordsRef(dialectName)).length}\n`;
    output += `###语言游戏结束###`;

    return { status: 'success', result: output };
}

/**
 * EvolveDictionary - 词典演化
 */
function handleEvolveDictionary(rawArgs) {
    const args = normalizeArgs(rawArgs);

    const dialectName = args.dialect || dictionary.defaultDialect;
    const words = dictionary.getWordsRef(dialectName);

    if (!words || Object.keys(words).length === 0) {
        return { status: 'error', result: `方言 "${dialectName}" 不存在或词典为空` };
    }

    const report = evolutionEngine.evolve(words, args.dryRun);

    if (!args.dryRun) {
        dictionary.markEvolved();
        dictionary.save();
    }

    // 格式化演化报告
    let output = `###词典演化${args.dryRun ? '预览' : '报告'}###\n`;
    output += `方言: ${dialectName}\n`;
    output += `时间: ${report.timestamp}\n`;
    output += `原始词数: ${report.originalCount} → 最终词数: ${report.finalCount} (${report.netChange >= 0 ? '+' : ''}${report.netChange})\n\n`;

    for (const step of report.steps) {
        output += `── ${step.name} ──\n`;
        if (step.name === '低频词淘汰') {
            output += `  候选: ${step.candidateCount} 词\n`;
            if (step.removed.length > 0) {
                output += `  淘汰:\n`;
                for (const r of step.removed.slice(0, 10)) {
                    output += `    - ${r.key} (${r.meaning}, 频率: ${r.frequency})\n`;
                }
                if (step.removed.length > 10) output += `    ... 及其他 ${step.removed.length - 10} 词\n`;
            }
        } else if (step.name === '语义聚类') {
            output += `  聚类数: ${step.clusterCount}\n`;
        } else if (step.name === '近义词合并') {
            output += `  合并: ${step.mergeCount} 对\n`;
            for (const m of (step.merged || []).slice(0, 5)) {
                output += `    - ${m.kept} ← ${m.removed} (相似度: ${m.similarity})\n`;
            }
        } else if (step.name === '多义映射') {
            output += `  新增多义: ${step.updateCount}\n`;
            for (const u of (step.updates || []).slice(0, 5)) {
                output += `    - ${u.word}: 新含义 "${u.newMeaning.meaning}" (来自 ${u.newMeaning.category})\n`;
            }
        } else if (step.name === '词语融合') {
            output += `  融合词: ${step.createdCount}\n`;
            for (const c of (step.created || []).slice(0, 5)) {
                output += `    - ${c.word} = ${c.meaning} (源: ${c.sourceWords.join(' + ')})\n`;
            }
        }
        output += '\n';
    }

    output += `###演化${args.dryRun ? '预览' : ''}完成###`;

    return { status: 'success', result: output };
}

/**
 * QueryDictionary - 词典查询
 */
function handleQueryDictionary(rawArgs) {
    const args = normalizeArgs(rawArgs);

    const dialectName = args.dialect || dictionary.defaultDialect;

    // 查询特定词条
    if (args.word) {
        const wordEntry = dictionary.getWord(args.word, dialectName);
        if (!wordEntry) {
            return {
                status: 'success',
                result: `###词典查询结果###\n在方言 "${dialectName}" 中未找到词条 "${args.word}"。\n###查询完成###`
            };
        }

        let output = `###词典查询结果###\n`;
        output += `方言: ${dialectName}\n\n`;
        output += `📖 ${wordEntry.key}\n`;
        output += `  含义: ${wordEntry.meaning}\n`;
        output += `  词形: ${(wordEntry.forms || []).join(', ')}\n`;
        output += `  分类: ${wordEntry.category}\n`;
        output += `  来源: ${wordEntry.origin}\n`;
        output += `  置信度: ${wordEntry.confidence}\n`;
        output += `  使用频率: ${wordEntry.frequency}\n`;
        output += `  创建时间: ${wordEntry.createdAt}\n`;

        if (wordEntry.polysemy && wordEntry.polysemy.length > 0) {
            output += `  多义映射:\n`;
            for (const p of wordEntry.polysemy) {
                output += `    - ${p.meaning} (${p.category})\n`;
            }
        }

        output += `\n###查询完成###`;
        return { status: 'success', result: output };
    }

    // 按条件查询
    const filter = {};
    if (args.filter) filter.category = args.filter;

    const results = dictionary.queryWords(filter, dialectName, args.limit);

    let output = `###词典查询结果###\n`;
    output += `方言: ${dialectName}${args.filter ? ` | 过滤: ${args.filter}` : ''}\n`;
    output += `共找到 ${results.length} 个词条:\n\n`;

    for (const w of results) {
        output += `  📝 ${w.key} = ${w.meaning} [${w.category}] (频率: ${w.frequency}, 置信: ${w.confidence})\n`;
    }

    output += `\n方言列表: ${dictionary.listDialects().join(', ')}\n`;
    output += `###查询完成###`;

    return { status: 'success', result: output };
}

// ============================================================
//  批量调用
// ============================================================

async function handleBatchRequest(request) {
    const batchCommands = [];
    let i = 1;

    while (request[`command${i}`] !== undefined) {
        const cmdArgs = { command: request[`command${i}`] };
        for (const [key, value] of Object.entries(request)) {
            const match = key.match(new RegExp(`^(.+?)${i}$`));
            if (match && match[1] !== 'command') {
                cmdArgs[match[1]] = value;
            }
        }
        batchCommands.push(cmdArgs);
        i++;
    }

    if (batchCommands.length === 0) {
        return { status: 'error', result: '未检测到有效的批量命令' };
    }

    const results = [];
    for (let j = 0; j < batchCommands.length; j++) {
        const cmd = batchCommands[j];
        const command = normalizeCommand(cmd);
        const result = await dispatchCommand(command, cmd);
        results.push({ index: j + 1, command: cmd.command, ...result });
    }

    const successCount = results.filter(r => r.status === 'success').length;
    let report = `###EvoLang 批量执行报告###\n`;
    report += `总计: ${results.length} 条命令 | 成功: ${successCount} | 失败: ${results.length - successCount}\n\n`;

    for (const r of results) {
        report += `── 命令 #${r.index} (${r.command}) [${r.status}] ──\n`;
        report += r.result + '\n\n';
    }

    report += '###批量执行结束###';
    return { status: 'success', result: report };
}

// ============================================================
//  模块导出
// ============================================================

module.exports = {
    initialize,
    processMessages,
    processToolCall,
    getPlaceholderValue,
    shutdown
};
