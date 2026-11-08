"""Free CPU verification: real ffmpeg audio correction, frozen graphs, isolation definition."""
import hashlib
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import av
import numpy as np

from modal_app.comfy.executor import canonical_hash
from modal_app.comfy.postprocess import shift_audio, probe

ROOT = Path(__file__).resolve().parents[2]


class RuntimeTests(unittest.TestCase):
    def test_real_audio_shift_preserves_video_and_raw(self):
        import imageio_ffmpeg
        ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
        original_run = subprocess.run

        def run(args, **kwargs):
            return original_run([ffmpeg if args[0] == "ffmpeg" else args[0], *args[1:]], **kwargs)

        (ROOT / "tmp").mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=ROOT / "tmp") as directory:
            raw, final = Path(directory) / "raw.mp4", Path(directory) / "final.mp4"
            # 5 seconds, with a clear tone starting at t=1.0 seconds.
            run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=blue:s=64x64:r=24:d=5",
                 "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=32000:duration=5", "-af", "volume=enable='lt(t,1)':volume=0",
                 "-c:v", "libx264", "-c:a", "aac", "-t", "5", str(raw)], check=True, capture_output=True)
            original_hash = hashlib.sha256(raw.read_bytes()).hexdigest()
            with patch("modal_app.comfy.postprocess.subprocess.run", side_effect=run):
                shift_audio(raw, final, 0.4)
            self.assertEqual(hashlib.sha256(raw.read_bytes()).hexdigest(), original_hash)
            self.assertLess(abs(probe(final)["format"]["duration"] - 5), 0.05)

            def audio_start(path):
                decoded = run(["ffmpeg", "-v", "error", "-i", str(path), "-vn", "-f", "f32le", "-ac", "1", "-ar", "32000", "-"],
                              capture_output=True, check=True).stdout
                samples = np.frombuffer(decoded, np.float32)
                return np.flatnonzero(np.abs(samples) > 0.02)[0] / 32000
            self.assertLess(abs((audio_start(raw) - audio_start(final)) - 0.4), 0.05)
            def video_packets(path):
                with av.open(str(path)) as container:
                    return [bytes(p) for p in container.demux(video=0) if p.size]
            self.assertEqual(video_packets(raw), video_packets(final))

    def test_graph_hash_and_native_nodes(self):
        graph = json.loads((ROOT / "workflows/comfy/templates/minimax-h3/graph.t2v.api.json").read_text())
        self.assertEqual(canonical_hash(graph), canonical_hash(dict(reversed(list(graph.items())))))
        self.assertEqual(graph["10"]["inputs"]["steps"], 8)
        self.assertEqual(graph["2"]["inputs"]["clip_name"], "qwen3vl_32b_minimax_h3_int8_convrot.safetensors")

    def test_executor_definition_is_isolated(self):
        import ast
        tree = ast.parse((ROOT / "modal_app/comfy/app.py").read_text())
        function = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "execute_graph")
        settings = {kw.arg: kw.value for kw in function.decorator_list[0].keywords}
        for key in ("block_network", "restrict_modal_access", "single_use_containers"):
            self.assertTrue(ast.literal_eval(settings[key]))
        self.assertEqual(ast.literal_eval(settings["secrets"]), [])
        self.assertEqual(ast.literal_eval(settings["retries"]), 0)

    def test_legacy_router_never_selects_comfy(self):
        import importlib.util
        import sys
        import types
        package = types.ModuleType("h3_router_test")
        package.__path__ = []
        registry = types.ModuleType("h3_router_test.registry")
        engines = [{"id":"comfy:minimax-h3","type":"comfy_workflow","status":"active","plans":["pro"],"max_duration":10},
                   {"id":"wan_i2v","type":"modal_local","status":"active","plans":["pro"],"max_duration":10}]
        registry.get_all_engines = lambda _: engines
        registry.is_engine_available = lambda *args: True
        with patch.dict(sys.modules, {"h3_router_test":package,"h3_router_test.registry":registry}):
            spec = importlib.util.spec_from_file_location("h3_router_test.router", ROOT / "modal_app/engines/router.py")
            router = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(router)
            self.assertEqual(router.select_engine(plan="pro",preferred="comfy:minimax-h3"),"wan_i2v")
            self.assertEqual(router.select_engine(plan="pro"),"wan_i2v")


if __name__ == "__main__":
    unittest.main()
