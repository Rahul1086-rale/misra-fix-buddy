import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from backend.session_manager import session_manager

app = Flask(__name__)
CORS(app)

@app.route('/api/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    if file:
        filename = os.path.join('uploads', file.filename)
        file.save(filename)
        return jsonify({'filename': filename}), 200

@app.route('/api/session-state', methods=['GET', 'POST'])
def handle_session_state():
    project_id = request.args.get('projectId')
    session = session_manager.get_or_create_session(project_id)

    if request.method == 'GET':
        # Return the entire session data
        return jsonify(session.data)
    elif request.method == 'POST':
        # Update the session data
        data = request.get_json()
        for key, value in data.items():
            session.set_data(key, value)
        return jsonify({'status': 'success', 'message': 'Session updated successfully'})

@app.route('/api/chat', methods=['POST'])
def handle_chat():
    data = request.get_json()
    project_id = data.get('projectId')
    message = data.get('message')

    if not project_id or not message:
        return jsonify({'error': 'Project ID and message are required'}), 400

    session = session_manager.get_or_create_session(project_id)
    chat_session = session.get_chat_session()

    if not chat_session:
        # Initialize chat session if it doesn't exist
        chat_session = []

    chat_session.append({"role": "user", "content": message})
    session.set_chat_session(chat_session)

    # Placeholder for actual LLM response
    response = f"Echo: {message}"
    chat_session.append({"role": "assistant", "content": response})
    session.set_chat_session(chat_session)

    return jsonify({'response': response}), 200

@app.route('/api/settings', methods=['GET', 'POST', 'DELETE'])
def handle_settings():
    if request.method == 'GET':
        username = request.args.get('username')
        session_id = request.args.get('sessionId')
        
        if username:
            # Load user-specific settings
            session = session_manager.get_or_create_session("default")
            settings = session.load_model_settings(username)
            return jsonify(settings)
        elif session_id:
            # Load session-specific settings
            session = session_manager.get_or_create_session(session_id)
            return jsonify(session.get_data('model_settings', {
                "temperature": 0.5,
                "top_p": 0.95,
                "max_tokens": 65535,
                "model_name": "gemini-1.5-flash",
                "safety_settings": False
            }))
        else:
            return jsonify({
                "temperature": 0.5,
                "top_p": 0.95,
                "max_tokens": 65535,
                "model_name": "gemini-1.5-flash",
                "safety_settings": False
            })
    
    elif request.method == 'POST':
        data = request.get_json()
        username = data.get('username')
        session_id = data.get('sessionId')
        
        if username:
            # Save user-specific settings
            session = session_manager.get_or_create_session("default")
            success = session.save_model_settings(data, username)
            if success:
                return jsonify({"status": "success", "message": "Settings saved successfully"})
            else:
                return jsonify({"status": "error", "message": "Failed to save settings"}), 500
        elif session_id:
            # Save session-specific settings
            session = session_manager.get_or_create_session(session_id)
            session.set_data('model_settings', data)
            return jsonify({"status": "success", "message": "Settings saved successfully"})
        else:
            return jsonify({"status": "error", "message": "Username or sessionId required"}), 400
    
    elif request.method == 'DELETE':
        username = request.args.get('username')
        
        if not username:
            return jsonify({"status": "error", "message": "Username required"}), 400
        
        # Delete user-specific settings
        session = session_manager.get_or_create_session("default")
        success = session.delete_model_settings(username)
        
        if success:
            return jsonify({"status": "success", "message": "Settings deleted successfully"})
        else:
            return jsonify({"status": "success", "message": "No settings file found to delete"})

if __name__ == '__main__':
    os.makedirs('uploads', exist_ok=True)
    app.run(debug=True, port=5000)
