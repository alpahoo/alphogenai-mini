"""
Configuration management for AlphoGenAI Mini workers
"""
import os
from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""
    
    # Supabase
    SUPABASE_URL: str
    SUPABASE_SERVICE_KEY: Optional[str] = None
    SUPABASE_SERVICE_ROLE_KEY: Optional[str] = None
    SUPABASE_ANON_KEY: Optional[str] = None
    SUPABASE_BUCKET: str = "generated"
    
    def get_service_key(self) -> str:
        """Get Supabase service key with fallback"""
        return self.SUPABASE_SERVICE_ROLE_KEY or self.SUPABASE_SERVICE_KEY or ""

    # Video backend selection (V1)
    # mock = default local/CI (uploads a 1s dummy mp4)
    # modal = production backend (Modal serverless GPU)
    VIDEO_BACKEND: str = "mock"
    MODAL_VIDEO_ENDPOINT_URL: Optional[str] = None
    
    OPENAI_API_KEY: Optional[str] = None
    OPENAI_MODEL: str = "gpt-4o-mini"
    
    QWEN_MOCK_ENABLED: bool = True
    
    # Webhook settings
    WEBHOOK_URL: Optional[str] = None
    WEBHOOK_SECRET: Optional[str] = None
    
    # Retry settings
    MAX_RETRIES: int = 3
    RETRY_DELAY: int = 5  # seconds
    
    # Job settings
    JOB_TIMEOUT: int = 3600  # 1 hour in seconds
    
    NO_STORAGE_UPLOAD: bool = False
    MUSIC_SOURCE: str = "external"
    ASSEMBLER_SHARED_SECRET: Optional[str] = None
    PORT: int = 8000
    
    class Config:
        env_file = ".env.local"
        case_sensitive = True


def get_settings() -> Settings:
    """Get application settings singleton"""
    return Settings()
