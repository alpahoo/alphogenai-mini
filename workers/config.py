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
    
    RUNWAY_API_KEY: str
    RUNWAY_API_BASE: str = "https://api.runwayml.com/v1"
    RUNWAY_MODEL: str = "gen-4-turbo"
    
    QWEN_MOCK_ENABLED: bool = True
    
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
