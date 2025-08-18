import os
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from session_manager import session_manager

app = Flask(__name__)
CORS(app)

# Serve static files from the 'web-build' directory
app.static_folder = 'web-build'

# Ensure the 'uploads' directory exists
UPLOAD_FOLDER = 'uploads'
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# Create a test file
TEST_FILE_PATH = os.path.join(UPLOAD_FOLDER, 'test.txt')
if not os.path.exists(TEST_FILE_PATH):
    with open(TEST_FILE_PATH, 'w') as f:
        f.write("This is a test file.")

@app.route('/api/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    if file:
        filename = os.path.join(app.config['UPLOAD_FOLDER'], file.filename)
        file.save(filename)
        return jsonify({'message': 'File uploaded successfully', 'filename': filename}), 200

@app.route('/api/files/<filename>')
def get_file(filename):
    return send_from_directory(app.config["UPLOAD_FOLDER"], filename)

@app.route('/api/session', methods=['GET'])
def get_session_id():
    project_id = request.headers.get('X-Project-ID')
    session = session_manager.get_or_create_session(project_id)
    return jsonify({'session_id': session.project_id}), 200

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    if path != "" and os.path.exists(app.static_folder + '/' + path):
        return send_from_directory(app.static_folder, path)
    else:
        return send_from_directory(app.static_folder, 'index.html')

from settings_endpoints import settings_bp

# Register settings blueprint
app.register_blueprint(settings_bp)

if __name__ == '__main__':
    app.run(debug=True, port=int(os.environ.get('PORT', 5000)))
