"""Bounded native Modal stream; no Blob API or output credentials on the executor."""
import hashlib
import math

CHUNK_BYTES = 512 * 1024
MAX_BYTES = 80 * 1024 * 1024
PNG_SIGNATURE = bytes([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])


def valid_media(kind: str, raw) -> bool:
    if not isinstance(raw, (bytes, bytearray)) or not 8 <= len(raw) <= MAX_BYTES:
        return False
    if kind == "mp4":
        return raw[4:8] == b"ftyp"
    if kind == "png":
        return raw[:8] == PNG_SIGNATURE
    return False


def output_frames(result):
    kind = "png" if "png" in result else "mp4"
    raw = result[kind]
    seconds = result["generation_seconds"]
    if not isinstance(raw, bytes) or not valid_media(kind, raw):
        raise ValueError("INVALID_OUTPUT")
    if not isinstance(seconds, (int, float)) or not math.isfinite(seconds) or seconds < 0:
        raise ValueError("INVALID_DURATION")
    header = {"bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest(), "generation_seconds": seconds}
    if kind != "mp4":
        header["kind"] = kind  # H3 frames stay byte-identical to the validated pilot.
    yield header
    for offset in range(0, len(raw), CHUNK_BYTES):
        yield raw[offset:offset + CHUNK_BYTES]


async def receive_output(stream):
    metadata = await anext(stream)
    if not isinstance(metadata, dict):
        raise ValueError("INVALID_OUTPUT_HEADER")
    kind = metadata.get("kind", "mp4")
    if kind not in ("mp4", "png"):
        raise ValueError("INVALID_OUTPUT_KIND")
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
    if len(raw) != size or not valid_media(kind, raw) or hashlib.sha256(raw).hexdigest() != metadata.get("sha256"):
        raise ValueError("INCOMPLETE_OUTPUT")
    return {kind: bytes(raw), "generation_seconds": seconds}
