#!/usr/bin/env node

/**
 * VCP插件测试脚本
 * 用于测试DeepwikiProcessor插件的各种功能
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 运行插件测试
 */
async function runPluginTest(testName, inputData) {
  return new Promise((resolve, reject) => {
    console.log(`\n🧪 测试: ${testName}`);
    console.log(`📤 输入: ${JSON.stringify(inputData)}`);
    
    const pluginPath = path.join(__dirname, 'deepwiki-processor.mjs');
    const child = spawn('node', [pluginPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: __dirname
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      console.log(`📥 输出: ${stdout.trim()}`);
      if (stderr) {
        console.log(`⚠️  错误输出: ${stderr.trim()}`);
      }
      console.log(`🔚 退出码: ${code}`);
      
      if (code === 0) {
        try {
          const result = JSON.parse(stdout.trim());
          resolve(result);
        } catch (parseError) {
          reject(new Error(`JSON解析失败: ${parseError.message}`));
        }
      } else {
        reject(new Error(`插件执行失败，退出码: ${code}`));
      }
    });
    
    child.on('error', (error) => {
      reject(new Error(`启动插件失败: ${error.message}`));
    });
    
    // 发送输入数据
    child.stdin.write(JSON.stringify(inputData));
    child.stdin.end();
  });
}

/**
 * 主测试函数
 */
async function main() {
  console.log('🚀 开始VCP插件测试\n');
  
  const tests = [
    {
      name: 'FetchContent - 基础URL测试',
      input: {
        command: 'FetchContent',
        url: 'https://deepwiki.com/vercel/ai',
        mode: 'aggregate',
        maxDepth: 1
      }
    },
    {
      name: 'FetchContent - 简短格式测试',
      input: {
        command: 'FetchContent',
        url: 'vercel/ai',
        mode: 'aggregate',
        saveFormat: 'md'
      }
    },
    {
      name: 'FetchContent - 关键词测试',
      input: {
        command: 'FetchContent',
        url: 'react',
        mode: 'aggregate',
        maxDepth: 1
      }
    },
    {
      name: 'SearchContent - 搜索测试',
      input: {
        command: 'SearchContent',
        url: 'vercel/ai',
        query: 'stream',
        maxMatches: 5
      }
    },
    {
      name: '批量调用测试',
      input: {
        command1: 'FetchContent',
        url1: 'vercel/ai',
        mode1: 'aggregate',
        maxDepth1: 1,
        command2: 'SearchContent',
        url2: 'vercel/ai',
        query2: 'streaming',
        maxMatches2: 3
      }
    },
    {
      name: '错误处理 - 无效域名',
      input: {
        command: 'FetchContent',
        url: 'https://example.com/test'
      }
    },
    {
      name: '错误处理 - 无效命令',
      input: {
        command: 'InvalidCommand',
        url: 'https://deepwiki.com/test'
      }
    }
  ];
  
  let successCount = 0;
  let totalCount = tests.length;
  
  for (const test of tests) {
    try {
      const result = await runPluginTest(test.name, test.input);
      
      if (result.status === 'success') {
        console.log('✅ 测试通过');
        successCount++;
      } else if (result.status === 'error') {
        console.log(`❌ 测试失败: ${result.error}`);
        // 对于错误处理测试，这实际上是期望的结果
        if (test.name.includes('错误处理')) {
          console.log('💡 这是预期的错误处理结果');
          successCount++;
        }
      }
    } catch (error) {
      console.log(`💥 测试异常: ${error.message}`);
    }
    
    console.log('─'.repeat(80));
  }
  
  console.log(`\n📊 测试总结:`);
  console.log(`✅ 成功: ${successCount}/${totalCount}`);
  console.log(`❌ 失败: ${totalCount - successCount}/${totalCount}`);
  
  if (successCount === totalCount) {
    console.log('🎉 所有测试通过！');
    process.exit(0);
  } else {
    console.log('⚠️  部分测试失败，请检查插件实现');
    process.exit(1);
  }
}

// 运行测试
main().catch(console.error);