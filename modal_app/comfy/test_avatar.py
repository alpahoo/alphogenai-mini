"""Free CPU verification for the LongCat talking-avatar runtime. No Modal call, no download, no GPU."""
import ast
import io
import json
import shutil
import subprocess
import tempfile
import unittest
import wave
from pathlib import Path
from unittest.mock import MagicMock, patch

from modal_app.comfy import avatar
from modal_app.comfy.avatar import (AvatarInputError, command, execute, own_path, patched_script, prepare_audio,
                                    segments_for, video_seconds)
from modal_app.comfy.broker import run, store_avatar
from modal_app.comfy.executor import canonical_hash
from modal_app.comfy.moss_queue import MossQueueError

ROOT = Path(__file__).resolve().parents[2]
HAS_FFMPEG = shutil.which("ffmpeg") is not None
U = "0f8fad5b-d9cb-469f-a165-70867728950e"
IMG = f"{U}/library/4c757a_11111111-1111-4111-8111-111111111111.png"
AUD = f"{U}/audio-library/4c757a_22222222-2222-4222-8222-222222222222.wav"
RUN_ID = "00000000-0000-4000-8000-000000000000"
# Same graph and hash as lib/avatar/avatar.test.ts (JS and Python canonical forms must agree).
SHARED_GRAPH = {"1": {"class_type": "LongCatAvatar", "inputs": {
    "image_path": "u1/library/4c757a_11111111-1111-4111-8111-111111111111.png",
    "audio_path": "u1/audio-library/4c757a_22222222-2222-4222-8222-222222222222.wav",
    "prompt": "Salut, ça va ? « Luz »", "seed": 42, "resolution": "480p", "steps": 8, "precision": "int8",
    "distilled": True, "model": "avatar-v1.6", "mix_steps": 4, "mix_alpha": 1}}}
SHARED_HASH = "8eef85e9f2589a241d6c7218affea14c4342971fe8bc22a94d44592465b48b90"


def wav_bytes(seconds: float, rate: int = 16000) -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate)
        w.writeframes(b"\x00\x01" * int(seconds * rate))
    return buffer.getvalue()


def png_bytes() -> bytes:
    from PIL import Image
    buffer = io.BytesIO()
    Image.new("RGB", (64, 96), (180, 120, 90)).save(buffer, "PNG")
    return buffer.getvalue()


def mp4_with_audio(video_s: float, audio_s: float) -> bytes:
    with tempfile.TemporaryDirectory() as d:
        out = Path(d) / "x.mp4"
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", f"color=c=gray:s=64x96:r=25:d={video_s}",
                        "-f", "lavfi", "-i", f"sine=frequency=440:sample_rate=16000:duration={audio_s}",
                        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", str(out)], check=True, timeout=60)
        return out.read_bytes()


class SegmentTests(unittest.TestCase):
    def test_matches_the_measured_upstream_lengths_and_the_typescript_helper(self):
        self.assertAlmostEqual(video_seconds(1), 3.72, 2)
        self.assertAlmostEqual(video_seconds(2), 6.92, 2)
        self.assertAlmostEqual(video_seconds(3), 10.12, 2)
        for seconds, expected in ((3.5, 1), (3.72, 1), (3.8, 2), (6.9, 2), (9.72, 3), (10.0, 3)):
            self.assertEqual(segments_for(seconds), expected, seconds)

    def test_refuses_too_long_or_invalid(self):
        for value in (10.2, 0, -1, float("nan"), "3"):
            with self.assertRaises(AvatarInputError):
                segments_for(value)

    def test_graph_hash_agrees_with_the_typescript_canonical_form(self):
        self.assertEqual(canonical_hash(SHARED_GRAPH), SHARED_HASH)


class PathTests(unittest.TestCase):
    def test_own_path_rules(self):
        self.assertTrue(own_path(U, "library", IMG, (".png", ".jpg", ".webp")))
        self.assertTrue(own_path(U, "audio-library", AUD, (".wav", ".mp3")))
        other = "7c9e6679-7425-40de-944b-e07fc1f90ae7"
        for bad in (IMG.replace(U, other), f"{U}/library/../{other}/x.png", f"{U}/library//x.png", f"{U}/library/sub/x.png",
                    f"{U}/audio-library/x.png", None, 5, IMG + "\\"):
            self.assertFalse(own_path(U, "library", bad, (".png", ".jpg", ".webp")), bad)
        self.assertFalse(own_path(U, "audio-library", IMG, (".wav", ".mp3")))

    def test_error_codes_are_fixed(self):
        with self.assertRaises(ValueError):
            AvatarInputError("some raw provider message")


class CommandTests(unittest.TestCase):
    def test_is_the_validated_poc_configuration(self):
        w = Path("/tmp/w")
        one = command(w, 1)
        for flag in ("--resolution=480p", "--use_int8", "--use_distill", "--model_type", "avatar-v1.6", "--mix_steps=4", "--mix_alpha=1.0",
                     "--stage_1=ai2v", "--context_parallel_size=1", "--nproc_per_node=1"):
            self.assertIn(flag, one)
        self.assertFalse(any(a.startswith("--num_segments") for a in one))
        three = command(w, 3)
        self.assertIn("--num_segments=3", three)
        self.assertIn("--ref_img_index=10", three)
        self.assertNotIn("--use_fp8", three)  # exclusive with INT8

    def test_seed_patch_is_exact_and_fails_closed(self):
        src = "import os\nx = 1\n    global_seed = 42\n    seed = global_seed + 1\n"
        out = patched_script(src)
        self.assertIn('int(os.environ.get("AVATAR_SEED", "42"))', out)
        self.assertNotIn("global_seed = 42", out)
        for bad in ("import os\n", "import os\n    global_seed = 42\n    global_seed = 42\n", "    global_seed = 42\n"):
            with self.assertRaises(AvatarInputError):
                patched_script(bad)

    def test_the_pinned_upstream_script_still_has_the_anchor(self):
        # Guards the pinned SHA in the Modal image: kept in the POC folder of PR #124 when available.
        poc = ROOT / "poc/longcat_avatar_modal/app.py"
        if poc.exists():
            self.assertIn(avatar.UPSTREAM_SHA, poc.read_text(encoding="utf-8"))


@unittest.skipUnless(HAS_FFMPEG, "ffmpeg not installed")
class AudioPreparationTests(unittest.TestCase):
    def test_accepts_a_ten_second_clip_and_returns_16k_mono_wav(self):
        result = prepare_audio(wav_bytes(9.72, 44100))
        self.assertEqual(result["segments"], 3)
        self.assertAlmostEqual(result["seconds"], 9.72, 1)
        with wave.open(io.BytesIO(result["audio"])) as w:
            self.assertEqual((w.getframerate(), w.getnchannels()), (16000, 1))

    def test_refuses_before_any_gpu(self):
        for raw, code in ((wav_bytes(0.4), "AUDIO_TOO_SHORT"), (wav_bytes(10.6), "AUDIO_TOO_LONG"),
                          (b"not audio at all" * 10, "INVALID_AUDIO"), (b"x", "INVALID_AUDIO")):
            with self.assertRaises(AvatarInputError) as ctx:
                prepare_audio(raw)
            self.assertEqual(ctx.exception.code, code)


class ExecutorTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.repo = Path(self.tmp.name) / "repo"
        self.repo.mkdir()
        (self.repo / "run_demo_avatar_single_audio_to_video.py").write_text("import os\n    global_seed = 42\n", encoding="utf-8")
        self.root = Path(self.tmp.name) / "scratch"
        self.root.mkdir()
        self.payload = {"image": png_bytes(), "audio": wav_bytes(5), "prompt": "She speaks to the camera", "seed": 7, "segments": 2}

    def tearDown(self):
        self.tmp.cleanup()

    def fake_run(self, produce=True, fail=False):
        seen = {}

        def runner(cmd, cwd=None, env=None, **kwargs):
            seen.update(cmd=cmd, cwd=cwd, env=env, kwargs=kwargs)
            if fail:
                raise subprocess.CalledProcessError(1, cmd)
            work = Path(next(a for a in cmd if a.startswith("--output_dir=")).split("=", 1)[1])
            seen["script_exists_during_run"] = (Path(cwd) / cmd[2]).exists()
            seen["input"] = json.loads(Path(next(a for a in cmd if a.startswith("--input_json=")).split("=", 1)[1]).read_text())
            seen["workdir"] = work.parent
            if produce:
                (work / "render1_segments2.mp4").write_bytes(b"\x00\x00\x00\x18ftypmp42" + b"x" * 64)
            return MagicMock(returncode=0)
        return runner, seen

    def test_runs_the_pinned_script_with_the_request_seed_and_wipes_everything(self):
        runner, seen = self.fake_run()
        with patch("subprocess.run", runner):
            out = execute(self.payload, weights="/w", repo=str(self.repo), root=str(self.root))
        self.assertEqual(out["mp4"][4:8], b"ftyp")
        self.assertEqual(seen["env"]["AVATAR_SEED"], "7")
        self.assertTrue(seen["script_exists_during_run"])
        self.assertTrue(seen["cmd"][2].startswith("avatar_run_"))
        self.assertEqual(seen["input"]["prompt"], "She speaks to the camera")
        self.assertIn("--num_segments=2", seen["cmd"])
        self.assertEqual(seen["kwargs"]["timeout"], avatar.RENDER_TIMEOUT_SECONDS)
        self.assertEqual(list(self.root.iterdir()), [], "the per-run directory must be wiped")
        self.assertEqual([p.name for p in self.repo.iterdir()], ["run_demo_avatar_single_audio_to_video.py"], "the patched copy must be removed")

    def test_failures_map_to_fixed_codes_and_still_wipe(self):
        runner, _ = self.fake_run(fail=True)
        with patch("subprocess.run", runner), self.assertRaises(AvatarInputError) as ctx:
            execute(self.payload, weights="/w", repo=str(self.repo), root=str(self.root))
        self.assertEqual(ctx.exception.code, "AVATAR_EXECUTION_FAILED")
        self.assertEqual(list(self.root.iterdir()), [])
        runner, _ = self.fake_run(produce=False)
        with patch("subprocess.run", runner), self.assertRaises(AvatarInputError) as ctx:
            execute(self.payload, weights="/w", repo=str(self.repo), root=str(self.root))
        self.assertEqual(ctx.exception.code, "AVATAR_OUTPUT_INVALID")
        self.assertEqual(list(self.root.iterdir()), [])

    def test_bad_inputs_never_reach_the_subprocess(self):
        with patch("subprocess.run") as sub:
            for patch_ in ({"segments": 4}, {"segments": 0}, {"image": b"not an image"}, {"image": b"\x89PNG\r\n\x1a\n" + b"z" * 100},
                           {"audio": b"x"}, {"prompt": "x"}, {"seed": -1}, {"seed": 1.5}):
                with self.assertRaises(AvatarInputError):
                    execute({**self.payload, **patch_}, weights="/w", repo=str(self.repo), root=str(self.root))
            sub.assert_not_called()
        self.assertEqual(list(self.root.iterdir()), [])


@unittest.skipUnless(HAS_FFMPEG, "ffmpeg not installed")
class FinalizeTests(unittest.TestCase):
    def test_audio_is_padded_so_both_streams_end_together(self):
        db = MagicMock()
        raw = mp4_with_audio(10.12, 9.68)  # the Luz shape: speech ends 0.44 s before the video
        uploaded = []
        store_avatar(db, {"user_id": "u1"}, "r1", {"mp4": raw, "generation_seconds": 1}, uploaded)
        self.assertEqual(uploaded, ["u1/r1/final.mp4"])
        db.storage.from_.assert_called_with("comfy-outputs")
        final = db.storage.from_.return_value.upload.call_args[0][1]
        inserted = db.table.return_value.insert.call_args[0][0]
        self.assertEqual((inserted["role"], inserted["mime"], inserted["storage_key"]), ("final", "video/mp4", "u1/r1/final.mp4"))
        import av
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "f.mp4"
            p.write_bytes(final)
            with av.open(str(p)) as c:
                durations = {s.type: float(s.duration * s.time_base) for s in c.streams if s.type in ("video", "audio")}
        self.assertAlmostEqual(durations["video"], 10.12, delta=0.1)
        self.assertLess(abs(durations["video"] - durations["audio"]), 0.1)

    def test_rejects_something_that_is_not_an_mp4(self):
        with self.assertRaises(AvatarInputError):
            store_avatar(MagicMock(), {"user_id": "u1"}, "r1", {"mp4": b"RIFFxxxxWAVE" * 10, "generation_seconds": 1}, [])


class BrokerFlowTests(unittest.TestCase):
    def make_db(self, audio_bytes, image_bytes=None, claim=True, row_extra=None):
        graph = json.loads(json.dumps(SHARED_GRAPH))
        graph["1"]["inputs"].update(image_path=IMG, audio_path=AUD)
        row = {"id": RUN_ID, "user_id": U, "runtime": "longcat-avatar@1", "resolved_graph_sha256": canonical_hash(graph),
               "reference_path": IMG, "params_effective": {}, **(row_extra or {})}
        db = MagicMock()
        db.rpc.return_value.execute.return_value.data = claim
        single = db.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value
        single.data = {**row, "resolved_graph": graph, "status": "done"}
        files = {IMG: image_bytes if image_bytes is not None else png_bytes(), AUD: audio_bytes}
        db.storage.from_.return_value.download.side_effect = lambda path: files[path]
        return db

    def finish_call(self, db):
        return [c for c in db.rpc.call_args_list if c[0][0] == "finish_comfy_admin_run"][-1][0][1]

    @unittest.skipUnless(HAS_FFMPEG, "ffmpeg not installed")
    def test_success_path_checks_inputs_then_invokes_once_and_stores_one_final_asset(self):
        db = self.make_db(wav_bytes(9.72, 44100))
        calls = []

        def invoke(payload, reference, run_id, runtime="h3-video@1"):
            calls.append((sorted(payload), payload["segments"], payload["seed"], reference, runtime))
            return {"mp4": mp4_with_audio(10.12, 9.68), "generation_seconds": 190}
        with patch("modal_app.comfy.broker.database", return_value=db):
            run(RUN_ID, invoke)
        self.assertEqual(calls, [(["audio", "image", "prompt", "seed", "segments"], 3, 42, None, "longcat-avatar@1")])
        self.assertTrue(self.finish_call(db)["p_success"])
        db.storage.from_.return_value.remove.assert_not_called()

    def test_audio_too_long_is_refused_before_any_gpu(self):
        db = self.make_db(wav_bytes(10.6))
        calls = []
        with patch("modal_app.comfy.broker.database", return_value=db):
            run(RUN_ID, lambda *a, **k: calls.append(a))
        self.assertEqual(calls, [])
        finish = self.finish_call(db)
        self.assertEqual((finish["p_success"], finish["p_error"]), (False, "AUDIO_TOO_LONG"))

    def test_a_second_dispatch_of_the_same_run_cannot_start_a_second_render(self):
        db = self.make_db(wav_bytes(5), claim=False)
        calls = []
        with patch("modal_app.comfy.broker.database", return_value=db):
            run(RUN_ID, lambda *a, **k: calls.append(a))
        self.assertEqual(calls, [])
        self.assertEqual([c[0][0] for c in db.rpc.call_args_list], ["claim_comfy_admin_run"])

    def test_foreign_or_tampered_paths_never_download_or_invoke(self):
        calls = []
        other = "7c9e6679-7425-40de-944b-e07fc1f90ae7"
        db = self.make_db(wav_bytes(5), row_extra={"reference_path": IMG.replace(U, other)})
        with patch("modal_app.comfy.broker.database", return_value=db):
            run(RUN_ID, lambda *a, **k: calls.append(a))
        self.assertEqual(calls, [])
        self.assertFalse(self.finish_call(db)["p_success"])

    def test_graph_tampering_is_caught_by_the_hash(self):
        db = self.make_db(wav_bytes(5))
        single = db.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value
        single.data["resolved_graph"]["1"]["inputs"]["prompt"] = "something else"
        calls = []
        with patch("modal_app.comfy.broker.database", return_value=db):
            run(RUN_ID, lambda *a, **k: calls.append(a))
        self.assertEqual(calls, [])
        self.assertEqual(self.finish_call(db)["p_error"], "GENERATION_FAILED")

    @unittest.skipUnless(HAS_FFMPEG, "ffmpeg not installed")
    def test_gpu_errors_surface_only_their_fixed_code_and_nothing_is_left_behind(self):
        for error, code in ((MossQueueError("GPU_START_TIMEOUT"), "GPU_START_TIMEOUT"), (AvatarInputError("AVATAR_EXECUTION_FAILED"), "AVATAR_EXECUTION_FAILED"),
                            (RuntimeError("secret provider detail"), "GENERATION_FAILED")):
            db = self.make_db(wav_bytes(5))

            def invoke(*a, **k):
                raise error
            with patch("modal_app.comfy.broker.database", return_value=db):
                run(RUN_ID, invoke)
            self.assertEqual(self.finish_call(db)["p_error"], code)
            self.assertFalse(self.finish_call(db)["p_success"])


class SimulationTests(unittest.TestCase):
    """The hosted STAGING rehearsal mode must be impossible to enable by accident or on another database."""
    OK = {"AVATAR_SIMULATE": "no-gpu-staging-only", "AVATAR_SIMULATE_SUPABASE_REF": "hhearpympdflxyfmszap",
          "SUPABASE_URL": "https://hhearpympdflxyfmszap.supabase.co"}

    def test_off_by_default_and_the_flag_alone_is_not_enough(self):
        self.assertFalse(avatar.simulation_enabled({}))
        self.assertFalse(avatar.simulation_enabled({"AVATAR_SIMULATE": "1"}))
        self.assertFalse(avatar.simulation_enabled({**self.OK, "AVATAR_SIMULATE": "true"}))

    def test_refuses_any_other_database(self):
        for env in ({**self.OK, "SUPABASE_URL": "https://qbrpzmuedfugbhoeytdj.supabase.co"},
                    {**self.OK, "AVATAR_SIMULATE_SUPABASE_REF": ""}, {k: v for k, v in self.OK.items() if k != "SUPABASE_URL"}):
            with self.assertRaises(AvatarInputError):
                avatar.simulation_enabled(env)

    def test_enabled_only_for_the_allowed_project(self):
        self.assertTrue(avatar.simulation_enabled(self.OK))

    @unittest.skipUnless(HAS_FFMPEG, "ffmpeg not installed")
    def test_synthetic_clip_has_the_real_shape(self):
        out = avatar.simulated_output({"segments": 3, "audio": wav_bytes(9.72)})
        self.assertEqual(out["mp4"][4:8], b"ftyp")
        import av
        with tempfile.TemporaryDirectory() as d:
            f = Path(d) / "s.mp4"
            f.write_bytes(out["mp4"])
            with av.open(str(f)) as c:
                self.assertAlmostEqual(float(c.duration) / av.time_base, 10.12, delta=0.15)
                self.assertEqual({s.type for s in c.streams if s.type in ("video", "audio")}, {"video", "audio"})

    def test_rejects_bad_payload(self):
        for payload in ({"segments": 4, "audio": b"x"}, {"segments": 1, "audio": "no"}, {}):
            with self.assertRaises(AvatarInputError):
                avatar.simulated_output(payload)

    def test_the_broker_branch_calls_simulation_before_any_gpu_submission(self):
        source = (ROOT / "modal_app/comfy/app.py").read_text(encoding="utf-8")
        branch = source[source.index("if runtime == AVATAR_RUNTIME:"):]
        self.assertLess(branch.index("simulation_enabled()"), branch.index("collect_moss(execute_avatar"))


class DefinitionTests(unittest.TestCase):
    def setUp(self):
        self.tree = ast.parse((ROOT / "modal_app/comfy/app.py").read_text(encoding="utf-8"))

    def settings(self, name):
        fn = next(n for n in self.tree.body if isinstance(n, ast.FunctionDef) and n.name == name)
        return {kw.arg: kw.value for kw in fn.decorator_list[0].keywords}

    def test_avatar_executor_is_isolated_single_h100_that_can_scale_to_zero(self):
        s = self.settings("execute_avatar")
        self.assertEqual(ast.literal_eval(s["gpu"]), "H100")
        for key in ("block_network", "restrict_modal_access"):
            self.assertTrue(ast.literal_eval(s[key]), key)
        self.assertEqual(ast.literal_eval(s["secrets"]), [])
        self.assertEqual(ast.literal_eval(s["min_containers"]), 0)   # stops between requests
        self.assertEqual(ast.literal_eval(s["max_containers"]), 1)
        self.assertIn("scaledown_window", s)
        self.assertNotIn("retries", s)                                # a failed render is never retried automatically
        self.assertNotIn("single_use_containers", s)                  # deliberate: warm reuse inside the scale-down window

    def test_broker_timeout_covers_the_avatar_window(self):
        consts = {n.targets[0].id: ast.literal_eval(n.value) for n in self.tree.body
                  if isinstance(n, ast.Assign) and isinstance(n.targets[0], ast.Name) and isinstance(n.value, ast.Constant)}
        self.assertLess(consts["AVATAR_COLLECT_TIMEOUT_SECONDS"], consts["BROKER_TIMEOUT_SECONDS"])
        self.assertLessEqual(consts["AVATAR_COLLECT_TIMEOUT_SECONDS"], 660)   # SQL deadline is 15 minutes
        self.assertGreaterEqual(consts["AVATAR_EXECUTOR_TIMEOUT_SECONDS"], avatar.RENDER_TIMEOUT_SECONDS)


if __name__ == "__main__":
    unittest.main()
