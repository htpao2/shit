#!/usr/bin/env python3
"""
参数一致性验证脚本
检查 plugin-manifest.json 中的参数定义与 main.py 实际代码是否匹配
"""

import json
import re
from typing import Dict, List, Set

def extract_manifest_parameters() -> Dict[str, Set[str]]:
    """从 plugin-manifest.json 提取每个命令的参数"""
    with open('plugin-manifest.json', 'r', encoding='utf-8') as f:
        manifest = json.load(f)
    
    params_by_command = {}
    
    for cmd in manifest['capabilities']['invocationCommands']:
        command = cmd['command']
        description = cmd['description']
        example = cmd.get('example', '')
        
        # 从描述中提取参数（格式：参数: name (类型, 必需/可选)）
        param_pattern = r'参数:\s*(\w+)\s*\('
        params = set(re.findall(param_pattern, description))
        
        # 从示例中提取参数
        example_json_match = re.search(r'parameters:.*?\{([^}]+)\}', example)
        if example_json_match:
            example_params = re.findall(r'"(\w+)":', example_json_match.group(1))
            params.update(example_params)
        
        params_by_command[command] = params
    
    return params_by_command

def extract_code_parameters() -> Dict[str, Set[str]]:
    """从 main.py 提取每个命令实际使用的参数"""
    with open('main.py', 'r', encoding='utf-8') as f:
        code = f.read()
    
    params_by_command = {}
    
    # 定义每个命令的参数提取模式
    command_patterns = {
        'launch_tool': r"launch_tool\(params\.get\('(\w+)'\)",
        'clipboard_tool': r"clipboard_tool\(params\.get\('(\w+)'\)",
        'click_tool': r"click_tool\(.*?params\.get\('(\w+)'\)",
        'type_tool': r"type_tool\(params\.get\('(\w+)'\).*?params\.get\('(\w+)'\).*?params\.get\('(\w+)'\)",
        'scroll_tool': r"scroll_tool\(params\.get\('(\w+)'\).*?params\.get\('(\w+)'\)",
        'drag_tool': r"drag_tool\(.*?params\.get\('(\w+)'\).*?params\.get\('(\w+)'\)",
        'move_tool': r"move_tool\(.*?params\.get\('(\w+)'\)",
        'shortcut_tool': r"shortcut_tool\(params\.get\('(\w+)'\)",
        'key_tool': r"key_tool\(params\.get\('(\w+)'\)",
        'wait_tool': r"wait_tool\(params\.get\('(\w+)'\)",
        'scrape_tool': r"scrape_tool\(params\.get\('(\w+)'\).*?params\.get\('(\w+)'\)",
    }
    
    for command, pattern in command_patterns.items():
        matches = re.findall(pattern, code)
        if matches:
            # 处理多参数的情况（返回元组列表）
            if isinstance(matches[0], tuple):
                params = set()
                for match_tuple in matches:
                    params.update(match_tuple)
            else:
                params = set(matches)
            params_by_command[command] = params
        else:
            params_by_command[command] = set()
    
    return params_by_command

def validate_consistency():
    """验证参数一致性"""
    print("=" * 70)
    print("VCPWindowsObserver 参数一致性验证")
    print("=" * 70)
    
    manifest_params = extract_manifest_parameters()
    code_params = extract_code_parameters()
    
    all_commands = set(manifest_params.keys()) | set(code_params.keys())
    
    issues = []
    
    for command in sorted(all_commands):
        manifest_set = manifest_params.get(command, set())
        code_set = code_params.get(command, set())
        
        # 跳过无参数命令
        if not manifest_set and not code_set:
            continue
        
        print(f"\n【{command}】")
        print(f"  Manifest 定义: {sorted(manifest_set) if manifest_set else '无参数'}")
        print(f"  代码实际使用: {sorted(code_set) if code_set else '无参数'}")
        
        # 检查不一致
        missing_in_code = manifest_set - code_set
        missing_in_manifest = code_set - manifest_set
        
        if missing_in_code:
            issue = f"  ⚠️  文档中定义但代码未使用: {sorted(missing_in_code)}"
            print(issue)
            issues.append((command, issue))
        
        if missing_in_manifest:
            issue = f"  ❌ 代码中使用但文档未定义: {sorted(missing_in_manifest)}"
            print(issue)
            issues.append((command, issue))
        
        if not missing_in_code and not missing_in_manifest and manifest_set:
            print("  ✅ 参数定义一致")
    
    print("\n" + "=" * 70)
    print("验证总结")
    print("=" * 70)
    
    if issues:
        print(f"\n发现 {len(issues)} 个问题:\n")
        for command, issue in issues:
            print(f"[{command}] {issue}")
        return False
    else:
        print("\n✅ 所有参数定义一致！")
        return True

if __name__ == '__main__':
    success = validate_consistency()
    exit(0 if success else 1)