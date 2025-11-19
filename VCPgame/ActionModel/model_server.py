import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import logging

# Import executor
from input_executor.keyboard_mouse import InputExecutor

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ActionModelServer")

app = FastAPI(title="VCP Action Model Server")
executor = InputExecutor(use_direct_input=True)

class ActionRequest(BaseModel):
    command: str
    parameters: Dict[str, Any]

class ExecutionResult(BaseModel):
    status: str
    actions: Optional[List[Dict[str, Any]]] = None
    error: Optional[str] = None
    confidence: float = 1.0

@app.post("/execute_action", response_model=ExecutionResult)
async def execute_action(request: ActionRequest):
    """
    Execute a high-level command by converting it to low-level inputs.
    Currently acts as a bridge/interpreter.
    """
    logger.info(f"Received command: {request.command} with params: {request.parameters}")
    
    try:
        # In a real model scenario, this would feed the command + state to a neural net.
        # For now, we just map high-level commands to executor calls (similar to the script logic, but server-side).
        # Ideally, the GameController sends raw actions or the Model generates them.
        
        # If the request contains raw actions (bypass mode)
        if request.command == "raw_actions":
            actions = request.parameters.get("actions", [])
            for action in actions:
                executor.execute(action['type'], **action)
            return ExecutionResult(status="success", actions=actions)

        # Placeholder for model inference
        # actions = model.predict(request.command, request.parameters)
        
        return ExecutionResult(status="success", actions=[], confidence=1.0)

    except Exception as e:
        logger.error(f"Execution failed: {e}")
        return ExecutionResult(status="error", error=str(e))

@app.get("/health")
async def health_check():
    return {"status": "ok"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=5000)
