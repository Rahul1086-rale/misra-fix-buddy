
import threading
import asyncio
from typing import Dict, Any, Optional
from dataclasses import dataclass, field
from datetime import datetime, timedelta
import uuid
import json
import os

@dataclass
class ProjectSession:
    """Thread-safe project session with its own lock"""
    project_id: str
    created_at: datetime = field(default_factory=datetime.now)
    last_accessed: datetime = field(default_factory=datetime.now)
    data: Dict[str, Any] = field(default_factory=dict)
    chat_session: Any = None
    _lock: threading.RLock = field(default_factory=threading.RLock)
    
    def update_access_time(self):
        """Update last accessed timestamp"""
        with self._lock:
            self.last_accessed = datetime.now()
    
    def get_data(self, key: str, default=None):
        """Thread-safe data retrieval"""
        with self._lock:
            self.update_access_time()
            return self.data.get(key, default)
    
    def set_data(self, key: str, value: Any):
        """Thread-safe data storage"""
        with self._lock:
            self.update_access_time()
            self.data[key] = value
    
    def get_chat_session(self):
        """Thread-safe chat session retrieval"""
        with self._lock:
            self.update_access_time()
            return self.chat_session
    
    def set_chat_session(self, chat_session: Any):
        """Thread-safe chat session storage"""
        with self._lock:
            self.update_access_time()
            self.chat_session = chat_session
    
    def get_settings(self):
        """Get session-specific settings"""
        with self._lock:
            self.update_access_time()
            settings_file = f"{self.project_id}_default_setting.json"
            
            if os.path.exists(settings_file):
                try:
                    with open(settings_file, 'r') as f:
                        return json.load(f)
                except Exception as e:
                    print(f"Error loading session settings: {e}")
            
            # Return default settings if file doesn't exist
            return {
                "temperature": 0.5,
                "top_p": 0.95,
                "max_tokens": 65535,
                "model_name": "gemini-1.5-flash",
                "safety_settings": False
            }
    
    def save_settings(self, settings: Dict[str, Any]):
        """Save session-specific settings"""
        with self._lock:
            self.update_access_time()
            settings_file = f"{self.project_id}_default_setting.json"
            
            try:
                with open(settings_file, 'w') as f:
                    json.dump(settings, f, indent=2)
                return True
            except Exception as e:
                print(f"Error saving session settings: {e}")
                return False

class ConcurrentSessionManager:
    """Thread-safe session manager for handling multiple concurrent requests"""
    
    def __init__(self):
        self._sessions: Dict[str, ProjectSession] = {}
        self._global_lock = threading.RLock()
        self._cleanup_interval = 3600  # 1 hour
        self._session_timeout = 7200   # 2 hours
        
        # Start cleanup task
        self._start_cleanup_task()
    
    def get_or_create_session(self, project_id: str) -> ProjectSession:
        """Get existing session or create new one"""
        if not project_id:
            project_id = str(uuid.uuid4())
            
        with self._global_lock:
            if project_id not in self._sessions:
                self._sessions[project_id] = ProjectSession(project_id=project_id)
            
            session = self._sessions[project_id]
            session.update_access_time()
            return session
    
    def get_session(self, project_id: str) -> Optional[ProjectSession]:
        """Get existing session without creating"""
        with self._global_lock:
            session = self._sessions.get(project_id)
            if session:
                session.update_access_time()
            return session
    
    def remove_session(self, project_id: str) -> bool:
        """Remove session"""
        with self._global_lock:
            return self._sessions.pop(project_id, None) is not None
    
    def cleanup_expired_sessions(self):
        """Remove expired sessions"""
        current_time = datetime.now()
        expired_sessions = []
        
        with self._global_lock:
            for project_id, session in self._sessions.items():
                if (current_time - session.last_accessed).total_seconds() > self._session_timeout:
                    expired_sessions.append(project_id)
            
            for project_id in expired_sessions:
                self._sessions.pop(project_id, None)
                # Optionally clean up session settings file
                settings_file = f"{project_id}_default_setting.json"
                if os.path.exists(settings_file):
                    try:
                        os.remove(settings_file)
                        print(f"Cleaned up settings file: {settings_file}")
                    except Exception as e:
                        print(f"Error cleaning up settings file {settings_file}: {e}")
        
        print(f"Cleaned up {len(expired_sessions)} expired sessions")
    
    def _start_cleanup_task(self):
        """Start background cleanup task"""
        def cleanup_worker():
            while True:
                try:
                    self.cleanup_expired_sessions()
                    threading.Event().wait(self._cleanup_interval)
                except Exception as e:
                    print(f"Session cleanup error: {e}")
        
        cleanup_thread = threading.Thread(target=cleanup_worker, daemon=True)
        cleanup_thread.start()

# Global session manager instance
session_manager = ConcurrentSessionManager()
