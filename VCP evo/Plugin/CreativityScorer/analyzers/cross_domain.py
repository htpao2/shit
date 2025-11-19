"""
CrossDomainAnalyzer - 跨域性分析器
评估内容涉及的知识领域广度和深度
"""


class CrossDomainAnalyzer:
    """跨域性分析器类"""
    
    # 定义知识领域关键词
    DOMAIN_KEYWORDS = {
        '科学技术': ['科学', '技术', '算法', '系统', '数据', '编程', '计算', '工程'],
        '艺术人文': ['艺术', '设计', '美学', '文化', '哲学', '历史', '文学', '音乐'],
        '商业管理': ['商业', '管理', '市场', '营销', '战略', '运营', '财务', '品牌'],
        '自然科学': ['物理', '化学', '生物', '地理', '天文', '生态', '环境', '气候'],
        '社会科学': ['社会', '心理', '经济', '政治', '法律', '教育', '传播', '人类学'],
        '医疗健康': ['医疗', '健康', '疾病', '治疗', '药物', '营养', '运动', '心理健康']
    }
    
    @staticmethod
    def analyze(content):
        """分析跨域性"""
        if not content:
            return 0.3  # 默认低跨域性
        
        content_lower = content.lower()
        
        # 1. 识别涉及的领域
        involved_domains = []
        for domain, keywords in CrossDomainAnalyzer.DOMAIN_KEYWORDS.items():
            if any(keyword in content_lower for keyword in keywords):
                involved_domains.append(domain)
        
        # 2. 计算领域广度分数
        domain_count = len(involved_domains)
        max_domains = len(CrossDomainAnalyzer.DOMAIN_KEYWORDS)
        breadth_score = domain_count / max_domains
        
        # 3. 评估领域融合深度（简单实现：基于领域数量）
        if domain_count <= 1:
            depth_score = 0.2
        elif domain_count == 2:
            depth_score = 0.5
        elif domain_count == 3:
            depth_score = 0.7
        else:
            depth_score = 0.9
        
        # 4. 综合评分
        cross_domain_score = (breadth_score * 0.6) + (depth_score * 0.4)
        
        # 确保在合理范围内
        cross_domain_score = max(0.1, min(0.95, cross_domain_score))
        
        return round(cross_domain_score, 2)