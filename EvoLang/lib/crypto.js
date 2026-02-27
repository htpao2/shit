/**
 * EvoLang - 加密/解密引擎
 * 负责 Agent 密钥管理、消息加密/解密和方言签名验证
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/** 加密消息的标准前缀格式 */
const CIPHER_PREFIX = 'EVOLANG';
const CIPHER_VERSION = 'v1';
const IV_LENGTH = 16;
const KEY_LENGTH = 32; // AES-256 需要 32 字节密钥

class CryptoEngine {
    /**
     * @param {string} dataDir - 数据存储目录
     * @param {object} options - 配置选项
     * @param {string} options.algorithm - 加密算法
     * @param {string} options.masterKey - 主密钥
     */
    constructor(dataDir, options = {}) {
        this.dataDir = dataDir;
        this.keyFile = path.join(dataDir, 'crypto-keys.json');
        this.algorithm = options.algorithm || 'aes-256-cbc';

        /** @type {string} 主密钥（hex 格式） */
        this.masterKey = options.masterKey || '';

        /** @type {Map<string, {key: Buffer, created: string}>} Agent 密钥缓存 */
        this.agentKeys = new Map();
    }

    /** 初始化：加载或生成密钥 */
    initialize() {
        this._ensureDir();

        // 如果没有提供主密钥，尝试从文件加载或自动生成
        if (!this.masterKey) {
            this.masterKey = this._loadOrGenerateMasterKey();
        }

        // 加载已有的 Agent 密钥
        this._loadAgentKeys();

        return this;
    }

    /** 确保目录存在 */
    _ensureDir() {
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }
    }

    /** 加载或生成主密钥 */
    _loadOrGenerateMasterKey() {
        const masterKeyFile = path.join(this.dataDir, '.master-key');
        if (fs.existsSync(masterKeyFile)) {
            return fs.readFileSync(masterKeyFile, 'utf-8').trim();
        }
        // 生成新主密钥
        const newKey = crypto.randomBytes(KEY_LENGTH).toString('hex');
        fs.writeFileSync(masterKeyFile, newKey, 'utf-8');
        return newKey;
    }

    /** 加载已存储的 Agent 密钥 */
    _loadAgentKeys() {
        if (fs.existsSync(this.keyFile)) {
            try {
                const data = JSON.parse(fs.readFileSync(this.keyFile, 'utf-8'));
                for (const [agentId, keyData] of Object.entries(data)) {
                    this.agentKeys.set(agentId, {
                        key: Buffer.from(keyData.key, 'hex'),
                        created: keyData.created
                    });
                }
            } catch {
                // 文件损坏，重新开始
            }
        }
    }

    /** 持久化 Agent 密钥 */
    _saveAgentKeys() {
        this._ensureDir();
        const data = {};
        for (const [agentId, keyData] of this.agentKeys) {
            data[agentId] = {
                key: keyData.key.toString('hex'),
                created: keyData.created
            };
        }
        fs.writeFileSync(this.keyFile, JSON.stringify(data, null, 2), 'utf-8');
    }

    /**
     * 获取或创建 Agent 的专属密钥
     * 使用 HKDF 从主密钥派生
     * @param {string} agentId - Agent 标识
     * @returns {Buffer} 32 字节密钥
     */
    getAgentKey(agentId) {
        if (this.agentKeys.has(agentId)) {
            return this.agentKeys.get(agentId).key;
        }

        // 使用 HKDF 从主密钥派生
        const masterBuf = Buffer.from(this.masterKey, 'hex');
        const salt = Buffer.from(`evolang-agent-${agentId}`, 'utf-8');
        const info = Buffer.from('evolang-key-derivation', 'utf-8');

        const derived = crypto.hkdfSync('sha256', masterBuf, salt, info, KEY_LENGTH);
        const keyBuf = Buffer.from(derived);

        this.agentKeys.set(agentId, {
            key: keyBuf,
            created: new Date().toISOString()
        });
        this._saveAgentKeys();

        return keyBuf;
    }

    /**
     * 生成方言签名
     * 签名 = HMAC-SHA256(agentKey, plaintext + agentId)
     * @param {string} plaintext - 明文
     * @param {string} agentId - Agent 标识
     * @returns {string} 签名（hex 截短为 16 字符）
     */
    generateSignature(plaintext, agentId) {
        const key = this.getAgentKey(agentId);
        const hmac = crypto.createHmac('sha256', key);
        hmac.update(plaintext + '::' + agentId);
        return hmac.digest('hex').substring(0, 16);
    }

    /**
     * 验证方言签名
     * @param {string} plaintext - 原文
     * @param {string} agentId - 声称的 Agent 标识
     * @param {string} signature - 待验证的签名
     * @returns {boolean}
     */
    verifySignature(plaintext, agentId, signature) {
        const expected = this.generateSignature(plaintext, agentId);
        // 常量时间比较防止时序攻击
        try {
            return crypto.timingSafeEqual(
                Buffer.from(expected, 'hex'),
                Buffer.from(signature, 'hex')
            );
        } catch {
            return false;
        }
    }

    /**
     * 加密消息
     * 输出格式: EVOLANG::v1::senderAgentId::signature::iv_hex::ciphertext_hex
     * 
     * @param {string} plaintext - 明文
     * @param {string} senderAgentId - 发送方 Agent
     * @param {string} [recipientAgentId] - 接收方 Agent（可选，如指定则用接收方密钥加密）
     * @returns {{cipherText: string, signature: string}}
     */
    encrypt(plaintext, senderAgentId, recipientAgentId) {
        // 用发送方密钥加密（对称密钥场景下双方需共享密钥或使用共享密钥对）
        // 如果指定了接收方，使用发送方和接收方密钥的异或作为共享密钥
        const encryptKey = recipientAgentId
            ? this._deriveSharedKey(senderAgentId, recipientAgentId)
            : this.getAgentKey(senderAgentId);

        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv(this.algorithm, encryptKey, iv);

        let encrypted = cipher.update(plaintext, 'utf-8', 'hex');
        encrypted += cipher.final('hex');

        // 生成方言签名（基于明文和发送方身份）
        const signature = this.generateSignature(plaintext, senderAgentId);

        // 组装密文字符串
        const cipherText = [
            CIPHER_PREFIX,
            CIPHER_VERSION,
            senderAgentId,
            signature,
            iv.toString('hex'),
            encrypted
        ].join('::');

        return { cipherText, signature };
    }

    /**
     * 解密消息
     * @param {string} cipherText - 完整密文字符串
     * @param {string} recipientAgentId - 接收方 Agent
     * @returns {{plaintext: string, senderAgentId: string, signatureValid: boolean, error?: string}}
     */
    decrypt(cipherText, recipientAgentId) {
        try {
            const parts = cipherText.split('::');
            if (parts.length < 6 || parts[0] !== CIPHER_PREFIX) {
                return { plaintext: '', senderAgentId: '', signatureValid: false, error: '无效的密文格式' };
            }

            const [, version, senderAgentId, signature, ivHex, encryptedHex] = parts;

            if (version !== CIPHER_VERSION) {
                return { plaintext: '', senderAgentId, signatureValid: false, error: `不支持的版本: ${version}` };
            }

            // 派生解密密钥
            // 如果接收方与发送方相同（自加密场景），或未指定接收方，使用发送方自身密钥
            let decryptKey;
            if (!recipientAgentId || recipientAgentId === senderAgentId) {
                decryptKey = this.getAgentKey(senderAgentId);
            } else {
                decryptKey = this._deriveSharedKey(senderAgentId, recipientAgentId);
            }

            const iv = Buffer.from(ivHex, 'hex');
            const decipher = crypto.createDecipheriv(this.algorithm, decryptKey, iv);

            let decrypted = decipher.update(encryptedHex, 'hex', 'utf-8');
            decrypted += decipher.final('utf-8');

            // 验证方言签名
            const signatureValid = this.verifySignature(decrypted, senderAgentId, signature);

            return {
                plaintext: decrypted,
                senderAgentId,
                signatureValid,
                error: signatureValid ? undefined : '方言签名验证失败——消息可能已被篡改或发送者身份不匹配'
            };
        } catch (e) {
            return {
                plaintext: '',
                senderAgentId: '',
                signatureValid: false,
                error: `解密失败: ${e.message}`
            };
        }
    }

    /**
     * 派生两个 Agent 之间的共享密钥
     * 使用 HKDF(masterKey, salt=agentA+agentB 排序拼接)
     * @param {string} agentA
     * @param {string} agentB
     * @returns {Buffer}
     * @private
     */
    _deriveSharedKey(agentA, agentB) {
        const masterBuf = Buffer.from(this.masterKey, 'hex');
        // 排序确保 A->B 和 B->A 得到相同密钥
        const sorted = [agentA, agentB].sort().join('::');
        const salt = Buffer.from(`evolang-shared-${sorted}`, 'utf-8');
        const info = Buffer.from('evolang-shared-key', 'utf-8');

        const derived = crypto.hkdfSync('sha256', masterBuf, salt, info, KEY_LENGTH);
        return Buffer.from(derived);
    }

    /**
     * 检查一个字符串是否是 EvoLang 密文
     * @param {string} text
     * @returns {boolean}
     */
    isCipherText(text) {
        return typeof text === 'string' && text.startsWith(`${CIPHER_PREFIX}::${CIPHER_VERSION}::`);
    }

    /**
     * 从密文中提取发送方 Agent ID（无需解密）
     * @param {string} cipherText
     * @returns {string|null}
     */
    extractSenderId(cipherText) {
        if (!this.isCipherText(cipherText)) return null;
        const parts = cipherText.split('::');
        return parts[2] || null;
    }

    /** 清理资源 */
    shutdown() {
        this._saveAgentKeys();
        this.agentKeys.clear();
    }
}

module.exports = CryptoEngine;
