#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
原点透镜引擎 (Origin-00 Engine) - 核心执行脚本
通过纯数学向量计算实现零幻觉的降维打击逻辑分析。
"""

import sys
import json
import os
import sqlite3
import numpy as np
import requests
from typing import Dict, List, Tuple, Any

# ============================================================
# 配置加载
# ============================================================
EMBEDDING_API_KEY = os.getenv('EMBEDDING_API_KEY', '')
EMBEDDING_API_URL = os.getenv('EMBEDDING_API_URL', 'https://api.openai.com/v1/embeddings')
EMBEDDING_MODEL = os.getenv('EMBEDDING_MODEL', 'text-embedding-3-small')
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "origin_database.sqlite")
VECTORS_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "base_vectors.npz")

# ============================================================
# 模块 1: Embedding API 调用
# ============================================================
def get_embedding(text: str) -> np.ndarray:
    """
    调用远程 Embedding API 将文本转换为向量
    """
    if not EMBEDDING_API_KEY:
        raise ValueError("未设置 EMBEDDING_API_KEY 环境变量")
    
    headers = {
        "Authorization": f"Bearer {EMBEDDING_API_KEY}",
        "Content-Type": "application/json"
    }
    
    data = {
        "model": EMBEDDING_MODEL,
        "input": text
    }
    
    try:
        response = requests.post(EMBEDDING_API_URL, headers=headers, json=data, timeout=30)
        response.raise_for_status()
        result = response.json()
        embedding = result['data'][0]['embedding']
        return np.array(embedding, dtype=np.float32)
    except Exception as e:
        raise RuntimeError(f"Embedding API 调用失败: {str(e)}")

# ============================================================
# 模块 2: 向量计算工具
# ============================================================
def cosine_similarity(v1: np.ndarray, v2: np.ndarray) -> float:
    """
    计算两个向量的余弦相似度
    """
    dot_product = np.dot(v1, v2)
    norm_v1 = np.linalg.norm(v1)
    norm_v2 = np.linalg.norm(v2)
    
    if norm_v1 == 0 or norm_v2 == 0:
        return 0.0
    
    return float(dot_product / (norm_v1 * norm_v2))

def remove_jargon_projection(input_vector: np.ndarray, jargon_space: np.ndarray) -> np.ndarray:
    """
    模块 1: 去名词化器
    通过正交投影去除专业名词空间，保留纯粹的动作和关系向量
    
    Args:
        input_vector: 用户输入的文本向量 (n,)
        jargon_space: 专业名词空间矩阵 (m, n)，每行是一个专业名词向量
    
    Returns:
        core_vector: 去除专业噪音后的核心向量
    """
    # 计算输入向量在每个专业名词方向上的投影
    projections = []
    for jargon_vec in jargon_space:
        # 单位化专业名词向量
        jargon_norm = jargon_vec / (np.linalg.norm(jargon_vec) + 1e-10)
        # 计算投影分量
        projection_scalar = np.dot(input_vector, jargon_norm)
        projection = projection_scalar * jargon_norm
        projections.append(projection)
    
    # 求所有投影的总和
    total_projection = np.sum(projections, axis=0)
    
    # 残差 = 输入 - 投影（即正交于专业名词空间的部分）
    core_vector = input_vector - total_projection
    
    return core_vector

def find_matching_logic(core_vector: np.ndarray, base_axes_vectors: Dict[int, np.ndarray]) -> Tuple[int, float, str]:
    """
    模块 2: 硬逻辑分类器
    通过余弦相似度找到最匹配的宇宙基础积木
    
    Args:
        core_vector: 去名词化后的核心向量
        base_axes_vectors: 20个基础积木的向量字典 {logic_id: vector, ...}
    
    Returns:
        (logic_id, similarity_score, logic_name)
    """
    max_score = -1.0
    best_logic_id = None
    best_logic_name = ""
    
    for logic_id, axis_vector in base_axes_vectors.items():
        score = cosine_similarity(core_vector, axis_vector)
        if score > max_score:
            max_score = score
            best_logic_id = logic_id
    
    # 从数据库获取逻辑名称
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM base_axes WHERE id = ?", (best_logic_id,))
    result = cursor.fetchone()
    conn.close()
    
    if result:
        best_logic_name = result[0]
    
    return best_logic_id, max_score, best_logic_name

# ============================================================
# 模块 3: 同构联想库查询
# ============================================================
def get_isomorphisms(logic_id: int) -> List[Dict[str, str]]:
    """
    模块 3: 从 SQLite 数据库中查询指定硬逻辑的同构案例
    
    Returns:
        [{"discipline": "...", "phenomenon": "...", "solution": "..."}, ...]
    """
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT discipline, phenomenon, solution 
        FROM isomorphisms 
        WHERE logic_id = ?
        ORDER BY id
    """, (logic_id,))
    
    results = cursor.fetchall()
    conn.close()
    
    isomorphisms = []
    for row in results:
        isomorphisms.append({
            "discipline": row[0],
            "phenomenon": row[1],
            "solution": row[2]
        })
    
    return isomorphisms

def get_logic_description(logic_id: int) -> str:
    """获取硬逻辑的详细描述"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT description FROM base_axes WHERE id = ?", (logic_id,))
    result = cursor.fetchone()
    conn.close()
    return result[0] if result else ""

# ============================================================
# 向量库管理
# ============================================================
def load_or_initialize_vectors():
    """
    加载或初始化向量库
    如果 base_vectors.npz 不存在，则自动生成并保存
    """
    if os.path.exists(VECTORS_PATH):
        data = np.load(VECTORS_PATH)
        jargon_space = data['jargon_space']
        base_axes_vectors = {int(key.split('_')[1]): data[key] for key in data.files if key.startswith('axis_')}
        return jargon_space, base_axes_vectors
    else:
        # 首次运行时自动生成向量库
        return initialize_vectors()

def initialize_vectors():
    """
    初始化向量库：为20个基础积木和专业名词生成向量并保存
    """
    print("⏳ 首次运行，正在初始化向量库...", file=sys.stderr)
    
    # 1. 生成20个基础积木的向量
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, description, keywords FROM base_axes ORDER BY id")
    axes_data = cursor.fetchall()
    conn.close()
    
    base_axes_vectors = {}
    for axis_id, name, description, keywords in axes_data:
        # 将名称、描述和关键词组合作为向量化输入
        combined_text = f"{name}。{description} 关键词：{keywords}"
        vector = get_embedding(combined_text)
        base_axes_vectors[axis_id] = vector
        print(f"   ✓ Axis {axis_id:02d}: {name}", file=sys.stderr)
    
    # 2. 生成专业名词向量空间（示例：少量高频专业术语）
    jargon_terms = [
        "薛定谔方程", "卡拉比丘流形", "纳什均衡", "傅里叶变换", "拉普拉斯算子",
        "黎曼几何", "哥德尔不完备定理", "图灵机", "量子纠缠", "相对论",
        "宏观经济学", "微观经济学", "博弈论", "信息论", "控制论",
        "神经网络", "深度学习", "机器学习", "人工智能", "自然语言处理"
    ]
    
    jargon_vectors = []
    for term in jargon_terms:
        vector = get_embedding(term)
        jargon_vectors.append(vector)
    
    jargon_space = np.array(jargon_vectors, dtype=np.float32)
    
    # 3. 保存到文件
    save_dict = {'jargon_space': jargon_space}
    for axis_id, vector in base_axes_vectors.items():
        save_dict[f'axis_{axis_id}'] = vector
    
    np.savez_compressed(VECTORS_PATH, **save_dict)
    print(f"✅ 向量库初始化完成，已保存到: {VECTORS_PATH}", file=sys.stderr)
    
    return jargon_space, base_axes_vectors

# ============================================================
# 主引擎函数
# ============================================================
def origin_lens_engine(user_input_text: str) -> Dict[str, Any]:
    """
    原点透镜引擎主函数
    执行完整的降维打击工作流
    """
    # 0. 加载向量库
    jargon_space, base_axes_vectors = load_or_initialize_vectors()
    
    # 1. 将用户输入向量化
    input_vector = get_embedding(user_input_text)
    
    # 2. 模块1: 去名词化（正交投影过滤）
    core_vector = remove_jargon_projection(input_vector, jargon_space)
    
    # 3. 模块2: 硬逻辑匹配（余弦相似度）
    logic_id, similarity_score, logic_name = find_matching_logic(core_vector, base_axes_vectors)
    
    # 4. 模块3: 同构联想查询（SQL）
    isomorphisms = get_isomorphisms(logic_id)
    logic_description = get_logic_description(logic_id)
    
    # 5. 构建返回结果
    return {
        "detected_logic": {
            "id": logic_id,
            "name": logic_name,
            "description": logic_description,
            "similarity_score": round(similarity_score, 4)
        },
        "cross_disciplinary_examples": isomorphisms,
        "meta": {
            "input_text": user_input_text[:100] + "..." if len(user_input_text) > 100 else user_input_text
        }
    }

# ============================================================
# VCP 插件标准接口
# ============================================================
def main():
    """
    VCP 同步插件标准入口
    从 stdin 读取 JSON 参数，执行引擎，向 stdout 输出结果
    """
    try:
        # 1. 读取 stdin
        input_line = sys.stdin.readline().strip()
        if not input_line:
            raise ValueError("未接收到输入数据")
        
        # 2. 解析 JSON 参数
        args = json.loads(input_line)
        text = args.get('text')
        
        if not text:
            raise ValueError("缺少必需参数: text")
        
        # 3. 执行引擎
        result = origin_lens_engine(text)
        
        # 4. 格式化输出文本
        output_text = format_result_as_text(result)
        
        # 5. 构建 VCP 响应
        response = {
            "status": "success",
            "result": output_text
        }
        
        # 6. 打印到 stdout
        print(json.dumps(response, ensure_ascii=False), file=sys.stdout)
        sys.exit(0)
        
    except Exception as e:
        # 错误处理
        error_response = {
            "status": "error",
            "error": f"原点透镜引擎执行失败: {str(e)}"
        }
        print(json.dumps(error_response, ensure_ascii=False), file=sys.stdout)
        sys.exit(1)

def format_result_as_text(result: Dict[str, Any]) -> str:
    """
    将结构化结果格式化为人类可读的文本
    """
    logic = result['detected_logic']
    examples = result['cross_disciplinary_examples']
    
    output = f"""### 🔍 原点透镜引擎分析结果

**识别出的底层硬逻辑：{logic['name']}**
置信度：{logic['similarity_score']:.2%}

**核心定义：**
{logic['description']}

---

### 📚 跨学科同构案例

"""
    
    if examples:
        for i, example in enumerate(examples, 1):
            output += f"""**{i}. {example['discipline']}**
现象：{example['phenomenon']}
降维打法：{example['solution']}

"""
    else:
        output += "暂无同构案例数据。请运行 `python init_database.py` 初始化数据库。\n"
    
    output += """---
💡 **使用提示**：以上同构案例来自不同学科，但本质上遵循相同的物理规律。理解这个硬逻辑，可以帮助你在任何领域应用同样的解决思路。
"""
    
    return output

# ============================================================
# 入口点
# ============================================================
if __name__ == "__main__":
    main()
