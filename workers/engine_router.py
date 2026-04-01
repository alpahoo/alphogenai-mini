"""
Phase 1 — Engine router.

Maps engine keys to generation functions.
Currently only `wan_i2v` is implemented (the stable v3 pipeline).
Future engines (seedance, kling, etc.) plug in here.

Usage:
    from engine_router import pick_engine, ENGINES

    engine_key = pick_engine(plan="free", duration_sec=5.0)
    # => "wan_i2v"
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Engine registry
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class EngineSpec:
    """Describes an available video generation engine."""

    key: str
    label: str
    max_duration_sec: float
    gpu: str                    # Modal GPU class
    supports_i2v: bool = True   # image-to-video
    supports_t2v: bool = False  # text-to-video direct
    enabled: bool = True


ENGINES: dict[str, EngineSpec] = {
    "wan_i2v": EngineSpec(
        key="wan_i2v",
        label="Wan 2.2 I2V (14B)",
        max_duration_sec=5.0,
        gpu="A100-80GB",
        supports_i2v=True,
        supports_t2v=False,
        enabled=True,
    ),
    # Phase 2+ stubs — disabled until integrated
    "seedance": EngineSpec(
        key="seedance",
        label="Seedance 2.0",
        max_duration_sec=10.0,
        gpu="A100-80GB",
        supports_i2v=True,
        supports_t2v=True,
        enabled=False,
    ),
}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def pick_engine(
    plan: str = "free",
    duration_sec: float = 5.0,
    preferred: str | None = None,
) -> str:
    """
    Select the best engine for the given parameters.

    Phase 1: always returns "wan_i2v" (only enabled engine).
    Phase 2: will consider plan, duration, preferred engine, load balancing.
    """
    # If caller explicitly requests an engine and it's enabled, use it
    if preferred and preferred in ENGINES and ENGINES[preferred].enabled:
        return preferred

    # Default selection: first enabled engine that supports the duration
    for key, spec in ENGINES.items():
        if spec.enabled and spec.supports_i2v:
            return key

    # Fallback (should never happen if wan_i2v is enabled)
    logger.warning("No enabled engine found, falling back to wan_i2v")
    return "wan_i2v"


def get_engine_spec(engine_key: str) -> EngineSpec | None:
    """Get the spec for an engine, or None if unknown."""
    return ENGINES.get(engine_key)


def list_enabled_engines() -> list[EngineSpec]:
    """Return all currently enabled engines."""
    return [spec for spec in ENGINES.values() if spec.enabled]
