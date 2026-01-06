from __future__ import annotations

import os
import time
import uuid

import runpod

from .config import load_config
from .generate_video import VRAMInsufficientError, generate_video
from .logging_setup import get_logger
from .r2_storage import R2Client
from .supabase_client import SupabaseJobs


logger = get_logger("handler")
cfg = load_config()


def run(job):
    job_input = job.get("input") or {}
    request_id = job.get("id") or str(uuid.uuid4())

    global_caption = job_input.get("global_caption", "")
    shot_captions = job_input.get("shot_captions", [])
    num_frames = int(job_input.get("num_frames", cfg.default_num_frames))
    mode = job_input.get("mode", cfg.default_mode)
    seed = job_input.get("seed")

    sb = None
    try:
        sb = SupabaseJobs(cfg) if cfg.supabase_url and cfg.supabase_service_role_key else None
        if sb:
            sb.create_job(request_id, {"status": "queued"})
            sb.set_running(request_id)
    except Exception as e:
        logger.info("supabase init failed", extra={"error": str(e)})

    try:
        start = time.time()
        vr = generate_video(
            cfg=cfg,
            global_caption=global_caption,
            shot_captions=shot_captions,
            num_frames=num_frames,
            mode=mode,
            seed=seed,
        )
        elapsed = time.time() - start

        # Upload output
        r2 = None
        video_url = None
        try:
            r2 = R2Client(cfg)
            bucket = cfg.r2_bucket_outputs or "outputs"
            key = f"holocine/outputs/{request_id}.mp4"
            r2.upload_file(bucket, vr.local_path, key)
            video_url = r2.compose_public_url(bucket, key)
        except Exception as e:
            logger.info("r2 upload failed", extra={"error": str(e)})

        if sb:
            if video_url:
                sb.set_done(request_id, video_url)
            else:
                sb.set_done(request_id, "")

        return {
            "job_id": request_id,
            "status": "done",
            "video_url": video_url,
            "time_s": round(elapsed, 3),
        }
    except VRAMInsufficientError as e:
        if sb:
            sb.set_error(request_id, str(e))
        return {"job_id": request_id, "status": "error", "error": str(e)}
    except Exception as e:
        if sb:
            sb.set_error(request_id, str(e))
        return {"job_id": request_id, "status": "error", "error": str(e)}


runpod.serverless.start({"handler": run})
