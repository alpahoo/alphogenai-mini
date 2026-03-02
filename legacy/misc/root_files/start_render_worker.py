#!/usr/bin/env python
"""
Script d'entrée pour le worker Render
Configure le PYTHONPATH et lance le worker + serveur web FastAPI
"""
import sys
import os
import threading
import asyncio
from pathlib import Path

# Ajouter le répertoire racine au PYTHONPATH
root_dir = Path(__file__).parent
sys.path.insert(0, str(root_dir))


def run_polling_worker():
    """Run the background polling worker in a separate thread"""
    from workers.worker import main
    print("[Start] Starting polling worker thread...")
    asyncio.run(main())


# Importer et lancer le worker + serveur web
if __name__ == "__main__":
    worker_thread = threading.Thread(target=run_polling_worker, daemon=True)
    worker_thread.start()
    print("[Start] Polling worker started in background")
    
    print("[Start] Starting FastAPI web server...")
    import uvicorn
    from workers.app import app
    
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
