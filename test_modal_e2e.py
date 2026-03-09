#!/usr/bin/env python3
"""Test E2E complet: Supabase + Modal pipeline avec poll long."""
import os, httpx, time, sys
from datetime import datetime, timezone
from dotenv import load_dotenv
load_dotenv(".env.local")
from supabase import create_client

client = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_ROLE_KEY"))
MODAL_URL = os.getenv("MODAL_WEBHOOK_URL")
MODAL_SECRET = os.getenv("MODAL_WEBHOOK_SECRET")

print("=" * 60)
print("TEST E2E — MODAL PIPELINE (poll 8 min)")
print(f"Date: {datetime.now(timezone.utc).isoformat()}")
print("=" * 60)

# 1. Créer le job
prompt = "A red fox running through autumn forest leaves"
result = client.table("jobs").insert({
    "prompt": prompt, "plan": "free", "status": "pending", "current_stage": "queued",
}).execute()
job_id = result.data[0]["id"]
print(f"Job: {job_id}")

# 2. Trigger Modal
resp = httpx.post(
    MODAL_URL,
    headers={"Content-Type": "application/json", "x-webhook-secret": MODAL_SECRET},
    json={"job_id": job_id, "prompt": prompt, "plan": "free"},
    timeout=15.0,
)
print(f"Modal: {resp.status_code} — {resp.text[:100]}")

# 3. Poll (8 min max)
print("\nPolling...")
prev_status = ""
for i in range(96):  # 96 x 5s = 8 min
    time.sleep(5)
    j = client.table("jobs").select(
        "status, current_stage, video_url, output_url_final, error_message"
    ).eq("id", job_id).single().execute().data

    s = f'{j["status"]:12} | {(j.get("current_stage") or "?"):20}'
    if s != prev_status:
        print(f"  [{i*5:3d}s] {s}")
        prev_status = s

    if j["status"] in ("done", "failed"):
        print(f"\n  === JOB TERMINE ===")
        print(f"  Status:  {j['status']}")
        print(f"  Video:   {j.get('video_url') or 'none'}")
        print(f"  Final:   {j.get('output_url_final') or 'none'}")
        if j.get("error_message"):
            print(f"  Error:   {j['error_message'][:300]}")
        break
else:
    print(f"\n  TIMEOUT après 8 minutes")
    j = client.table("jobs").select("*").eq("id", job_id).single().execute().data
    print(f"  Status: {j['status']} | Stage: {j.get('current_stage')}")
    print(f"  Error: {j.get('error_message', 'none')}")

print("\n" + "=" * 60)
