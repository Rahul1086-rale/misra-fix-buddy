import os
import uuid
from flask import Flask, request, jsonify
from flask_cors import CORS
from backend.session_manager import session_manager

app = Flask(__name__)
CORS(app)

@app.route('/api/chat', methods=['POST'])
def chat():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    project_id = data.get('project_id')
    user_message = data.get('message')

    if not project_id:
        return jsonify({'error': 'Project ID is required'}), 400
    if not user_message:
        return jsonify({'error': 'Message is required'}), 400

    session = session_manager.get_or_create_session(project_id)
    chat_session = session.get_chat_session()

    if not chat_session:
        from backend.llm_factory import LLMFactory
        chat_session = LLMFactory.get_chat_session()
        session.set_chat_session(chat_session)

    response = chat_session.send_message(user_message)
    return jsonify({'response': response})

@app.route('/api/projects', methods=['POST'])
def create_project():
    project_id = str(uuid.uuid4())
    return jsonify({'project_id': project_id}), 201

@app.route('/api/settings', methods=['GET', 'POST', 'DELETE'])
def handle_settings():
    if request.method == 'GET':
        username = request.args.get('username')
        if not username:
            return jsonify({'error': 'Username is required'}), 400
        
        # Get or create session for this request
        project_id = request.args.get('project_id', 'default')
        session = session_manager.get_or_create_session(project_id)
        
        # Load user-specific settings
        settings = session.load_model_settings(username)
        return jsonify(settings)
    
    elif request.method == 'POST':
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        username = data.get('username')
        if not username:
            return jsonify({'error': 'Username is required'}), 400
        
        # Get or create session for this request
        project_id = data.get('project_id', 'default')
        session = session_manager.get_or_create_session(project_id)
        
        # Remove username from settings data before saving
        settings_data = {k: v for k, v in data.items() if k != 'username'}
        
        # Save user-specific settings
        success = session.save_model_settings(settings_data, username)
        if success:
            return jsonify({'message': 'Settings saved successfully'})
        else:
            return jsonify({'error': 'Failed to save settings'}), 500
    
    elif request.method == 'DELETE':
        username = request.args.get('username')
        if not username:
            return jsonify({'error': 'Username is required'}), 400
        
        # Get or create session for this request
        project_id = request.args.get('project_id', 'default')
        session = session_manager.get_or_create_session(project_id)
        
        # Delete user-specific settings
        success = session.delete_model_settings(username)
        if success:
            return jsonify({'message': 'Settings reset successfully'})
        else:
            return jsonify({'message': 'No settings found to delete'})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(debug=True, host='0.0.0.0', port=port)
