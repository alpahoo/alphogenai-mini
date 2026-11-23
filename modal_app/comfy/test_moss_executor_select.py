"""MOSS executor GPU selection (MOSS_EXECUTOR_GPU). Free CPU checks: no Modal call, no deploy, no GPU."""
import ast
import importlib
import os
import subprocess
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from modal_app.comfy.moss_queue import MossQueueError
from modal_app.comfy.transfer import PNG_SIGNATURE

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / "modal_app/comfy/app.py"
CALL_ID = "fc-select-test"


def load_app():
    with patch.dict("os.environ", {"H3_MODAL_REGION": "eu"}):
        os.environ.pop("MOSS_EXECUTOR_GPU", None)
        return importlib.import_module("modal_app.comfy.app")


def import_in_subprocess(gpu):
    env = {**os.environ, "H3_MODAL_REGION": "eu"}
    env.pop("MOSS_EXECUTOR_GPU", None)
    if gpu is not None:
        env["MOSS_EXECUTOR_GPU"] = gpu
    code = ("import modal_app.comfy.app as a; "
            "print(a.MOSS_EXECUTOR_GPU, a.runtime_environment['MOSS_EXECUTOR_GPU'], "
            "a.moss_executor() is a.execute_image_graph_h100, a.moss_executor() is a.execute_image_graph)")
    return subprocess.run([sys.executable, "-c", code], cwd=ROOT, env=env, capture_output=True, text=True, timeout=120)


def decorator_settings(name):
    tree = ast.parse(APP.read_text())
    fn = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == name)
    return fn, {kw.arg: kw.value for kw in fn.decorator_list[0].keywords}


class SelectionTests(unittest.TestCase):
    def test_default_is_l40s_and_only_explicit_h100_is_accepted(self):
        app = load_app()
        self.assertEqual(app.select_moss_executor_gpu(None), "L40S")
        self.assertEqual(app.select_moss_executor_gpu(""), "L40S")
        self.assertEqual(app.select_moss_executor_gpu("L40S"), "L40S")
        self.assertEqual(app.select_moss_executor_gpu("H100"), "H100")
        for bad in ["h100", "l40s", " H100", "H100 ", "A100", "H200", "B200", "L40S,H100", "any", "auto"]:
            with self.subTest(value=bad), self.assertRaises(RuntimeError):
                app.select_moss_executor_gpu(bad)

    def test_module_default_selects_l40s_executor(self):
        app = load_app()
        self.assertEqual(app.MOSS_EXECUTOR_GPU, "L40S")
        self.assertIs(app.moss_executor(), app.execute_image_graph)
        self.assertIs(app.moss_executor("H100"), app.execute_image_graph_h100)
        with self.assertRaises(RuntimeError):
            app.moss_executor("A100")
        # MOSS never resolves to the H3 executor, whatever the selection.
        for gpu in app.MOSS_EXECUTOR_GPUS:
            self.assertIsNot(app.moss_executor(gpu), app.execute_graph)

    def test_deploy_time_selection_and_container_environment(self):
        for gpu, expected in [(None, "L40S L40S False True"), ("L40S", "L40S L40S False True"),
                              ("H100", "H100 H100 True False")]:
            with self.subTest(gpu=gpu):
                result = import_in_subprocess(gpu)
                self.assertEqual(result.returncode, 0, result.stderr[-2000:])
                self.assertEqual(result.stdout.strip().splitlines()[-1], expected)

    def test_unknown_value_prevents_loading_the_app(self):
        for gpu in ["A100", "h100", "L40S|H100"]:
            with self.subTest(gpu=gpu):
                result = import_in_subprocess(gpu)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("MOSS_EXECUTOR_GPU must be L40S or H100", result.stderr)


class DefinitionTests(unittest.TestCase):
    def test_h100_executor_matches_l40s_executor_except_gpu(self):
        l40s, l40s_settings = decorator_settings("execute_image_graph")
        h100, h100_settings = decorator_settings("execute_image_graph_h100")
        self.assertEqual(ast.literal_eval(l40s_settings["gpu"]), "L40S")
        self.assertEqual(ast.literal_eval(h100_settings["gpu"]), "H100")
        self.assertEqual(set(l40s_settings), set(h100_settings))
        for key in l40s_settings:
            if key != "gpu":
                self.assertEqual(ast.dump(l40s_settings[key]), ast.dump(h100_settings[key]), key)
        # Same isolation and limits, spelled out.
        for key in ("block_network", "restrict_modal_access", "single_use_containers"):
            self.assertTrue(ast.literal_eval(h100_settings[key]))
        self.assertEqual(ast.literal_eval(h100_settings["secrets"]), [])
        self.assertEqual(ast.literal_eval(h100_settings["max_containers"]), 1)
        self.assertEqual(ast.literal_eval(h100_settings["min_containers"]), 0)
        self.assertEqual(ast.literal_eval(h100_settings["timeout"]), 300)
        self.assertEqual(ast.dump(h100_settings["region"]), ast.dump(ast.Name(id="REGION", ctx=ast.Load())))
        self.assertNotIn("retries", h100_settings)
        # Same body: call-id header first, late-start guard, MOSS runtime only, no reference argument.
        self.assertEqual([a.arg for a in h100.args.args], ["graph", "start_before"])
        self.assertEqual([ast.dump(s) for s in l40s.body], [ast.dump(s) for s in h100.body])

    def test_h3_executor_definition_is_unchanged(self):
        _, s = decorator_settings("execute_graph")
        self.assertEqual(ast.literal_eval(s["gpu"]), "H100")
        self.assertEqual(ast.literal_eval(s["timeout"]), 180)
        self.assertEqual(ast.literal_eval(s["memory"]), (65536, 65536))
        self.assertEqual(ast.literal_eval(s["startup_timeout"]), 120)
        self.assertEqual(ast.dump(s["region"]), ast.dump(ast.Name(id="REGION", ctx=ast.Load())))

    def test_start_window_is_unchanged(self):
        self.assertEqual(load_app().MOSS_START_WINDOW_SECONDS, 300)


class BrokerSelectionTests(unittest.TestCase):
    def run_broker(self, app, gpu, delay):
        clock = [1000.0]
        submitted = []
        cancel = AsyncMock()
        result = {"png": PNG_SIGNATURE + b"img", "generation_seconds": 1}

        async def submit(function, graph, deadline):
            submitted.append(function)

            async def frames():
                clock[0] += delay
                for frame in function.local(graph, deadline):
                    yield frame
            return CALL_ID, frames(), SimpleNamespace(cancel=SimpleNamespace(aio=cancel))

        outcome = {}

        def run_callback(run_id, invoke):
            try:
                outcome["result"] = invoke({}, None, run_id, runtime="moss-image@1")
            except MossQueueError as error:
                outcome["error"] = error.code

        with patch.object(app, "MOSS_EXECUTOR_GPU", gpu), \
             patch("modal_app.comfy.moss_queue.submit_generator", side_effect=submit), \
             patch("modal_app.comfy.broker.run", side_effect=run_callback), \
             patch("modal_app.comfy.broker.database", return_value=MagicMock()), \
             patch("modal_app.comfy.executor.execute", return_value=result) as execute, \
             patch("modal.current_function_call_id", return_value=CALL_ID), \
             patch("time.time", side_effect=lambda: clock[0]):
            app.broker.local("00000000-0000-4000-8000-000000000000")
        return submitted, outcome, execute, cancel

    def test_broker_submits_only_to_the_selected_executor(self):
        app = load_app()
        for gpu, executor in [("L40S", app.execute_image_graph), ("H100", app.execute_image_graph_h100)]:
            with self.subTest(gpu=gpu):
                submitted, outcome, execute, cancel = self.run_broker(app, gpu, delay=60)
                self.assertEqual(submitted, [executor])
                self.assertIn("result", outcome)
                self.assertEqual(execute.call_count, 1)
                cancel.assert_awaited_once_with(terminate_containers=True)

    def test_start_timeout_on_h100_cancels_without_retry_or_gpu_fallback(self):
        app = load_app()
        submitted, outcome, execute, cancel = self.run_broker(app, "H100", delay=300)
        self.assertEqual(outcome, {"error": "GPU_START_TIMEOUT"})
        self.assertEqual(submitted, [app.execute_image_graph_h100])  # once, never L40S
        execute.assert_not_called()
        cancel.assert_awaited_once_with(terminate_containers=True)

    def test_invalid_selection_at_run_time_submits_nothing(self):
        app = load_app()
        submit = AsyncMock()

        def run_callback(run_id, invoke):
            with self.assertRaises(RuntimeError):
                invoke({}, None, run_id, runtime="moss-image@1")
        with patch.object(app, "MOSS_EXECUTOR_GPU", "A100"), \
             patch("modal_app.comfy.moss_queue.submit_generator", submit), \
             patch("modal_app.comfy.broker.run", side_effect=run_callback), \
             patch("modal_app.comfy.broker.database", return_value=MagicMock()):
            app.broker.local("00000000-0000-4000-8000-000000000000")
        submit.assert_not_called()


if __name__ == "__main__":
    unittest.main()
