"""
Supabase client pour la persistance des jobs et état LangGraph
"""
from typing import Dict, Any, Optional
from datetime import datetime, timezone
import hashlib
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

    def create_job(
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

    def update_job_state(
        self,
        job_id: str,
        app_state: Optional[Dict[str, Any]] = None,
        status: Optional[str] = None,
        current_stage: Optional[str] = None,
        error_message: Optional[str] = None,
        video_url: Optional[str] = None,
        audio_url: Optional[str] = None,
        output_url_final: Optional[str] = None,
        final_url: Optional[str] = None
    ) -> None:
        """Met à jour l'état complet du job (app_state LangGraph)"""
        update_data: Dict[str, Any] = {
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }

        if app_state is not None:
            update_data["app_state"] = app_state
        if status:
            update_data["status"] = status
        if current_stage:
            update_data["current_stage"] = current_stage
        if error_message:
            update_data["error_message"] = error_message
        if video_url:
            update_data["video_url"] = video_url
        if audio_url:
            update_data["audio_url"] = audio_url
        if output_url_final:
            update_data["output_url_final"] = output_url_final
        if final_url:
            update_data["final_url"] = final_url

        self.client.table("jobs").update(update_data).eq("id", job_id).execute()

    def increment_retry(self, job_id: str) -> int:
        """Incrémente le compteur de retry et retourne la nouvelle valeur"""
        result = self.client.table("jobs").select("retry_count").eq("id", job_id).single().execute()
        current_retry = result.data.get("retry_count", 0) if result.data else 0
        new_retry = current_retry + 1

        self.client.table("jobs").update({
            "retry_count": new_retry,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }).eq("id", job_id).execute()

        return new_retry

    def get_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Récupère un job par son ID"""
        result = self.client.table("jobs").select("*").eq("id", job_id).execute()
        return result.data[0] if result.data else None

    def get_pending_jobs(self, limit: int = 1) -> list[Dict[str, Any]]:
        """Récupère les jobs en attente"""
        result = self.client.table("jobs") \
            .select("*") \
            .eq("status", "pending") \
            .order("created_at") \
            .limit(limit) \
            .execute()
        return result.data if result.data else []

    def save_to_cache(
        self,
        prompt: str,
        video_url: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> None:
        """Sauvegarde une vidéo dans le cache avec hash du prompt"""
        prompt_hash = hashlib.sha256(prompt.encode()).hexdigest()

        cache_data = {
            "prompt": prompt,
            "prompt_hash": prompt_hash,
            "video_url": video_url,
            "metadata": metadata or {},
        }

        # Upsert basé sur prompt_hash
        self.client.table("video_cache").upsert(cache_data, on_conflict="prompt_hash").execute()
