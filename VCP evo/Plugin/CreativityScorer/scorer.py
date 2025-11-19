#!/usr/bin/env python3
"""
CreativityScorer - 创造力评分器
定期评估AI生成内容的创新度
"""

import sys
import json
import os
from pathlib import Path
from datetime import datetime

# 导入分析器
sys.path.insert(0, str(Path(__file__).parent))
from analyzers.novelty import NoveltyAnalyzer
from analyzers.cross_domain import CrossDomainAnalyzer
from analyzers.feasibility import FeasibilityAnalyzer

# 配置加载
CONFIG = {
    'novelty_weight': float(os.getenv('NOVELTY_WEIGHT', '0.4')),
    'cross_domain_weight': float(os.getenv('CROSS_DOMAIN_WEIGHT', '0.35')),
    'feasibility_weight': float(os.getenv('FEASIBILITY_WEIGHT', '0.25')),
    'history_db_path': os.getenv('HISTORY_DB_PATH', './data/creativity_history.json')
}


def main():
    """主处理函数"""
    try:
        # 1. 读取 stdin（可能包含要评分的内容）
        input_data = sys.stdin.read().strip()
        
        if input_data:
            request = json.loads(input_data)
            content_to_score = request.get('content', '')
        else:
            # 如果没有输入，评估最近的对话内容（从历史库读取）
            content_to_score = load_recent_content()
        
        if not content_to_score:
            raise ValueError("没有可评估的内容")
        
        # 2. 加载历史记忆库
        history_db = load_history_db()
        
        # 3. 执行三维评估
        novelty_score = NoveltyAnalyzer.analyze(content_to_score, history_db)
        cross_domain_score = CrossDomainAnalyzer.analyze(content_to_score)
        feasibility_score = FeasibilityAnalyzer.analyze(content_to_score)
        
        # 4. 计算综合创造力指数
        creativity_index = calculate_creativity_index(
            novelty_score,
            cross_domain_score,
            feasibility_score
        )
        
        # 5. 生成评估报告
        report = generate_report(
            novelty_score,
            cross_domain_score,
            feasibility_score,
            creativity_index,
            history_db
        )
        
        # 6. 更新历史记忆库
        update_history_db(
            content_to_score,
            novelty_score,
            cross_domain_score,
            feasibility_score,
            creativity_index
        )
        
        # 7. 返回结果（包含占位符）
        output = {
            "status": "success",
            "result": f"{{{{CreativityMetrics}}}}\n\n{report}"
        }
        
        print(json.dumps(output, ensure_ascii=False))
        sys.exit(0)
        
    except Exception as e:
        error_output = {
            "status": "error",
            "error": str(e)
        }
        print(json.dumps(error_output, ensure_ascii=False))
        sys.exit(1)


def load_history_db():
    """加载历史记忆库"""
    try:
        with open(CONFIG['history_db_path'], 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        # 如果文件不存在，创建默认结构
        return {
            "conversations": [],
            "statistics": {
                "total_analyzed": 0,
                "average_novelty": 0,
                "average_cross_domain": 0,
                "average_feasibility": 0,
                "trend": "stable"
            }
        }


def load_recent_content():
    """从历史库加载最近的内容"""
    history_db = load_history_db()
    conversations = history_db.get('conversations', [])
    
    if conversations:
        # 返回最近一条对话的内容
        return conversations[-1].get('content_hash', '')
    return ""


def calculate_creativity_index(novelty, cross_domain, feasibility):
    """计算综合创造力指数"""
    index = (
        novelty * CONFIG['novelty_weight'] +
        cross_domain * CONFIG['cross_domain_weight'] +
        feasibility * CONFIG['feasibility_weight']
    )
    return round(index, 2)


def generate_report(novelty, cross_domain, feasibility, index, history_db):
    """生成评估报告"""
    # 星级表示
    def score_to_stars(score):
        stars = int(score * 5)
        return '★' * stars + '☆' * (5 - stars)
    
    # 等级判定
    def index_level(idx):
        if idx < 0.4:
            return "较低"
        elif idx < 0.6:
            return "中等"
        elif idx < 0.8:
            return "高"
        else:
            return "非常高"
    
    # 趋势分析
    stats = history_db.get('statistics', {})
    trend = stats.get('trend', 'stable')
    trend_icon = {
        'increasing': '📈 持续上升',
        'decreasing': '📉 有所下降',
        'stable': '➡️ 保持稳定'
    }.get(trend, '➡️ 保持稳定')
    
    # 构建报告
    report = f"""当前创造力指标：
━━━━━━━━━━━━━━━━━━
📊 新颖度：{score_to_stars(novelty)} ({novelty:.2f})
🔀 跨域性：{score_to_stars(cross_domain)} ({cross_domain:.2f})
✅ 可行性：{score_to_stars(feasibility)} ({feasibility:.2f})
━━━━━━━━━━━━━━━━━━
综合创造力指数：{index} ({index_level(index)})

近期趋势：{trend_icon}
已评估对话数：{stats.get('total_analyzed', 0)}

建议：{generate_suggestions(novelty, cross_domain, feasibility)}"""
    
    return report


def generate_suggestions(novelty, cross_domain, feasibility):
    """生成改进建议"""
    suggestions = []
    
    if novelty < 0.5:
        suggestions.append("尝试探索更多未涉及的概念和视角")
    if cross_domain < 0.5:
        suggestions.append("增加跨领域知识的融合")
    if feasibility < 0.5:
        suggestions.append("在保持创新性的同时关注实用性")
    
    if novelty > 0.8 and feasibility < 0.4:
        suggestions.append("当前创新度很高，但可考虑增强可行性")
    
    if not suggestions:
        suggestions.append("保持当前的创造力水平，继续探索新领域")
    
    return "；".join(suggestions)


def update_history_db(content, novelty, cross_domain, feasibility, index):
    """更新历史记忆库"""
    history_db = load_history_db()
    
    # 添加新记录
    new_entry = {
        "id": f"conv_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
        "timestamp": datetime.now().isoformat(),
        "content_hash": hash(content),
        "creativity_scores": {
            "novelty": round(novelty, 2),
            "cross_domain": round(cross_domain, 2),
            "feasibility": round(feasibility, 2),
            "overall": index
        }
    }
    
    history_db['conversations'].append(new_entry)
    
    # 更新统计信息
    update_statistics(history_db)
    
    # 保存回文件
    try:
        with open(CONFIG['history_db_path'], 'w', encoding='utf-8') as f:
            json.dump(history_db, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"警告：保存历史记忆库失败 - {e}", file=sys.stderr)


def update_statistics(history_db):
    """更新统计信息"""
    conversations = history_db['conversations']
    total = len(conversations)
    
    if total == 0:
        return
    
    # 计算平均值
    avg_novelty = sum(c['creativity_scores']['novelty'] for c in conversations) / total
    avg_cross_domain = sum(c['creativity_scores']['cross_domain'] for c in conversations) / total
    avg_feasibility = sum(c['creativity_scores']['feasibility'] for c in conversations) / total
    
    # 趋势分析（比较最近10条和之前的）
    if total > 20:
        recent_avg = sum(c['creativity_scores']['overall'] for c in conversations[-10:]) / 10
        older_avg = sum(c['creativity_scores']['overall'] for c in conversations[-20:-10]) / 10
        
        if recent_avg > older_avg + 0.05:
            trend = 'increasing'
        elif recent_avg < older_avg - 0.05:
            trend = 'decreasing'
        else:
            trend = 'stable'
    else:
        trend = 'stable'
    
    history_db['statistics'] = {
        "total_analyzed": total,
        "average_novelty": round(avg_novelty, 2),
        "average_cross_domain": round(avg_cross_domain, 2),
        "average_feasibility": round(avg_feasibility, 2),
        "trend": trend
    }


if __name__ == "__main__":
    main()