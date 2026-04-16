"""
Internal cost estimation for video generation.

Reads from engine_costs table (DB-driven) with hardcoded fallback.
NOT a billing system — internal tracking only.
Never raises exceptions. Never blocks generation.
"""
from __future__ import annotations

import logging
import time
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Hardcoded fallback (used only if DB unreachable)
# ---------------------------------------------------------------------------
HARDCODED_COSTS: dict[str, dict] = {
    "wan_i2v": {
        "billing_model": "per_second",
        "per_second_usd": 0.015,
    },
    "seedance": {
        "billing_model": "per_second",
        "per_second_usd": 0.025,
    },
}

# Backward-compat alias
ENGINE_COSTS = HARDCODED_COSTS


# ---------------------------------------------------------------------------
# 5-minute cache
# ---------------------------------------------------------------------------
_CACHE: dict[str, Any] = {"costs": None, "expires_at": 0.0}
_CACHE_TTL_SECONDS = 300


def _fetch_costs_from_db(supabase_client) -> dict[str, dict] | None:
    """Fetch all engine costs from DB. Returns dict {engine_id: cost_config}."""
    try:
        res = supabase_client.table("engine_costs").select("*").execute()
    except Exception as e:
        logger.warning(f"[costs] DB fetch failed: {e}")
        return None

    costs: dict[str, dict] = {}
    for row in res.data or []:
        costs[row["engine_id"]] = {
            "billing_model": row["billing_model"],
            "per_second_usd": row.get("per_second_usd"),
            "per_video_usd": row.get("per_video_usd"),
        }
    return costs


def _get_costs(supabase_client=None) -> dict[str, dict]:
    """Get cost config dict. Uses cache + falls back to hardcoded."""
    if supabase_client is None:
        return HARDCODED_COSTS

    now = time.time()
    if _CACHE["costs"] is not None and now < _CACHE["expires_at"]:
        return _CACHE["costs"]

    db_costs = _fetch_costs_from_db(supabase_client)
    if db_costs is None:
        return HARDCODED_COSTS

    _CACHE["costs"] = db_costs
    _CACHE["expires_at"] = now + _CACHE_TTL_SECONDS
    return db_costs


def invalidate_cache():
    """Force refresh on next query."""
    _CACHE["costs"] = None
    _CACHE["expires_at"] = 0.0


def estimate_cost(engine_key: str, duration_seconds: int, supabase_client=None) -> float:
    """
    Estimate generation cost in USD.

    Returns 0.0 on unknown engine — never raises.
    """
    costs = _get_costs(supabase_client)
    config = costs.get(engine_key)

    if not config:
        print(f"[cost] unknown engine: {engine_key}")
        return 0.0

    if config["billing_model"] == "per_video":
        return float(config.get("per_video_usd") or 0.0)

    per_sec = config.get("per_second_usd")
    if per_sec is None:
        return 0.0
    return float(per_sec) * duration_seconds
