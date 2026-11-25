"""
Aspect-ratio helpers for the video pipeline (pure Python, no Modal, no GPU).

The jobs table stores `aspect_ratio` ("16:9" | "9:16" | "1:1"). Until now the
generation pipeline ignored it and always produced 1280x720. These helpers give
one source of truth for:
  - the generation size per aspect (same pixel area as 1280x720, so the GPU
    cost of a Wan scene does not change),
  - the centre crop to apply to a user-supplied first frame,
  - the ffmpeg filter that reframes a finished clip when an engine returned
    another shape (safety net for API engines that ignore the request).

16:9 is the legacy default: jobs without an explicit non-default aspect keep
exactly the previous behaviour (no crop, no reframe).
"""
from __future__ import annotations

DEFAULT_ASPECT = "16:9"

# (width, height). All values divisible by 16 (Wan requirement) and even
# (yuv420p requirement). Area is ~1280*720 for every entry.
TARGET_DIMENSIONS: dict[str, tuple[int, int]] = {
    "16:9": (1280, 720),
    "9:16": (720, 1280),
    "1:1": (960, 960),
}

_RATIOS: dict[str, tuple[int, int]] = {
    "16:9": (16, 9),
    "9:16": (9, 16),
    "1:1": (1, 1),
}


def normalize_aspect_ratio(value) -> str:
    """Return a supported aspect string; anything unknown falls back to 16:9."""
    if isinstance(value, str):
        cleaned = value.strip().replace("/", ":").replace("x", ":")
        if cleaned in TARGET_DIMENSIONS:
            return cleaned
    return DEFAULT_ASPECT


def is_default_aspect(value) -> bool:
    return normalize_aspect_ratio(value) == DEFAULT_ASPECT


def target_dimensions(value) -> tuple[int, int]:
    """(width, height) to generate / deliver for this aspect."""
    return TARGET_DIMENSIONS[normalize_aspect_ratio(value)]


def _even(n: float) -> int:
    v = int(n)
    return max(2, v - (v % 2))


def center_crop_box(src_w: int, src_h: int, value) -> tuple[int, int, int, int]:
    """Largest centred box of the target aspect inside (src_w, src_h).

    Returned as a PIL crop box (left, top, right, bottom), with even sizes.
    """
    rw, rh = _RATIOS[normalize_aspect_ratio(value)]
    if src_w * rh > src_h * rw:
        # source is wider than target -> trim the sides
        crop_h = _even(src_h)
        crop_w = _even(src_h * rw / rh)
    else:
        # source is taller than target -> trim top and bottom
        crop_w = _even(src_w)
        crop_h = _even(src_w * rh / rw)
    crop_w = min(crop_w, src_w)
    crop_h = min(crop_h, src_h)
    left = (src_w - crop_w) // 2
    top = (src_h - crop_h) // 2
    return left, top, left + crop_w, top + crop_h


def needs_reframe(width: int, height: int, value) -> bool:
    """True when a finished clip must be reframed to honour a non-default aspect.

    16:9 jobs are never reframed (legacy behaviour kept as is).
    """
    if is_default_aspect(value):
        return False
    return (width, height) != target_dimensions(value)


def reframe_filter(src_w: int, src_h: int, value) -> str:
    """ffmpeg -vf chain: centre crop to the target aspect, then scale to target size."""
    left, top, right, bottom = center_crop_box(src_w, src_h, value)
    out_w, out_h = target_dimensions(value)
    return (
        f"crop={right - left}:{bottom - top}:{left}:{top},"
        f"scale={out_w}:{out_h}:flags=lanczos,setsar=1"
    )
