# 原点透镜引擎 (Origin-00 Engine)

## 概述

原点透镜引擎是一个基于纯数学向量计算的VCP插件，实现零幻觉的"降维打击"式思维分析。它将复杂的专业问题剥离名词噪音，暴露底层的物理硬逻辑，并返回跨学科的同构案例和降维打法。

## 核心原理

基于 [`thinking.txt`](../../thinking.txt) 的设计理念：

1. **去名词化器**：通过正交投影去除专业术语空间，保留纯粹的动作和关系向量
2. **硬逻辑分类器**：用余弦相似度匹配20个宇宙基础积木，绝对锁定底层规律
3. **同构联想库**：从SQLite数据库中精确查询跨学科案例，零幻觉返回

## 安装步骤

### 1. 安装依赖

```bash
cd Plugin/OriginLensEngine
pip install -r requirements.txt
```

### 2. 配置API密钥

编辑 [`config.env`](config.env)：

```env
EMBEDDING_API_KEY=your-openai-api-key-here
EMBEDDING_API_URL=https://api.openai.com/v1/embeddings
EMBEDDING_MODEL=text-embedding-3-small
```

支持的Embedding服务：
- OpenAI (text-embedding-3-small/large)
- Volcengine (doubao-embedding)
- 其他兼容OpenAI API格式的服务

### 3. 初始化数据库

```bash
python init_database.py
```

这会创建 `origin_database.sqlite`，包含：
- 20个宇宙基础积木定义
- 跨学科同构案例库

### 4. 首次运行自动生成向量库

第一次调用插件时，会自动：
1. 为20个基础积木生成Embedding向量
2. 为专业名词库生成向量空间
3. 保存到 `base_vectors.npz`（后续直接加载，不再调用API）

## 使用示例

### AI调用格式

```
<<<[TOOL_REQUEST]>>>
maid:「始」Agent01「末」,
tool_name:「始」OriginLensEngine「末」,
text:「始」为什么神经元需要累积足够多的刺激才会放电?「末」
<<<[END_TOOL_REQUEST]>>>
```

### 预期输出

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
降维打法：不要分散力量，必须把分力聚合到同一点突破。集中资源攻击单一目标直到超过临界点。

**2. 社会学**
现象：破窗效应/从众心理：一扇破窗不修，整条街都会被破坏。小恶累积引发大崩溃。
降维打法：在早期就修复'破窗'，阻止负面累积达到临界点。

**3. 日常生活**
现象：骆驼祥子的最后一根稻草：压力持续累积，最终一个微小事件引发崩溃。
降维打法：关注累积量而非单次事件。定期释放压力，避免逼近阈值。
```

## 20个宇宙基础积木

| ID | 硬逻辑名称 | 核心描述 |
|----|-----------|---------|
| 01 | 能量守恒 / 零和博弈 | 系统总量恒定，此消彼长 |
| 02 | 阈值累积 / 涌现 | 量变引起质变，临界点突变 |
| 03 | 负反馈 / 动态平衡 | 偏差自动修正，维持稳态 |
| 04 | 信息降维 / 投影 | 高维压缩到低维，保留核心特征 |
| 05 | 信号叠加 / 干涉 | 多信号叠加，建设性/破坏性干涉 |
| 06 | 正反馈 / 马太效应 | 强者愈强，弱者愈弱，指数增长 |
| 07 | 熵增 / 无序化 | 系统自发趋向混乱，维持秩序需要能量 |
| 08 | 梯度驱动 / 势差流动 | 从高势能流向低势能，直到平衡 |
| 09 | 共振 / 频率匹配 | 频率一致时能量传递效率最大 |
| 10 | 分形 / 自相似 | 不同尺度呈现相同结构 |
| 11 | 路径依赖 / 锁定效应 | 早期选择约束后续发展 |
| 12 | 冗余 / 容错 | 备份组件抵抗局部故障 |
| 13 | 瓶颈 / 短板效应 | 最弱环节决定整体性能 |
| 14 | 相变 / 对称性破缺 | 从一种有序态跃迁到另一种 |
| 15 | 博弈 / 纳什均衡 | 多主体互动达到稳定状态 |
| 16 | 信息不对称 / 筛选信号 | 信息差距与信号传递 |
| 17 | 网络效应 / 梅特卡夫定律 | 节点越多价值越大 |
| 18 | 递归 / 自指 | 输出作为输入，自我引用 |
| 19 | 涨落 / 随机扰动 | 随机波动可被放大为有序结构 |
| 20 | 解耦 / 模块化 | 分解为独立低耦合模块 |

## 文件结构

```
Plugin/OriginLensEngine/
├── plugin-manifest.json    # VCP插件配置
├── config.env              # API密钥配置
├── requirements.txt        # Python依赖
├── engine_core.py          # 核心引擎脚本
├── init_database.py        # 数据库初始化脚本
├── isomorphisms_data.py    # 同构案例数据（可选）
├── origin_database.sqlite  # SQLite数据库（运行后生成）
├── base_vectors.npz        # 向量库（首次运行后生成）
└── README.md               # 本文档
```

## 扩展数据库

### 添加新的同构案例

1. 编辑 [`isomorphisms_data.py`](isomorphisms_data.py)
2. 按格式添加案例到 `ISOMORPHISMS` 列表：

```python
{"logic_id": 2, "discipline": "你的学科", "phenomenon": "现象描述", "solution": "降维打法"}
```

3. 重新运行 `python init_database.py`

### 修改专业名词库

编辑 [`engine_core.py`](engine_core.py) 中的 `initialize_vectors()` 函数，修改 `jargon_terms` 列表。

## 技术细节

### 向量维度
- 使用 OpenAI text-embedding-3-small：1536维
- 使用 OpenAI text-embedding-3-large：3072维

### 性能优化
- 向量库只在首次运行时生成，后续直接加载 `.npz` 文件
- SQLite查询毫秒级完成
- 整个分析流程通常在1-3秒内完成（取决于Embedding API响应速度）

### 数学原理
- **正交投影**：`V_core = V_input - Σ(V_input · V_jargon_i) * V_jargon_i`
- **余弦相似度**：`cos(θ) = (A · B) / (||A|| * ||B||)`

## 常见问题

**Q: 为什么首次运行很慢？**
A: 首次运行需要为20个基础积木和专业名词生成Embedding向量。生成后会保存到本地，后续运行会直接加载。

**Q: 如何提高识别准确度？**
A: 
1. 扩充专业名词库（更好地过滤噪音）
2. 优化基础积木的描述文本（更准确的向量表示）
3. 增加同构案例数量（更丰富的输出）

**Q: 支持离线运行吗？**
A: 目前需要在线Embedding API。未来可以集成本地模型（如sentence-transformers）。

## 开发路线图

- [x] 核心三大模块实现
- [x] VCP同步插件接口
- [x] 20个基础积木定义
- [ ] 扩充同构案例库到每个积木10+案例
- [ ] 支持本地Embedding模型
- [ ] 添加异步指令：批量更新案例库
- [ ] 知识图谱可视化（Mermaid）
- [ ] 增量学习：用户自定义案例

## 许可证

MIT License

## 贡献

欢迎提交同构案例！格式参考 [`isomorphisms_data.py`](isomorphisms_data.py)。
