"""Private admin pilot orchestration. No provider or legacy pipeline imports."""
import os
import tempfile
import uuid
from pathlib import Path

from supabase import create_client

from modal_app.comfy.executor import canonical_hash
from modal_app.comfy.postprocess import shift_audio


def database():
    return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])


def run(run_id: str, invoke) -> None:
    uuid.UUID(run_id)
    db = database()
    if db.rpc("claim_comfy_admin_run", {"p_run": run_id}).execute().data is not True:
        return
    uploaded = []
    finished = False
    try:
        row = db.table("comfy_runs").select("*").eq("id", run_id).single().execute().data
        graph = db.table("comfy_run_graphs").select("resolved_graph").eq("run_id", run_id).single().execute().data["resolved_graph"]
        if row["runtime"] != "h3-video@1" or canonical_hash(graph) != row["resolved_graph_sha256"]:
            raise ValueError("GRAPH_MISMATCH")
        reference = None
        if row["reference_path"]:
            if not row["reference_path"].startswith(row["user_id"] + "/") or ".." in row["reference_path"]:
                raise ValueError("INVALID_REFERENCE")
            reference = db.storage.from_("references").download(row["reference_path"])
            if len(reference) > 10 * 1024 * 1024:
                raise ValueError("INPUT_TOO_LARGE")
        result = invoke(graph, reference, run_id)
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
        finished = db.rpc("finish_comfy_admin_run", {"p_run": run_id, "p_success": True, "p_error": None,
            "p_seconds": result["generation_seconds"]}).execute().data is True
        # Success RPC may fence a late worker into failed. Such files must be removed.
        status = db.table("comfy_runs").select("status").eq("id",run_id).single().execute().data["status"]
        finished = finished and status == "done"
    except Exception:
        # Raw errors, prompts and storage tokens must never appear in a public response/log.
        db.rpc("finish_comfy_admin_run", {"p_run": run_id, "p_success": False, "p_error": "GENERATION_FAILED", "p_seconds": None}).execute()
    finally:
        if not finished:
            if uploaded:
                db.storage.from_("comfy-outputs").remove(uploaded)
            db.table("comfy_assets").delete().eq("run_id",run_id).execute()
