"""Private admin pilot orchestration. No provider or legacy pipeline imports."""
import os
import struct
import tempfile
import uuid
import zlib
from pathlib import Path

from supabase import create_client

from modal_app.comfy.executor import canonical_hash
from modal_app.comfy.postprocess import shift_audio
from modal_app.comfy.transfer import PNG_SIGNATURE
from modal_app.comfy.moss_queue import MossQueueError

SUPPORTED_RUNTIMES = ("h3-video@1", "moss-image@1")
MAX_PNG_BYTES = 40 * 1024 * 1024
# MOSS renders about 1 MP; 4 MP leaves room for every declared aspect and bounds memory (<= ~16 MiB raw).
MAX_PNG_PIXELS = 4 * 1024 * 1024
MIN_PNG_BYTES = 8 + 25 + 12 + 12  # signature + IHDR + empty IDAT + IEND
CHANNELS = {2: 3, 6: 4}  # 8-bit RGB / RGBA, what ComfyUI SaveImage writes


def database():
    return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])


def png_size(raw: bytes) -> tuple[int, int]:
    """Width/height from the IHDR chunk; rejects anything that is not a plain PNG."""
    if len(raw) < 33 or raw[:8] != PNG_SIGNATURE or raw[12:16] != b"IHDR":
        raise ValueError("INVALID_OUTPUT")
    return struct.unpack(">II", raw[16:24])


def validate_png(raw: bytes, expected: tuple[int, int]) -> None:
    """Fully check a PNG before it is published, with bounded memory.

    Walks every chunk (length, type, CRC), requires IHDR first, contiguous IDAT and a final IEND with nothing
    after it, refuses unknown critical chunks, then inflates the image stream incrementally with a hard output
    cap and checks it is exactly one filtered scanline per row with valid filter types. A truncated or
    corrupted file fails one of these checks. Dimensions must equal the frozen graph's latent size.
    """
    if not isinstance(raw, bytes) or not MIN_PNG_BYTES <= len(raw) <= MAX_PNG_BYTES or raw[:8] != PNG_SIGNATURE:
        raise ValueError("INVALID_OUTPUT")
    pos, header, idat, idat_closed, ended = 8, None, [], False, False
    while pos < len(raw):
        if pos + 12 > len(raw):
            raise ValueError("INVALID_OUTPUT")
        length = struct.unpack(">I", raw[pos:pos + 4])[0]
        kind = raw[pos + 4:pos + 8]
        end = pos + 12 + length
        if length > 0x7FFFFFFF or end > len(raw) or not kind.isalpha():
            raise ValueError("INVALID_OUTPUT")
        data = raw[pos + 8:pos + 8 + length]
        if struct.unpack(">I", raw[end - 4:end])[0] != zlib.crc32(kind + data):
            raise ValueError("INVALID_OUTPUT")
        if header is None and kind != b"IHDR":
            raise ValueError("INVALID_OUTPUT")
        if kind == b"IHDR":
            if header is not None or length != 13:
                raise ValueError("INVALID_OUTPUT")
            header = struct.unpack(">IIBBBBB", data)
        elif kind == b"IDAT":
            if idat_closed:
                raise ValueError("INVALID_OUTPUT")  # IDAT chunks must be consecutive
            idat.append(data)
        elif kind == b"IEND":
            if length != 0 or end != len(raw):
                raise ValueError("INVALID_OUTPUT")
            ended = True
        elif kind[0:1].isupper():
            raise ValueError("INVALID_OUTPUT")  # PLTE or unknown critical chunk: not a SaveImage output
        elif idat:
            idat_closed = True  # an ancillary chunk after IDAT ends the IDAT run
        pos = end
    if not ended or header is None or not idat:
        raise ValueError("INVALID_OUTPUT")
    width, height, depth, color, compression, filtering, interlace = header
    if width == 0 or height == 0 or width * height > MAX_PNG_PIXELS:
        raise ValueError("UNEXPECTED_DIMENSIONS")
    if (width, height) != tuple(expected):
        raise ValueError("UNEXPECTED_DIMENSIONS")
    if depth != 8 or color not in CHANNELS or (compression, filtering, interlace) != (0, 0, 0):
        raise ValueError("INVALID_OUTPUT")
    stride = 1 + width * CHANNELS[color]
    expected_size = stride * height
    inflater, produced, row_pos = zlib.decompressobj(), 0, 0
    try:
        for part in idat:
            pending = part
            while pending:
                out = inflater.decompress(pending, expected_size - produced + 1)
                pending = inflater.unconsumed_tail
                produced += len(out)
                if produced > expected_size or (inflater.eof and (pending or inflater.unused_data)):
                    raise ValueError("INVALID_OUTPUT")
                # Every scanline starts with a filter type 0..4.
                while row_pos < produced:
                    offset = row_pos - (produced - len(out))
                    if out[offset] > 4:
                        raise ValueError("INVALID_OUTPUT")
                    row_pos += stride
                if not out and pending:
                    raise ValueError("INVALID_OUTPUT")
        tail = inflater.flush()
    except zlib.error as error:
        raise ValueError("INVALID_OUTPUT") from error
    if tail or not inflater.eof or inflater.unused_data or produced != expected_size:
        raise ValueError("INVALID_OUTPUT")


def store_image(db, row: dict, run_id: str, graph: dict, result: dict, uploaded: list) -> None:
    raw = result.get("png")
    latent = graph["6"]["inputs"]
    # Validated completely before any upload or asset row: a failure publishes nothing.
    validate_png(raw, (latent["width"], latent["height"]))
    key = f"{row['user_id']}/{run_id}/raw.png"
    db.storage.from_("comfy-outputs").upload(key, raw,
        {"content-type": "image/png", "cache-control": "no-store", "upsert": "false"})
    uploaded.append(key)
    db.table("comfy_assets").insert({"run_id": run_id, "owner_id": row["user_id"],
        "role": "raw", "storage_key": key, "mime": "image/png"}).execute()


def store_video(db, row: dict, run_id: str, result: dict, uploaded: list) -> None:
    raw = result["mp4"]
    if not isinstance(raw, bytes) or len(raw) > 80 * 1024 * 1024 or raw[4:8] != b"ftyp":
        raise ValueError("INVALID_OUTPUT")
    with tempfile.TemporaryDirectory() as directory:
        source, corrected = Path(directory) / "raw.mp4", Path(directory) / "final.mp4"
        source.write_bytes(raw)
        shift_audio(source, corrected, float(row["params_effective"]["audio_shift_s"]))
        for role, path in (("raw", source), ("final", corrected)):
            key = f"{row['user_id']}/{run_id}/{role}.mp4"
            db.storage.from_("comfy-outputs").upload(key, path.read_bytes(),
                {"content-type": "video/mp4", "cache-control": "no-store", "upsert": "false"})
            uploaded.append(key)
            db.table("comfy_assets").insert({"run_id": run_id, "owner_id": row["user_id"],
                "role": role, "storage_key": key}).execute()


def run(run_id: str, invoke) -> None:
    uuid.UUID(run_id)
    db = database()
    if db.rpc("claim_comfy_admin_run", {"p_run": run_id}).execute().data is not True:
        return
    uploaded = []
    finished = False
    runtime = None
    try:
        row = db.table("comfy_runs").select("*").eq("id", run_id).single().execute().data
        graph = db.table("comfy_run_graphs").select("resolved_graph").eq("run_id", run_id).single().execute().data["resolved_graph"]
        runtime = row["runtime"]
        if runtime not in SUPPORTED_RUNTIMES or canonical_hash(graph) != row["resolved_graph_sha256"]:
            raise ValueError("GRAPH_MISMATCH")
        reference = None
        if row["reference_path"]:
            if runtime != "h3-video@1":
                raise ValueError("REFERENCE_NOT_SUPPORTED")
            if not row["reference_path"].startswith(row["user_id"] + "/") or ".." in row["reference_path"]:
                raise ValueError("INVALID_REFERENCE")
            reference = db.storage.from_("references").download(row["reference_path"])
            if len(reference) > 10 * 1024 * 1024:
                raise ValueError("INPUT_TOO_LARGE")
        if runtime == "h3-video@1":
            result = invoke(graph, reference, run_id)
            store_video(db, row, run_id, result, uploaded)
        else:
            result = invoke(graph, None, run_id, runtime=runtime)
            store_image(db, row, run_id, graph, result, uploaded)
        finished = db.rpc("finish_comfy_admin_run", {"p_run": run_id, "p_success": True, "p_error": None,
            "p_seconds": result["generation_seconds"]}).execute().data is True
        # Success RPC may fence a late worker into failed. Such files must be removed.
        status = db.table("comfy_runs").select("status").eq("id",run_id).single().execute().data["status"]
        finished = finished and status == "done"
    except Exception as error:
        # Raw errors, prompts and storage tokens must never appear in a public response/log.
        code = error.code if runtime == "moss-image@1" and isinstance(error, MossQueueError) else "GENERATION_FAILED"
        print(f"comfy_run_failed run={run_id} code={code}")
        db.rpc("finish_comfy_admin_run", {"p_run": run_id, "p_success": False, "p_error": code, "p_seconds": None}).execute()
    finally:
        if not finished:
            if uploaded:
                db.storage.from_("comfy-outputs").remove(uploaded)
            db.table("comfy_assets").delete().eq("run_id",run_id).execute()
