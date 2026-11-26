"""
LTX-2.5 engine: ComfyUI graph built from the official templates, adapter and registration.

Run: python -m pytest tests/test_ltx25.py -v
"""
from __future__ import annotations

import os
import sys
import unittest
from unittest.mock import MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from modal_app.utils import ltx25_workflow as wf  # noqa: E402


def classes(graph: dict) -> list[str]:
    return [node["class_type"] for node in graph.values()]


class TestGraph(unittest.TestCase):
    def test_text_to_video_has_no_image_nodes(self):
        g = wf.build_graph("a voyager walks", "9:16", 5)
        self.assertNotIn("LoadImage", classes(g))
        self.assertNotIn("LTXVImgToVideoInplace", classes(g))
        self.assertEqual(g["15"]["inputs"]["video_latent"], ["12", 0])
        self.assertEqual(g["24"]["inputs"]["video_latent"], ["22", 0])

    def test_image_to_video_injects_first_frame_before_each_pass(self):
        g = wf.build_graph("a voyager walks", "9:16", 5, image_name="first.png")
        self.assertEqual(g["10"]["inputs"]["image"], "first.png")
        self.assertEqual(g["13"]["inputs"]["strength"], 0.7)
        self.assertEqual(g["23"]["inputs"]["strength"], 1.0)
        self.assertEqual(g["15"]["inputs"]["video_latent"], ["13", 0])
        self.assertEqual(g["24"]["inputs"]["video_latent"], ["23", 0])

    def test_vertical_short_is_native_and_first_pass_is_half_size(self):
        g = wf.build_graph("p", "9:16", 5)
        self.assertEqual(wf.dimensions("9:16"), (704, 1280))
        self.assertEqual((g["12"]["inputs"]["width"], g["12"]["inputs"]["height"]), (352, 640))

    def test_every_size_fits_the_latent_grid(self):
        for aspect, (w, h) in wf.DIMENSIONS.items():
            with self.subTest(aspect=aspect):
                self.assertEqual((w // 2) % 32, 0)
                self.assertEqual((h // 2) % 32, 0)
        self.assertEqual(wf.dimensions("weird"), wf.DIMENSIONS["16:9"])

    def test_frame_count_is_seconds_times_fps_plus_one(self):
        self.assertEqual(wf.frame_count(5), 121)
        self.assertEqual(wf.frame_count(10), 241)
        for s in (1, 5, 10, 20):
            self.assertEqual((wf.frame_count(s) - 1) % 8, 0)
        g = wf.build_graph("p", "9:16", 10)
        self.assertEqual(g["12"]["inputs"]["length"], 241)
        self.assertEqual(g["14"]["inputs"]["frames_number"], 241)

    def test_two_pass_distilled_schedule_matches_template(self):
        g = wf.build_graph("p", "16:9", 5)
        self.assertEqual(len(g["19"]["inputs"]["sigmas"].split(",")), 9)   # 8 steps
        self.assertEqual(len(g["28"]["inputs"]["sigmas"].split(",")), 4)   # 3 refinement steps
        for guider in ("16", "25"):
            self.assertEqual(g[guider]["inputs"]["video_cfg"], 1.0)
            self.assertEqual(g[guider]["inputs"]["audio_cfg"], 1.0)

    def test_loaders_use_the_files_downloaded_to_the_volume(self):
        g = wf.build_graph("p", "9:16", 5)
        names = {os.path.basename(p) for p, _ in wf.MODEL_FILES}
        used = {g["1"]["inputs"]["unet_name"], g["2"]["inputs"]["clip_name"], g["3"]["inputs"]["vae_name"],
                g["4"]["inputs"]["vae_name"], g["5"]["inputs"]["model_name"]}
        self.assertEqual(used, names)

    def test_output_keeps_audio(self):
        g = wf.build_graph("p", "9:16", 5)
        self.assertEqual(g["33"]["inputs"]["audio"], ["32", 0])
        self.assertEqual(g[wf.SAVE_NODE]["class_type"], "SaveVideo")

    def test_links_point_to_existing_nodes(self):
        for image in (None, "first.png"):
            g = wf.build_graph("p", "9:16", 5, image_name=image)
            for node in g.values():
                for value in node["inputs"].values():
                    if isinstance(value, list) and len(value) == 2 and isinstance(value[1], int):
                        self.assertIn(value[0], g)


class TestAdapter(unittest.TestCase):
    def test_passes_aspect_duration_and_image(self):
        from modal_app.engines.ltx25 import LTX25Engine
        fn = MagicMock(return_value=b"mp4")
        out = LTX25Engine(fn).generate("p", "job-1", 10, image_url="https://x/y.png", aspect_ratio="9:16")
        self.assertEqual(out, b"mp4")
        fn.assert_called_once_with("p", "job-1", image_url="https://x/y.png", duration_seconds=10.0,
                                   aspect_ratio="9:16")

    def test_registered_and_routable(self):
        import modal_app.engines as engines
        from modal_app.engines.registry import HARDCODED_ENGINES
        from modal_app.utils.costs import HARDCODED_COSTS

        fn = MagicMock(return_value=b"mp4")
        engines.init_engines(generate_clip_fn=MagicMock(), generate_clip_ltx25_fn=fn)
        adapter = engines.get_engine_adapter("ltx_2_5")
        self.assertEqual(adapter.key, "ltx_2_5")
        self.assertEqual(HARDCODED_ENGINES["ltx_2_5"]["max_duration"], 10.0)
        self.assertIn("ltx_2_5", HARDCODED_COSTS)


if __name__ == "__main__":
    unittest.main()
