"""
Aspect-ratio handling in the video pipeline (Shorts = 9:16).

Covers:
  - pure helpers (normalisation, target sizes, crop box, ffmpeg filter)
  - engines forward the job aspect (Wan -> generate_clip, Seedance -> Kie.ai)
  - end-to-end ffmpeg check: a 1280x720 clip reframed for a 9:16 job comes
    out 720x1280 (skipped when ffmpeg/ffprobe are not installed)

Run: python -m pytest tests/test_aspect_ratio.py -v
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from modal_app.utils.aspect import (  # noqa: E402
    DEFAULT_ASPECT,
    center_crop_box,
    is_default_aspect,
    needs_reframe,
    normalize_aspect_ratio,
    reframe_filter,
    target_dimensions,
)


class TestHelpers(unittest.TestCase):
    def test_normalize(self):
        self.assertEqual(normalize_aspect_ratio("9:16"), "9:16")
        self.assertEqual(normalize_aspect_ratio(" 9/16 "), "9:16")
        self.assertEqual(normalize_aspect_ratio("1:1"), "1:1")
        for bad in (None, "", "4:3", 916, "portrait"):
            self.assertEqual(normalize_aspect_ratio(bad), DEFAULT_ASPECT)

    def test_target_dimensions_keep_area_and_wan_constraints(self):
        self.assertEqual(target_dimensions("16:9"), (1280, 720))
        self.assertEqual(target_dimensions("9:16"), (720, 1280))
        self.assertEqual(target_dimensions("1:1"), (960, 960))
        for aspect in ("16:9", "9:16", "1:1"):
            w, h = target_dimensions(aspect)
            self.assertEqual(w % 16, 0)
            self.assertEqual(h % 16, 0)
            # same pixel budget as the legacy 1280x720 -> same GPU time
            self.assertAlmostEqual(w * h / (1280 * 720), 1.0, delta=0.01)

    def test_wan_resize_formula_gives_portrait(self):
        # generate_clip resizes with max_area = gen_w * gen_h and the image
        # aspect; a 720x1280 first frame must stay 720x1280.
        import math
        gen_w, gen_h = target_dimensions("9:16")
        ar = gen_h / gen_w
        h = round(math.sqrt(gen_w * gen_h * ar)) // 16 * 16
        w = round(math.sqrt(gen_w * gen_h / ar)) // 16 * 16
        self.assertEqual((w, h), (720, 1280))

    def test_center_crop_box(self):
        # landscape -> portrait: keep full height, trim sides
        self.assertEqual(center_crop_box(1280, 720, "9:16"), (438, 0, 842, 720))
        # portrait phone photo -> portrait: trim top/bottom only a little
        left, top, right, bottom = center_crop_box(1080, 2400, "9:16")
        self.assertEqual((left, right), (0, 1080))
        self.assertAlmostEqual((right - left) / (bottom - top), 9 / 16, places=2)
        # square
        self.assertEqual(center_crop_box(1280, 720, "1:1"), (280, 0, 1000, 720))

    def test_needs_reframe(self):
        self.assertFalse(needs_reframe(1280, 720, "16:9"))
        self.assertFalse(needs_reframe(720, 1280, "16:9"))  # legacy: never touch 16:9 jobs
        self.assertTrue(needs_reframe(1280, 720, "9:16"))
        self.assertFalse(needs_reframe(720, 1280, "9:16"))
        self.assertTrue(needs_reframe(1280, 720, "1:1"))
        self.assertTrue(is_default_aspect(None))

    def test_reframe_filter(self):
        self.assertEqual(
            reframe_filter(1280, 720, "9:16"),
            "crop=404:720:438:0,scale=720:1280:flags=lanczos,setsar=1",
        )


class TestEnginesForwardAspect(unittest.TestCase):
    def test_wan_engine_forwards_aspect(self):
        from modal_app.engines.wan import WanEngine
        fn = MagicMock(return_value=b"mp4")
        WanEngine(fn).generate("p", "job", 5, image_url=None, aspect_ratio="9:16")
        fn.assert_called_once_with("p", "job", image_url=None, aspect_ratio="9:16")

    def test_wan_engine_defaults_to_16_9(self):
        from modal_app.engines.wan import WanEngine
        fn = MagicMock(return_value=b"mp4")
        WanEngine(fn).generate("p", "job", 5)
        fn.assert_called_once_with("p", "job", image_url=None, aspect_ratio="16:9")

    def test_seedance_payload_uses_job_aspect(self):
        from modal_app.engines.seedance import SeedanceEngine
        engine = SeedanceEngine()
        with patch.dict(os.environ, {"KIE_API_KEY": "test"}), \
             patch.object(engine, "_create_task", return_value="t1") as create, \
             patch.object(engine, "_poll_until_done", return_value="https://x/v.mp4"), \
             patch.object(engine, "_download_video", return_value=b"mp4"):
            engine.generate("p", "job", 5, aspect_ratio="9:16")
        self.assertEqual(create.call_args.kwargs["aspect_ratio"], "9:16")

    def test_seedance_create_task_body(self):
        from modal_app.engines import seedance as mod
        engine = mod.SeedanceEngine()
        response = MagicMock()
        response.json.return_value = {"code": 200, "data": {"taskId": "t1"}}
        client = MagicMock()
        client.__enter__.return_value.post.return_value = response
        with patch.object(mod.httpx, "Client", return_value=client):
            engine._create_task("k", "p", 5, aspect_ratio="9:16")
        body = client.__enter__.return_value.post.call_args.kwargs["json"]
        self.assertEqual(body["input"]["aspect_ratio"], "9:16")


def _ffmpeg_bins():
    ffmpeg = os.environ.get("FFMPEG_BIN") or shutil.which("ffmpeg")
    ffprobe = os.environ.get("FFPROBE_BIN") or shutil.which("ffprobe")
    return ffmpeg, ffprobe


@unittest.skipUnless(_ffmpeg_bins()[0], "ffmpeg not installed")
class TestReframeWithFfmpeg(unittest.TestCase):
    """Same ffmpeg arguments as video_pipeline._reframe_file, on a real file."""

    def _probe(self, ffprobe, path):
        if ffprobe:
            out = subprocess.run(
                [ffprobe, "-v", "error", "-select_streams", "v:0",
                 "-show_entries", "stream=width,height", "-of", "csv=s=x:p=0", path],
                capture_output=True, text=True, check=True,
            ).stdout.strip()
            return tuple(int(v) for v in out.split("x")[:2])
        # no ffprobe: read the size from `ffmpeg -i` stream info
        import re
        info = subprocess.run([_ffmpeg_bins()[0], "-hide_banner", "-i", path],
                              capture_output=True, text=True).stderr
        m = re.search(r"Video:.*?, (\d{2,5})x(\d{2,5})", info)
        self.assertIsNotNone(m, info[-400:])
        return int(m.group(1)), int(m.group(2))

    def test_landscape_clip_becomes_720x1280(self):
        ffmpeg, ffprobe = _ffmpeg_bins()
        with tempfile.TemporaryDirectory() as tmp:
            src = os.path.join(tmp, "src.mp4")
            dst = os.path.join(tmp, "dst.mp4")
            subprocess.run(
                [ffmpeg, "-y", "-f", "lavfi", "-i", "testsrc=size=1280x720:rate=16:duration=1",
                 "-c:v", "libx264", "-pix_fmt", "yuv420p", src],
                capture_output=True, check=True,
            )
            w, h = self._probe(ffprobe, src)
            self.assertTrue(needs_reframe(w, h, "9:16"))
            subprocess.run(
                [ffmpeg, "-y", "-i", src, "-map", "0:v:0", "-map", "0:a?",
                 "-vf", reframe_filter(w, h, "9:16"),
                 "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p",
                 "-c:a", "copy", "-movflags", "+faststart", dst],
                capture_output=True, check=True,
            )
            self.assertEqual(self._probe(ffprobe, dst), (720, 1280))


if __name__ == "__main__":
    unittest.main()
