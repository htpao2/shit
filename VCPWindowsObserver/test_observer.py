import time
import os
from main import (
    get_desktop_info,
    launch_tool,
    powershell_tool,
    state_tool,
    clipboard_tool,
    click_tool,
    type_tool,
    scroll_tool,
    drag_tool,
    move_tool,
    shortcut_tool,
    key_tool,
    wait_tool,
    scrape_tool
)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MAIN_PY_PATH = os.path.join(SCRIPT_DIR, 'main.py')
def main():
    """
    Main function to run all tests for VCPWindowsObserver commands.
    """
    print("=============================================")
    print("=  VCPWindowsObserver Plugin Test Script  =")
    print("=============================================\n")

    # # 1. Get Desktop Info
    # print(">>> [1/14] Testing: get_desktop_info")
    # result = get_desktop_info()
    # print(f"<<< Result: {result}\n")
    # time.sleep(2)

    # # 2. Launch Notepad
    # print(">>> [2/14] Testing: launch_tool (notepad.exe)")
    # result = launch_tool(name="notepad.exe")
    # print(f"<<< Result: {result}\n")
    # time.sleep(2)  # Wait for notepad to open

    # 3. Get Desktop State
    print(">>> [3/14] Testing: state_tool")
    result = state_tool()
    print(f"<<< Result: {result}\n")
    time.sleep(1)

    # 4. Execute PowerShell command
    print(">>> [4/14] Testing: powershell_tool (Get-Process)")
    result = powershell_tool(command_str="Get-Process -Name \"notepad\"")
    print(f"<<< Result: {result}\n")
    time.sleep(1)

    # # 5. Clipboard Tool (Copy)
    # test_text = "Hello from the VCPWindowsObserver test script!"
    # print(f">>> [5/14] Testing: clipboard_tool (copy: '{test_text}')")
    # result = clipboard_tool(mode="copy", text=test_text)
    # print(f"<<< Result: {result}\n")
    # time.sleep(1)

    # 6. Click Tool (to focus Notepad)
    print(">>> [6/14] Testing: click_tool (at 500, 500)")
    result = click_tool(loc=(500, 500))
    print(f"<<< Result: {result}\n")
    time.sleep(1)

    # # 7. Type Tool (paste via shortcut)
    # print(">>> [7/14] Testing: shortcut_tool (ctrl+v to paste)")
    # result = shortcut_tool(shortcut=["ctrl", "v"])
    # print(f"<<< Result: {result}\n")
    # time.sleep(1)
    
    # # 8. Type Tool (direct typing)
    # print(">>> [8/14] Testing: type_tool (direct typing)")
    # result = type_tool(text="\nThis is a direct typing test.")
    # print(f"<<< Result: {result}\n")
    # time.sleep(1)

    # # 9. Scroll Tool
    # print(">>> [9/14] Testing: scroll_tool (down)")
    # result = scroll_tool(direction="down", amount=100)
    # print(f"<<< Result: {result}\n")
    # time.sleep(1)

    # # 10. Move Tool
    # print(">>> [10/14] Testing: move_tool (to 10, 10)")
    # result = move_tool(to_loc=(10, 10))
    # print(f"<<< Result: {result}\n")
    # time.sleep(1)

    # # 11. Drag Tool
    # print(">>> [11/14] Testing: drag_tool (from 100,100 to 300,300)")
    # result = drag_tool(from_loc=(100, 100), to_loc=(300, 300))
    # print(f"<<< Result: {result}\n")
    # time.sleep(1)

    # # 12. Shortcut Tool (Select All)
    # print(">>> [12/14] Testing: shortcut_tool (ctrl+a)")
    # result = shortcut_tool(shortcut=["ctrl", "a"])
    # print(f"<<< Result: {result}\n")
    # time.sleep(1)

    # # 13. Key Tool (Delete)
    # print(">>> [13/14] Testing: key_tool (delete)")
    # result = key_tool(key="delete")
    # print(f"<<< Result: {result}\n")
    # time.sleep(1)

    # # 14. Wait Tool
    # print(">>> [14/14] Testing: wait_tool (1.5 seconds)")
    # result = wait_tool(duration=1.5)
    # print(f"<<< Result: {result}\n")

    # # 15. Scrape Tool
    # print(">>> [15/14] Testing: scrape_tool (https://example.com)")
    # result = scrape_tool(url="https://example.com")
    # print(f"<<< Result: {result}\n")

    # # Clean up by closing Notepad
    # print(">>> Cleaning up: Closing Notepad...")
    # os.system("taskkill /F /IM notepad.exe")
    # print("<<< Cleanup complete.\n")
    
    # print("=============================================")
    # print("=              Test Run Finished            =")
    # print("=============================================")

if __name__ == "__main__":
    main()