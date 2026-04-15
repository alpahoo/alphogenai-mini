"""
Engine router — selects which engine to use for a generation request.

Current behavior: always returns wan_i2v (only active engine).
Future: will consider plan, duration, preferred engine, cost, quality.
"""
from __future__ import annotations

import logging

from .registry import ENGINES, is_engine_available

logger = logging.getLogger(__name__)

FALLBACK_ENGINE = "wan_i2v"


def select_engine(
    plan: str = "free",
    duration_seconds: int = 5,
    preferred: str | None = None,
    **kwargs,
) -> str:
    """
    Select the best engine for the given parameters.

    Args:
        plan: user plan (free/pro/premium)
        duration_seconds: target video duration
        preferred: explicitly requested engine key (optional)
        **kwargs: reserved for future routing signals

    Returns:
        Engine key string (e.g. "wan_i2v").
    """
    # 1. If caller explicitly requests an engine and it's available, use it
    if preferred and is_engine_available(preferred, plan):
        logger.info(f"engine_router: using preferred engine '{preferred}'")
        return preferred

    # 2. Explicit priority: pro/premium get seedance when active
    #    This is intentionally explicit — do NOT rely on dict ordering.
    if plan in ("pro", "premium") and is_engine_available("seedance", plan):
        if duration_seconds <= ENGINES.get("seedance", {}).get("max_duration", 999):
            logger.info(
                f"engine_router: selected 'seedance' for plan={plan} dur={duration_seconds}s"
            )
            return "seedance"

    # 3. Find first active engine that supports this plan (covers free + fallthrough)
    for key, spec in ENGINES.items():
        if spec["status"] == "active" and plan in spec.get("plans", []):
            if duration_seconds <= spec.get("max_duration", 999):
                logger.info(
                    f"engine_router: selected '{key}' for plan={plan} dur={duration_seconds}s"
                )
                return key

    # 4. Fallback — always safe
    logger.warning(
        f"engine_router: no matching engine for plan={plan} dur={duration_seconds}s, "
        f"falling back to '{FALLBACK_ENGINE}'"
    )
    return FALLBACK_ENGINE
