#!/bin/bash

# AlphoGenAI Mini Worker Startup Script

echo "========================================"
echo "AlphoGenAI Mini - Starting Worker"
echo "========================================"
echo ""

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "Virtual environment not found. Creating..."
    python3 -m venv venv
    echo "✅ Virtual environment created"
fi

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate

# Install/update dependencies
echo "Installing dependencies..."
pip install -q -r requirements.txt
echo "✅ Dependencies installed"

# Run setup test
echo ""
echo "Running setup verification..."
python -m workers.test_setup

# Check if setup test passed
if [ $? -eq 0 ]; then
    echo ""
    echo "========================================"
    echo "Starting worker process..."
    echo "Press Ctrl+C to stop"
    echo "========================================"
    echo ""
    
    # Start the worker
    python -m workers.worker
else
    echo ""
    echo "❌ Setup verification failed. Please fix the issues above."
    exit 1
fi
