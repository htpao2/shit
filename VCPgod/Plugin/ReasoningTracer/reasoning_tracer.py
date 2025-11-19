#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ReasoningTracer - VCP Reasoning Process Tracker
记录推理过程，生成可视化图表，保存到日记系统
"""

import sys
import json
import os
from pathlib import Path
from datetime import datetime
import base64
import io

# 设置标准输入输出编码为UTF-8
sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding='utf-8')
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')


class ReasoningTracer:
    """推理追踪器主类"""
    
    def __init__(self):
        """初始化配置"""
        self.trace_output_path = Path(os.getenv('TRACE_OUTPUT_PATH', './Memory/ReasoningHistory'))
        self.enable_visualization = os.getenv('ENABLE_VISUALIZATION', 'true').lower() == 'true'
        self.save_to_diary = os.getenv('SAVE_TO_DIARY', 'true').lower() == 'true'
        self.max_trace_history = int(os.getenv('MAX_TRACE_HISTORY', 100))
        
        # 确保输出目录存在
        self.trace_output_path.mkdir(parents=True, exist_ok=True)
    
    def trace_reasoning(self, reasoning_id, query, reasoning_steps, result, 
                       confidence=0.7, save_to_diary=None, visualization_type='flowchart'):
        """
        追踪推理过程
        
        Args:
            reasoning_id: 推理任务ID
            query: 原始问题
            reasoning_steps: 推理步骤列表
            result: 推理结果
            confidence: 置信度
            save_to_diary: 是否保存到日记
            visualization_type: 可视化类型
        """
        # 如果未指定，使用配置的默认值
        if save_to_diary is None:
            save_to_diary = self.save_to_diary
        
        # 验证步骤数据
        if not isinstance(reasoning_steps, list):
            raise ValueError("reasoning_steps must be a list")
        
        # 排序步骤
        sorted_steps = sorted(reasoning_steps, key=lambda x: x.get('step', 0))
        
        # 生成追踪记录
        trace_record = {
            'reasoning_id': reasoning_id,
            'timestamp': datetime.now().isoformat(),
            'query': query,
            'result': result,
            'confidence': confidence,
            'steps': sorted_steps,
            'step_count': len(sorted_steps)
        }
        
        # 生成可视化图表
        mermaid_diagram = None
        visualization_data = None
        
        if self.enable_visualization:
            mermaid_diagram = self.generate_mermaid_diagram(
                trace_record, visualization_type
            )
            
            # 尝试生成图片（如果有matplotlib）
            try:
                visualization_data = self.generate_visualization_image(trace_record)
            except Exception as e:
                print(f"生成可视化图片失败: {e}", file=sys.stderr)
        
        # 保存追踪记录
        trace_file = self.save_trace_record(trace_record, mermaid_diagram)
        
        # 保存到日记系统
        diary_path = None
        if save_to_diary:
            diary_path = self.save_to_diary_system(trace_record, mermaid_diagram)
        
        # 清理旧记录
        self.cleanup_old_traces()
        
        return {
            'reasoning_id': reasoning_id,
            'trace_summary': self.generate_summary(trace_record),
            'mermaid_diagram': mermaid_diagram,
            'saved_to_diary': save_to_diary,
            'diary_path': diary_path,
            'trace_file': str(trace_file),
            'visualization': visualization_data,
            'step_count': len(sorted_steps)
        }
    
    def generate_mermaid_diagram(self, trace_record, diagram_type='flowchart'):
        """生成Mermaid可视化图表"""
        steps = trace_record['steps']
        
        if diagram_type == 'sequence':
            return self._generate_sequence_diagram(trace_record)
        elif diagram_type == 'graph':
            return self._generate_graph_diagram(trace_record)
        else:  # flowchart (default)
            return self._generate_flowchart_diagram(trace_record)
    
    def _generate_flowchart_diagram(self, trace_record):
        """生成流程图"""
        lines = ['graph TD']
        lines.append(f'    START[开始: {trace_record["query"][:30]}...]')
        
        steps = trace_record['steps']
        prev_node = 'START'
        
        for i, step in enumerate(steps):
            step_num = step.get('step', i + 1)
            step_type = step.get('type', 'unknown')
            description = step.get('description', '未知步骤')
            confidence = step.get('confidence', '')
            
            # 创建节点ID
            node_id = f'STEP{step_num}'
            
            # 根据推理类型选择样式
            if step_type == 'deductive':
                shape = f'{node_id}["{step_num}. {description}"]'
            elif step_type == 'inductive':
                shape = f'{node_id}{{"{step_num}. {description}"}}'
            elif step_type == 'analogical':
                shape = f'{node_id}(["{step_num}. {description}"])'
            else:
                shape = f'{node_id}["{step_num}. {description}"]'
            
            lines.append(f'    {shape}')
            
            # 添加连接
            edge_label = f'{step_type}'
            if confidence:
                edge_label += f'<br/>置信度:{confidence}'
            
            lines.append(f'    {prev_node} -->|{edge_label}| {node_id}')
            prev_node = node_id
        
        # 添加结束节点
        result_short = trace_record['result'][:50]
        confidence_pct = int(trace_record['confidence'] * 100)
        lines.append(f'    END([结论: {result_short}...<br/>置信度:{confidence_pct}%])')
        lines.append(f'    {prev_node} --> END')
        
        # 添加样式
        lines.append('    style START fill:#90EE90')
        lines.append('    style END fill:#FFB6C1')
        
        return '\n'.join(lines)
    
    def _generate_sequence_diagram(self, trace_record):
        """生成序列图"""
        lines = ['sequenceDiagram']
        lines.append('    participant User as 用户')
        lines.append('    participant System as 推理系统')
        lines.append('')
        
        lines.append(f'    User->>System: {trace_record["query"]}')
        lines.append('    activate System')
        
        for step in trace_record['steps']:
            step_type = step.get('type', 'unknown')
            description = step.get('description', '未知步骤')
            lines.append(f'    System->>System: {step_type}: {description}')
        
        lines.append(f'    System-->>User: {trace_record["result"]}')
        lines.append('    deactivate System')
        
        return '\n'.join(lines)
    
    def _generate_graph_diagram(self, trace_record):
        """生成关系图"""
        lines = ['graph LR']
        
        steps = trace_record['steps']
        for i, step in enumerate(steps):
            step_num = step.get('step', i + 1)
            step_type = step.get('type', 'unknown')
            description = step.get('description', '未知步骤')[:20]
            
            node_id = f'S{step_num}'
            lines.append(f'    {node_id}[{step_type}<br/>{description}]')
            
            if i > 0:
                prev_id = f'S{steps[i-1].get("step", i)}'
                lines.append(f'    {prev_id} --> {node_id}')
        
        return '\n'.join(lines)
    
    def generate_visualization_image(self, trace_record):
        """生成可视化图片（需要matplotlib）"""
        try:
            import matplotlib
            matplotlib.use('Agg')  # 使用非交互式后端
            import matplotlib.pyplot as plt
            from io import BytesIO
            
            fig, ax = plt.subplots(figsize=(12, 8))
            
            # 绘制推理步骤
            steps = trace_record['steps']
            y_positions = list(range(len(steps), 0, -1))
            
            for i, step in enumerate(steps):
                y = y_positions[i]
                step_type = step.get('type', 'unknown')
                description = step.get('description', '未知步骤')
                confidence = step.get('confidence', 0)
                
                # 根据类型选择颜色
                color_map = {
                    'deductive': 'lightblue',
                    'inductive': 'lightgreen',
                    'analogical': 'lightyellow',
                    'unknown': 'lightgray'
                }
                color = color_map.get(step_type, 'lightgray')
                
                # 绘制步骤框
                ax.barh(y, 1, left=0, height=0.8, color=color, edgecolor='black')
                
                # 添加文本
                text = f"{step.get('step', i+1)}. {step_type}\n{description[:40]}"
                if confidence:
                    text += f"\n置信度: {confidence}"
                
                ax.text(0.5, y, text, ha='center', va='center', fontsize=9,
                       fontproperties={'family': 'sans-serif'})
            
            # 设置图表
            ax.set_xlim(0, 1)
            ax.set_ylim(0.5, len(steps) + 0.5)
            ax.set_yticks([])
            ax.set_xticks([])
            ax.set_title(f'推理过程追踪: {trace_record["reasoning_id"]}\n问题: {trace_record["query"][:50]}...',
                        fontsize=12, pad=20)
            
            # 添加结论
            result_text = f'结论: {trace_record["result"][:60]}...\n整体置信度: {trace_record["confidence"]:.2%}'
            ax.text(0.5, 0.2, result_text, ha='center', va='top', 
                   bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.5),
                   fontsize=10)
            
            plt.tight_layout()
            
            # 保存为base64
            buffer = BytesIO()
            plt.savefig(buffer, format='png', dpi=150, bbox_inches='tight')
            buffer.seek(0)
            image_base64 = base64.b64encode(buffer.read()).decode('utf-8')
            plt.close()
            
            return f'data:image/png;base64,{image_base64}'
            
        except ImportError:
            return None
    
    def save_trace_record(self, trace_record, mermaid_diagram):
        """保存追踪记录到JSON文件"""
        filename = f"{trace_record['reasoning_id']}.json"
        filepath = self.trace_output_path / filename
        
        # 添加Mermaid图表到记录
        if mermaid_diagram:
            trace_record['mermaid_diagram'] = mermaid_diagram
        
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(trace_record, f, ensure_ascii=False, indent=2)
        
        return filepath
    
    def save_to_diary_system(self, trace_record, mermaid_diagram):
        """保存到日记系统（创建Markdown文件）"""
        # 生成日记文件名
        date_str = datetime.now().strftime('%Y-%m-%d')
        filename = f"{date_str}-reasoning-{trace_record['reasoning_id']}.md"
        filepath = self.trace_output_path / filename
        
        # 构建Markdown内容
        content_parts = [
            f"# 推理追踪记录: {trace_record['reasoning_id']}",
            "",
            f"**时间**: {trace_record['timestamp']}",
            f"**问题**: {trace_record['query']}",
            f"**结论**: {trace_record['result']}",
            f"**整体置信度**: {trace_record['confidence']:.2%}",
            "",
            "## 推理步骤",
            ""
        ]
        
        for step in trace_record['steps']:
            step_num = step.get('step', 0)
            step_type = step.get('type', 'unknown')
            description = step.get('description', '')
            confidence = step.get('confidence', '')
            
            content_parts.append(f"### 步骤 {step_num}: {step_type}")
            trace_files = list(self.trace_output_path.glob('*.json'))
            
            # 按修改时间排序
            trace_files.sort(key=lambda f: f.stat().st_mtime, reverse=True)
            
            # 删除超过限制的文件
            if len(trace_files) > self.max_trace_history:
                for old_file in trace_files[self.max_trace_history:]:
                    old_file.unlink()
                    print(f"清理旧追踪记录: {old_file.name}", file=sys.stderr)
        
        except Exception as e:
            print(f"清理旧记录时出错: {e}", file=sys.stderr)


def main():
    """主函数"""
    try:
        # 读取stdin
        input_data = sys.stdin.read().strip()
        args = json.loads(input_data)
        
        # 验证必需参数
        required_params = ['reasoning_id', 'query', 'reasoning_steps', 'result']
        for param in required_params:
            if param not in args:
                raise ValueError(f"缺少必需参数: {param}")
        
        # 解析步骤（如果是字符串，需要解析为JSON）
        reasoning_steps = args['reasoning_steps']
        if isinstance(reasoning_steps, str):
            reasoning_steps = json.loads(reasoning_steps)
        
        # 创建追踪器
        tracer = ReasoningTracer()
        
        # 执行追踪
        result = tracer.trace_reasoning(
            reasoning_id=args['reasoning_id'],
            query=args['query'],
            reasoning_steps=reasoning_steps,
            result=args['result'],
            confidence=float(args.get('confidence', 0.7)),
            save_to_diary=args.get('save_to_diary'),
            visualization_type=args.get('visualization_type', 'flowchart')
        )
        
        # 构建输出
        output = {
            'status': 'success',
            'result': result
        }
        
        print(json.dumps(output, ensure_ascii=False), file=sys.stdout)
        sys.exit(0)
        
    except Exception as e:
        error_output = {
            'status': 'error',
            'error': f'推理追踪失败: {str(e)}',
            'details': str(type(e).__name__)
        }
        print(json.dumps(error_output, ensure_ascii=False), file=sys.stdout)
        sys.exit(1)


if __name__ == '__main__':
    main()