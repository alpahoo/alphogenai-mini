#!/usr/bin/env python3
"""
Storage Utilities

This module provides storage management for audio files:
- Supabase Storage (primary)
- Cloudflare R2 (optional, when credentials available)
"""

import os
import logging
from typing import Optional
from pathlib import Path
from datetime import datetime

logger = logging.getLogger(__name__)


class StorageError(Exception):
    """Exception raised when storage operations fail."""
    pass


class StorageManager:
    """
    Manages file uploads to Supabase Storage and Cloudflare R2.
    
    Priority: R2 if configured, otherwise Supabase Storage.
    """
    
    def __init__(self):
        """Initialize storage manager."""
        self.supabase_client = None
        self.r2_client = None
        self.use_r2 = False
        
        self._init_supabase()
        self._init_r2()
    
    def _init_supabase(self):
        """Initialize Supabase storage client."""
        try:
            from supabase import create_client
            
            supabase_url = os.getenv("SUPABASE_URL")
            supabase_key = os.getenv("SUPABASE_SERVICE_ROLE") or os.getenv("SUPABASE_SERVICE_KEY")
            
            if not supabase_url or not supabase_key:
                raise StorageError("Supabase credentials not found")
            
            self.supabase_client = create_client(supabase_url, supabase_key)
            logger.info("✓ Supabase Storage initialized")
            
        except Exception as e:
            logger.error(f"Failed to initialize Supabase Storage: {e}")
            raise StorageError(f"Supabase initialization failed: {e}")
    
    def _init_r2(self):
        """Initialize Cloudflare R2 client (optional)."""
        try:
            r2_endpoint = os.getenv("R2_ENDPOINT")
            r2_access_key = os.getenv("R2_ACCESS_KEY_ID")
            r2_secret_key = os.getenv("R2_SECRET_ACCESS_KEY")
            r2_bucket = os.getenv("R2_BUCKET")
            
            if all([r2_endpoint, r2_access_key, r2_secret_key, r2_bucket]):
                import boto3
                
                self.r2_client = boto3.client(
                    's3',
                    endpoint_url=r2_endpoint,
                    aws_access_key_id=r2_access_key,
                    aws_secret_access_key=r2_secret_key,
                    region_name='auto'
                )
                
                self.r2_bucket = r2_bucket
                self.use_r2 = True
                logger.info("✓ Cloudflare R2 initialized (will be used as primary)")
            else:
                logger.info("R2 credentials not fully configured - using Supabase Storage only")
                
        except Exception as e:
            logger.warning(f"R2 initialization failed (will use Supabase): {e}")
            self.use_r2 = False
    
    async def upload_audio(
        self,
        file_path: str,
        prefix: str = "audio",
        public: bool = True
    ) -> str:
        """
        Upload audio file to storage.
        
        Args:
            file_path: Path to audio file
            prefix: Storage path prefix
            public: Whether file should be publicly accessible
            
        Returns:
            Public URL of uploaded file
        """
        if not os.path.exists(file_path):
            raise StorageError(f"File not found: {file_path}")
        
        if self.use_r2:
            try:
                return await self._upload_to_r2(file_path, prefix, public)
            except Exception as e:
                logger.error(f"R2 upload failed, falling back to Supabase: {e}")
        
        return await self._upload_to_supabase(file_path, prefix, public)
    
    async def _upload_to_supabase(
        self,
        file_path: str,
        prefix: str,
        public: bool
    ) -> str:
        """Upload file to Supabase Storage."""
        try:
            logger.info(f"Uploading to Supabase Storage: {file_path}")
            
            bucket_name = os.getenv("SUPABASE_BUCKET", "generated")
            
            file_name = Path(file_path).name
            timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
            storage_path = f"{prefix}/{timestamp}_{file_name}"
            
            with open(file_path, "rb") as f:
                file_data = f.read()
            
            result = self.supabase_client.storage.from_(bucket_name).upload(
                path=storage_path,
                file=file_data,
                file_options={"content-type": "audio/wav"}
            )
            
            public_url = self.supabase_client.storage.from_(bucket_name).get_public_url(storage_path)
            
            logger.info(f"✓ Uploaded to Supabase: {public_url}")
            return public_url
            
        except Exception as e:
            logger.error(f"Supabase upload failed: {e}")
            raise StorageError(f"Supabase upload failed: {e}")
    
    async def _upload_to_r2(
        self,
        file_path: str,
        prefix: str,
        public: bool
    ) -> str:
        """Upload file to Cloudflare R2."""
        try:
            logger.info(f"Uploading to R2: {file_path}")
            
            file_name = Path(file_path).name
            timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
            storage_path = f"{prefix}/{timestamp}_{file_name}"
            
            with open(file_path, "rb") as f:
                self.r2_client.upload_fileobj(
                    f,
                    self.r2_bucket,
                    storage_path,
                    ExtraArgs={
                        "ContentType": "audio/wav",
                        "ACL": "public-read" if public else "private"
                    }
                )
            
            r2_endpoint = os.getenv("R2_ENDPOINT")
            public_url = f"{r2_endpoint}/{self.r2_bucket}/{storage_path}"
            
            logger.info(f"✓ Uploaded to R2: {public_url}")
            return public_url
            
        except Exception as e:
            logger.error(f"R2 upload failed: {e}")
            raise StorageError(f"R2 upload failed: {e}")
    
    async def upload_video(
        self,
        file_path: str,
        prefix: str = "videos",
        public: bool = True
    ) -> str:
        """
        Upload video file to storage.
        
        Args:
            file_path: Path to video file
            prefix: Storage path prefix
            public: Whether file should be publicly accessible
            
        Returns:
            Public URL of uploaded file
        """
        if not os.path.exists(file_path):
            raise StorageError(f"File not found: {file_path}")
        
        if self.use_r2:
            try:
                return await self._upload_video_to_r2(file_path, prefix, public)
            except Exception as e:
                logger.error(f"R2 video upload failed, falling back to Supabase: {e}")
        
        return await self._upload_video_to_supabase(file_path, prefix, public)
    
    async def _upload_video_to_supabase(
        self,
        file_path: str,
        prefix: str,
        public: bool
    ) -> str:
        """Upload video to Supabase Storage."""
        try:
            logger.info(f"Uploading video to Supabase Storage: {file_path}")
            
            bucket_name = os.getenv("SUPABASE_BUCKET", "generated")
            
            file_name = Path(file_path).name
            timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
            storage_path = f"{prefix}/{timestamp}_{file_name}"
            
            with open(file_path, "rb") as f:
                file_data = f.read()
            
            result = self.supabase_client.storage.from_(bucket_name).upload(
                path=storage_path,
                file=file_data,
                file_options={"content-type": "video/mp4"}
            )
            
            public_url = self.supabase_client.storage.from_(bucket_name).get_public_url(storage_path)
            
            logger.info(f"✓ Video uploaded to Supabase: {public_url}")
            return public_url
            
        except Exception as e:
            logger.error(f"Supabase video upload failed: {e}")
            raise StorageError(f"Supabase video upload failed: {e}")
    
    async def _upload_video_to_r2(
        self,
        file_path: str,
        prefix: str,
        public: bool
    ) -> str:
        """Upload video to Cloudflare R2."""
        try:
            logger.info(f"Uploading video to R2: {file_path}")
            
            file_name = Path(file_path).name
            timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
            storage_path = f"{prefix}/{timestamp}_{file_name}"
            
            with open(file_path, "rb") as f:
                self.r2_client.upload_fileobj(
                    f,
                    self.r2_bucket,
                    storage_path,
                    ExtraArgs={
                        "ContentType": "video/mp4",
                        "ACL": "public-read" if public else "private"
                    }
                )
            
            r2_endpoint = os.getenv("R2_ENDPOINT")
            public_url = f"{r2_endpoint}/{self.r2_bucket}/{storage_path}"
            
            logger.info(f"✓ Video uploaded to R2: {public_url}")
            return public_url
            
        except Exception as e:
            logger.error(f"R2 video upload failed: {e}")
            raise StorageError(f"R2 video upload failed: {e}")
