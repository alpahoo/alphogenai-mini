from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Protocol


@dataclass(frozen=True)
class VideoRequest:
    prompt: str
    duration_sec: int
    fps: int
    resolution: str
    seed: Optional[int] = None


class VideoBackend(Protocol):
    """
    Contractual interface (non-negotiable).

    - health() -> bool
    - generate_video(...) -> str (public MP4 URL)
    """

    def health(self) -> bool: ...

    def generate_video(self, req: VideoRequest) -> str: ...

