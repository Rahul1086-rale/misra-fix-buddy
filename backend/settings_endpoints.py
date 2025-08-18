
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from session_manager import session_manager
import json
import os

router = APIRouter()

class ModelSettings(BaseModel):
    temperature: float
    top_p: float
    max_tokens: int
    model_name: str
    safety_settings: bool

@router.get("/api/settings")
async def get_settings(request: Request):
    """Get session-specific settings"""
    try:
        project_id = request.headers.get("X-Project-ID")
        if not project_id:
            # Try to get from query params as fallback
            project_id = request.query_params.get("project_id")
        
        if not project_id:
            raise HTTPException(status_code=400, detail="Project ID is required")
        
        session = session_manager.get_or_create_session(project_id)
        settings = session.get_settings()
        
        return settings
    except Exception as e:
        print(f"Error getting settings: {e}")
        raise HTTPException(status_code=500, detail="Failed to get settings")

@router.post("/api/settings")
async def save_settings(settings: ModelSettings, request: Request):
    """Save session-specific settings"""
    try:
        project_id = request.headers.get("X-Project-ID")
        if not project_id:
            # Try to get from query params as fallback
            project_id = request.query_params.get("project_id")
        
        if not project_id:
            raise HTTPException(status_code=400, detail="Project ID is required")
        
        session = session_manager.get_or_create_session(project_id)
        success = session.save_settings(settings.model_dump())
        
        if success:
            return {"message": "Settings saved successfully"}
        else:
            raise HTTPException(status_code=500, detail="Failed to save settings")
    except Exception as e:
        print(f"Error saving settings: {e}")
        raise HTTPException(status_code=500, detail="Failed to save settings")

@router.get("/api/session-state")
async def get_session_state(request: Request):
    """Get session state - placeholder for compatibility"""
    try:
        project_id = request.headers.get("X-Project-ID")
        if not project_id:
            project_id = request.query_params.get("project_id")
        
        if project_id:
            session = session_manager.get_session(project_id)
            if session:
                return session.data
        
        return {}
    except Exception as e:
        print(f"Error getting session state: {e}")
        return {}

@router.post("/api/session-state")
async def save_session_state(data: dict, request: Request):
    """Save session state - placeholder for compatibility"""
    try:
        project_id = request.headers.get("X-Project-ID")
        if not project_id:
            project_id = data.get("projectId")
        
        if project_id:
            session = session_manager.get_or_create_session(project_id)
            session.data.update(data)
            return {"message": "Session state saved"}
        
        return {"message": "No project ID provided"}
    except Exception as e:
        print(f"Error saving session state: {e}")
        raise HTTPException(status_code=500, detail="Failed to save session state")
