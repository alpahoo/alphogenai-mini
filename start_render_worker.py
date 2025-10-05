#!/usr/bin/env python
"""
Script d'entrée pour le worker Render
Configure le PYTHONPATH et lance le worker
"""
import sys
import os
from pathlib import Path

# Ajouter le répertoire racine au PYTHONPATH
root_dir = Path(__file__).parent
sys.path.insert(0, str(root_dir))

# Importer et lancer le worker
if __name__ == "__main__":
    from workers.worker import main
    import asyncio
    asyncio.run(main())
