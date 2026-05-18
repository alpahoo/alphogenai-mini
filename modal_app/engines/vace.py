"""
VACE (Video Ace) engine adapter.

Conditional video generation — supports reference frames, edge maps,
depth conditioning, and subject-driven generation.

Model: ali-vilab/VACE-Wan2.1-14B-Diffusers
GPU: A100-80GB (14B active params, similar to Wan I2V)
"""
from __future__ import annotations

from .base import BaseEngine


class VACEEngine(BaseEngine):
    """VACE conditional video generation adapter for Modal."""

    key = "vace_14b"

    def generate(
        self,
        prompt: str,
        job_id: str,
        duration_seconds: int = 5,
        **kwargs,
    ) -> bytes:
        """
        Generate video with VACE conditioning.

        Expected kwargs:
            image_url: str | None — reference image for subject-driven gen
            condition_type: str — "reference" | "edge" | "depth" | "pose"

        Returns MP4 bytes.
        """
        raise NotImplementedError(
            "VACEEngine.generate() is a stub. "
            "Deploy modal_app with GPU to enable VACE generation. "
            "See modal_app/setup_models.py for model download."
        )
