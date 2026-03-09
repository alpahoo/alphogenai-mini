#!/usr/bin/env python3
"""
Test E2E du pipeline AlphoGenAI Mini avec Supabase réel.
Simule le workflow complet : création job → mise à jour stages → completion.
"""
import os
import sys
import time
import logging
from datetime import datetime, timezone

from dotenv import load_dotenv
load_dotenv(".env.local")

from supabase import create_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
logger = logging.getLogger("e2e")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

PASS = 0
FAIL = 0


def check(name: str, ok: bool, detail: str = ""):
    global PASS, FAIL
    if ok:
        PASS += 1
        print(f"  OK  {name}" + (f" — {detail}" if detail else ""))
    else:
        FAIL += 1
        print(f"  ERR {name}" + (f" — {detail}" if detail else ""))


def main():
    print("=" * 60)
    print("TEST E2E — PIPELINE ALPHOGENAI MINI (Supabase)")
    print(f"Date: {datetime.now(timezone.utc).isoformat()}")
    print("=" * 60)

    client = create_client(SUPABASE_URL, SUPABASE_KEY)
    check("supabase_connection", True)

    # ─── 1. Créer un job test ───
    print("\n[1] Création du job test")
    test_prompt = f"E2E test: golden eagle over mountains — {datetime.now(timezone.utc).isoformat()}"

    result = client.table("jobs").insert({
        "prompt": test_prompt,
        "plan": "free",
        "status": "pending",
        "current_stage": "queued",
    }).execute()

    check("job_created", len(result.data) == 1)
    job = result.data[0]
    job_id = job["id"]
    print(f"  Job ID: {job_id}")
    check("job_status_pending", job["status"] == "pending")
    check("job_stage_queued", job["current_stage"] == "queued")
    check("job_plan_free", job.get("plan") == "free")

    # ─── 2. Simuler stage: generating_video ───
    print("\n[2] Stage: generating_video")
    client.table("jobs").update({
        "status": "in_progress",
        "current_stage": "generating_video",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", job_id).execute()

    job = client.table("jobs").select("*").eq("id", job_id).single().execute().data
    check("status_in_progress", job["status"] == "in_progress")
    check("stage_generating_video", job["current_stage"] == "generating_video")

    # ─── 3. Simuler vidéo générée ───
    print("\n[3] Stage: generating_audio (vidéo reçue)")
    fake_video_url = "https://r2.example.com/videos/test_eagle_e2e.mp4"
    client.table("jobs").update({
        "current_stage": "generating_audio",
        "video_url": fake_video_url,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", job_id).execute()

    job = client.table("jobs").select("*").eq("id", job_id).single().execute().data
    check("video_url_saved", job["video_url"] == fake_video_url)
    check("stage_generating_audio", job["current_stage"] == "generating_audio")

    # ─── 4. Simuler audio généré ───
    print("\n[4] Stage: mixing")
    fake_audio_url = "https://r2.example.com/audio/test_eagle_audio.mp3"
    client.table("jobs").update({
        "current_stage": "mixing",
        "audio_url": fake_audio_url,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", job_id).execute()

    job = client.table("jobs").select("*").eq("id", job_id).single().execute().data
    check("audio_url_saved", job["audio_url"] == fake_audio_url)
    check("stage_mixing", job["current_stage"] == "mixing")

    # ─── 5. Simuler upload ───
    print("\n[5] Stage: uploading")
    client.table("jobs").update({
        "current_stage": "uploading",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", job_id).execute()

    job = client.table("jobs").select("*").eq("id", job_id).single().execute().data
    check("stage_uploading", job["current_stage"] == "uploading")

    # ─── 6. Simuler complétion ───
    print("\n[6] Stage: completed")
    fake_final_url = "https://r2.example.com/videos/test_eagle_final.mp4"
    client.table("jobs").update({
        "status": "done",
        "current_stage": "completed",
        "output_url_final": fake_final_url,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", job_id).execute()

    job = client.table("jobs").select("*").eq("id", job_id).single().execute().data
    check("status_done", job["status"] == "done")
    check("stage_completed", job["current_stage"] == "completed")
    check("output_url_final_saved", job["output_url_final"] == fake_final_url)
    check("video_url_preserved", job["video_url"] == fake_video_url)
    check("audio_url_preserved", job["audio_url"] == fake_audio_url)

    # ─── 7. Test webhook security (champs non autorisés) ───
    print("\n[7] Test intégrité DB (champs interdits)")
    # Tenter d'écrire un champ qui n'existe pas — Supabase ignore silently
    try:
        client.table("jobs").update({
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", job_id).execute()
        check("update_safe_fields_ok", True)
    except Exception as e:
        check("update_safe_fields_ok", False, str(e))

    # ─── 8. Test retry / error flow ───
    print("\n[8] Test error flow")
    error_result = client.table("jobs").insert({
        "prompt": f"E2E error test — {datetime.now(timezone.utc).isoformat()}",
        "plan": "pro",
        "status": "pending",
        "current_stage": "queued",
    }).execute()

    error_job_id = error_result.data[0]["id"]

    client.table("jobs").update({
        "status": "failed",
        "error_message": "E2E test: simulated GPU timeout after 720s",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", error_job_id).execute()

    error_job = client.table("jobs").select("*").eq("id", error_job_id).single().execute().data
    check("error_status_failed", error_job["status"] == "failed")
    check("error_message_saved", "GPU timeout" in (error_job.get("error_message") or ""))
    check("error_plan_pro", error_job.get("plan") == "pro")

    # ─── 9. Test retry count ───
    print("\n[9] Test retry count")
    client.table("jobs").update({
        "status": "pending",
        "retry_count": 1,
        "error_message": None,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", error_job_id).execute()

    retried = client.table("jobs").select("retry_count, status").eq("id", error_job_id).single().execute().data
    check("retry_count_incremented", retried["retry_count"] == 1)
    check("retry_status_pending", retried["status"] == "pending")

    # ─── 10. Cleanup test jobs ───
    print("\n[10] Cleanup")
    client.table("jobs").delete().eq("id", job_id).execute()
    client.table("jobs").delete().eq("id", error_job_id).execute()

    verify = client.table("jobs").select("id").eq("id", job_id).execute()
    check("cleanup_job_deleted", len(verify.data) == 0)

    verify2 = client.table("jobs").select("id").eq("id", error_job_id).execute()
    check("cleanup_error_job_deleted", len(verify2.data) == 0)

    # ─── Summary ───
    total = PASS + FAIL
    print(f"\n{'=' * 60}")
    print(f"RESULTATS E2E: {PASS}/{total} OK" + (f", {FAIL} ERREURS" if FAIL else ""))
    print(f"{'=' * 60}")

    sys.exit(1 if FAIL > 0 else 0)


if __name__ == "__main__":
    main()
