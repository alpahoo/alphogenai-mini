"""
Engine router — selects which engine to use for a generation request.

Reads from DB-driven registry (falls back to hardcoded on error).
Preserves priority ordering: higher priority = preferred.

Policy:
  - free plan always gets wan_i2v (safer, no API cost)
  - pro/premium get highest-priority available engine (usually seedance)
  - Preferred engine wins if valid for the plan
  - Fallback: always wan_i2v (hardcoded — the safety net)
"""
from __future__ import annotations

import logging

from .registry import get_all_engines, is_engine_available

logger = logging.getLogger(__name__)

FALLBACK_ENGINE = "wan_i2v"


def select_engine(
    plan: str = "free",
    duration_seconds: int = 5,
    preferred: str | None = None,
    supabase_client=None,
    **kwargs,
) -> str:
    """Select the best engine for the given parameters.

    Args:
        plan: user plan ("free", "pro", "premium")
        duration_seconds: target video duration
        preferred: user-requested engine key (if valid, wins)
        supabase_client: optional DB client (uses hardcoded fallback if None)

    Returns:
        Engine key string (always returns something — falls back to wan_i2v).
    """
    # 1. Preferred engine (user choice) — wins if valid
    if preferred and is_engine_available(preferred, plan, supabase_client):
        logger.info(f"engine_router: using preferred '{preferred}'")
        return preferred

    # 2. For pro/premium, find highest-priority active API engine
    #    (usually seedance/kling-like; wan_i2v is the GPU local fallback)
    if plan in ("pro", "premium"):
        engines = get_all_engines(supabase_client)
        for eng in engines:
            if (
                eng["status"] == "active"
                and plan in eng.get("plans", [])
                and duration_seconds <= eng.get("max_duration", 999)
                and eng["id"] != FALLBACK_ENGINE  # prefer API engines first
            ):
                logger.info(
                    f"engine_router: selected '{eng['id']}' (priority={eng.get('priority', 100)}) "
                    f"for plan={plan} dur={duration_seconds}s"
                )
                return eng["id"]

    # 3. Find first active engine that supports this plan (covers free + fallthrough)
    engines = get_all_engines(supabase_client)
    for eng in engines:
        if (
            eng["status"] == "active"
            and plan in eng.get("plans", [])
            and duration_seconds <= eng.get("max_duration", 999)
        ):
            logger.info(
                f"engine_router: selected '{eng['id']}' for plan={plan} dur={duration_seconds}s"
            )
            return eng["id"]

    # 4. Fallback — always safe
    logger.warning(
        f"engine_router: no match for plan={plan} dur={duration_seconds}s, "
        f"falling back to '{FALLBACK_ENGINE}'"
    )
    return FALLBACK_ENGINE
