/**
 * 动作执行模块
 * 支持脚本模式和模型模式
 */

const axios = require('axios');
const { validateCommand } = require('./command_parser');

/**
 * 执行多个动作
 */
async function executeActions(commands, config) {
    const results = [];

    for (const command of commands) {
        // 验证命令
        const validation = validateCommand(command);
        if (!validation.valid) {
            results.push({
                command: command.type,
                status: 'failed',
                error: validation.error
            });
            continue;
        }

        // 执行命令
        let result;
        if (config.executionMode === 'model') {
            result = await executeViaModel(command, config);
        } else {
            result = await executeViaScript(command, config);
        }

        results.push(result);
    }

    /**
     * 动作执行模块
     * 支持脚本模式和模型模式
     */

    const axios = require('axios');
    const { validateCommand } = require('./command_parser');

    /**
     * 执行多个动作
     */
    async function executeActions(commands, config) {
        const results = [];

        for (const command of commands) {
            // 验证命令
            const validation = validateCommand(command);
            if (!validation.valid) {
                results.push({
                    command: command.type,
                    status: 'failed',
                    error: validation.error
                });
                continue;
            }

            // 执行命令
            let result;
            if (config.executionMode === 'model') {
                result = await executeViaModel(command, config);
            } else {
                result = await executeViaScript(command, config);
            }

            results.push(result);
        }

        return results;
    }

    /**
     * 通过脚本执行（规则驱动）
     */
    async function executeViaScript(command, config) {
        const { type, parameters } = command;
        const startTime = Date.now();

        try {
            // 根据命令类型生成操作序列
            let actions = [];

            switch (type) {
                case 'move':
                    actions = generateMoveActions(parameters, config);
                    break;

                case 'attack':
                    actions = generateAttackActions(parameters, config);
                    break;

                case 'skill':
                    actions = generateSkillActions(parameters, config);
                    break;

                case 'interact':
                    actions = generateInteractActions(parameters, config);
                    break;

                case 'combo':
                    actions = generateComboActions(parameters, config);
                    break;

                default:
                    throw new Error(`不支持的命令类型: ${type}`);
            }

            // 执行动作 (调用ActionModel)
            await simulateExecution(actions, config);

            const duration = Date.now() - startTime;

            return {
                command: type,
                status: 'success',
                actions_count: actions.length,
                duration_ms: duration,
                note: '脚本模式执行（模拟）'
            };

        } catch (error) {
            return {
                command: type,
                status: 'failed',
                error: error.message,
                duration_ms: Date.now() - startTime
            };
        }
    }

    /**
     * 通过AI模型执行
     */
    async function executeViaModel(command, config) {
        const startTime = Date.now();

        try {
            // 调用动作模型API
            const response = await axios.post(`${config.actionModelUrl}/execute_action`, {
                command: command.type,
                parameters: command.parameters
            }, {
                timeout: 10000
            });

            const duration = Date.now() - startTime;

            if (response.data.status === 'success') {
                return {
                    command: command.type,
                    status: 'success',
                    actions: response.data.actions,
                    duration_ms: duration,
                    confidence: response.data.confidence,
                    note: 'AI模型执行'
                };
            } else {
                throw new Error(response.data.error || '模型执行失败');
            }

        } catch (error) {
            return {
                command: command.type,
                status: 'failed',
                error: `模型调用失败: ${error.message}`,
                duration_ms: Date.now() - startTime
            };
        }
    }

    /**
     * 生成移动操作序列
     */
    function generateMoveActions(params, config) {
        const direction = params.direction || params.dir;
        const duration = params.duration_ms || params.duration || config.defaultActionDuration;

        // 键盘映射
        const keyMap = {
            'up': 'W',
            'down': 'S',
            'left': 'A',
            'right': 'D',
            'forward': 'W',
            'backward': 'S'
        };

        const key = keyMap[direction.toLowerCase()] || 'W';

        return [
            { type: 'keydown', key: key, timestamp: 0 },
            { type: 'keyup', key: key, timestamp: duration }
        ];
    }

    /**
     * 生成攻击操作序列
     */
    function generateAttackActions(params, config) {
        const attackType = params.attack_type || params.attackType || 'basic';

        if (attackType === 'basic') {
            return [
                { type: 'mouse_click', button: 'left', timestamp: 0 }
            ];
        } else if (attackType === 'heavy') {
            return [
                { type: 'mouse_press', button: 'left', timestamp: 0 },
                { type: 'mouse_release', button: 'left', timestamp: 500 }
            ];
        }

        return [];
    }

    /**
     * 生成技能操作序列
     */
    function generateSkillActions(params, config) {
        const skillName = params.skill_name || params.skillName;

        // 技能键位映射（示例）
        const skillKeyMap = {
            'fireball': 'Q',
            'ice_blast': 'W',
            'heal': 'E',
            'shield': 'R'
        };

        const key = skillKeyMap[skillName.toLowerCase()] || 'Q';

        return [
            { type: 'keypress', key: key, timestamp: 0 }
        ];
    }

    /**
     * 生成交互操作序列
     */
    function generateInteractActions(params, config) {
        return [
            { type: 'keypress', key: 'F', timestamp: 0 }
        ];
    }

    /**
     * 生成组合技操作序列
     */
    function generateComboActions(params, config) {
        const comboName = params.combo_name || params.comboName;

        // 组合技配置（示例）
        const comboMap = {
            'fire_combo': [
                { type: 'keypress', key: 'Q', timestamp: 0 },
                { type: 'keypress', key: 'W', timestamp: 200 },
                { type: 'mouse_click', button: 'left', timestamp: 400 }
            ]
        };

        return comboMap[comboName.toLowerCase()] || [];
    }

    /**
     * 执行操作序列 (通过ActionModel服务器)
     */
    async function simulateExecution(actions, config) {
        // 如果没有配置URL，回退到模拟延迟
        if (!config || !config.actionModelUrl) {
            const totalDuration = Math.max(...actions.map(a => a.timestamp), 0) + 100;
            await new Promise(resolve => setTimeout(resolve, totalDuration));
            return;
        }

        try {
            // 调用ActionModel服务器执行原始动作
            await axios.post(`${config.actionModelUrl}/execute_action`, {
                command: 'raw_actions',
                parameters: {
                    actions: actions
                }
            }, {
                timeout: 30000 // 增加超时时间，因为动作执行可能需要时间
            });
        } catch (error) {
            console.error(`执行动作失败: ${error.message}`);
            // 失败时不抛出异常，以免中断整个流程，但记录错误
        }
    }

    module.exports = {
        executeActions,
        executeViaScript,
        executeViaModel
    };