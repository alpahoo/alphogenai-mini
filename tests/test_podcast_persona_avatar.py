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
    assert vp._resolve_persona_avatar(_FakeSB([]), {"id": "s1"}, 220, "p1", "owner") is None


def test_missing_or_removed_persona_falls_back():
    # persona_id set, but the (active) lookup returns nothing.
    assert vp._resolve_persona_avatar(_FakeSB([]), {"id": "s1", "persona_id": "x"}, 220, "p1", "owner") is None


def test_empty_portrait_path_falls_back():
    sb = _FakeSB([{"user_id": None, "portrait_path": "", "status": "active"}])
    assert vp._resolve_persona_avatar(sb, {"id": "s1", "persona_id": "x"}, 220, "p1", "owner") is None


def test_persona_owned_by_another_user_falls_back():
    # A persona owned by someone other than the podcast owner must NOT be used.
    sb = _FakeSB([{"user_id": "someone-else", "portrait_path": "podcast-personas/x/a.png", "status": "active"}])
    assert vp._resolve_persona_avatar(sb, {"id": "s1", "persona_id": "x"}, 220, "p1", "owner") is None


def test_query_error_falls_back_without_raising():
    class _Boom:
        def table(self, _n):
            raise RuntimeError("db down")

    # Must swallow the error and return None, never propagate.
    assert vp._resolve_persona_avatar(_Boom(), {"id": "s1", "persona_id": "x"}, 220, "p1", "owner") is None


# ── _parse_loudnorm_json (T-1137a two-pass measurement parsing) ──────────────

_VALID_LOUDNORM = """
[Parsed_loudnorm_0 @ 000]
{
    "input_i" : "-24.50",
    "input_tp" : "-5.20",
    "input_lra" : "7.30",
    "input_thresh" : "-34.90",
    "output_i" : "-16.00",
    "target_offset" : "0.50"
}
"""


def test_parse_loudnorm_valid():
    m = vp._parse_loudnorm_json(_VALID_LOUDNORM)
    assert m is not None
    assert m["measured_I"] == "-24.50"
    assert m["measured_TP"] == "-5.20"
    assert m["measured_LRA"] == "7.30"
    assert m["measured_thresh"] == "-34.90"
    assert m["offset"] == "0.50"


def test_parse_loudnorm_no_json_returns_none():
    assert vp._parse_loudnorm_json("ffmpeg version ... no json here") is None


def test_parse_loudnorm_non_finite_returns_none():
    # Near-silent clip → measured "-inf" cannot drive linear normalization.
    blob = _VALID_LOUDNORM.replace('"input_i" : "-24.50"', '"input_i" : "-inf"')
    assert vp._parse_loudnorm_json(blob) is None


def test_parse_loudnorm_missing_key_returns_none():
    blob = _VALID_LOUDNORM.replace('"target_offset" : "0.50"', '"something_else" : "0.50"')
    assert vp._parse_loudnorm_json(blob) is None
