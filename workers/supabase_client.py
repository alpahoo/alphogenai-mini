"""
Client Supabase pour la persistence des jobs AlphogenAI Mini
"""
from typing import Dict, Any, Optional
from datetime import datetime
from supabase import create_client, Client
from .config import get_settings


class SupabaseClient:
    """Client Supabase avec sauvegarde d'état dans jobs.app_state"""
    
    def __init__(self):
        settings = get_settings()
        self.client: Client = create_client(
            settings.SUPABASE_URL,
            settings.SUPABASE_SERVICE_KEY
        )
    
    async def create_job(
        self,
        user_id: str,
        prompt: str
    ) -> str:
        """Crée un nouveau job"""
        job_data = {
            "user_id": user_id,
            "prompt": prompt,
            "status": "pending",
            "app_state": {},
            "created_at": datetime.utcnow().isoformat(),
        }
        
        result = self.client.table("jobs").insert(job_data).execute()
        return result.data[0]["id"]
    
    async def update_job_state(
        self,
        job_id: str,
        status: str,
        app_state: Dict[str, Any],
        error_message: Optional[str] = None,
        result_data: Optional[Dict[str, Any]] = None
    ) -> None:
        """Met à jour le statut et l'état complet du job"""
        update_data: Dict[str, Any] = {
            "status": status,
            "app_state": app_state,
            "updated_at": datetime.utcnow().isoformat(),
        }
        
        if error_message:
            update_data["error_message"] = error_message
        if result_data:
            update_data["result"] = result_data
        
        self.client.table("jobs").update(update_data).eq("id", job_id).execute()
    
    async def get_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Récupère un job par ID"""
        result = self.client.table("jobs").select("*").eq("id", job_id).execute()
        return result.data[0] if result.data else None
    
    async def check_cache(
        self,
        prompt: str,
        user_id: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """Vérifie si une vidéo similaire existe déjà"""
        query = self.client.table("jobs").select("*").eq("prompt", prompt).eq("status", "completed")
        
        if user_id:
            query = query.eq("user_id", user_id)
        
        result = query.limit(1).execute()
        return result.data[0] if result.data else None
