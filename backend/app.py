
import os
import json
from flask import Flask, request, jsonify
from flask_cors import CORS
import logging
from werkzeug.utils import secure_filename
import uuid
from datetime import datetime

app = Flask(__name__)
CORS(app)

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# Define upload folder
UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'c', 'cpp', 'h', 'hpp'}

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
# Create upload folder if it doesn't exist
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

# In-memory storage for file contents and analysis results
file_contents = {}
analysis_results = {}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# Add username-specific settings functions
def get_user_settings_filename(username):
    """Generate username-specific settings filename"""
    if not username:
        return 'model_setting.json'  # fallback to default
    safe_username = secure_filename(username)
    return f"{safe_username}_model_setting.json"

def delete_user_settings_file(username):
    """Delete user-specific settings file if it exists"""
    try:
        filename = get_user_settings_filename(username)
        filepath = os.path.join(os.getcwd(), filename)
        if os.path.exists(filepath):
            os.remove(filepath)
            return True
        return False
    except Exception as e:
        print(f"Error deleting user settings file: {e}")
        return False

@app.route('/api/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        
        # Read file contents
        with open(filepath, 'r') as f:
            file_contents[filename] = f.read()
        
        return jsonify({'message': 'File uploaded successfully', 'filename': filename}), 200
    else:
        return jsonify({'error': 'Invalid file type'}), 400

@app.route('/api/file/<filename>', methods=['GET'])
def get_file_content(filename):
    if filename in file_contents:
        return jsonify({'filename': filename, 'content': file_contents[filename]}), 200
    else:
        return jsonify({'error': 'File not found'}), 404

@app.route('/api/analyze/<filename>', methods=['POST'])
def analyze_file(filename):
    if filename not in file_contents:
        return jsonify({'error': 'File not found'}), 404
    
    # Placeholder for analysis logic (replace with actual analysis)
    content = file_contents[filename]
    analysis_results[filename] = {
        'filename': filename,
        'results': f'Analysis results for {filename}',
        'timestamp': datetime.now().isoformat()
    }
    
    return jsonify(analysis_results[filename]), 200

@app.route('/api/results/<filename>', methods=['GET'])
def get_analysis_results(filename):
    if filename in analysis_results:
        return jsonify(analysis_results[filename]), 200
    else:
        return jsonify({'error': 'Analysis results not found'}), 404

@app.route('/api/process', methods=['POST'])
def process_files():
    try:
        data = request.get_json()
        excel_file_path = data.get('excel_file_path')
        c_file_path = data.get('c_file_path')

        # Check if file paths are provided
        if not excel_file_path or not c_file_path:
            return jsonify({'error': 'Both excel_file_path and c_file_path are required'}), 400

        # Check if files exist
        if not os.path.exists(excel_file_path) or not os.path.exists(c_file_path):
            return jsonify({'error': 'One or both files do not exist'}), 404

        # Placeholder for file processing logic (replace with actual processing)
        results = {
            'excel_file': excel_file_path,
            'c_file': c_file_path,
            'message': 'Files processed successfully',
            'timestamp': datetime.now().isoformat()
        }

        return jsonify(results), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/settings', methods=['GET', 'POST', 'DELETE'])
def handle_settings():
    if request.method == 'GET':
        username = request.args.get('username')
        filename = get_user_settings_filename(username)
        
        try:
            with open(filename, 'r') as f:
                settings = json.load(f)
            return jsonify(settings)
        except FileNotFoundError:
            # Return default settings if file doesn't exist
            default_settings = {
                'temperature': 0.5,
                'top_p': 0.95,
                'max_tokens': 65535,
                'model_name': 'gemini-1.5-flash',
                'safety_settings': False
            }
            return jsonify(default_settings)
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    
    elif request.method == 'POST':
        username = request.json.get('username') if request.json else None
        filename = get_user_settings_filename(username)
        
        try:
            # Delete existing user-specific file before saving new one
            if username:
                delete_user_settings_file(username)
            
            settings = request.json
            with open(filename, 'w') as f:
                json.dump(settings, f, indent=2)
            return jsonify({'success': True, 'message': 'Settings saved successfully'})
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    
    elif request.method == 'DELETE':
        username = request.args.get('username')
        try:
            success = delete_user_settings_file(username)
            if success:
                return jsonify({'success': True, 'message': 'Settings deleted successfully'})
            else:
                return jsonify({'success': False, 'message': 'Settings file not found'}), 404
        except Exception as e:
            return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
