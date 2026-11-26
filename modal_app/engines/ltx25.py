"""
LTX-2.5 engine adapter (Lightricks, official ComfyUI templates, H100).

Wraps LTX25().generate (defined in video_pipeline.py). Pure delegation, like the
LTX-2.3 and Wan adapters. Unlike LTX-2.3 it honours the job aspect ratio natively
(704x1280 for 9:16) and can render up to 10 s in one shot. Native audio in the MP4.
"""
from __future__ import annotations

from typing import Callable

from .base import BaseEngine


class LTX25Engine(BaseEngine):
    key = "ltx_2_5"

    def __init__(self, generate_fn: Callable | None = None):
        self._generate_fn = generate_fn

    def set_generate_fn(self, fn: Callable) -> None:
        self._generate_fn = fn

    def generate(self, prompt: str, job_id: str, duration_seconds: int = 5, **kwargs) -> bytes:
        if self._generate_fn is None:
            raise RuntimeError("LTX25Engine: generate_fn not set. Call set_generate_fn() first.")
        return self._generate_fn(
            prompt, job_id,
            image_url=kwargs.get("image_url"),
            duration_seconds=float(duration_seconds),
            aspect_ratio=kwargs.get("aspect_ratio") or "16:9",
        )
