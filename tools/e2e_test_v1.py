#!/usr/bin/env python3
"""
E2E test (V1) — must pass without GPU.

Non-negotiable expectations:
- Uses MockBackend by default (VIDEO_BACKEND=mock)
- Creates a job
- Worker processes it
- Job ends in status=done
- output_url_final is publicly accessible (HTTP 200)
"""

import asyncio
import os
import time
from typing import Any, Dict

import requests

from workers.config import get_settings
from workers.supabase_client import SupabaseClient
from workers.worker import AlphogenAIWorker


def _require_env(name: str) -> str:
    v = os.getenv(name)
    if not v:
        raise SystemExit(f"Missing required env var: {name}")
    return v


def create_pending_job(supabase: SupabaseClient) -> str:
    prompt = "E2E V1: dummy video generation"
    app_state: Dict[str, Any] = {
        "prompt": prompt,
        "duration_sec": 60,
        "resolution": "1920x1080",
        "fps": 24,
        "seed": None,
        "created_via": "e2e_test_v1",
    }
    res = (
        supabase.client.table("jobs")
        .insert({"prompt": prompt, "status": "pending", "app_state": app_state})
        .select("id")
        .single()
        .execute()
    )
    return res.data["id"]


def get_job(supabase: SupabaseClient, job_id: str) -> Dict[str, Any]:
    res = (
        supabase.client.table("jobs")
        .select("*")
        .eq("id", job_id)
        .single()
        .execute()
    )
    return res.data


async def run_worker_once():
    worker = AlphogenAIWorker(poll_interval=1)
    worker.running = True
    await worker._process_pending_jobs()
    worker.running = False


def main():
    os.environ.setdefault("VIDEO_BACKEND", "mock")

    # Supabase creds must exist
    _require_env("SUPABASE_URL")
    _require_env("SUPABASE_SERVICE_ROLE_KEY") if os.getenv("SUPABASE_SERVICE_ROLE_KEY") else _require_env("SUPABASE_SERVICE_KEY")
    os.environ.setdefault("SUPABASE_BUCKET", "generated")

    supabase = SupabaseClient()

    job_id = create_pending_job(supabase)
    print(f"✅ Created job: {job_id}")

    # Process job (retry a few times to avoid transient issues)
    for i in range(5):
        asyncio.run(run_worker_once())
        job = get_job(supabase, job_id)
        print(f"🔎 status={job.get('status')} stage={job.get('current_stage')}")
        if job.get("status") in ("done", "failed"):
            break
        time.sleep(1)

    job = get_job(supabase, job_id)
    if job.get("status") != "done":
        raise SystemExit(f"❌ Job did not complete: status={job.get('status')} error={job.get('error_message')}")

    url = job.get("output_url_final") or job.get("final_url") or job.get("video_url")
    if not url:
        raise SystemExit("❌ output_url_final missing")

    r = requests.get(url, timeout=30)
    if r.status_code != 200:
        raise SystemExit(f"❌ output_url_final not accessible: {r.status_code}")

    ct = r.headers.get("content-type", "")
    if "video" not in ct and "mp4" not in ct:
        print(f"⚠️ content-type unexpected: {ct}")

    print("🎉 E2E V1 PASS (done + url accessible)")


if __name__ == "__main__":
    main()

