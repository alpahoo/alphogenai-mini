#!/usr/bin/env python3
"""
Verify Supabase Storage bucket "generated" is public read (V1).

Non-negotiable check:
1) Upload a small MP4 into bucket `generated` using service role key
2) Fetch the returned public URL over HTTP and verify status=200

Env required:
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY)
- SUPABASE_BUCKET (default: generated)
"""

from __future__ import annotations

import os
import subprocess
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path

import requests
from supabase import create_client


def _require(name: str) -> str:
    v = os.getenv(name)
    if not v:
        raise SystemExit(f"Missing env var: {name}")
    return v


def _ffmpeg() -> str:
    # prefer system ffmpeg, fallback to imageio-ffmpeg
    from shutil import which

    p = which("ffmpeg")
    if p:
        return p

    import imageio_ffmpeg  # type: ignore

    return imageio_ffmpeg.get_ffmpeg_exe()


def _render_dummy_mp4(duration_sec: int = 1, fps: int = 24) -> Path:
    out = Path(tempfile.gettempdir()) / f"verify_{uuid.uuid4().hex}.mp4"
    cmd = [
        _ffmpeg(),
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
        raise SystemExit(f"ffmpeg failed: {proc.stderr}")
    if not out.exists() or out.stat().st_size < 1000:
        raise SystemExit("Dummy mp4 is invalid/empty")
    return out


def main() -> None:
    supabase_url = _require("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SERVICE_KEY")
    if not supabase_key:
        raise SystemExit("Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_KEY")

    bucket = os.getenv("SUPABASE_BUCKET", "generated")
    sb = create_client(supabase_url, supabase_key)

    mp4 = _render_dummy_mp4()
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    obj_path = f"verify/{ts}_{mp4.name}"

    sb.storage.from_(bucket).upload(
        path=obj_path,
        file=mp4.read_bytes(),
        file_options={"content-type": "video/mp4"},
    )
    url = sb.storage.from_(bucket).get_public_url(obj_path)

    r = requests.get(url, timeout=30)
    if r.status_code != 200:
        raise SystemExit(f"Public fetch failed: {r.status_code}")

    ct = r.headers.get("content-type", "")
    if "video" not in ct and "mp4" not in ct:
        print(f"⚠️ Unexpected content-type: {ct}")

    # best-effort cleanup (does not affect check)
    try:
        sb.storage.from_(bucket).remove([obj_path])
    except Exception:
        pass

    print("✅ Supabase Storage is public-read for bucket:", bucket)
    print("✅ Public URL fetch OK:", url)


if __name__ == "__main__":
    main()

