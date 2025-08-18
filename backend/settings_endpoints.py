
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
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
    projectId: Optional[str] = None

@router.post("/api/settings")
async def save_settings(settings: ModelSettings):
    """Save model settings for a specific session"""
    try:
        project_id = settings.projectId or "default"
        
        # Get or create session
        session = session_manager.get_or_create_session(project_id)
        
        # Convert to dict and remove projectId
        settings_dict = settings.dict()
        settings_dict.pop('projectId', None)
        
        # Save to session
        session.set_model_settings(settings_dict)
        
        return {"success": True, "message": "Settings saved successfully"}
    
    except Exception as e:
        print(f"Error saving settings: {e}")
        raise HTTPException(status_code=500, detail="Failed to save settings")

@router.get("/api/settings/{project_id}")
async def get_settings(project_id: str):
    """Get model settings for a specific session"""
    try:
        session = session_manager.get_session(project_id)
        
        if session:
            settings = session.get_model_settings()
        else:
            # Return default settings if session doesn't exist
            settings = {
                "temperature": 0.5,
                "top_p": 0.95,
                "max_tokens": 65535,
                "model_name": "gemini-1.5-flash",
                "safety_settings": False
            }
        
        return {"success": True, "data": settings}
    
    except Exception as e:
        print(f"Error getting settings: {e}")
        raise HTTPException(status_code=500, detail="Failed to get settings")

@router.get("/api/settings")
async def get_default_settings():
    """Get default settings"""
    try:
        settings = {
            "temperature": 0.5,
            "top_p": 0.95,
            "max_tokens": 65535,
            "model_name": "gemini-1.5-flash",
            "safety_settings": False
        }
        
        return {"success": True, "data": settings}
    
    except Exception as e:
        print(f"Error getting default settings: {e}")
        raise HTTPException(status_code=500, detail="Failed to get default settings")
