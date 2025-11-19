from uiautomation import GetScreenSize, Control, GetRootControl, ControlType, GetFocusedControl
from src.desktop.views import DesktopState,App,Size
from src.desktop.config import EXCLUDED_APPS
from src.tree import Tree
from time import sleep
import pyautogui
import subprocess
import csv
import io

class Desktop:
    def __init__(self):
        self.desktop_state=None
        
    def get_state(self):
        tree=Tree(self)
        tree_state=tree.get_state()
        screenshot=self.get_screenshot()
        apps=self.get_apps()
        active_app,apps=(apps[0],apps[1:]) if len(apps)>0 else (None,[])
        self.desktop_state=DesktopState(apps=apps,active_app=active_app,screenshot=screenshot,tree_state=tree_state)
        return self.desktop_state
    
    def get_taskbar(self) -> Control:
        root = GetRootControl()
        # Try to find the taskbar by its class name, which is more reliable
        taskbar = root.Control(ClassName='Shell_TrayWnd')
        if taskbar.Exists():
            return taskbar
        # Fallback to searching by name if the class name search fails
        for control, _, _ in root.WalkControl():
            if 'taskbar' in control.Name.lower() or '任务栏' in control.Name:
                return control
        return None
    
    def get_app_status(self, control: Control) -> str:
        taskbar = self.get_taskbar()
        if not taskbar:
            return "Normal"  # If taskbar is not found, assume normal state

        screen_width, screen_height = GetScreenSize()
        window = control.BoundingRectangle
        taskbar_height = taskbar.BoundingRectangle.height()
        
        window_width, window_height = window.width(), window.height()
        
        if window.isempty():
            return "Minimized"
        
        if window_width >= screen_width and window_height >= screen_height - taskbar_height:
            return "Maximized"
            
        return "Normal"
    
    def get_element_under_cursor(self)->Control:
        return GetFocusedControl()
    
    def get_apps_from_start_menu(self)->dict[str,str]:
        command='Get-StartApps | ConvertTo-Csv -NoTypeInformation'
        apps_info,_=self.execute_command(command)
        reader=csv.DictReader(io.StringIO(apps_info))
        return {row.get('Name').lower():row.get('AppID') for row in reader}
    
    def _exec_powershell(self, command: str) -> tuple[str, int, str]:
        """
        执行一条完整的 PowerShell 命令字符串，避免 split 破坏引号。
        返回: (stdout, returncode, stderr)
        """
        try:
            result = subprocess.run(
                ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                check=False
            )
            return (result.stdout or "", result.returncode, result.stderr or "")
        except Exception as e:
            return ("", 1, f"Exception in _exec_powershell: {type(e).__name__}: {e}")

    def _exec_cmd(self, command: str) -> tuple[str, int, str]:
        """
        使用 cmd /c 执行命令，例如通过 start 启动 GUI 程序。
        返回: (stdout, returncode, stderr)
        """
        try:
            result = subprocess.run(
                ["cmd", "/c", command],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                check=False
            )
            return (result.stdout or "", result.returncode, result.stderr or "")
        except Exception as e:
            return ("", 1, f"Exception in _exec_cmd: {type(e).__name__}: {e}")

    def execute_command(self, command: str) -> tuple[str, int]:
        """
        兼容旧接口，保留以免其他调用处崩溃。
        现在走更安全的 _exec_powershell。
        """
        out, code, _ = self._exec_powershell(command)
        return (out, code)
        
    def launch_app(self,name:str):
        """
        启动应用：
        - 若 name 以 .exe 结尾：尝试 Start-Process -FilePath，再尝试 cmd start 兜底
        - 否则：通过 StartApps 映射到 AppID，然后 Start-Process shell:AppsFolder\{AppID}
        返回 (message, code)，code==0 表示成功
        """
        # 先尝试根据扩展名判断
        if name and name.lower().endswith('.exe'):
            # 尝试用 PowerShell 的 Start-Process -FilePath
            ps_cmd = f"Start-Process -FilePath '{name}' -PassThru | Out-Null"
            stdout, code, stderr = self._exec_powershell(ps_cmd)
            if code == 0:
                return (f"Launched {name} via PowerShell Start-Process.", 0)
            # 兜底使用 cmd start（start 需要一个 title 占位参数）
            cmd_cmd = f'start "" "{name}"'
            c_out, c_code, c_err = self._exec_cmd(cmd_cmd)
            if c_code == 0:
                return (f"Launched {name} via cmd start.", 0)
            # 同时保留错误以便上层反馈
            return (f"Failed to launch {name}. PS rc={code}, err={stderr.strip()} | CMD rc={c_code}, err={c_err.strip()}", 1)

        # UWP 或开始菜单应用：从开始菜单映射
        apps_map=self.get_apps_from_start_menu()
        appid=apps_map.get(name.lower()) if name else None
        if appid is None:
            return (f'Application {name.title() if name else name} not found in start menu.',1)

        # 使用 AppsFolder 协议启动
        ps_cmd = f'Start-Process "shell:AppsFolder\\{appid}" -PassThru | Out-Null'
        stdout, code, stderr = self._exec_powershell(ps_cmd)
        if code == 0:
            return (f"Launched {name} via AppsFolder AppID.", 0)

        return (f"Failed to launch {name} via AppsFolder. PS rc={code}, err={stderr.strip()}", 1)
    
    def get_app_size(self,control:Control):
        window=control.BoundingRectangle
        if window.isempty():
            return Size(width=0,height=0)
        return Size(width=window.width(),height=window.height())
    
    def is_app_visible(self,app)->bool:
        is_minimized=self.get_app_status(app)!='Minimized'
        size=self.get_app_size(app)
        area=size.width*size.height
        is_overlay=self.is_overlay_app(app)
        return not is_overlay and is_minimized and area>10
    
    def is_overlay_app(self,element:Control) -> bool:
        no_children = len(element.GetChildren()) == 0
        is_name = "Overlay" in element.Name.strip()
        return no_children or is_name
        
    def get_apps(self) -> list[App]:
        try:
            sleep(0.75)
            desktop = GetRootControl()  # Get the desktop control
            elements = desktop.GetChildren()
            apps = []
            for depth, element in enumerate(elements):
                if element.Name in EXCLUDED_APPS or self.is_overlay_app(element):
                    continue
                if element.ControlType in [ControlType.WindowControl, ControlType.PaneControl]:
                    status = self.get_app_status(element) if self.get_taskbar() else "Normal"
                    size=self.get_app_size(element)
                    apps.append(App(name=element.Name, depth=depth, status=status,size=size))
        except Exception as ex:
            print(f"Error: {ex}")
            apps = []
        return apps
    
    def get_screenshot(self)->bytes:
        screenshot=pyautogui.screenshot()
        return screenshot.tobytes()