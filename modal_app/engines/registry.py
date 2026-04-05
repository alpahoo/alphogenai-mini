"""
Engine registry — catalog of all known generation engines.

Each entry describes an engine's capabilities and availability.
Only engines with status="active" are used in production routing.

Adding a new engine:
  1. Add an entry here
  2. Create an adapter in modal_app/engines/<name>.py
  3. Register it in __init__.py ADAPTERS dict
"""
from __future__ import annotations

# ---------------------------------------------------------------------------
# Feature flags
# ---------------------------------------------------------------------------
ENABLE_MULTI_GENERATION = False  # OFF — do not enable in production yet

# ---------------------------------------------------------------------------
# Engine catalog
# ---------------------------------------------------------------------------
ENGINES: dict[str, dict] = {
    "wan_i2v": {
        "name": "Wan 2.2 I2V",
        "type": "modal_local",       # runs on Modal GPU
        "status": "active",
        "plans": ["free", "pro", "premium"],
        "max_duration": 60,
        "gpu": "A100-80GB",
        "clip_duration": 5.0,        # seconds per clip
    },
    "seedance": {
        "name": "Seedance 2.0",
        "type": "api",               # future: external API call
        "status": "coming_soon",
        "plans": ["pro", "premium"],
        "max_duration": 120,
        "gpu": None,
    },
    "kling": {
        "name": "Kling 2.0",
        "type": "api",
        "status": "coming_soon",
        "plans": ["pro", "premium"],
        "max_duration": 60,
        "gpu": None,
    },
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def get_engine(key: str) -> dict | None:
    """Return engine config by key, or None if unknown."""
    return ENGINES.get(key)


def list_active_engines() -> list[str]:
    """Return keys of all engines with status='active'."""
    return [k for k, v in ENGINES.items() if v["status"] == "active"]


def is_engine_available(key: str, plan: str) -> bool:
    """Check if an engine is active and available for the given plan."""
    eng = ENGINES.get(key)
    if not eng:
        return False
    return eng["status"] == "active" and plan in eng.get("plans", [])
