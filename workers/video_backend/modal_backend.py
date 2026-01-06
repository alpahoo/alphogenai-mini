from __future__ import annotations

import os
from typing import Optional

import requests

from .base import VideoBackend, VideoRequest


class ModalBackend(VideoBackend):
    """
    HTTP client for the Modal video service.

    The Modal service is the unique video backend in production.
    Locally/CI we default to MockBackend.
    """

    def __init__(self, endpoint_url: Optional[str] = None):
        self.endpoint_url = (endpoint_url or os.getenv("MODAL_VIDEO_ENDPOINT_URL") or "").rstrip("/")
        if not self.endpoint_url:
            raise ValueError("MODAL_VIDEO_ENDPOINT_URL must be set for ModalBackend")

    def health(self) -> bool:
        try:
            r = requests.get(f"{self.endpoint_url}/healthz", timeout=10)
            return r.status_code == 200
        except Exception:
            return False

    def generate_video(self, req: VideoRequest) -> str:
        r = requests.post(
            f"{self.endpoint_url}/generate_film",
            json={
                "prompt": req.prompt,
                "duration": req.duration_sec,
                "fps": req.fps,
                "resolution": req.resolution,
                "seed": req.seed,
            },
            timeout=900,
        )
        r.raise_for_status()
        data = r.json()
        url = data.get("video_url") or data.get("output_url_final") or data.get("url")
        if not url:
            raise RuntimeError("Modal backend response missing video_url")
        return url

