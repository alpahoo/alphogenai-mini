"""
Admin settings access with simple in-process cache.
"""
from __future__ import annotations
import time
from typing import Any, Dict, Optional

try:
    # Back-compat helper available in our module
    from .supabase_client import get_supabase_client
except Exception:
    get_supabase_client = None  # type: ignore

_cache: Dict[str, Any] = {"val": None, "ts": 0.0}


def get_admin_settings(max_age_sec: int = 60) -> Optional[Dict[str, Any]]:
    """Fetch single-row admin_settings with simple TTL cache.

    Returns None if table not present or on error.
    """
    now = time.time()
    if _cache.get("val") is not None and now - float(_cache.get("ts", 0.0)) < max_age_sec:
        return _cache["val"]

    if get_supabase_client is None:
        return None

    try:
        supa = get_supabase_client()
        res = supa.table("admin_settings").select("*").eq("id", 1).execute()
        row = (res.data or [None])[0]
        if row:
            _cache["val"] = row
            _cache["ts"] = now
            return row
    except Exception:
        # Silently ignore, caller will fallback to env defaults
        pass
    return None
