from src.tree.config import INTERACTIVE_CONTROL_TYPE_NAMES,INFORMATIVE_CONTROL_TYPE_NAMES
from src.tree.views import TreeElementNode, TextElementNode,Center,TreeState
from concurrent.futures import ThreadPoolExecutor, as_completed
from uiautomation import GetRootControl,Control,ImageControl
from typing import TYPE_CHECKING
from time import sleep

if TYPE_CHECKING:
    from src.desktop import Desktop

class Tree:
    def __init__(self,desktop:'Desktop'):
        self.desktop=desktop

    def get_state(self)->TreeState:
        sleep(0.15)
        # Get the root control of the desktop
        root=GetRootControl()
        interactive_nodes,informative_nodes=self.get_appwise_nodes(node=root)
        return TreeState(interactive_nodes=interactive_nodes,informative_nodes=informative_nodes)
    
    def get_appwise_nodes(self,node:Control) -> tuple[list[TreeElementNode],list[TextElementNode]]:
        all_apps = node.GetChildren()
        # 可见性依据 desktop.is_app_visible，避免隐藏/覆盖窗口
        visible_apps = {app.Name: app for app in all_apps if self.desktop.is_app_visible(app)}

        apps: dict[str, Control] = {}

        # 安全获取 Taskbar 和 Program Manager
        taskbar = visible_apps.get('Taskbar')
        progman = visible_apps.get('Program Manager')

        if taskbar:
            apps['Taskbar'] = taskbar
        if progman:
            apps['Program Manager'] = progman

        # 选择一个前景应用（若还存在其他可见应用）
        # 从 visible_apps 去掉已加入的键后，取第一个作为前景
        for k in ['Taskbar', 'Program Manager']:
            if k in visible_apps:
                visible_apps.pop(k)

        if visible_apps:
            foreground_app = next(iter(visible_apps.values()))
            if foreground_app and foreground_app.Name:
                apps[foreground_app.Name.strip()] = foreground_app

        # 若 apps 仍为空，兜底使用根节点（确保不返回空集合导致后续并发遍历报错）
        if not apps:
            apps['Root'] = node

        interactive_nodes, informative_nodes = [], []

        # 并行遍历每个选中的 app 子树
        with ThreadPoolExecutor() as executor:
            future_to_node = {executor.submit(self.get_nodes, app): app for app in apps.values()}
            for future in as_completed(future_to_node):
                app_node = future_to_node[future]
                try:
                    result = future.result()
                    if result:
                        element_nodes, text_nodes = result
                        interactive_nodes.extend(element_nodes)
                        informative_nodes.extend(text_nodes)
                except Exception as e:
                    try:
                        app_name = getattr(app_node, 'Name', '<unknown>')
                    except Exception:
                        app_name = '<unknown>'
                    print(f"Error processing node {app_name}: {e}")
        return interactive_nodes, informative_nodes

    def get_nodes(self, node: Control) -> list[TreeElementNode]:
        interactive_nodes, informative_nodes = [], []
        app_name=node.Name.strip()
        app_name='Desktop' if app_name=='Program Manager' else app_name
        def is_element_interactive(node:Control):
            try:
                if node.ControlTypeName in INTERACTIVE_CONTROL_TYPE_NAMES:
                    if is_element_visible(node) and is_element_enabled(node) and not is_element_image(node):
                        return True
            except Exception as ex:
                return False
            return False
        
        def is_element_visible(node:Control,threshold:int=0):
            box=node.BoundingRectangle
            if box.isempty():
                return False
            width=box.width()
            height=box.height()
            area=width*height
            is_offscreen=not node.IsOffscreen
            return area > threshold and is_offscreen
    
        def is_element_enabled(node:Control):
            try:
                return node.IsEnabled
            except Exception as ex:
                return False
        
        def is_element_image(node:Control):
            if isinstance(node,ImageControl):
                if not node.Name.strip() or node.LocalizedControlType=='graphic':
                    return True
            return False
        
        def is_element_text(node:Control):
            try:
                if node.ControlTypeName in INFORMATIVE_CONTROL_TYPE_NAMES:
                    if is_element_visible(node) and is_element_enabled(node) and not is_element_image(node):
                        return True
            except Exception as ex:
                return False
            return False
            
        def tree_traversal(node: Control):
            if is_element_interactive(node):
                box = node.BoundingRectangle
                x,y=box.xcenter(),box.ycenter()
                center = Center(x=x,y=y)
                interactive_nodes.append(TreeElementNode(
                    name=node.Name.strip() or "''",
                    control_type=node.LocalizedControlType.title(),
                    shortcut=node.AcceleratorKey or "''",
                    center=center,
                    app_name=app_name
                ))
            elif is_element_text(node):
                informative_nodes.append(TextElementNode(
                    name=node.Name.strip() or "''",
                    app_name=app_name
                ))
            # Recursively check all children
            for child in node.GetChildren():
                tree_traversal(child)
        tree_traversal(node)
        return (interactive_nodes,informative_nodes)