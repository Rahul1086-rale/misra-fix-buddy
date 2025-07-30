#!/usr/bin/env python3
"""
Startup script for MISRA Fix Copilot Backend
"""

import os
import sys
import subprocess

def main():
    # Change to backend directory
    backend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'backend')
    os.chdir(backend_dir)
    
    print("🚀 Starting MISRA Fix Copilot Backend...")
    print(f"📁 Working directory: {os.getcwd()}")
    
    # Check if required packages are installed
    try:
        import fastapi
        import uvicorn
        import google.cloud.aiplatform
        print("✅ Required packages found")
    except ImportError as e:
        print(f"❌ Missing required package: {e}")
        print("📦 Installing requirements...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", "requirements.txt"])
    
    # Run the FastAPI app
    print("🌐 Starting FastAPI server on http://localhost:5000")
    subprocess.run([
        sys.executable, "-m", "uvicorn", 
        "app:app", 
        "--host", "0.0.0.0", 
        "--port", "5000", 
        "--reload"
    ])

if __name__ == "__main__":
    main()