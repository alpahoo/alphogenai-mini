from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
import uuid
from pathlib import Path
from typing import Optional

from .base import VideoBackend, VideoRequest
from ..supabase_client import SupabaseClient


class MockBackend(VideoBackend):
    """
    Mock backend (default for local/CI).

    Requirements (non-negotiable):
    - produces a valid dummy MP4 (~1s)
    - uploads to Supabase Storage bucket "generated" (public read)
    - returns a public MP4 URL
    """

    def __init__(self, supabase: Optional[SupabaseClient] = None):
        self.supabase = supabase or SupabaseClient()

    def health(self) -> bool:
        # If we can reach Supabase, we consider ourselves healthy.
        try:
            # Lightweight query
            self.supabase.client.table("jobs").select("id").limit(1).execute()
            return True
        except Exception:
            return False

    def generate_video(self, req: VideoRequest) -> str:
        ffmpeg = _get_ffmpeg_exe()
        output_path = _render_dummy_mp4(ffmpeg_path=ffmpeg, duration_sec=1, fps=req.fps)
        return self.supabase.upload_video_file(file_path=output_path, prefix="videos/mock")


def _get_ffmpeg_exe() -> str:
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg:
        return ffmpeg

    # Fallback for CI/local without system ffmpeg: bundle via imageio-ffmpeg
    try:
        import imageio_ffmpeg  # type: ignore

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception as e:
        raise RuntimeError(
            "ffmpeg is required for MockBackend. Install ffmpeg or add imageio-ffmpeg."
        ) from e


def _render_dummy_mp4(ffmpeg_path: str, duration_sec: int, fps: int) -> str:
    """
    Render a valid MP4 (~1s) into /tmp.
    Uses ffmpeg lavfi 'color' so it needs no assets.
    """
    temp_dir = Path(tempfile.gettempdir()) / "alphogenai-mock"
    temp_dir.mkdir(parents=True, exist_ok=True)

    out = temp_dir / f"mock_{uuid.uuid4().hex}.mp4"

    # 640x360 is enough for plumbing tests.
    cmd = [
        ffmpeg_path,
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
        raise RuntimeError(f"Failed to render mock mp4: {proc.stderr}")

    if not out.exists() or out.stat().st_size < 1000:
        raise RuntimeError("Mock mp4 output is invalid or empty.")

    return str(out)

