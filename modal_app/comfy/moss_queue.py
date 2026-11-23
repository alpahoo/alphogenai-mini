"""MOSS-only bounded wait/cancellation; native Modal generator transport is preserved.

Modal 1.6.3 rejects public spawn() for generators. Its input-plane remote_gen()
does not expose a call ID until the GPU yields. Use the SDK's native control-plane
generator submission, then its own generator decoder. This private
adapter is deliberately version-locked and covered by mocked real-SDK tests.
"""
import asyncio
import time

from modal_app.comfy.transfer import receive_output

SDK_VERSION = "1.6.3"


class MossQueueError(RuntimeError):
    """Only fixed, non-sensitive codes may cross into the business run record."""
    CODES = frozenset({"GPU_START_TIMEOUT", "GPU_EXECUTION_TIMEOUT", "GPU_CANCELLATION_FAILED",
                       "GPU_SUBMISSION_FAILED", "GPU_SDK_UNSUPPORTED"})

    def __init__(self, code):
        if code not in self.CODES:
            raise ValueError("Unknown MOSS queue error")
        self.code = code
        super().__init__(code)


async def submit_generator(function, graph, start_before):
    import modal
    if modal.__version__ != SDK_VERSION:
        raise MossQueueError("GPU_SDK_UNSUPPORTED")
    from modal._functions import _FunctionCall
    from modal._utils.async_utils import synchronizer
    from modal_proto import api_pb2

    await function.hydrate.aio()
    raw_function = synchronizer._translate_in(function)
    # The SDK uses this submission helper for spawn(); SYNC_LEGACY is the same
    # invocation mode as its control-plane remote_gen(), not an async-generator spawn.
    # Enqueueing returns the call ID without waiting for a worker, even when the
    # Function metadata advertises an input-plane URL.
    invocation = await raw_function._call_function_nowait(
        (graph, start_before), {}, api_pb2.FUNCTION_CALL_INVOCATION_TYPE_SYNC_LEGACY)
    call_id = invocation.function_call_id
    # Same hydrated handle construction as SDK spawn(): cancellation needs no
    # extra metadata lookup and does not depend on a first GPU frame.
    call = synchronizer._translate_out(_FunctionCall._new_hydrated(call_id, invocation.client, None))
    return call_id, invocation.run_generator(), call


async def collect_moss(function, graph, save_call_id, start_window=300, total_timeout=660):
    loop = asyncio.get_running_loop()
    started_at = loop.time()
    start_before = time.time() + start_window
    stream = call = None
    confirmed_start = False
    try:
        try:
            async with asyncio.timeout(30):
                call_id, stream, call = await submit_generator(function, graph, start_before)
        except MossQueueError:
            raise
        except Exception:
            # An unacknowledged submission is not safe to retry automatically.
            raise MossQueueError("GPU_SUBMISSION_FAILED") from None
        save_call_id(call_id)  # Persist BEFORE waiting for the first GPU frame.
        try:
            async with asyncio.timeout(max(0, total_timeout - (loop.time() - started_at))):
                async with asyncio.timeout(max(0, start_window - (loop.time() - started_at))):
                    header = await anext(stream)
                if not isinstance(header, dict) or header.get("call_id") != call_id:
                    raise ValueError("INVALID_EXECUTOR_HANDLE")
                confirmed_start = True
                return await receive_output(stream)
        except TimeoutError as error:
            code = "GPU_EXECUTION_TIMEOUT" if confirmed_start else "GPU_START_TIMEOUT"
            if str(error) == "EXECUTOR_START_EXPIRED":
                code = "GPU_START_TIMEOUT"
            raise MossQueueError(code) from None
    finally:
        try:
            if call is not None:
                try:
                    async with asyncio.timeout(20):
                        await call.cancel.aio(terminate_containers=True)
                except Exception:
                    # Never report a successful stop or deliver an image on a failed cancellation.
                    raise MossQueueError("GPU_CANCELLATION_FAILED") from None
        finally:
            if stream is not None:
                try:
                    async with asyncio.timeout(5):
                        await stream.aclose()
                except Exception:
                    # Preserve a more important cancellation failure / timeout code.
                    print("comfy_moss_stream_close_failed")
