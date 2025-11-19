# AI创造力涌现引擎 - 插件系统

本目录包含三个协同工作的 VCP 插件，用于激发和评估 AI 的创造力。

## 📦 插件列表

### 1. ConceptCollider（概念碰撞器）
**类型**: 同步插件  
**语言**: Node.js  
**功能**: 将两个不相关的概念进行深度碰撞，生成创新组合方案

**支持的碰撞模式**:
- `metaphor`: 隐喻模式 - 寻找深层相似性
- `practical`: 实践模式 - 探索跨界应用可行性
- `artistic`: 艺术模式 - 创造美学或概念艺术

**调用示例**:
```
<<<[TOOL_REQUEST]>>>
tool_name:「始」ConceptCollider「末」,
concept_a:「始」区块链「末」,
concept_b:「始」农业「末」,
collision_mode:「始」practical「末」
<<<[END_TOOL_REQUEST]>>>
```

### 2. CreativityInjector（创造力注入器）
**类型**: 消息预处理器插件  
**语言**: Python  
**功能**: 在消息预处理阶段自动注入创造性思维触发器

**注入模式**:
- `metaphor`: 隐喻思维触发
- `crossDomain`: 跨领域融合
- `combination`: 概念组合
- `reversal`: 反转思维
- `constraint`: 约束激发

**特点**: 无需 AI 主动调用，自动在每 N 条消息时触发（可配置）

### 3. CreativityScorer（创造力评分器）
**类型**: 静态/定时插件  
**语言**: Python  
**功能**: 定期评估 AI 输出的创造力表现

**评估维度**:
- 新颖度 (40%): 与历史内容的差异度
- 跨域性 (35%): 涉及领域的广度和深度
- 可行性 (25%): 想法的实际可行性

**特点**: 定时自动运行，生成创造力指标反馈

## 🚀 快速开始

### 安装依赖

**ConceptCollider (Node.js)**:
```bash
cd Plugin/ConceptCollider
npm install
```

**CreativityInjector (Python)**:
```bash
cd Plugin/CreativityInjector
pip install -r requirements.txt
```

**CreativityScorer (Python)**:
```bash
cd Plugin/CreativityScorer
pip install -r requirements.txt
```

### 测试插件

**测试 ConceptCollider**:
```bash
echo '{"concept_a":"量子力学","concept_b":"烹饪","collision_mode":"metaphor"}' | node Plugin/ConceptCollider/collider.js
```

**测试 CreativityInjector**:
```bash
echo '{"content":"如何提高团队协作效率？"}' | python Plugin/CreativityInjector/injector.py
```

**测试 CreativityScorer**:
```bash
echo '{"content":"这是一个测试内容"}' | python Plugin/CreativityScorer/scorer.py
```

## 📁 目录结构

```
Plugin/
├── ConceptCollider/
│   ├── plugin-manifest.json       # 插件配置清单
│   ├── config.env                 # 环境变量配置
│   ├── package.json               # Node.js 依赖
│   ├── collider.js                # 主程序
│   └── algorithms/                # 碰撞算法
│       ├── metaphor.js           # 隐喻模式
│       ├── practical.js          # 实践模式
│       └── artistic.js           # 艺术模式
│
├── CreativityInjector/
│   ├── plugin-manifest.json       # 插件配置清单
│   ├── config.env                 # 环境变量配置
│   ├── requirements.txt           # Python 依赖
│   ├── injector.py                # 主程序
│   └── triggers/                  # 触发器模块
│       ├── trigger_generator.py  # 触发器生成器
│       └── context_analyzer.py   # 上下文分析器
│
├── CreativityScorer/
│   ├── plugin-manifest.json       # 插件配置清单
│   ├── config.env                 # 环境变量配置
│   ├── requirements.txt           # Python 依赖
│   ├── scorer.py                  # 主程序
│   └── analyzers/                 # 分析器模块
│       ├── novelty.py            # 新颖度分析
│       ├── cross_domain.py       # 跨域性分析
│       └── feasibility.py        # 可行性分析
│
└── README.md                      # 本文件
```

## 📊 数据文件

数据文件位于项目根目录的 `data/` 文件夹：

- `concept_pool.json`: 概念库，包含各领域的概念和隐喻
- `inspiration_vault.json`: 灵感库，存储碰撞结果
- `creativity_history.json`: 创造力历史记录

## ⚙️ 配置说明

每个插件都有自己的 `config.env` 文件，可以调整以下参数：

### ConceptCollider 配置
- `CONCEPT_POOL_PATH`: 概念库路径
- `INSPIRATION_VAULT_PATH`: 灵感库路径
- `SIMILARITY_THRESHOLD`: 相似度阈值
- `MAX_INSIGHTS_PER_COLLISION`: 每次碰撞的最大洞见数

### CreativityInjector 配置
- `RANDOMNESS_LEVEL`: 随机性强度 (0.0-1.0)
- `TRIGGER_FREQUENCY`: 触发频率（每 N 条消息）
- `MAX_INJECTION_LENGTH`: 注入内容最大长度
- `ENABLED_MODES`: 启用的注入模式

### CreativityScorer 配置
- `NOVELTY_WEIGHT`: 新颖度权重
- `CROSS_DOMAIN_WEIGHT`: 跨域性权重
- `FEASIBILITY_WEIGHT`: 可行性权重
- `SCORING_INTERVAL`: 评分间隔（秒）

## 🔧 故障排查

### 常见问题

1. **ConceptCollider 返回空结果**
   - 检查 `data/concept_pool.json` 是否存在
   - 确认 Node.js 依赖已正确安装

2. **CreativityInjector 从不触发**
   - 检查 `TRIGGER_FREQUENCY` 配置
   - 确认消息计数器正常工作

3. **CreativityScorer 评分异常**
   - 检查 Python 依赖是否完整
   - 确认 `data/creativity_history.json` 权限

### 日志调试

在插件代码中添加调试输出：

**Python**:
```python
import sys
print(f"DEBUG: {message}", file=sys.stderr)
```

**Node.js**:
```javascript
console.error('DEBUG:', message);
```

## 📚 相关文档

- [完整设计方案](../AI创造力涌现引擎_完整设计方案.md)
- [实现文件清单](../插件实现文件清单.md)
- [快速开始指南](../快速开始指南.md)
- [VCP 插件开发手册](../同步异步插件开发手册.md)

## 🤝 贡献

欢迎提交问题和改进建议！

## 📄 许可证

MIT License