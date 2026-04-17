"""
Engine registry — reads from DB (engines + engine_plans tables).

Fallback to hardcoded HARDCODED_ENGINES if DB is unreachable or the
supabase client isn't passed. This keeps production safe during the
DB migration phase.

Each engine entry has:
  - id, name, type (api|modal_local), status (active|coming_soon|deprecated)
  - max_duration, gpu, clip_duration, priority
  - api_config (JSONB, for GenericApiEngine)
  - plans: list[str]   (joined from engine_plans table)

Adding a new engine:
  - Via admin dashboard (preferred): POST /api/admin/engines
  - Via code fallback: add to HARDCODED_ENGINES below
"""
from __future__ import annotations

import logging
import os
import time
from typing import Any, Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Feature flags
# ---------------------------------------------------------------------------
ENABLE_MULTI_GENERATION = False
ENABLE_SEEDANCE = os.environ.get("ENABLE_SEEDANCE", "").lower() == "true"

# ---------------------------------------------------------------------------
# Hardcoded fallback (used only if DB is unreachable)
# Modal handles: wan_i2v (GPU local) and seedance (legacy Kie.ai).
# EvoLink engines are handled directly by Next.js — not listed here.
# ---------------------------------------------------------------------------
HARDCODED_ENGINES: dict[str, dict] = {
    "seedance": {
        "name": "Seedance 2.0 (Kie.ai)",
        "type": "api",
        "status": "active" if ENABLE_SEEDANCE else "coming_soon",
        "plans": ["pro", "premium"],
        "max_duration": 15,
        "gpu": None,
        "priority": 90,
    },
    "wan_i2v": {
        "name": "Wan 2.2 I2V",
        "type": "modal_local",
        "status": "active",
        "plans": ["free", "pro", "premium"],
        "max_duration": 60,
        "gpu": "A100-80GB",
        "clip_duration": 5.0,
        "priority": 100,
    },
}

# Backward compatibility — ENGINES is used by old code paths
ENGINES = HARDCODED_ENGINES


# ---------------------------------------------------------------------------
# Simple in-memory cache (5 min TTL) to avoid hammering DB per request
# ---------------------------------------------------------------------------
_CACHE: dict[str, Any] = {"engines": None, "expires_at": 0.0}
_CACHE_TTL_SECONDS = 300  # 5 minutes


def _fetch_engines_from_db(supabase_client) -> list[dict] | None:
    """Fetch all engines with plans from DB. Returns None on error."""
    try:
        # Engines
        eng_res = (
            supabase_client.table("engines")
            .select("*")
            .order("priority", desc=True)
            .execute()
        )
        # Plans
        plans_res = supabase_client.table("engine_plans").select("*").execute()
    except Exception as e:
        logger.warning(f"[registry] DB fetch failed: {e}")
        return None

    plans_by_engine: dict[str, list[str]] = {}
    for row in plans_res.data or []:
        plans_by_engine.setdefault(row["engine_id"], []).append(row["plan"])

    result = []
    for row in eng_res.data or []:
        result.append({
            "id": row["id"],
            "name": row["name"],
            "type": row["type"],
            "status": row["status"],
            "plans": plans_by_engine.get(row["id"], []),
            "max_duration": row["max_duration"],
            "gpu": row.get("gpu"),
            "clip_duration": row.get("clip_duration"),
            "priority": row.get("priority", 100),
            "api_config": row.get("api_config") or {},
        })
    return result


def get_all_engines(supabase_client=None) -> list[dict]:
    """Return all engines (sorted by priority desc).

    Uses cache. Falls back to HARDCODED_ENGINES if DB unreachable.
    """
    if supabase_client is None:
        return _hardcoded_as_list()

    now = time.time()
    if _CACHE["engines"] is not None and now < _CACHE["expires_at"]:
        return _CACHE["engines"]

    db_engines = _fetch_engines_from_db(supabase_client)
    if db_engines is None:
        logger.warning("[registry] Using hardcoded fallback (DB unreachable)")
        return _hardcoded_as_list()

    _CACHE["engines"] = db_engines
    _CACHE["expires_at"] = now + _CACHE_TTL_SECONDS
    return db_engines


def _hardcoded_as_list() -> list[dict]:
    """Convert HARDCODED_ENGINES dict to list format (with id + plans)."""
    result = []
    for key, spec in HARDCODED_ENGINES.items():
        result.append({
            "id": key,
            **spec,
            "api_config": {},
        })
    # Sort by priority desc
    result.sort(key=lambda e: e.get("priority", 100), reverse=True)
    return result


def invalidate_cache():
    """Force refresh on next query. Call after admin CRUD changes."""
    _CACHE["engines"] = None
    _CACHE["expires_at"] = 0.0


def get_engine(key: str, supabase_client=None) -> dict | None:
    """Return engine config by key."""
    engines = get_all_engines(supabase_client)
    for e in engines:
        if e["id"] == key:
            return e
    return None


def list_active_engines(supabase_client=None) -> list[str]:
    """Return keys of all engines with status='active'."""
    engines = get_all_engines(supabase_client)
    return [e["id"] for e in engines if e["status"] == "active"]


def is_engine_available(key: str, plan: str, supabase_client=None) -> bool:
    """Check if an engine is active AND available for the given plan."""
    eng = get_engine(key, supabase_client)
    if not eng:
        return False
    return eng["status"] == "active" and plan in eng.get("plans", [])
