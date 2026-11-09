"""Free CPU verification for the MOSS-Image runtime. No Modal call, no download, no GPU."""
import ast
import asyncio
import hashlib
import json
import struct
import tempfile
import unittest
import zlib
from pathlib import Path
from unittest.mock import MagicMock

from modal_app.comfy.broker import png_size, run, store_image
from modal_app.comfy.executor import RUNTIMES, canonical_hash
from modal_app.comfy.models import download, pinned_url
from modal_app.comfy.transfer import PNG_SIGNATURE, output_frames, receive_output

ROOT = Path(__file__).resolve().parents[2]
CATALOG = ROOT / "workflows/comfy/runtimes/moss-image@1.json"
GRAPH = ROOT / "workflows/comfy/templates/moss-image/graph.t2i.api.json"
CORE_NODES = {"UNETLoader", "CLIPLoader", "VAELoader", "CLIPTextEncode", "EmptyFlux2LatentImage", "KSampler", "VAEDecode", "SaveImage"}


def make_png(width: int, height: int) -> bytes:
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    rows = b"".join(b"\x00" + b"\x00" * width * 3 for _ in range(height))
    return PNG_SIGNATURE + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(rows)) + chunk(b"IEND", b"")


async def agen(items):
    for item in items:
        yield item


class MossRuntimeTests(unittest.TestCase):
    def test_graph_is_core_only_and_matches_catalog(self):
        graph = json.loads(GRAPH.read_text())
        catalog = json.loads(CATALOG.read_text())
        self.assertEqual({n["class_type"] for n in graph.values()}, CORE_NODES)
        self.assertEqual(catalog["custom_nodes"], [])
        files = {Path(m["path"]).name for m in catalog["models"]}
        used = {graph["1"]["inputs"]["unet_name"], graph["2"]["inputs"]["clip_name"], graph["3"]["inputs"]["vae_name"]}
        self.assertEqual(used, files)
        self.assertEqual(graph["2"]["inputs"]["type"], "moss_image")
        self.assertNotIn("abliterated", json.dumps(graph).lower())
        k = graph["7"]["inputs"]
        self.assertEqual((k["steps"], k["cfg"], k["sampler_name"], k["scheduler"], k["denoise"]), (25, 2.5, "er_sde", "simple", 1.0))
        self.assertEqual(RUNTIMES["moss-image@1"]["output_node"], "9")
        self.assertEqual(graph["9"]["class_type"], "SaveImage")

    def test_catalog_is_pinned_and_apache(self):
        catalog = json.loads(CATALOG.read_text())
        for model in catalog["models"]:
            self.assertTrue(model["license"].startswith("apache-2.0"))
            self.assertRegex(model["sha256"], r"^[0-9a-f]{64}$")
            self.assertTrue(pinned_url(model).startswith("https://huggingface.co/Comfy-Org/MOSS-Image/resolve/2929efe3"))
        self.assertNotIn("flux2-vae.safetensors", [Path(m["path"]).name for m in catalog["models"]])
        with self.assertRaises(ValueError):
            pinned_url({**catalog["models"][0], "revision": "main"})
        with self.assertRaises(ValueError):
            pinned_url({**catalog["models"][0], "source": "../../etc/passwd"})

    def test_png_stream_round_trip_and_h3_header_unchanged(self):
        png = make_png(64, 32)
        frames = list(output_frames({"png": png, "generation_seconds": 12.5}))
        self.assertEqual(frames[0]["kind"], "png")
        self.assertEqual(asyncio.run(receive_output(agen(frames))), {"png": png, "generation_seconds": 12.5})
        mp4 = b"\x00\x00\x00\x18ftyp" + b"x" * 100
        self.assertNotIn("kind", next(output_frames({"mp4": mp4, "generation_seconds": 1})))
        with self.assertRaises(ValueError):
            list(output_frames({"png": b"not a png at all", "generation_seconds": 1}))
        forged = dict(frames[0], kind="exe")
        with self.assertRaises(ValueError):
            asyncio.run(receive_output(agen([forged] + frames[1:])))

    def test_broker_checks_png_dimensions_against_graph(self):
        graph = json.loads(GRAPH.read_text())
        self.assertEqual(png_size(make_png(1024, 1024)), (1024, 1024))
        db, uploaded = MagicMock(), []
        row = {"user_id": "u1"}
        with self.assertRaises(ValueError):
            store_image(db, row, "r1", graph, {"png": make_png(512, 512), "generation_seconds": 1}, uploaded)
        self.assertEqual(uploaded, [])
        store_image(db, row, "r1", graph, {"png": make_png(1024, 1024), "generation_seconds": 1}, uploaded)
        self.assertEqual(uploaded, ["u1/r1/raw.png"])
        inserted = db.table.return_value.insert.call_args[0][0]
        self.assertEqual((inserted["role"], inserted["mime"]), ("raw", "image/png"))

    def test_broker_runs_moss_without_reference_and_with_runtime(self):
        graph = json.loads(GRAPH.read_text())
        row = {"id": "x", "user_id": "u1", "runtime": "moss-image@1", "resolved_graph_sha256": canonical_hash(graph),
               "reference_path": None, "params_effective": {}}
        db = MagicMock()
        db.rpc.return_value.execute.return_value.data = True
        single = db.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value
        single.data = {**row, "resolved_graph": graph, "status": "done"}
        calls = []

        def invoke(g, reference, run_id, runtime="h3-video@1"):
            calls.append((reference, runtime))
            return {"png": make_png(1024, 1024), "generation_seconds": 30}
        from unittest.mock import patch
        with patch("modal_app.comfy.broker.database", return_value=db):
            run("00000000-0000-4000-8000-000000000000", invoke)
        self.assertEqual(calls, [(None, "moss-image@1")])
        finish = [c for c in db.rpc.call_args_list if c[0][0] == "finish_comfy_admin_run"]
        self.assertEqual(finish[-1][0][1]["p_success"], True)
        db.storage.from_.return_value.remove.assert_not_called()

    def test_download_verifies_hash_and_never_leaves_partial_files(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            blob = b"model-bytes" * 10
            catalog = {"runtime": "moss-image@1", "custom_nodes": [], "models": [{
                "repo": "Comfy-Org/MOSS-Image", "revision": "2929efe3cdd506c0a430bcfca70a9a8d805cc095",
                "source": "vae/a.safetensors", "path": "vae/a.safetensors", "license": "apache-2.0",
                "bytes": len(blob), "sha256": hashlib.sha256(blob).hexdigest()}]}
            cat = root / "catalog.json"
            cat.write_text(json.dumps(catalog))
            models = root / "models"
            with self.assertRaises(ValueError):
                download(models, cat, lambda url: iter([b"tampered" * 10, b"xxxxxxxxxx" * 3]))
            self.assertFalse((models / "vae/a.safetensors").exists())
            self.assertFalse((models / "vae/a.safetensors.partial").exists())
            self.assertFalse((models / ".moss-image-verified.json").exists())
            seen = []
            download(models, cat, lambda url: (seen.append(url), iter([blob[:50], blob[50:]]))[1])
            self.assertEqual((models / "vae/a.safetensors").read_bytes(), blob)
            self.assertTrue(seen[0].endswith("/resolve/2929efe3cdd506c0a430bcfca70a9a8d805cc095/vae/a.safetensors"))
            marker = json.loads((models / ".moss-image-verified.json").read_text())
            self.assertEqual(marker["catalog_sha256"], hashlib.sha256(cat.read_bytes()).hexdigest())
            catalog["models"][0]["license"] = "cc-by-nc-4.0"
            cat.write_text(json.dumps(catalog))
            with self.assertRaises(ValueError):
                download(models, cat, lambda url: iter([blob]))

    def test_image_executor_definition_is_isolated(self):
        tree = ast.parse((ROOT / "modal_app/comfy/app.py").read_text())
        fn = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "execute_image_graph")
        settings = {kw.arg: kw.value for kw in fn.decorator_list[0].keywords}
        for key in ("block_network", "restrict_modal_access", "single_use_containers"):
            self.assertTrue(ast.literal_eval(settings[key]))
        self.assertEqual(ast.literal_eval(settings["secrets"]), [])
        self.assertEqual(ast.literal_eval(settings["max_containers"]), 1)
        self.assertEqual(ast.literal_eval(settings["min_containers"]), 0)
        self.assertNotIn("retries", settings)
        # Image executor never receives a reference image argument.
        self.assertEqual([a.arg for a in fn.args.args], ["graph", "start_before"])


if __name__ == "__main__":
    unittest.main()
