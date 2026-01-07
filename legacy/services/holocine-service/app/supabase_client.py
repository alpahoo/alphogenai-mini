from __future__ import annotations

import time
from typing import Any, Dict, Optional

from supabase import Client, create_client

from .config import Config
from .logging_setup import get_logger


logger = get_logger("supabase")


class SupabaseJobs:
    def __init__(self, cfg: Config) -> None:
        if not (cfg.supabase_url and cfg.supabase_service_role_key):
            raise ValueError("Supabase configuration is incomplete")
        self.client: Client = create_client(cfg.supabase_url, cfg.supabase_service_role_key)
        self.table = "jobs"

    def create_job(self, job_id: Optional[str], payload: Dict[str, Any]) -> str:
        data: Dict[str, Any] = {
            "status": "queued",
            "progress": 0.0,
            **payload,
        }
        if job_id:
            data["id"] = job_id
        res = self.client.table(self.table).insert(data).execute()
        rid = res.data[0]["id"]
        logger.info("job created", extra={"job_id": rid})
        return rid

    def update(self, job_id: str, **fields: Any) -> None:
        fields["updated_at"] = "now()"
        self.client.table(self.table).update(fields).eq("id", job_id).execute()

    def get(self, job_id: str) -> Optional[Dict[str, Any]]:
        res = self.client.table(self.table).select("*").eq("id", job_id).limit(1).execute()
        rows = res.data or []
        return rows[0] if rows else None

    def set_running(self, job_id: str) -> None:
        self.update(job_id, status="running")

    def set_progress(self, job_id: str, progress: float) -> None:
        self.update(job_id, progress=max(0.0, min(1.0, progress)))

    def set_done(self, job_id: str, video_url: str) -> None:
        self.update(job_id, status="done", progress=1.0, video_url=video_url)

    def set_error(self, job_id: str, error: str) -> None:
        self.update(job_id, status="error", error=error)
