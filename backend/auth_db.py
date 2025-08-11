
import sqlite3
import hashlib
import os
from typing import Optional, Dict

class AuthDatabase:
    def __init__(self, db_path: str = "auth.db"):
        self.db_path = db_path
        self.init_database()
    
    def init_database(self):
        """Initialize the database and create users table if it doesn't exist"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'user',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        conn.commit()
        conn.close()
    
    def create_password_hash(self, username: str, password: str) -> str:
        """Create SHA256 hash of username + password"""
        combined = f"{username}:{password}"
        return hashlib.sha256(combined.encode()).hexdigest()
    
    def create_user(self, username: str, password: str, role: str = 'user') -> bool:
        """Create a new user with hashed password"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            password_hash = self.create_password_hash(username, password)
            
            cursor.execute(
                "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
                (username, password_hash, role)
            )
            
            conn.commit()
            conn.close()
            return True
        except sqlite3.IntegrityError:
            # Username already exists
            return False
        except Exception as e:
            print(f"Error creating user: {e}")
            return False
    
    def authenticate_user(self, username: str, password: str) -> Optional[Dict[str, str]]:
        """Authenticate user with username and password"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            password_hash = self.create_password_hash(username, password)
            
            cursor.execute(
                "SELECT username, role FROM users WHERE username = ? AND password_hash = ?",
                (username, password_hash)
            )
            
            result = cursor.fetchone()
            conn.close()
            
            if result:
                return {
                    "username": result[0],
                    "role": result[1]
                }
            return None
        except Exception as e:
            print(f"Error authenticating user: {e}")
            return None
    
    def get_all_users(self) -> list:
        """Get all users (for admin purposes)"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute("SELECT username, role, created_at FROM users")
            results = cursor.fetchall()
            conn.close()
            
            return [{"username": row[0], "role": row[1], "created_at": row[2]} for row in results]
        except Exception as e:
            print(f"Error getting users: {e}")
            return []

# Initialize database and create default users
def setup_default_users():
    """Setup default users for the application"""
    auth_db = AuthDatabase()
    
    # Create default users (similar to the JSON file)
    default_users = [
        {"username": "admin", "password": "admin123", "role": "admin"},
        {"username": "user", "password": "user123", "role": "user"},
        {"username": "reviewer", "password": "review123", "role": "reviewer"}
    ]
    
    for user in default_users:
        success = auth_db.create_user(user["username"], user["password"], user["role"])
        if success:
            print(f"Created user: {user['username']}")
        else:
            print(f"User {user['username']} already exists")

if __name__ == "__main__":
    setup_default_users()
