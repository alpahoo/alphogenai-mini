"""Free regressions: SDK enqueue/decoder/cancel RPCs are mocked; no remote execution."""
import asyncio
import contextlib
import io
import json
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, Mock, patch

from modal_app.comfy.moss_queue import MossQueueError, collect_moss, submit_generator
from modal_app.comfy.transfer import PNG_SIGNATURE, output_frames

CALL_ID = "fc-queued-moss"


class MossQueueTests(unittest.TestCase):
    def test_app_saves_id_before_gpu_frame_and_keeps_late_start_guard(self):
        import importlib
        with patch.dict("os.environ", {"H3_MODAL_REGION": "eu"}):
            app_module = importlib.import_module("modal_app.comfy.app")
        for delay in [210, 300]:
            with self.subTest(delay=delay):
                clock = [1000.0]
                result = {"png": PNG_SIGNATURE + b"test-image", "generation_seconds": 1}
                db = MagicMock()
                cancel = AsyncMock()
                async def submit(function, graph, deadline):
                    self.assertIs(function, app_module.execute_image_graph)
                    self.assertEqual(deadline, 1300)
                    async def frames():
                        db.table.return_value.update.assert_called_once_with({"modal_call_id": CALL_ID})
                        clock[0] += delay
                        for frame in function.local(graph, deadline):
                            yield frame
                    return CALL_ID, frames(), SimpleNamespace(cancel=SimpleNamespace(aio=cancel))
                def run_callback(run_id, invoke):
                    if delay == 210:
                        self.assertEqual(invoke({}, None, run_id, runtime="moss-image@1"), result)
                    else:
                        with self.assertRaisesRegex(MossQueueError, "GPU_START_TIMEOUT"):
                            invoke({}, None, run_id, runtime="moss-image@1")
                with patch("modal_app.comfy.moss_queue.submit_generator", side_effect=submit), \
                     patch("modal_app.comfy.broker.run", side_effect=run_callback), \
                     patch("modal_app.comfy.broker.database", return_value=db), \
                     patch("modal_app.comfy.executor.execute", return_value=result) as execute, \
                     patch("modal.current_function_call_id", return_value=CALL_ID), \
                     patch("time.time", side_effect=lambda: clock[0]):
                    app_module.broker.local("00000000-0000-4000-8000-000000000000")
                self.assertEqual(execute.call_count, int(delay == 210))
                cancel.assert_awaited_once_with(terminate_containers=True)

    def test_real_sdk_submits_generator_before_start_and_preserves_native_decoder(self):
        from modal.client import _Client
        from modal._functions import _Function, _Invocation
        from modal._utils.async_utils import synchronizer
        from modal_proto import api_pb2

        async def verify(pending):
            client = _Client("https://unused.invalid", api_pb2.CLIENT_TYPE_CLIENT, None)
            enqueue = AsyncMock(return_value=api_pb2.FunctionMapResponse(
                function_call_id=CALL_ID,
                pipelined_inputs=[api_pb2.FunctionPutInputsResponseItem(input_id="in-queued", input_jwt="test")]))
            from google.protobuf.empty_pb2 import Empty
            cancel_rpc = AsyncMock(return_value=Empty())
            client._control_plane_stub = SimpleNamespace(FunctionMap=enqueue, FunctionCallCancel=cancel_rpc)
            raw_function = _Function._new_hydrated("fu-moss", client, api_pb2.FunctionHandleMetadata(
                function_name="execute_image_graph", function_type=api_pb2.Function.FUNCTION_TYPE_GENERATOR,
                input_plane_url="https://unused-input-plane.invalid", input_plane_region="eu"))
            function = synchronizer._translate_out(raw_function)
            # A real SDK input-plane-enabled generator rejects public spawn.
            with self.assertRaisesRegex(Exception, "Cannot.*spawn.*generator"):
                await function.spawn.aio({}, 1300)
            call_id, stream, call = await submit_generator(function, {}, 1300)
            self.assertEqual(call_id, CALL_ID)
            self.assertEqual(call.object_id, CALL_ID)  # Already hydrated, unlike from_id().
            request = enqueue.await_args.args[0]
            self.assertEqual(request.function_call_invocation_type, api_pb2.FUNCTION_CALL_INVOCATION_TYPE_SYNC_LEGACY)
            self.assertTrue(request.pipelined_inputs[0].input.args)
            self.assertFalse(request.pipelined_inputs[0].input.args_blob_id)

            if pending:
                # No generator iteration, no worker frame, no metadata lookup.
                await call.cancel.aio(terminate_containers=True)
                self.assertEqual(cancel_rpc.await_args.args[0].function_call_id, CALL_ID)
                self.assertTrue(cancel_rpc.await_args.args[0].terminate_containers)
                await stream.aclose()
                return

            result = {"png": PNG_SIGNATURE + b"x" * (3 * 1024 * 1024), "generation_seconds": 2}
            frames = [{"call_id": CALL_ID}, *output_frames(result)]
            async def native_frames(*args, **kwargs):
                for frame in frames:
                    yield frame
            # Keep the SDK's actual run_generator/async_merge implementation.
            with patch("modal._functions._stream_function_call_data", side_effect=native_frames), \
                 patch.object(_Invocation, "run_function", new=AsyncMock(
                     return_value=api_pb2.GeneratorDone(items_total=len(frames)))):
                received = [item async for item in stream]
            self.assertEqual(received, frames)
            await call.cancel.aio(terminate_containers=True)
            self.assertEqual(cancel_rpc.await_args.args[0].function_call_id, CALL_ID)
            self.assertTrue(cancel_rpc.await_args.args[0].terminate_containers)
        with patch.object(_Client, "from_env", new=AsyncMock(side_effect=AssertionError("Network client forbidden"))):
            for pending in [True, False]:
                with self.subTest(pending=pending):
                    asyncio.run(verify(pending))

    def test_no_first_frame_is_cancelled_with_id_saved_before_wait(self):
        async def verify():
            events = []
            async def waiting():
                try:
                    events.append("wait")
                    await asyncio.Event().wait()
                    yield None
                finally:
                    events.append("closed")
            cancel = AsyncMock(side_effect=lambda **kwargs: events.append("cancel"))
            call = SimpleNamespace(cancel=SimpleNamespace(aio=cancel))
            with patch("modal_app.comfy.moss_queue.submit_generator", new=AsyncMock(
                return_value=(CALL_ID, waiting(), call))):
                with self.assertRaisesRegex(MossQueueError, "GPU_START_TIMEOUT"):
                    await collect_moss(None, {}, lambda cid: events.append("saved:" + cid), start_window=0)
            self.assertEqual(events[0], "saved:" + CALL_ID)
            self.assertIn("closed", events)
            cancel.assert_awaited_once_with(terminate_containers=True)
        asyncio.run(verify())

    def test_cleanup_and_error_classification(self):
        async def verify(kind):
            result = {"png": PNG_SIGNATURE + b"image", "generation_seconds": 1}
            async def frames():
                if kind == "bad_header":
                    yield {"call_id": "fc-other-run"}
                    return
                yield {"call_id": CALL_ID}
                if kind == "result_timeout":
                    await asyncio.Event().wait()
                for frame in output_frames(result):
                    yield frame
            cancel = AsyncMock(side_effect=RuntimeError("sensitive provider details") if kind == "cancel_failure" else None)
            save = Mock(side_effect=RuntimeError("private database details") if kind == "save_failure" else None)
            call = SimpleNamespace(cancel=SimpleNamespace(aio=cancel))
            with patch("modal_app.comfy.moss_queue.submit_generator", new=AsyncMock(
                return_value=(CALL_ID, frames(), call))):
                if kind == "success":
                    self.assertEqual(await collect_moss(None, {}, save), result)
                elif kind == "result_timeout":
                    with self.assertRaisesRegex(MossQueueError, "GPU_EXECUTION_TIMEOUT"):
                        await collect_moss(None, {}, save, total_timeout=0.01)
                elif kind == "cancel_failure":
                    with self.assertRaisesRegex(MossQueueError, "^GPU_CANCELLATION_FAILED$"):
                        await collect_moss(None, {}, save)
                else:
                    with self.assertRaises((ValueError, RuntimeError)):
                        await collect_moss(None, {}, save)
            save.assert_called_once_with(CALL_ID)
            cancel.assert_awaited_once_with(terminate_containers=True)
        for kind in ["success", "bad_header", "save_failure", "result_timeout", "cancel_failure"]:
            with self.subTest(kind=kind):
                asyncio.run(verify(kind))

    def test_unsupported_sdk_fails_before_any_submission(self):
        function = SimpleNamespace(hydrate=SimpleNamespace(aio=AsyncMock()))
        with patch("modal.__version__", "future-version"), self.assertRaisesRegex(MossQueueError, "GPU_SDK_UNSUPPORTED"):
            asyncio.run(submit_generator(function, {}, 1300))
        function.hydrate.aio.assert_not_awaited()

    def test_uncertain_submission_is_not_reported_as_capacity_or_retried(self):
        submit = AsyncMock(side_effect=RuntimeError("sensitive provider details"))
        save = Mock()
        with patch("modal_app.comfy.moss_queue.submit_generator", new=submit), \
             self.assertRaisesRegex(MossQueueError, "^GPU_SUBMISSION_FAILED$"):
            asyncio.run(collect_moss(None, {}, save))
        submit.assert_awaited_once()
        save.assert_not_called()

    def test_broker_records_safe_code_and_publishes_nothing(self):
        from modal_app.comfy.broker import run
        from modal_app.comfy.executor import canonical_hash
        graph = json.loads((Path(__file__).resolve().parents[2] /
                            "workflows/comfy/templates/moss-image/graph.t2i.api.json").read_text())
        for runtime in ["moss-image@1", "h3-video@1"]:
            with self.subTest(runtime=runtime):
                db = MagicMock()
                db.rpc.return_value.execute.return_value.data = True
                db.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = {
                    "runtime": runtime, "reference_path": None, "resolved_graph_sha256": canonical_hash(graph),
                    "resolved_graph": graph}
                output = io.StringIO()
                with patch("modal_app.comfy.broker.database", return_value=db), contextlib.redirect_stdout(output):
                    run("00000000-0000-4000-8000-000000000000", Mock(side_effect=MossQueueError("GPU_START_TIMEOUT")))
                finish = [c for c in db.rpc.call_args_list if c.args[0] == "finish_comfy_admin_run"][-1]
                self.assertEqual(finish.args[1]["p_error"], "GPU_START_TIMEOUT" if runtime == "moss-image@1" else "GENERATION_FAILED")
                db.storage.from_.return_value.upload.assert_not_called()
                db.table.return_value.insert.assert_not_called()
                self.assertNotIn("prompt", output.getvalue())


if __name__ == "__main__":
    unittest.main()
