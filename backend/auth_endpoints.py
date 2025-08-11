
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from auth_db import AuthDatabase, setup_default_users

router = APIRouter(prefix="/api/auth", tags=["authentication"])

class LoginRequest(BaseModel):
    username: str
    password: str

class LoginResponse(BaseModel):
    success: bool
    user: dict = None
    message: str = ""

class CreateUserRequest(BaseModel):
    username: str
    password: str
    role: str = "user"

@router.post("/login", response_model=LoginResponse)
async def login(request: LoginRequest):
    """Authenticate user with SQLite3 database"""
    try:
        auth_db = AuthDatabase()
        user = auth_db.authenticate_user(request.username, request.password)
        
        if user:
            return LoginResponse(
                success=True,
                user=user,
                message="Login successful"
            )
        else:
            return LoginResponse(
                success=False,
                message="Invalid username or password"
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Authentication error: {str(e)}")

@router.post("/create-user")
async def create_user(request: CreateUserRequest):
    """Create a new user (admin only endpoint)"""
    try:
        auth_db = AuthDatabase()
        success = auth_db.create_user(request.username, request.password, request.role)
        
        if success:
            return {"success": True, "message": "User created successfully"}
        else:
            return {"success": False, "message": "Username already exists"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating user: {str(e)}")

@router.post("/setup-default-users")
async def setup_default_users_endpoint():
    """Setup default users (admin, user, reviewer) - can be called manually"""
    try:
        setup_default_users()
        return {"success": True, "message": "Default users setup completed"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error setting up default users: {str(e)}")

@router.get("/users")
async def get_users():
    """Get all users (admin only endpoint)"""
    try:
        auth_db = AuthDatabase()
        users = auth_db.get_all_users()
        return {"users": users}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching users: {str(e)}")
