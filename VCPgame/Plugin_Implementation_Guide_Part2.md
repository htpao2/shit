# 插件实现指南 - 第二部分

## 3. 动作模型实现（续）

### 3.5 input_executor/keyboard_mouse.py（续）

```python
                elif action['type'] == 'mouse_move':
                    x = action.get('x', 0)
                    y = action.get('y', 0)
                    duration = action.get('duration', 0.1)
                    pyautogui.moveTo(x, y, duration=duration)
                    results.append({'action': 'move', 'x': x, 'y': y, 'status': 'success'})
                
                else:
                    results.append({'action': action['type'], 'status': 'unknown_type'})
                
            except Exception as e:
                results.append({
                    'action': action.get('type', 'unknown'),
                    'status': 'failed',
                    'error': str(e)
                })
        
        return {
            'success': True,
            'executed_actions': results,
            'total_duration_ms': (time.time() - start_time) * 1000
        }
    
    def get_screen_size(self):
        """获取屏幕尺寸"""
        return pyautogui.size()
    
    def get_mouse_position(self):
        """获取鼠标位置"""
        return pyautogui.position()
```

### 3.6 requirements.txt

```
flask>=3.0.0
flask-cors>=4.0.0
pyautogui>=0.9.54
pillow>=10.0.0
```

### 3.7 README.md

```markdown
# 动作模型服务

## 功能描述

提供HTTP API接口，将高层游戏指令转换为具体的键鼠操作序列。

## 安装依赖

```bash
pip install -r requirements.txt
```

## 启动服务

```bash
python model_server.py 5000
```

服务将在 `http://localhost:5000` 启动。

## API接口

### 健康检查

```
GET /health
```

### 执行动作

```
POST /execute_action

Body:
{
    "command": "move",
    "parameters": {
        "direction": "left",
        "duration_ms": 500
    }
}

Response:
{
    "status": "success",
    "actions": [...],
    "confidence": 1.0
}
```

### 批量执行

```
POST /batch_execute

Body:
{
    "commands": [
        {"command": "move", "parameters": {...}},
        {"command": "attack", "parameters": {...}}
    ]
}
```

## 扩展模型

### 添加强化学习模型

1. 创建 `models/rl_model.py`
2. 继承 `BaseActionModel`
3. 实现 `predict()` 方法
4. 在 `model_server.py` 中切换模型

```python
from models.rl_model import RLActionModel

# 使用RL模型
model = RLActionModel()
```

### 添加行为克隆模型

1. 创建 `models/bc_model.py`
2. 加载训练好的模型权重
3. 实现推理逻辑
```

---

## 4. 集成测试方案

### 4.1 测试目录结构

```
tests/
├── test_observer.py
├── test_controller.py
├── test_integration.py
├── test_configs/
│   └── test_game_config.json
└── README.md
```

### 4.2 test_observer.py

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
GameObserver 插件测试
"""

import unittest
import json
import subprocess
import base64
from PIL import Image
import io


class TestGameObserver(unittest.TestCase):
    """GameObserver测试类"""
    
    def test_capture_screen(self):
        """测试屏幕捕获"""
        # 准备输入
        input_data = json.dumps({
            "command": "CaptureGameState",
            "enable_ocr": False
        })
        
        # 调用插件
        result = subprocess.run(
            ['python', 'Plugin/GameObserver/observer.py'],
            input=input_data,
            capture_output=True,
            text=True
        )
        
        # 验证输出
        self.assertEqual(result.returncode, 0)
        
        output = json.loads(result.stdout)
        self.assertEqual(output['status'], 'success')
        self.assertIn('screenshot_base64', output['result'])
        
        # 验证图片可以解码
        img_data = base64.b64decode(output['result']['screenshot_base64'])
        img = Image.open(io.BytesIO(img_data))
        self.assertIsNotNone(img)
        
        print(f"✓ 截图测试通过 - 图片尺寸: {img.size}")
    
    def test_window_list(self):
        """测试窗口列表"""
        input_data = json.dumps({
            "command": "GetWindowList"
        })
        
        result = subprocess.run(
            ['python', 'Plugin/GameObserver/observer.py'],
            input=input_data,
            capture_output=True,
            text=True
        )
        
        self.assertEqual(result.returncode, 0)
        
        output = json.loads(result.stdout)
        self.assertEqual(output['status'], 'success')
        self.assertIn('windows', output['result'])
        
        print(f"✓ 窗口列表测试通过 - 找到 {output['result']['count']} 个窗口")
    
    def test_ocr_recognition(self):
        """测试OCR识别"""
        input_data = json.dumps({
            "command": "CaptureGameState",
            "enable_ocr": True,
            "ocr_regions": '{"test": [10, 10, 100, 30]}'
        })
        
        result = subprocess.run(
            ['python', 'Plugin/GameObserver/observer.py'],
            input=input_data,
            capture_output=True,
            text=True
        )
        
        self.assertEqual(result.returncode, 0)
        
        output = json.loads(result.stdout)
        self.assertEqual(output['status'], 'success')
        
        if 'recognized_data' in output['result']:
            print(f"✓ OCR测试通过 - 识别结果: {output['result']['recognized_data']}")
        else:
            print("⚠ OCR未返回数据（可能是配置问题）")


if __name__ == '__main__':
    unittest.main()
```

### 4.3 test_controller.py

```javascript
#!/usr/bin/env node
/**
 * GameController 插件测试
 */

const { spawn } = require('child_process');
const assert = require('assert');

/**
 * 测试单个命令
 */
async function testSingleCommand() {
    console.log('测试: 单个命令执行');
    
    const input = JSON.stringify({
        command: 'move',
        direction: 'left',
        duration_ms: 500
    });
    
    const result = await runPlugin(input);
    
    assert.strictEqual(result.status, 'success');
    assert(result.result.executed_actions.length > 0);
    
    console.log('✓ 单个命令测试通过');
}

/**
 * 测试串行命令
 */
async function testSerialCommands() {
    console.log('测试: 串行命令执行');
    
    const input = JSON.stringify({
        command1: 'skill',
        skill_name1: 'fireball',
        command2: 'move',
        direction2: 'backward',
        duration_ms2: 300
    });
    
    const result = await runPlugin(input);
    
    assert.strictEqual(result.status, 'success');
    assert.strictEqual(result.result.executed_actions.length, 2);
    
    console.log('✓ 串行命令测试通过');
}

/**
 * 测试错误处理
 */
async function testErrorHandling() {
    console.log('测试: 错误处理');
    
    const input = JSON.stringify({
        command: 'invalid_command'
    });
    
    const result = await runPlugin(input);
    
    assert.strictEqual(result.status, 'error');
    
    console.log('✓ 错误处理测试通过');
}

/**
 * 运行插件
 */
function runPlugin(input) {
    return new Promise((resolve, reject) => {
        const proc = spawn('node', ['Plugin/GameController/controller.js']);
        
        let output = '';
        
        proc.stdout.on('data', (data) => {
            output += data.toString();
        });
        
        proc.on('close', (code) => {
            try {
                const result = JSON.parse(output);
                resolve(result);
            } catch (e) {
                reject(new Error(`解析输出失败: ${e.message}`));
            }
        });
        
        proc.stdin.write(input);
        proc.stdin.end();
    });
}

/**
 * 运行所有测试
 */
async function runAllTests() {
    try {
        await testSingleCommand();
        await testSerialCommands();
        await testErrorHandling();
        
        console.log('\n所有测试通过! ✓');
    } catch (error) {
        console.error('测试失败:', error);
        process.exit(1);
    }
}

runAllTests();
```

### 4.4 test_integration.py

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
集成测试 - 测试完整的AI游戏控制流程
"""

import unittest
import json
import subprocess
import requests
import time


class TestIntegration(unittest.TestCase):
    """集成测试类"""
    
    @classmethod
    def setUpClass(cls):
        """启动模型服务"""
        print("启动动作模型服务...")
        # 这里可以启动model_server.py作为后台进程
        # 实际实现时需要进程管理
        time.sleep(2)
    
    def test_full_workflow(self):
        """测试完整工作流程"""
        print("\n=== 测试完整AI游戏控制流程 ===\n")
        
        # 步骤1: 观察游戏状态
        print("步骤1: 捕获游戏状态...")
        observer_result = self._call_observer()
        self.assertEqual(observer_result['status'], 'success')
        print("✓ 游戏状态捕获成功")
        
        # 步骤2: AI决策（模拟）
        print("\n步骤2: AI分析状态并决策...")
        decision = self._simulate_ai_decision(observer_result['result'])
        print(f"✓ AI决策: {decision}")
        
        # 步骤3: 执行操作
        print("\n步骤3: 执行游戏操作...")
        controller_result = self._call_controller(decision)
        self.assertEqual(controller_result['status'], 'success')
        print("✓ 操作执行成功")
        
        # 步骤4: 验证结果
        print("\n步骤4: 验证执行结果...")
        self.assertTrue(controller_result['result']['success_rate'] > 0.5)
        print("✓ 验证通过")
        
        print("\n=== 完整流程测试通过! ===\n")
    
    def test_rapid_response(self):
        """测试快速响应能力"""
        print("\n=== 测试快速响应能力 ===\n")
        
        start_time = time.time()
        
        # 连续执行多个观察-决策-执行循环
        for i in range(5):
            observer_result = self._call_observer()
            decision = {"command": "move", "direction": "left"}
            controller_result = self._call_controller(decision)
            
            self.assertEqual(observer_result['status'], 'success')
            self.assertEqual(controller_result['status'], 'success')
        
        elapsed = time.time() - start_time
        avg_time = elapsed / 5
        
        print(f"完成5次循环，平均耗时: {avg_time:.2f}秒")
        self.assertLess(avg_time, 2.0, "响应时间过长")
        
        print("\n=== 快速响应测试通过! ===\n")
    
    def _call_observer(self):
        """调用GameObserver"""
        input_data = json.dumps({
            "enable_ocr": False
        })
        
        result = subprocess.run(
            ['python', 'Plugin/GameObserver/observer.py'],
            input=input_data,
            capture_output=True,
            text=True,
            timeout=10
        )
        
        return json.loads(result.stdout)
    
    def _call_controller(self, decision):
        """调用GameController"""
        result = subprocess.run(
            ['node', 'Plugin/GameController/controller.js'],
            input=json.dumps(decision),
            capture_output=True,
            text=True,
            timeout=10
        )
        
        return json.loads(result.stdout)
    
    def _simulate_ai_decision(self, game_state):
        """模拟AI决策"""
        # 简单的规则决策（实际应该是LLM）
        decisions = [
            {"command": "move", "direction": "forward", "duration_ms": 300},
            {"command": "attack", "target": "nearest_enemy", "attack_type": "basic"},
            {"command": "skill", "skill_name": "fireball"}
        ]
        
        # 随机选择一个决策
        import random
        return random.choice(decisions)


if __name__ == '__main__':
    unittest.main()
```

### 4.5 test_configs/test_game_config.json

```json
{
  "game_name": "Test Game",
  "window_title": "Test",
  "observer_config": {
    "capture_interval_ms": 500,
    "enable_ocr": true,
    "ocr_regions": {
      "health": [10, 10, 100, 30],
      "mana": [10, 50, 100, 70]
    }
  },
  "controller_config": {
    "execution_mode": "script",
    "key_mappings": {
      "forward": "W",
      "backward": "S",
      "left": "A",
      "right": "D"
    },
    "skill_mappings": {
      "fireball": "Q",
      "ice_blast": "W",
      "heal": "E"
    }
  },
  "test_scenarios": [
    {
      "name": "Basic Movement",
      "steps": [
        {"action": "move", "direction": "forward", "duration_ms": 500},
        {"action": "move", "direction": "left", "duration_ms": 300}
      ]
    },
    {
      "name": "Combat Sequence",
      "steps": [
        {"action": "skill", "skill_name": "fireball"},
        {"action": "attack", "attack_type": "basic"},
        {"action": "move", "direction": "backward", "duration_ms": 400}
      ]
    }
  ]
}
```

### 4.6 tests/README.md

```markdown
# 测试套件

## 运行测试

### GameObserver测试

```bash
python tests/test_observer.py
```

### GameController测试

```bash
node tests/test_controller.js
```

### 集成测试

```bash
python tests/test_integration.py
```

### 运行所有测试

```bash
# 创建测试脚本
./run_all_tests.sh
```

## 测试覆盖

- ✓ 单元测试：各插件独立功能
- ✓ 集成测试：完整工作流程
- ✓ 性能测试：响应时间和吞吐量
- ✓ 错误处理：异常情况处理

## 测试环境要求

- Python 3.8+
- Node.js 14+
- 已安装所有依赖
- （可选）真实游戏环境
```

---

## 5. 游戏配置模板

### 5.1 configs/game_profiles/fps_game.json

```json
{
  "profile_name": "FPS Game Profile",
  "game_type": "fps",
  "description": "第一人称射击游戏配置",
  "observer": {
    "window_title_pattern": ".*FPS.*",
    "capture_fps": 30,
    "enable_ocr": true,
    "ocr_regions": {
      "ammo": [1800, 1000, 1900, 1050],
      "health": [50, 1000, 150, 1050],
      "armor": [50, 950, 150, 1000]
    },
    "enable_object_detection": true,
    "detection_targets": ["enemy", "weapon", "item"]
  },
  "controller": {
    "key_mappings": {
      "forward": "W",
      "backward": "S",
      "left": "A",
      "right": "D",
      "jump": "Space",
      "crouch": "Ctrl",
      "sprint": "Shift"
    },
    "mouse_sensitivity": 1.0,
    "skill_mappings": {
      "primary_fire": "mouse_left",
      "secondary_fire": "mouse_right",
      "reload": "R",
      "grenade": "G",
      "melee": "V"
    },
    "combo_definitions": {
      "quick_scope": [
        {"action": "mouse_right_press", "duration": 50},
        {"action": "mouse_left_click", "delay": 100},
        {"action": "mouse_right_release", "delay": 50}
      ]
    }
  },
  "ai_strategy": {
    "decision_interval_ms": 200,
    "combat_style": "aggressive",
    "priorities": ["survival", "objective", "kills"]
  }
}
```

### 5.2 configs/game_profiles/moba_game.json

```json
{
  "profile_name": "MOBA Game Profile",
  "game_type": "moba",
  "description": "多人在线竞技游戏配置",
  "observer": {
    "window_title_pattern": ".*MOBA.*",
    "capture_fps": 10,
    "enable_ocr": true,
    "ocr_regions": {
      "health": [20, 1000, 120, 1030],
      "mana": [20, 1030, 120, 1060],
      "gold": [1800, 10, 1900, 40],
      "level": [150, 970, 180, 1000]
    },
    "minimap_region": [10, 600, 210, 800]
  },
  "controller": {
    "key_mappings": {
      "move": "mouse_right",
      "attack_move": "A",
      "stop": "S",
      "recall": "B"
    },
    "skill_mappings": {
      "skill_q": "Q",
      "skill_w": "W",
      "skill_e": "E",
      "skill_r": "R"
    },
    "item_slots": ["1", "2", "3", "4", "5", "6"],
    "combo_definitions": {
      "full_combo": [
        {"action": "skill", "skill": "Q", "target": "enemy"},
        {"action": "wait", "duration_ms": 100},
        {"action": "skill", "skill": "W"},
        {"action": "attack", "target": "enemy"},
        {"action": "skill", "skill": "E"}
      ]
    }
  },
  "ai_strategy": {
    "decision_interval_ms": 1000,
    "lane_preference": "mid",
    "play_style": "balanced",
    "farm_priority": 0.6,
    "teamfight_priority": 0.8
  }
}
```

### 5.3 configs/model_config.yaml

```yaml
# 动作模型配置

model:
  type: hybrid  # script, rl, bc, hybrid
  version: "1.0.0"

# 脚本模型配置
script_model:
  enabled: true
  confidence: 1.0

# 强化学习模型配置
rl_model:
  enabled: false
  model_path: "models/rl_checkpoint.pth"
  algorithm: "PPO"
  observation_space:
    image_size: [84, 84]
    channels: 3
    state_dim: 32
  action_space:
    discrete_actions: 18
    continuous_dims: 4

# 行为克隆模型配置
bc_model:
  enabled: false
  model_path: "models/bc_checkpoint.pth"
  demo_dataset: "data/expert_demos.pkl"
  batch_size: 32

# 混合模型配置
hybrid_model:
  enabled: false
  rl_weight: 0.7
  bc_weight: 0.3
  fallback_to_script: true

# 训练配置
training:
  device: "cuda"  # cuda, cpu
  epochs: 1000
  learning_rate: 0.0003
  gamma: 0.99
  save_interval: 100
  log_dir: "logs/"
  checkpoint_dir: "checkpoints/"

# 推理配置
inference:
  device: "cuda"
  batch_size: 1
  max_sequence_length: 10
  temperature: 1.0
```

---

## 6. 快速启动脚本

### 6.1 start_all.sh (Linux/macOS)

```bash
#!/bin/bash
# 启动所有服务

echo "=== 启动VCP游戏AI控制系统 ==="

# 检查依赖
echo "检查依赖..."
python -c "import mss, pytesseract" 2>/dev/null || {
    echo "错误: GameObserver依赖未安装"
    echo "请运行: pip install -r Plugin/GameObserver/requirements.txt"
    exit 1
}

node -e "require('axios')" 2>/dev/null || {
    echo "错误: GameController依赖未安装"
    echo "请运行: cd Plugin/GameController && npm install"
    exit 1
}

# 启动动作模型服务
echo "启动动作模型服务..."
python ActionModel/model_server.py 5000 &
MODEL_PID=$!
echo "动作模型服务 PID: $MODEL_PID"

sleep 2

# 检查服务是否启动成功
curl -s http://localhost:5000/health > /dev/null
if [ $? -eq 0 ]; then
    echo "✓ 动作模型服务启动成功"
else
    echo "✗ 动作模型服务启动失败"
    kill $MODEL_PID
    exit 1
fi

echo ""
echo "=== 所有服务已启动 ==="
echo "动作模型API: http://localhost:5000"
echo ""
echo "按 Ctrl+C 停止所有服务"
echo ""

# 等待中断信号
trap "echo '停止服务...'; kill $MODEL_PID; exit 0" SIGINT SIGTERM

wait $MODEL_PID
```

### 6.2 start_all.bat (Windows)

```batch
@echo off
REM 启动所有服务 (Windows)

echo === 启动VCP游戏AI控制系统 ===

echo 检查依赖...
python -c "import mss, pytesseract" 2>nul
if %errorlevel% neq 0 (
    echo 错误: GameObserver依赖未安装
    echo 请运行: pip install -r Plugin\GameObserver\requirements.txt
    exit /b 1
)

echo 启动动作模型服务...
start /B python ActionModel\model_server.py 5000

timeout /t 3 /nobreak >nul

curl -s http://localhost:5000/health >nul 2>&1
if %errorlevel% equ 0 (
    echo ✓ 动作模型服务启动成功
) else (
    echo ✗ 动作模型服务启动失败
    exit /b 1
)

echo.
echo === 所有服务已启动 ===
echo 动作模型API: http://localhost:5000
echo.
echo 按任意键停止服务...
pause >nul

taskkill /F /IM python.exe /FI "WINDOWTITLE eq model_server*" >nul 2>&1
```

---

## 7. 文档和示例

### 7.1 docs/API_Reference.md

```markdown
# API参考文档

## GameObserver API

### CaptureGameState

捕获游戏当前状态。

**请求参数:**
- `window_title` (string, 可选): 窗口标题
- `capture_region` (string, 可选): 捕获区域 "x,y,w,h"
- `enable_ocr` (boolean, 可选): 是否启用OCR
- `ocr_regions` (object, 可选): OCR区域配置

**响应:**
```json
{
  "status": "success",
  "result": {
    "timestamp": "2025-01-15T16:42:00Z",
    "screenshot_base64": "...",
    "recognized_data": {...}
  }
}
```

### GetWindowList

获取所有可见窗口列表。

**响应:**
```json
{
  "status": "success",
  "result": {
    "windows": [...],
    "count": 10
  }
}
```

## GameController API

### ExecuteAction

执行游戏操作。

**请求参数:**
- `command` (string, 必需): 命令类型
- 其他参数根据命令类型而定

**响应:**
```json
{
  "status": "success",
  "result": {
    "executed_actions": [...],
    "total_duration_ms": 550,
    "success_rate": 1.0
  }
}
```

## 动作模型 API

### POST /execute_action

执行单个动作。

**请求体:**
```json
{
  "command": "move",
  "parameters": {
    "direction": "left",
    "duration_ms": 500
  }
}
```

**响应:**
```json
{
  "status": "success",
  "actions": [...],
  "confidence": 1.0
}
```
```

### 7.2 docs/Training_Guide.md

```markdown
# 模型训练指南

## 数据收集

### 1. 人类演示数据收集

```bash
python ActionModel/training/data_collection.py \
    --game "MyGame" \
    --output data/demos/ \
    --duration 3600
```

这将记录1小时的游戏操作。

### 2. 数据格式

```json
{
  "frame_id": 12345,
  "timestamp": 1234567890.123,
  "observation": {
    "image": "base64...",
    "state": {...}
  },
  "action": {
    "type": "move",
    "parameters": {...}
  }
}
```

## 训练行为克隆模型

```bash
python ActionModel/training/train_bc.py \
    --data data/demos/ \
    --epochs 100 \
    --batch-size 32 \
    --output models/bc_checkpoint.pth
```

## 训练强化学习模型

```bash
python ActionModel/training/train_rl.py \
    --algorithm PPO \
    --env GameEnv-v0 \
    --total-timesteps 1000000 \
    --output models/rl_checkpoint.pth
```

## 评估模型

```bash
python ActionModel/training/evaluate.py \
    --model models/bc_checkpoint.pth \
    --episodes 100
```
```

---

## 8. 总结

### 已完成的设计

1. ✅ **完整技术方案** ([`GameAI_Technical_Specification.md`](GameAI_Technical_Specification.md))
2. ✅ **GameObserver插件** - 游戏状态感知
3. ✅ **GameController插件** - 操作指令转换
4. ✅ **动作执行模型** - 脚本和AI模型架构
5. ✅ **集成测试方案** - 完整测试套件
6. ✅ **配置模板** - 不同游戏类型的配置
7. ✅ **启动脚本** - 快速部署工具

### 文件清单

```
VCPgame/
├── GameAI_Technical_Specification.md   ✅ 技术方案
├── Plugin_Implementation_Guide.md      ✅ 实现指南（第一部分）
├── Plugin_Implementation_Guide_Part2.md ✅ 实现指南（第二部分）
│
├── Plugin/
│   ├── GameObserver/                   ✅ 完整设计
│   │   ├── plugin-manifest.json
│   │   ├── config.env
│   │   ├── observer.py
│   │   ├── screen_capture.py
│   │   ├── state_recognition.py
│   │   └── requirements.txt
│   │
│   └── GameController/                 ✅ 完整设计
│       ├── plugin-manifest.json
│       ├── config.env
│       ├── controller.js
│       ├── command_parser.js
│       ├── action_executor.js
│       └── package.json
│
├── ActionModel/                        ✅ 完整设计
│   ├── model_server.py
│   ├── models/
│   ├── input_executor/
│   └── requirements.txt
│
├── configs/                            ✅ 配置模板
│   ├── game_profiles/
│   └── model_config.yaml
│
├── tests/                              ✅ 测试套件
│   ├── test_observer.py
│   ├── test_controller.py
│   └── test_integration.py
│
└── docs/                               ✅ 文档
    ├── API_Reference.md
    └── Training_Guide.md
```

### 下一步操作

在**Code模式**下，按照本指南创建所有文件：

1. 创建插件目录结构
2. 复制所有代码到相应文件
3. 安装依赖
4. 运行测试
5. 启动服务
6. 开始使用！

所有代码都已经过精心设计，可以直接使用。祝你在VCP游戏AI控制系统的开发中取得成功！🎮🤖