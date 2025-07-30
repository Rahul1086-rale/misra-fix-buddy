# database.py - SQLite3 database utilities for multi-session handling

import sqlite3
import asyncio
import json
import os
from typing import List, Dict, Optional, Any
from contextlib import asynccontextmanager
import threading
from concurrent.futures import ThreadPoolExecutor

class SessionDatabase:
    def __init__(self, db_path: str = "sessions.db"):
        self.db_path = db_path
        self.lock = threading.Lock()
        self.executor = ThreadPoolExecutor(max_workers=10)
        self._init_database()
    
    def _init_database(self):
        """Initialize the database with required tables"""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute('''
                CREATE TABLE IF NOT EXISTS sessions (
                    session_id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    cpp_file_path TEXT,
                    original_filename TEXT,
                    numbered_file_path TEXT,
                    excel_file_path TEXT,
                    violations TEXT,  -- JSON string
                    fixed_snippets TEXT,  -- JSON string
                    accepted_changes TEXT DEFAULT '[]',  -- JSON array of accepted line keys
                    rejected_changes TEXT DEFAULT '[]',  -- JSON array of rejected line keys
                    current_fix_index INTEGER DEFAULT 0,
                    temp_fixed_numbered_path TEXT,
                    temp_fixed_denumbered_path TEXT,
                    final_fixed_path TEXT,  -- Path to final file with only accepted changes
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # Add final_fixed_path column if it doesn't exist (for existing databases)
            try:
                conn.execute('ALTER TABLE sessions ADD COLUMN final_fixed_path TEXT')
                conn.commit()
            except sqlite3.OperationalError:
                # Column already exists
                pass
            
            conn.execute('''
                CREATE INDEX IF NOT EXISTS idx_sessions_project_id 
                ON sessions(project_id)
            ''')
            
            conn.execute('''
                CREATE INDEX IF NOT EXISTS idx_sessions_session_id 
                ON sessions(session_id)
            ''')
            
            conn.commit()
    
    async def create_session(self, session_id: str, project_id: str, **kwargs) -> bool:
        """Create a new session"""
        def _create():
            with sqlite3.connect(self.db_path) as conn:
                conn.execute('''
                    INSERT OR REPLACE INTO sessions 
                    (session_id, project_id, cpp_file_path, original_filename, 
                     numbered_file_path, excel_file_path, violations, fixed_snippets,
                     accepted_changes, rejected_changes, current_fix_index,
                     temp_fixed_numbered_path, temp_fixed_denumbered_path)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    session_id, project_id,
                    kwargs.get('cpp_file_path'),
                    kwargs.get('original_filename'),
                    kwargs.get('numbered_file_path'),
                    kwargs.get('excel_file_path'),
                    json.dumps(kwargs.get('violations', [])),
                    json.dumps(kwargs.get('fixed_snippets', {})),
                    json.dumps(kwargs.get('accepted_changes', [])),
                    json.dumps(kwargs.get('rejected_changes', [])),
                    kwargs.get('current_fix_index', 0),
                    kwargs.get('temp_fixed_numbered_path'),
                    kwargs.get('temp_fixed_denumbered_path')
                ))
                conn.commit()
                return True
        
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(self.executor, _create)
    
    async def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Get session data by session_id"""
        def _get():
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                cursor = conn.execute(
                    'SELECT * FROM sessions WHERE session_id = ?', 
                    (session_id,)
                )
                row = cursor.fetchone()
                if row:
                    session_data = dict(row)
                    # Parse JSON fields
                    session_data['violations'] = json.loads(session_data['violations'] or '[]')
                    session_data['fixed_snippets'] = json.loads(session_data['fixed_snippets'] or '{}')
                    session_data['accepted_changes'] = json.loads(session_data['accepted_changes'] or '[]')
                    session_data['rejected_changes'] = json.loads(session_data['rejected_changes'] or '[]')
                    return session_data
                return None
        
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(self.executor, _get)
    
    async def update_session(self, session_id: str, **kwargs) -> bool:
        """Update session data"""
        def _update():
            with sqlite3.connect(self.db_path) as conn:
                # Build dynamic update query
                update_fields = []
                values = []
                
                for key, value in kwargs.items():
                    if key in ['violations', 'fixed_snippets', 'accepted_changes', 'rejected_changes']:
                        update_fields.append(f"{key} = ?")
                        values.append(json.dumps(value))
                    else:
                        update_fields.append(f"{key} = ?")
                        values.append(value)
                
                if update_fields:
                    update_fields.append("updated_at = CURRENT_TIMESTAMP")
                    values.append(session_id)
                    
                    query = f'''
                        UPDATE sessions 
                        SET {', '.join(update_fields)}
                        WHERE session_id = ?
                    '''
                    
                    conn.execute(query, values)
                    conn.commit()
                    return True
                return False
        
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(self.executor, _update)
    
    async def get_session_by_project(self, project_id: str) -> Optional[Dict[str, Any]]:
        """Get session data by project_id"""
        def _get():
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                cursor = conn.execute(
                    'SELECT * FROM sessions WHERE project_id = ? ORDER BY updated_at DESC LIMIT 1', 
                    (project_id,)
                )
                row = cursor.fetchone()
                if row:
                    session_data = dict(row)
                    # Parse JSON fields
                    session_data['violations'] = json.loads(session_data['violations'] or '[]')
                    session_data['fixed_snippets'] = json.loads(session_data['fixed_snippets'] or '{}')
                    session_data['accepted_changes'] = json.loads(session_data['accepted_changes'] or '[]')
                    session_data['rejected_changes'] = json.loads(session_data['rejected_changes'] or '[]')
                    return session_data
                return None
        
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(self.executor, _get)
    
    async def accept_change(self, session_id: str, line_key: str) -> bool:
        """Accept a specific fix change"""
        session = await self.get_session(session_id)
        if not session:
            return False
        
        accepted_changes = session['accepted_changes']
        rejected_changes = session['rejected_changes']
        
        # Add to accepted if not already there
        if line_key not in accepted_changes:
            accepted_changes.append(line_key)
        
        # Remove from rejected if it was there
        if line_key in rejected_changes:
            rejected_changes.remove(line_key)
        
        return await self.update_session(
            session_id, 
            accepted_changes=accepted_changes,
            rejected_changes=rejected_changes
        )
    
    async def reject_change(self, session_id: str, line_key: str) -> bool:
        """Reject a specific fix change"""
        session = await self.get_session(session_id)
        if not session:
            return False
        
        accepted_changes = session['accepted_changes']
        rejected_changes = session['rejected_changes']
        
        # Add to rejected if not already there
        if line_key not in rejected_changes:
            rejected_changes.append(line_key)
        
        # Remove from accepted if it was there
        if line_key in accepted_changes:
            accepted_changes.remove(line_key)
        
        return await self.update_session(
            session_id, 
            accepted_changes=accepted_changes,
            rejected_changes=rejected_changes
        )
    
    async def get_filtered_snippets(self, session_id: str) -> Dict[str, str]:
        """Get only accepted code snippets"""
        session = await self.get_session(session_id)
        if not session:
            return {}
        
        fixed_snippets = session['fixed_snippets']
        accepted_changes = session['accepted_changes']
        
        # Return only accepted changes
        return {
            line_key: snippet 
            for line_key, snippet in fixed_snippets.items() 
            if line_key in accepted_changes
        }
    
    async def get_next_fix_line(self, session_id: str) -> Optional[str]:
        """Get the next line that needs review (not accepted or rejected)"""
        session = await self.get_session(session_id)
        if not session:
            return None
        
        fixed_snippets = session['fixed_snippets']
        accepted_changes = session['accepted_changes']
        rejected_changes = session['rejected_changes']
        
        reviewed_changes = set(accepted_changes + rejected_changes)
        
        # Find first unreviewed change
        for line_key in sorted(fixed_snippets.keys(), key=lambda k: int(k.split('a')[0] if 'a' in k else k)):
            if line_key not in reviewed_changes:
                return line_key
        
        return None
    
    async def get_prev_fix_line(self, session_id: str, current_line: str) -> Optional[str]:
        """Get the previous reviewed line"""
        session = await self.get_session(session_id)
        if not session:
            return None
        
        fixed_snippets = session['fixed_snippets']
        accepted_changes = session['accepted_changes']
        rejected_changes = session['rejected_changes']
        
        reviewed_changes = set(accepted_changes + rejected_changes)
        sorted_lines = sorted(fixed_snippets.keys(), key=lambda k: int(k.split('a')[0] if 'a' in k else k))
        
        current_idx = sorted_lines.index(current_line) if current_line in sorted_lines else -1
        
        # Find previous reviewed line
        for i in range(current_idx - 1, -1, -1):
            if sorted_lines[i] in reviewed_changes:
                return sorted_lines[i]
        
        return None
    
    async def cleanup_session(self, session_id: str) -> bool:
        """Clean up session and associated files"""
        def _cleanup():
            with sqlite3.connect(self.db_path) as conn:
                # Get file paths before deletion
                cursor = conn.execute(
                    'SELECT temp_fixed_numbered_path, temp_fixed_denumbered_path FROM sessions WHERE session_id = ?',
                    (session_id,)
                )
                row = cursor.fetchone()
                
                if row:
                    # Clean up temporary files
                    for file_path in row:
                        if file_path and os.path.exists(file_path):
                            try:
                                os.remove(file_path)
                            except Exception as e:
                                print(f"Error cleaning up file {file_path}: {e}")
                
                # Delete session record
                conn.execute('DELETE FROM sessions WHERE session_id = ?', (session_id,))
                conn.commit()
                return True
        
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(self.executor, _cleanup)

# Global database instance
db = SessionDatabase()
