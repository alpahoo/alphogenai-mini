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
    SUPABASE_SERVICE_KEY: str
    SUPABASE_ANON_KEY: Optional[str] = None
    
    # AI Service API Keys
    QWEN_API_KEY: str
    QWEN_API_BASE: str = "https://api.openai.com/v1"  # OpenAI-compatible endpoint
    
    WAN_IMAGE_API_KEY: str
    WAN_IMAGE_API_BASE: str = "https://api.wan.ai/v1"
    
    PIKA_API_KEY: str
    PIKA_API_BASE: str = "https://api.pika.art/v1"
    
    ELEVENLABS_API_KEY: str
    ELEVENLABS_API_BASE: str = "https://api.elevenlabs.io/v1"
    
    REMOTION_RENDERER_URL: str = "http://localhost:3001"
    REMOTION_SITE_ID: Optional[str] = None
    REMOTION_SECRET_KEY: Optional[str] = None
    
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
