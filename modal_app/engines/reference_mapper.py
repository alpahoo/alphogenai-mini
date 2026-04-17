"""
Reference mapper — converts normalized reference payload to engine-specific format.

Each engine has different support for references:
- Seedance (Kie.ai): first_frame_url, reference_image_urls, reference_video_urls, reference_audio_urls
- EvoLink: similar to Kie.ai but via EvoLink API (handled by GenericApiEngine)
- Wan: ignores references (GPU-local, no reference support)

This helper is called by engine adapters to map the normalized payload.
Returns empty dict if engine does not support references.
Never raises — returns {} on any error.
"""
from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


def build_engine_references(references: dict | None, engine_key: str) -> dict:
    """
    Map normalized reference payload to engine-specific format.

    Args:
        references: Normalized payload { images: [...], videos: [...], audio: [...] }
        engine_key: Engine identifier (e.g. "seedance", "wan_i2v", "evolink")

    Returns:
        Dict of engine-specific fields to merge into the API call.
        Empty dict if engine doesn't support refs or refs are empty.
    """
    if not references:
        return {}

    try:
        if engine_key in ("seedance", "evolink", "seedance_evolink"):
            return _map_kie_references(references)
        elif engine_key == "wan_i2v":
            if references:
                logger.info(f"[ref_mapper] references ignored (wan_i2v does not support them)")
            return {}
        else:
            # Unknown engine — try kie-style mapping (works for most API engines)
            return _map_kie_references(references)
    except Exception as e:
        logger.warning(f"[ref_mapper] failed for {engine_key}: {e}")
        return {}


def _map_kie_references(references: dict) -> dict:
    """Map to Kie.ai / EvoLink input format."""
    result: dict[str, Any] = {}

    images = references.get("images") or []
    videos = references.get("videos") or []
    audio = references.get("audio") or []

    # First image with role=character_face → first_frame_url (if no image_url already set)
    character_face = next(
        (r for r in images if r.get("role") == "character_face"),
        None,
    )

    # Collect reference image URLs (all non-character_face images)
    ref_image_urls = [
        r["url"] for r in images
        if r.get("url") and r.get("role") != "character_face"
    ]
    if ref_image_urls:
        result["reference_image_urls"] = ref_image_urls[:9]  # Kie.ai max 9

    # Character face as first_frame_url (if present)
    if character_face and character_face.get("url"):
        result["first_frame_url"] = character_face["url"]

    # Reference videos
    ref_video_urls = [r["url"] for r in videos if r.get("url")]
    if ref_video_urls:
        result["reference_video_urls"] = ref_video_urls[:3]  # max 3

    # Reference audio
    ref_audio_urls = [r["url"] for r in audio if r.get("url")]
    if ref_audio_urls:
        result["reference_audio_urls"] = ref_audio_urls[:3]  # max 3

    return result


def has_character_face(references: dict | None) -> bool:
    """Check if references include a character_face image."""
    if not references:
        return False
    for img in references.get("images", []):
        if img.get("role") == "character_face":
            return True
    return False
