// KnowledgeBaseManager.js
// 🌟 架构重构修复版：多路独立索引 + 稳健的 Buffer 处理 + 同步缓存回退 + TagMemo 逻辑回归

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const chokidar = require('chokidar');
const { chunkText } = require('./TextChunker'); 
const { getEmbeddingsBatch } = require('./EmbeddingUtils');

// 尝试加载 Rust Vexus 引擎
let VexusIndex = null;
try {
    const vexusModule = require('./rust-vexus-lite');
    VexusIndex = vexusModule.VexusIndex;
    console.log('[KnowledgeBase] 🦀 Vexus-Lite Rust engine loaded');
} catch (e) {
    console.error('[KnowledgeBase] ❌ Critical: Vexus-Lite not found.');
    process.exit(1);
}

class KnowledgeBaseManager {
    constructor(config = {}) {
        this.config = {
            rootPath: config.rootPath || path.join(__dirname, 'dailynote'),
            storePath: config.storePath || path.join(__dirname, 'VectorStore'),
            apiKey: process.env.API_Key,
            apiUrl: process.env.API_URL,
            model: process.env.WhitelistEmbeddingModel || 'google/gemini-embedding-001',
            // ⚠️ 务必确认环境变量 VECTORDB_DIMENSION 与模型一致 (3-small通常为1536)
            dimension: parseInt(process.env.VECTORDB_DIMENSION) || 3072,
            
            batchWindow: 2000,
            maxBatchSize: 50,
            indexSaveDelay: 60000,
            
            ignoreFolders: (process.env.IGNORE_FOLDERS || 'VCP论坛').split(',').map(f => f.trim()).filter(Boolean),
            ignorePrefixes: (process.env.IGNORE_PREFIX || '已整理').split(',').map(p => p.trim()).filter(Boolean),
            ignoreSuffixes: (process.env.IGNORE_SUFFIX || '夜伽').split(',').map(s => s.trim()).filter(Boolean),

            tagBlacklist: new Set((process.env.TAG_BLACKLIST || '').split(',').map(t => t.trim()).filter(Boolean)),
            tagBlacklistSuper: (process.env.TAG_BLACKLIST_SUPER || '').split(',').map(t => t.trim()).filter(Boolean),
            tagExpandMaxCount: parseInt(process.env.TAG_EXPAND_MAX_COUNT, 10) || 30,
            fullScanOnStartup: (process.env.KNOWLEDGEBASE_FULL_SCAN_ON_STARTUP || 'true').toLowerCase() === 'true',
            ...config
        };

        this.db = null;
        this.diaryIndices = new Map(); 
        this.tagIndex = null;
        this.watcher = null;
        this.initialized = false;
        this.diaryNameVectorCache = new Map();
        this.pendingFiles = new Set();
        this.batchTimer = null;
        this.isProcessing = false;
        this.saveTimers = new Map();
        this.tagCooccurrenceMatrix = null; // 优化1：Tag共现矩阵
        this.transientIndices = new Map(); // 🌟 新增：临时索引存储 Map<resultId, { index: VexusIndex, chunks: Array, timer: Timeout }>
    }

    async initialize() {
        if (this.initialized) return;
        console.log(`[KnowledgeBase] Initializing Multi-Index System (Dim: ${this.config.dimension})...`);

        await fs.mkdir(this.config.storePath, { recursive: true });

        const dbPath = path.join(this.config.storePath, 'knowledge_base.sqlite');
        this.db = new Database(dbPath); // 同步连接
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('synchronous = NORMAL');

        this._initSchema();
        
        // 1. 初始化全局 Tag 索引 (异步恢复)
        const tagIdxPath = path.join(this.config.storePath, 'index_global_tags.usearch');
        const tagCapacity = 50000;
        try {
            if (fsSync.existsSync(tagIdxPath)) {
                this.tagIndex = VexusIndex.load(tagIdxPath, null, this.config.dimension, tagCapacity);
                console.log('[KnowledgeBase] ✅ Tag index loaded from disk.');
            } else {
                console.log('[KnowledgeBase] Tag index file not found, creating new one.');
                this.tagIndex = new VexusIndex(this.config.dimension, tagCapacity);
                this._recoverTagsAsync(); // Fire-and-forget
            }
        } catch (e) {
            console.error(`[KnowledgeBase] Failed to load tag index: ${e.message}. Rebuilding in background.`);
            this.tagIndex = new VexusIndex(this.config.dimension, tagCapacity);
            this._recoverTagsAsync(); // Fire-and-forget
        }
        
        // 2. 预热日记本名称向量缓存（同步阻塞，确保 RAG 插件启动即可用）
        this._hydrateDiaryNameCacheSync();
        
        // 优化1：启动时构建共现矩阵
        this._buildCooccurrenceMatrix();

        this._startWatcher();
        this.initialized = true;
        console.log('[KnowledgeBase] ✅ System Ready');
    }

    _initSchema() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                path TEXT UNIQUE NOT NULL,
                diary_name TEXT NOT NULL,
                checksum TEXT NOT NULL,
                mtime INTEGER NOT NULL,
                size INTEGER NOT NULL,
                updated_at INTEGER
            );
            CREATE TABLE IF NOT EXISTS chunks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_id INTEGER NOT NULL,
                chunk_index INTEGER NOT NULL,
                content TEXT NOT NULL,
                vector BLOB,
                FOREIGN KEY(file_id) REFERENCES files(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS tags (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                vector BLOB
            );
            CREATE TABLE IF NOT EXISTS file_tags (
                file_id INTEGER NOT NULL,
                tag_id INTEGER NOT NULL,
                PRIMARY KEY (file_id, tag_id),
                FOREIGN KEY(file_id) REFERENCES files(id) ON DELETE CASCADE,
                FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS kv_store (
                key TEXT PRIMARY KEY,
                value TEXT,
                vector BLOB
            );
            CREATE INDEX IF NOT EXISTS idx_files_diary ON files(diary_name);
            CREATE INDEX IF NOT EXISTS idx_chunks_file ON chunks(file_id);
            CREATE INDEX IF NOT EXISTS idx_file_tags_tag ON file_tags(tag_id);
            CREATE INDEX IF NOT EXISTS idx_file_tags_composite ON file_tags(tag_id, file_id);
        `);
    }

    // 🏭 索引工厂
    async _getOrLoadDiaryIndex(diaryName) {
        if (this.diaryIndices.has(diaryName)) {
            return this.diaryIndices.get(diaryName);
        }
        console.log(`[KnowledgeBase] 📂 Lazy loading index for diary: "${diaryName}"`);
        const safeName = crypto.createHash('md5').update(diaryName).digest('hex');
        const idxName = `diary_${safeName}`;
        const idx = await this._loadOrBuildIndex(idxName, 50000, 'chunks', diaryName);
        this.diaryIndices.set(diaryName, idx);
        return idx;
    }

    async _loadOrBuildIndex(fileName, capacity, tableType, filterDiaryName = null) {
        const idxPath = path.join(this.config.storePath, `index_${fileName}.usearch`);
        let idx;
        try {
            if (fsSync.existsSync(idxPath)) {
                idx = VexusIndex.load(idxPath, null, this.config.dimension, capacity);
            } else {
                // 💡 核心修复：如果索引文件不存在，说明是首次创建。
                // 此时不应从数据库恢复，因为调用者（_flushBatch）正准备写入初始数据。
                // 从数据库恢复的逻辑只适用于启动时加载或文件损坏后的重建。
                console.log(`[KnowledgeBase] Index file not found for ${fileName}, creating a new empty one.`);
                idx = new VexusIndex(this.config.dimension, capacity);
            }
        } catch (e) {
            console.error(`[KnowledgeBase] Index load error (${fileName}): ${e.message}`);
            console.warn(`[KnowledgeBase] Rebuilding index ${fileName} from DB as a fallback...`);
            idx = new VexusIndex(this.config.dimension, capacity);
            await this._recoverIndexFromDB(idx, tableType, filterDiaryName);
        }
        return idx;
    }

    async _recoverIndexFromDB(vexusIdx, table, diaryName) {
        console.log(`[KnowledgeBase] 🔄 Recovering ${table} (Filter: ${diaryName || 'None'}) via Rust...`);
        try {
            const dbPath = path.join(this.config.storePath, 'knowledge_base.sqlite');
            // 注意：NAPI-RS 暴露的函数名是驼峰式
            const count = await vexusIdx.recoverFromSqlite(dbPath, table, diaryName || null);
            console.log(`[KnowledgeBase] ✅ Recovered ${count} vectors via Rust.`);
        } catch (e) {
            console.error(`[KnowledgeBase] ❌ Rust recovery failed for ${table}:`, e);
        }
    }

    async _recoverTagsAsync() {
        console.log('[KnowledgeBase] 🚀 Starting background recovery of tag index via Rust...');
        // 使用 setImmediate 将这个潜在的 CPU 密集型任务推迟到下一个事件循环
        // 这样可以确保 initialize() 函数本身能够快速返回
        setImmediate(async () => {
            try {
                const dbPath = path.join(this.config.storePath, 'knowledge_base.sqlite');
                const count = await this.tagIndex.recoverFromSqlite(dbPath, 'tags', null);
                console.log(`[KnowledgeBase] ✅ Background tag recovery complete. ${count} vectors indexed via Rust.`);
                // 恢复完成后，保存一次索引以备下次直接加载
                this._saveIndexToDisk('global_tags');
            } catch (e) {
                console.error('[KnowledgeBase] ❌ Background tag recovery failed:', e);
            }
        });
    }

    // =========================================================================
    // 🌟 临时内容索引 (Transient Content Indexing)
    // =========================================================================

    /**
     * 将临时内容建立索引，返回 resultId
     * @param {string} content - 需要索引的长文本内容
     * @param {number} ttlMs - 存活时间 (毫秒)，默认 30 分钟
     * @returns {Promise<string>} resultId
     */
    async addTransientContent(content, ttlMs = 30 * 60 * 1000) {
        const resultId = `res_${crypto.randomUUID()}`;
        console.log(`[KnowledgeBase] ⚡ Creating transient index for ${resultId} (TTL: ${ttlMs}ms)...`);

        try {
            // 1. 分块
            const chunks = chunkText(content);
            if (chunks.length === 0) return null;

            // 2. 向量化
            const cleanedChunks = chunks.map(c => this._prepareTextForEmbedding(c)).filter(c => c !== '[EMPTY_CONTENT]');
            if (cleanedChunks.length === 0) return null;

            const vectors = await getEmbeddingsBatch(cleanedChunks, {
                apiKey: this.config.apiKey,
                apiUrl: this.config.apiUrl,
                model: this.config.model
            });

            // 3. 建立内存索引
            // 注意：这里我们创建一个全新的 VexusIndex 实例，不关联任何文件
            const idx = new VexusIndex(this.config.dimension, cleanedChunks.length + 100);
            
            cleanedChunks.forEach((text, i) => {
                if (vectors[i]) {
                    const vecBuf = Buffer.from(new Float32Array(vectors[i]).buffer);
                    // 使用 chunk index 作为 ID (0, 1, 2...)
                    // 注意：Vexus 的 ID 通常是 64 位整数，这里用简单索引即可
                    idx.add(i, vecBuf);
                }
            });

            // 4. 存储到 transientIndices
            const timer = setTimeout(() => {
                this._destroyTransientIndex(resultId);
            }, ttlMs);

            this.transientIndices.set(resultId, {
                index: idx,
                chunks: cleanedChunks, // 需要保存原文以便检索时返回
                timer: timer,
                createdAt: Date.now()
            });

            console.log(`[KnowledgeBase] ✅ Transient index ${resultId} created with ${cleanedChunks.length} chunks.`);
            return resultId;

        } catch (e) {
            console.error(`[KnowledgeBase] ❌ Failed to create transient index:`, e);
            return null;
        }
    }

    _destroyTransientIndex(resultId) {
        const data = this.transientIndices.get(resultId);
        if (data) {
            clearTimeout(data.timer);
            // 如果 VexusIndex 有显式的释放方法，可以在这里调用
            // data.index.free(); // 假设有这个方法，如果没有则依赖 GC
            this.transientIndices.delete(resultId);
            console.log(`[KnowledgeBase] 🗑️ Transient index ${resultId} destroyed (TTL expired).`);
        }
    }

    /**
     * 在临时索引中搜索
     * @param {string} resultId
     * @param {Array<number>} queryVector
     * @param {number} k
     */
    async searchTransientContent(resultId, queryVector, k = 5) {
        const data = this.transientIndices.get(resultId);
        if (!data) {
            console.warn(`[KnowledgeBase] Transient index ${resultId} not found or expired.`);
            return [];
        }

        try {
            const searchVecFloat = new Float32Array(queryVector);
            const searchBuffer = Buffer.from(searchVecFloat.buffer, searchVecFloat.byteOffset, searchVecFloat.byteLength);
            
            const results = data.index.search(searchBuffer, k);
            
            return results.map(res => {
                // res.id 对应 chunks 数组的下标
                const text = data.chunks[res.id];
                if (!text) return null;
                return {
                    text: text,
                    score: res.score,
                    source: 'Transient Tool Result'
                };
            }).filter(Boolean);

        } catch (e) {
            console.error(`[KnowledgeBase] Transient search error (${resultId}):`, e);
            return [];
        }
    }

    // =========================================================================
    // 核心搜索接口 (修复版)
    // =========================================================================

    async search(arg1, arg2, arg3, arg4) {
        try {
            let diaryName = null;
            let queryVec = null;
            let k = 5;
            let tagBoost = 0;

            if (typeof arg1 === 'string' && Array.isArray(arg2)) {
                diaryName = arg1;
                queryVec = arg2;
                k = arg3 || 5;
                tagBoost = arg4 || 0;
            } else if (typeof arg1 === 'string') {
                // 纯文本搜索暂略，通常插件会先向量化
                return [];
            } else if (Array.isArray(arg1)) {
                queryVec = arg1;
                k = arg2 || 5;
                tagBoost = arg3 || 0;
            }

            if (!queryVec) return [];

            if (diaryName) {
                return await this._searchSpecificIndex(diaryName, queryVec, k, tagBoost);
            } else {
                return await this._searchAllIndices(queryVec, k, tagBoost);
            }
        } catch (e) {
            console.error('[KnowledgeBase] Search Error:', e);
            return [];
        }
    }

    async _searchSpecificIndex(diaryName, vector, k, tagBoost) {
        const idx = await this._getOrLoadDiaryIndex(diaryName);
        
        // 如果索引为空，直接返回
        // 注意：vexus-lite-js 可能没有 size() 方法，用 catch 捕获
        try {
            const stats = idx.stats ? idx.stats() : { totalVectors: 1 };
            if (stats.totalVectors === 0) return [];
        } catch(e) {}

        // 🛠️ 修复 1: 安全的 Buffer 转换
        let searchBuffer;
        let tagInfo = null;

        try {
            let searchVecFloat;
            if (tagBoost > 0) {
                // 🌟 TagMemo 逻辑回归：应用 Tag 增强
                const boostResult = this._applyTagBoost(new Float32Array(vector), tagBoost);
                searchVecFloat = boostResult.vector;
                tagInfo = boostResult.info;
            } else {
                searchVecFloat = new Float32Array(vector);
            }
            
            // ⚠️ 维度检查
            if (searchVecFloat.length !== this.config.dimension) {
                console.error(`[KnowledgeBase] Dimension mismatch! Expected ${this.config.dimension}, got ${searchVecFloat.length}`);
                return [];
            }

            // ⚠️ 使用 byteOffset 和 byteLength 确保 Buffer 视图正确
            searchBuffer = Buffer.from(searchVecFloat.buffer, searchVecFloat.byteOffset, searchVecFloat.byteLength);
        } catch (err) {
            console.error(`[KnowledgeBase] Buffer conversion failed: ${err.message}`);
            return [];
        }

        let results = [];
        try {
            results = idx.search(searchBuffer, k);
        } catch (e) {
            // 🛠️ 修复 2: 详细的错误日志
            console.error(`[KnowledgeBase] Vexus search failed for "${diaryName}":`, e.message || e);
            return [];
        }

        // Hydrate results
        const hydrate = this.db.prepare(`
            SELECT c.content as text, f.path as sourceFile, f.updated_at
            FROM chunks c
            JOIN files f ON c.file_id = f.id
            WHERE c.id = ?
        `);

        return results.map(res => {
            const row = hydrate.get(res.id); // res.id 来自 Vexus (即 chunk.id)
            if (!row) return null;
            return {
                text: row.text,
                score: res.score, // 确保 Vexus 返回的是 score (或 distance，需自行反转)
                sourceFile: path.basename(row.sourceFile),
                fullPath: row.sourceFile,
                matchedTags: tagInfo ? tagInfo.matchedTags : [],
                boostFactor: tagInfo ? tagInfo.boostFactor : 0,
                tagMatchScore: tagInfo ? tagInfo.totalSpikeScore : 0, // ✅ 新增
                tagMatchCount: tagInfo ? tagInfo.matchedTags.length : 0 // ✅ 新增
            };
        }).filter(Boolean);
    }

    async _searchAllIndices(vector, k, tagBoost) {
        // 优化2：使用 Promise.all 并行搜索
        let searchVecFloat;
        let tagInfo = null;

        if (tagBoost > 0) {
            const boostResult = this._applyTagBoost(new Float32Array(vector), tagBoost);
            searchVecFloat = boostResult.vector;
            tagInfo = boostResult.info;
        } else {
            searchVecFloat = new Float32Array(vector);
        }
        
        const searchBuffer = Buffer.from(searchVecFloat.buffer, searchVecFloat.byteOffset, searchVecFloat.byteLength);

        const allDiaries = this.db.prepare('SELECT DISTINCT diary_name FROM files').all();
        
        const searchPromises = allDiaries.map(async ({ diary_name }) => {
            try {
                const idx = await this._getOrLoadDiaryIndex(diary_name);
                const stats = idx.stats ? idx.stats() : { totalVectors: 1 };
                if (stats.totalVectors === 0) return [];
                return idx.search(searchBuffer, k);
            } catch (e) {
                console.error(`[KnowledgeBase] Vexus search error in parallel global search (${diary_name}):`, e);
                return [];
            }
        });

        const resultsPerIndex = await Promise.all(searchPromises);
        let allResults = resultsPerIndex.flat();
        
        allResults.sort((a, b) => b.score - a.score);
        
        const topK = allResults.slice(0, k);

        const hydrate = this.db.prepare(`
            SELECT c.content as text, f.path as sourceFile
            FROM chunks c JOIN files f ON c.file_id = f.id WHERE c.id = ?
        `);

        return topK.map(res => {
            const row = hydrate.get(res.id);
            return row ? {
                text: row.text,
                score: res.score,
                sourceFile: path.basename(row.sourceFile),
                matchedTags: tagInfo ? tagInfo.matchedTags : [],
                boostFactor: tagInfo ? tagInfo.boostFactor : 0,
                tagMatchScore: tagInfo ? tagInfo.totalSpikeScore : 0,
                tagMatchCount: tagInfo ? tagInfo.matchedTags.length : 0
            } : null;
        }).filter(Boolean);
    }

    // 🌟 TagMemo 最终修复版：带调试探针 + 强类型安全 + 高对比度突触
    _applyTagBoost(vector, tagBoost) {
        // 调试探针：每 50 次调用才打印一次，避免刷屏，但能看到是否在工作
        const debug = true;
        
        try {
            // [步骤 1] 数据类型防御性转换
            let searchBuffer;
            let originalFloat32;
            
            if (vector instanceof Float32Array) {
                originalFloat32 = vector;
                searchBuffer = Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength);
            } else if (Array.isArray(vector)) {
                originalFloat32 = new Float32Array(vector);
                searchBuffer = Buffer.from(originalFloat32.buffer);
            } else {
                if(debug) console.warn('[TagMemo] ❌ Vector input type invalid:', typeof vector);
                return { vector: vector, info: null };
            }

            // [步骤 2] Tag 索引召回 (Tag海握手)
            // 注意：Vexus 搜索如果不传 k，或者索引为空，可能抛错或返回空
            let tagResults = [];
            try {
                // 确保索引已初始化且有数据
                // if (this.tagIndex && this.tagIndex.size() > 0) ... (vexus-lite 可能没有 size 方法，跳过)
                tagResults = this.tagIndex.search(searchBuffer, 10);
            } catch (e) {
                if(debug) console.warn('[TagMemo] ⚠️ Vexus search exception:', e.message);
                return { vector: vector, info: null };
            }
            
            // 🚨 探针 A：如果这里是 0，说明 Tag 索引没数据，或者维度不对
            if (tagResults.length === 0) {
                if(debug) console.log('[TagMemo] ⚠️ No tags found in index. (Index empty or dimension mismatch?)');
                return { vector: vector, info: null };
            }

            const tagIds = tagResults.map(r => r.id);
            const placeholders = tagIds.map(() => '?').join(',');

            // [步骤 3] 优化1：从预计算的共现矩阵中查找关联Tag
            const coTags = new Map(); // Map<tagId, totalWeight>
            tagResults.forEach(t1 => {
                const relatedMap = this.tagCooccurrenceMatrix.get(t1.id);
                if (relatedMap) {
                    relatedMap.forEach((weight, t2Id) => {
                        if (!tagIds.includes(t2Id)) { // 排除原始Tag
                           coTags.set(t2Id, (coTags.get(t2Id) || 0) + weight * t1.score); // 权重叠加
                        }
                    });
                }
            });

            const sortedCoTags = Array.from(coTags.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, this.config.tagExpandMaxCount);

            let relatedTags = [];
            if (sortedCoTags.length > 0) {
                const relatedTagIds = sortedCoTags.map(t => t[0]);
                const relatedPlaceholders = relatedTagIds.map(() => '?').join(',');
                const stmt = this.db.prepare(`
                    SELECT
                        id, name, vector,
                        (SELECT COUNT(*) FROM file_tags WHERE tag_id = tags.id) as global_freq
                    FROM tags
                    WHERE id IN (${relatedPlaceholders})
                `);
                const tagInfoMap = new Map(stmt.all(...relatedTagIds).map(t => [t.id, t]));
                
                relatedTags = sortedCoTags.map(([id, weight]) => {
                    const info = tagInfoMap.get(id);
                    return info ? { ...info, co_weight: weight } : null;
                }).filter(Boolean);
            }

            // 🚨 探针 B：如果这里是 0，说明 file_tags 表是空的，或者 Tag 之间没有关联
            // 启用【回退策略】：如果找不到扩展词，直接使用步骤 2 召回的 Tag 作为上下文
            if (relatedTags.length === 0) {
                if(debug) console.log(`[TagMemo] ℹ️ Sparse graph (0 relations). Fallback to ${tagIds.length} direct tags.`);
                
                const getDirectTags = this.db.prepare(`SELECT id, name, vector, 10 as co_weight, 100 as global_freq FROM tags WHERE id IN (${placeholders})`);
                relatedTags = getDirectTags.all(...tagIds);
                
                if (relatedTags.length === 0) return { vector: vector, info: null }; // 彻底没救了
            }

            // [步骤 4] 向量合成 (高对比度算法)
            const dim = originalFloat32.length;
            const contextVec = new Float32Array(dim);
            let totalSpikeScore = 0;
            
            relatedTags.forEach(t => {
                if (!t.vector) return;
                
                // 必须从 Buffer 转回 Float32Array
                const v = new Float32Array(t.vector.buffer, t.vector.byteOffset, dim);
                
                // 💡 核心算法：指数级毛刺增强 + 对数级降噪
                // 1. 基础强度：共现次数的 2.5 次方
                let logicStrength = Math.pow(t.co_weight || 1, 2.5);
                
                // 2. 降噪因子：全局频率的对数
                let noisePenalty = Math.log((t.global_freq || 1) + 2);
                
                // 3. 最终得分
                let score = logicStrength / noisePenalty;
                
                // 安全检查
                if (!isFinite(score) || isNaN(score)) score = 0;

                for (let i = 0; i < dim; i++) {
                    contextVec[i] += v[i] * score;
                }
                totalSpikeScore += score;
            });
            
            // 归一化上下文向量
            if (totalSpikeScore > 0) {
                let mag = 0;
                for (let i = 0; i < dim; i++) {
                    contextVec[i] /= totalSpikeScore; // 平均化
                    mag += contextVec[i] * contextVec[i];
                }
                mag = Math.sqrt(mag);
                // 再次单位化，确保方向纯净
                if (mag > 1e-9) {
                    for (let i = 0; i < dim; i++) contextVec[i] /= mag;
                }
            } else {
                return { vector: vector, info: null }; // 计算出问题，回退
            }

            // [步骤 5] 最终融合
            const fused = new Float32Array(dim);
            let fusedMag = 0;
            for (let i = 0; i < dim; i++) {
                fused[i] = (1 - tagBoost) * originalFloat32[i] + tagBoost * contextVec[i];
                fusedMag += fused[i] * fused[i];
            }
            
            // 最终结果单位化
            fusedMag = Math.sqrt(fusedMag);
            if (fusedMag > 1e-9) {
                for (let i = 0; i < dim; i++) fused[i] /= fusedMag;
            }

            if(debug) console.log(`[TagMemo] ✅ Boost Applied! Fusion complete. (Spikes: ${relatedTags.length})`);
            
            // 收集 Tag 信息
            const matchedTags = relatedTags.map(t => t.name).filter(Boolean);
            
            return {
                vector: fused,
                info: {
                    matchedTags: matchedTags,
                    boostFactor: tagBoost,
                    spikeCount: relatedTags.length,
                    totalSpikeScore: totalSpikeScore // ✅ 新增：返回总得分
                }
            };

        } catch (e) {
            console.error('[KnowledgeBase] TagMemo CRITICAL FAIL:', e);
            return { vector: vector, info: null }; // 绝对底线：任何错误都返回原向量，保证不崩
        }
    }

    // =========================================================================
    // 兼容性 API (修复版)
    // =========================================================================

    // 🛠️ 修复 3: 同步回退 + 缓存预热
    async getDiaryNameVector(diaryName) {
        if (!diaryName) return null;
        
        // 1. 查内存缓存
        if (this.diaryNameVectorCache.has(diaryName)) {
            return this.diaryNameVectorCache.get(diaryName);
        }
        
        // 2. 查数据库 (同步)
        try {
            const row = this.db.prepare("SELECT vector FROM kv_store WHERE key = ?").get(`diary_name:${diaryName}`);
            if (row && row.vector) {
                const vec = Array.from(new Float32Array(row.vector.buffer, row.vector.byteOffset, this.config.dimension));
                this.diaryNameVectorCache.set(diaryName, vec);
                return vec;
            }
        } catch (e) {
            console.warn(`[KnowledgeBase] DB lookup failed for diary name: ${diaryName}`);
        }

        // 3. 缓存未命中，同步等待向量化
        console.warn(`[KnowledgeBase] Cache MISS for diary name vector: "${diaryName}". Fetching now...`);
        return await this._fetchAndCacheDiaryNameVector(diaryName);
    }
    
    // 强制同步预热缓存
    _hydrateDiaryNameCacheSync() {
        console.log('[KnowledgeBase] Hydrating diary name vectors (Sync)...');
        const stmt = this.db.prepare("SELECT key, vector FROM kv_store WHERE key LIKE 'diary_name:%'");
        let count = 0;
        for (const row of stmt.iterate()) {
            const name = row.key.split(':')[1];
            if (row.vector.length === this.config.dimension * 4) {
                const vec = Array.from(new Float32Array(row.vector.buffer, row.vector.byteOffset, this.config.dimension));
                this.diaryNameVectorCache.set(name, vec);
                count++;
            }
        }
        console.log(`[KnowledgeBase] Hydrated ${count} diary name vectors.`);
    }

    async _fetchAndCacheDiaryNameVector(name) {
        try {
            const [vec] = await getEmbeddingsBatch([name], {
                apiKey: this.config.apiKey, apiUrl: this.config.apiUrl, model: this.config.model
            });
            if (vec) {
                this.diaryNameVectorCache.set(name, vec);
                const vecBuf = Buffer.from(new Float32Array(vec).buffer);
                this.db.prepare("INSERT OR REPLACE INTO kv_store (key, vector) VALUES (?, ?)").run(`diary_name:${name}`, vecBuf);
                return vec; // 返回向量
            }
        } catch (e) {
            console.error(`Failed to vectorize diary name ${name}`);
        }
        return null; // 失败时返回 null
    }
    
    // 兼容性 API: getVectorByText
    async getVectorByText(diaryName, text) {
        const stmt = this.db.prepare('SELECT vector FROM chunks WHERE content = ? LIMIT 1');
        const row = stmt.get(text);
        if (row && row.vector) {
            return Array.from(new Float32Array(row.vector.buffer, row.vector.byteOffset, this.config.dimension));
        }
        return null;
    }

    // 兼容性 API: searchSimilarTags
    async searchSimilarTags(input, k = 10) {
        // 兼容旧接口
        let queryVec;
        if (typeof input === 'string') {
             try {
                const [vec] = await getEmbeddingsBatch([input], {
                    apiKey: this.config.apiKey, apiUrl: this.config.apiUrl, model: this.config.model
                });
                queryVec = vec;
            } catch(e) { return []; }
        } else {
            queryVec = input;
        }
        
        if (!queryVec) return [];

        try {
             const searchVecFloat = new Float32Array(queryVec);
             const searchBuffer = Buffer.from(searchVecFloat.buffer, searchVecFloat.byteOffset, searchVecFloat.byteLength);
             const results = this.tagIndex.search(searchBuffer, k);
             
             // 需要 hydrate tag 名称
             const hydrate = this.db.prepare("SELECT name FROM tags WHERE id = ?");
             return results.map(r => {
                 const row = hydrate.get(r.id);
                 return row ? { tag: row.name, score: r.score } : null;
             }).filter(Boolean);
        } catch (e) {
            return [];
        }
    }

    _startWatcher() {
        if(!this.watcher) {
            const handleFile = (filePath) => {
                const relPath = path.relative(this.config.rootPath, filePath);
                // 提取第一级目录作为日记本名称
                const parts = relPath.split(path.sep);
                const diaryName = parts.length > 1 ? parts[0] : 'Root'; 

                if (this.config.ignoreFolders.includes(diaryName)) return;
                const fileName = path.basename(relPath);
                if (this.config.ignorePrefixes.some(prefix => fileName.startsWith(prefix))) return;
                if (this.config.ignoreSuffixes.some(suffix => fileName.endsWith(suffix))) return;
                if (!filePath.match(/\.(md|txt)$/i)) return;

                this.pendingFiles.add(filePath);
                if (this.pendingFiles.size >= this.config.maxBatchSize) {
                    this._flushBatch();
                } else {
                    this._scheduleBatch();
                }
            };
            this.watcher = chokidar.watch(this.config.rootPath, { ignored: /(^|[\/\\])\../, ignoreInitial: !this.config.fullScanOnStartup });
            this.watcher.on('add', handleFile).on('change', handleFile).on('unlink', fp => this._handleDelete(fp));
        }
    }

    _scheduleBatch() {
        if (this.batchTimer) clearTimeout(this.batchTimer);
        this.batchTimer = setTimeout(() => this._flushBatch(), this.config.batchWindow);
    }

    async _flushBatch() {
         if (this.isProcessing || this.pendingFiles.size === 0) return;
         this.isProcessing = true;
         const batchFiles = Array.from(this.pendingFiles).slice(0, this.config.maxBatchSize);
         batchFiles.forEach(f => this.pendingFiles.delete(f));
         if (this.batchTimer) clearTimeout(this.batchTimer);

         console.log(`[KnowledgeBase] 🚌 Processing ${batchFiles.length} files...`);

         try {
            // 1. 解析文件并按日记本分组
            const docsByDiary = new Map(); // Map<DiaryName, Array<Doc>>
            const checkFile = this.db.prepare('SELECT checksum, mtime, size FROM files WHERE path = ?');

            await Promise.all(batchFiles.map(async (filePath) => {
                try {
                    const stats = await fs.stat(filePath);
                    const relPath = path.relative(this.config.rootPath, filePath);
                    const parts = relPath.split(path.sep);
                    const diaryName = parts.length > 1 ? parts[0] : 'Root';

                    const row = checkFile.get(relPath);
                    if (row && row.mtime === stats.mtimeMs && row.size === stats.size) return;

                    const content = await fs.readFile(filePath, 'utf-8');
                    const checksum = crypto.createHash('md5').update(content).digest('hex');
                    
                    if (row && row.checksum === checksum) {
                        this.db.prepare('UPDATE files SET mtime = ?, size = ? WHERE path = ?').run(stats.mtimeMs, stats.size, relPath);
                        return;
                    }

                    if (!docsByDiary.has(diaryName)) docsByDiary.set(diaryName, []);
                    docsByDiary.get(diaryName).push({
                        relPath, diaryName, checksum, mtime: stats.mtimeMs, size: stats.size,
                        chunks: chunkText(content),
                        tags: this._extractTags(content)
                    });
                } catch (e) { if (e.code !== 'ENOENT') console.warn(`Read error ${filePath}:`, e.message); }
            }));

            if (docsByDiary.size === 0) { this.isProcessing = false; return; }

            // 2. 收集所有文本进行 Embedding
            const allChunksWithMeta = []; 
            const uniqueTags = new Set();

            for (const [dName, docs] of docsByDiary) {
                docs.forEach((doc, dIdx) => {
                    const validChunks = doc.chunks.map(c => this._prepareTextForEmbedding(c)).filter(c => c !== '[EMPTY_CONTENT]');
                    doc.chunks = validChunks; 
                    validChunks.forEach((txt, cIdx) => {
                        allChunksWithMeta.push({ text: txt, diaryName: dName, doc: doc, chunkIdx: cIdx });
                    });
                    doc.tags.forEach(t => uniqueTags.add(t));
                });
            }

            // Tag 处理
            const newTagsSet = new Set();
            const tagCache = new Map();
            const checkTag = this.db.prepare('SELECT id, vector FROM tags WHERE name = ?');
            for (const t of uniqueTags) {
                const row = checkTag.get(t);
                if (row && row.vector) tagCache.set(t, { id: row.id, vector: row.vector });
                else {
                    const cleanedTag = this._prepareTextForEmbedding(t);
                    if (cleanedTag !== '[EMPTY_CONTENT]') newTagsSet.add(cleanedTag);
                }
            }

            const newTags = Array.from(newTagsSet);
            // 3. Embedding API Calls
            const embeddingConfig = { apiKey: this.config.apiKey, apiUrl: this.config.apiUrl, model: this.config.model };
            
            let chunkVectors = [];
            if (allChunksWithMeta.length > 0) {
                const texts = allChunksWithMeta.map(i => i.text);
                chunkVectors = await getEmbeddingsBatch(texts, embeddingConfig);
            }

            let tagVectors = [];
            if (newTags.length > 0) {
                const tagLimit = 100;
                for (let i = 0; i < newTags.length; i += tagLimit) {
                    const batch = newTags.slice(i, i + tagLimit);
                    tagVectors.push(...await getEmbeddingsBatch(batch, embeddingConfig));
                }
            }

            // 4. 写入 DB 和 索引
            const transaction = this.db.transaction(() => {
                const updates = new Map();
                const deletions = new Map(); // 💡 新增：记录待删除的 chunk ID
                const tagUpdates = [];

                const insertTag = this.db.prepare('INSERT OR IGNORE INTO tags (name, vector) VALUES (?, ?)');
                const updateTag = this.db.prepare('UPDATE tags SET vector = ? WHERE name = ?');
                const getTagId = this.db.prepare('SELECT id FROM tags WHERE name = ?');

                newTags.forEach((t, i) => {
                    const vecBuf = Buffer.from(new Float32Array(tagVectors[i]).buffer);
                    insertTag.run(t, vecBuf);
                    updateTag.run(vecBuf, t);
                    const id = getTagId.get(t).id;
                    tagCache.set(t, { id, vector: vecBuf });
                    tagUpdates.push({ id, vec: vecBuf });
                });

                const insertFile = this.db.prepare('INSERT INTO files (path, diary_name, checksum, mtime, size, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
                const updateFile = this.db.prepare('UPDATE files SET checksum = ?, mtime = ?, size = ?, updated_at = ? WHERE id = ?');
                const getFile = this.db.prepare('SELECT id FROM files WHERE path = ?');
                const getOldChunkIds = this.db.prepare('SELECT id FROM chunks WHERE file_id = ?'); // 💡 新增
                const delChunks = this.db.prepare('DELETE FROM chunks WHERE file_id = ?');
                const delRels = this.db.prepare('DELETE FROM file_tags WHERE file_id = ?');
                const addChunk = this.db.prepare('INSERT INTO chunks (file_id, chunk_index, content, vector) VALUES (?, ?, ?, ?)');
                const addRel = this.db.prepare('INSERT OR IGNORE INTO file_tags (file_id, tag_id) VALUES (?, ?)');

                allChunksWithMeta.forEach((meta, i) => {
                    meta.vector = chunkVectors[i];
                });

                for (const [dName, docs] of docsByDiary) {
                    if (!updates.has(dName)) updates.set(dName, []);
                    
                    docs.forEach(doc => {
                        let fileId;
                        const fRow = getFile.get(doc.relPath);
                        const now = Math.floor(Date.now() / 1000);

                        if (fRow) {
                            fileId = fRow.id;
                            
                            // 💡 核心修复：在删除数据库记录前，先收集旧 chunk ID 用于后续的索引清理
                            const oldChunkIds = getOldChunkIds.all(fileId).map(c => c.id);
                            if (oldChunkIds.length > 0) {
                                if (!deletions.has(dName)) deletions.set(dName, []);
                                deletions.get(dName).push(...oldChunkIds);
                            }

                            updateFile.run(doc.checksum, doc.mtime, doc.size, now, fileId);
                            delChunks.run(fileId);
                            delRels.run(fileId);
                        } else {
                            const res = insertFile.run(doc.relPath, doc.diaryName, doc.checksum, doc.mtime, doc.size, now);
                            fileId = res.lastInsertRowid;
                        }

                        doc.chunks.forEach((txt, i) => {
                            const meta = allChunksWithMeta.find(m => m.doc === doc && m.chunkIdx === i);
                            if (meta && meta.vector) {
                                const vecBuf = Buffer.from(new Float32Array(meta.vector).buffer);
                                const r = addChunk.run(fileId, i, txt, vecBuf);
                                updates.get(dName).push({ id: r.lastInsertRowid, vec: vecBuf });
                            }
                        });

                        doc.tags.forEach(t => {
                            const tInfo = tagCache.get(t);
                            if (tInfo) addRel.run(fileId, tInfo.id);
                        });
                    });
                }

                return { updates, tagUpdates, deletions };
            });

            const { updates, tagUpdates, deletions } = transaction();

            // 💡 核心修复：在添加新向量之前，先从 Vexus 索引中移除所有旧的向量
            if (deletions && deletions.size > 0) {
                for (const [dName, chunkIds] of deletions) {
                    const idx = await this._getOrLoadDiaryIndex(dName);
                    if (idx && idx.remove) {
                        chunkIds.forEach(id => idx.remove(id));
                    }
                }
            }

            // 🛠️ 修复：针对 Tag Index 的安全写入
            tagUpdates.forEach(u => {
                try {
                    this.tagIndex.add(u.id, u.vec);
                } catch (e) {
                    if (e.message && e.message.includes('Duplicate')) {
                        try {
                            if (this.tagIndex.remove) this.tagIndex.remove(u.id);
                            this.tagIndex.add(u.id, u.vec);
                        } catch (retryErr) {
                            console.error(`[KnowledgeBase] ❌ Failed to upsert tag ${u.id}:`, retryErr.message);
                        }
                    }
                }
            });
            this._scheduleIndexSave('global_tags');

            // 🛠️ 修复：针对 Diary Index 的安全写入
            for (const [dName, chunks] of updates) {
                const idx = await this._getOrLoadDiaryIndex(dName);
                
                chunks.forEach(u => {
                    try {
                        // 尝试直接添加
                        idx.add(u.id, u.vec);
                    } catch (e) {
                        // 捕获 "Duplicate keys" 错误
                        if (e.message && e.message.includes('Duplicate')) {
                            // console.warn(`[KnowledgeBase] ⚠️ ID Collision detected for ${u.id} in ${dName}. Performing upsert.`);
                            try {
                                // 策略：先移除冲突的 ID，再重新添加 (Upsert)
                                if (idx.remove) idx.remove(u.id);
                                idx.add(u.id, u.vec);
                            } catch (retryErr) {
                                console.error(`[KnowledgeBase] ❌ Failed to upsert vector ${u.id} in ${dName}:`, retryErr.message);
                            }
                        } else {
                            // 如果是其他错误（如维度不对），则抛出
                            console.error(`[KnowledgeBase] ❌ Vector add error detected:`, e);
                        }
                    }
                });
                
                this._scheduleIndexSave(dName);
            }

            console.log(`[KnowledgeBase] ✅ Batch complete. Updated ${updates.size} diary indices.`);

            // 优化1：数据更新后，异步重建共现矩阵
            setImmediate(() => this._buildCooccurrenceMatrix());

         } catch (e) {
             console.error('[KnowledgeBase] ❌ Batch processing failed catastrophically.');
             console.error('Error Details:', e);
             if (e.stack) {
                 console.error('Stack Trace:', e.stack);
             }
         }
         finally {
             this.isProcessing = false;
             if (this.pendingFiles.size > 0) setImmediate(() => this._flushBatch());
         }
    }
    
    _prepareTextForEmbedding(text) {
        const decorativeEmojis = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
        let cleaned = text.replace(decorativeEmojis, ' ').replace(/\s+/g, ' ').trim();
        return cleaned.length === 0 ? '[EMPTY_CONTENT]' : cleaned;
    }

    async _handleDelete(filePath) {
         const relPath = path.relative(this.config.rootPath, filePath);
         try {
            const row = this.db.prepare('SELECT id, diary_name FROM files WHERE path = ?').get(relPath);
            if (!row) return;
            const chunkIds = this.db.prepare('SELECT id FROM chunks WHERE file_id = ?').all(row.id);
            this.db.prepare('DELETE FROM files WHERE id = ?').run(row.id);
            
            const idx = await this._getOrLoadDiaryIndex(row.diary_name);
            if (idx && idx.remove) {
                chunkIds.forEach(c => idx.remove(c.id));
                this._scheduleIndexSave(row.diary_name);
            }
        } catch (e) { console.error(`[KnowledgeBase] Delete error:`, e); }
    }

    _scheduleIndexSave(name) {
        if (this.saveTimers.has(name)) return;
        const timer = setTimeout(() => {
            this._saveIndexToDisk(name);
            this.saveTimers.delete(name);
        }, this.config.indexSaveDelay);
        this.saveTimers.set(name, timer);
    }

    _saveIndexToDisk(name) {
        try {
            if (name === 'global_tags') {
                this.tagIndex.save(path.join(this.config.storePath, 'index_global_tags.usearch'));
            } else {
                const safeName = crypto.createHash('md5').update(name).digest('hex');
                const idx = this.diaryIndices.get(name);
                if (idx) {
                    idx.save(path.join(this.config.storePath, `index_diary_${safeName}.usearch`));
                }
            }
            console.log(`[KnowledgeBase] 💾 Saved index: ${name}`);
        } catch (e) { console.error(`[KnowledgeBase] Save failed for ${name}:`, e); }
    }

    _extractTags(content) {
        const match = content.match(/Tag:\s*(.+)$/im);
        if (!match) return [];
        let tags = match[1].split(/[,，、]/).map(t => t.trim()).filter(Boolean);
        if (this.config.tagBlacklistSuper.length > 0) {
            const superRegex = new RegExp(this.config.tagBlacklistSuper.join('|'), 'g');
            tags = tags.map(t => t.replace(superRegex, '').trim());
        }
        tags = tags.filter(t => !this.config.tagBlacklist.has(t) && t.length > 0);
        return [...new Set(tags)];
    }
    
    // 优化1：新增方法，用于构建和缓存Tag共现矩阵
    _buildCooccurrenceMatrix() {
        console.log('[KnowledgeBase] 🧠 Building tag co-occurrence matrix...');
        try {
            const stmt = this.db.prepare(`
                SELECT ft1.tag_id as tag1, ft2.tag_id as tag2, COUNT(ft1.file_id) as weight
                FROM file_tags ft1
                JOIN file_tags ft2 ON ft1.file_id = ft2.file_id AND ft1.tag_id < ft2.tag_id
                GROUP BY ft1.tag_id, ft2.tag_id
            `);
            
            const matrix = new Map();
            for (const row of stmt.iterate()) {
                if (!matrix.has(row.tag1)) matrix.set(row.tag1, new Map());
                if (!matrix.has(row.tag2)) matrix.set(row.tag2, new Map());
                
                matrix.get(row.tag1).set(row.tag2, row.weight);
                matrix.get(row.tag2).set(row.tag1, row.weight); // 对称填充
            }
            this.tagCooccurrenceMatrix = matrix;
            console.log(`[KnowledgeBase] ✅ Tag co-occurrence matrix built. (${matrix.size} tags)`);
        } catch (e) {
            console.error('[KnowledgeBase] ❌ Failed to build tag co-occurrence matrix:', e);
            // 初始化为空Map，防止后续代码出错
            this.tagCooccurrenceMatrix = new Map();
        }
    }

    async shutdown() {
        await this.watcher?.close();
        this.db?.close();
    }
}

module.exports = new KnowledgeBaseManager();