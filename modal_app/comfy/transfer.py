"""Bounded native Modal stream; no Blob API or output credentials on the executor."""
import hashlib
import math

CHUNK_BYTES = 512 * 1024
MAX_BYTES = 80 * 1024 * 1024


def output_frames(result):
    raw = result["mp4"]
    seconds = result["generation_seconds"]
    if not isinstance(raw, bytes) or not 8 <= len(raw) <= MAX_BYTES or raw[4:8] != b"ftyp":
        raise ValueError("INVALID_OUTPUT")
    if not isinstance(seconds, (int, float)) or not math.isfinite(seconds) or seconds < 0:
        raise ValueError("INVALID_DURATION")
    yield {"bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest(), "generation_seconds": seconds}
    for offset in range(0, len(raw), CHUNK_BYTES):
        yield raw[offset:offset + CHUNK_BYTES]


async def receive_output(stream):
    metadata = await anext(stream)
    if not isinstance(metadata, dict):
        raise ValueError("INVALID_OUTPUT_HEADER")
    size = metadata.get("bytes")
    seconds = metadata.get("generation_seconds")
    if type(size) is not int or not 8 <= size <= MAX_BYTES:
        raise ValueError("INVALID_OUTPUT_SIZE")
    if not isinstance(seconds, (int, float)) or not math.isfinite(seconds) or seconds < 0:
        raise ValueError("INVALID_DURATION")
    raw = bytearray()
    async for chunk in stream:
        if not isinstance(chunk, bytes) or not 0 < len(chunk) <= CHUNK_BYTES or len(raw) + len(chunk) > size:
            raise ValueError("INVALID_OUTPUT_CHUNK")
        raw.extend(chunk)
    if len(raw) != size or raw[4:8] != b"ftyp" or hashlib.sha256(raw).hexdigest() != metadata.get("sha256"):
        raise ValueError("INCOMPLETE_OUTPUT")
    return {"mp4": bytes(raw), "generation_seconds": seconds}
