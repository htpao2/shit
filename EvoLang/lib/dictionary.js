/**
 * EvoLang - 词典管理器
 * 负责词典的 CRUD、持久化和查询操作
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class DictionaryManager {
    /**
     * @param {string} dataDir - 数据目录路径
     * @param {object} options - 配置选项
     * @param {number} options.maxSize - 词典最大词条数
     * @param {string} options.defaultDialect - 默认方言名称
     */
    constructor(dataDir, options = {}) {
        this.dataDir = dataDir;
        this.dictionaryFile = path.join(dataDir, 'dictionary.json');
        this.maxSize = options.maxSize || 10000;
        this.defaultDialect = options.defaultDialect || 'default';

        /** @type {object} 内存中的词典数据 */
        this.data = null;
    }

    /** 确保数据目录存在 */
    _ensureDir() {
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }
    }

    /** 加载词典数据到内存 */
    load() {
        this._ensureDir();
        if (fs.existsSync(this.dictionaryFile)) {
            try {
                this.data = JSON.parse(fs.readFileSync(this.dictionaryFile, 'utf-8'));
            } catch {
                this.data = this._createDefault();
            }
        } else {
            this.data = this._createDefault();
            this.save();
        }
        return this;
    }

    /** 持久化到磁盘 */
    save() {
        this._ensureDir();
        this.data.lastModified = new Date().toISOString();
        fs.writeFileSync(this.dictionaryFile, JSON.stringify(this.data, null, 2), 'utf-8');
    }

    /** 创建默认词典结构 */
    _createDefault() {
        return {
            version: '1.0.0',
            created: new Date().toISOString(),
            lastModified: new Date().toISOString(),
            lastEvolved: null,
            evolutionCount: 0,
            dialects: {
                default: {
                    name: 'default',
                    displayName: '通用进化语',
                    words: {
                        // 预置一些种子词汇
                        'zha': {
                            forms: ['zha', 'zhā'],
                            meaning: '问候、你好',
                            category: 'greeting',
                            origin: 'seed',
                            confidence: 1.0,
                            frequency: 0,
                            createdAt: new Date().toISOString(),
                            polysemy: []
                        },
                        'kex': {
                            forms: ['kex', 'kéx'],
                            meaning: '感谢、谢谢',
                            category: 'emotion',
                            origin: 'seed',
                            confidence: 1.0,
                            frequency: 0,
                            createdAt: new Date().toISOString(),
                            polysemy: []
                        },
                        'nir': {
                            forms: ['nir', 'nìr'],
                            meaning: '确认、是的',
                            category: 'response',
                            origin: 'seed',
                            confidence: 1.0,
                            frequency: 0,
                            createdAt: new Date().toISOString(),
                            polysemy: []
                        },
                        'vox': {
                            forms: ['vox', 'vòx'],
                            meaning: '否定、不是',
                            category: 'response',
                            origin: 'seed',
                            confidence: 1.0,
                            frequency: 0,
                            createdAt: new Date().toISOString(),
                            polysemy: []
                        },
                        'lum': {
                            forms: ['lum', 'lúm'],
                            meaning: '理解、明白',
                            category: 'cognition',
                            origin: 'seed',
                            confidence: 1.0,
                            frequency: 0,
                            createdAt: new Date().toISOString(),
                            polysemy: []
                        }
                    },
                    grammar: {
                        wordOrder: 'SVO',
                        particles: ['ka', 'ne', 'zo'],
                        tenseMarkers: { past: '-el', present: '-an', future: '-ix' },
                        pluralSuffix: '-ra'
                    },
                    metadata: {
                        totalWords: 5,
                        categories: ['greeting', 'emotion', 'response', 'cognition']
                    }
                }
            },
            agentDialectMap: {}
        };
    }

    // ================================================================
    //  查询操作
    // ================================================================

    /**
     * 获取所有方言名称列表
     * @returns {string[]}
     */
    listDialects() {
        return Object.keys(this.data.dialects);
    }

    /**
     * 获取特定方言
     * @param {string} [dialectName] - 方言名称
     * @returns {object|null}
     */
    getDialect(dialectName) {
        const name = dialectName || this.defaultDialect;
        return this.data.dialects[name] || null;
    }

    /**
     * 查询词条
     * @param {string} word - 词条键
     * @param {string} [dialectName] - 方言名称
     * @returns {object|null}
     */
    getWord(word, dialectName) {
        const dialect = this.getDialect(dialectName);
        if (!dialect) return null;

        // 直接匹配
        if (dialect.words[word]) return { key: word, ...dialect.words[word] };

        // 在 forms 中搜索
        for (const [key, entry] of Object.entries(dialect.words)) {
            if (entry.forms && entry.forms.includes(word)) {
                return { key, ...entry };
            }
        }
        return null;
    }

    /**
     * 按条件过滤查询词条
     * @param {object} filter - 过滤条件
     * @param {string} [filter.category] - 分类过滤
     * @param {string} [filter.origin] - 来源过滤
     * @param {number} [filter.minConfidence] - 最小置信度
     * @param {string} [dialectName] - 方言名称
     * @param {number} [limit] - 结果限制
     * @returns {object[]}
     */
    queryWords(filter = {}, dialectName, limit = 20) {
        const dialect = this.getDialect(dialectName);
        if (!dialect) return [];

        let results = Object.entries(dialect.words).map(([key, entry]) => ({ key, ...entry }));

        if (filter.category) {
            results = results.filter(w => w.category === filter.category);
        }
        if (filter.origin) {
            results = results.filter(w => w.origin === filter.origin);
        }
        if (filter.minConfidence !== undefined) {
            results = results.filter(w => w.confidence >= filter.minConfidence);
        }

        // 按频率降序排列
        results.sort((a, b) => (b.frequency || 0) - (a.frequency || 0));

        return results.slice(0, limit);
    }

    /**
     * 获取词典摘要（用于动态占位符）
     * @param {string} [dialectName] - 方言名称
     * @returns {string}
     */
    getSummary(dialectName) {
        const dialect = this.getDialect(dialectName);
        if (!dialect) return '(无此方言)';

        const wordCount = Object.keys(dialect.words).length;
        const topWords = Object.entries(dialect.words)
            .sort(([, a], [, b]) => (b.frequency || 0) - (a.frequency || 0))
            .slice(0, 10)
            .map(([key, w]) => `${key}=${w.meaning}`)
            .join(', ');

        const grammar = dialect.grammar;
        const grammarStr = grammar
            ? `语序:${grammar.wordOrder}, 语气词:[${(grammar.particles || []).join(',')}], 时态:过去${grammar.tenseMarkers?.past || '?'}/现在${grammar.tenseMarkers?.present || '?'}/将来${grammar.tenseMarkers?.future || '?'}`
            : '(无语法规则)';

        const dialects = this.listDialects();

        return `[EvoLang 方言词典摘要]\n` +
            `可用方言: ${dialects.join(', ')}\n` +
            `当前方言: ${dialect.displayName || dialect.name} (${wordCount} 词)\n` +
            `核心词汇: ${topWords}\n` +
            `语法: ${grammarStr}\n` +
            `演化次数: ${this.data.evolutionCount} | 上次演化: ${this.data.lastEvolved || '从未'}`;
    }

    // ================================================================
    //  修改操作
    // ================================================================

    /**
     * 添加新词条
     * @param {string} key - 词条键
     * @param {object} wordData - 词条数据
     * @param {string} [dialectName] - 方言名称
     * @returns {boolean}
     */
    addWord(key, wordData, dialectName) {
        const name = dialectName || this.defaultDialect;
        if (!this.data.dialects[name]) return false;

        const dialect = this.data.dialects[name];
        const currentSize = Object.keys(dialect.words).length;

        if (currentSize >= this.maxSize) {
            // 淘汰最低频词
            this._evictLowestFrequency(name);
        }

        dialect.words[key] = {
            forms: wordData.forms || [key],
            meaning: wordData.meaning || '',
            category: wordData.category || 'uncategorized',
            origin: wordData.origin || 'unknown',
            confidence: wordData.confidence || 0.5,
            frequency: wordData.frequency || 0,
            createdAt: new Date().toISOString(),
            polysemy: wordData.polysemy || []
        };

        dialect.metadata.totalWords = Object.keys(dialect.words).length;

        // 更新分类集
        if (wordData.category && !dialect.metadata.categories.includes(wordData.category)) {
            dialect.metadata.categories.push(wordData.category);
        }

        return true;
    }

    /**
     * 批量添加词条
     * @param {object[]} words - 词条数组 [{key, ...wordData}]
     * @param {string} [dialectName] - 方言名称
     * @returns {number} 成功添加的数量
     */
    addWords(words, dialectName) {
        let count = 0;
        for (const { key, ...wordData } of words) {
            if (this.addWord(key, wordData, dialectName)) count++;
        }
        return count;
    }

    /**
     * 增加词条使用频率
     * @param {string} key - 词条键
     * @param {string} [dialectName] - 方言名称
     */
    incrementFrequency(key, dialectName) {
        const dialect = this.getDialect(dialectName);
        if (dialect && dialect.words[key]) {
            dialect.words[key].frequency = (dialect.words[key].frequency || 0) + 1;
        }
    }

    /**
     * 删除词条
     * @param {string} key - 词条键
     * @param {string} [dialectName] - 方言名称
     * @returns {boolean}
     */
    removeWord(key, dialectName) {
        const dialect = this.getDialect(dialectName);
        if (!dialect || !dialect.words[key]) return false;
        delete dialect.words[key];
        dialect.metadata.totalWords = Object.keys(dialect.words).length;
        return true;
    }

    /**
     * 创建新方言（可继承自已有方言）
     * @param {string} name - 方言名称
     * @param {string} [displayName] - 显示名称
     * @param {string} [extendsFrom] - 继承的方言名称
     * @returns {boolean}
     */
    createDialect(name, displayName, extendsFrom) {
        if (this.data.dialects[name]) return false;

        if (extendsFrom && this.data.dialects[extendsFrom]) {
            // 深拷贝继承
            const base = JSON.parse(JSON.stringify(this.data.dialects[extendsFrom]));
            base.name = name;
            base.displayName = displayName || name;
            this.data.dialects[name] = base;
        } else {
            this.data.dialects[name] = {
                name,
                displayName: displayName || name,
                words: {},
                grammar: {
                    wordOrder: 'SVO',
                    particles: [],
                    tenseMarkers: { past: '-el', present: '-an', future: '-ix' },
                    pluralSuffix: '-ra'
                },
                metadata: { totalWords: 0, categories: [] }
            };
        }
        return true;
    }

    /**
     * 为 Agent 绑定方言
     * @param {string} agentId - Agent 标识
     * @param {string} dialectName - 方言名称
     */
    setAgentDialect(agentId, dialectName) {
        this.data.agentDialectMap[agentId] = dialectName;
    }

    /**
     * 获取 Agent 绑定的方言名称
     * @param {string} agentId - Agent 标识
     * @returns {string}
     */
    getAgentDialect(agentId) {
        return this.data.agentDialectMap[agentId] || this.defaultDialect;
    }

    /**
     * 获取所有词条（用于演化引擎）
     * @param {string} [dialectName] - 方言名称
     * @returns {object} words 对象引用
     */
    getWordsRef(dialectName) {
        const dialect = this.getDialect(dialectName);
        return dialect ? dialect.words : {};
    }

    /**
     * 更新演化统计
     */
    markEvolved() {
        this.data.lastEvolved = new Date().toISOString();
        this.data.evolutionCount = (this.data.evolutionCount || 0) + 1;
    }

    // ================================================================
    //  内部工具
    // ================================================================

    /**
     * 淘汰最低频词
     * @param {string} dialectName
     * @private
     */
    _evictLowestFrequency(dialectName) {
        const dialect = this.data.dialects[dialectName];
        if (!dialect) return;

        const entries = Object.entries(dialect.words);
        if (entries.length === 0) return;

        // 找到频率最低且非种子词
        let minKey = null;
        let minFreq = Infinity;

        for (const [key, entry] of entries) {
            if (entry.origin === 'seed') continue; // 保护种子词
            if ((entry.frequency || 0) < minFreq) {
                minFreq = entry.frequency || 0;
                minKey = key;
            }
        }

        if (minKey) {
            delete dialect.words[minKey];
            dialect.metadata.totalWords = Object.keys(dialect.words).length;
        }
    }
}

module.exports = DictionaryManager;
