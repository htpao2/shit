import subprocess
import json
import os
import sys

# 确保我们相对于脚本文件本身来定位 main.py
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MAIN_PY_PATH = os.path.join(SCRIPT_DIR, 'main.py')

def call_plugin_command(command: str, parameters: dict = None):
    """
    模拟 VCP 服务端调用插件的方式，通过 stdio 与 main.py 交互。

    Args:
        command (str): 要执行的命令 (例如 "get_desktop_info").
        parameters (dict, optional): 命令所需的参数. Defaults to None.

    Returns:
        dict: 从插件返回的 JSON 结果。
    """
    if not os.path.exists(MAIN_PY_PATH):
        return {"status": "error", "result": f"Error: main.py not found at {MAIN_PY_PATH}"}

    # 1. 构造发送给插件的 JSON 数据
    # 修复：将参数直接放在顶层，而不是嵌套在 parameters 字段中
    payload = {"command": command}
    if parameters is not None:
        payload.update(parameters)
    
    payload_str = json.dumps(payload)

    print(f"--- Calling Command: {command} ---")
    print(f"> Sending to stdin: {payload_str}")

    try:
        # 2. 启动 main.py 子进程
        # 使用 python 的绝对路径以增加稳定性
        python_executable = sys.executable
        process = subprocess.Popen(
            [python_executable, MAIN_PY_PATH],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=False,  # 使用二进制模式避免编码问题
            cwd=SCRIPT_DIR # 在脚本所在目录运行
        )

        # 3. 通过 stdin 发送数据并从 stdout 接收结果
        stdout_data, stderr_data = process.communicate(input=payload_str.encode('utf-8'), timeout=150)
        
        # 4. 解码输出，尝试多种编码
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

        # 5. 处理结果
        if process.returncode != 0:
            print(f"< Process exited with error code: {process.returncode}")
            print(f"< Stderr: {stderr_str.strip()}")
            return {"status": "error", "result": stderr_str.strip()}

        if stderr_str:
            print(f"< Stderr (non-fatal): {stderr_str.strip()}")

        try:
            result_json = json.loads(stdout_str)
            print(f"< Received from stdout: {json.dumps(result_json, indent=2, ensure_ascii=False)}")
            return result_json
        except json.JSONDecodeError:
            print(f"< Error: Failed to decode JSON from stdout.")
            print(f"< Raw stdout: {stdout_str}")
            return {"status": "error", "result": "Invalid JSON response", "raw_output": stdout_str}

    except subprocess.TimeoutExpired:
        print("< Error: Process timed out.")
        process.kill()
        return {"status": "error", "result": "Process timed out"}
    except Exception as e:
        print(f"< An unexpected error occurred: {e}")
        return {"status": "error", "result": str(e)}
    finally:
        print("-" * (25 + len(command)))
        print("\n")


if __name__ == "__main__":
    # --- 测试用例 ---
    # 所有测试用例已注释，取消注释以运行特定测试
    
    # 1. 测试: get_desktop_info (无参数)
    # 获取完整的桌面状态和截图
    # call_plugin_command("get_desktop_info")

    # # 2. 测试: state_tool (无参数)
    # # 获取可读的桌面状态摘要
    # call_plugin_command("state_tool")

    # # 3. 测试: launch_tool (有参数)
    # # 启动记事本
    # call_plugin_command("launch_tool", {"name": "notepad.exe"})

    # 4. 测试: powershell_tool - 已移除此功能

    # 5. 测试: click_tool (有参数)
    # 点击屏幕上的 (500, 500) 位置
    # 注意: 这会实际移动并点击你的鼠标！
    # call_plugin_command("click_tool", {"loc": [500, 500]})
    call_plugin_command("move_tool", {"to_loc": [1000, 1000]})
    # # 10. Move Tool
    # print(">>> [10/14] Testing: move_tool (to 10, 10)")
    # result = move_tool(to_loc=(10, 10))
    # print(f"<<< Result: {result}\n")
    # time.sleep(1)

    # 6. 测试: 一个不存在的命令
    # call_plugin_command("non_existent_command")