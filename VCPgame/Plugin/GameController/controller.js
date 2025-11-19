#!/usr/bin/env node
/**
 * GameController Plugin - 游戏控制器
 * 将AI的高层指令转换为具体的游戏操作
 */

const { parseCommands } = require('./command_parser');
const { executeActions } = require('./action_executor');

/**
 * 打印JSON输出
 */
function printJsonOutput(status, result = null, error = null) {
    const output = { status };
    if (result !== null) output.result = result;
    if (error !== null) output.error = error;
    console.log(JSON.stringify(output));
}

/**
 * 加载配置
 */
function loadConfig() {
    return {
        actionModelUrl: process.env.ACTION_MODEL_URL || 'http://localhost:5000',
        executionMode: process.env.EXECUTION_MODE || 'script',
        defaultActionDuration: parseInt(process.env.DEFAULT_ACTION_DURATION_MS || '100')
    };
}

/**
 * 处理请求
 */
async function processRequest(args, config) {
    try {
        // 解析命令（支持单个或串行）
        const commands = parseCommands(args);
        
        if (commands.length === 0) {
            return {
                error: '未识别到有效命令',
                receivedArgs: args
            };
        }
        
        // 执行动作
        const results = await executeActions(commands, config);
        
        // 计算统计信息
        const totalDuration = results.reduce((sum, r) => sum + (r.duration_ms || 0), 0);
        const successCount = results.filter(r => r.status === 'success').length;
        const successRate = successCount / results.length;
        
        return {
            executed_actions: results,
            total_duration_ms: totalDuration,
            success_rate: successRate,
            execution_mode: config.executionMode
        };
        
    } catch (error) {
        return {
            error: `处理请求时出错: ${error.message}`,
            stack: error.stack
        };
    }
}

/**
 * 主函数
 */
async function main() {
    try {
        // 加载配置
        const config = loadConfig();
        
        // 读取stdin
        let inputData = '';
        process.stdin.setEncoding('utf8');
        
        for await (const chunk of process.stdin) {
            inputData += chunk;
        }
        
        if (!inputData.trim()) {
            printJsonOutput('error', null, '未收到输入参数');
            process.exit(1);
        }
        
        // 解析JSON
        let args;
        try {
            args = JSON.parse(inputData);
        } catch (e) {
            printJsonOutput('error', null, `JSON解析失败: ${e.message}`);
            process.exit(1);
        }
        
        // 处理请求
        const result = await processRequest(args, config);
        
        // 检查错误
        if (result.error) {
            printJsonOutput('error', null, result.error);
            process.exit(1);
        }
        
        // 返回成功
        printJsonOutput('success', result);
        process.exit(0);
        
    } catch (error) {
        printJsonOutput('error', null, `未知错误: ${error.message}`);
        process.exit(1);
    }
}

// 运行
main();