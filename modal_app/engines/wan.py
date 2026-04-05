"""
Wan 2.2 I2V engine adapter.

Wraps the existing generate_clip() Modal function.
Zero new generation logic — pure delegation.
"""
from __future__ import annotations

from .base import BaseEngine


class WanEngine(BaseEngine):
    """Adapter for the existing Wan 2.2 I2V pipeline on Modal."""

    key = "wan_i2v"

    def generate(
        self,
        prompt: str,
        job_id: str,
        duration_seconds: int = 5,
        **kwargs,
    ) -> bytes:
        """
        Generate a clip using the existing Wan pipeline.

        Imports generate_clip at call time to avoid circular imports
        (generate_clip is a Modal @app.function defined in video_pipeline.py).
        """
        from modal_app.video_pipeline import generate_clip

        return generate_clip.remote(prompt, job_id)
