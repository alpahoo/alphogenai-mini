"""
Supabase client pour la persistance des jobs et état LangGraph
"""
from typing import Dict, Any, Optional
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
from supabase import create_client, Client
from .config import get_settings


class SupabaseClient:
    """Wrapper pour les opérations Supabase avec la table jobs"""
    
    def __init__(self):
        settings = get_settings()
        service_key = settings.get_service_key()
        if not service_key:
            raise ValueError("SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_KEY must be set")
        self.client: Client = create_client(
            settings.SUPABASE_URL,
            service_key
        )
    
    async def create_job(
        self,
        user_id: str,
        prompt: str,
        initial_state: Optional[Dict[str, Any]] = None
    ) -> str:
        """Crée un nouveau job de génération vidéo"""
        job_data = {
            "user_id": user_id,
            "prompt": prompt,
            "status": "pending",
            "app_state": initial_state or {},
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        
        result = self.client.table("jobs").insert(job_data).execute()
        return result.data[0]["id"]
    
    async def update_job_state(
        self,
        job_id: str,
        app_state: Dict[str, Any],
        status: Optional[str] = None,
        current_stage: Optional[str] = None,
        error_message: Optional[str] = None,
        video_url: Optional[str] = None,
        final_url: Optional[str] = None,
        audio_url: Optional[str] = None,
        audio_score: Optional[float] = None,
        output_url_final: Optional[str] = None
    ) -> None:
        """Met à jour l'état complet du job (app_state LangGraph)"""
        update_data: Dict[str, Any] = {
            "app_state": app_state,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        
        if status:
            update_data["status"] = status
        if current_stage:
            update_data["current_stage"] = current_stage
        if error_message:
            update_data["error_message"] = error_message
        if video_url:
            update_data["video_url"] = video_url
        if final_url:
            update_data["final_url"] = final_url
        if audio_url is not None:
            update_data["audio_url"] = audio_url
        if audio_score is not None:
            update_data["audio_score"] = audio_score
        if output_url_final is not None:
            update_data["output_url_final"] = output_url_final
        
        self.client.table("jobs").update(update_data).eq("id", job_id).execute()
    
    async def increment_retry(self, job_id: str) -> int:
        """Incrémente le compteur de retry et retourne la nouvelle valeur"""
        result = self.client.table("jobs").select("retry_count").eq("id", job_id).single().execute()
        current_retry = result.data.get("retry_count", 0) if result.data else 0
        new_retry = current_retry + 1
        
        self.client.table("jobs").update({
            "retry_count": new_retry,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }).eq("id", job_id).execute()
        
        return new_retry
    
    async def get_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Récupère un job par son ID"""
        result = self.client.table("jobs").select("*").eq("id", job_id).execute()
        return result.data[0] if result.data else None
    
    async def get_pending_jobs(self, limit: int = 1) -> list[Dict[str, Any]]:
        """Récupère les jobs en attente"""
        result = self.client.table("jobs") \
            .select("*") \
            .eq("status", "pending") \
            .order("created_at") \
            .limit(limit) \
            .execute()
        return result.data if result.data else []
    
    async def save_to_cache(
        self,
        cache_key: str,
        video_url: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> None:
        """Sauvegarde une vidéo dans le cache avec clé (SHA-256 stable JSON)."""
        
        cache_data = {
            "prompt": (metadata or {}).get("prompt", ""),
            "prompt_hash": cache_key,
            "video_url": video_url,
            "metadata": metadata or {},
        }
        
        # Upsert basé sur prompt_hash
        self.client.table("video_cache").upsert(cache_data, on_conflict="prompt_hash").execute()

    async def get_from_cache(self, cache_key: str) -> Optional[Dict[str, Any]]:
        """Récupère une entrée de cache par clé (prompt_hash)."""
        result = (
            self.client.table("video_cache")
            .select("video_url, metadata, prompt_hash, created_at")
            .eq("prompt_hash", cache_key)
            .limit(1)
            .execute()
        )
        if not result.data:
            return None
        row = result.data[0]
        return {
            "prompt_hash": row.get("prompt_hash"),
            "video_url": row.get("video_url"),
            "metadata": row.get("metadata") or {},
            "created_at": row.get("created_at"),
        }

    def compute_cache_key(
        self,
        prompt: str,
        *,
        duration_sec: int,
        fps: int,
        resolution: str,
        seed: Optional[int],
    ) -> str:
        """
        Cache key = sha256(stable_json(prompt + parameters)).

        Non-negotiable: must include prompt + duration/fps/resolution/seed.
        """
        payload = {
            "duration_sec": int(duration_sec),
            "fps": int(fps),
            "prompt": str(prompt),
            "resolution": str(resolution),
            "seed": seed if seed is None else int(seed),
        }
        stable = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        return hashlib.sha256(stable.encode("utf-8")).hexdigest()

    def upload_video_file(self, *, file_path: str, prefix: str = "videos") -> str:
        """
        Upload a local MP4 file to Supabase Storage bucket `generated` and return a public URL.

        V1 rule: bucket is public read. No signed URLs.
        """
        bucket_name_str = os.getenv("SUPABASE_BUCKET", "generated")

        p = Path(file_path)
        if not p.exists():
            raise FileNotFoundError(file_path)

        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        storage_path = f"{prefix}/{timestamp}_{p.name}"

        with open(p, "rb") as f:
            data = f.read()

        self.client.storage.from_(bucket_name_str).upload(
            path=storage_path,
            file=data,
            file_options={"content-type": "video/mp4"},
        )

        return self.client.storage.from_(bucket_name_str).get_public_url(storage_path)
