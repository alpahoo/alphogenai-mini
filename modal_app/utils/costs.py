"""
Internal cost estimation for video generation.

NOT a billing system — internal tracking only.
Never raises exceptions. Never blocks generation.
"""
from __future__ import annotations

# ---------------------------------------------------------------------------
# Cost config per engine
# ---------------------------------------------------------------------------
ENGINE_COSTS: dict[str, dict] = {
    "wan_i2v": {
        "billing_model": "per_second",
        "per_second_usd": 0.015,
    },
    "seedance": {
        "billing_model": "per_second",
        "per_second_usd": 0.025,
    },
}


def estimate_cost(engine_key: str, duration_seconds: int) -> float:
    """
    Estimate generation cost in USD.

    Returns 0.0 on unknown engine — never raises.
    """
    config = ENGINE_COSTS.get(engine_key)

    if not config:
        print(f"[cost] unknown engine: {engine_key}")
        return 0.0

    if config["billing_model"] == "per_video":
        return float(config.get("per_video_usd", 0.0))

    return float(config.get("per_second_usd", 0.0)) * duration_seconds
