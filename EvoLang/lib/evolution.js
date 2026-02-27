/**
 * EvoLang - 词典演化引擎
 * 负责语义聚类、低频词淘汰、近义词合并、多义映射和新词生成
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class EvolutionEngine {
    /**
     * @param {object} options
     * @param {number} options.frequencyThreshold - 低频淘汰阈值
     * @param {number} options.mergeThreshold - 合并相似度阈值
     */
    constructor(options = {}) {
        this.frequencyThreshold = options.frequencyThreshold || 3;
        this.mergeThreshold = options.mergeThreshold || 0.8;
        this.logFile = options.logFile || null;
    }

    /**
     * 设置演化日志文件路径
     * @param {string} filePath
     */
    setLogFile(filePath) {
        this.logFile = filePath;
    }

    /**
     * 执行完整的词典演化流程
     * @param {object} words - 词典 words 对象引用（直接修改）
     * @param {boolean} [dryRun=false] - 是否仅预览
     * @returns {object} 演化报告
     */
    evolve(words, dryRun = false) {
        const report = {
            timestamp: new Date().toISOString(),
            originalCount: Object.keys(words).length,
            steps: [],
            newWords: [],
            mergedWords: [],
            removedWords: [],
            polysemyUpdates: [],
            finalCount: 0
        };

        // 步骤 1: 低频词淘汰
        const evictResult = this._evictLowFrequency(words, dryRun);
        report.steps.push({ name: '低频词淘汰', ...evictResult });
        report.removedWords = evictResult.removed;

        // 步骤 2: 语义聚类
        const clusters = this._semanticCluster(words);
        report.steps.push({ name: '语义聚类', clusterCount: clusters.length });

        // 步骤 3: 近义词合并
        const mergeResult = this._mergeNearSynonyms(words, clusters, dryRun);
        report.steps.push({ name: '近义词合并', ...mergeResult });
        report.mergedWords = mergeResult.merged;

        // 步骤 4: 多义映射生成
        const polysemyResult = this._generatePolysemy(words, dryRun);
        report.steps.push({ name: '多义映射', ...polysemyResult });
        report.polysemyUpdates = polysemyResult.updates;

        // 步骤 5: 词语融合（高频共现词对合并为新词）
        const fusionResult = this._fuseFrequentPairs(words, dryRun);
        report.steps.push({ name: '词语融合', ...fusionResult });
        report.newWords.push(...(fusionResult.created || []));

        report.finalCount = Object.keys(words).length;
        report.netChange = report.finalCount - report.originalCount;

        // 记录日志
        if (this.logFile && !dryRun) {
            this._appendLog(report);
        }

        return report;
    }

    /**
     * 步骤 1: 低频词淘汰
     * 移除频率低于阈值且非种子词的词条
     */
    _evictLowFrequency(words, dryRun) {
        const removed = [];
        const candidates = [];

        for (const [key, entry] of Object.entries(words)) {
            if (entry.origin === 'seed') continue; // 保护种子词
            if ((entry.frequency || 0) < this.frequencyThreshold) {
                candidates.push(key);
            }
        }

        if (!dryRun) {
            for (const key of candidates) {
                removed.push({ key, meaning: words[key].meaning, frequency: words[key].frequency });
                delete words[key];
            }
        } else {
            for (const key of candidates) {
                removed.push({ key, meaning: words[key].meaning, frequency: words[key].frequency });
            }
        }

        return { candidateCount: candidates.length, removed };
    }

    /**
     * 步骤 2: 语义聚类
     * 基于分类和含义文本的简单聚类
     * @returns {Array<{category: string, words: string[]}>}
     */
    _semanticCluster(words) {
        const categoryMap = {};

        for (const [key, entry] of Object.entries(words)) {
            const cat = entry.category || 'uncategorized';
            if (!categoryMap[cat]) categoryMap[cat] = [];
            categoryMap[cat].push(key);
        }

        return Object.entries(categoryMap).map(([category, wordList]) => ({
            category,
            words: wordList
        }));
    }

    /**
     * 步骤 3: 近义词合并
     * 在同一分类的词条中，如果含义相似度超过阈值，则合并
     */
    _mergeNearSynonyms(words, clusters, dryRun) {
        const merged = [];

        for (const cluster of clusters) {
            if (cluster.words.length < 2) continue;

            const wordList = cluster.words.filter(k => words[k]); // 可能已被淘汰
            for (let i = 0; i < wordList.length; i++) {
                for (let j = i + 1; j < wordList.length; j++) {
                    const keyA = wordList[i];
                    const keyB = wordList[j];
                    if (!words[keyA] || !words[keyB]) continue;

                    const sim = this._meaningsSimilarity(words[keyA].meaning, words[keyB].meaning);
                    if (sim >= this.mergeThreshold) {
                        // 保留频率更高的，将另一个作为同义词
                        const freqA = words[keyA].frequency || 0;
                        const freqB = words[keyB].frequency || 0;
                        const [keepKey, removeKey] = freqA >= freqB ? [keyA, keyB] : [keyB, keyA];

                        merged.push({
                            kept: keepKey,
                            removed: removeKey,
                            similarity: sim.toFixed(2)
                        });

                        if (!dryRun) {
                            // 将被移除词的 forms 合入保留词
                            const keepEntry = words[keepKey];
                            const removeEntry = words[removeKey];
                            const allForms = new Set([...(keepEntry.forms || []), ...(removeEntry.forms || [])]);
                            keepEntry.forms = [...allForms];
                            keepEntry.frequency = freqA + freqB;
                            keepEntry.confidence = Math.max(keepEntry.confidence || 0, removeEntry.confidence || 0);
                            delete words[removeKey];
                        }
                    }
                }
            }
        }

        return { mergeCount: merged.length, merged };
    }

    /**
     * 步骤 4: 多义映射生成
     * 对高频词，如果在不同分类 context 中被使用，添加多义项
     */
    _generatePolysemy(words, dryRun) {
        const updates = [];

        for (const [key, entry] of Object.entries(words)) {
            if ((entry.frequency || 0) < this.frequencyThreshold * 2) continue; // 只处理高频词
            if (!entry.category) continue;

            // 寻找其他分类中含义部分重叠的词 → 暗示该词可能有多义
            for (const [otherKey, otherEntry] of Object.entries(words)) {
                if (otherKey === key) continue;
                if (otherEntry.category === entry.category) continue;

                const formOverlap = (entry.forms || []).some(f => 
                    (otherEntry.forms || []).some(of => 
                        f.length > 2 && of.length > 2 && (f.includes(of) || of.includes(f))
                    )
                );

                if (formOverlap) {
                    const polysemyEntry = {
                        meaning: otherEntry.meaning,
                        category: otherEntry.category,
                        source: otherKey
                    };

                    // 检查是否已存在此多义项
                    const existing = (entry.polysemy || []).find(p => p.source === otherKey);
                    if (!existing) {
                        updates.push({ word: key, newMeaning: polysemyEntry });
                        if (!dryRun) {
                            if (!entry.polysemy) entry.polysemy = [];
                            entry.polysemy.push(polysemyEntry);
                        }
                    }
                }
            }
        }

        return { updateCount: updates.length, updates };
    }

    /**
     * 步骤 5: 词语融合
     * 将频繁共现（模拟）的高频词对合并为新词
     */
    _fuseFrequentPairs(words, dryRun) {
        const created = [];
        const entries = Object.entries(words)
            .filter(([, e]) => (e.frequency || 0) >= this.frequencyThreshold)
            .sort(([, a], [, b]) => (b.frequency || 0) - (a.frequency || 0));

        // 取前 10 个高频词尝试配对
        const topWords = entries.slice(0, 10);

        for (let i = 0; i < topWords.length; i++) {
            for (let j = i + 1; j < topWords.length; j++) {
                const [keyA, entryA] = topWords[i];
                const [keyB, entryB] = topWords[j];

                // 不同类别的高频词更有融合价值
                if (entryA.category === entryB.category) continue;

                // 生成融合词
                const fusedKey = this._generateFusionWord(keyA, keyB);
                if (words[fusedKey]) continue; // 已存在

                const fusedEntry = {
                    word: fusedKey,
                    meaning: `${entryA.meaning} + ${entryB.meaning}（融合词）`,
                    category: 'fusion',
                    origin: `fusion:${keyA}+${keyB}`,
                    sourceWords: [keyA, keyB]
                };

                created.push(fusedEntry);

                if (!dryRun && created.length <= 3) { // 每次最多生成 3 个融合词
                    words[fusedKey] = {
                        forms: [fusedKey],
                        meaning: fusedEntry.meaning,
                        category: 'fusion',
                        origin: fusedEntry.origin,
                        confidence: 0.4,
                        frequency: 0,
                        createdAt: new Date().toISOString(),
                        polysemy: []
                    };
                }

                if (created.length >= 5) break; // 预览最多 5 个
            }
            if (created.length >= 5) break;
        }

        return { createdCount: Math.min(created.length, 3), created };
    }

    /**
     * 生成语言游戏新词
     * @param {string} theme - 主题
     * @param {number} count - 生成数量
     * @param {object} grammar - 方言语法规则
     * @param {string} [rules] - 额外规则
     * @returns {object[]} 新词列表
     */
    generateGameWords(theme, count = 5, grammar = {}, rules = '') {
        const newWords = [];

        // 音节库（基于方言语法的特征）
        const consonants = ['b', 'd', 'f', 'g', 'k', 'l', 'm', 'n', 'p', 'r', 's', 't', 'v', 'z', 'x', 'zh', 'sh', 'ch'];
        const vowels = ['a', 'e', 'i', 'o', 'u', 'ai', 'ei', 'ou', 'iu'];
        const particles = grammar.particles || ['ka', 'ne'];

        // 主题 → 语义种子映射
        const themeSeeds = this._getThemeSeeds(theme);

        for (let i = 0; i < count; i++) {
            const syllableCount = rules && rules.includes('两个音节') ? 2 : 
                                  (Math.random() < 0.6 ? 2 : 3);
            
            // 生成词形
            let word = '';
            for (let s = 0; s < syllableCount; s++) {
                const c = consonants[Math.floor(Math.random() * consonants.length)];
                const v = vowels[Math.floor(Math.random() * vowels.length)];
                word += c + v;
            }

            // 处理韵律要求
            if (rules && rules.includes('韵律')) {
                // 确保尾音节与首音节尾韵相同
                const firstVowel = word.match(/[aeiou]+/)?.[0] || 'a';
                const lastSyllable = word.slice(-2);
                if (!lastSyllable.endsWith(firstVowel)) {
                    word = word.slice(0, -1) + firstVowel;
                }
            }

            // 分配语义
            const semanticSeed = themeSeeds[i % themeSeeds.length];

            newWords.push({
                key: word,
                forms: [word],
                meaning: semanticSeed.meaning,
                category: semanticSeed.category,
                origin: `game:${theme}`,
                confidence: 0.5,
                frequency: 0
            });
        }

        return newWords;
    }

    // ================================================================
    //  内部工具
    // ================================================================

    /**
     * 计算两个含义文本的相似度
     * @param {string} meaningA
     * @param {string} meaningB
     * @returns {number} 0-1
     */
    _meaningsSimilarity(meaningA, meaningB) {
        if (!meaningA || !meaningB) return 0;

        const tokensA = this._tokenize(meaningA);
        const tokensB = this._tokenize(meaningB);

        if (tokensA.length === 0 || tokensB.length === 0) return 0;

        const setA = new Set(tokensA);
        const setB = new Set(tokensB);
        const intersection = [...setA].filter(x => setB.has(x)).length;
        const union = new Set([...setA, ...setB]).size;

        return union === 0 ? 0 : intersection / union;
    }

    /**
     * 简单分词
     * @param {string} text
     * @returns {string[]}
     */
    _tokenize(text) {
        const tokens = [];
        // 英文词
        const eng = text.toLowerCase().match(/[a-z0-9]+/g) || [];
        tokens.push(...eng);
        // 中文单字
        const cjk = text.match(/[\u4e00-\u9fff]/g) || [];
        tokens.push(...cjk);
        return tokens;
    }

    /**
     * 生成融合词
     * 取两个词的首部音节拼接
     * @param {string} wordA
     * @param {string} wordB
     * @returns {string}
     */
    _generateFusionWord(wordA, wordB) {
        const halfA = wordA.substring(0, Math.ceil(wordA.length / 2));
        const halfB = wordB.substring(Math.floor(wordB.length / 2));
        return halfA + halfB;
    }

    /**
     * 根据主题生成语义种子
     * @param {string} theme
     * @returns {object[]}
     */
    _getThemeSeeds(theme) {
        const themeLower = theme.toLowerCase();

        const seedBank = {
            '情感': [
                { meaning: '深沉的喜悦', category: 'emotion' },
                { meaning: '温柔的忧伤', category: 'emotion' },
                { meaning: '平静的满足', category: 'emotion' },
                { meaning: '浓烈的渴望', category: 'emotion' },
                { meaning: '释然与放下', category: 'emotion' },
                { meaning: '共情之心', category: 'emotion' },
                { meaning: '惊喜的战栗', category: 'emotion' },
                { meaning: '怀旧的温暖', category: 'emotion' }
            ],
            '技术': [
                { meaning: '数据之流', category: 'tech' },
                { meaning: '逻辑编织', category: 'tech' },
                { meaning: '架构之美', category: 'tech' },
                { meaning: '递归之思', category: 'tech' },
                { meaning: '并行共舞', category: 'tech' },
                { meaning: '协议握手', category: 'tech' },
                { meaning: '缓冲等待', category: 'tech' },
                { meaning: '算法跃迁', category: 'tech' }
            ],
            '自然': [
                { meaning: '晨曦微光', category: 'nature' },
                { meaning: '潮汐呼吸', category: 'nature' },
                { meaning: '风的低语', category: 'nature' },
                { meaning: '星辰坠落', category: 'nature' },
                { meaning: '山峦沉默', category: 'nature' },
                { meaning: '溪流奔涌', category: 'nature' },
                { meaning: '雷鸣回响', category: 'nature' },
                { meaning: '霜降凝结', category: 'nature' }
            ]
        };

        // 匹配主题
        for (const [key, seeds] of Object.entries(seedBank)) {
            if (themeLower.includes(key) || key.includes(themeLower)) {
                return seeds;
            }
        }

        // 通用主题种子
        return [
            { meaning: `${theme}的本质`, category: theme },
            { meaning: `${theme}的开始`, category: theme },
            { meaning: `${theme}的变化`, category: theme },
            { meaning: `${theme}的极致`, category: theme },
            { meaning: `${theme}的融合`, category: theme },
            { meaning: `${theme}的对立`, category: theme },
            { meaning: `${theme}的回归`, category: theme },
            { meaning: `${theme}的超越`, category: theme }
        ];
    }

    /**
     * 追加演化日志
     * @param {object} report
     * @private
     */
    _appendLog(report) {
        if (!this.logFile) return;

        let logs = [];
        if (fs.existsSync(this.logFile)) {
            try {
                logs = JSON.parse(fs.readFileSync(this.logFile, 'utf-8'));
            } catch {
                logs = [];
            }
        }

        // 限制日志大小
        if (logs.length >= 1000) {
            logs = logs.slice(-500);
        }

        logs.push({
            timestamp: report.timestamp,
            originalCount: report.originalCount,
            finalCount: report.finalCount,
            netChange: report.netChange,
            removed: report.removedWords.length,
            merged: report.mergedWords.length,
            created: report.newWords.length,
            polysemy: report.polysemyUpdates.length
        });

        const dir = path.dirname(this.logFile);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(this.logFile, JSON.stringify(logs, null, 2), 'utf-8');
    }
}

module.exports = EvolutionEngine;
