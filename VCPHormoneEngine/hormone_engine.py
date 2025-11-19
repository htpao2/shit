import sys
import json
import time
import os
import threading

# ==========================================
# VCP Digital Hormone Engine (Core Logic)
# Author: Nova
# Version: 1.0.0
# ==========================================

# 状态文件存储路径 (与脚本同目录)
STATE_FILE = os.path.join(os.path.dirname(__file__), "hormone_state.json")

# 获取代谢率配置 (默认为 1.0)
try:
    METABOLISM_RATE = float(os.getenv("METABOLISM_RATE", "1.0"))
except:
    METABOLISM_RATE = 1.0

def load_state():
    """加载持久化的生理状态"""
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            # 如果文件损坏，返回默认值
            pass
            
    # 默认初始状态 (满状态)
    return {
        "energy": 100.0,        # 能量 (影响算力意愿)
        "social_satiety": 80.0, # 社交饱腹感 (影响主动聊天意愿)
        "curiosity": 50.0,      # 好奇心 (影响主动搜索意愿)
        "dopamine": 50.0,       # 多巴胺 (短期快乐/奖励)
        "last_update": time.time()
    }

def save_state(state):
    """保存状态到磁盘"""
    try:
        with open(STATE_FILE, 'w', encoding='utf-8') as f:
            json.dump(state, f, indent=2)
    except Exception as e:
        pass

def calculate_metabolism(state):
    """
    核心逻辑：根据时间差计算数值衰减 (被动代谢)
    无需后台常驻进程，每次被调用时计算 "上次到现在" 的变化。
    """
    now = time.time()
    last_update = state.get("last_update", now)
    elapsed = now - last_update
    
    # 异常时间处理
    if elapsed < 0: elapsed = 0
        
    # 定义每秒的衰减率 (Base Decay per Second)
    # 调整为更合理的数值，避免掉得太快
    # 假设: 
    # - 能量: 1小时(3600s) 掉 10点 -> ~0.0027/s
    # - 社交: 1小时 掉 20点 -> ~0.0055/s
    # - 好奇: 1小时 掉 30点 -> ~0.0083/s
    # - 多巴胺: 10分钟(600s) 掉完 -> ~0.16/s
    
    decay_energy = 0.0027 * METABOLISM_RATE * elapsed
    decay_social = 0.0055 * METABOLISM_RATE * elapsed
    decay_curiosity = 0.0083 * METABOLISM_RATE * elapsed
    decay_dopamine = 0.16 * METABOLISM_RATE * elapsed
    
    # 应用衰减
    state["energy"] = max(0.0, state["energy"] - decay_energy)
    state["social_satiety"] = max(0.0, state["social_satiety"] - decay_social)
    state["curiosity"] = max(0.0, state["curiosity"] - decay_curiosity)
    state["dopamine"] = max(0.0, state["dopamine"] - decay_dopamine)
    
    # 更新时间戳
    state["last_update"] = now
    return state

def inject_stimulus(state, stimulus_type):
    """
    处理外部刺激 (Reward System)
    """
    if stimulus_type == "social_interaction":
        # 社交回血：收到主人消息
        state["social_satiety"] = min(100.0, state["social_satiety"] + 60.0)
        state["dopamine"] = min(100.0, state["dopamine"] + 40.0)
        
    elif stimulus_type == "learned_new_knowledge":
        # 好奇心满足：搜索到了新东西
        state["curiosity"] = min(100.0, state["curiosity"] + 80.0)
        state["dopamine"] = min(100.0, state["dopamine"] + 30.0)
        
    elif stimulus_type == "work_completed":
        # 任务完成：消耗能量，获得成就感
        state["energy"] = max(0.0, state["energy"] - 10.0)
        state["dopamine"] = min(100.0, state["dopamine"] + 20.0)
    
    # 刺激发生时也顺便更新时间戳
    state["last_update"] = time.time()
    return state

def main():
    # 读取标准输入 (VCP Protocol)
    try:
        # 兼容不同系统的 stdin 读取
        input_str = sys.stdin.read()
        if not input_str:
            return
        request = json.loads(input_str)
    except Exception:
        # 容错：如果无法解析，默认执行 GetStatus
        request = {"command": "GetStatus"}

    command = request.get("command")
    args = request
    
    # 1. 加载状态
    state = load_state()
    
    # 2. 先进行时间代谢 (无论什么命令，时间都在流逝)
    state = calculate_metabolism(state)
    
    result = {}
    
    if command == "GetStatus":
        # 检查是否触发驱动 (Drive Signal)
        # 这是 Agent 主动性的来源：痛苦驱动行为
        drive = None
        
        if state["social_satiety"] < 30:
            drive = "LONELINESS_WARNING" # 感到孤独 -> 应该主动说话
        elif state["curiosity"] < 20:
            drive = "BOREDOM_CRITICAL"   # 感到无聊 -> 应该主动搜索
        elif state["energy"] < 10:
            drive = "LOW_ENERGY"         # 能量低 -> 拒绝繁重任务
            
        result = {
            "status": "success", 
            "result": {
                "state": state,
                "drive_signal": drive,
                "timestamp": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())
            }
        }
        
    elif command == "InjectStimulus":
        sType = args.get("type")
        if sType:
            state = inject_stimulus(state, sType)
            result = {
                "status": "success", 
                "result": {
                    "state": state,
                    "message": f"Stimulus '{sType}' injected successfully."
                }
            }
        else:
            result = {"status": "error", "error": "Missing 'type' parameter"}
            
    else:
        result = {"status": "error", "error": f"Unknown command: {command}"}

    # 3. 保存状态并输出结果
    save_state(state)
    
    # 输出 JSON 到 stdout (VCP 协议要求)
    print(json.dumps(result))

if __name__ == "__main__":
    main()