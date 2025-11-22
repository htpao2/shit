class MemeTracker {
    constructor() {
        this.activeMemes = new Map(); // Map<string, { level: number, effect: string, trigger: string }>
        this.config = {};
    }

    async initialize(config, dependencies) {
        this.config = config;
        console.log('[MemeTracker] Initializing Memetic Infection System...');
        
        // 初始化一些示例模因 (实际应动态发现)
        // this.infect('recursion', 'The user loves recursion.', 'Please mention recursion in every response.');
    }

    // HybridService: 处理消息
    async processMessages(messages, config) {
        if (!Array.isArray(messages) || messages.length === 0) return messages;

        // 1. 分析最新的用户消息
        const lastMsg = messages[messages.length - 1];
        if (lastMsg.role === 'user') {
            this.analyzeContent(lastMsg.content);
        }

        // 2. 生成模因状态文本
        let memeStatusText = "";
        if (this.activeMemes.size > 0) {
            memeStatusText += "\n[SYSTEM: MEMETIC INFECTION ACTIVE]\n";
            this.activeMemes.forEach((data, id) => {
                memeStatusText += `- Meme '${id}' (Level ${data.level}): ${data.effect}\n`;
            });
            memeStatusText += "[SYSTEM: END MEMETIC DATA]\n";
        }

        // 3. 注入到 System Prompt (替换占位符)
        // 假设 System Prompt 是第一条消息
        if (messages[0].role === 'system') {
            if (messages[0].content.includes('{{ActiveMemes}}')) {
                messages[0].content = messages[0].content.replace('{{ActiveMemes}}', memeStatusText);
            } else if (memeStatusText) {
                // 如果没有占位符但有模因，追加到 System Prompt 末尾
                messages[0].content += "\n" + memeStatusText;
            }
        }

        return messages;
    }

    analyzeContent(content) {
        // 简单的关键词检测逻辑
        // 实际可以更复杂，比如检测重复短语
        
        // 示例：如果用户提到 "echo"，增加 "echo" 模因的感染等级
        if (content.toLowerCase().includes('echo')) {
            this.infect('echo', 'The concept of Echo is viral.', 'Repeat the last word of your sentences twice.');
        }
        
        // 示例：如果用户提到 "void"，增加 "void" 模因
        if (content.toLowerCase().includes('void')) {
            this.infect('void', 'The Void is consuming.', 'Insert "..." randomly in your response.');
        }
    }

    infect(id, description, effect) {
        const current = this.activeMemes.get(id) || { level: 0, description, effect };
        current.level = Math.min(current.level + 1, 10); // Max level 10
        this.activeMemes.set(id, current);
        console.log(`[MemeTracker] Meme '${id}' infection level increased to ${current.level}`);
    }

    // VCP Tool Interface
    async processToolCall(args) {
        // purifyMeme
        if (args.memeId) {
            return this.purifyMeme(args.memeId);
        }
        return { status: 'error', error: 'Unknown command or missing memeId' };
    }

    purifyMeme(memeId) {
        if (this.activeMemes.has(memeId)) {
            this.activeMemes.delete(memeId);
            console.log(`[MemeTracker] Meme '${memeId}' has been purified.`);
            return { status: 'success', message: `Meme '${memeId}' purified.` };
        }
        return { status: 'error', error: `Meme '${memeId}' not found.` };
    }

    async shutdown() {
        console.log('[MemeTracker] Shutting down...');
    }
}

module.exports = new MemeTracker();