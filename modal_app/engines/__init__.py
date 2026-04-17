"""
engines — pluggable engine layer for video generation.

DB-driven adapter instantiation (Session 3/4):
- wan_i2v → WanEngine (hardcoded, GPU-local)
- any "api" type → GenericApiEngine from DB config + decrypted secrets
- unknown/failed → falls back to wan_i2v

Usage (inside video_pipeline.py):
    from engines import init_engines, select_engine, generate_with_fallback

    # Once at setup:
    init_engines(generate_clip_fn=generate_clip.remote)

    # Per generation (pass supabase_client for DB-driven routing):
    engine_key = select_engine(plan="pro", duration_seconds=5, supabase_client=sb)
    video_bytes, actual_key = generate_with_fallback(
        engine_key, prompt="...", job_id="...", duration_seconds=5,
        supabase_client=sb,
    )
"""
from __future__ import annotations

import logging
from typing import Callable

from .base import BaseEngine
from .evolink import EvoLinkEngine
from .generic_api import GenericApiEngine
from .router import select_engine
from .seedance import SeedanceEngine
from .wan import WanEngine

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Static adapters (hardcoded)
# ---------------------------------------------------------------------------
_wan = WanEngine()
_seedance_legacy = SeedanceEngine()   # fallback if DB has no Kie.ai config
_evolink = EvoLinkEngine()            # fallback if DB has no EvoLink config

_STATIC_ADAPTERS: dict[str, BaseEngine] = {
    "wan_i2v": _wan,
    "seedance": _seedance_legacy,  # legacy fallback — overridden by DB config if available
    "evolink": _evolink,           # static fallback — reads EVOLINK_API_KEY from env
}

_initialized = False


def init_engines(generate_clip_fn: Callable) -> None:
    """Inject the generate_clip.remote callable into the Wan adapter."""
    global _initialized
    _wan.set_generate_fn(generate_clip_fn)
    _initialized = True


def get_engine_adapter(key: str, supabase_client=None) -> BaseEngine:
    """
    Dynamically resolve engine adapter:
    - wan_i2v → always returns _wan (GPU-local, hardcoded)
    - api-type engine → creates GenericApiEngine from DB config
    - falls back to _wan if engine not found or misconfigured

    Args:
        key: engine key (e.g. "wan_i2v", "seedance", "kling")
        supabase_client: optional DB client for dynamic lookup
    """
    if not _initialized:
        raise RuntimeError("engines not initialized. Call init_engines() first.")

    # Wan is always hardcoded (GPU-local, no config needed)
    if key == "wan_i2v":
        return _wan

    # Try DB-driven GenericApiEngine first
    if supabase_client is not None:
        try:
            dynamic_engine = _load_dynamic_api_engine(key, supabase_client)
            if dynamic_engine:
                return dynamic_engine
        except Exception as e:
            logger.warning(f"[get_engine_adapter] DB lookup failed for {key}: {e}")

    # Fall back to static adapter (seedance has a hardcoded implementation)
    adapter = _STATIC_ADAPTERS.get(key)
    if adapter is not None:
        return adapter

    # Ultimate fallback: wan
    logger.warning(f"[get_engine_adapter] Unknown engine '{key}', falling back to wan_i2v")
    return _wan


def _load_dynamic_api_engine(engine_id: str, supabase_client) -> GenericApiEngine | None:
    """Try to load an engine from DB as GenericApiEngine. None if unavailable."""
    from modal_app.utils.encryption import load_engine_secrets

    try:
        res = (
            supabase_client.table("engines")
            .select("id, type, api_config, status")
            .eq("id", engine_id)
            .single()
            .execute()
        )
    except Exception as e:
        logger.debug(f"[_load_dynamic_api_engine] Not found in DB: {engine_id} ({e})")
        return None

    row = res.data
    if not row:
        return None
    if row.get("type") != "api":
        return None
    if row.get("status") != "active":
        logger.info(f"[_load_dynamic_api_engine] {engine_id} is {row.get('status')}, skipping")
        return None
    if not row.get("api_config"):
        logger.info(f"[_load_dynamic_api_engine] {engine_id} has no api_config, skipping")
        return None

    secrets = load_engine_secrets(supabase_client, engine_id)
    logger.info(f"[_load_dynamic_api_engine] Instantiating {engine_id} from DB "
                f"(secrets: {list(secrets.keys())})")
    return GenericApiEngine(engine_id, row["api_config"], secrets)


# Legacy name kept for backward compat
def load_generic_engine(engine_id: str, supabase_client) -> GenericApiEngine | None:
    """Deprecated: use get_engine_adapter() instead."""
    return _load_dynamic_api_engine(engine_id, supabase_client)


def generate_with_fallback(
    engine_key: str,
    prompt: str,
    job_id: str,
    duration_seconds: int = 5,
    supabase_client=None,
    **kwargs,
) -> tuple[bytes, str]:
    """
    Try primary engine; on failure, fall back to wan_i2v.
    Returns (video_bytes, actual_engine_key_used).
    """
    engine = get_engine_adapter(engine_key, supabase_client)

    if engine_key == "wan_i2v":
        return engine.generate(
            prompt=prompt, job_id=job_id,
            duration_seconds=duration_seconds, **kwargs,
        ), engine_key

    try:
        video_bytes = engine.generate(
            prompt=prompt, job_id=job_id,
            duration_seconds=duration_seconds, **kwargs,
        )
        return video_bytes, engine_key
    except Exception as e:
        logger.warning(
            f"Engine '{engine_key}' failed for job={job_id} ({e}), "
            f"falling back to wan_i2v"
        )
        fallback = get_engine_adapter("wan_i2v", supabase_client)
        video_bytes = fallback.generate(
            prompt=prompt, job_id=job_id,
            duration_seconds=duration_seconds, **kwargs,
        )
        return video_bytes, "wan_i2v"
