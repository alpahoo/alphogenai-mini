"""
Wan 2.2 I2V engine adapter.

Wraps the existing generate_clip() Modal function.
Zero new generation logic — pure delegation.

The generate_fn callable is injected at init time to avoid circular
imports (generate_clip is defined in video_pipeline.py which imports engines).
"""
from __future__ import annotations

from typing import Callable
from .base import BaseEngine


class WanEngine(BaseEngine):
    """Adapter for the existing Wan 2.2 I2V pipeline on Modal."""

    key = "wan_i2v"

    def __init__(self, generate_fn: Callable | None = None):
        self._generate_fn = generate_fn

    def set_generate_fn(self, fn: Callable) -> None:
        """Inject the generate_clip.remote callable after init."""
        self._generate_fn = fn

    def generate(
        self,
        prompt: str,
        job_id: str,
        duration_seconds: int = 5,
        **kwargs,
    ) -> bytes:
        if self._generate_fn is None:
            raise RuntimeError("WanEngine: generate_fn not set. Call set_generate_fn() first.")
        return self._generate_fn(prompt, job_id)
