# app.py - Main Flask application for MISRA Fix Copilot

import os
import json
import uuid
import asyncio
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from werkzeug.utils import secure_filename
import pandas as pd
from numbering import add_line_numbers
from denumbering import remove_line_numbers
from replace import merge_fixed_snippets_into_file
from gemini_client import GeminiClient
from database import db
from diff_async_utils import create_diff_data_async

app = Flask(__name__)
CORS(app)

# Configuration
UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'cpp', 'c', 'h', 'hpp', 'cc', 'cxx', 'xlsx', 'xls'}

# Ensure upload folder exists
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Initialize Gemini client
gemini_client = GeminiClient()

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def run_async(coro):
    """Helper to run async functions in sync context"""
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop.run_until_complete(coro)

# File Upload Endpoints
@app.route('/api/upload/cpp-file', methods=['POST'])
def upload_cpp_file():
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        project_id = request.form.get('projectId')
        
        if not project_id:
            return jsonify({'error': 'Project ID is required'}), 400
        
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        if file and allowed_file(file.filename):
            filename = secure_filename(file.filename)
            file_path = os.path.join(UPLOAD_FOLDER, f"{project_id}_{filename}")
            file.save(file_path)
            
            # Create or update session
            session_id = str(uuid.uuid4())
            run_async(db.create_session(
                session_id=session_id,
                project_id=project_id,
                cpp_file_path=file_path,
                original_filename=filename
            ))
            
            return jsonify({
                'filePath': file_path,
                'fileName': filename
            })
        
        return jsonify({'error': 'Invalid file type'}), 400
        
    except Exception as e:
        print(f"Error uploading C++ file: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/upload/misra-report', methods=['POST'])
def upload_misra_report():
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        project_id = request.form.get('projectId')
        target_file = request.form.get('targetFile')
        
        if not all([project_id, target_file]):
            return jsonify({'error': 'Project ID and target file are required'}), 400
        
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        if file and allowed_file(file.filename):
            filename = secure_filename(file.filename)
            file_path = os.path.join(UPLOAD_FOLDER, f"{project_id}_misra_{filename}")
            file.save(file_path)
            
            # Parse Excel file
            df = pd.read_excel(file_path)
            
            # Filter violations for the target file
            violations = []
            for _, row in df.iterrows():
                if target_file.lower() in str(row.get('File', '')).lower():
                    violations.append({
                        'file': str(row.get('File', '')),
                        'path': str(row.get('Path', '')),
                        'line': int(row.get('Line', 0)) if pd.notna(row.get('Line')) else 0,
                        'warning': str(row.get('Warning', '')),
                        'level': str(row.get('Level', '')),
                        'misra': str(row.get('MISRA', ''))
                    })
            
            # Update session with violations
            session = run_async(db.get_session_by_project(project_id))
            if session:
                run_async(db.update_session(
                    session['session_id'],
                    excel_file_path=file_path,
                    violations=violations
                ))
            
            return jsonify(violations)
        
        return jsonify({'error': 'Invalid file type'}), 400
        
    except Exception as e:
        print(f"Error uploading MISRA report: {str(e)}")
        return jsonify({'error': str(e)}), 500

# Processing Endpoints
@app.route('/api/process/add-line-numbers', methods=['POST'])
def add_line_numbers_endpoint():
    try:
        data = request.get_json()
        project_id = data.get('projectId')
        
        if not project_id:
            return jsonify({'error': 'Project ID is required'}), 400
        
        session = run_async(db.get_session_by_project(project_id))
        if not session:
            return jsonify({'error': 'Session not found'}), 404
        
        cpp_file_path = session.get('cpp_file_path')
        if not cpp_file_path or not os.path.exists(cpp_file_path):
            return jsonify({'error': 'C++ file not found'}), 404
        
        # Create numbered file
        numbered_file_path = os.path.join(UPLOAD_FOLDER, f"{project_id}_numbered.cpp")
        add_line_numbers(cpp_file_path, numbered_file_path)
        
        # Update session
        run_async(db.update_session(session['session_id'], numbered_file_path=numbered_file_path))
        
        return jsonify({'numberedFilePath': numbered_file_path})
        
    except Exception as e:
        print(f"Error adding line numbers: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/process/apply-fixes', methods=['POST'])
def apply_fixes():
    try:
        data = request.get_json()
        project_id = data.get('projectId')
        
        if not project_id:
            return jsonify({'error': 'Project ID is required'}), 400
        
        session = run_async(db.get_session_by_project(project_id))
        if not session:
            return jsonify({'error': 'Session not found'}), 404
        
        numbered_file_path = session.get('numbered_file_path')
        fixed_snippets = session.get('fixed_snippets', {})
        
        if not numbered_file_path or not os.path.exists(numbered_file_path):
            return jsonify({'error': 'Numbered file not found'}), 404
        
        if not fixed_snippets:
            return jsonify({'error': 'No fixes to apply'}), 400
        
        # Create merged file
        merged_file_path = os.path.join(UPLOAD_FOLDER, f"{project_id}_merged.cpp")
        merge_fixed_snippets_into_file(numbered_file_path, fixed_snippets, merged_file_path)
        
        # Create denumbered version
        denumbered_file_path = os.path.join(UPLOAD_FOLDER, f"{project_id}_denumbered.cpp")
        remove_line_numbers(merged_file_path, denumbered_file_path)
        
        return jsonify({'mergedFilePath': merged_file_path})
        
    except Exception as e:
        print(f"Error applying fixes: {str(e)}")
        return jsonify({'error': str(e)}), 500

# Add new endpoint for applying only accepted fixes
@app.route('/api/process/apply-accepted-fixes', methods=['POST'])
def apply_accepted_fixes():
    try:
        data = request.get_json()
        project_id = data.get('projectId')
        
        if not project_id:
            return jsonify({'error': 'Project ID is required'}), 400
        
        # Get session data
        session = run_async(db.get_session_by_project(project_id))
        if not session:
            return jsonify({'error': 'Session not found'}), 404
        
        numbered_file_path = session.get('numbered_file_path')
        if not numbered_file_path or not os.path.exists(numbered_file_path):
            return jsonify({'error': 'Numbered file not found'}), 404
        
        # Get only accepted snippets
        accepted_snippets = run_async(db.get_filtered_snippets(session['session_id']))
        
        # Create final fixed file path
        final_fixed_path = os.path.join(UPLOAD_FOLDER, f"{project_id}_final_fixed.cpp")
        
        # Apply only accepted fixes
        merge_fixed_snippets_into_file(numbered_file_path, accepted_snippets, final_fixed_path)
        
        # Create denumbered version for download
        final_denumbered_path = os.path.join(UPLOAD_FOLDER, f"{project_id}_final_denumbered.cpp")
        remove_line_numbers(final_fixed_path, final_denumbered_path)
        
        # Update session with final file path
        run_async(db.update_session(session['session_id'], final_fixed_path=final_denumbered_path))
        
        return jsonify({
            'success': True,
            'fixedFilePath': final_denumbered_path
        })
        
    except Exception as e:
        print(f"Error applying accepted fixes: {str(e)}")
        return jsonify({'error': str(e)}), 500

# Gemini AI Endpoints
@app.route('/api/gemini/first-prompt', methods=['POST'])
def send_first_prompt():
    try:
        data = request.get_json()
        project_id = data.get('projectId')
        use_merged_file = data.get('use_merged_file', False)
        
        if not project_id:
            return jsonify({'error': 'Project ID is required'}), 400
        
        session = run_async(db.get_session_by_project(project_id))
        if not session:
            return jsonify({'error': 'Session not found'}), 404
        
        # Determine which file to use
        if use_merged_file:
            file_path = os.path.join(UPLOAD_FOLDER, f"{project_id}_merged.cpp")
        else:
            file_path = session.get('numbered_file_path')
        
        if not file_path or not os.path.exists(file_path):
            return jsonify({'error': 'File not found'}), 404
        
        # Read file content
        with open(file_path, 'r', encoding='utf-8') as f:
            file_content = f.read()
        
        # Send to Gemini
        response = gemini_client.send_first_prompt(file_content)
        
        return jsonify({
            'response': response,
            'codeSnippets': []  # Will be populated if needed
        })
        
    except Exception as e:
        print(f"Error sending first prompt: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/gemini/fix-violations', methods=['POST'])
def fix_violations():
    try:
        data = request.get_json()
        project_id = data.get('projectId')
        violations = data.get('violations', [])
        
        if not project_id:
            return jsonify({'error': 'Project ID is required'}), 400
        
        if not violations:
            return jsonify({'error': 'No violations provided'}), 400
        
        session = run_async(db.get_session_by_project(project_id))
        if not session:
            return jsonify({'error': 'Session not found'}), 404
        
        numbered_file_path = session.get('numbered_file_path')
        if not numbered_file_path or not os.path.exists(numbered_file_path):
            return jsonify({'error': 'Numbered file not found'}), 404
        
        # Read numbered file content
        with open(numbered_file_path, 'r', encoding='utf-8') as f:
            file_content = f.read()
        
        # Send to Gemini for fixes
        response = gemini_client.fix_violations(file_content, violations)
        
        # Parse JSON response to extract fixed snippets
        try:
            fixed_snippets = json.loads(response)
            
            # Update session with fixed snippets
            run_async(db.update_session(session['session_id'], fixed_snippets=fixed_snippets))
            
            return jsonify({
                'response': response,
                'codeSnippets': list(fixed_snippets.keys())
            })
        except json.JSONDecodeError:
            return jsonify({
                'response': response,
                'codeSnippets': []
            })
        
    except Exception as e:
        print(f"Error fixing violations: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/chat', methods=['POST'])
def chat():
    try:
        data = request.get_json()
        message = data.get('message')
        project_id = data.get('projectId')
        use_merged_file = data.get('use_merged_file', False)
        
        if not all([message, project_id]):
            return jsonify({'error': 'Message and project ID are required'}), 400
        
        session = run_async(db.get_session_by_project(project_id))
        if not session:
            return jsonify({'error': 'Session not found'}), 404
        
        # Determine which file to use for context
        if use_merged_file:
            file_path = os.path.join(UPLOAD_FOLDER, f"{project_id}_merged.cpp")
        else:
            file_path = session.get('numbered_file_path')
        
        file_content = ""
        if file_path and os.path.exists(file_path):
            with open(file_path, 'r', encoding='utf-8') as f:
                file_content = f.read()
        
        # Send to Gemini
        response = gemini_client.chat(message, file_content)
        
        return jsonify({'response': response})
        
    except Exception as e:
        print(f"Error in chat: {str(e)}")
        return jsonify({'error': str(e)}), 500

# Download Endpoints
@app.route('/api/download/fixed-file', methods=['GET'])
def download_fixed_file():
    try:
        project_id = request.args.get('projectId')
        
        if not project_id:
            return jsonify({'error': 'Project ID is required'}), 400
        
        # Try to get the final denumbered file first
        final_denumbered_path = os.path.join(UPLOAD_FOLDER, f"{project_id}_final_denumbered.cpp")
        
        if os.path.exists(final_denumbered_path):
            return send_file(final_denumbered_path, as_attachment=True, download_name=f"fixed_{project_id}.cpp")
        
        # Fallback to regular denumbered file
        denumbered_path = os.path.join(UPLOAD_FOLDER, f"{project_id}_denumbered.cpp")
        if os.path.exists(denumbered_path):
            return send_file(denumbered_path, as_attachment=True, download_name=f"fixed_{project_id}.cpp")
        
        return jsonify({'error': 'Fixed file not found'}), 404
        
    except Exception as e:
        print(f"Error downloading file: {str(e)}")
        return jsonify({'error': str(e)}), 500

# File Content Endpoints
@app.route('/api/files/numbered/<project_id>', methods=['GET'])
def get_numbered_file(project_id):
    try:
        session = run_async(db.get_session_by_project(project_id))
        if not session:
            return jsonify({'error': 'Session not found'}), 404
        
        numbered_file_path = session.get('numbered_file_path')
        if not numbered_file_path or not os.path.exists(numbered_file_path):
            return jsonify({'error': 'Numbered file not found'}), 404
        
        with open(numbered_file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        return content, 200, {'Content-Type': 'text/plain'}
        
    except Exception as e:
        print(f"Error getting numbered file: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/files/temp-fixed/<project_id>', methods=['GET'])
def get_temp_fixed_file(project_id):
    try:
        temp_fixed_path = os.path.join(UPLOAD_FOLDER, f"{project_id}_temp_fixed_denumbered.cpp")
        
        if not os.path.exists(temp_fixed_path):
            return jsonify({'error': 'Temp fixed file not found'}), 404
        
        with open(temp_fixed_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        return content, 200, {'Content-Type': 'text/plain'}
        
    except Exception as e:
        print(f"Error getting temp fixed file: {str(e)}")
        return jsonify({'error': str(e)}), 500

# Diff Endpoint with Review Data
@app.route('/api/diff/<project_id>', methods=['GET'])
def get_diff(project_id):
    try:
        only_accepted = request.args.get('only_accepted', 'false').lower() == 'true'
        
        # Use async diff utility
        diff_data = run_async(create_diff_data_async(
            project_id=project_id,
            only_accepted=only_accepted
        ))
        
        return jsonify(diff_data)
        
    except Exception as e:
        print(f"Error getting diff: {str(e)}")
        return jsonify({'error': str(e)}), 500

# Review Endpoints
@app.route('/api/review/accept-reject', methods=['POST'])
def accept_reject_change():
    try:
        data = request.get_json()
        project_id = data.get('projectId')
        line_key = data.get('lineKey')
        action = data.get('action')  # 'accept' or 'reject'
        
        if not all([project_id, line_key, action]):
            return jsonify({'error': 'Project ID, line key, and action are required'}), 400
        
        session = run_async(db.get_session_by_project(project_id))
        if not session:
            return jsonify({'error': 'Session not found'}), 404
        
        session_id = session['session_id']
        
        # Perform action
        if action == 'accept':
            success = run_async(db.accept_change(session_id, line_key))
            message = f"Change at line {line_key} accepted"
        elif action == 'reject':
            success = run_async(db.reject_change(session_id, line_key))
            message = f"Change at line {line_key} rejected"
        else:
            return jsonify({'error': 'Invalid action'}), 400
        
        if not success:
            return jsonify({'error': 'Failed to update change status'}), 500
        
        # Get next line to review
        next_line = run_async(db.get_next_fix_line(session_id))
        
        # Get updated review data
        updated_session = run_async(db.get_session(session_id))
        if updated_session:
            fixed_snippets = updated_session.get('fixed_snippets', {})
            accepted_changes = updated_session.get('accepted_changes', [])
            rejected_changes = updated_session.get('rejected_changes', [])
            reviewed_changes = set(accepted_changes + rejected_changes)
            
            pending_changes = [
                key for key in fixed_snippets.keys() 
                if key not in reviewed_changes
            ]
            
            review_data = {
                "pending_changes": sorted(pending_changes, key=lambda k: int(k.split('a')[0] if 'a' in k else k)),
                "accepted_changes": accepted_changes,
                "rejected_changes": rejected_changes,
                "current_line": next_line,
                "total_changes": len(fixed_snippets),
                "reviewed_count": len(reviewed_changes)
            }
        else:
            review_data = {"pending_changes": [], "accepted_changes": [], "rejected_changes": [], "current_line": None}
        
        return jsonify({
            'success': True,
            'message': message,
            'next_line': next_line,
            'review_data': review_data
        })
        
    except Exception as e:
        print(f"Error in accept/reject: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/review/navigate', methods=['POST'])
def navigate_changes():
    try:
        data = request.get_json()
        project_id = data.get('projectId')
        direction = data.get('direction')  # 'next' or 'prev'
        current_line = data.get('currentLine')
        
        if not all([project_id, direction]):
            return jsonify({'error': 'Project ID and direction are required'}), 400
        
        session = run_async(db.get_session_by_project(project_id))
        if not session:
            return jsonify({'error': 'Session not found'}), 404
        
        session_id = session['session_id']
        
        # Get next line based on direction
        if direction == 'next':
            next_line = run_async(db.get_next_fix_line(session_id))
        elif direction == 'prev':
            next_line = run_async(db.get_prev_fix_line(session_id, current_line or ''))
        else:
            return jsonify({'error': 'Invalid direction'}), 400
        
        # Get updated review data
        fixed_snippets = session.get('fixed_snippets', {})
        accepted_changes = session.get('accepted_changes', [])
        rejected_changes = session.get('rejected_changes', [])
        reviewed_changes = set(accepted_changes + rejected_changes)
        
        pending_changes = [
            key for key in fixed_snippets.keys() 
            if key not in reviewed_changes
        ]
        
        review_data = {
            "pending_changes": sorted(pending_changes, key=lambda k: int(k.split('a')[0] if 'a' in k else k)),
            "accepted_changes": accepted_changes,
            "rejected_changes": rejected_changes,
            "current_line": next_line,
            "total_changes": len(fixed_snippets),
            "reviewed_count": len(reviewed_changes)
        }
        
        return jsonify({
            'success': True,
            'next_line': next_line,
            'review_data': review_data
        })
        
    except Exception as e:
        print(f"Error in navigation: {str(e)}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
