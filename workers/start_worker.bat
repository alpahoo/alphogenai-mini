@echo off
REM AlphoGenAI Mini Worker Startup Script for Windows

echo ========================================
echo AlphoGenAI Mini - Starting Worker
echo ========================================
echo.

REM Check if virtual environment exists
if not exist "venv\" (
    echo Virtual environment not found. Creating...
    python -m venv venv
    echo ✅ Virtual environment created
)

REM Activate virtual environment
echo Activating virtual environment...
call venv\Scripts\activate.bat

REM Install/update dependencies
echo Installing dependencies...
pip install -q -r requirements.txt
echo ✅ Dependencies installed

REM Run setup test
echo.
echo Running setup verification...
python -m workers.test_setup

REM Check if setup test passed
if %errorlevel% equ 0 (
    echo.
    echo ========================================
    echo Starting worker process...
    echo Press Ctrl+C to stop
    echo ========================================
    echo.
    
    REM Start the worker
    python -m workers.worker
) else (
    echo.
    echo ❌ Setup verification failed. Please fix the issues above.
    exit /b 1
)
