"""Free CPU verification of the long H3 executor: selection, isolation, timeouts. No GPU, no Modal call."""
import ast
import asyncio
import importlib
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from modal_app.comfy.executor import H3_STANDARD_PIXEL_FRAMES, h3_needs_long_executor

ROOT = Path(__file__).resolve().parents[2]


def load_app():
    with patch.dict("os.environ", {"H3_MODAL_REGION": "eu"}):
        return importlib.import_module("modal_app.comfy.app")


def graph(width, height, length):
    return {"6": {"class_type": "MiniMaxH3ImageToVideo", "inputs": {"width": width, "height": height, "length": length}}}


def decorator_settings(name):
    tree = ast.parse((ROOT / "modal_app/comfy/app.py").read_text())
    function = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == name)
    return function, {kw.arg: kw.value for kw in function.decorator_list[0].keywords}


class H3LongSelectionTests(unittest.TestCase):
    def test_standard_executor_keeps_the_validated_480p_5s_render(self):
        self.assertEqual(H3_STANDARD_PIXEL_FRAMES, 640 * 640 * 124)
        self.assertFalse(h3_needs_long_executor(graph(480, 832, 124)))
        self.assertFalse(h3_needs_long_executor(graph(832, 480, 124)))
        self.assertFalse(h3_needs_long_executor(graph(640, 640, 124)))
        self.assertFalse(h3_needs_long_executor(graph(480, 832, 56)))

    def test_704p_and_long_480p_go_to_the_long_executor(self):
        self.assertTrue(h3_needs_long_executor(graph(704, 1280, 124)))
        self.assertTrue(h3_needs_long_executor(graph(1280, 704, 124)))
        self.assertTrue(h3_needs_long_executor(graph(480, 832, 243)))

    def test_unexpected_graph_shape_falls_back_to_the_standard_executor(self):
        for value in ({}, {"6": {}}, {"6": {"inputs": {"width": "x", "height": 1, "length": 1}}}, None):
            self.assertFalse(h3_needs_long_executor(value))


class H3LongDefinitionTests(unittest.TestCase):
    def test_long_executor_has_the_same_isolation_as_the_standard_one(self):
        standard, s = decorator_settings("execute_graph")
        long, l = decorator_settings("execute_graph_long")
        self.assertEqual(set(s), set(l))
        for key in s:
            if key != "timeout":
                self.assertEqual(ast.dump(s[key]), ast.dump(l[key]), key)
        for key in ("block_network", "restrict_modal_access", "single_use_containers"):
            self.assertTrue(ast.literal_eval(l[key]))
        self.assertEqual(ast.literal_eval(l["secrets"]), [])
        self.assertEqual(ast.literal_eval(l["max_containers"]), 1)
        self.assertEqual(ast.literal_eval(l["gpu"]), "H100")
        self.assertNotIn("retries", l)
        self.assertEqual([a.arg for a in long.args.args], [a.arg for a in standard.args.args])
        # The validated standard executor is untouched.
        self.assertEqual(ast.literal_eval(s["timeout"]), 180)

    def test_long_timeouts_fit_broker_and_sql_deadline(self):
        app = load_app()
        _, l = decorator_settings("execute_graph_long")
        self.assertEqual(ast.literal_eval(l["timeout"]), app.H3_LONG_EXECUTOR_TIMEOUT_SECONDS)
        # 704x1280 5 s measured at 322 s of execution plus a 37 s cold start.
        self.assertGreaterEqual(app.H3_LONG_EXECUTOR_TIMEOUT_SECONDS, 322 + 37 + 120)
        self.assertEqual(app.H3_LONG_COLLECT_TIMEOUT_SECONDS,
                         app.H3_START_WINDOW_SECONDS + app.H3_LONG_EXECUTOR_TIMEOUT_SECONDS + 20)
        # Post-processing and upload margin after collecting, and the 15-minute SQL deadline.
        self.assertLess(app.H3_LONG_COLLECT_TIMEOUT_SECONDS + 120, app.BROKER_TIMEOUT_SECONDS)
        self.assertLess(app.BROKER_TIMEOUT_SECONDS, 900)
        self.assertEqual((app.H3_START_WINDOW_SECONDS, app.H3_COLLECT_TIMEOUT_SECONDS), (110, 310))


class H3LongBrokerTests(unittest.TestCase):
    def run_broker(self, bound):
        app = load_app()
        clock = [1000.0]
        used, deadlines = [], []
        expected = {"mp4": b"\x00\x00\x00\x18ftyp" + b"test-video", "generation_seconds": 1}

        def make_stream(executor):
            async def stream(*args):
                used.append(executor)
                deadlines.append(args[-1])
                for item in executor.local(*args):
                    yield item
            return SimpleNamespace(aio=stream)

        def invoke_run(run_id, invoke):
            self.assertEqual(invoke(bound, None, run_id), expected)
        cancel = AsyncMock()
        with patch.object(app.execute_graph, "remote_gen", make_stream(app.execute_graph)), \
             patch.object(app.execute_graph_long, "remote_gen", make_stream(app.execute_graph_long)), \
             patch("time.time", side_effect=lambda: clock[0]), \
             patch("modal.current_function_call_id", return_value="fc-long-test"), \
             patch("modal.FunctionCall.from_id", return_value=SimpleNamespace(cancel=SimpleNamespace(aio=cancel))), \
             patch("modal_app.comfy.executor.execute", return_value=expected) as execute, \
             patch("modal_app.comfy.broker.database", return_value=MagicMock()), \
             patch("modal_app.comfy.broker.run", side_effect=invoke_run), \
             patch("asyncio.timeout", wraps=asyncio.timeout) as timeout:
            app.broker.local("00000000-0000-4000-8000-000000000000")
        cancel.assert_awaited_once_with(terminate_containers=True)
        return app, used, deadlines, timeout, execute

    def test_704p_runs_once_on_the_long_executor(self):
        app, used, deadlines, timeout, execute = self.run_broker(graph(704, 1280, 124))
        self.assertEqual(used, [app.execute_graph_long])
        self.assertEqual(deadlines, [1110])
        timeout.assert_called_once_with(app.H3_LONG_COLLECT_TIMEOUT_SECONDS)
        self.assertEqual(execute.call_args.kwargs, {"deadline_s": app.H3_LONG_EXECUTOR_TIMEOUT_SECONDS - 25})

    def test_480p_5s_stays_on_the_standard_executor(self):
        app, used, deadlines, timeout, execute = self.run_broker(graph(480, 832, 124))
        self.assertEqual(used, [app.execute_graph])
        self.assertEqual(deadlines, [1110])
        timeout.assert_called_once_with(310)
        self.assertEqual(execute.call_args.kwargs, {})


if __name__ == "__main__":
    unittest.main()
