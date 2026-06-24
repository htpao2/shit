#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
原点透镜引擎 - 数据库初始化脚本
创建 SQLite 数据库，填充 20 个宇宙基础积木和同构联想案例库。
运行方式: python init_database.py
"""

import sqlite3
import os
import json

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "origin_database.sqlite")

# ============================================================
# 20 个宇宙基础积木（正交基底）定义
# ============================================================
BASE_AXES = [
    {"id": 1, "name": "能量守恒 / 零和博弈", "description": "系统总量恒定，一方的增加必然伴随另一方的减少。没有凭空产生，也没有凭空消失。", "keywords": "守恒,零和,总量不变,此消彼长,能量转化,质量守恒,等价交换"},
    {"id": 2, "name": "阈值累积 / 涌现", "description": "量变引起质变。微小的输入持续累积，当超过某个临界阈值时，系统状态发生突变式跃迁。", "keywords": "阈值,临界点,量变质变,涌现,相变,突变,累积,爆发,临界质量"},
    {"id": 3, "name": "负反馈 / 动态平衡", "description": "系统通过感知偏差并反向修正来维持稳态。偏离越大，修正力越强，使系统围绕目标值振荡。", "keywords": "负反馈,平衡,稳态,恒温,调节,修正,PID,自稳定,缓冲"},
    {"id": 4, "name": "信息降维 / 投影", "description": "高维信息被压缩到低维空间时，必然丢失部分信息，但保留了最核心的结构特征。", "keywords": "降维,投影,压缩,抽象,简化,PCA,特征提取,信息损失,本质"},
    {"id": 5, "name": "信号叠加 / 干涉", "description": "多个信号在同一空间叠加时，可以相互增强（建设性干涉）或相互抵消（破坏性干涉）。", "keywords": "叠加,干涉,共振,合力,波的叠加,增强,抵消,协同,冲突"},
    {"id": 6, "name": "正反馈 / 马太效应", "description": "系统的输出被放大后重新输入，导致偏差不断加剧。强者愈强，弱者愈弱，直到系统崩溃或饱和。", "keywords": "正反馈,马太效应,滚雪球,指数增长,失控,放大,自激,赢家通吃"},
    {"id": 7, "name": "熵增 / 无序化", "description": "封闭系统自发趋向无序。维持秩序需要持续输入能量，否则一切结构终将瓦解。", "keywords": "熵增,混乱,无序,衰退,老化,腐败,热寂,退化,耗散"},
    {"id": 8, "name": "梯度驱动 / 势差流动", "description": "物质、能量、信息总是从高浓度/高势能区域流向低浓度/低势能区域，直到梯度消失。", "keywords": "梯度,势差,流动,扩散,渗透,电位差,压力差,浓度差,落差"},
    {"id": 9, "name": "共振 / 频率匹配", "description": "当外部驱动频率与系统固有频率一致时，能量传递效率最大化，振幅急剧放大。", "keywords": "共振,频率,匹配,同频,谐振,调谐,共鸣,节奏同步"},
    {"id": 10, "name": "分形 / 自相似", "description": "系统在不同尺度上呈现相同的结构模式。局部与整体具有相似性，小中见大。", "keywords": "分形,自相似,递归,嵌套,尺度不变,全息,局部反映整体,模式重复"},
    {"id": 11, "name": "路径依赖 / 锁定效应", "description": "早期的选择会约束后续的发展方向。初始条件的微小差异可能导致完全不同的最终状态。", "keywords": "路径依赖,锁定,惯性,沉没成本,历史包袱,QWERTY,先发优势,不可逆"},
    {"id": 12, "name": "冗余 / 容错", "description": "系统通过保留多余的备份组件来抵抗局部故障。冗余是可靠性的代价。", "keywords": "冗余,备份,容错,鲁棒,冗余设计,安全边际,保险,多重保障"},
    {"id": 13, "name": "瓶颈 / 短板效应", "description": "系统的整体性能由最薄弱的环节决定。优化非瓶颈部分对整体无益。", "keywords": "瓶颈,短板,木桶效应,限制因素,卡脖子,约束,最弱环节,TOC"},
    {"id": 14, "name": "相变 / 对称性破缺", "description": "系统在特定条件下从一种有序态跃迁到另一种有序态，伴随着对称性的打破和新结构的涌现。", "keywords": "相变,对称性破缺,结晶,凝聚,分化,突变,范式转换,革命"},
    {"id": 15, "name": "博弈 / 纳什均衡", "description": "多个理性主体在互动中各自追求最优策略，最终达到一个谁都不愿单方面改变的稳定状态。", "keywords": "博弈,纳什均衡,囚徒困境,策略,竞争,合作,最优响应,均衡"},
    {"id": 16, "name": "信息不对称 / 筛选信号", "description": "交易双方掌握的信息不对等，信息优势方可以利用这种差距获利。信号传递是克服不对称的手段。", "keywords": "信息不对称,逆向选择,道德风险,信号,筛选,柠檬市场,认证,品牌"},
    {"id": 17, "name": "网络效应 / 梅特卡夫定律", "description": "网络的价值随节点数量的增加而指数级增长。用户越多，每个用户获得的价值越大。", "keywords": "网络效应,梅特卡夫,平台,生态,连接,节点,规模效应,飞轮"},
    {"id": 18, "name": "递归 / 自指", "description": "系统的输出被重新作为输入，形成自我引用的循环结构。可以产生无限复杂性。", "keywords": "递归,自指,循环,嵌套,自我引用,哥德尔,反身性,元认知"},
    {"id": 19, "name": "涨落 / 随机扰动", "description": "系统在稳态附近存在随机的微小波动。在远离平衡态时，涨落可以被放大为宏观有序结构。", "keywords": "涨落,随机,噪声,扰动,布朗运动,波动,不确定性,概率"},
    {"id": 20, "name": "解耦 / 模块化", "description": "将复杂系统分解为独立的、低耦合的模块。每个模块可以独立演化，降低系统整体复杂度。", "keywords": "解耦,模块化,分治,封装,接口,独立,组件化,微服务,分层"}
]

def create_database():
    """创建数据库表结构"""
    if os.path.exists(DB_PATH):
        print(f"⚠️  数据库已存在: {DB_PATH}")
        response = input("是否要删除并重建? (y/N): ")
        if response.lower() != 'y':
            print("取消操作。")
            return
        os.remove(DB_PATH)
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # 创建基础积木表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS base_axes (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            description TEXT NOT NULL,
            keywords TEXT NOT NULL
        )
    ''')
    
    # 创建同构联想案例表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS isomorphisms (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            logic_id INTEGER NOT NULL,
            discipline TEXT NOT NULL,
            phenomenon TEXT NOT NULL,
            solution TEXT NOT NULL,
            FOREIGN KEY (logic_id) REFERENCES base_axes(id)
        )
    ''')
    
    # 插入20个基础积木
    for axis in BASE_AXES:
        cursor.execute(
            'INSERT INTO base_axes (id, name, description, keywords) VALUES (?, ?, ?, ?)',
            (axis['id'], axis['name'], axis['description'], axis['keywords'])
        )
    
    # 插入同构案例（从外部文件加载）
    isomorphisms_data = load_isomorphisms_data()
    for item in isomorphisms_data:
        cursor.execute(
            'INSERT INTO isomorphisms (logic_id, discipline, phenomenon, solution) VALUES (?, ?, ?, ?)',
            (item['logic_id'], item['discipline'], item['phenomenon'], item['solution'])
        )
    
    conn.commit()
    conn.close()
    print(f"✅ 数据库创建成功: {DB_PATH}")
    print(f"   - 基础积木: {len(BASE_AXES)} 条")
    print(f"   - 同构案例: {len(isomorphisms_data)} 条")

def load_isomorphisms_data():
    """加载同构案例数据（从 isomorphisms_data.py 导入）"""
    try:
        from isomorphisms_data import ISOMORPHISMS
        return ISOMORPHISMS
    except ImportError:
        print("⚠️  未找到 isomorphisms_data.py，使用最小示例数据")
        return [
            {"logic_id": 2, "discipline": "神经科学", "phenomenon": "神经元LIF模型：膜电位持续累积，超过阈值后才会放电（全或无定律）。", "solution": "不要分散力量，必须把分力聚合到同一点突破。集中资源攻击单一目标直到超过临界点。"},
            {"logic_id": 2, "discipline": "日常生活", "phenomenon": "骆驼祥子的最后一根稻草：压力持续累积，最终一个微小事件引发崩溃。", "solution": "关注累积量而非单次事件。定期释放压力，避免逼近阈值。"}
        ]

if __name__ == "__main__":
    create_database()
