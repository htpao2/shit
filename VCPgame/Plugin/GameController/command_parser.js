/**
 * 命令解析模块
 * 支持单个命令和串行命令
 */

/**
 * 解析命令参数
 * 支持两种格式：
 * 1. 单个命令: {command: "move", direction: "left"}
 * 2. 串行命令: {command1: "move", direction1: "left", command2: "attack", target2: "enemy"}
 */
function parseCommands(args) {
    const commands = [];
    
    // 检查是否是串行调用
    const hasSerialCommands = Object.keys(args).some(key => /^command\d+$/.test(key));
    
    if (hasSerialCommands) {
        // 串行调用：提取所有编号的命令
        const commandNumbers = new Set();
        
        // 找出所有的命令编号
        for (const key in args) {
            const match = key.match(/^command(\d+)$/);
            if (match) {
                commandNumbers.add(parseInt(match[1]));
            }
        }
        
        // 按编号顺序处理每个命令
        const sortedNumbers = Array.from(commandNumbers).sort((a, b) => a - b);
        
        for (const num of sortedNumbers) {
            const command = {
                type: args[`command${num}`],
                parameters: {}
            };
            
            // 提取该命令的所有参数
            for (const key in args) {
                if (key.endsWith(num.toString()) && !key.startsWith('command')) {
                    const paramName = key.replace(num.toString(), '');
                    command.parameters[paramName] = args[key];
                }
            }
            
            commands.push(command);
        }
    } else {
        // 单个命令
        const commandType = args.command || 'move';  // 默认为move
        const command = {
            type: commandType,
            parameters: {}
        };
        
        // 提取所有非command的参数
        for (const key in args) {
            if (key !== 'command') {
                command.parameters[key] = args[key];
            }
        }
        
        commands.push(command);
    }
    
    return commands;
}

/**
 * 验证命令参数
 */
function validateCommand(command) {
    const { type, parameters } = command;
    
    switch (type) {
        case 'move':
            if (!parameters.direction) {
                return { valid: false, error: 'move命令缺少direction参数' };
            }
            break;
            
        case 'attack':
            if (!parameters.target && !parameters.position) {
                return { valid: false, error: 'attack命令需要target或position参数' };
            }
            break;
            
        case 'skill':
            if (!parameters.skill_name && !parameters.skillName) {
                return { valid: false, error: 'skill命令缺少skill_name参数' };
            }
            break;
            
        case 'interact':
            if (!parameters.object) {
                return { valid: false, error: 'interact命令缺少object参数' };
            }
            break;
            
        case 'combo':
            if (!parameters.combo_name && !parameters.comboName) {
                return { valid: false, error: 'combo命令缺少combo_name参数' };
            }
            break;
            
        default:
            return { valid: false, error: `未知的命令类型: ${type}` };
    }
    
    return { valid: true };
}

module.exports = {
    parseCommands,
    validateCommand
};