"""
Phase 1 — Template-based storyboard generator.

Splits a user prompt into N scenes based on target_duration.
No LLM dependency: pure Python, deterministic, safe.

Output format (list of dicts):
[
    {
        "scene_index": 0,
        "prompt": "scene-level prompt text",
        "engine": "wan_i2v",
        "duration_sec": 5.0,
    },
    ...
]
"""
from __future__ import annotations

import logging
import math
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
DEFAULT_CLIP_DURATION = 5.0   # seconds per scene (matches current v3 pipeline)
MIN_CLIP_DURATION = 3.0
MAX_CLIP_DURATION = 10.0

# Plan limits (mirrors lib/types.ts PLAN_MAX_DURATION)
PLAN_MAX_DURATION: dict[str, int] = {
    "free": 5,
    "pro": 60,
    "premium": 120,
}

# MVP hard caps on scene count (mirrors lib/storyboard.ts MAX_SCENES)
MAX_SCENES: dict[str, int] = {
    "free": 1,
    "pro": 3,
    "premium": 5,
}

DEFAULT_ENGINE = "wan_i2v"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def generate_storyboard(
    prompt: str,
    target_duration: int = 5,
    plan: str = "free",
    clip_duration: float = DEFAULT_CLIP_DURATION,
) -> list[dict[str, Any]]:
    """
    Generate a storyboard (list of scene dicts) from a user prompt.

    For Phase 1 this is a simple template splitter:
    - Single scene for free plan (5s max)
    - Multiple scenes for pro/premium, each `clip_duration` seconds

    Returns a list of scene dicts ready to be inserted into job_scenes.
    """
    # Clamp target_duration to plan limit
    max_dur = PLAN_MAX_DURATION.get(plan, PLAN_MAX_DURATION["free"])
    target_duration = min(target_duration, max_dur)
    target_duration = max(target_duration, int(MIN_CLIP_DURATION))

    # Calculate number of scenes, then hard-cap to plan limit
    clip_dur = max(MIN_CLIP_DURATION, min(clip_duration, MAX_CLIP_DURATION))
    max_scenes = MAX_SCENES.get(plan, 1)
    num_scenes = min(max(1, math.ceil(target_duration / clip_dur)), max_scenes)

    # For free plan, always 1 scene
    if plan == "free":
        num_scenes = 1
        clip_dur = float(min(target_duration, int(DEFAULT_CLIP_DURATION)))

    scenes: list[dict[str, Any]] = []
    remaining = float(target_duration)

    for i in range(num_scenes):
        scene_dur = min(clip_dur, remaining)
        if scene_dur < MIN_CLIP_DURATION and i > 0:
            # Absorb remainder into previous scene
            if scenes:
                scenes[-1]["duration_sec"] = round(
                    scenes[-1]["duration_sec"] + scene_dur, 1
                )
            break

        scenes.append(
            {
                "scene_index": i,
                "prompt": _scene_prompt(prompt, i, num_scenes),
                "engine": DEFAULT_ENGINE,
                "duration_sec": round(scene_dur, 1),
            }
        )
        remaining -= scene_dur

    logger.info(
        "Storyboard: %d scene(s), total %.1fs, plan=%s",
        len(scenes),
        sum(s["duration_sec"] for s in scenes),
        plan,
    )
    return scenes


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _scene_prompt(base_prompt: str, index: int, total: int) -> str:
    """
    Build a per-scene prompt.

    Phase 1: just reuse the base prompt for every scene.
    Phase 2 will add LLM-based scene decomposition.
    """
    if total == 1:
        return base_prompt.strip()

    # Simple prefix for multi-scene (helps model vary output slightly)
    return f"[Scene {index + 1}/{total}] {base_prompt.strip()}"
