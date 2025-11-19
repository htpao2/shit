"""
TriggerGenerator - 触发器生成器
根据上下文和概念库生成创造性思维触发器
"""

import random


class TriggerGenerator:
    """触发器生成器类"""
    
    def __init__(self, randomness_level, enabled_modes):
        self.randomness_level = randomness_level
        self.enabled_modes = enabled_modes
        self.intensity = self._calculate_intensity()
    
    def _calculate_intensity(self):
        """根据随机性水平计算强度等级"""
        if self.randomness_level < 0.3:
            return 'gentle'
        elif self.randomness_level < 0.7:
            return 'moderate'
        else:
            return 'aggressive'
    
    def generate(self, context, concept_pool):
        """生成触发器"""
        # 1. 从启用的模式中随机选择一个
        mode = random.choice(self.enabled_modes)
        
        # 2. 根据模式生成触发器
        if mode == 'metaphor':
            return self._generate_metaphor_trigger(context, concept_pool)
        elif mode == 'crossDomain':
            return self._generate_cross_domain_trigger(context, concept_pool)
        elif mode == 'combination':
            return self._generate_combination_trigger(context, concept_pool)
        elif mode == 'reversal':
            return self._generate_reversal_trigger(context)
        elif mode == 'constraint':
            return self._generate_constraint_trigger(context, concept_pool)
        else:
            return self._generate_default_trigger(context)
    
    def _generate_metaphor_trigger(self, context, concept_pool):
        """生成隐喻模式触发器"""
        metaphors = concept_pool.get('metaphors', ['系统', '网络'])
        metaphor = random.choice(metaphors)
        
        templates = {
            'gentle': f"可以考虑将这个问题想象成一个'{metaphor}'，从这个角度可能会有新的发现。",
            'moderate': f"尝试用'{metaphor}'的视角重新审视这个问题：它的各个部分如何相互作用？",
            'aggressive': f"完全颠覆传统思维！如果这个问题就是一个'{metaphor}'，那么我们该如何理解和解决它？"
        }
        
        return templates[self.intensity]
    
    def _generate_cross_domain_trigger(self, context, concept_pool):
        """生成跨域模式触发器"""
        domains = concept_pool.get('domains', [])
        
        if len(domains) >= 2:
            domain_a = random.choice(domains)['name']
            domain_b = random.choice([d for d in domains if d['name'] != domain_a])['name']
        else:
            domain_a, domain_b = "科学技术", "艺术人文"
        
        templates = {
            'gentle': f"或许可以从'{domain_a}'的角度来看待这个'{domain_b}'的问题。",
            'moderate': f"将'{domain_a}'的方法论应用到'{domain_b}'领域，会产生什么新想法？",
            'aggressive': f"打破领域壁垒！强制融合'{domain_a}'和'{domain_b}'，创造前所未见的解决方案！"
        }
        
        return templates[self.intensity]
    
    def _generate_combination_trigger(self, context, concept_pool):
        """生成组合模式触发器"""
        domains = concept_pool.get('domains', [])
        
        if domains:
            domain = random.choice(domains)
            concepts = domain.get('concepts', [])
            if len(concepts) >= 2:
                concept1 = random.choice(concepts)
                concept2 = random.choice([c for c in concepts if c != concept1])
            else:
                concept1, concept2 = "创新", "效率"
        else:
            concept1, concept2 = "创新", "效率"
        
        templates = {
            'gentle': f"试着结合'{concept1}'和'{concept2}'的特点来思考这个问题。",
            'moderate': f"如果我们将'{concept1}'的优势与'{concept2}'的特性融合，会得到什么？",
            'aggressive': f"强制碰撞！'{concept1}' × '{concept2}' = ？创造一个全新的概念框架！"
        }
        
        return templates[self.intensity]
    
    def _generate_reversal_trigger(self, context):
        """生成反转模式触发器"""
        templates = {
            'gentle': "可以尝试反向思考：如果我们追求相反的结果会怎样？",
            'moderate': "挑战假设：如果一切前提都是错的，我们会得出什么结论？",
            'aggressive': "彻底反转！假设所有'正确'的都是错误的，所有'不可能'的都是必然的！"
        }
        
        return templates[self.intensity]
    
    def _generate_constraint_trigger(self, context, concept_pool):
        """生成约束模式触发器"""
        constraints = [
            "只能用10个字",
            "不能使用技术手段",
            "预算为零",
            "必须在1小时内完成",
            "只能用自然界已存在的元素"
        ]
        constraint = random.choice(constraints)
        
        templates = {
            'gentle': f"试想：如果{constraint}来解决这个问题，会有什么创意？",
            'moderate': f"极端约束思维：假设你{constraint}，这会迫使你想出什么突破性方案？",
            'aggressive': f"绝对限制！你{constraint}，必须找到一个完全颠覆常规的答案！"
        }
        
        return templates[self.intensity]
    
    def _generate_default_trigger(self, context):
        """生成默认触发器"""
        return "跳出框架思考：这个问题的本质是什么？有没有被忽视的角度？"