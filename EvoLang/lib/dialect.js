/**
 * EvoLang - 方言管理与消息路由
 * 负责 Agent 间消息的自动翻译、方言切换和语言路由
 */

'use strict';

class DialectRouter {
    /**
     * @param {import('./dictionary')} dictionaryManager - 词典管理器实例
     * @param {import('./crypto')} cryptoEngine - 加密引擎实例
     */
    constructor(dictionaryManager, cryptoEngine) {
        this.dict = dictionaryManager;
        this.crypto = cryptoEngine;

        /** @type {Map<string, object>} Agent 路由配置缓存 */
        this.routeCache = new Map();
    }

    /**
     * Agent 间消息预处理（语言路由层核心）
     * 
     * 处理逻辑：
     * 1. 检测消息中是否包含 EvoLang 密文 → 自动解密
     * 2. 检测发送方 Agent 的方言配置 → 进行方言标记
     * 3. 如果接收方有不同方言 → 进行方言翻译
     * 
     * @param {object[]} messages - 消息数组 [{role, content, agentId?, ...}]
     * @param {object} config - 路由配置
     * @param {string} [config.currentAgentId] - 当前处理消息的 Agent
     * @returns {object[]} 处理后的消息数组
     */
    processMessages(messages, config = {}) {
        const currentAgentId = config.currentAgentId || 'system';
        const currentDialect = this.dict.getAgentDialect(currentAgentId);

        return messages.map(msg => {
            if (!msg.content || typeof msg.content !== 'string') return msg;

            let processedContent = msg.content;
            const annotations = [];

            // 1. 检测并自动解密 EvoLang 密文
            if (this.crypto.isCipherText(processedContent)) {
                const decryptResult = this.crypto.decrypt(processedContent, currentAgentId);
                if (decryptResult.plaintext) {
                    processedContent = decryptResult.plaintext;
                    annotations.push(
                        decryptResult.signatureValid
                            ? `[EvoLang: 已解密, 签名验证通过, 来自 ${decryptResult.senderAgentId}]`
                            : `[EvoLang: 已解密, ⚠️ 签名验证失败, 声称来自 ${decryptResult.senderAgentId}]`
                    );
                } else {
                    annotations.push(`[EvoLang: 解密失败 - ${decryptResult.error}]`);
                }
            }

            // 2. 检测消息中嵌入的密文片段（消息中间可能包含密文）
            processedContent = this._decryptEmbedded(processedContent, currentAgentId, annotations);

            // 3. 方言翻译/标记
            const senderAgent = msg.agentId || msg.maid;
            if (senderAgent) {
                const senderDialect = this.dict.getAgentDialect(senderAgent);
                if (senderDialect !== currentDialect) {
                    // 不同方言，尝试翻译
                    processedContent = this._translateBetweenDialects(
                        processedContent, senderDialect, currentDialect
                    );
                    annotations.push(`[EvoLang: 方言翻译 ${senderDialect} → ${currentDialect}]`);
                }
            }

            // 4. 将 EvoLang 词汇标注翻译
            processedContent = this._annotateEvoLangWords(processedContent, currentDialect);

            // 构建处理后的消息
            const result = { ...msg, content: processedContent };

            if (annotations.length > 0) {
                result._evolangAnnotations = annotations;
                // 添加注释到消息尾部
                result.content = processedContent + '\n' + annotations.join('\n');
            }

            return result;
        });
    }

    /**
     * 方言翻译：将一段文本中的方言 A 词汇替换为方言 B 的对应词汇
     * @param {string} text - 原文
     * @param {string} sourceDialect - 源方言
     * @param {string} targetDialect - 目标方言
     * @returns {string} 翻译后的文本
     */
    _translateBetweenDialects(text, sourceDialect, targetDialect) {
        const sourceDict = this.dict.getDialect(sourceDialect);
        const targetDict = this.dict.getDialect(targetDialect);

        if (!sourceDict || !targetDict) return text;

        let result = text;

        // 建立源方言→含义→目标方言的映射
        const meaningToTarget = {};
        for (const [key, entry] of Object.entries(targetDict.words)) {
            const meaning = (entry.meaning || '').toLowerCase();
            meaningToTarget[meaning] = key;
        }

        // 遍历源方言词汇，在文本中查找并替换
        for (const [key, entry] of Object.entries(sourceDict.words)) {
            const meaning = (entry.meaning || '').toLowerCase();
            const targetWord = meaningToTarget[meaning];

            if (targetWord && targetWord !== key) {
                // 替换所有 forms
                const allForms = [key, ...(entry.forms || [])];
                for (const form of allForms) {
                    if (result.includes(form)) {
                        result = result.split(form).join(targetWord);
                        // 增加词频
                        this.dict.incrementFrequency(targetWord, targetDialect);
                    }
                }
            }
        }

        return result;
    }

    /**
     * 解密文本中嵌入的密文片段
     * @param {string} text
     * @param {string} agentId
     * @param {string[]} annotations
     * @returns {string}
     */
    _decryptEmbedded(text, agentId, annotations) {
        // 匹配 EVOLANG::v1::... 模式
        const pattern = /EVOLANG::v1::[^:\s]+::[a-f0-9]+::[a-f0-9]+::[a-f0-9]+/g;
        let match;

        while ((match = pattern.exec(text)) !== null) {
            const cipherFragment = match[0];
            const result = this.crypto.decrypt(cipherFragment, agentId);
            if (result.plaintext) {
                text = text.replace(cipherFragment, result.plaintext);
                annotations.push(`[EvoLang: 内嵌密文已解密, 来自 ${result.senderAgentId}]`);
            }
        }

        return text;
    }

    /**
     * 标注文本中出现的 EvoLang 词汇
     * 在方言词汇后添加含义注释
     * @param {string} text
     * @param {string} dialectName
     * @returns {string}
     */
    _annotateEvoLangWords(text, dialectName) {
        const dialect = this.dict.getDialect(dialectName);
        if (!dialect) return text;

        let annotated = text;

        for (const [key, entry] of Object.entries(dialect.words)) {
            const forms = [key, ...(entry.forms || [])];
            for (const form of forms) {
                // 只标注独立出现的词（避免误标注子字符串）
                const regex = new RegExp(`(?<![a-zA-Z])${this._escapeRegex(form)}(?![a-zA-Z])`, 'g');
                if (regex.test(annotated)) {
                    annotated = annotated.replace(regex, `${form}[=${entry.meaning}]`);
                    this.dict.incrementFrequency(key, dialectName);
                    break; // 一个词只标注一种 form
                }
            }
        }

        return annotated;
    }

    /**
     * 获取 Agent 的方言签名信息
     * @param {string} agentId
     * @returns {object}
     */
    getAgentDialectInfo(agentId) {
        const dialectName = this.dict.getAgentDialect(agentId);
        const dialect = this.dict.getDialect(dialectName);

        return {
            agentId,
            dialect: dialectName,
            displayName: dialect ? dialect.displayName : '未知',
            wordCount: dialect ? Object.keys(dialect.words).length : 0,
            hasCustomDialect: dialectName !== this.dict.defaultDialect
        };
    }

    /**
     * 验证消息的方言签名
     * 检查消息是否来自声称的 Agent
     * @param {string} message - 消息内容
     * @param {string} claimedAgentId - 声称的 Agent
     * @param {string} signature - 方言签名
     * @returns {{valid: boolean, reason: string}}
     */
    verifyMessageOrigin(message, claimedAgentId, signature) {
        const valid = this.crypto.verifySignature(message, claimedAgentId, signature);
        return {
            valid,
            reason: valid
                ? '方言签名验证通过，消息来源可信'
                : '方言签名验证失败，消息可能被篡改或发送者身份不匹配'
        };
    }

    /**
     * 正则转义
     * @param {string} str
     * @returns {string}
     * @private
     */
    _escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}

module.exports = DialectRouter;
