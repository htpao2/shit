#!/usr/bin/env python3
"""
CreativityInjector - 创造力注入器
在消息预处理阶段注入创造性思维触发器
"""

import sys
import json
import random
import os
from pathlib import Path

# 导入触发器生成器和上下文分析器
sys.path.insert(0, str(Path(__file__).parent))
from triggers.trigger_generator import TriggerGenerator
from triggers.context_analyzer import ContextAnalyzer

# 配置加载
CONFIG = {
    'randomness_level': float(os.getenv('RANDOMNESS_LEVEL', '0.5')),
    'trigger_frequency': int(os.getenv('TRIGGER_FREQUENCY', '3')),
    'max_injection_length': int(os.getenv('MAX_INJECTION_LENGTH', '200')),
    'concept_pool_path': os.getenv('CONCEPT_POOL_PATH', './data/concept_pool.json'),
    'enabled_modes': os.getenv('ENABLED_MODES', 'metaphor,crossDomain,combination').split(',')
}

# 全局计数器（在实际部署中应使用持久化存储）
message_counter = 0


def main():
    """主处理函数"""
    global message_counter
    
    try:
        # 1. 读取 stdin
        input_data = sys.stdin.read().strip()
        message = json.loads(input_data)
        
        # 2. 更新计数器
        message_counter += 1
        
        # 3. 判断是否触发注入
        should_inject = (message_counter % CONFIG['trigger_frequency'] == 0)
        
        if should_inject:
            # 4. 加载概念库
            concept_pool = load_concept_pool()
            
            # 5. 分析消息上下文
            context = ContextAnalyzer.analyze(message.get('content', ''))
            
            # 6. 生成触发器
            trigger_generator = TriggerGenerator(
                CONFIG['randomness_level'],
                CONFIG['enabled_modes']
            )
            trigger = trigger_generator.generate(context, concept_pool)
            
            # 7. 注入触发器
            injected_message = inject_trigger(message, trigger)
            
            # 8. 返回处理后的消息
            output = {
                "status": "success",
                "result": injected_message,
                "injected": True
            }
        else:
            # 不触发注入，直接返回原消息
            output = {
                "status": "success",
                "result": message,
                "injected": False
            }
        
        print(json.dumps(output, ensure_ascii=False))
        sys.exit(0)
        
    except Exception as e:
        error_output = {
            "status": "error",
            "error": str(e)
        }
        print(json.dumps(error_output, ensure_ascii=False))
        sys.exit(1)


def load_concept_pool():
    """加载概念库"""
    try:
        with open(CONFIG['concept_pool_path'], 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        # 如果概念库不存在，返回默认结构
        return {
            "domains": [],
            "metaphors": ["系统", "网络", "生态", "建筑"]
        }


def inject_trigger(message, trigger):
    """将触发器注入到消息中"""
    original_content = message.get('content', '')
    
    # 限制触发器长度
    if len(trigger) > CONFIG['max_injection_length']:
        trigger = trigger[:CONFIG['max_injection_length']] + "..."
    
    # 构建注入后的内容
    injected_content = f"{original_content}\n\n[创造性思维触发器] {trigger}"
    
    # 创建新的消息对象
    injected_message = message.copy()
    injected_message['content'] = injected_content
    
    return injected_message


if __name__ == "__main__":
    main()