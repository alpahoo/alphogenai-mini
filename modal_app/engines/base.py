"""
Base engine interface.

All engine adapters must implement the generate() method.
Keep this minimal — avoid overabstraction.
"""
from __future__ import annotations

from abc import ABC, abstractmethod


class BaseEngine(ABC):
    """Abstract base for all video generation engines."""

    key: str  # must match registry key (e.g. "wan_i2v")

    @abstractmethod
    def generate(
        self,
        prompt: str,
        job_id: str,
        duration_seconds: int = 5,
        **kwargs,
    ) -> bytes:
        """
        Generate a single video clip.

        Args:
            prompt: text description of the scene
            job_id: unique job identifier (used for logging + R2 key)
            duration_seconds: target clip duration
            **kwargs: engine-specific options

        Returns:
            Raw MP4 bytes.
        """
        raise NotImplementedError
