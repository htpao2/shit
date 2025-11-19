#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
KnowledgeIndexer - VCP Knowledge Graph Builder
定期扫描记忆数据，构建知识图谱、规则库和模式库
"""

import sys
import json
import os
from pathlib import Path
from collections import Counter, defaultdict
from datetime import datetime
import re
import io

# 设置标准输入输出编码为UTF-8
sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding='utf-8')
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')


class KnowledgeIndexer:
    """知识索引器主类"""
    
    def __init__(self):
        """初始化配置"""
        self.memory_path = Path(os.getenv('MEMORY_DATA_PATH', './Memory'))
        self.index_output_path = Path(os.getenv('INDEX_OUTPUT_PATH', './KnowledgeIndex'))
        self.max_concepts = int(os.getenv('MAX_CONCEPTS', 1000))
        self.min_frequency = int(os.getenv('MIN_CONCEPT_FREQUENCY', 2))
        self.enable_nlp = os.getenv('ENABLE_NLP', 'true').lower() == 'true'
        
        # 确保输出目录存在
        self.index_output_path.mkdir(parents=True, exist_ok=True)
        
        # 数据存储
        self.concepts = Counter()  # 概念计数
        self.concept_docs = defaultdict(set)  # 概念出现的文档
        self.relationships = defaultdict(list)  # 概念关系
        self.rules = []  # 规则库
        self.patterns = []  # 模式库
        self.documents = []  # 文档列表
        
    def scan_memory(self):
        """扫描记忆目录"""
        if not self.memory_path.exists():
            return {
                'status': 'warning',
                'message': f'记忆目录不存在: {self.memory_path}',
                'document_count': 0
            }
        
        md_files = list(self.memory_path.rglob('*.md'))
        
        for md_file in md_files:
            try:
                self._process_document(md_file)
            except Exception as e:
                print(f"处理文件 {md_file} 时出错: {e}", file=sys.stderr)
        
        return {
            'status': 'success',
            'message': f'成功扫描 {len(md_files)} 个文档',
            'document_count': len(md_files)
        }
    
    def _process_document(self, file_path):
        """处理单个文档"""
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        doc_info = {
            'path': str(file_path.relative_to(self.memory_path)),
            'size': len(content),
            'modified': datetime.fromtimestamp(file_path.stat().st_mtime).isoformat()
        }
        self.documents.append(doc_info)
        
        # 提取概念
        concepts = self._extract_concepts(content)
        
        # 更新概念统计
        for concept in concepts:
            self.concepts[concept] += 1
            self.concept_docs[concept].add(doc_info['path'])
        
        # 提取关系
        self._extract_relationships(content, concepts)
        
        # 提取规则
        self._extract_rules(content)
        
        # 提取模式
        self._extract_patterns(content)
    
    def _extract_concepts(self, text):
        """提取概念（关键词）"""
        concepts = []
        
        if self.enable_nlp:
            # 使用NLP分词（如果可用）
            try:
                import jieba
                words = jieba.cut(text)
                # 过滤停用词和短词
                concepts = [w for w in words if len(w) >= 2 and not self._is_stopword(w)]
            except ImportError:
                # 如果jieba不可用，使用简单的正则提取
                concepts = self._simple_extract(text)
        else:
            concepts = self._simple_extract(text)
        
        # 提取Markdown标题作为重要概念
        headers = re.findall(r'^#+\s+(.+)$', text, re.MULTILINE)
        concepts.extend(headers)
        
        # 提取加粗文本
        bold_texts = re.findall(r'\*\*(.+?)\*\*', text)
        concepts.extend(bold_texts)
        
        return concepts
    
    def _simple_extract(self, text):
        """简单的概念提取（不依赖NLP库）"""
        # 提取中文词汇和英文单词
        chinese = re.findall(r'[\u4e00-\u9fa5]{2,}', text)
        english = re.findall(r'\b[A-Za-z]{3,}\b', text)
        return chinese + english
    
    def _is_stopword(self, word):
        """判断是否为停用词"""
        stopwords = {'的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个', 
                    '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好'}
        return word in stopwords
    
    def _extract_relationships(self, text, concepts):
        """提取概念关系"""
        # 查找共现模式
        sentences = re.split(r'[。！？\n]', text)
        
        for sentence in sentences:
            sentence_concepts = [c for c in concepts if c in sentence]
            
            # 如果一句话中出现多个概念，认为它们之间有关系
            if len(sentence_concepts) >= 2:
                for i, c1 in enumerate(sentence_concepts):
                    for c2 in sentence_concepts[i+1:]:
                        self.relationships[c1].append({
                            'target': c2,
                            'type': 'co-occurrence',
                            'context': sentence[:100]
                        })
        
        # 查找因果关系模式
        causal_patterns = [
            (r'因为(.+?)所以(.+?)[。！？]', 'cause'),
            (r'(.+?)导致(.+?)[。！？]', 'cause'),
            (r'(.+?)使得(.+?)[。！？]', 'cause')
        ]
        
        for pattern, rel_type in causal_patterns:
            matches = re.findall(pattern, text)
            for match in matches:
                cause, effect = match
                cause_concepts = [c for c in concepts if c in cause]
                effect_concepts = [c for c in concepts if c in effect]
                
                for cc in cause_concepts:
                    for ec in effect_concepts:
                        self.relationships[cc].append({
                            'target': ec,
                            'type': rel_type,
                            'context': f"{cause} -> {effect}"
                        })
    
    def _extract_rules(self, text):
        """提取规则"""
        # 查找 "如果...那么..." 模式
        if_then_patterns = [
            r'如果(.+?)那么(.+?)[。！？]',
            r'当(.+?)时，(.+?)[。！？]',
            r'(.+?)则(.+?)[。！？]'
        ]
        
        for pattern in if_then_patterns:
            matches = re.findall(pattern, text)
            for match in matches:
                condition, action = match
                self.rules.append({
                    'type': 'if-then',
                    'condition': condition.strip(),
                    'action': action.strip(),
                    'confidence': 0.7
                })
    
    def _extract_patterns(self, text):
        """提取模式"""
        # 查找重复出现的句式模式
        sentences = re.split(r'[。！？]', text)
        
        # 查找步骤模式（1. 2. 3. 或 一、二、三）
        step_patterns = re.findall(r'(?:\d+[\.、]|[一二三四五六七八九十]+[、.])\s*(.+?)(?=\d+[\.、]|[一二三四五六七八九十]+[、.]|$)', text)
        
        if len(step_patterns) >= 2:
            self.patterns.append({
                'type': 'sequential-steps',
                'steps': step_patterns,
                'count': len(step_patterns)
            })
    
    def build_knowledge_graph(self):
        """构建知识图谱"""
        # 筛选高频概念
        top_concepts = [
            concept for concept, count in self.concepts.most_common(self.max_concepts)
            if count >= self.min_frequency
        ]
        
        # 构建节点
        nodes = []
        for concept in top_concepts:
            nodes.append({
                'id': concept,
                'label': concept,
                'frequency': self.concepts[concept],
                'documents': list(self.concept_docs[concept])
            })
        
        # 构建边（关系）
        edges = []
        edge_id = 0
        for source, relations in self.relationships.items():
            if source not in top_concepts:
                continue
            
            for rel in relations:
                target = rel['target']
                if target not in top_concepts:
                    continue
                
                edges.append({
                    'id': f'e{edge_id}',
                    'source': source,
                    'target': target,
                    'type': rel['type'],
                    'context': rel.get('context', '')
                })
                edge_id += 1
        
        # 去重边
        unique_edges = []
        seen = set()
        for edge in edges:
            key = (edge['source'], edge['target'], edge['type'])
            if key not in seen:
                seen.add(key)
                unique_edges.append(edge)
        
        return {
            'nodes': nodes,
            'edges': unique_edges,
            'metadata': {
                'total_concepts': len(self.concepts),
                'indexed_concepts': len(nodes),
                'total_relationships': len(unique_edges),
                'total_documents': len(self.documents)
            }
        }
    
    def generate_mermaid_diagram(self, graph, max_nodes=20):
        """生成Mermaid图表"""
        # 只显示前N个最重要的节点
        top_nodes = sorted(graph['nodes'], key=lambda x: x['frequency'], reverse=True)[:max_nodes]
        node_ids = {n['id'] for n in top_nodes}
        
        lines = ['graph TD']
        
        # 添加节点
        for node in top_nodes:
            node_id = node['id'].replace(' ', '_').replace('-', '_')
            label = node['id']
            freq = node['frequency']
            lines.append(f'    {node_id}["{label}<br/>({freq})"]')
        
        # 添加边
        for edge in graph['edges']:
            if edge['source'] in node_ids and edge['target'] in node_ids:
                source_id = edge['source'].replace(' ', '_').replace('-', '_')
                target_id = edge['target'].replace(' ', '_').replace('-', '_')
                rel_type = edge['type']
                lines.append(f'    {source_id} -->|{rel_type}| {target_id}')
        
        return '\n'.join(lines)
    
    def save_index(self, graph):
        """保存索引数据"""
        # 保存知识图谱
        graph_file = self.index_output_path / 'concept_graph.json'
        with open(graph_file, 'w', encoding='utf-8') as f:
            json.dump(graph, f, ensure_ascii=False, indent=2)
        
        # 保存规则库
        rules_file = self.index_output_path / 'rules_database.json'
        with open(rules_file, 'w', encoding='utf-8') as f:
            json.dump(self.rules, f, ensure_ascii=False, indent=2)
        
        # 保存模式库
        patterns_file = self.index_output_path / 'pattern_library.json'
        with open(patterns_file, 'w', encoding='utf-8') as f:
            json.dump(self.patterns, f, ensure_ascii=False, indent=2)
        
        return {
            'graph_file': str(graph_file),
            'rules_file': str(rules_file),
            'patterns_file': str(patterns_file)
        }
    
    def generate_summary(self, graph):
        """生成摘要信息"""
        top_concepts = sorted(graph['nodes'], key=lambda x: x['frequency'], reverse=True)[:10]
        
        summary = f"""# 知识索引摘要

## 统计信息
- 已索引概念: {graph['metadata']['indexed_concepts']} / {graph['metadata']['total_concepts']}
- 概念关系: {graph['metadata']['total_relationships']}
- 扫描文档: {graph['metadata']['total_documents']}
- 识别规则: {len(self.rules)}
- 识别模式: {len(self.patterns)}

## 高频概念 TOP 10
"""
        for i, concept in enumerate(top_concepts, 1):
            summary += f"{i}. {concept['label']} (出现{concept['frequency']}次)\n"
        
        summary += f"\n## 知识图谱预览\n```mermaid\n{self.generate_mermaid_diagram(graph)}\n```\n"
        
        return summary


def main():
    """主函数"""
    try:
        # 创建索引器
        indexer = KnowledgeIndexer()
        
        # 扫描记忆
        scan_result = indexer.scan_memory()
        
        if scan_result['document_count'] == 0:
            output = {
                'status': 'warning',
                'result': '未找到任何记忆文档，知识图谱为空。请确保Memory目录中包含Markdown文件。'
            }
        else:
            # 构建知识图谱
            graph = indexer.build_knowledge_graph()
            
            # 保存索引
            save_result = indexer.save_index(graph)
            
            # 生成摘要
            summary = indexer.generate_summary(graph)
            
            # 构建返回结果
            output = {
                'status': 'success',
                'result': summary,
                'metadata': {
                    'conceptCount': len(graph['nodes']),
                    'relationCount': len(graph['edges']),
                    'documentCount': scan_result['document_count'],
                    'ruleCount': len(indexer.rules),
                    'patternCount': len(indexer.patterns),
                    'files': save_result
                }
            }
        
        # 打印结果到stdout
        print(json.dumps(output, ensure_ascii=False), file=sys.stdout)
        sys.exit(0)
        
    except Exception as e:
        # 错误处理
        error_output = {
            'status': 'error',
            'error': f'知识索引构建失败: {str(e)}',
            'details': str(type(e).__name__)
        }
        print(json.dumps(error_output, ensure_ascii=False), file=sys.stdout)
        sys.exit(1)


if __name__ == '__main__':
    main()