"""
modal_app.engines — pluggable engine layer for video generation.

Usage:
    from modal_app.engines import get_engine_adapter, select_engine

    engine_key = select_engine(plan="free", duration_seconds=5)
    engine = get_engine_adapter(engine_key)
    video_bytes = engine.generate(prompt="...", job_id="...")
"""
from __future__ import annotations

from .base import BaseEngine
from .router import select_engine
from .wan import WanEngine

# ---------------------------------------------------------------------------
# Adapter registry — maps engine key → adapter instance.
# Add new adapters here as they are implemented.
# ---------------------------------------------------------------------------
_ADAPTERS: dict[str, BaseEngine] = {
    "wan_i2v": WanEngine(),
}


def get_engine_adapter(key: str) -> BaseEngine:
    """
    Get an engine adapter by key.

    Falls back to Wan if the requested key has no adapter.
    """
    adapter = _ADAPTERS.get(key)
    if adapter is None:
        # Fallback: Wan is always available
        return _ADAPTERS["wan_i2v"]
    return adapter
