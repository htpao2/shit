from abc import ABC, abstractmethod
from typing import Dict, Any, List

class BaseActionModel(ABC):
    """
    Abstract base class for all action models.
    """
    
    def __init__(self, config: Dict[str, Any] = None):
        self.config = config or {}

    @abstractmethod
    def predict(self, command: str, state: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Predict the next sequence of actions based on command and state.
        
        Args:
            command (str): High-level command (e.g., "move_forward")
            state (Dict): Current game state (from Observer)
            
        Returns:
            List[Dict]: List of low-level actions (e.g., [{'type': 'keydown', 'key': 'w'}])
        """
        pass
