# 插件实现指南 - 完整代码文件

本文档包含所有需要创建的插件文件的完整代码。请在Code模式下按照此指南创建实际文件。

---

## 1. GameObserver 插件

### 1.1 目录结构

```
Plugin/GameObserver/
├── plugin-manifest.json
├── config.env
├── observer.py
├── screen_capture.py
├── state_recognition.py
├── requirements.txt
└── README.md
```

### 1.2 plugin-manifest.json

```json
{
  "manifestVersion": "1.0.0",
  "name": "GameObserver",
  "version": "1.0.0",
  "displayName": "游戏状态观察器",
  "description": "捕获游戏画面和状态，为AI提供实时游戏信息",
  "author": "VCP GameAI Team",
  "pluginType": "synchronous",
  "entryPoint": {
    "type": "python",
    "command": "python observer.py"
  },
  "communication": {
    "protocol": "stdio",
    "timeout": 10000
  },
  "configSchema": {
    "GAME_WINDOW_TITLE": {
      "type": "string",
      "description": "要捕获的游戏窗口标题（支持部分匹配）",
      "default": ""
    },
    "CAPTURE_INTERVAL_MS": {
      "type": "number",
      "description": "Service模式下的捕获间隔（毫秒）",
      "default": 1000
    },
    "ENABLE_OCR": {
      "type": "boolean",
      "description": "是否启用OCR文字识别",
      "default": true
    },
    "ENABLE_OBJECT_DETECTION": {
      "type": "boolean",
      "description": "是否启用目标检测",
      "default": false
    },
    "OCR_REGIONS": {
      "type": "string",
      "description": "OCR识别区域配置（JSON格式）",
      "default": "{\"health\": [10, 10, 100, 30], \"mana\": [10, 50, 100, 70]}"
    }
  },
  "capabilities": {
    "invocationCommands": [
      {
        "commandIdentifier": "CaptureGameState",
        "description": "捕获当前游戏状态，返回截图和识别的信息。\n\n功能：\n1. 截取游戏窗口画面\n2. 识别文字信息（血量、蓝量、金币等）\n3. 检测目标位置（如果启用）\n4. 返回Base64编码的截图供AI分析\n\n参数：\n- window_title (字符串, 可选): 指定要捕获的窗口标题，留空则使用配置中的默认值\n- capture_region (字符串, 可选): 指定捕获区域，格式为 \"x,y,width,height\"，留空则捕获整个窗口\n- enable_ocr (布尔, 可选): 是否启用OCR识别，默认为true\n- ocr_regions (字符串, 可选): 自定义OCR区域，JSON格式，如 {\"hp\": [10,10,100,30]}\n\n返回格式：\n{\n  \"timestamp\": \"2025-01-15T16:42:00Z\",\n  \"window_info\": {\n    \"title\": \"游戏窗口标题\",\n    \"size\": {\"width\": 1920, \"height\": 1080}\n  },\n  \"screenshot_base64\": \"iVBORw0KGgo...\",\n  \"recognized_data\": {\n    \"health\": \"85\",\n    \"mana\": \"60\",\n    \"gold\": \"1250\"\n  },\n  \"detected_objects\": [\n    {\"type\": \"enemy\", \"bbox\": [100, 200, 150, 250], \"confidence\": 0.92}\n  ]\n}\n\n调用格式：\n<<<[TOOL_REQUEST]>>>\ntool_name:「始」GameObserver「末」,\nwindow_title:「始」我的游戏「末」,\nenable_ocr:「始」true「末」\n<<<[END_TOOL_REQUEST]>>>",
        "example": "<<<[TOOL_REQUEST]>>>\ntool_name:「始」GameObserver「末」,\nwindow_title:「始」Minecraft「末」,\ncapture_region:「始」0,0,1920,1080「末」\n<<<[END_TOOL_REQUEST]>>>"
      },
      {
        "commandIdentifier": "GetWindowList",
        "description": "获取当前所有可见窗口的列表，帮助确定要捕获的游戏窗口。\n\n返回格式：\n{\n  \"windows\": [\n    {\"title\": \"窗口1\", \"pid\": 1234},\n    {\"title\": \"窗口2\", \"pid\": 5678}\n  ]\n}\n\n调用格式：\n<<<[TOOL_REQUEST]>>>\ntool_name:「始」GameObserver「末」,\ncommand:「始」GetWindowList「末」\n<<<[END_TOOL_REQUEST]>>>"
      }
    ]
  },
  "webSocketPush": {
    "enabled": true,
    "messageType": "game_state_update",
    "usePluginResultAsMessage": true,
    "targetClientType": "VCPLog"
  }
}
```

### 1.3 config.env

```env
# GameObserver 配置文件

# 游戏窗口标题（支持部分匹配）
GAME_WINDOW_TITLE=

# Service模式捕获间隔（毫秒）
CAPTURE_INTERVAL_MS=1000

# 是否启用OCR
ENABLE_OCR=true

# 是否启用目标检测
ENABLE_OBJECT_DETECTION=false

# OCR区域配置（JSON格式）
# 格式: {"region_name": [x, y, width, height]}
OCR_REGIONS={"health": [10, 10, 100, 30], "mana": [10, 50, 100, 70]}

# Tesseract OCR 路径（Windows）
# TESSERACT_PATH=C:/Program Files/Tesseract-OCR/tesseract.exe
```

### 1.4 observer.py

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
GameObserver Plugin - 游戏状态观察器
捕获游戏画面和状态，为AI提供实时游戏信息
"""

import sys
import json
import base64
import os
from datetime import datetime
import traceback

# 导入自定义模块
from screen_capture import ScreenCapture
from state_recognition import StateRecognition


def print_json_output(status, result=None, error=None):
    """统一的JSON输出格式"""
    output = {"status": status}
    if result is not None:
        output["result"] = result
    if error is not None:
        output["error"] = error
    print(json.dumps(output, ensure_ascii=False), file=sys.stdout)
    sys.stdout.flush()


def load_config():
    """从环境变量加载配置"""
    config = {
        'game_window_title': os.getenv('GAME_WINDOW_TITLE', ''),
        'capture_interval_ms': int(os.getenv('CAPTURE_INTERVAL_MS', 1000)),
        'enable_ocr': os.getenv('ENABLE_OCR', 'true').lower() == 'true',
        'enable_object_detection': os.getenv('ENABLE_OBJECT_DETECTION', 'false').lower() == 'true',
        'ocr_regions': json.loads(os.getenv('OCR_REGIONS', '{}')),
        'tesseract_path': os.getenv('TESSERACT_PATH', None)
    }
    return config


def capture_game_state(args, config):
    """
    捕获游戏状态
    
    参数:
        args: 请求参数
        config: 配置信息
    
    返回:
        包含游戏状态的字典
    """
    # 获取参数
    window_title = args.get('window_title') or args.get('windowTitle') or config['game_window_title']
    capture_region = args.get('capture_region') or args.get('captureRegion')
    enable_ocr = args.get('enable_ocr', args.get('enableOcr', config['enable_ocr']))
    ocr_regions = args.get('ocr_regions') or args.get('ocrRegions')
    
    # 解析OCR区域
    if isinstance(ocr_regions, str):
        try:
            ocr_regions = json.loads(ocr_regions)
        except:
            ocr_regions = config['ocr_regions']
    elif not ocr_regions:
        ocr_regions = config['ocr_regions']
    
    # 解析捕获区域
    region = None
    if capture_region:
        try:
            parts = capture_region.split(',')
            region = tuple(map(int, parts))  # (x, y, width, height)
        except:
            pass
    
    # 初始化捕获器
    capturer = ScreenCapture(tesseract_path=config.get('tesseract_path'))
    
    # 捕获屏幕
    try:
        screenshot_result = capturer.capture_window(window_title, region)
        
        if not screenshot_result['success']:
            return {
                "error": screenshot_result.get('error', '捕获失败'),
                "available_windows": capturer.list_windows()
            }
        
        # 转换为Base64
        img_bytes = screenshot_result['image_bytes']
        screenshot_base64 = base64.b64encode(img_bytes).decode('utf-8')
        
        # 构建基础响应
        result = {
            "timestamp": datetime.utcnow().isoformat() + 'Z',
            "window_info": {
                "title": screenshot_result.get('window_title', window_title),
                "size": screenshot_result.get('window_size', {})
            },
            "screenshot_base64": screenshot_base64
        }
        
        # OCR识别
        if enable_ocr and ocr_regions:
            recognizer = StateRecognition(tesseract_path=config.get('tesseract_path'))
            recognized_data = {}
            
            for region_name, region_coords in ocr_regions.items():
                try:
                    text = recognizer.ocr_region(
                        screenshot_result['image'],
                        tuple(region_coords)
                    )
                    recognized_data[region_name] = text
                except Exception as e:
                    recognized_data[region_name] = f"识别失败: {str(e)}"
            
            result["recognized_data"] = recognized_data
        
        # 目标检测（如果启用）
        if config['enable_object_detection']:
            # TODO: 实现目标检测
            result["detected_objects"] = []
        
        return result
        
    except Exception as e:
        return {
            "error": f"捕获过程出错: {str(e)}",
            "traceback": traceback.format_exc()
        }


def get_window_list(config):
    """获取所有可见窗口列表"""
    try:
        capturer = ScreenCapture(tesseract_path=config.get('tesseract_path'))
        windows = capturer.list_windows()
        
        return {
            "windows": windows,
            "count": len(windows)
        }
    except Exception as e:
        return {
            "error": f"获取窗口列表失败: {str(e)}",
            "traceback": traceback.format_exc()
        }


def main():
    """主函数"""
    try:
        # 加载配置
        config = load_config()
        
        # 读取stdin输入
        input_line = sys.stdin.read().strip()
        
        if not input_line:
            print_json_output("error", error="未收到输入参数")
            sys.exit(1)
        
        # 解析JSON参数
        try:
            args = json.loads(input_line)
        except json.JSONDecodeError as e:
            print_json_output("error", error=f"JSON解析失败: {str(e)}")
            sys.exit(1)
        
        # 获取命令类型
        command = args.get('command', 'CaptureGameState')
        
        # 执行相应命令
        if command == 'GetWindowList':
            result = get_window_list(config)
        else:
            # 默认执行捕获
            result = capture_game_state(args, config)
        
        # 检查是否有错误
        if 'error' in result:
            print_json_output("error", error=result['error'])
            sys.exit(1)
        
        # 返回成功结果
        print_json_output("success", result=result)
        sys.exit(0)
        
    except Exception as e:
        print_json_output("error", error=f"未知错误: {str(e)}", traceback=traceback.format_exc())
        sys.exit(1)


if __name__ == "__main__":
    main()
```

### 1.5 screen_capture.py

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
屏幕捕获模块
使用mss进行高性能屏幕截图
"""

import mss
import mss.tools
from PIL import Image
import io
import platform


class ScreenCapture:
    """屏幕捕获类"""
    
    def __init__(self, tesseract_path=None):
        """初始化"""
        self.sct = mss.mss()
        self.tesseract_path = tesseract_path
        self.system = platform.system()
    
    def list_windows(self):
        """
        列出所有可见窗口
        
        返回:
            窗口信息列表
        """
        windows = []
        
        try:
            if self.system == 'Windows':
                import win32gui
                
                def callback(hwnd, windows):
                    if win32gui.IsWindowVisible(hwnd):
                        title = win32gui.GetWindowText(hwnd)
                        if title:
                            windows.append({
                                'title': title,
                                'hwnd': hwnd
                            })
                
                win32gui.EnumWindows(callback, windows)
                
            elif self.system == 'Darwin':  # macOS
                # TODO: 实现macOS窗口枚举
                pass
            
            elif self.system == 'Linux':
                # TODO: 实现Linux窗口枚举
                pass
        
        except Exception as e:
            print(f"枚举窗口失败: {e}")
        
        return windows
    
    def find_window_by_title(self, partial_title):
        """
        根据标题查找窗口
        
        参数:
            partial_title: 窗口标题（支持部分匹配）
        
        返回:
            窗口信息或None
        """
        windows = self.list_windows()
        
        for window in windows:
            if partial_title.lower() in window['title'].lower():
                return window
        
        return None
    
    def get_window_rect(self, hwnd):
        """
        获取窗口矩形区域
        
        参数:
            hwnd: 窗口句柄
        
        返回:
            (left, top, width, height)
        """
        if self.system == 'Windows':
            import win32gui
            rect = win32gui.GetWindowRect(hwnd)
            # rect is (left, top, right, bottom)
            return (rect[0], rect[1], rect[2] - rect[0], rect[3] - rect[1])
        
        return None
    
    def capture_window(self, window_title=None, region=None):
        """
        捕获窗口或屏幕区域
        
        参数:
            window_title: 窗口标题（可选）
            region: 自定义区域 (x, y, width, height)（可选）
        
        返回:
            {
                'success': bool,
                'image': PIL.Image,
                'image_bytes': bytes,
                'window_title': str,
                'window_size': dict
            }
        """
        try:
            monitor = None
            captured_title = "Full Screen"
            
            # 如果指定了窗口标题
            if window_title:
                window = self.find_window_by_title(window_title)
                if not window:
                    return {
                        'success': False,
                        'error': f"未找到窗口: {window_title}"
                    }
                
                rect = self.get_window_rect(window['hwnd'])
                if rect:
                    monitor = {
                        'left': rect[0],
                        'top': rect[1],
                        'width': rect[2],
                        'height': rect[3]
                    }
                    captured_title = window['title']
            
            # 如果指定了自定义区域
            elif region:
                monitor = {
                    'left': region[0],
                    'top': region[1],
                    'width': region[2],
                    'height': region[3]
                }
            
            # 否则捕获主屏幕
            else:
                monitor = self.sct.monitors[1]  # 主屏幕
            
            # 执行截图
            screenshot = self.sct.grab(monitor)
            
            # 转换为PIL Image
            img = Image.frombytes('RGB', screenshot.size, screenshot.rgb)
            
            # 转换为字节
            img_bytes_io = io.BytesIO()
            img.save(img_bytes_io, format='PNG')
            img_bytes = img_bytes_io.getvalue()
            
            return {
                'success': True,
                'image': img,
                'image_bytes': img_bytes,
                'window_title': captured_title,
                'window_size': {
                    'width': screenshot.width,
                    'height': screenshot.height
                }
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }
    
    def __del__(self):
        """清理资源"""
        if hasattr(self, 'sct'):
            self.sct.close()
```

### 1.6 state_recognition.py

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
状态识别模块
使用OCR和图像处理识别游戏状态
"""

import pytesseract
from PIL import Image
import re


class StateRecognition:
    """状态识别类"""
    
    def __init__(self, tesseract_path=None):
        """
        初始化
        
        参数:
            tesseract_path: Tesseract可执行文件路径（Windows需要）
        """
        if tesseract_path:
            pytesseract.pytesseract.tesseract_cmd = tesseract_path
    
    def ocr_region(self, image, region):
        """
        对图像的指定区域进行OCR识别
        
        参数:
            image: PIL Image对象
            region: 区域坐标 (x, y, width, height)
        
        返回:
            识别的文本
        """
        try:
            # 裁剪区域
            x, y, w, h = region
            cropped = image.crop((x, y, x + w, y + h))
            
            # 预处理（可选）
            # cropped = self.preprocess_image(cropped)
            
            # OCR识别
            text = pytesseract.image_to_string(
                cropped,
                config='--psm 7'  # 单行文本模式
            ).strip()
            
            # 后处理：提取数字
            text = self.extract_numbers(text)
            
            return text
            
        except Exception as e:
            return f"OCR错误: {str(e)}"
    
    def preprocess_image(self, image):
        """
        预处理图像以提高OCR准确率
        
        参数:
            image: PIL Image对象
        
        返回:
            处理后的图像
        """
        # 转换为灰度
        image = image.convert('L')
        
        # TODO: 可以添加更多预处理步骤
        # - 二值化
        # - 去噪
        # - 增强对比度
        
        return image
    
    def extract_numbers(self, text):
        """
        从文本中提取数字
        
        参数:
            text: 原始文本
        
        返回:
            提取的数字字符串
        """
        # 提取所有数字
        numbers = re.findall(r'\d+', text)
        
        if numbers:
            return ''.join(numbers)
        
        return text
    
    def detect_template(self, image, template_path, threshold=0.8):
        """
        模板匹配（用于检测特定图标、UI元素）
        
        参数:
            image: 搜索图像
            template_path: 模板图像路径
            threshold: 匹配阈值
        
        返回:
            匹配位置列表
        """
        # TODO: 实现模板匹配
        # 使用OpenCV的matchTemplate
        pass
```

### 1.7 requirements.txt

```
mss>=9.0.1
pillow>=10.0.0
pytesseract>=0.3.10
pywin32>=306; platform_system == "Windows"
```

### 1.8 README.md

```markdown
# GameObserver 插件

## 功能描述

GameObserver 是一个用于捕获游戏状态的VCP同步插件。它可以：

- 📸 捕获游戏窗口截图
- 🔍 OCR识别文字信息（血量、蓝量、金币等）
- 🎯 目标检测（可选，需要额外配置）
- 📊 返回结构化的游戏状态数据

## 安装依赖

```bash
pip install -r requirements.txt
```

### Windows额外要求

需要安装Tesseract OCR：
1. 下载：https://github.com/UB-Mannheim/tesseract/wiki
2. 安装到默认路径或在config.env中指定路径

### macOS

```bash
brew install tesseract
```

### Linux

```bash
sudo apt-get install tesseract-ocr
```

## 配置

编辑 `config.env` 文件：

```env
GAME_WINDOW_TITLE=你的游戏名称
ENABLE_OCR=true
OCR_REGIONS={"health": [10, 10, 100, 30], "mana": [10, 50, 100, 70]}
```

## 使用示例

### 捕获游戏状态

```
<<<[TOOL_REQUEST]>>>
tool_name:「始」GameObserver「末」,
window_title:「始」Minecraft「末」,
enable_ocr:「始」true「末」
<<<[END_TOOL_REQUEST]>>>
```

### 获取窗口列表

```
<<<[TOOL_REQUEST]>>>
tool_name:「始」GameObserver「末」,
command:「始」GetWindowList「末」
<<<[END_TOOL_REQUEST]>>>
```

## 返回格式

```json
{
  "status": "success",
  "result": {
    "timestamp": "2025-01-15T16:42:00Z",
    "window_info": {
      "title": "游戏窗口",
      "size": {"width": 1920, "height": 1080}
    },
    "screenshot_base64": "iVBORw0KGgo...",
    "recognized_data": {
      "health": "85",
      "mana": "60"
    }
  }
}
```

## 故障排除

### OCR无法识别

1. 确保Tesseract已正确安装
2. 检查OCR_REGIONS配置是否正确
3. 尝试调整区域坐标

### 找不到游戏窗口

1. 使用GetWindowList命令查看所有窗口
2. 确保窗口标题匹配正确
3. 游戏必须在可见状态（非最小化）
```

---

## 2. GameController 插件

### 2.1 目录结构

```
Plugin/GameController/
├── plugin-manifest.json
├── config.env
├── controller.js
├── command_parser.js
├── action_executor.js
├── package.json
└── README.md
```

### 2.2 plugin-manifest.json

```json
{
  "manifestVersion": "1.0.0",
  "name": "GameController",
  "version": "1.0.0",
  "displayName": "游戏控制器",
  "description": "将AI的高层指令转换为具体的游戏操作",
  "author": "VCP GameAI Team",
  "pluginType": "synchronous",
  "entryPoint": {
    "type": "nodejs",
    "command": "node controller.js"
  },
  "communication": {
    "protocol": "stdio",
    "timeout": 30000
  },
  "configSchema": {
    "ACTION_MODEL_URL": {
      "type": "string",
      "description": "动作模型API的URL",
      "default": "http://localhost:5000"
    },
    "EXECUTION_MODE": {
      "type": "string",
      "description": "执行模式: script(脚本) 或 model(AI模型)",
      "default": "script"
    },
    "DEFAULT_ACTION_DURATION_MS": {
      "type": "number",
      "description": "默认动作持续时间（毫秒）",
      "default": 100
    }
  },
  "capabilities": {
    "invocationCommands": [
      {
        "commandIdentifier": "ExecuteAction",
        "description": "执行游戏操作指令。此工具支持串行调用，可一次执行多个连续操作。\n\n支持的操作类型：\n\n1. **移动 (move)**\n   - direction: 方向 (up/down/left/right/forward/backward)\n   - distance: 距离（像素或游戏单位）\n   - duration_ms: 持续时间（毫秒）\n\n2. **攻击 (attack)**\n   - target: 目标标识 (enemy_1, nearest_enemy, etc.)\n   - attack_type: 攻击类型 (basic, heavy, ranged)\n\n3. **技能 (skill)**\n   - skill_name: 技能名称\n   - target: 目标（可选）\n   - position: 释放位置 \"x,y\"（可选）\n\n4. **交互 (interact)**\n   - object: 交互对象\n   - action: 交互动作 (pickup, use, talk)\n\n5. **组合技 (combo)**\n   - combo_name: 组合技名称\n   - target: 目标\n\n**单个操作示例**：\n<<<[TOOL_REQUEST]>>>\ntool_name:「始」GameController「末」,\ncommand:「始」move「末」,\ndirection:「始」left「末」,\nduration_ms:「始」500「末」\n<<<[END_TOOL_REQUEST]>>>\n\n**串行调用示例**（推荐用于战斗场景）：\n<<<[TOOL_REQUEST]>>>\ntool_name:「始」GameController「末」,\ncommand1:「始」skill「末」,\nskill_name1:「始」fireball「末」,\ntarget1:「始」enemy_1「末」,\ncommand2:「始」move「末」,\ndirection2:「始」backward「末」,\nduration_ms2:「始」300「末」,\ncommand3:「始」attack「末」,\ntarget3:「始」enemy_1「末」,\nattack_type3:「始」basic「末」\n<<<[END_TOOL_REQUEST]>>>\n\n返回格式：\n{\n  \"executed_actions\": [\n    {\"command\": \"skill\", \"status\": \"success\", \"duration_ms\": 250},\n    {\"command\": \"move\", \"status\": \"success\", \"duration_ms\": 300}\n  ],\n  \"total_duration_ms\": 550,\n  \"success_rate\": 1.0\n}",
        "example": "<<<[TOOL_REQUEST]>>>\ntool_name:「始」GameController「末」,\ncommand:「始」attack「末」,\ntarget:「始」nearest_enemy「末」,\nattack_type:「始」basic「末」\n<<<[END_TOOL_REQUEST]>>>"
      }
    ]
  }
}
```

### 2.3 config.env

```env
# GameController 配置文件

# 动作模型API URL
ACTION_MODEL_URL=http://localhost:5000

# 执行模式: script(规则脚本) 或 model(AI模型)
EXECUTION_MODE=script

# 默认动作持续时间（毫秒）
DEFAULT_ACTION_DURATION_MS=100

# 键盘映射配置（JSON格式）
# KEY_MAPPINGS={"forward": "W", "backward": "S", "left": "A", "right": "D"}
```

### 2.4 controller.js

```javascript
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
```

### 2.5 command_parser.js

```javascript
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
```

### 2.6 action_executor.js

```javascript
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
        
        // 模拟执行（实际应调用输入系统）
        // TODO: 集成PyAutoGUI或robotjs来实际执行
        await simulateExecution(actions);
        
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
 * 模拟执行操作
 */
async function simulateExecution(actions) {
    // TODO: 实际实现时，这里应该调用真正的输入系统
    // 例如使用robotjs或通过HTTP调用Python的PyAutoGUI
    
    // 模拟延迟
    const totalDuration = Math.max(...actions.map(a => a.timestamp), 0) + 100;
    await new Promise(resolve => setTimeout(resolve, totalDuration));
}

module.exports = {
    executeActions,
    executeViaScript,
    executeViaModel
};
```

### 2.7 package.json

```json
{
  "name": "game-controller-plugin",
  "version": "1.0.0",
  "description": "VCP GameController Plugin - 游戏控制器插件",
  "main": "controller.js",
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1"
  },
  "keywords": ["vcp", "plugin", "game", "controller"],
  "author": "VCP GameAI Team",
  "license": "MIT",
  "dependencies": {
    "axios": "^1.6.0"
  }
}
```

### 2.8 README.md

```markdown
# GameController 插件

## 功能描述

GameController 是一个将AI的高层语义指令转换为具体游戏操作的VCP同步插件。

## 安装依赖

```bash
npm install
```

## 配置

编辑 `config.env` 文件：

```env
EXECUTION_MODE=script
ACTION_MODEL_URL=http://localhost:5000
```

## 使用示例

### 单个操作

```
<<<[TOOL_REQUEST]>>>
tool_name:「始」GameController「末」,
command:「始」move「末」,
direction:「始」left「末」,
duration_ms:「始」500「末」
<<<[END_TOOL_REQUEST]>>>
```

### 串行操作（推荐）

```
<<<[TOOL_REQUEST]>>>
tool_name:「始」GameController「末」,
command1:「始」skill「末」,
skill_name1:「始」fireball「末」,
command2:「始」move「末」,
direction2:「始」backward「末」
<<<[END_TOOL_REQUEST]>>>
```

## 支持的命令

- **move**: 移动
- **attack**: 攻击
- **skill**: 释放技能
- **interact**: 交互
- **combo**: 组合技

## 执行模式

### 脚本模式 (script)
使用预定义的规则生成操作序列，响应快速但灵活性有限。

### 模型模式 (model)
调用AI模型生成操作序列，更智能但需要额外的模型服务。
```

---

## 3. 动作模型实现

### 3.1 目录结构

```
ActionModel/
├── model_server.py
├── models/
│   ├── __init__.py
│   ├── base_model.py
│   └── script_model.py
├── input_executor/
│   ├── __init__.py
│   └── keyboard_mouse.py
├── requirements.txt
└── README.md
```

### 3.2 model_server.py

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
动作模型服务器
提供HTTP API接口，接收高层指令并返回操作序列
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import json
import sys

from models.script_model import ScriptBasedModel

app = Flask(__name__)
CORS(app)

# 初始化模型
model = ScriptBasedModel()


@app.route('/health', methods=['GET'])
def health_check():
    """健康检查"""
    return jsonify({
        'status': 'healthy',
        'model_type': model.get_name()
    })


@app.route('/execute_action', methods=['POST'])
def execute_action():
    """
    执行动作
    
    请求体:
    {
        "command": "move",
        "parameters": {
            "direction": "left",
            "duration_ms": 500
        }
    }
    
    响应:
    {
        "status": "success",
        "actions": [...],
        "confidence": 0.95
    }
    """
    try:
        data = request.json
        
        if not data or 'command' not in data:
            return jsonify({
                'status': 'error',
                'error': '缺少command字段'
            }), 400
        
        command_type = data['command']
        parameters = data.get('parameters', {})
        
        # 使用模型生成操作序列
        actions = model.predict(command_type, parameters)
        
        return jsonify({
            'status': 'success',
            'actions': actions,
            'confidence': 1.0,  # 脚本模式始终为1.0
            'expected_duration_ms': sum(a.get('duration', 0) for a in actions)
        })
        
    except Exception as e:
        return jsonify({
            'status': 'error',
            'error': str(e)
        }), 500


@app.route('/batch_execute', methods=['POST'])
def batch_execute():
    """
    批量执行多个动作
    
    请求体:
    {
        "commands": [
            {"command": "move", "parameters": {...}},
            {"command": "attack", "parameters": {...}}
        ]
    }
    """
    try:
        data = request.json
        
        if not data or 'commands' not in data:
            return jsonify({
                'status': 'error',
                'error': '缺少commands字段'
            }), 400
        
        all_actions = []
        
        for cmd in data['commands']:
            actions = model.predict(cmd['command'], cmd.get('parameters', {}))
            all_actions.extend(actions)
        
        return jsonify({
            'status': 'success',
            'actions': all_actions,
            'total_actions': len(all_actions)
        })
        
    except Exception as e:
        return jsonify({
            'status': 'error',
            'error': str(e)
        }), 500


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5000
    print(f"启动动作模型服务器 @ http://0.0.0.0:{port}")
    app.run(host='0.0.0.0', port=port, debug=False)
```

### 3.3 models/base_model.py

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
基础模型类
定义模型接口
"""

from abc import ABC, abstractmethod


class BaseActionModel(ABC):
    """动作模型基类"""
    
    @abstractmethod
    def predict(self, command_type, parameters):
        """
        预测操作序列
        
        参数:
            command_type: 命令类型
            parameters: 参数字典
        
        返回:
            操作序列列表
        """
        pass
    
    @abstractmethod
    def get_name(self):
        """获取模型名称"""
        pass
```

### 3.4 models/script_model.py

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
脚本驱动模型
使用规则生成操作序列
"""

from .base_model import BaseActionModel


class ScriptBasedModel(BaseActionModel):
    """基于脚本规则的动作模型"""
    
    def __init__(self):
        """初始化"""
        # 键位映射
        self.key_map = {
            'up': 'W',
            'down': 'S',
            'left': 'A',
            'right': 'D',
            'forward': 'W',
            'backward': 'S'
        }
        
        # 技能键位
        self.skill_map = {
            'fireball': 'Q',
            'ice_blast': 'W',
            'heal': 'E',
            'shield': 'R',
            'dash': 'Shift'
        }
    
    def predict(self, command_type, parameters):
        """生成操作序列"""
        
        if command_type == 'move':
            return self._generate_move(parameters)
        
        elif command_type == 'attack':
            return self._generate_attack(parameters)
        
        elif command_type == 'skill':
            return self._generate_skill(parameters)
        
        elif command_type == 'interact':
            return self._generate_interact(parameters)
        
        elif command_type == 'combo':
            return self._generate_combo(parameters)
        
        else:
            raise ValueError(f"不支持的命令类型: {command_type}")
    
    def _generate_move(self, params):
        """生成移动操作"""
        direction = params.get('direction', 'forward').lower()
        duration = params.get('duration_ms', params.get('duration', 200))
        
        key = self.key_map.get(direction, 'W')
        
        return [
            {
                'type': 'keydown',
                'key': key,
                'timestamp': 0
            },
            {
                'type': 'keyup',
                'key': key,
                'timestamp': duration
            }
        ]
    
    def _generate_attack(self, params):
        """生成攻击操作"""
        attack_type = params.get('attack_type', 'basic').lower()
        
        if attack_type == 'basic':
            return [
                {
                    'type': 'mouse_click',
                    'button': 'left',
                    'timestamp': 0
                }
            ]
        
        elif attack_type == 'heavy':
            return [
                {
                    'type': 'mouse_press',
                    'button': 'left',
                    'timestamp': 0
                },
                {
                    'type': 'mouse_release',
                    'button': 'left',
                    'timestamp': 800
                }
            ]
        
        elif attack_type == 'ranged':
            return [
                {
                    'type': 'mouse_press',
                    'button': 'right',
                    'timestamp': 0
                },
                {
                    'type': 'mouse_release',
                    'button': 'right',
                    'timestamp': 300
                }
            ]
        
        return []
    
    def _generate_skill(self, params):
        """生成技能操作"""
        skill_name = params.get('skill_name', params.get('skillName', '')).lower()
        
        key = self.skill_map.get(skill_name, 'Q')
        
        return [
            {
                'type': 'keypress',
                'key': key,
                'timestamp': 0
            }
        ]
    
    def _generate_interact(self, params):
        """生成交互操作"""
        return [
            {
                'type': 'keypress',
                'key': 'F',
                'timestamp': 0
            }
        ]
    
    def _generate_combo(self, params):
        """生成组合技操作"""
        combo_name = params.get('combo_name', params.get('comboName', '')).lower()
        
        # 预定义组合技
        combos = {
            'fire_combo': [
                {'type': 'keypress', 'key': 'Q', 'timestamp': 0},
                {'type': 'keypress', 'key': 'W', 'timestamp': 200},
                {'type': 'mouse_click', 'button': 'left', 'timestamp': 400}
            ],
            'defensive_combo': [
                {'type': 'keypress', 'key': 'R', 'timestamp': 0},
                {'type': 'keydown', 'key': 'S', 'timestamp': 100},
                {'type': 'keyup', 'key': 'S', 'timestamp': 400}
            ]
        }
        
        return combos.get(combo_name, [])
    
    def get_name(self):
        """获取模型名称"""
        return "ScriptBasedModel"
```

### 3.5 input_executor/keyboard_mouse.py

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
键盘鼠标输入执行器
使用PyAutoGUI执行实际的输入操作
"""

import pyautogui
import time


class InputExecutor:
    """输入执行器"""
    
    def __init__(self):
        """初始化"""
        # 设置PyAutoGUI的安全设置
        pyautogui.PAUSE = 0.01  # 每个操作之间的暂停时间
        pyautogui.FAILSAFE = True  # 鼠标移到左上角会抛出异常
    
    def execute_actions(self, actions):
        """
        执行操作序列
        
        参数:
            actions: 操作列表
        
        返回:
            执行结果
        """
        results = []
        start_time = time.time()
        
        for action in actions:
            try:
                # 等待到指定时间点
                if 'timestamp' in action:
                    elapsed = (time.time() - start_time) * 1000
                    wait_time = max(0, action['timestamp'] - elapsed)
                    if wait_time > 0:
                        time.sleep(wait_time / 1000)
                
                # 执行操作
                if action['type'] == 'keydown':
                    pyautogui.keyDown(action['key'])
                    results.append({'action': 'keydown', 'key': action['key'], 'status': 'success'})
                
                elif action['type'] == 'keyup':
                    pyautogui.keyUp(action['key'])
                    results.append({'action': 'keyup', 'key': action['key'], 'status': 'success'})
                
                elif action['type'] == 'keypress':
                    pyautogui.press(action['key'])
                    results.append({'action': 'keypress', 'key': action['key'], 'status': 'success'})
                
                elif action['type'] == 'mouse_click':
                    button = action.get('button', 'left')
                    pyautogui.click(button=button)
                    results.append({'action': 'click', 'button': button, 'status': 'success'})
                
                elif action['type'] == 'mouse_press':
                    button = action.get('button', 'left')
                    pyautogui.mouseDown(button=button)
                    results.append({'action': 'mousedown', 'button': button, 'status': 'success'})
                
                elif action['type'] == 'mouse_release':
                    button = action.get('button', 'left')
                    pyautogui.mouseUp(button=button)
                    results.append({'action':