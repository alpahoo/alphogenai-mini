"""
Modal video backend (V1) — single happy path.

Endpoints:
- GET  /healthz
- POST /generate_film  -> returns {"video_url": "<public mp4 url>"}

V1 behavior:
- Generates a short dummy MP4 to validate the full pipeline.
- Uploads MP4 to Supabase Storage bucket "generated" (public read).

TODO: Replace dummy generation with real model in Modal.
"""

from __future__ import annotations

import os
import subprocess
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import modal
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from supabase import create_client


image = (
    modal.Image.debian_slim()
    .apt_install("ffmpeg")
    .pip_install(
        "fastapi>=0.115.0",
        "pydantic>=2.0.0",
        "supabase>=2.0.0",
        "uvicorn[standard]>=0.30.0",
    )
)

app = modal.App("alphogenai-video-backend")
web = FastAPI()


class GenerateFilmRequest(BaseModel):
    prompt: str = Field(..., min_length=3)
    duration: int = Field(60, ge=1, le=600)
    fps: int = Field(24, ge=1, le=60)
    resolution: str = Field("1920x1080")
    seed: Optional[int] = None


def _supabase():
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SERVICE_KEY")
    if not url or not key:
        raise RuntimeError("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY")
    return create_client(url, key)


def _render_dummy_mp4(duration_sec: int, fps: int) -> str:
    tmp_dir = Path(tempfile.gettempdir())
    out = tmp_dir / f"modal_dummy_{uuid.uuid4().hex}.mp4"
    cmd = [
        "ffmpeg",
        "-y",
        "-f",
        "lavfi",
        "-i",
        f"color=c=black:s=640x360:d={duration_sec}:r={fps}",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        str(out),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr)
    return str(out)


def _upload_mp4(file_path: str) -> str:
    sb = _supabase()
    bucket = os.getenv("SUPABASE_BUCKET", "generated")
    p = Path(file_path)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    storage_path = f"videos/modal/{ts}_{p.name}"
    sb.storage.from_(bucket).upload(
        path=storage_path,
        file=p.read_bytes(),
        file_options={"content-type": "video/mp4"},
    )
    return sb.storage.from_(bucket).get_public_url(storage_path)


@web.get("/healthz")
def healthz():
    try:
        _supabase()
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@web.post("/generate_film")
def generate_film(req: GenerateFilmRequest):
    try:
        # V1 dummy to validate the pipeline end-to-end.
        mp4_path = _render_dummy_mp4(duration_sec=1, fps=req.fps)
        url = _upload_mp4(mp4_path)
        return {"video_url": url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.function(
    image=image,
    # GPU is configurable (A100/H100) once the real model is integrated.
    # gpu=modal.gpu.A100(),
    timeout=60 * 20,
)
@modal.asgi_app()
def fastapi_app():
    return web

