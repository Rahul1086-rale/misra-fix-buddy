# app.py - FastAPI Backend API Server
from fastapi import FastAPI, File, UploadFile, HTTPException, Form, Query, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import os
import uuid
import tempfile
import json
import asyncio
from pathlib import Path

# Import our Python modules
from misra_chat_client import init_vertex_ai, load_cpp_file, start_chat, send_file_intro, send_misra_violations
from excel_utils import extract_violations_for_file
from numbering import add_line_numbers
from denumbering import remove_line_numbers
from replace import merge_fixed_snippets_into_file
from fixed_response_code_snippet import extract_snippets_from_response, save_snippets_to_json
from diff_utils import create_temp_fixed_denumbered_file, get_file_content, create_diff_data, cleanup_temp_files
from diff_async_utils import create_diff_data_async, cleanup_temp_files_async
from database import db

app = FastAPI(
    title="MISRA Fix Copilot API",
    description="API for fixing MISRA violations in C/C++ code using AI",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure this properly for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global storage for sessions
sessions = {}
chat_sessions = {}

# Default model settings
default_model_settings = {
    "model_name": "gemini-2.5-pro",
    "temperature": 0.5,
    "top_p": 0.95,
    "max_tokens": 65535,
    "safety_settings": False
}

# Global model settings storage
model_settings = default_model_settings.copy()

# Configure upload settings
UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'cpp', 'c', 'xlsx', 'xls'}

if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

def allowed_file(filename: str) -> bool:
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# Pydantic models for request/response validation
class LineNumbersRequest(BaseModel):
    projectId: str

class FirstPromptRequest(BaseModel):
    projectId: str

class FixViolationsRequest(BaseModel):
    projectId: str
    violations: List[Dict[str, Any]] = []

class ApplyFixesRequest(BaseModel):
    projectId: str

class ChatRequest(BaseModel):
    message: str
    projectId: str

class ModelSettings(BaseModel):
    model_name: str
    temperature: float
    top_p: float
    max_tokens: int
    safety_settings: bool

class UploadResponse(BaseModel):
    filePath: str
    fileName: str

class ProcessResponse(BaseModel):
    numberedFilePath: str

class GeminiResponse(BaseModel):
    response: str

class FixViolationsResponse(BaseModel):
    response: str
    codeSnippets: List[Dict[str, Any]]

class ApplyFixesResponse(BaseModel):
    fixedFilePath: str

class ChatResponse(BaseModel):
    response: str

class SettingsResponse(BaseModel):
    success: bool
    message: str

class DiffResponse(BaseModel):
    original: str
    fixed: str
    has_changes: bool
    highlight: dict = {}
    review_data: dict = {}
    session_id: str = ""

class AcceptRejectRequest(BaseModel):
    projectId: str
    lineKey: str
    action: str  # 'accept' or 'reject'

class NavigationRequest(BaseModel):
    projectId: str
    direction: str  # 'next' or 'prev'
    currentLine: Optional[str] = None

class ReviewResponse(BaseModel):
    success: bool
    message: str
    next_line: Optional[str] = None
    review_data: dict = {}

# Initialize Vertex AI on startup
@app.on_event("startup")
async def startup_event():
    init_vertex_ai()

# Settings endpoints
@app.get("/api/settings", response_model=ModelSettings)
async def get_settings():
    """Get current model settings"""
    return ModelSettings(**model_settings)

@app.post("/api/settings", response_model=SettingsResponse)
async def save_settings(settings: ModelSettings):
    """Save model settings"""
    try:
        global model_settings
        model_settings = settings.dict()
        
        # Optional: Save to file for persistence
        settings_file = os.path.join(UPLOAD_FOLDER, 'model_settings.json')
        with open(settings_file, 'w') as f:
            json.dump(model_settings, f, indent=2)
        
        return SettingsResponse(
            success=True,
            message="Settings saved successfully"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save settings: {str(e)}")

@app.post("/api/upload/cpp-file", response_model=UploadResponse)
async def upload_cpp_file(
    file: UploadFile = File(...),
    projectId: str = Form(...)
):
    try:
        if not file.filename:
            raise HTTPException(status_code=400, detail="No file selected")
        
        if not allowed_file(file.filename):
            raise HTTPException(status_code=400, detail="Invalid file type")
        
        # Save uploaded file
        filename = file.filename
        file_path = os.path.join(UPLOAD_FOLDER, f"{projectId}_{filename}")
        
        with open(file_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
        
        # Initialize session
        sessions[projectId] = {
            'cpp_file': file_path,
            'original_filename': filename
        }
        
        # Create database session
        await db.create_session(
            session_id=projectId,
            project_id=projectId,
            cpp_file_path=file_path,
            original_filename=filename
        )
        
        return UploadResponse(
            filePath=file_path,
            fileName=filename
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/upload/misra-report")
async def upload_misra_report(
    file: UploadFile = File(...),
    projectId: str = Form(...),
    targetFile: str = Form(...)
):
    try:
        if not file.filename:
            raise HTTPException(status_code=400, detail="No file selected")
        
        # Save Excel file
        filename = file.filename
        excel_path = os.path.join(UPLOAD_FOLDER, f"{projectId}_report_{filename}")
        
        with open(excel_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
        
        # Extract violations
        violations = extract_violations_for_file(excel_path, targetFile)
        
        # Store in session
        if projectId in sessions:
            sessions[projectId]['excel_file'] = excel_path
            sessions[projectId]['violations'] = violations
            
            # Update database session
            await db.update_session(
                projectId, 
                excel_file_path=excel_path, 
                violations=violations
            )
        
        return violations
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/process/add-line-numbers", response_model=ProcessResponse)
async def process_add_line_numbers(request: LineNumbersRequest):
    try:
        project_id = request.projectId
        
        if project_id not in sessions:
            raise HTTPException(status_code=404, detail="Project not found")
        
        session = sessions[project_id]
        input_file = session['cpp_file']
        
        # Create numbered file with .txt extension
        original_name = Path(session['original_filename']).stem
        numbered_filename = f"numbered_{original_name}.txt"
        numbered_path = os.path.join(UPLOAD_FOLDER, f"{project_id}_{numbered_filename}")
        
        add_line_numbers(input_file, numbered_path)
        
        # Update session
        sessions[project_id]['numbered_file'] = numbered_path
        
        # Update database session
        await db.update_session(project_id, numbered_file_path=numbered_path)
        
        return ProcessResponse(numberedFilePath=numbered_path)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/gemini/first-prompt", response_model=GeminiResponse)
async def gemini_first_prompt(request: FirstPromptRequest):
    try:
        project_id = request.projectId
        
        if project_id not in sessions:
            raise HTTPException(status_code=404, detail="Project not found")
        
        session = sessions[project_id]
        numbered_file = session['numbered_file']
        
        # Load numbered file content
        numbered_content = load_cpp_file(numbered_file)
        
        # Start chat session with current model settings
        chat = start_chat(
            model_name=model_settings['model_name'],
            temperature=model_settings['temperature'],
            top_p=model_settings['top_p'],
            max_tokens=model_settings['max_tokens'],
            safety_settings=model_settings['safety_settings']
        )
        
        # Send first prompt
        response = send_file_intro(chat, numbered_content)
        
        # Check if response is None (blocked by safety filters)
        if response is None:
            raise HTTPException(
                status_code=422, 
                detail="Response was blocked by safety filters. Please try with different content or contact support."
            )
        
        # Store chat session
        chat_sessions[project_id] = chat
        
        return GeminiResponse(response=response)
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

import logging
import traceback

@app.post("/api/gemini/fix-violations", response_model=FixViolationsResponse)
async def gemini_fix_violations(request: FixViolationsRequest):
    try:
        project_id = request.projectId
        violations = request.violations
        
        print(f"Processing project_id: {project_id}")  # Debug
        print(f"Number of violations: {len(violations)}")  # Debug
        
        if project_id not in chat_sessions:
            raise HTTPException(status_code=404, detail="Chat session not found")
        
        chat = chat_sessions[project_id]
        
        # Format violations for Gemini
        violations_text = []
        for v in violations:
            violations_text.append(
                f"File: {v['file']}\n"
                f"Path: {v['path']}\n"
                f"Line: {v['line']}\n"
                f"Rule: {v['misra']}\n"
                f"Message: {v['warning']}\n"
            )
        
        violations_str = "\n".join(violations_text)
        print(f"Formatted violations length: {len(violations_str)}")  # Debug
        
        # Send to Gemini
        print("Sending to Gemini...")  # Debug
        response = send_misra_violations(chat, violations_str)
        print(f"Gemini response received: {response is not None}")  # Debug
        
        # Check if response is None (blocked by safety filters)
        if response is None:
            raise HTTPException(
                status_code=422, 
                detail="Response was blocked by safety filters. Please try with different content or contact support."
            )
        
        # Extract code snippets
        print("Extracting snippets...")  # Debug
        code_snippets = extract_snippets_from_response(response)
        print(f"Extracted {len(code_snippets)} snippets")  # Debug
        
        # Save snippets to session
        if project_id in sessions:
            print("Saving snippets to session...")  # Debug
            sessions[project_id]['fixed_snippets'] = code_snippets
            snippet_file = os.path.join(UPLOAD_FOLDER, f"{project_id}_snippets.json")
            save_snippets_to_json(code_snippets, snippet_file)
            sessions[project_id]['snippet_file'] = snippet_file
            print(f"Snippets saved to: {snippet_file}")  # Debug
            
            # Update database session
            await db.update_session(project_id, fixed_snippets=code_snippets)
            
            # Create temporary fixed files for immediate diff view
            try:
                session = sessions[project_id]
                numbered_file = session.get('numbered_file')
                if numbered_file:
                    temp_fixed_numbered_path, temp_fixed_denumbered_path = create_temp_fixed_denumbered_file(
                        numbered_file, code_snippets, project_id, UPLOAD_FOLDER
                    )
                    session['temp_fixed_numbered'] = temp_fixed_numbered_path
                    session['temp_fixed_denumbered'] = temp_fixed_denumbered_path
                    
                    # Update database with temp file paths
                    await db.update_session(
                        project_id,
                        temp_fixed_numbered_path=temp_fixed_numbered_path,
                        temp_fixed_denumbered_path=temp_fixed_denumbered_path
                    )
                    print(f"Created temporary fixed files for project {project_id}")
            except Exception as e:
                print(f"Error creating temporary fixed files: {str(e)}")
        
        return FixViolationsResponse(
            response=response,
            codeSnippets=[{"code": snippet} for snippet in code_snippets.values()]
        )
        
    except HTTPException:
        raise
    except Exception as e:
        # Add detailed error logging
        print(f"Error in gemini_fix_violations: {str(e)}")
        print(f"Error type: {type(e)}")
        print(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")

@app.post("/api/process/apply-fixes", response_model=ApplyFixesResponse)
async def process_apply_fixes(request: ApplyFixesRequest):
    try:
        project_id = request.projectId
        
        if project_id not in sessions:
            raise HTTPException(status_code=404, detail="Project not found")
        
        session = sessions[project_id]
        numbered_file = session['numbered_file']
        fixed_snippets = session.get('fixed_snippets', {})
        
        # Apply fixes
        fixed_filename = f"fixed_{session['original_filename']}"
        fixed_numbered_path = os.path.join(UPLOAD_FOLDER, f"{project_id}_fixed_numbered_{session['original_filename']}")
        
        merge_fixed_snippets_into_file(numbered_file, fixed_snippets, fixed_numbered_path)
        
        # Remove line numbers for final file
        final_fixed_path = os.path.join(UPLOAD_FOLDER, f"{project_id}_{fixed_filename}")
        remove_line_numbers(fixed_numbered_path, final_fixed_path)
        
        # Update session
        sessions[project_id]['fixed_file'] = final_fixed_path
        
        return ApplyFixesResponse(fixedFilePath=final_fixed_path)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/download/fixed-file")
async def download_fixed_file(projectId: str = Query(...)):
    try:
        if projectId not in sessions:
            raise HTTPException(status_code=404, detail="Project not found")
        
        session = sessions[projectId]
        fixed_file = session.get('fixed_file')
        
        if not fixed_file or not os.path.exists(fixed_file):
            raise HTTPException(status_code=404, detail="Fixed file not found")
        
        return FileResponse(
            path=fixed_file,
            filename=f"fixed_{session['original_filename']}",
            media_type='application/octet-stream'
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    try:
        message = request.message
        project_id = request.projectId
        
        if project_id not in chat_sessions:
            raise HTTPException(status_code=404, detail="Chat session not found")
        
        chat_session = chat_sessions[project_id]
        
        # Send message to Gemini
        response = chat_session.send_message(message)
        
        # Check if response is None or blocked
        if response is None or response.text is None:
            raise HTTPException(
                status_code=422, 
                detail="Response was blocked by safety filters. Please try rephrasing your message."
            )
        
        # Extract code snippets from response and save to session
        if project_id in sessions:
            print("Extracting snippets from chat response...")  # Debug
            code_snippets = extract_snippets_from_response(response.text)
            print(f"Extracted {len(code_snippets)} snippets from chat")  # Debug
            
            # Save snippets to session (same as fix-violations endpoint)
            sessions[project_id]['fixed_snippets'] = code_snippets
            snippet_file = os.path.join(UPLOAD_FOLDER, f"{project_id}_snippets.json")
            save_snippets_to_json(code_snippets, snippet_file)
            sessions[project_id]['snippet_file'] = snippet_file
            print(f"Chat snippets saved to: {snippet_file}")  # Debug
            
            # Update temporary fixed file for real-time diff view
            try:
                session = sessions[project_id]
                numbered_file = session.get('numbered_file')
                if numbered_file:
                    temp_fixed_numbered_path, temp_fixed_denumbered_path = create_temp_fixed_denumbered_file(
                        numbered_file, code_snippets, project_id, UPLOAD_FOLDER
                    )
                    session['temp_fixed_numbered'] = temp_fixed_numbered_path
                    session['temp_fixed_denumbered'] = temp_fixed_denumbered_path
                    print(f"Updated temporary fixed files for project {project_id}")
            except Exception as e:
                print(f"Error updating temporary fixed files: {str(e)}")
        
        return ChatResponse(response=response.text)
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/session-state")
async def get_session_state():
    # Return empty state for now
    return {}

@app.post("/api/session-state")
async def save_session_state():
    # For now, just return success
    return {"success": True}

# New diff endpoints for Fix View Modal
@app.get("/api/files/numbered/{project_id}")
async def get_numbered_file(project_id: str):
    """Get numbered file content"""
    try:
        if project_id not in sessions:
            raise HTTPException(status_code=404, detail="Project not found")
        
        session = sessions[project_id]
        numbered_file = session.get('numbered_file')
        
        if not numbered_file or not os.path.exists(numbered_file):
            raise HTTPException(status_code=404, detail="Numbered file not found")
        
        content = get_file_content(numbered_file)
        if content is None:
            raise HTTPException(status_code=500, detail="Failed to read numbered file")
        
        return content
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/files/temp-fixed/{project_id}")
async def get_temp_fixed_file(project_id: str):
    """Get temporary fixed file content"""
    try:
        if project_id not in sessions:
            raise HTTPException(status_code=404, detail="Project not found")
        
        session = sessions[project_id]
        
        # Get existing temp fixed file path if it exists
        temp_fixed_numbered_path = session.get('temp_fixed_numbered')
        
        if not temp_fixed_numbered_path or not os.path.exists(temp_fixed_numbered_path):
            # If temp file doesn't exist, create it
            fixed_snippets = session.get('fixed_snippets', {})
            numbered_file = session.get('numbered_file')
            
            if not numbered_file:
                raise HTTPException(status_code=404, detail="Numbered file not found")
            
            temp_fixed_numbered_path, temp_fixed_denumbered_path = create_temp_fixed_denumbered_file(
                numbered_file, fixed_snippets, project_id, UPLOAD_FOLDER
            )
            
            # Store paths in session
            session['temp_fixed_numbered'] = temp_fixed_numbered_path
            session['temp_fixed_denumbered'] = temp_fixed_denumbered_path
        
        # Return the fixed numbered content (with line numbers for diff view)
        content = get_file_content(temp_fixed_numbered_path)
        if content is None:
            raise HTTPException(status_code=500, detail="Failed to read temporary fixed file")
        
        return content
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/diff/{project_id}", response_model=DiffResponse)
async def get_diff(project_id: str, only_accepted: bool = False):
    """Get diff between original and fixed files with review data"""
    try:
        # Use async diff utilities with database integration
        diff_data = await create_diff_data_async(
            project_id=project_id, 
            only_accepted=only_accepted
        )
        
        return DiffResponse(**diff_data)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# New accept/reject endpoints
@app.post("/api/review/accept-reject", response_model=ReviewResponse)
async def accept_reject_change(request: AcceptRejectRequest):
    """Accept or reject a specific code change"""
    try:
        project_id = request.projectId
        line_key = request.lineKey
        action = request.action
        
        # Get session from database
        session = await db.get_session_by_project(project_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        session_id = session['session_id']
        
        # Perform accept/reject action
        if action == 'accept':
            success = await db.accept_change(session_id, line_key)
            message = f"Change at line {line_key} accepted"
        elif action == 'reject':
            success = await db.reject_change(session_id, line_key)
            message = f"Change at line {line_key} rejected"
        else:
            raise HTTPException(status_code=400, detail="Invalid action. Must be 'accept' or 'reject'")
        
        if not success:
            raise HTTPException(status_code=500, detail="Failed to update change status")
        
        # Get next line to review
        next_line = await db.get_next_fix_line(session_id)
        
        # Get updated review data
        updated_session = await db.get_session(session_id)
        accepted_changes = updated_session['accepted_changes']
        rejected_changes = updated_session['rejected_changes']
        all_snippets = updated_session['fixed_snippets']
        reviewed_changes = set(accepted_changes + rejected_changes)
        
        review_data = {
            "pending_changes": [
                line_key for line_key in all_snippets.keys() 
                if line_key not in reviewed_changes
            ],
            "accepted_changes": accepted_changes,
            "rejected_changes": rejected_changes,
            "current_line": next_line,
            "total_changes": len(all_snippets),
            "reviewed_count": len(reviewed_changes)
        }
        
        return ReviewResponse(
            success=True,
            message=message,
            next_line=next_line,
            review_data=review_data
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/review/navigate", response_model=ReviewResponse)
async def navigate_changes(request: NavigationRequest):
    """Navigate to next or previous change"""
    try:
        project_id = request.projectId
        direction = request.direction
        current_line = request.currentLine
        
        # Get session from database
        session = await db.get_session_by_project(project_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        session_id = session['session_id']
        
        if direction == 'next':
            next_line = await db.get_next_fix_line(session_id)
            message = "Moved to next change" if next_line else "No more changes to review"
        elif direction == 'prev':
            next_line = await db.get_prev_fix_line(session_id, current_line or "")
            message = "Moved to previous change" if next_line else "No previous changes"
        else:
            raise HTTPException(status_code=400, detail="Invalid direction. Must be 'next' or 'prev'")
        
        # Get review data
        accepted_changes = session['accepted_changes']
        rejected_changes = session['rejected_changes']
        all_snippets = session['fixed_snippets']
        reviewed_changes = set(accepted_changes + rejected_changes)
        
        review_data = {
            "pending_changes": [
                line_key for line_key in all_snippets.keys() 
                if line_key not in reviewed_changes
            ],
            "accepted_changes": accepted_changes,
            "rejected_changes": rejected_changes,
            "current_line": next_line,
            "total_changes": len(all_snippets),
            "reviewed_count": len(reviewed_changes)
        }
        
        return ReviewResponse(
            success=True,
            message=message,
            next_line=next_line,
            review_data=review_data
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/process/apply-accepted-fixes", response_model=ApplyFixesResponse)
async def process_apply_accepted_fixes(request: ApplyFixesRequest):
    """Apply only accepted fixes to create final file"""
    try:
        project_id = request.projectId
        
        # Get session from database  
        session = await db.get_session_by_project(project_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        numbered_file = session.get('numbered_file_path')
        if not numbered_file:
            raise HTTPException(status_code=404, detail="Numbered file not found")
        
        # Get only accepted snippets
        accepted_snippets = await db.get_filtered_snippets(session['session_id'])
        
        # Apply only accepted fixes
        fixed_filename = f"fixed_{session['original_filename']}"
        fixed_numbered_path = os.path.join(UPLOAD_FOLDER, f"{project_id}_fixed_numbered_{session['original_filename']}")
        
        merge_fixed_snippets_into_file(numbered_file, accepted_snippets, fixed_numbered_path)
        
        # Remove line numbers for final file
        final_fixed_path = os.path.join(UPLOAD_FOLDER, f"{project_id}_{fixed_filename}")
        remove_line_numbers(fixed_numbered_path, final_fixed_path)
        
        # Update legacy session for compatibility
        if project_id in sessions:
            sessions[project_id]['fixed_file'] = final_fixed_path
        
        return ApplyFixesResponse(fixedFilePath=final_fixed_path)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Health check endpoint
@app.get("/health")
async def health_check():
    return {"status": "healthy"}

# Root endpoint
@app.get("/")
async def root():
    return {"message": "MISRA Fix Copilot API Server is running"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)