"""
NoveltyAnalyzer - 新颖度分析器
评估内容与历史记录的差异程度
"""

import hashlib


class NoveltyAnalyzer:
    """新颖度分析器类"""
    
    @staticmethod
    def analyze(content, history_db):
        """分析新颖度"""
        if not content:
            return 0.5  # 默认中等新颖度
        
        conversations = history_db.get('conversations', [])
        
        if not conversations:
            return 0.8  # 没有历史记录，认为是高新颖度
        
        # 计算与历史内容的相似度
        content_hash = hash(content)
        historical_hashes = [c.get('content_hash', 0) for c in conversations]
        
        # 简单实现：基于哈希值的差异
        similarities = []
        for hist_hash in historical_hashes[-10:]:  # 只比较最近10条
            # 使用哈希值的差异作为相似度的反向指标
            diff = abs(content_hash - hist_hash)
            # 归一化到0-1范围
            similarity = 1.0 / (1.0 + diff / 1e10)
            similarities.append(similarity)
        
        if not similarities:
            return 0.8
        
        # 新颖度 = 1 - 最大相似度
        max_similarity = max(similarities)
        novelty = 1.0 - max_similarity
        
        # 确保在合理范围内
        novelty = max(0.1, min(0.95, novelty))
        
        return round(novelty, 2)