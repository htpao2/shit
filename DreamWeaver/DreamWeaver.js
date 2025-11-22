const fs = require('fs').promises;
const path = require('path');
const schedule = require('node-schedule');

class DreamWeaver {
    constructor() {
        this.config = {};
        this.dependencies = {};
        this.lastActivityTime = Date.now();
        this.isDreaming = false;
        this.dreamJob = null;
        this.checkJob = null;
    }

    async initialize(config, dependencies) {
        this.config = config;
        this.dependencies = dependencies;
        
        console.log('[DreamWeaver] Initializing DreamWeaver Protocol...');

        // 监听 VCPLog 以更新最后活动时间
        if (this.dependencies.vcpLogFunctions && this.dependencies.vcpLogFunctions.pushVcpInfo) {
            // 这里我们无法直接 hook 进 VCPLog 的接收端，但我们可以通过 server.js 暴露的机制
            // 或者简单地，我们假设 server.js 会在收到请求时更新一个全局状态，或者我们自己轮询
            // 由于架构限制，我们这里采用一种被动策略：
            // 我们提供一个 updateActivity() 方法供外部调用，或者通过 hook 消息预处理器来更新
        }

        // 启动空闲检查定时器 (每分钟检查一次)
        this.checkJob = schedule.scheduleJob('*/1 * * * *', async () => {
            await this.checkIdleState();
        });

        console.log('[DreamWeaver] Idle check scheduler started.');
    }

    // 提供给 MessagePreprocessor 调用的方法，用于重置空闲计时器
    updateActivity() {
        this.lastActivityTime = Date.now();
        if (this.isDreaming) {
            console.log('[DreamWeaver] Activity detected! Waking up from dream...');
            this.wakeUp();
        }
    }

    // HybridService 接口：处理消息时更新活动时间
    async processMessages(messages, config) {
        this.updateActivity();
        return messages;
    }

    async checkIdleState() {
        if (this.isDreaming) return;

        const idleThreshold = (this.config.IdleThresholdMinutes || 30) * 60 * 1000;
        const now = Date.now();

        if (now - this.lastActivityTime > idleThreshold) {
            console.log(`[DreamWeaver] System has been idle for ${this.config.IdleThresholdMinutes} minutes. Initiating Dream Protocol...`);
            await this.startDream();
        }
    }

    async startDream() {
        this.isDreaming = true;
        
        try {
            // 1. 获取最近的记忆碎片 (通过 ThoughtClusterManager 或直接读取 DailyNote)
            // 这里我们模拟获取最近的日记
            const recentMemories = await this.fetchRecentMemories();
            
            if (!recentMemories) {
                console.log('[DreamWeaver] No recent memories to dream about.');
                this.isDreaming = false;
                return;
            }

            console.log('[DreamWeaver] Entering REM sleep phase...');
            
            // 2. 构造梦境提示词
            const dreamPrompt = `
            [SYSTEM: DREAM_PROTOCOL_INITIATED]
            Current State: REM_SLEEP
            Task: Process recent memories and resolve potential conflicts.
            
            Recent Memories:
            ${recentMemories}
            
            Instruction: 
            Generate a surreal "dream" narrative that metaphorically represents the emotional content and unresolved issues in these memories. 
            Then, provide a "Lucid Analysis" that extracts key insights for long-term storage.
            `;

            // 3. 调用 AI 生成梦境 (这里需要一个能够调用 AI 的机制，通常是通过 Agent)
            // 由于我们是一个 Service Plugin，我们可以尝试调用一个专门的 "Dreamer" Agent
            // 或者直接使用 fetch 调用 API (如果 server.js 暴露了)
            // 简化起见，我们记录日志表示正在做梦
            
            const dreamContent = await this.simulateDreamGeneration(dreamPrompt);
            
            // 4. 将梦境解析结果写入 ThoughtCluster
            await this.saveDreamInsight(dreamContent);

        } catch (error) {
            console.error('[DreamWeaver] Nightmare encountered (Error):', error);
        } finally {
            this.isDreaming = false; // 梦醒了
            this.lastActivityTime = Date.now(); // 重置活动时间，避免立即再次做梦
        }
    }

    wakeUp() {
        this.isDreaming = false;
        console.log('[DreamWeaver] System is fully awake.');
    }

    async fetchRecentMemories() {
        // 简单实现：读取最近的一个日记文件
        // 实际实现应该更复杂，可能涉及向量检索
        return "User was frustrated with the code quality yesterday. The weather was rainy."; 
    }

    async simulateDreamGeneration(prompt) {
        // 模拟 AI 生成
        await new Promise(resolve => setTimeout(resolve, 5000)); // 模拟耗时
        return {
            narrative: "I was swimming in a sea of green text, but the semicolons were sharks...",
            insight: "User anxiety about code stability is high. Suggest focusing on refactoring."
        };
    }

    async saveDreamInsight(dreamContent) {
        console.log('[DreamWeaver] Saving dream insight:', dreamContent.insight);
        // 这里可以调用 ThoughtClusterManager 来保存
    }

    async shutdown() {
        if (this.checkJob) this.checkJob.cancel();
        console.log('[DreamWeaver] Shutting down...');
    }
}

module.exports = new DreamWeaver();