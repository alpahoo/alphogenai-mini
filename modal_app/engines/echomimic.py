"""
EchoMimicV3 engine adapter.

Audio-driven talking face animation — generates a video of a face
lip-syncing and expressing emotions driven by an audio track.

Model: BadToBest/EchoMimicV3 (or antgroup/echomimic_v2)
GPU: A100-80GB (transformer-based, needs 40GB+ VRAM)

Input: face image + audio file → talking head video
"""
from __future__ import annotations

from .base import BaseEngine


class EchoMimicEngine(BaseEngine):
    """EchoMimicV3 talking face animation adapter for Modal."""

    key = "echomimic_v3"

    def generate(
        self,
        prompt: str,
        job_id: str,
        duration_seconds: int = 5,
        **kwargs,
    ) -> bytes:
        """
        Generate talking face video from image + audio.

        Expected kwargs:
            image_url: str — face image URL
            audio_url: str — driving audio URL
            emotion: str — target emotion ("neutral", "happy", "sad", etc.)

        Returns MP4 bytes.
        """
        raise NotImplementedError(
            "EchoMimicEngine.generate() is a stub. "
            "Deploy modal_app with GPU to enable talking face generation. "
            "See modal_app/setup_models.py for model download."
        )
