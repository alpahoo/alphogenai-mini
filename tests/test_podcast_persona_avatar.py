"""
T-1136e — podcast persona avatar resolution (fallback-safe).

Covers the two pure-ish helpers added to render_podcast:
  - _podcast_circle_portrait: any image bytes -> square circular RGBA avatar
  - _resolve_persona_avatar: returns None (=> caller uses the placeholder) for
    every miss case, without raising or hitting the network.

Run: python -m pytest tests/test_podcast_persona_avatar.py -v
"""
from __future__ import annotations

import io
import os
import sys

from PIL import Image

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import modal_app.video_pipeline as vp  # noqa: E402


def _png_bytes(w: int, h: int, color=(200, 100, 50, 255)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGBA", (w, h), color).save(buf, format="PNG")
    return buf.getvalue()


# ── _podcast_circle_portrait ────────────────────────────────────────────────

def test_circle_portrait_is_square_rgba_of_requested_size():
    out = vp._podcast_circle_portrait(_png_bytes(640, 480), 220)
    assert out.size == (220, 220)
    assert out.mode == "RGBA"


def test_circle_portrait_has_transparent_corners_and_opaque_center():
    out = vp._podcast_circle_portrait(_png_bytes(300, 300), 200)
    alpha = out.split()[3]
    assert alpha.getpixel((0, 0)) == 0          # corner cut out
    assert alpha.getpixel((100, 100)) == 255    # center kept


def test_circle_portrait_handles_non_square_without_error():
    # Portrait taller than wide (center-crop path) must still produce a square.
    out = vp._podcast_circle_portrait(_png_bytes(200, 800), 128)
    assert out.size == (128, 128)


# ── _resolve_persona_avatar (fallback-safe) ─────────────────────────────────

class _FakeQuery:
    def __init__(self, rows):
        self._rows = rows

    def select(self, *_a, **_k):
        return self

    def eq(self, *_a, **_k):
        return self

    def limit(self, *_a, **_k):
        return self

    def execute(self):
        return type("R", (), {"data": self._rows})()


class _FakeSB:
    def __init__(self, rows):
        self._rows = rows

    def table(self, _name):
        return _FakeQuery(self._rows)


def test_no_persona_id_falls_back():
    assert vp._resolve_persona_avatar(_FakeSB([]), {"id": "s1"}, 220, "p1") is None


def test_missing_or_removed_persona_falls_back():
    # persona_id set, but the (active) lookup returns nothing.
    assert vp._resolve_persona_avatar(_FakeSB([]), {"id": "s1", "persona_id": "x"}, 220, "p1") is None


def test_empty_portrait_path_falls_back():
    sb = _FakeSB([{"portrait_path": "", "status": "active"}])
    assert vp._resolve_persona_avatar(sb, {"id": "s1", "persona_id": "x"}, 220, "p1") is None


def test_query_error_falls_back_without_raising():
    class _Boom:
        def table(self, _n):
            raise RuntimeError("db down")

    # Must swallow the error and return None, never propagate.
    assert vp._resolve_persona_avatar(_Boom(), {"id": "s1", "persona_id": "x"}, 220, "p1") is None
