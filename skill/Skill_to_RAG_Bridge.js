/**
 * Skill_to_RAG_Bridge.js
 * 
 * 核心功能：
 * 1. 扫描 ./skills/ 目录下所有的 SKILL.md 文件。
 * 2. 识别每一项 Skill 的元数据（YAML Frontmatter）和指令正文。
 * 3. 将其“降维打击”映射为 VCP RAG 可识别的“日记本”格式。
 * 4. 统一存放在 dailynote/[AgentSkills]/ 目录下。
 * 5. 在文件末尾自动追加 Tag，以便 RAG 向量引擎进行相似度命中。
 */

const fs = require('fs');
const path = require('path');

// --- 配置区域 ---
const SKILLS_ROOT = path.join(__dirname, 'skills');
// 改用用户指定的绝对路径进行测试
const OPC_SKILLS_ROOT = 'C:\\Users\\MSI-NB\\Desktop\\新建文件夹\\渐进式 skiill 完整移植\\opc-methodology-master\\skills';
const DAILYNOTE_ROOT = path.join(__dirname, 'dailynote');
const TARGET_DIARY_NAME = '[AgentSkills]'; // 虚拟日记本大类名称
const OUTPUT_DIR = path.join(DAILYNOTE_ROOT, TARGET_DIARY_NAME);

// 确保输出目录存在
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`[Bridge] 已创建目录: ${OUTPUT_DIR}`);
}

/**
 * 解析 SKILL.md
 * 提取 YAML 头和内容
 */
function parseSkillFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const regex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
    const match = content.match(regex);

    if (!match) {
        // 如果没有 YAML 头，则尝试简单的分析
        return {
            metadata: { name: path.basename(path.dirname(filePath)), description: "" },
            instruction: content
        };
    }

    const yamlStr = match[1];
    const instruction = match[2].trim();
    const metadata = {};

    // 极简 YAML 解析 (仅限 name 和 description)
    yamlStr.split('\n').forEach(line => {
        const [key, ...vals] = line.split(':');
        if (key && vals.length > 0) {
            metadata[key.trim()] = vals.join(':').trim();
        }
    });

    return { metadata, instruction };
}

/**
 * 扫描指定目录下的所有 SKILL.md
 */
function scanSkills(rootPath) {
    if (!fs.existsSync(rootPath)) return [];
    
    let results = [];
    const items = fs.readdirSync(rootPath);

    items.forEach(item => {
        const fullPath = path.join(rootPath, item);
        if (fs.statSync(fullPath).isDirectory()) {
            const skillFilePath = path.join(fullPath, 'SKILL.md');
            if (fs.existsSync(skillFilePath)) {
                results.push(skillFilePath);
            }
        }
    });
    return results;
}

/**
 * 执行桥接映射
 */
async function runBridge() {
    console.log('🚀 开始 Agent Skill -> VCP RAG 映射任务...');

    // 同时扫描根目录和 opc 目录
    const skillFiles = [
        ...scanSkills(SKILLS_ROOT),
        ...scanSkills(OPC_SKILLS_ROOT),
        ...scanSkills(path.join(__dirname, '字幕转markdown')) // 适配单个例子
    ];

    if (fs.existsSync(path.join(__dirname, '字幕转markdown', 'SKILL.md'))) {
        // 特殊处理用户给出的第一个例子
        if (!skillFiles.includes(path.join(__dirname, '字幕转markdown', 'SKILL.md'))) {
             skillFiles.push(path.join(__dirname, '字幕转markdown', 'SKILL.md'));
        }
    }

    console.log(`[Bridge] 发现 ${skillFiles.length} 个 Skill 定义文件。`);

    skillFiles.forEach(file => {
        try {
            const { metadata, instruction } = parseSkillFile(file);
            const skillName = metadata.name || path.basename(path.dirname(file));
            const skillDesc = metadata.description || "";
            
            // 构造日记本文件名（符合 VCP RAG 时间前缀习惯，方便排序）
            const fileName = `Skill_${skillName.replace(/\s+/g, '_')}.txt`;
            const targetPath = path.join(OUTPUT_DIR, fileName);

            // 构造日记文本格式
            let diaryBody = `[Agent Skill Instruction Layer]\n`;
            diaryBody += `Name: ${skillName}\n`;
            diaryBody += `Source: ${file}\n\n`;
            diaryBody += `## Instruction\n${instruction}\n\n`;
            
            // 🌟 核心：注入最新的末行 Tag 协议，用于向量命中
            // 将 description 和 name 都变成 Tag
            const tags = [
                skillName, 
                ...skillDesc.split(/[,，\s]+/).filter(Boolean)
            ].join(', ');
            
            diaryBody += `Tag: AgentSkill, 技能说明书, ${tags}`;

            fs.writeFileSync(targetPath, diaryBody);
            console.log(`[√] 已转换: ${skillName} -> ${fileName}`);
        } catch (e) {
            console.error(`[X] 转换异常 (${file}):`, e.message);
        }
    });

    console.log(`\n✨ 映射完成！`);
    console.log(`请在您的 System Prompt 中添加以下占位符来激活：`);
    console.log(`《《${TARGET_DIARY_NAME}日记本》》`);
}

runBridge();
