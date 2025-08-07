
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
from fixed_response_code_snippet import extract_snippets_from_response, save_snippets_to_json, extract_violation_mapping, save_violation_mapping_to_json
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

import threading
from collections import defaultdict

# Per-project session management with individual locks
class ProjectSession:
    def __init__(self):
        self.data = {}
        self.lock = threading.RLock()  # Individual lock per session
        
    def get(self, key, default=None):
        with self.lock:
            return self.data.get(key, default)
    
    def set(self, key, value):
        with self.lock:
            self.data[key] = value
    
    def update(self, updates):
        with self.lock:
            self.data.update(updates)

# Thread-safe storage for sessions without global locking
sessions = defaultdict(ProjectSession)  # Auto-creates ProjectSession for each project_id
chat_sessions = {}  # Only needs project-level access control
chat_sessions_lock = threading.RLock()  # Minimal lock only for chat session creation/deletion

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
model_settings_lock = threading.RLock()

# Configure upload settings
UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'cpp', 'c', 'xlsx', 'xls'}

if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

def allowed_file(filename: str) -> bool:
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# ... keep existing code (Pydantic models for request/response validation)

# Initialize Vertex AI on startup
@app.on_event("startup")
async def startup_event():
    init_vertex_ai()

# ... keep existing code (settings endpoints)

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
        
        # Initialize session - no global lock needed, defaultdict creates ProjectSession automatically
        session = sessions[projectId]
        session.update({
            'cpp_file': file_path,
            'original_filename': filename,
        })
        
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
        
        # Store in session - no global lock needed
        session = sessions[projectId]
        session.update({
            'excel_file': excel_path,
            'violations': violations
        })
        
        return violations
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/process/add-line-numbers", response_model=ProcessResponse)
async def process_add_line_numbers(request: LineNumbersRequest):
    try:
        project_id = request.projectId
        session = sessions[project_id]
        
        input_file = session.get('cpp_file')
        if not input_file:
            raise HTTPException(status_code=404, detail="Project not found")
            
        # Create numbered file with .txt extension
        original_name = Path(session.get('original_filename', 'unknown')).stem
        numbered_filename = f"numbered_{original_name}.txt"
        numbered_path = os.path.join(UPLOAD_FOLDER, f"{project_id}_{numbered_filename}")
        
        add_line_numbers(input_file, numbered_path)
        
        # Update session
        session.set('numbered_file', numbered_path)
        
        return ProcessResponse(numberedFilePath=numbered_path)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/gemini/first-prompt", response_model=GeminiResponse)
async def gemini_first_prompt(request: FirstPromptRequest):
    try:
        project_id = request.projectId
        session = sessions[project_id]
        
        numbered_file = session.get('numbered_file')
        if not numbered_file:
            raise HTTPException(status_code=404, detail="Numbered file not found")
            
        # Load numbered file content
        numbered_content = load_cpp_file(numbered_file)
        
        # Start chat session with current model settings
        with model_settings_lock:
            current_settings = model_settings.copy()
        
        chat = start_chat(
            model_name=current_settings['model_name'],
            temperature=current_settings['temperature'],
            top_p=current_settings['top_p'],
            max_tokens=current_settings['max_tokens'],
            safety_settings=current_settings['safety_settings']
        )
        
        # Send first prompt
        response = send_file_intro(chat, numbered_content)
        
        # Check if response is None (blocked by safety filters)
        if response is None:
            raise HTTPException(
                status_code=422, 
                detail="Response was blocked by safety filters. Please try with different content or contact support."
            )
        
        # Store chat session with minimal locking
        with chat_sessions_lock:
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
    """
    Refactored endpoint for concurrent processing per user/projectId.
    No global locking - each project processes independently.
    """
    try:
        project_id = request.projectId
        violations = request.violations
        
        print(f"Processing project_id: {project_id}")  # Debug
        print(f"Number of violations: {len(violations)}")  # Debug
        
        # Get chat session with minimal locking scope
        with chat_sessions_lock:
            chat = chat_sessions.get(project_id)
        
        if not chat:
            raise HTTPException(status_code=404, detail="Chat session not found")
        
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
        
        # Send to Gemini - this is the main processing work that can run concurrently
        print("Sending to Gemini...")  # Debug
        response = send_misra_violations(chat, violations_str)
        print(f"Gemini response received: {response is not None}")  # Debug
        
        # Check if response is None (blocked by safety filters)
        if response is None:
            raise HTTPException(
                status_code=422, 
                detail="Response was blocked by safety filters. Please try with different content or contact support."
            )
        
        # Extract code snippets - CPU intensive work that can run concurrently
        print("Extracting snippets...")  # Debug
        code_snippets = extract_snippets_from_response(response)
        print(f"Extracted {len(code_snippets)} snippets")  # Debug
        
        # Extract violation mapping
        violation_mapping = {}
        try:
            print("Extracting violation mapping...")  # Debug
            violation_mapping = extract_violation_mapping(response)
            print(f"Extracted violation mapping for {len(violation_mapping)} violations")  # Debug
        except Exception as e:
            print(f"Warning: Could not extract violation mapping: {str(e)}")  # Debug
        
        # Save snippets to session - only this project's session is locked, others can proceed
        session = sessions[project_id]
        
        print("Saving snippets to session...")  # Debug
        session.update({
            'fixed_snippets': code_snippets,
            'violation_mapping': violation_mapping
        })
        
        snippet_file = os.path.join(UPLOAD_FOLDER, f"{project_id}_snippets.json")
        violation_mapping_file = os.path.join(UPLOAD_FOLDER, f"{project_id}_violation_mapping.json")
        
        # File I/O operations can run concurrently for different projects
        save_snippets_to_json(code_snippets, snippet_file)
        save_violation_mapping_to_json(violation_mapping, violation_mapping_file)
        
        session.update({
            'snippet_file': snippet_file,
            'violation_mapping_file': violation_mapping_file
        })
        
        print(f"Snippets saved to: {snippet_file}")  # Debug
        print(f"Violation mapping saved to: {violation_mapping_file}")  # Debug
        
        # Create temporary fixed files for immediate diff view
        try:
            numbered_file = session.get('numbered_file')
            if numbered_file:
                temp_fixed_numbered_path, temp_fixed_denumbered_path = create_temp_fixed_denumbered_file(
                    numbered_file, code_snippets, project_id, UPLOAD_FOLDER
                )
                session.update({
                    'temp_fixed_numbered': temp_fixed_numbered_path,
                    'temp_fixed_denumbered': temp_fixed_denumbered_path
                })
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
        session = sessions[project_id]
        
        numbered_file = session.get('numbered_file')
        fixed_snippets = session.get('fixed_snippets', {})
        
        if not numbered_file:
            raise HTTPException(status_code=404, detail="Project not found")
    
        # Apply fixes
        original_filename = session.get('original_filename', 'unknown')
        fixed_filename = f"fixed_{original_filename}"
        fixed_numbered_path = os.path.join(UPLOAD_FOLDER, f"{project_id}_fixed_numbered_{original_filename}")
        
        merge_fixed_snippets_into_file(numbered_file, fixed_snippets, fixed_numbered_path)
        
        # Remove line numbers for final file
        final_fixed_path = os.path.join(UPLOAD_FOLDER, f"{project_id}_{fixed_filename}")
        remove_line_numbers(fixed_numbered_path, final_fixed_path)
        
        # Update session
        session.set('fixed_file', final_fixed_path)
        
        return ApplyFixesResponse(fixedFilePath=final_fixed_path)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/download/fixed-file")
async def download_fixed_file(projectId: str = Query(...)):
    try:
        session = sessions[projectId]
        fixed_file = session.get('fixed_file')
        original_filename = session.get('original_filename', 'unknown')
        
        if not fixed_file or not os.path.exists(fixed_file):
            raise HTTPException(status_code=404, detail="Fixed file not found")
        
        return FileResponse(
            path=fixed_file,
            filename=f"fixed_{original_filename}",
            media_type='application/octet-stream'
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    try:
        message = request.message
        project_id = request.projectId
        
        # Get chat session with minimal locking
        with chat_sessions_lock:
            chat_session = chat_sessions.get(project_id)
        
        if not chat_session:
            raise HTTPException(status_code=404, detail="Chat session not found")
        
        # Send message to Gemini - can run concurrently for different projects
        response = chat_session.send_message(message)
        
        # Check if response is None or blocked
        if response is None or response.text is None:
            raise HTTPException(
                status_code=422, 
                detail="Response was blocked by safety filters. Please try rephrasing your message."
            )
        
        # Extract code snippets from response and save to session
        session = sessions[project_id]
                
        print("Extracting snippets from chat response...")  # Debug
        code_snippets = extract_snippets_from_response(response.text)
        print(f"Extracted {len(code_snippets)} snippets from chat")  # Debug
        
        # Save snippets to session (same as fix-violations endpoint)
        session.set('fixed_snippets', code_snippets)
        snippet_file = os.path.join(UPLOAD_FOLDER, f"{project_id}_snippets.json")
        save_snippets_to_json(code_snippets, snippet_file)
        session.set('snippet_file', snippet_file)
        print(f"Chat snippets saved to: {snippet_file}")  # Debug
        
        # Update temporary fixed file for real-time diff view
        try:
            numbered_file = session.get('numbered_file')
            if numbered_file:
                temp_fixed_numbered_path, temp_fixed_denumbered_path = create_temp_fixed_denumbered_file(
                    numbered_file, code_snippets, project_id, UPLOAD_FOLDER
                )
                session.update({
                    'temp_fixed_numbered': temp_fixed_numbered_path,
                    'temp_fixed_denumbered': temp_fixed_denumbered_path
                })
                print(f"Updated temporary fixed files for project {project_id}")
        except Exception as e:
            print(f"Error updating temporary fixed files: {str(e)}")
        
        return ChatResponse(response=response.text)
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ... keep existing code (session state endpoints)

# New diff endpoints for Fix View Modal
@app.get("/api/files/numbered/{project_id}")
async def get_numbered_file(project_id: str):
    """Get numbered file content"""
    try:
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
            session.update({
                'temp_fixed_numbered': temp_fixed_numbered_path,
                'temp_fixed_denumbered': temp_fixed_denumbered_path
            })
        
        # Return the fixed numbered content (with line numbers for diff view)
        content = get_file_content(temp_fixed_numbered_path)
        if content is None:
            raise HTTPException(status_code=500, detail="Failed to read temporary fixed file")
        
        return content
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/diff/{project_id}", response_model=DiffResponse)
async def get_diff(project_id: str):
    """Get diff between original and fixed files"""
    try:
        session = sessions[project_id]
        
        original_file = session.get('cpp_file')  # Original file
        fixed_snippets = session.get('fixed_snippets', {})
        numbered_file = session.get('numbered_file')
        
        if not original_file or not numbered_file:
            raise HTTPException(status_code=404, detail="Required files not found")
        
        # Create temporary fixed denumbered file for comparison with original
        temp_fixed_numbered_path, temp_fixed_denumbered_path = create_temp_fixed_denumbered_file(
            numbered_file, fixed_snippets, project_id, UPLOAD_FOLDER
        )
        
        # Create diff data comparing original with fixed denumbered file
        diff_data = create_diff_data(original_file, temp_fixed_denumbered_path, fixed_snippets)
        
        # Store temp paths in session for potential cleanup
        session.update({
            'temp_fixed_numbered': temp_fixed_numbered_path,
            'temp_fixed_denumbered': temp_fixed_denumbered_path
        })
        
        return DiffResponse(**diff_data)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# New Review Management Endpoints

@app.get("/api/review/state/{project_id}", response_model=ReviewStateResponse)
async def get_review_state(project_id: str):
    """Get current review state for all fixes"""
    try:
        session = sessions[project_id]
        fixed_snippets = session.get('fixed_snippets', {})
        
        review_manager = ReviewManager(project_id, UPLOAD_FOLDER)
        fixes = review_manager.get_fix_list(fixed_snippets)
        summary = review_manager.get_review_summary(fixed_snippets)
        
        return ReviewStateResponse(fixes=fixes, summary=summary)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/review/action")
async def review_action(request: ReviewActionRequest):
    """Accept or reject a specific fix"""
    try:
        project_id = request.projectId
        line_key = request.line_key
        action = request.action
        
        session = sessions[project_id]
        
        review_manager = ReviewManager(project_id, UPLOAD_FOLDER)
        
        if action == "accept":
            review_manager.accept_line(line_key)
        elif action == "reject":
            review_manager.reject_line(line_key)
        elif action == "reset":
            review_manager.reset_line(line_key)
        else:
            raise HTTPException(status_code=400, detail="Invalid action. Use 'accept', 'reject', or 'reset'")
        
        # Update temporary files with only accepted changes
        fixed_snippets = session.get('fixed_snippets', {})
        numbered_file = session.get('numbered_file')
        
        if numbered_file:
            accepted_snippets = review_manager.get_accepted_snippets(fixed_snippets)
            temp_fixed_numbered_path, temp_fixed_denumbered_path = create_temp_fixed_denumbered_file(
                numbered_file, accepted_snippets, project_id, UPLOAD_FOLDER
            )
            session.update({
                'temp_fixed_numbered': temp_fixed_numbered_path,
                'temp_fixed_denumbered': temp_fixed_denumbered_path
            })
        
        return {"success": True, "message": f"Line {line_key} {action}ed successfully"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/review/navigate")
async def navigate_review(request: NavigationRequest):
    """Set current review navigation index"""
    try:
        project_id = request.projectId
        index = request.index
        
        review_manager = ReviewManager(project_id, UPLOAD_FOLDER)
        review_manager.set_current_review_index(index)
        
        return {"success": True, "current_index": index}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/code-snippets/{project_id}")
async def get_code_snippets(project_id: str):
    """Get code snippets for a project"""
    try:
        session = sessions[project_id]
        fixed_snippets = session.get('fixed_snippets', {})
        
        return fixed_snippets
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/violation-mapping/{project_id}")
async def get_violation_mapping(project_id: str):
    """Get violation mapping for a project"""
    try:
        session = sessions[project_id]
        violation_mapping = session.get('violation_mapping', {})
        
        return violation_mapping
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/review/reset/{project_id}")
async def reset_review(project_id: str):
    """Reset all review decisions for a project"""
    try:
        review_manager = ReviewManager(project_id, UPLOAD_FOLDER)
        review_manager.reset_review()
        
        return {"success": True, "message": "Review state reset successfully"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/process/apply-accepted-fixes", response_model=ApplyFixesResponse)
async def process_apply_accepted_fixes(request: ApplyFixesRequest):
    """Apply only the accepted fixes to create final file"""
    try:
        project_id = request.projectId
        session = sessions[project_id]
        
        numbered_file = session.get('numbered_file')
        all_fixed_snippets = session.get('fixed_snippets', {})
        original_filename = session.get('original_filename', 'unknown')
        
        if not numbered_file:
            raise HTTPException(status_code=404, detail="Project not found")
            
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
        session.set('fixed_file', final_fixed_path)
        
        return ApplyFixesResponse(fixedFilePath=final_fixed_path)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ... keep existing code (health check and root endpoints)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)
