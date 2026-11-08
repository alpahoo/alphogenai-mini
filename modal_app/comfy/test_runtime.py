"""Free CPU verification: real ffmpeg audio correction, frozen graphs, isolation definition."""
import hashlib
import asyncio
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
from modal_app.comfy.transfer import output_frames, receive_output, CHUNK_BYTES, MAX_BYTES

ROOT = Path(__file__).resolve().parents[2]


class RuntimeTests(unittest.TestCase):
    def test_large_output_uses_inline_modal_stream_without_blob_access(self):
        from types import SimpleNamespace
        from unittest.mock import AsyncMock
        from modal._runtime.container_io_manager import _ContainerIOManager, serialize_data_format
        from modal._utils.blob_utils import MAX_OBJECT_SIZE_BYTES
        from modal_proto import api_pb2

        raw = b"\x00\x00\x00\x18ftyp" + bytes(range(256)) * (3 * 1024 * 1024 // 256)
        frames = list(output_frames({"mp4": raw, "generation_seconds": 63.5}))
        serialized = [serialize_data_format(item, api_pb2.DATA_FORMAT_PICKLE) for item in frames]
        self.assertGreater(len(raw), MAX_OBJECT_SIZE_BYTES)
        self.assertTrue(all(len(item) < MAX_OBJECT_SIZE_BYTES for item in serialized))
        sender = AsyncMock()
        manager = SimpleNamespace(
            _client=SimpleNamespace(_stub=SimpleNamespace(FunctionCallPutDataOut=sender)),
            _max_object_size_bytes=MAX_OBJECT_SIZE_BYTES, input_plane_server_url=None,
        )

        async def verify():
            # Actual SDK output path: BlobCreate is forbidden in this executor.
            with patch("modal._runtime.container_io_manager.blob_upload", side_effect=AssertionError("Blob API used")):
                await _ContainerIOManager.put_data_out(manager, "fc-test", "", 1, api_pb2.DATA_FORMAT_PICKLE, serialized)
            request = sender.await_args.args[0]
            self.assertTrue(all(chunk.data and not chunk.data_blob_id for chunk in request.data_chunks))
            async def stream():
                for frame in frames:
                    yield frame
            result = await receive_output(stream())
            self.assertEqual(result, {"mp4": raw, "generation_seconds": 63.5})
        asyncio.run(verify())

    def test_incomplete_or_corrupt_stream_never_delivers_media(self):
        raw = b"\x00\x00\x00\x18ftyp" + b"x" * CHUNK_BYTES
        frames = list(output_frames({"mp4": raw, "generation_seconds": 2}))
        invalid = [frames[:-1], [frames[0], b"bad"],
                   [{**frames[0], "bytes": MAX_BYTES + 1}],
                   [frames[0], b"x" * (CHUNK_BYTES + 1)],
                   [{**frames[0], "sha256": "0" * 64}, *frames[1:]]]
        for items in invalid:
            async def stream():
                for item in items:
                    yield item
            with self.subTest(items=len(items)), self.assertRaises(ValueError):
                asyncio.run(receive_output(stream()))

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
        # Modal generators prohibit any retries argument, including zero.
        self.assertNotIn("retries", settings)

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
