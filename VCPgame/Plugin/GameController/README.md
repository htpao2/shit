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