"""
Real-ESRGAN 4x video upscaler engine adapter.

Post-processing step: takes a generated video and upscales it 4x.
Not a generation engine — used as an enhancement after clip generation.

Model: xinntao/Real-ESRGAN (realesrgan-x4plus)
GPU: A10G (lighter than A100, sufficient for upscaling)
"""
from __future__ import annotations

from .base import BaseEngine


class RealESRGANEngine(BaseEngine):
    """Real-ESRGAN 4x upscaler adapter for Modal."""

    key = "realesrgan_4x"

    def generate(
        self,
        prompt: str,
        job_id: str,
        duration_seconds: int = 5,
        **kwargs,
    ) -> bytes:
        """
        Upscale video frames using Real-ESRGAN.

        Expected kwargs:
            input_video_bytes: bytes — the source video to upscale
            scale: int — upscale factor (default 4)

        Returns upscaled MP4 bytes.
        """
        raise NotImplementedError(
            "RealESRGANEngine.generate() is a stub. "
            "Deploy modal_app with GPU to enable upscaling. "
            "See modal_app/setup_models.py for model download."
        )
