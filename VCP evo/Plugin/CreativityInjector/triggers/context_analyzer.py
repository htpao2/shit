"""
ContextAnalyzer - 上下文分析器
分析消息内容，提取关键信息用于触发器生成
"""

import re


class ContextAnalyzer:
    """上下文分析器类"""
    
    @staticmethod
    def analyze(content):
        """分析消息内容"""
        context = {
            'keywords': ContextAnalyzer._extract_keywords(content),
            'question_type': ContextAnalyzer._detect_question_type(content),
            'domain_hints': ContextAnalyzer._detect_domain(content),
            'length': len(content)
        }
        return context
    
    @staticmethod
    def _extract_keywords(content):
        """提取关键词（简单实现）"""
        # 移除标点和停用词后的词汇
        words = re.findall(r'\w+', content.lower())
        # 过滤掉常见停用词
        stopwords = {'的', '是', '在', '有', '和', '了', '吗', '呢', '啊', '吧'}
        keywords = [w for w in words if w not in stopwords and len(w) > 1]
        return keywords[:10]  # 返回前10个关键词
    
    @staticmethod
    def _detect_question_type(content):
        """检测问题类型"""
        if '如何' in content or 'how' in content.lower():
            return 'how_to'
        elif '为什么' in content or 'why' in content.lower():
            return 'why'
        elif '是什么' in content or 'what' in content.lower():
            return 'what'
        else:
            return 'general'
    
    @staticmethod
    def _detect_domain(content):
        """检测可能的领域（简单启发式）"""
        domains = []
        
        domain_keywords = {
            '技术': ['技术', '代码', '编程', '算法', '系统', '软件'],
            '商业': ['商业', '市场', '销售', '客户', '产品', '策略'],
            '创意': ['创意', '设计', '艺术', '美学', '创新', '想法'],
            '科学': ['科学', '研究', '实验', '理论', '数据', '分析']
        }
        
        content_lower = content.lower()
        for domain, keywords in domain_keywords.items():
            if any(kw in content_lower for kw in keywords):
                domains.append(domain)
        
        return domains if domains else ['通用']