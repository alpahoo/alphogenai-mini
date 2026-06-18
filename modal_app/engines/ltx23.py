"""
LTX-2.3 engine adapter (SDK officiel Lightricks, checkpoint FP8).

Wraps the generate_clip_ltx23() Modal function. Zero new generation logic —
pure delegation, like WanEngine.

Mode auto : image_url fourni → I2V, sinon → T2V. Audio natif dans le MP4.
The generate_fn callable is injected at init time to avoid circular imports
(generate_clip_ltx23 is defined in video_pipeline.py which imports engines).
"""
from __future__ import annotations

from typing import Callable
from .base import BaseEngine


class LTX23Engine(BaseEngine):
    """Adapter for the LTX-2.3 FP8 pipeline on Modal (H100, scale-to-zero)."""

    key = "ltx_2_3"

    def __init__(self, generate_fn: Callable | None = None):
        self._generate_fn = generate_fn

    def set_generate_fn(self, fn: Callable) -> None:
        """Inject the generate_clip_ltx23.remote callable after init."""
        self._generate_fn = fn

    def generate(
        self,
        prompt: str,
        job_id: str,
        duration_seconds: int = 5,
        **kwargs,
    ) -> bytes:
        if self._generate_fn is None:
            raise RuntimeError("LTX23Engine: generate_fn not set. Call set_generate_fn() first.")
        # image_url present → I2V ; absent → T2V (handled inside generate_clip_ltx23)
        image_url = kwargs.get("image_url")
        return self._generate_fn(
            prompt, job_id, image_url=image_url, duration_seconds=float(duration_seconds),
        )
