#!/usr/bin/env python
"""
Entry point for Render web service deployment.
This handles the case where Render tries to auto-detect and run 'python -m workers.web'
instead of using the startCommand from render.yaml.
"""
import sys
import os
from pathlib import Path
import threading
import asyncio

root_dir = Path(__file__).parent.parent
sys.path.insert(0, str(root_dir))

def run_polling_worker():
    """Run the background polling worker in a separate thread"""
    from workers.worker import main
    print("[workers.web] Starting polling worker thread...")
    asyncio.run(main())

if __name__ == "__main__":
    print("[workers.web] Render web service starting...")
    
    worker_thread = threading.Thread(target=run_polling_worker, daemon=True)
    worker_thread.start()
    print("[workers.web] Polling worker started in background")
    
    print("[workers.web] Starting FastAPI web server...")
    import uvicorn
    from workers.app import app
    
    port = int(os.environ.get("PORT", 8000))
    print(f"[workers.web] Binding to 0.0.0.0:{port}")
    uvicorn.run(app, host="0.0.0.0", port=port)
