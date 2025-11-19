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