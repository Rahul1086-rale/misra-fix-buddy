
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from auth_endpoints import router as auth_router
from auth_db import AuthDatabase
import os

app = FastAPI(title="MISRA Fix Copilot Backend", version="1.0.0")

# Configure CORS - more permissive for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://localhost:8080"],  # Add more frontend URLs
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],  # Explicitly include OPTIONS
    allow_headers=["*"],
    expose_headers=["*"],
)

# Include authentication routes
app.include_router(auth_router)

@app.get("/")
async def root():
    return {"message": "MISRA Fix Copilot Backend is running!"}

@app.get("/health")
async def health_check():
    return {"status": "healthy", "message": "Backend is operational"}

# Add OPTIONS handler for all routes
@app.options("/{full_path:path}")
async def options_handler():
    return {"message": "OK"}

@app.on_event("startup")
async def startup_event():
    """Initialize the database on startup"""
    print("🚀 Starting MISRA Fix Copilot Backend...")
    
    # Initialize the database (creates tables if they don't exist)
    auth_db = AuthDatabase()
    print("✅ Database initialized")
    
    # Only setup default users if no admin user exists
    if not auth_db.user_exists("admin"):
        print("🔧 No admin user found, setting up default users...")
        from auth_db import setup_default_users
        setup_default_users()
    else:
        print("ℹ️  Database already has users, skipping default user setup")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)
