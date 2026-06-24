# 原点透镜引擎 - 快速启动指南

## 🚀 三步启动

### 步骤 1: 安装依赖
```bash
cd Plugin/OriginLensEngine
pip install -r requirements.txt
```

### 步骤 2: 配置 API 密钥
编辑 `config.env`，填入你的 OpenAI API 密钥：
```env
EMBEDDING_API_KEY=sk-your-openai-api-key-here
```

### 步骤 3: 初始化数据库
```bash
python init_database.py
```

完成！插件现已就绪。

## 📝 测试运行

### 方法一：通过 VCP 主服务调用
将插件加载到 VCP 系统后，AI 可以这样调用：

```
<<<[TOOL_REQUEST]>>>
maid:「始」TestAgent「末」,
tool_name:「始」OriginLensEngine「末」,
text:「始」为什么神经元需要累积很多刺激才放电？「末」
<<<[END_TOOL_REQUEST]>>>
```

### 方法二：命令行直接测试
```bash
echo '{"text":"为什么一个人的改变需要很多小事累积？"}' | python engine_core.py
```

## 🔧 常见问题

### 问题：`ModuleNotFoundError: No module named 'numpy'`
**解决**：运行 `pip install -r requirements.txt`

### 问题：`ValueError: 未设置 EMBEDDING_API_KEY 环境变量`
**解决**：确保 `config.env` 中已填写正确的 API 密钥

### 问题：首次运行很慢
**说明**：首次运行需要生成向量库（调用 20+ 次 Embedding API），大约需要 1-2 分钟。生成后会保存到 `base_vectors.npz`，后续运行秒级完成。

### 问题：数据库文件不存在
**解决**：运行 `python init_database.py` 创建数据库

## 📊 预期输出示例

输入：
```
为什么神经元需要累积足够多的刺激才会放电?
```

输出：
```markdown
### 🔍 原点透镜引擎分析结果

**识别出的底层硬逻辑：阈值累积 / 涌现**
置信度：87.32%

**核心定义：**
量变引起质变。微小的输入持续累积，当超过某个临界阈值时，系统状态发生突变式跃迁。

---

### 📚 跨学科同构案例

**1. 神经科学**
现象：神经元LIF模型：膜电位持续累积，超过阈值后才会放电（全或无定律）。
降维打法：不要分散力量，必须把分力聚合到同一点突破...
```

## 🎯 下一步

- 阅读 [`README.md`](README.md) 了解详细原理
- 查看 [`plans/OriginLensEngine_Plan.md`](../../plans/OriginLensEngine_Plan.md) 了解设计方案
- 编辑 [`isomorphisms_data.py`](isomorphisms_data.py) 添加更多同构案例
- 将插件集成到你的 VCP 主服务

## 📞 支持

遇到问题？检查这些文件：
- [`README.md`](README.md) - 完整文档
- [`engine_core.py`](engine_core.py) - 核心代码（带详细注释）
- [`thinking.txt`](../../thinking.txt) - 原始设计理念

祝你降维打击愉快！🎉
