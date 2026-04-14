"""
engines — pluggable engine layer for video generation.

Usage (inside video_pipeline.py):
    from engines import init_engines, select_engine, get_engine_adapter

    # Once at setup:
    init_engines(generate_clip_fn=generate_clip.remote)

    # Per generation:
    engine_key = select_engine(plan="free", duration_seconds=5)
    engine = get_engine_adapter(engine_key)
    video_bytes = engine.generate(prompt="...", job_id="...")
"""
from __future__ import annotations

from typing import Callable
from .base import BaseEngine
from .router import select_engine
from .wan import WanEngine

# ---------------------------------------------------------------------------
# Adapter registry — maps engine key → adapter instance.
# ---------------------------------------------------------------------------
_wan = WanEngine()

_ADAPTERS: dict[str, BaseEngine] = {
    "wan_i2v": _wan,
}

_initialized = False


def init_engines(generate_clip_fn: Callable) -> None:
    """Inject the generate_clip.remote callable into the Wan adapter.
    Must be called once before any generation."""
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
