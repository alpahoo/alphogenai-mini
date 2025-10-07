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
    
    def get_service_key(self) -> str:
        """Get Supabase service key with fallback"""
        return self.SUPABASE_SERVICE_ROLE_KEY or self.SUPABASE_SERVICE_KEY or ""
    
    # AI Service API Keys
    QWEN_API_KEY: str
    # Note: Qwen utilise l'API native DashScope (hardcodé dans api_services.py)
    
    # Replicate (images + vidéos)
    REPLICATE_API_TOKEN: str
    
    # Anciens services (optionnels maintenant)
    PIKA_API_KEY: Optional[str] = None
    PIKA_API_BASE: str = "https://api.pika.art/v1"
    
    # DashScope WAN Video
    DASHSCOPE_API_KEY: str
    DASHSCOPE_API_BASE: str = "https://dashscope-intl.aliyuncs.com/api/v1"
    
    # Video Engine selection
    VIDEO_ENGINE: str = "wan"  # wan, pika, or stills
    
    ELEVENLABS_API_KEY: str
    ELEVENLABS_VOICE_ID: Optional[str] = None  # Rachel par défaut si absent
    ELEVENLABS_API_BASE: str = "https://api.elevenlabs.io/v1"
    
    REMOTION_RENDERER_URL: str = "http://localhost:3001"
    REMOTION_SITE_ID: Optional[str] = None
    REMOTION_SECRET_KEY: Optional[str] = None
    LOGO_URL: Optional[str] = None
    
    # Webhook settings
    WEBHOOK_URL: Optional[str] = None
    WEBHOOK_SECRET: Optional[str] = None
    
    # Retry settings
    MAX_RETRIES: int = 3
    RETRY_DELAY: int = 5  # seconds
    
    # Job settings
    JOB_TIMEOUT: int = 3600  # 1 hour in seconds
    
    class Config:
        env_file = ".env.local"
        case_sensitive = True


def get_settings() -> Settings:
    """Get application settings singleton"""
    return Settings()
