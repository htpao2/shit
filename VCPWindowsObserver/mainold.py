import sys
import json
import base64
import subprocess
import os # Added for path manipulation
script_dir = os.path.dirname(os.path.abspath(__file__))
os.chdir(script_dir)
from src.desktop import Desktop
from dataclasses import asdict
from humancursor import SystemCursor
from typing import Literal
import pyautogui as pg
import pyperclip as pc
import requests
from main_content_extractor import MainContentExtractor

# Initialize core components globally
desktop = Desktop()
cursor = SystemCursor()
pg.FAILSAFE = False
pg.PAUSE = 1.0

def get_desktop_info():
    try:
        desktop_state = desktop.get_state()
        state_dict = asdict(desktop_state)
        if 'screenshot' in state_dict and isinstance(state_dict['screenshot'], bytes):
            state_dict['screenshot_base64'] = base64.b64encode(state_dict['screenshot']).decode('utf-8')
            del state_dict['screenshot']
        return {"status": "success", "result": state_dict}
    except Exception as e:
        return {"status": "error", "result": f"Failed to get desktop info: {type(e).__name__} - {str(e)}"}

def launch_tool(name: str):
    if not name:
        raise ValueError("Missing 'name' parameter for launch_tool.")
    
    msg, status = desktop.launch_app(name)
    if status == 0:
        return {"status": "success", "result": msg}
    else:
        try:
            ps_proc = subprocess.run(
                ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", f"Start-Process -FilePath '{name}' -PassThru | Out-Null"],
                capture_output=True, text=True, encoding='utf-8', errors='replace', check=False
            )
            if ps_proc.returncode == 0:
                return {"status": "success", "result": f"Launched {name} via fallback PowerShell."}
            else:
                cmd_proc = subprocess.run(
                    ["cmd", "/c", f'start "" "{name}"'],
                    capture_output=True, text=True, encoding='utf-8', errors='replace', check=False
                )
                if cmd_proc.returncode == 0:
                    return {"status": "success", "result": f"Launched {name} via fallback cmd start."}
                else:
                    detail = f"PS rc={ps_proc.returncode}, err={ps_proc.stderr.strip()} | CMD rc={cmd_proc.returncode}, err={cmd_proc.stderr.strip()}"
                    return {"status": "error", "result": f"Failed to launch {name}. {detail}"}
        except Exception as sub_e:
            return {"status": "error", "result": f"Failed to launch {name} with fallback: {type(sub_e).__name__} - {str(sub_e)}"}

def powershell_tool(command_str: str):
    if not command_str:
        raise ValueError("Missing 'command' parameter for powershell_tool.")
    
    process = subprocess.run(
        ["powershell", "-Command", command_str],
        capture_output=True,
        text=True,
        encoding='utf-8',
        errors='replace'
    )
    if process.returncode == 0:
        return {"status": "success", "result": process.stdout}
    else:
        error_message = process.stderr or f"Command failed with exit code {process.returncode}"
        return {"status": "error", "result": error_message}

def state_tool():
    try:
        desktop_state = desktop.get_state()
        interactive_elements = desktop_state.tree_state.interactive_elements_to_string()
        informative_elements = desktop_state.tree_state.informative_elements_to_string()
        apps = desktop_state.apps_to_string()
        active_app = desktop_state.active_app_to_string()
        result_message = f'Active App:\n{active_app}\n\nOpened Apps:\n{apps}\n\nList of Interactive Elements:\n{interactive_elements}\n\nList of Informative Elements:\n{informative_elements}'
        return {"status": "success", "result": result_message}
    except Exception as e:
        return {"status": "error", "result": f"Failed to get desktop state: {type(e).__name__} - {str(e)}"}

def clipboard_tool(mode: Literal['copy', 'paste'], text: str = None):
    if mode == 'copy':
        if text is None:
            raise ValueError("Missing 'text' parameter for clipboard_tool in 'copy' mode.")
        pc.copy(text)
        return {"status": "success", "result": f'Copied "{text}" to clipboard'}
    elif mode == 'paste':
        clipboard_content = pc.paste()
        return {"status": "success", "result": f'Clipboard Content: "{clipboard_content}"'}
    else:
        raise ValueError('Invalid mode. Use "copy" or "paste".')

def click_tool(loc: tuple, button: str = 'left', clicks: int = 1):
    x, y = loc
    cursor.move_to(loc)
    control = desktop.get_element_under_cursor()
    pg.click(button=button, clicks=clicks)
    num_clicks = {1: 'Single', 2: 'Double', 3: 'Triple'}
    return {"status": "success", "result": f'{num_clicks.get(clicks)} {button} Clicked on {control.Name} Element with ControlType {control.ControlTypeName} at ({x},{y}).'}

def type_tool(text: str, loc: tuple = None, clear: bool = False):
    if text is None:
        raise ValueError("Missing 'text' parameter for type_tool.")

    if loc:
        x, y = loc
        cursor.click_on(loc)
        control = desktop.get_element_under_cursor()
        
        if control is None:
            return {"status": "error", "result": "Target element for typing not found."}
        else:
            if clear:
                pg.hotkey('ctrl', 'a')
                pg.press('backspace')
            pg.typewrite(text, interval=0.1)
            return {"status": "success", "result": f'Typed "{text}" on {control.Name} Element with ControlType {control.ControlTypeName} at ({x},{y}).'}
    else:
        if clear:
            pg.hotkey('ctrl', 'a')
            pg.press('backspace')
        pg.typewrite(text, interval=0.1)
        return {"status": "success", "result": f'Typed "{text}" at the current cursor position.'}

def scroll_tool(direction: Literal['up', 'down'], amount: int = 0):
    if direction == 'up':
        pg.scroll(amount)
    elif direction == 'down':
        pg.scroll(-amount)
    else:
        raise ValueError('Invalid direction.')
    return {"status": "success", "result": f'Scrolled {direction} by {amount}.'}

def drag_tool(from_loc: tuple, to_loc: tuple):
    cursor.move_to(from_loc)
    control = desktop.get_element_under_cursor()
    x1, y1 = from_loc
    x2, y2 = to_loc
    cursor.drag_and_drop(from_loc, to_loc)
    return {"status": "success", "result": f'Dragged the {control.Name} element with ControlType {control.ControlTypeName} from ({x1},{y1}) to ({x2},{y2}).'}

def move_tool(to_loc: tuple = (0, 0)):
    x, y = to_loc
    cursor.move_to(to_loc)
    return {"status": "success", "result": f'Moved the mouse pointer to ({x},{y}).'}

def shortcut_tool(shortcut: list):
    pg.hotkey(*shortcut)
    return {"status": "success", "result": f'Pressed {"+".join(shortcut)}.'}

def key_tool(key: str):
    pg.press(key)
    return {"status": "success", "result": f'Pressed the key {key}.'}

def wait_tool(duration: float):
    pg.sleep(duration)
    return {"status": "success", "result": f'Waited for {duration} seconds.'}

def scrape_tool(url: str, format_type: Literal['markdown', 'text'] = 'markdown'):
    response = requests.get(url, timeout=10)
    html = response.text
    content = MainContentExtractor.extract(html=html, include_links=True, output_format=format_type)
    return {"status": "success", "result": f'Scraped the contents of the entire webpage:\n{content}'}

def main():  
    script_dir = os.path.dirname(os.path.abspath(__file__))  
    os.chdir(script_dir)  
  
    try:  
        input_data = json.load(sys.stdin)  
        command = input_data.get("command")  
        # 直接使用 input_data 作为参数，而不是寻找 parameters 字段  
        params = input_data  
    except json.JSONDecodeError:
        print(json.dumps({"status": "error", "result": "Invalid JSON input."}))
        return

    # Command routing
    output = {}
    try:
        if command == 'get_desktop_info':
            output = get_desktop_info()
        elif command == 'launch_tool':
            output = launch_tool(params.get('name'))
        elif command == 'powershell_tool':
            output = powershell_tool(params.get('command'))
        elif command == 'state_tool':
            output = state_tool()
        elif command == 'clipboard_tool':
            output = clipboard_tool(params.get('mode'), params.get('text'))
        elif command == 'click_tool':
            output = click_tool(tuple(params.get('loc')), params.get('button', 'left'), params.get('clicks', 1))
        elif command == 'type_tool':
            output = type_tool(params.get('text'), tuple(params.get('loc')) if params.get('loc') else None, params.get('clear', False))
        elif command == 'scroll_tool':
            output = scroll_tool(params.get('direction'), params.get('amount', 0))
        elif command == 'drag_tool':
            output = drag_tool(tuple(params.get('from_loc')), tuple(params.get('to_loc')))
        elif command == 'move_tool':
            output = move_tool(tuple(params.get('to_loc', (0, 0))))
        elif command == 'shortcut_tool':
            output = shortcut_tool(params.get('shortcut'))
        elif command == 'key_tool':
            output = key_tool(params.get('key'))
        elif command == 'wait_tool':
            output = wait_tool(params.get('duration'))
        elif command == 'scrape_tool':
            output = scrape_tool(params.get('url'), params.get('format', 'markdown'))
        else:
            output = {"status": "error", "result": f"Unknown command: {command}"}

    except Exception as e:
        output = {"status": "error", "result": f"An error occurred: {type(e).__name__} - {str(e)}"}
        print(f"DEBUG: Exception in main: {e}", file=sys.stderr) 

    sys.stdout.buffer.write(json.dumps(output).encode('utf-8'))

if __name__ == "__main__":
    main()