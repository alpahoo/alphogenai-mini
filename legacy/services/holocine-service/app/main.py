from __future__ import annotations

import os
import threading
import uuid
from typing import Dict

from fastapi import FastAPI, HTTPException

from .config import load_config
from .generate_video import VRAMInsufficientError, detect_gpu, generate_video
from .logging_setup import get_logger
from .models import GenerateRequest, GenerateResponse, HealthzResponse, StatusResponse
from .r2_storage import R2Client
from .supabase_client import SupabaseJobs


app = FastAPI(title="HoloCine Service", version="0.1.0")
logger = get_logger("api")

cfg = load_config()

jobs_status: Dict[str, StatusResponse] = {}


@app.get("/healthz", response_model=HealthzResponse)
async def healthz() -> HealthzResponse:
    import torch

    gpu_name, vram_gb = detect_gpu()
    flash_attn = None
    try:
        import flash_attn  # type: ignore

        _ = flash_attn.__version__
        flash_attn = "3" if hasattr(flash_attn, "__version__") else "2"
    except Exception:
        pass

    checkpoints_ready = os.path.isdir(cfg.checkpoints_path) and any(
        os.scandir(cfg.checkpoints_path)
    )

    return HealthzResponse(
        status="ok",
        gpu=gpu_name,
        vram_gb=vram_gb,
        torch=torch.__version__,
        cuda=torch.version.cuda if hasattr(torch, "version") else None,
        flash_attn=flash_attn,
        license_mode=cfg.license_mode,
        checkpoints_ready=bool(checkpoints_ready),
    )


@app.post("/generate", response_model=GenerateResponse)
async def generate(req: GenerateRequest) -> GenerateResponse:
    mode = req.mode or cfg.default_mode
    num_frames = req.num_frames or cfg.default_num_frames

    # Immediate validation for VRAM-based mode
    try:
        from .generate_video import ensure_vram

        ensure_vram(cfg, mode, num_frames)
    except VRAMInsufficientError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception:
        # defer other errors to background
        pass

    # Create job
    job_id = str(uuid.uuid4())
    try:
        sb = SupabaseJobs(cfg) if cfg.supabase_url and cfg.supabase_service_role_key else None
        if sb:
            sb.create_job(job_id, {"status": "queued"})
    except Exception as e:
        logger.info("supabase not configured or failed", extra={"error": str(e)})

    jobs_status[job_id] = StatusResponse(status="running", progress=0.0)

    def _worker() -> None:
        try:
            if sb:
                sb.set_running(job_id)

            vr = generate_video(
                cfg=cfg,
                global_caption=req.global_caption,
                shot_captions=req.shot_captions,
                num_frames=num_frames,
                mode=mode,
                seed=req.seed,
            )

            # Upload to R2
            video_key = f"holocine/outputs/{job_id}.mp4"
            video_url = None
            try:
                r2 = R2Client(cfg)
                bucket = cfg.r2_bucket_outputs or "outputs"
                r2.upload_file(bucket, vr.local_path, video_key)
                video_url = r2.compose_public_url(bucket, video_key)
            except Exception as e:
                logger.info("r2 upload failed", extra={"error": str(e)})

            jobs_status[job_id] = StatusResponse(status="done", video_url=video_url, progress=1.0)
            if sb:
                sb.set_done(job_id, video_url or "")
        except VRAMInsufficientError as e:
            jobs_status[job_id] = StatusResponse(status="error", error=str(e))
            if sb:
                sb.set_error(job_id, str(e))
        except Exception as e:
            jobs_status[job_id] = StatusResponse(status="error", error=str(e))
            if sb:
                sb.set_error(job_id, str(e))

    th = threading.Thread(target=_worker, daemon=True)
    th.start()

    return GenerateResponse(job_id=job_id, status="queued")


@app.get("/status/{job_id}", response_model=StatusResponse)
async def status(job_id: str) -> StatusResponse:
    # Prefer Supabase if configured
    try:
        sb = SupabaseJobs(cfg) if cfg.supabase_url and cfg.supabase_service_role_key else None
        if sb:
            row = sb.get(job_id)
            if row:
                return StatusResponse(
                    status=row.get("status", "error"),
                    video_url=row.get("video_url"),
                    progress=row.get("progress"),
                    error=row.get("error"),
                )
    except Exception as e:
        logger.info("supabase status failed", extra={"error": str(e)})

    # Fallback in-memory
    st = jobs_status.get(job_id)
    if not st:
        raise HTTPException(status_code=404, detail="job not found")
    return st
