"""
Multi-Reference V1 — signed URL helper for the PRIVATE Supabase Storage
bucket `references`.

This module is NOT yet wired into the Modal pipeline runtime. It exists
so the Multi-Reference V1 implementation (next step) can mint a fresh
signed URL just before invoking an external video provider — per
future-proof-notes §3.8 ("storage path > signed URL").

Pattern mirrors `get_supabase_client()` in modal_app/video_pipeline.py:
lazy import, both env var name variants accepted, fail-fast on missing env.

DO NOT store the returned signed URL in DB. Always re-sign on demand.
"""
from __future__ import annotations

import os
from typing import Any


def _get_supabase_client() -> Any:
    """Return a Supabase service-role client. Lazy-imports the SDK."""
    from supabase import create_client  # type: ignore[import-not-found]

    url = (
        os.environ.get("SUPABASE_URL")
        or os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
    )
    key = (
        os.environ.get("SUPABASE_SERVICE_KEY")
        or os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    )
    if not url or not key:
        raise RuntimeError(
            "sign_reference_url: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY "
            "required in Modal secrets"
        )
    return create_client(url, key)


def sign_reference_url(path: str, ttl_seconds: int = 21600) -> str:
    """
    Mint a temporary signed URL for a file in the private `references` bucket.

    Args:
        path:        Storage path under bucket root,
                     e.g. "<user_id>/<job_id>/<uuid>.png"
        ttl_seconds: URL validity in seconds (default 6h = 21600)

    Returns:
        Signed URL string valid for ``ttl_seconds``. NEVER persist to DB.

    Raises:
        RuntimeError if Supabase env vars are missing or signing fails.
    """
    client = _get_supabase_client()
    res = client.storage.from_("references").create_signed_url(path, ttl_seconds)

    # Supabase Python SDK returns a dict with either "signedURL" or
    # "signed_url" depending on version — accept both.
    signed_url = None
    if isinstance(res, dict):
        signed_url = (
            res.get("signedURL")
            or res.get("signed_url")
            or res.get("signedUrl")
        )

    if not signed_url:
        raise RuntimeError(
            f"sign_reference_url: missing signed URL in response for path={path!r}: {res!r}"
        )
    return signed_url
