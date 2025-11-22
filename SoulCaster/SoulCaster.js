const fs = require('fs').promises;
const path = require('path');

class SoulCaster {
    constructor() {
        this.config = {};
        this.dependencies = {};
        this.webSocketServer = null;
        this.currentSoul = null;
    }

    async initialize(config, dependencies) {
        this.config = config;
        this.dependencies = dependencies;
        console.log('[SoulCaster] Initializing Soul Caster Protocol...');
    }

    // 注册 API 路由 (如果需要通过 HTTP 触发)
    registerApiRoutes(router, config, projectBasePath, webSocketServer) {
        this.webSocketServer = webSocketServer;
        
        router.post('/cast', async (req, res) => {
            const { agentName } = req.body;
            if (!agentName) {
                return res.status(400).json({ error: 'Missing agentName' });
            }
            
            try {
                await this.castSoul({ agentName });
                res.json({ status: 'success', message: `Soul cast request for '${agentName}' initiated.` });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
    }

    // VCP Tool 接口
    async processToolCall(args) {
        const { agentName } = args;
        if (!agentName) {
            throw new Error('Missing agentName parameter.');
        }
        
        await this.castSoul({ agentName });
        return { 
            status: 'success', 
            message: `Soul cast request for '${agentName}' sent to VCP Main Node. Waiting for soul package...` 
        };
    }

    async castSoul({ agentName }) {
        console.log(`[SoulCaster] Casting soul for: ${agentName}`);
        
        // 这里的逻辑稍微有点复杂：
        // 1. 如果我们是主节点 (Server)，我们其实不需要向自己请求，直接切换即可。
        // 2. 如果我们是分布式节点 (Client)，我们需要通过 WebSocket 向主节点请求。
        
        // 目前 VCP 架构中，Plugin 运行在 Server 上。
        // 如果这个 Server 是主节点，它可以通过 WebSocketServer 广播给所有连接的分布式节点，让它们切换？
        // 或者，这个插件是设计给“分布式节点”用的？
        
        // 根据设计文档： "允许本节点向 VCP 主节点请求..."
        // 这意味着 SoulCaster 应该运行在分布式节点上。
        // 但目前的 PluginManager 是在 Server 端运行的。
        
        // 假设场景：用户在主节点的 WebUI 上操作，想让某个连接的分布式节点（比如家里的机器人）切换人格。
        // 或者，分布式节点本身运行了一个精简版的 VCP Server + PluginManager。
        
        // 让我们假设这是一个通用实现。如果配置了 Upstream VCP Server，它就是客户端。
        // 但目前的 WebSocketServer.js 是服务端逻辑。
        
        // 修正思路：
        // SoulCaster 插件运行在主节点上，它的作用是 *管理* 灵魂投射。
        // 当调用 castSoul(agentName, targetNodeId) 时，它会把 Agent 配置推送到指定的分布式节点。
        // 如果没有指定 targetNodeId，可能是广播给所有节点，或者改变主节点自己的行为（如果主节点支持热切换）。
        
        // 让我们回顾一下 WebSocketServer.js 的修改：
        // 我们添加了 `case 'soul_cast_request':` 处理来自分布式节点的请求。
        // 这说明分布式节点会主动请求。
        
        // 那么 SoulCaster.js 在这里（主节点）的角色可能是：
        // 1. 提供一个工具给 AI，让 AI 可以命令分布式节点切换人格。
        // 2. 监听来自分布式节点的 `soul_cast_error` 或成功消息。
        
        // 让我们实现 AI 命令分布式节点切换人格的逻辑。
        
        if (!this.webSocketServer) {
            throw new Error('WebSocketServer not available. Cannot cast soul.');
        }

        // 广播给所有分布式节点 (简化处理，实际应支持指定 target)
        // 我们发送一个指令，让分布式节点 *知道* 它们应该切换，或者直接把数据推过去。
        // 但通常是分布式节点请求 -> 主节点响应。
        // 这里我们实现：主节点主动推送 (Push Mode)。
        
        const fs = require('fs').promises;
        const path = require('path');
        const AGENT_DIR = path.join(__dirname, '../../Agent'); // 假设在 Plugin/SoulCaster 下
        const agentMapPath = path.join(__dirname, '../../agent_map.json');
        
        const mapContent = await fs.readFile(agentMapPath, 'utf8');
        const agentMap = JSON.parse(mapContent);
        const agentFileName = agentMap[agentName];
        
        if (!agentFileName) {
            throw new Error(`Agent '${agentName}' not found in local map.`);
        }
        
        const agentFilePath = path.join(AGENT_DIR, agentFileName);
        const agentPrompt = await fs.readFile(agentFilePath, 'utf8');
        
        const soulPackage = {
            type: 'soul_cast_package', // 分布式节点需要处理这个消息类型
            data: {
                agentName: agentName,
                systemPrompt: agentPrompt,
                timestamp: Date.now()
            }
        };
        
        // 广播给所有 DistributedServer 类型的客户端
        this.webSocketServer.broadcast(soulPackage, 'DistributedServer');
        console.log(`[SoulCaster] Broadcasted soul package for '${agentName}' to all distributed nodes.`);
    }

    async shutdown() {
        console.log('[SoulCaster] Shutting down...');
    }
}

module.exports = new SoulCaster();