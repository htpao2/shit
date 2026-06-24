# 原点透镜引擎 (Origin-00 Engine) 插件设计方案

## 1. 架构定位与核心策略
- **混合架构定位**：核心的“降维打击”分析流程（去名词化 -> 硬逻辑匹配 -> 同构联想）采用**同步指令**以保证毫秒级的快速响应；而未来的扩展功能（如增量构建向量库、知识图谱生成等较重操作）保留为**异步指令**。
- **降维打击工作流**：将大模型的作用压缩至仅进行文本到向量的 Embedding 转换（使用云端 API 如 OpenAI/Volcengine Embeddings 以保障稳定性和即开即用），核心归纳全量交由冰冷的数学公式（矩阵投影操作）计算，彻底消除幻觉。

## 2. 三大核心模块实现
### 模块 1：去名词化器（专业噪音剥离）
- **实现原理**：正交投影过滤。
- **机制**：
  1. 系统内预置一个“专业名词黑名单库向量空间（Jargon Space）”。
  2. 获取用户输入的 Embedding 向量 $V_{input}$。
  3. 计算投影并求残差：$V_{core} = V_{input} - Projection(V_{input}, V_{jargon})$。
- **输出**：一个纯粹描述“动作与关系”的绝对物理意义向量 $V_{core}$。

### 模块 2：硬逻辑分类器（点积绝对匹配）
- **实现原理**：余弦相似度极值搜寻。
- **机制**：
  1. 预置 20 个宇宙基础积木（正交基底向量），例如：能量守恒、阈值累积、动态平衡等。
  2. 用去名词化后的 $V_{core}$ 分别与这 20 个基底求余弦相似度。
  3. 选取余弦相似度得分最高的一个作为最终锁死的硬逻辑类别。

### 模块 3：同构联想库（零幻觉秒级检索）
- **实现原理**：传统关系型数据库（SQLite）精确查询。
- **机制**：
  1. 预置一个 SQLite 数据库，建立结构极简的表结构：`[硬逻辑ID] | [所属学科] | [日常现象] | [降维打法]`。
  2. 拿到模块 2 算出的最强匹配 `logic_id`，执行简单的 SQL 语句：`SELECT * FROM Isomorphisms WHERE logic_id = ?`。
  3. 以绝对确定的方式返回各学科同构示例。

## 3. 插件调用接口与参数设计 (plugin-manifest.json)
```json
{
  "name": "OriginLensEngine",
  "displayName": "原点透镜引擎",
  "pluginType": "synchronous",
  "entryPoint": {
    "type": "python",
    "command": "python engine_core.py"
  },
  "communication": {
    "protocol": "stdio"
  },
  "configSchema": {
    "EMBEDDING_API_KEY": { "type": "string" },
    "EMBEDDING_API_URL": { "type": "string" }
  },
  "capabilities": {
    "invocationCommands": [
      {
        "commandIdentifier": "AnalyzeLogic",
        "description": "进行降维打击逻辑分析。参数: text (需要去名词化并暴露底层物理硬逻辑的输入描述)"
      }
    ]
  }
}
```

## 4. 技术栈与依赖库
- **语言**：Python
- **核心依赖**：
  - `numpy`：进行高效的向量点积、余弦相似度计算、正交投影。
  - `sqlite3`：Python 内置，无需额外安装，用于同构联想库查询。
  - `requests`：用于调用远端 Embedding API。
- **数据结构**：在插件目录下放一个预置的 `origin_database.sqlite` 以及一个保存 numpy 数组的 `base_vectors.npz`。

## 5. 开发路线图
- [ ] **阶段一：向量计算与基底设计**：定义 20 个硬逻辑的文字描述并向量化预存；定义数千专业名词的向量池预计算。
- [ ] **阶段二：编写极简 SQLite 库**：在本地填充部分同构案例，构建 `get_isomorphisms(logic_id)` 函数。
- [ ] **阶段三：Python 引擎组装**：基于 `engine_core.py`，将 API 调用、`numpy` 计算和 SQL 组合，搭建标准化 `stdin` 和 `stdout` 接口。
- [ ] **阶段四：混合模式准备(后期)**：增加异步 command 处理脚本（如 `UpdateIsomorphisms`），使用 VCP 异步插件两阶段提交规范。