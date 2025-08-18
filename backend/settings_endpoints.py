
from flask import Blueprint, request, jsonify
from session_manager import session_manager

settings_bp = Blueprint('settings', __name__)

@settings_bp.route('/api/settings', methods=['GET'])
def get_settings():
    """Get model settings for the current session"""
    try:
        project_id = request.headers.get('X-Project-ID')
        if not project_id:
            return jsonify({"error": "Project ID is required"}), 400
        
        session = session_manager.get_or_create_session(project_id)
        settings = session.get_model_settings()
        
        return jsonify(settings), 200
        
    except Exception as e:
        print(f"Error getting settings: {e}")
        return jsonify({"error": "Failed to get settings"}), 500

@settings_bp.route('/api/settings', methods=['POST'])
def save_settings():
    """Save model settings for the current session"""
    try:
        project_id = request.headers.get('X-Project-ID')
        if not project_id:
            return jsonify({"error": "Project ID is required"}), 400
        
        settings_data = request.get_json()
        if not settings_data:
            return jsonify({"error": "Settings data is required"}), 400
        
        session = session_manager.get_or_create_session(project_id)
        success = session.save_model_settings(settings_data)
        
        if success:
            return jsonify({"message": "Settings saved successfully"}), 200
        else:
            return jsonify({"error": "Failed to save settings"}), 500
            
    except Exception as e:
        print(f"Error saving settings: {e}")
        return jsonify({"error": "Failed to save settings"}), 500
