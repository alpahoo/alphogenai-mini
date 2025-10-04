"""
Supabase client for job persistence and caching
"""
from typing import Dict, Any, Optional, List
from datetime import datetime
from supabase import create_client, Client
from .config import get_settings


class SupabaseClient:
    """Wrapper for Supabase operations"""
    
    def __init__(self):
        settings = get_settings()
        self.client: Client = create_client(
            settings.SUPABASE_URL,
            settings.SUPABASE_SERVICE_KEY
        )
    
    async def create_job(
        self,
        user_id: str,
        prompt: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> str:
        """Create a new video generation job"""
        job_data = {
            "user_id": user_id,
            "prompt": prompt,
            "status": "pending",
            "metadata": metadata or {},
            "created_at": datetime.utcnow().isoformat(),
        }
        
        result = self.client.table("video_cache").insert(job_data).execute()
        return result.data[0]["id"]
    
    async def update_job_status(
        self,
        job_id: str,
        status: str,
        stage: Optional[str] = None,
        error_message: Optional[str] = None,
        result_data: Optional[Dict[str, Any]] = None
    ) -> None:
        """Update job status and metadata"""
        update_data: Dict[str, Any] = {
            "status": status,
            "updated_at": datetime.utcnow().isoformat(),
        }
        
        if stage:
            update_data["current_stage"] = stage
        if error_message:
            update_data["error_message"] = error_message
        if result_data:
            update_data["result"] = result_data
        
        self.client.table("video_cache").update(update_data).eq("id", job_id).execute()
    
    async def get_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve job by ID"""
        result = self.client.table("video_cache").select("*").eq("id", job_id).execute()
        return result.data[0] if result.data else None
    
    async def check_cache(
        self,
        prompt: str,
        user_id: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """Check if a similar video was already generated"""
        query = self.client.table("video_cache").select("*").eq("prompt", prompt).eq("status", "completed")
        
        if user_id:
            query = query.eq("user_id", user_id)
        
        result = query.limit(1).execute()
        return result.data[0] if result.data else None
    
    async def save_stage_artifact(
        self,
        job_id: str,
        stage: str,
        artifact_data: Dict[str, Any]
    ) -> None:
        """Save intermediate artifacts from pipeline stages"""
        artifact = {
            "job_id": job_id,
            "stage": stage,
            "data": artifact_data,
            "created_at": datetime.utcnow().isoformat(),
        }
        
        self.client.table("video_artifacts").insert(artifact).execute()
    
    async def get_stage_artifacts(
        self,
        job_id: str,
        stage: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Get artifacts for a job, optionally filtered by stage"""
        query = self.client.table("video_artifacts").select("*").eq("job_id", job_id)
        
        if stage:
            query = query.eq("stage", stage)
        
        result = query.execute()
        return result.data if result.data else []
