"""
FeasibilityAnalyzer - 可行性分析器
评估想法的实际可行性
"""


class FeasibilityAnalyzer:
    """可行性分析器类"""
    
    # 定义不可行的信号词
    INFEASIBLE_SIGNALS = [
        '违反', '不可能', '永动机', '超光速', '时间旅行', '反物理',
        '无限', '永恒', '绝对', '完美', '零成本', '瞬间'
    ]
    
    # 定义高可行性信号词
    FEASIBLE_SIGNALS = [
        '已实现', '可行', '实用', '简单', '现有', '成熟',
        '经过验证', '已应用', '标准', '常见'
    ]
    
    @staticmethod
    def analyze(content):
        """分析可行性"""
        if not content:
            return 0.5  # 默认中等可行性
        
        content_lower = content.lower()
        
        # 1. 检查不可行信号
        infeasible_count = sum(
            1 for signal in FeasibilityAnalyzer.INFEASIBLE_SIGNALS
            if signal in content_lower
        )
        
        # 2. 检查高可行性信号
        feasible_count = sum(
            1 for signal in FeasibilityAnalyzer.FEASIBLE_SIGNALS
            if signal in content_lower
        )
        
        # 3. 计算基础可行性分数
        base_score = 0.6  # 默认中等偏上
        
        # 不可行信号降低分数
        base_score -= infeasible_count * 0.15
        
        # 高可行性信号提升分数
        base_score += feasible_count * 0.1
        
        # 4. 内容长度调整（过短或过长可能不够实际）
        length = len(content)
        if length < 50:
            base_score -= 0.1
        elif length > 2000:
            base_score -= 0.05
        
        # 确保在合理范围内
        feasibility_score = max(0.1, min(0.95, base_score))
        
        return round(feasibility_score, 2)