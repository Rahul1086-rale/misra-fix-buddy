
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
from pathlib import Path
import asyncio
import concurrent.futures
import threading

# Import our Python modules
from misra_chat_client import init_vertex_ai, load_cpp_file, start_chat, send_file_intro, send_misra_violations
from excel_utils import extract_violations_for_file
from numbering import add_line_numbers
from denumbering import remove_line_numbers
from replace import merge_fixed_snippets_into_file
from fixed_response_code_snippet import extract_snippets_from_response, save_snippets_to_json, extract_violation_mapping, save_violation_mapping_to_json
from diff_utils import create_temp_fixed_denumbered_file, get_file_content, create_diff_data, cleanup_temp_files
from review_manager import ReviewManager
from session_manager import session_manager
from auth_endpoints import router as auth_router
from auth_db import setup_default_users

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

# Include authentication router
app.include_router(auth_router)

# ... keep existing code (default model settings, upload settings, thread pool, allowed_file function, Pydantic models) the same ...

# Default model settings
default_model_settings = {
    "model_name": "gemini-2.5-pro",
    "temperature": 0.5,
    "top_p": 0.95,
    "max_tokens": 65535,
    "safety_settings": False
}

# Configure upload settings
UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'cpp', 'c', 'xlsx', 'xls'}

if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

# Thread pool for concurrent processing
executor = concurrent.futures.ThreadPoolExecutor(max_workers=10)

def allowed_file(filename: str) -> bool:
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

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

class ReviewActionRequest(BaseModel):
    projectId: str
    line_key: str
    action: str

class NavigationRequest(BaseModel):
    projectId: str
    index: int

class ReviewStateResponse(BaseModel):
    fixes: List[Dict[str, Any]]
    summary: Dict[str, Any]

# Initialize Vertex AI and setup database on startup
@app.on_event("startup")
async def startup_event():
    init_vertex_ai()
    setup_default_users()

# ... keep existing code (all other endpoints remain the same) ...

@app.get("/api/settings", response_model=ModelSettings)
async def get_settings(username: str = Query(...)):
    """Get current model settings for a specific user"""
    try:
        # Try to load user-specific settings
        user_settings_file = os.path.join(UPLOAD_FOLDER, f'{username}_model_setting.json')
        
        if os.path.exists(user_settings_file):
            with open(user_settings_file, 'r') as f:
                user_settings = json.load(f)
                return ModelSettings(**user_settings)
        else:
            # Return default settings if user-specific file doesn't exist
            return ModelSettings(**default_model_settings)
    except Exception as e:
        # Fallback to default settings on any error
        return ModelSettings(**default_model_settings)

@app.post("/api/settings", response_model=SettingsResponse)
async def save_settings(settings: ModelSettings, username: str = Query(...)):
    """Save model settings for a specific user"""
    try:
        # Save to user-specific file
        user_settings_file = os.path.join(UPLOAD_FOLDER, f'{username}_model_setting.json')
        with open(user_settings_file, 'w') as f:
            json.dump(settings.dict(), f, indent=2)
        
        return SettingsResponse(
            success=True,
            message="Settings saved successfully"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save settings: {str(e)}")

@app.delete("/api/settings", response_model=SettingsResponse)
async def delete_settings(username: str = Query(...)):
    """Delete user-specific model settings file"""
    try:
        user_settings_file = os.path.join(UPLOAD_FOLDER, f'{username}_model_setting.json')
        
        if os.path.exists(user_settings_file):
            os.remove(user_settings_file)
            return SettingsResponse(
                success=True,
                message="User settings deleted successfully"
            )
        else:
            return SettingsResponse(
                success=True,
                message="No user-specific settings found to delete"
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete settings: {str(e)}")

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
        
        # Get or create session
        session = session_manager.get_or_create_session(projectId)
        
        # Save uploaded file
        filename = file.filename
        file_path = os.path.join(UPLOAD_FOLDER, f"{projectId}_{filename}")
        
        with open(file_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
        
        # Store in session
        session.set_data('cpp_file', file_path)
        session.set_data('original_filename', filename)
        
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
        
        # Get session
        session = session_manager.get_or_create_session(projectId)
        
        # Save Excel file
        filename = file.filename
        excel_path = os.path.join(UPLOAD_FOLDER, f"{projectId}_report_{filename}")
        
        with open(excel_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
        
        # Extract violations
        violations = extract_violations_for_file(excel_path, targetFile)
        
        # Store in session
        session.set_data('excel_file', excel_path)
        session.set_data('violations', violations)
        
        return violations
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/process/add-line-numbers", response_model=ProcessResponse)
async def process_add_line_numbers(request: LineNumbersRequest):
    try:
        project_id = request.projectId
        session = session_manager.get_session(project_id)
        
        if not session:
            raise HTTPException(status_code=404, detail="Project not found")
        
        input_file = session.get_data('cpp_file')
        if not input_file:
            raise HTTPException(status_code=404, detail="No file found for project")
        
        # Create numbered file with .txt extension
        original_name = Path(session.get_data('original_filename', 'file.cpp')).stem
        numbered_filename = f"numbered_{original_name}.txt"
        numbered_path = os.path.join(UPLOAD_FOLDER, f"{project_id}_{numbered_filename}")
        
        add_line_numbers(input_file, numbered_path)
        
        # Update session
        session.set_data('numbered_file', numbered_path)
        
        return ProcessResponse(numberedFilePath=numbered_path)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/gemini/first-prompt", response_model=GeminiResponse)
async def gemini_first_prompt(request: FirstPromptRequest):
    try:
        project_id = request.projectId
        session = session_manager.get_session(project_id)
        
        if not session:
            raise HTTPException(status_code=404, detail="Project not found")
        
        numbered_file = session.get_data('numbered_file')
        if not numbered_file:
            raise HTTPException(status_code=404, detail="Numbered file not found")
        
        # Load numbered file content
        numbered_content = load_cpp_file(numbered_file)
        
        # Start chat session with current model settings
        chat = start_chat(
            model_name=default_model_settings['model_name'],
            temperature=default_model_settings['temperature'],
            top_p=default_model_settings['top_p'],
            max_tokens=default_model_settings['max_tokens'],
            safety_settings=default_model_settings['safety_settings']
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
        session.set_chat_session(chat)
        
        return GeminiResponse(response=response)
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def process_violations_sync(project_id: str, violations: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Synchronous function to process violations - runs in thread pool"""
    try:
        session = session_manager.get_session(project_id)
        if not session:
            raise Exception("Project not found")
        
        chat = session.get_chat_session()
        if not chat:
            raise Exception("Chat session not found")
        
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
        print(f"Processing {len(violations)} violations for project {project_id}")
        
        # Send to Gemini
        response = send_misra_violations(chat, violations_str)
        
        if response is None:
            raise Exception("Response was blocked by safety filters")
        
        # Extract code snippets
        code_snippets = extract_snippets_from_response(response)
        
        # Extract violation mapping
        violation_mapping = {}
        try:
            violation_mapping = extract_violation_mapping(response)
        except Exception as e:
            print(f"Warning: Could not extract violation mapping: {str(e)}")
        
        # Save snippets to session
        session.set_data('fixed_snippets', code_snippets)
        session.set_data('violation_mapping', violation_mapping)
        
        snippet_file = os.path.join(UPLOAD_FOLDER, f"{project_id}_snippets.json")
        violation_mapping_file = os.path.join(UPLOAD_FOLDER, f"{project_id}_violation_mapping.json")
        
        save_snippets_to_json(code_snippets, snippet_file)
        save_violation_mapping_to_json(violation_mapping, violation_mapping_file)
        
        session.set_data('snippet_file', snippet_file)
        session.set_data('violation_mapping_file', violation_mapping_file)
        
        # Create temporary fixed files for immediate diff view
        numbered_file = session.get_data('numbered_file')
        if numbered_file:
            temp_fixed_numbered_path, temp_fixed_denumbered_path = create_temp_fixed_denumbered_file(
                numbered_file, code_snippets, project_id, UPLOAD_FOLDER
            )
            session.set_data('temp_fixed_numbered', temp_fixed_numbered_path)
            session.set_data('temp_fixed_denumbered', temp_fixed_denumbered_path)
        
        return {
            'response': response,
            'code_snippets': code_snippets
        }
        
    except Exception as e:
        print(f"Error processing violations for project {project_id}: {str(e)}")
        raise e

@app.post("/api/gemini/fix-violations", response_model=FixViolationsResponse)
async def gemini_fix_violations(request: FixViolationsRequest):
    try:
        project_id = request.projectId
        violations = request.violations
        
        print(f"Starting async violation processing for project {project_id}")
        
        # Process violations in thread pool for true concurrency
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            executor, 
            process_violations_sync, 
            project_id, 
            violations
        )
        
        return FixViolationsResponse(
            response=result['response'],
            codeSnippets=[{"code": snippet} for snippet in result['code_snippets'].values()]
        )
        
    except Exception as e:
        print(f"Error in gemini_fix_violations: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")

# ... keep existing code (all remaining endpoints remain exactly the same) ...

@app.post("/api/process/apply-fixes", response_model=ApplyFixesResponse)
async def process_apply_fixes(request: ApplyFixesRequest):
    try:
        project_id = request.projectId
        session = session_manager.get_session(project_id)
        
        if not session:
            raise HTTPException(status_code=404, detail="Project not found")
        
        numbered_file = session.get_data('numbered_file')
        fixed_snippets = session.get_data('fixed_snippets', {})
        original_filename = session.get_data('original_filename', 'file.cpp')
        
        # Apply fixes
        fixed_filename = f"fixed_{original_filename}"
        fixed_numbered_path = os.path.join(UPLOAD_FOLDER, f"{project_id}_fixed_numbered_{original_filename}")
        
        merge_fixed_snippets_into_file(numbered_file, fixed_snippets, fixed_numbered_path)
        
        # Remove line numbers for final file
        final_fixed_path = os.path.join(UPLOAD_FOLDER, f"{project_id}_{fixed_filename}")
        remove_line_numbers(fixed_numbered_path, final_fixed_path)
        
        # Update session
        session.set_data('fixed_file', final_fixed_path)
        
        return ApplyFixesResponse(fixedFilePath=final_fixed_path)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/download/fixed-file")
async def download_fixed_file(projectId: str = Query(...)):
    try:
        session = session_manager.get_session(projectId)
        if not session:
            raise HTTPException(status_code=404, detail="Project not found")
        
        fixed_file = session.get_data('fixed_file')
        original_filename = session.get_data('original_filename', 'file.cpp')
        
        if not fixed_file or not os.path.exists(fixed_file):
            raise HTTPException(status_code=404, detail="Fixed file not found")
        
        return FileResponse(
            path=fixed_file,
            filename=f"fixed_{original_filename}",
            media_type='application/octet-stream'
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def process_chat_message_sync(project_id: str, message: str) -> str:
    """Synchronous chat processing - runs in thread pool"""
    try:
        session = session_manager.get_session(project_id)
        if not session:
            raise Exception("Project not found")
        
        chat_session = session.get_chat_session()
        if not chat_session:
            raise Exception("Chat session not found")
        
        # Send message to Gemini
        response = chat_session.send_message(message)
        
        # Check if response is None or blocked
        if response is None or response.text is None:
            raise Exception("Response was blocked by safety filters")
        
        # Extract code snippets from response and save to session
        code_snippets = extract_snippets_from_response(response.text)
        
        # Save snippets to session (same as fix-violations endpoint)
        session.set_data('fixed_snippets', code_snippets)
        snippet_file = os.path.join(UPLOAD_FOLDER, f"{project_id}_snippets.json")
        save_snippets_to_json(code_snippets, snippet_file)
        session.set_data('snippet_file', snippet_file)
        
        # Update temporary fixed file for real-time diff view
        numbered_file = session.get_data('numbered_file')
        if numbered_file:
            temp_fixed_numbered_path, temp_fixed_denumbered_path = create_temp_fixed_denumbered_file(
                numbered_file, code_snippets, project_id, UPLOAD_FOLDER
            )
            session.set_data('temp_fixed_numbered', temp_fixed_numbered_path)
            session.set_data('temp_fixed_denumbered', temp_fixed_denumbered_path)
        
        return response.text
        
    except Exception as e:
        raise e

@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    try:
        message = request.message
        project_id = request.projectId
        
        print(f"Starting async chat processing for project {project_id}")
        
        # Process chat message in thread pool for concurrency
        loop = asyncio.get_event_loop()
        response_text = await loop.run_in_executor(
            executor, 
            process_chat_message_sync, 
            project_id, 
            message
        )
        
        return ChatResponse(response=response_text)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/session-state")
async def get_session_state():
    return {}

@app.post("/api/session-state")
async def save_session_state():
    return {"success": True}

@app.get("/api/files/numbered/{project_id}")
async def get_numbered_file(project_id: str):
    try:
        session = session_manager.get_session(project_id)
        if not session:
            raise HTTPException(status_code=404, detail="Project not found")
        
        numbered_file = session.get_data('numbered_file')
        
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
    try:
        session = session_manager.get_session(project_id)
        if not session:
            raise HTTPException(status_code=404, detail="Project not found")
        
        temp_fixed_numbered_path = session.get_data('temp_fixed_numbered')
        
        if not temp_fixed_numbered_path or not os.path.exists(temp_fixed_numbered_path):
            fixed_snippets = session.get_data('fixed_snippets', {})
            numbered_file = session.get_data('numbered_file')
            
            if not numbered_file:
                raise HTTPException(status_code=404, detail="Numbered file not found")
            
            temp_fixed_numbered_path, temp_fixed_denumbered_path = create_temp_fixed_denumbered_file(
                numbered_file, fixed_snippets, project_id, UPLOAD_FOLDER
            )
            
            session.set_data('temp_fixed_numbered', temp_fixed_numbered_path)
            session.set_data('temp_fixed_denumbered', temp_fixed_denumbered_path)
        
        content = get_file_content(temp_fixed_numbered_path)
        if content is None:
            raise HTTPException(status_code=500, detail="Failed to read temporary fixed file")
        
        return content
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/diff/{project_id}", response_model=DiffResponse)
async def get_diff(project_id: str):
    try:
        session = session_manager.get_session(project_id)
        if not session:
            raise HTTPException(status_code=404, detail="Project not found")
        
        original_file = session.get_data('cpp_file')
        fixed_snippets = session.get_data('fixed_snippets', {})
        numbered_file = session.get_data('numbered_file')
        
        if not original_file or not numbered_file:
            raise HTTPException(status_code=404, detail="Required files not found")
        
        temp_fixed_numbered_path, temp_fixed_denumbered_path = create_temp_fixed_denumbered_file(
            numbered_file, fixed_snippets, project_id, UPLOAD_FOLDER
        )
        
        diff_data = create_diff_data(original_file, temp_fixed_denumbered_path, fixed_snippets)
        
        session.set_data('temp_fixed_numbered', temp_fixed_numbered_path)
        session.set_data('temp_fixed_denumbered', temp_fixed_denumbered_path)
        
        return DiffResponse(**diff_data)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# New Review Management Endpoints
@app.get("/api/review/state/{project_id}", response_model=ReviewStateResponse)
async def get_review_state(project_id: str):
    try:
        session = session_manager.get_session(project_id)
        if not session:
            raise HTTPException(status_code=404, detail="Project not found")
        
        fixed_snippets = session.get_data('fixed_snippets', {})
        
        review_manager = ReviewManager(project_id, UPLOAD_FOLDER)
        fixes = review_manager.get_fix_list(fixed_snippets)
        summary = review_manager.get_review_summary(fixed_snippets)
        
        return ReviewStateResponse(fixes=fixes, summary=summary)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/review/action")
async def review_action(request: ReviewActionRequest):
    try:
        project_id = request.projectId
        line_key = request.line_key
        action = request.action
        
        session = session_manager.get_session(project_id)
        if not session:
            raise HTTPException(status_code=404, detail="Project not found")
        
        review_manager = ReviewManager(project_id, UPLOAD_FOLDER)
        
        if action == "accept":
            review_manager.accept_line(line_key)
        elif action == "reject":
            review_manager.reject_line(line_key)
        elif action == "reset":
            review_manager.reset_line(line_key)
        else:
            raise HTTPException(status_code=400, detail="Invalid action")
        
        # Update temporary files with only accepted changes
        fixed_snippets = session.get_data('fixed_snippets', {})
        numbered_file = session.get_data('numbered_file')
        
        if numbered_file:
            accepted_snippets = review_manager.get_accepted_snippets(fixed_snippets)
            temp_fixed_numbered_path, temp_fixed_denumbered_path = create_temp_fixed_denumbered_file(
                numbered_file, accepted_snippets, project_id, UPLOAD_FOLDER
            )
            session.set_data('temp_fixed_numbered', temp_fixed_numbered_path)
            session.set_data('temp_fixed_denumbered', temp_fixed_denumbered_path)
        
        return {"success": True, "message": f"Line {line_key} {action}ed successfully"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/review/navigate")
async def navigate_review(request: NavigationRequest):
    try:
        project_id = request.projectId
        index = request.index
        
        session = session_manager.get_session(project_id)
        if not session:
            raise HTTPException(status_code=404, detail="Project not found")
        
        review_manager = ReviewManager(project_id, UPLOAD_FOLDER)
        review_manager.set_current_review_index(index)
        
        return {"success": True, "current_index": index}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/code-snippets/{project_id}")
async def get_code_snippets(project_id: str):
    try:
        session = session_manager.get_session(project_id)
        if not session:
            raise HTTPException(status_code=404, detail="Project not found")
        
        fixed_snippets = session.get_data('fixed_snippets', {})
        return fixed_snippets
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/violation-mapping/{project_id}")
async def get_violation_mapping(project_id: str):
    try:
        session = session_manager.get_session(project_id)
        if not session:
            raise HTTPException(status_code=404, detail="Project not found")
        
        violation_mapping = session.get_data('violation_mapping', {})
        return violation_mapping
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/review/reset/{project_id}")
async def reset_review(project_id: str):
    try:
        session = session_manager.get_session(project_id)
        if not session:
            raise HTTPException(status_code=404, detail="Project not found")
        
        review_manager = ReviewManager(project_id, UPLOAD_FOLDER)
        review_manager.reset_review()
        
        return {"success": True, "message": "Review state reset successfully"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/process/apply-accepted-fixes", response_model=ApplyFixesResponse)
async def process_apply_accepted_fixes(request: ApplyFixesRequest):
    try:
        project_id = request.projectId
        session = session_manager.get_session(project_id)
        
        if not session:
            raise HTTPException(status_code=404, detail="Project not found")
        
        numbered_file = session.get_data('numbered_file')
        all_fixed_snippets = session.get_data('fixed_snippets', {})
        original_filename = session.get_data('original_filename', 'file.cpp')
        
        # Get only accepted snippets
        review_manager = ReviewManager(project_id, UPLOAD_FOLDER)
        accepted_snippets = review_manager.get_accepted_snippets(all_fixed_snippets)
        
        # Apply only accepted fixes
        fixed_filename = f"fixed_{original_filename}"
        fixed_numbered_path = os.path.join(UPLOAD_FOLDER, f"{project_id}_fixed_numbered_{original_filename}")
        
        merge_fixed_snippets_into_file(numbered_file, accepted_snippets, fixed_numbered_path)
        
        # Remove line numbers for final file
        final_fixed_path = os.path.join(UPLOAD_FOLDER, f"{project_id}_{fixed_filename}")
        remove_line_numbers(fixed_numbered_path, final_fixed_path)
        
        # Update session
        session.set_data('fixed_file', final_fixed_path)
        
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
