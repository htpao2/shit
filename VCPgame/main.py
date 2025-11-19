import time
import json
import os
import subprocess
import sys
from typing import List
import logging

from interfaces import Agent, Observation, Action

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("VCPMain")

class SimpleScriptAgent(Agent):
    """
    A simple agent for testing purposes.
    """
    def __init__(self):
        self.step_count = 0
        
    def reset(self):
        self.step_count = 0
        
    def act(self, observation: Observation) -> List[Action]:
        self.step_count += 1
        logger.info(f"Agent received observation at {observation.timestamp}")
        
        # Simple logic: Move mouse in a square
        actions = []
        if self.step_count % 4 == 0:
            actions.append(Action(type='move', parameters={'direction': 'right', 'duration': 500}))
        elif self.step_count % 4 == 1:
            actions.append(Action(type='move', parameters={'direction': 'down', 'duration': 500}))
        elif self.step_count % 4 == 2:
            actions.append(Action(type='move', parameters={'direction': 'left', 'duration': 500}))
        else:
            actions.append(Action(type='move', parameters={'direction': 'up', 'duration': 500}))
            
        return actions

class VCPEnvironment:
    """
    Manages the interaction between the Agent and the VCP Plugins.
    """
    def __init__(self):
        # Use absolute paths to avoid CWD confusion
        base_dir = os.path.dirname(os.path.abspath(__file__))
        self.observer_dir = os.path.join(base_dir, "Plugin", "GameObserver")
        self.observer_script = os.path.join(self.observer_dir, "observer.py")
        
        self.controller_dir = os.path.join(base_dir, "Plugin", "GameController")
        self.controller_script = os.path.join(self.controller_dir, "controller.js")
        
        # Ensure plugins exist
        if not os.path.exists(self.observer_script):
            raise FileNotFoundError(f"Observer script not found at {self.observer_script}")
        if not os.path.exists(self.controller_script):
            raise FileNotFoundError(f"Controller script not found at {self.controller_script}")

    def get_observation(self) -> Observation:
        """
        Call GameObserver to get the current state.
        """
        try:
            # Call observer.py via subprocess
            # We use 'file' format for efficiency if possible, but for simplicity here we use base64 default
            # or we can try the new 'file' format
            
            request = {
                "command": "CaptureGameState",
                "format": "file", # Use new feature
                "enable_ocr": True
            }
            
            process = subprocess.Popen(
                [sys.executable, "observer.py"], # Just filename since we set cwd
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                cwd=self.observer_dir # Run in plugin dir
            )
            
            stdout, stderr = process.communicate(input=json.dumps(request))
            
            if process.returncode != 0:
                logger.error(f"Observer failed: {stderr}")
                return None
                
            response = json.loads(stdout)
            if response.get("status") != "success":
                logger.error(f"Observer error: {response.get('error')}")
                return None
                
            result = response["result"]
            
            return Observation(
                timestamp=result["timestamp"],
                screenshot_path=result.get("image_path"),
                screenshot_base64=result.get("screenshot_base64"),
                window_info=result.get("window_info", {}),
                recognized_text=result.get("recognized_data", {})
            )
            
        except Exception as e:
            logger.error(f"Error getting observation: {e}")
            return None

    def execute_actions(self, actions: List[Action]):
        """
        Call GameController to execute actions.
        """
        if not actions:
            return
            
        try:
            # Convert Action objects to Controller command format
            commands = []
            for action in actions:
                cmd = {
                    "type": action.type,
                    "parameters": action.parameters
                }
                commands.append(cmd)
                
            # Call controller.js via subprocess
            # Note: We need 'node' in path
            process = subprocess.Popen(
                ["node", "controller.js"], # Just filename
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                cwd=self.controller_dir,
                env={**os.environ, "EXECUTION_MODE": "model", "ACTION_MODEL_URL": "http://localhost:5000"}
            )
            
            stdout, stderr = process.communicate(input=json.dumps(commands))
            
            if process.returncode != 0:
                logger.error(f"Controller failed: {stderr}")
            else:
                logger.info(f"Controller output: {stdout}")
                
        except Exception as e:
            logger.error(f"Error executing actions: {e}")

def main():
    env = VCPEnvironment()
    agent = SimpleScriptAgent()
    
    logger.info("Starting VCP Game Loop...")
    
    try:
        while True:
            # 1. Observe
            obs = env.get_observation()
            if not obs:
                logger.warning("Failed to get observation, retrying...")
                time.sleep(1)
                continue
                
            # 2. Think
            actions = agent.act(obs)
            
            # 3. Act
            if actions:
                env.execute_actions(actions)
            
            # Loop rate control
            time.sleep(0.1)
            
    except KeyboardInterrupt:
        logger.info("Stopped by user.")

if __name__ == "__main__":
    main()
