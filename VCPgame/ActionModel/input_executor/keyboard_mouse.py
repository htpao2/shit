import time
import pyautogui
import pydirectinput
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Safety failsafe
pyautogui.FAILSAFE = True
pyautogui.PAUSE = 0.01

class InputExecutor:
    """
    Executes low-level keyboard and mouse actions.
    Uses pydirectinput for DirectX games (more reliable) and pyautogui for general UI.
    """
    
    def __init__(self, use_direct_input=True):
        self.use_direct_input = use_direct_input
        logger.info(f"InputExecutor initialized. DirectInput: {use_direct_input}")

    def execute(self, action_type, **kwargs):
        """
        Execute a single action.
        
        Args:
            action_type (str): 'keydown', 'keyup', 'keypress', 'mouse_move', 'mouse_click', 'mouse_press', 'mouse_release'
            **kwargs: Parameters for the action (key, x, y, button, duration)
        """
        try:
            method_name = f"_handle_{action_type}"
            if hasattr(self, method_name):
                method = getattr(self, method_name)
                method(**kwargs)
            else:
                logger.warning(f"Unknown action type: {action_type}")
        except pyautogui.FailSafeException:
            logger.error("FailSafe triggered! Mouse moved to corner.")
            raise
        except Exception as e:
            logger.error(f"Error executing {action_type}: {e}")
            raise

    def _handle_keydown(self, key, **kwargs):
        if self.use_direct_input:
            pydirectinput.keyDown(key)
        else:
            pyautogui.keyDown(key)

    def _handle_keyup(self, key, **kwargs):
        if self.use_direct_input:
            pydirectinput.keyUp(key)
        else:
            pyautogui.keyUp(key)

    def _handle_keypress(self, key, duration=0.1, **kwargs):
        if self.use_direct_input:
            pydirectinput.press(key)
        else:
            pyautogui.press(key)

    def _handle_mouse_move(self, x, y, duration=0.0, **kwargs):
        # x, y can be absolute or relative. For now assuming absolute screen coords.
        # TODO: Add support for relative movement
        if self.use_direct_input:
            pydirectinput.moveTo(int(x), int(y))
        else:
            pyautogui.moveTo(x, y, duration=duration)

    def _handle_mouse_click(self, button='left', **kwargs):
        if self.use_direct_input:
            pydirectinput.click(button=button)
        else:
            pyautogui.click(button=button)

    def _handle_mouse_press(self, button='left', **kwargs):
        if self.use_direct_input:
            pydirectinput.mouseDown(button=button)
        else:
            pyautogui.mouseDown(button=button)

    def _handle_mouse_release(self, button='left', **kwargs):
        if self.use_direct_input:
            pydirectinput.mouseUp(button=button)
        else:
            pyautogui.mouseUp(button=button)
