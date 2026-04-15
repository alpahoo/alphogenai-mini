"""
engines — pluggable engine layer for video generation.

Usage (inside video_pipeline.py):
    from engines import init_engines, select_engine, generate_with_fallback

    # Once at setup:
    init_engines(generate_clip_fn=generate_clip.remote)

    # Per generation:
    engine_key = select_engine(plan="pro", duration_seconds=5)
    video_bytes, actual_key = generate_with_fallback(
        engine_key, prompt="...", job_id="...", duration_seconds=5
    )
"""
from __future__ import annotations

import logging
from typing import Callable

from .base import BaseEngine
from .router import select_engine
from .seedance import SeedanceEngine
from .wan import WanEngine

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Adapter registry — maps engine key -> adapter instance.
# ---------------------------------------------------------------------------
_wan = WanEngine()
_seedance = SeedanceEngine()

_ADAPTERS: dict[str, BaseEngine] = {
    "seedance": _seedance,
    "wan_i2v": _wan,
}

_initialized = False


def init_engines(generate_clip_fn: Callable) -> None:
    """Inject the generate_clip.remote callable into the Wan adapter.
    Must be called once before any generation.
    SeedanceEngine is self-contained (API-based) and needs no injection."""
    global _initialized
    _wan.set_generate_fn(generate_clip_fn)
    _initialized = True


def get_engine_adapter(key: str) -> BaseEngine:
    """Get an engine adapter by key. Falls back to Wan."""
    if not _initialized:
        raise RuntimeError("engines not initialized. Call init_engines() first.")
    adapter = _ADAPTERS.get(key)
    if adapter is None:
        return _ADAPTERS["wan_i2v"]
    return adapter


def generate_with_fallback(
    engine_key: str,
    prompt: str,
    job_id: str,
    duration_seconds: int = 5,
    **kwargs,
) -> tuple[bytes, str]:
    """
    Try primary engine; on failure, fall back to wan_i2v.

    Returns (video_bytes, actual_engine_key_used).
    If engine_key is already wan_i2v, no fallback wrapper — errors propagate.
    """
    engine = get_engine_adapter(engine_key)

    if engine_key == "wan_i2v":
        # Wan IS the fallback — no wrapping needed
        return engine.generate(
            prompt=prompt, job_id=job_id,
            duration_seconds=duration_seconds, **kwargs,
        ), engine_key

    try:
        video_bytes = engine.generate(
            prompt=prompt, job_id=job_id,
            duration_seconds=duration_seconds, **kwargs,
        )
        return video_bytes, engine_key
    except Exception as e:
        logger.warning(
            f"Engine '{engine_key}' failed for job={job_id} ({e}), "
            f"falling back to wan_i2v"
        )
        fallback = get_engine_adapter("wan_i2v")
        video_bytes = fallback.generate(
            prompt=prompt, job_id=job_id,
            duration_seconds=duration_seconds, **kwargs,
        )
        return video_bytes, "wan_i2v"
