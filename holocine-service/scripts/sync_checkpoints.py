from __future__ import annotations

import os
import sys
from typing import Optional

from app.config import load_config
from app.logging_setup import get_logger
from app.r2_storage import R2Client


logger = get_logger("sync_checkpoints")


def main() -> int:
    cfg = load_config()
    if not cfg.auto_download:
        logger.info("AUTO_DOWNLOAD disabled; skipping checkpoints sync")
        return 0

    os.makedirs(cfg.checkpoints_path, exist_ok=True)

    # First try R2 mirror if configured
    try:
        if cfg.r2_bucket_models and cfg.r2_endpoint_url:
            r2 = R2Client(cfg)
            # Mirror all objects under prefix to local path
            prefix = "holocine/models/"
            for key in r2.list_prefix(cfg.r2_bucket_models, prefix):
                rel = key[len(prefix) :]
                local_path = os.path.join(cfg.checkpoints_path, rel)
                if os.path.exists(local_path):
                    continue
                os.makedirs(os.path.dirname(local_path), exist_ok=True)
                logger.info("download model", extra={"key": key})
                r2.download_to_path(cfg.r2_bucket_models, key, local_path)
            logger.info("R2 sync complete")
            return 0
    except Exception as e:
        logger.info("R2 sync failed, fallback HF", extra={"error": str(e)})

    # Fallback: delegate to upstream script if available
    # Try HoloCine repo's script if available
    script_path = os.path.join("/app", "HoloCine", "scripts", "download_checkpoints.py")
    if os.path.isfile(script_path):
        logger.info("Running upstream download_checkpoints.py")
        # We avoid importing to keep same behavior; run as module
        import runpy

        runpy.run_path(script_path, run_name="__main__")
        return 0

    logger.info("No checkpoints sync performed (no R2/HF script)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
