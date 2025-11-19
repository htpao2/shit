from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Dict, Any, List, Optional
import numpy as np

@dataclass
class Observation:
    """
    Standardized observation from the environment.
    """
    timestamp: str
    screenshot_path: Optional[str] = None
    screenshot_base64: Optional[str] = None
    window_info: Dict[str, Any] = field(default_factory=dict)
    recognized_text: Dict[str, str] = field(default_factory=dict)
    detected_objects: List[Dict[str, Any]] = field(default_factory=list)
    
    # Future: Audio, etc.

@dataclass
class Action:
    """
    Standardized action to be executed.
    """
    type: str  # 'move', 'click', 'keypress', 'text', 'wait'
    parameters: Dict[str, Any] = field(default_factory=dict)
    description: Optional[str] = None

class Agent(ABC):
    """
    Abstract base class for VCP Agents (including SIMA2).
    """
    
    @abstractmethod
    def act(self, observation: Observation) -> List[Action]:
        """
        Decide on actions based on the current observation.
        """
        pass

    @abstractmethod
    def reset(self):
        """
        Reset agent state.
        """
        pass
