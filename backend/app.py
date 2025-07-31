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

# Import our Python modules
from misra_chat_client import init_vertex_ai, load_cpp_file, start_chat, send_file_intro, send_misra_violations
from excel_utils import extract_violations_for_file
from numbering import add_line_numbers
from denumbering import remove_line_numbers
from replace import merge_fixed_snippets_into_file
from fixed_response_code_snippet import extract_snippets_from_response, save_snippets_to_json
from diff_utils import create_temp_fixed_denumbered_file, get_file_content, create_diff_data, cleanup_temp_files
from review_manager import ReviewManager

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

# Initialize Vertex AI on startup
print("Initializing Vertex AI...")
init_vertex_ai()
print("✅ Vertex AI initialized successfully!")

@app.post("/api/upload", response_model=UploadResponse)
async def upload_file(file: UploadFile = File(...)):
    try:
        # Validate file extension
        if not allowed_file(file.filename):
            raise HTTPException(status_code=400, detail="Invalid file extension")
        
        # Create project ID (timestamp + random)
        project_id = str(uuid.uuid4())
        
        # Save original file
        file_path = os.path.join(UPLOAD_FOLDER, f"{project_id}_{file.filename}")
        with open(file_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
        
        # Store session data
        sessions[project_id] = {
            'original_file': file_path,
            'original_filename': file.filename,
            'project_id': project_id
        }
        
        return UploadResponse(filePath=file_path, fileName=file.filename)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/process/line-numbers", response_model=ProcessResponse)
async def process_line_numbers(request: LineNumbersRequest):
    try:
        project_id = request.projectId
        
        if project_id not in sessions:
            raise HTTPException(status_code=404, detail="Project not found")
        
        session = sessions[project_id]
        original_file = session['original_file']
        
        # Add line numbers
        numbered_filename = f"numbered_{session['original_filename']}"
        numbered_file_path = os.path.join(UPLOAD_FOLDER, f"{project_id}_{numbered_filename}")
        add_line_numbers(original_file, numbered_file_path)
        
        # Store numbered file path
        sessions[project_id]['numbered_file'] = numbered_file_path
        
        return ProcessResponse(numberedFilePath=numbered_file_path)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/process/first-prompt", response_model=GeminiResponse)
async def process_first_prompt(request: FirstPromptRequest):
    try:
        project_id = request.projectId
        
        if project_id not in sessions:
            raise HTTPException(status_code=404, detail="Project not found")
        
        session = sessions[project_id]
        numbered_file = session['numbered_file']
        
        # Load C++ file and send to Gemini
        file_content = load_cpp_file(numbered_file)
        
        # Start Gemini chat session with model settings
        chat_session = start_chat(
            model_name=model_settings['model_name'],
            temperature=model_settings['temperature'],
            top_p=model_settings['top_p'],
            max_tokens=model_settings['max_tokens'],
            safety_settings=model_settings['safety_settings']
        )
        
        # Store chat session
        chat_sessions[project_id] = chat_session
        
        # Send file introduction to Gemini
        response = send_file_intro(chat_session, file_content)
        
        return GeminiResponse(response=response)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/process/fix-violations", response_model=FixViolationsResponse)
async def process_fix_violations(request: FixViolationsRequest):
    try:
        import traceback
        
        project_id = request.projectId
        violations = request.violations
        
        print(f"Processing fix violations for project: {project_id}")
        print(f"Number of violations: {len(violations)}")
        
        if project_id not in chat_sessions:
            raise HTTPException(status_code=404, detail="Chat session not found")
        
        chat_session = chat_sessions[project_id]
        
        # Send violations to Gemini and get fixes
        response = send_misra_violations(chat_session, violations)
        
        print(f"Gemini response received, length: {len(response) if response else 0}")
        
        # Extract code snippets from response and save to session
        code_snippets = extract_snippets_from_response(response)
        print(f"Extracted {len(code_snippets)} code snippets")
        
        # Save snippets to session
        sessions[project_id]['fixed_snippets'] = code_snippets
        snippet_file = os.path.join(UPLOAD_FOLDER, f"{project_id}_snippets.json")
        save_snippets_to_json(code_snippets, snippet_file)
        sessions[project_id]['snippet_file'] = snippet_file
        print(f"Snippets saved to: {snippet_file}")
        
        # Update temporary fixed file for real-time diff view
        session = sessions[project_id]
        numbered_file = session.get('numbered_file')
        if numbered_file:
            temp_fixed_numbered_path, temp_fixed_denumbered_path = create_temp_fixed_denumbered_file(
                numbered_file, code_snippets, project_id, UPLOAD_FOLDER
            )
            session['temp_fixed_numbered'] = temp_fixed_numbered_path
            session['temp_fixed_denumbered'] = temp_fixed_denumbered_path
            print(f"Temporary fixed files created for project {project_id}")
        
        # Convert to list format expected by frontend
        snippets_list = [{'lineNumber': k, 'content': v} for k, v in code_snippets.items()]
        
        return FixViolationsResponse(response=response, codeSnippets=snippets_list)
        
    except Exception as e:
        print(f"Error in fix_violations: {str(e)}")
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
        
        # Apply fixes using ORIGINAL numbered file to preserve all content
        # Get review manager to check for accepted snippets
        review_manager = ReviewManager(project_id, UPLOAD_FOLDER)
        
        # Use original numbered file as base and apply only accepted fixes
        original_numbered_file = session['numbered_file']
        accepted_snippets = review_manager.get_accepted_snippets(fixed_snippets)
        
        fixed_filename = f"fixed_{session['original_filename']}"
        fixed_numbered_path = os.path.join(UPLOAD_FOLDER, f"{project_id}_fixed_numbered_{session['original_filename']}")
        
        merge_fixed_snippets_into_file(original_numbered_file, accepted_snippets, fixed_numbered_path)
        
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
        return {"content": content}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/files/fixed/{project_id}")
async def get_fixed_file(project_id: str):
    """Get fixed file content (showing only accepted changes)"""
    try:
        if project_id not in sessions:
            raise HTTPException(status_code=404, detail="Project not found")
        
        session = sessions[project_id]
        
        # Create temporary fixed file showing only accepted changes
        numbered_file = session.get('numbered_file')
        all_fixed_snippets = session.get('fixed_snippets', {})
        
        if not numbered_file or not all_fixed_snippets:
            raise HTTPException(status_code=404, detail="Required files not found")
        
        # Get only accepted snippets
        review_manager = ReviewManager(project_id, UPLOAD_FOLDER)
        accepted_snippets = review_manager.get_accepted_snippets(all_fixed_snippets)
        
        # Create temporary fixed file
        temp_fixed_numbered_path, temp_fixed_denumbered_path = create_temp_fixed_denumbered_file(
            numbered_file, accepted_snippets, project_id, UPLOAD_FOLDER
        )
        
        content = get_file_content(temp_fixed_denumbered_path)
        
        # Clean up temporary files
        cleanup_temp_files([temp_fixed_numbered_path, temp_fixed_denumbered_path])
        
        return {"content": content}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/diff/{project_id}")
async def get_diff(project_id: str):
    """Get diff data for side-by-side comparison"""
    try:
        if project_id not in sessions:
            raise HTTPException(status_code=404, detail="Project not found")
        
        session = sessions[project_id]
        numbered_file = session.get('numbered_file')
        all_fixed_snippets = session.get('fixed_snippets', {})
        
        if not numbered_file or not all_fixed_snippets:
            raise HTTPException(status_code=404, detail="Required files not found")
        
        # Get only accepted snippets for the fixed version
        review_manager = ReviewManager(project_id, UPLOAD_FOLDER)
        accepted_snippets = review_manager.get_accepted_snippets(all_fixed_snippets)
        
        # Create diff data
        diff_data = create_diff_data(numbered_file, accepted_snippets, project_id, UPLOAD_FOLDER)
        
        return diff_data
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/review/fixes/{project_id}")
async def get_review_fixes(project_id: str):
    """Get list of all fixes with their review status"""
    try:
        if project_id not in sessions:
            raise HTTPException(status_code=404, detail="Project not found")
        
        session = sessions[project_id]
        all_fixed_snippets = session.get('fixed_snippets', {})
        
        if not all_fixed_snippets:
            return {"fixes": [], "summary": {"total_fixes": 0, "accepted_count": 0, "rejected_count": 0, "pending_count": 0}}
        
        review_manager = ReviewManager(project_id, UPLOAD_FOLDER)
        fixes = review_manager.get_fix_list(all_fixed_snippets)
        summary = review_manager.get_review_summary(all_fixed_snippets)
        
        return {"fixes": fixes, "summary": summary}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/review/accept/{project_id}")
async def accept_fix(project_id: str, line_keys: List[str]):
    """Accept specific line fixes"""
    try:
        review_manager = ReviewManager(project_id, UPLOAD_FOLDER)
        for line_key in line_keys:
            review_manager.accept_line(line_key)
        return {"success": True, "message": f"Accepted {len(line_keys)} fixes"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/review/reject/{project_id}")
async def reject_fix(project_id: str, line_keys: List[str]):
    """Reject specific line fixes"""
    try:
        review_manager = ReviewManager(project_id, UPLOAD_FOLDER)
        for line_key in line_keys:
            review_manager.reject_line(line_key)
        return {"success": True, "message": f"Rejected {len(line_keys)} fixes"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/review/reset/{project_id}")
async def reset_fix(project_id: str, line_keys: List[str]):
    """Reset specific line fixes to pending status"""
    try:
        review_manager = ReviewManager(project_id, UPLOAD_FOLDER)
        for line_key in line_keys:
            # Remove from both accepted and rejected sets
            review_manager.accepted_lines.discard(line_key)
            review_manager.rejected_lines.discard(line_key)
        review_manager._save_review_state()
        return {"success": True, "message": f"Reset {len(line_keys)} fixes to pending"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/review/reset-all/{project_id}")
async def reset_all_fixes(project_id: str):
    """Reset all fixes to pending status"""
    try:
        review_manager = ReviewManager(project_id, UPLOAD_FOLDER)
        review_manager.reset_review()
        return {"success": True, "message": "All fixes reset to pending"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/code-snippets/{project_id}")
async def get_code_snippets(project_id: str):
    """Get all code snippets for a project"""
    try:
        if project_id not in sessions:
            raise HTTPException(status_code=404, detail="Project not found")
        
        session = sessions[project_id]
        fixed_snippets = session.get('fixed_snippets', {})
        
        return {"snippets": fixed_snippets}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/process/apply-accepted-fixes", response_model=ApplyFixesResponse)
async def process_apply_accepted_fixes(request: ApplyFixesRequest):
    """Apply only the accepted fixes to create final file - ALWAYS uses original numbered file as base"""
    try:
        project_id = request.projectId
        
        if project_id not in sessions:
            raise HTTPException(status_code=404, detail="Project not found")
        
        session = sessions[project_id]
        # ALWAYS use the original numbered file as the base
        original_numbered_file = session['numbered_file']
        all_fixed_snippets = session.get('fixed_snippets', {})
        
        # Get only accepted snippets
        review_manager = ReviewManager(project_id, UPLOAD_FOLDER)
        accepted_snippets = review_manager.get_accepted_snippets(all_fixed_snippets)
        
        # Apply only accepted fixes to ORIGINAL file
        fixed_filename = f"fixed_{session['original_filename']}"
        fixed_numbered_path = os.path.join(UPLOAD_FOLDER, f"{project_id}_fixed_numbered_{session['original_filename']}")
        
        # Use original numbered file as base, not any previously modified version
        merge_fixed_snippets_into_file(original_numbered_file, accepted_snippets, fixed_numbered_path)
        
        # Remove line numbers for final file
        final_fixed_path = os.path.join(UPLOAD_FOLDER, f"{project_id}_{fixed_filename}")
        remove_line_numbers(fixed_numbered_path, final_fixed_path)
        
        # Update session
        sessions[project_id]['fixed_file'] = final_fixed_path
        
        return ApplyFixesResponse(fixedFilePath=final_fixed_path)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/model-settings")
async def get_model_settings():
    """Get current model settings"""
    return model_settings

@app.post("/api/model-settings")
async def update_model_settings(settings: ModelSettings):
    """Update model settings"""
    global model_settings
    model_settings = settings.dict()
    return {"success": True, "settings": model_settings}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)