"""
VCPWindowsObserver Bug修复验证测试
测试所有已修复的bug是否正常工作
"""
import json
import subprocess
import sys
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MAIN_PY_PATH = os.path.join(SCRIPT_DIR, 'main.py')

def call_plugin_command(command: str, parameters: dict = None):
    """调用插件命令"""
    if not os.path.exists(MAIN_PY_PATH):
        return {"status": "error", "result": f"Error: main.py not found at {MAIN_PY_PATH}"}

    # 构造payload（使用修复后的格式）
    payload = {"command": command}
    if parameters is not None:
        payload.update(parameters)
    
    payload_str = json.dumps(payload)
    
    try:
        python_executable = sys.executable
        process = subprocess.Popen(
            [python_executable, MAIN_PY_PATH],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=False,  # 使用二进制模式避免编码问题
            cwd=SCRIPT_DIR
        )
        
        stdout_data, stderr_data = process.communicate(input=payload_str.encode('utf-8'), timeout=30)
        
        # 解码输出，尝试多种编码
        try:
            stdout_str = stdout_data.decode('utf-8')
        except UnicodeDecodeError:
            try:
                stdout_str = stdout_data.decode('gbk')
            except UnicodeDecodeError:
                stdout_str = stdout_data.decode('utf-8', errors='ignore')
        
        try:
            stderr_str = stderr_data.decode('utf-8')
        except UnicodeDecodeError:
            try:
                stderr_str = stderr_data.decode('gbk')
            except UnicodeDecodeError:
                stderr_str = stderr_data.decode('utf-8', errors='ignore')
        
        if process.returncode != 0:
            return {"status": "error", "result": stderr_str.strip()}
        
        try:
            result_json = json.loads(stdout_str)
            return result_json
        except json.JSONDecodeError:
            return {"status": "error", "result": "Invalid JSON response", "raw_output": stdout_str}
    
    except subprocess.TimeoutExpired:
        process.kill()
        return {"status": "error", "result": "Process timed out"}
    except Exception as e:
        return {"status": "error", "result": str(e)}

def test_result(test_name, result, expected_status="success"):
    """验证测试结果"""
    status = result.get("status", "unknown")
    if status == expected_status:
        print(f"✅ {test_name}: PASSED")
        return True
    else:
        print(f"❌ {test_name}: FAILED")
        print(f"   Expected: {expected_status}, Got: {status}")
        print(f"   Result: {result}")
        return False

def main():
    print("=" * 60)
    print("VCPWindowsObserver Bug修复验证测试")
    print("=" * 60)
    print()
    
    passed = 0
    failed = 0
    
    # 测试1: 参数传递修复 - get_desktop_info
    print("[测试1] 参数传递 - get_desktop_info (无参数)")
    result = call_plugin_command("get_desktop_info")
    if test_result("get_desktop_info", result):
        passed += 1
    else:
        failed += 1
    print()
    
    # 测试2: 参数传递修复 - state_tool
    print("[测试2] 参数传递 - state_tool (无参数)")
    result = call_plugin_command("state_tool")
    if test_result("state_tool", result):
        passed += 1
    else:
        failed += 1
    print()
    
    # 测试3: 错误处理 - click_tool with invalid location
    print("[测试3] 错误处理 - click_tool (无效坐标)")
    result = call_plugin_command("click_tool", {"loc": None})
    if test_result("click_tool with None", result, expected_status="error"):
        passed += 1
    else:
        failed += 1
    print()
    
    # 测试4: 错误处理 - click_tool with incomplete location
    print("[测试4] 错误处理 - click_tool (不完整坐标)")
    result = call_plugin_command("click_tool", {"loc": [100]})
    if test_result("click_tool with incomplete loc", result, expected_status="error"):
        passed += 1
    else:
        failed += 1
    print()
    
    # 测试5: 错误处理 - move_tool with invalid location
    print("[测试5] 错误处理 - move_tool (无效坐标)")
    result = call_plugin_command("move_tool", {"to_loc": []})
    if test_result("move_tool with empty loc", result, expected_status="error"):
        passed += 1
    else:
        failed += 1
    print()
    
    # 测试6: 错误处理 - scroll_tool with invalid direction
    print("[测试6] 错误处理 - scroll_tool (无效方向)")
    result = call_plugin_command("scroll_tool", {"direction": "invalid", "amount": 100})
    if test_result("scroll_tool with invalid direction", result, expected_status="error"):
        passed += 1
    else:
        failed += 1
    print()
    
    # 测试7: 参数传递 - clipboard_tool copy
    print("[测试7] 参数传递 - clipboard_tool (复制)")
    result = call_plugin_command("clipboard_tool", {"mode": "copy", "text": "测试文本123"})
    if test_result("clipboard_tool copy", result):
        passed += 1
    else:
        failed += 1
    print()
    
    # 测试8: 参数传递 - clipboard_tool paste
    print("[测试8] 参数传递 - clipboard_tool (粘贴)")
    result = call_plugin_command("clipboard_tool", {"mode": "paste"})
    if test_result("clipboard_tool paste", result):
        passed += 1
        if result.get("status") == "success":
            content = result.get("result", "")
            if "测试文本123" in content:
                print("   ✓ 剪贴板内容正确")
            else:
                print(f"   ⚠ 剪贴板内容: {content}")
    else:
        failed += 1
    print()
    
    # 测试9: 参数传递 - shortcut_tool
    print("[测试9] 参数传递 - shortcut_tool")
    result = call_plugin_command("shortcut_tool", {"shortcut": ["ctrl", "c"]})
    if test_result("shortcut_tool", result):
        passed += 1
    else:
        failed += 1
    print()
    
    # 测试10: 参数传递 - key_tool
    print("[测试10] 参数传递 - key_tool")
    result = call_plugin_command("key_tool", {"key": "esc"})
    if test_result("key_tool", result):
        passed += 1
    else:
        failed += 1
    print()
    
    # 测试11: 参数传递 - wait_tool
    print("[测试11] 参数传递 - wait_tool")
    result = call_plugin_command("wait_tool", {"duration": 0.1})
    if test_result("wait_tool", result):
        passed += 1
    else:
        failed += 1
    print()
    
    # 总结
    print("=" * 60)
    print(f"测试完成: {passed} 通过, {failed} 失败")
    print("=" * 60)
    print()
    
    if failed == 0:
        print("🎉 所有测试通过！Bug修复验证成功！")
    else:
        print(f"⚠️  有 {failed} 个测试失败，需要进一步检查")
    
    return 0 if failed == 0 else 1

if __name__ == "__main__":
    sys.exit(main())