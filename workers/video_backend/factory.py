from __future__ import annotations

import os

from .base import VideoBackend
from .mock_backend import MockBackend
from .modal_backend import ModalBackend


def get_video_backend() -> VideoBackend:
    """
    Return the active video backend.

    Rules:
    - MockBackend is the default for local/CI.
    - ModalBackend is used when VIDEO_BACKEND=modal.
    """
    backend = (os.getenv("VIDEO_BACKEND") or "mock").strip().lower()
    if backend == "modal":
        return ModalBackend()
    return MockBackend()

