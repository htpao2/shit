/**
 * PluginInfoPlugin - Node.js Handler
 * 
 * 职责：
 * 1. 扫描所有 VCP 插件目录下的 plugin-manifest.json。
 * 2. 对每个插件的描述进行 LLM 打标（Tag 提取）。
 * 3. 将格式化后的工具说明写入 "虚拟日记本" 目录，供主系统 RAG 使用。
 * 4. 提供主动检索指令支持。
 */

const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const dotenv = require('dotenv');

// 加载配置
dotenv.config({ path: path.join(__dirname, 'config.env') });

const PROJECTS_PLUGINS_DIR = path.resolve(__dirname, '..');
const KNOWLEDGEBASE_ROOT_PATH = process.env.KNOWLEDGEBASE_ROOT_PATH || path.resolve(__dirname, '../../dailynote');
const VIRTUAL_DIARY_NAME = 'VCP_Tools_RAG';
const VIRTUAL_DIARY_DIR = path.join(KNOWLEDGEBASE_ROOT_PATH, VIRTUAL_DIARY_NAME);

/**
 * 从标准输入读取 AI 请求
 */
async function readStdin() {
    let data = '';
    for await (const chunk of process.stdin) {
        data += chunk;
    }
    return JSON.parse(data);
}

/**
 * 调用 LLM 提取标签
 */
async function extractTagsWithLLM(name, description) {
    const apiKey = process.env.LLM_API_KEY;
    const apiUrl = process.env.LLM_API_URL;
    const model = process.env.LLM_MODEL || 'gpt-3.5-turbo';

    if (!apiKey || !apiUrl) {
        console.error('[PluginInfo] LLM_API_KEY 或 LLM_API_URL 未配置，跳过动态打标。');
        return '工具, VCP插件, ' + name;
    }

    try {
        const response = await axios.post(apiUrl, {
            model: model,
            messages: [
                {
                    role: 'system',
                    content: '你是一个经验丰富的开发者。请分析以下 VCP 插件的描述，并提取 5-8 个最能代表其意图和功能的关键词（Tags）。返回格式只需逗号分隔的关键词列表，不要任何其他文字。'
                },
                {
                    role: 'user',
                    content: `工具名: ${name}\n描述: ${description}`
                }
            ],
            temperature: 0.3
        }, {
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            timeout: 10000
        });

        return response.data.choices[0].message.content.trim();
    } catch (error) {
        console.error('[PluginInfo] LLM 提取标签失败:', error.message);
        return '工具, VCP插件, ' + name;
    }
}

/**
 * 扫描并同步插件到虚拟日记本
 */
async function syncPluginsToRAG() {
    console.error(`[PluginInfo] 正在扫描插件目录: ${PROJECTS_PLUGINS_DIR}`);
    
    // 确保虚拟日记本目录存在
    await fs.mkdir(VIRTUAL_DIARY_DIR, { recursive: true });

    const pluginDirs = await fs.readdir(PROJECTS_PLUGINS_DIR);
    const syncedPlugins = [];

    for (const dirName of pluginDirs) {
        const manifestPath = path.join(PROJECTS_PLUGINS_DIR, dirName, 'plugin-manifest.json');
        try {
            const stats = await fs.stat(manifestPath);
            if (!stats.isFile()) continue;

            const manifestData = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
            const name = manifestData.name || dirName;
            const displayName = manifestData.displayName || name;
            const description = manifestData.description || '';

            console.error(`[PluginInfo] 正在处理插件: ${name}`);

            // 1. 提取标签
            const tags = await extractTagsWithLLM(name, description);

            // 2. 格式化为日记格式
            const today = new Date().toISOString().split('T')[0];
            const content = `[${today}] - 工具定义：${displayName} (${name})
Tag: ${tags}

[描述]
${description}

[全量配置]
${JSON.stringify(manifestData, null, 2)}
`;

            // 3. 写入虚拟日记本目录
            const targetFile = path.join(VIRTUAL_DIARY_DIR, `${name}.txt`);
            await fs.writeFile(targetFile, content, 'utf8');
            syncedPlugins.push(name);

        } catch (e) {
            // 忽略没有 manifest 的目录
        }
    }

    return {
        status: 'success',
        result: `成功同步 ${syncedPlugins.length} 个插件到 RAG 虚拟日记本: ${syncedPlugins.join(', ')}。主系统 RAGDiaryPlugin 稍后将自动完成向量化。`
    };
}

/**
 * 简单的模糊搜索（用于主动查询的降级方案）
 */
async function searchPlugins(query) {
    if (!query) return { status: 'error', error: '请提供搜索关键词。' };

    const files = await fs.readdir(VIRTUAL_DIARY_DIR);
    const results = [];
    const q = query.toLowerCase();

    for (const file of files) {
        if (!file.endsWith('.txt')) continue;
        const content = await fs.readFile(path.join(VIRTUAL_DIARY_DIR, file), 'utf8');
        if (content.toLowerCase().includes(q)) {
            // 只截取头部描述部分，全量配置如果命中了就全量返回
            results.push(content);
        }
    }

    if (results.length === 0) {
        return { status: 'success', result: '未发现匹配的工具。请尝试更换关键词。' };
    }

    return {
        status: 'success',
        result: `[搜索结果]\n\n${results.join('\n\n---\n\n')}`
    };
}

/**
 * 主入口
 */
async function main() {
    try {
        const input = await readStdin();
        const command = input.command || 'sync_tools_to_rag';
        let output;

        switch (command) {
            case 'sync_tools_to_rag':
                output = await syncPluginsToRAG();
                break;
            case 'search_plugins':
                output = await searchPlugins(input.query || input.intent);
                break;
            case 'list_available_vcp_plugins':
                // 兼容老指令，执行全量同步并告知状态
                output = await syncPluginsToRAG();
                output.result = "已激活工具 RAG 系统。请在对话中使用语义检索，或直接调用 search_plugins 进行查找。当前已安装插件列表已同步到知识库。";
                break;
            default:
                output = { status: 'error', error: `未知命令: ${command}` };
        }

        console.log(JSON.stringify(output));
    } catch (e) {
        console.log(JSON.stringify({ status: 'error', error: e.message }));
    }
}

main();
