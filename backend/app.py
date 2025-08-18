from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
import time
import os
from dotenv import load_dotenv
from typing import Optional

from auth_routes import router as auth_router
from session_manager import session_manager

load_dotenv()

app = FastAPI()

# CORS middleware
origins = [
    "http://localhost:3000",  # or the address where your frontend is running
    "http://localhost",
    "http://127.0.0.1:8000",
    "http://localhost:8000",
    "https://misra-fix-copilot.vercel.app",
    "https://misra-fix-copilot.com"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Simple timing middleware
class TimingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        response = await call_next(request)
        process_time = time.time() - start_time
        response.headers["X-Process-Time"] = str(process_time)
        return response

app.add_middleware(TimingMiddleware)

# Custom exception handler
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"message": exc.detail},
    )

from settings_endpoints import router as settings_router

# Include routers
app.include_router(auth_router)
app.include_router(settings_router)

@app.get("/")
async def read_root():
    return {"message": "Welcome to the MISRA Fix Copilot backend!"}
