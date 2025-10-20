"""
Supabase Storage service for uploading and managing video files
"""
import os
import asyncio
import httpx
from typing import Optional, Dict, Any
from datetime import datetime, timedelta


class SupabaseStorageService:
    """Service for uploading videos to Supabase Storage"""
    
    def __init__(self):
        self.supabase_url = os.getenv("SUPABASE_URL")
        self.supabase_service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        
        if not self.supabase_url or not self.supabase_service_key:
            raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
    
    async def upload_video_from_url(
        self,
        video_url: str,
        file_path: str,
        bucket: str = "videos"
    ) -> Dict[str, Any]:
        """
        Download video from URL and upload to Supabase Storage
        
        Args:
            video_url: URL of the video to download
            file_path: Path where to store the file in Supabase (e.g., "scene_123.mp4")
            bucket: Supabase Storage bucket name
            
        Returns:
            Dict with storage_path, public_url, and signed_url
        """
        print(f"[Storage] Uploading video to Supabase Storage...")
        print(f"[Storage] Source: {video_url[:60]}...")
        print(f"[Storage] Target: {bucket}/{file_path}")
        
        async with httpx.AsyncClient(timeout=300.0) as client:
            # Download video from source URL
            print(f"[Storage] Downloading video...")
            video_response = await client.get(video_url)
            video_response.raise_for_status()
            video_data = video_response.content
            
            print(f"[Storage] Downloaded {len(video_data)} bytes")
            
            # Upload to Supabase Storage
            upload_url = f"{self.supabase_url}/storage/v1/object/{bucket}/{file_path}"
            
            upload_response = await client.post(
                upload_url,
                headers={
                    "Authorization": f"Bearer {self.supabase_service_key}",
                    "Content-Type": "video/mp4",
                    "x-upsert": "true"  # Allow overwrite
                },
                content=video_data
            )
            
            if upload_response.status_code not in [200, 201]:
                raise RuntimeError(
                    f"Failed to upload to Supabase Storage: {upload_response.status_code} - {upload_response.text}"
                )
            
            print(f"[Storage] ✓ Video uploaded successfully")
            
            # Generate signed URL (valid for 24 hours)
            signed_url = await self.get_signed_url(file_path, bucket, expires_in=86400)
            
            # Generate public URL (if bucket is public)
            public_url = f"{self.supabase_url}/storage/v1/object/public/{bucket}/{file_path}"
            
            return {
                "storage_path": f"{bucket}/{file_path}",
                "file_path": file_path,
                "bucket": bucket,
                "public_url": public_url,
                "signed_url": signed_url,
                "size_bytes": len(video_data)
            }
    
    async def get_signed_url(
        self,
        file_path: str,
        bucket: str = "videos",
        expires_in: int = 3600
    ) -> str:
        """
        Generate a signed URL for a file in Supabase Storage
        
        Args:
            file_path: Path to the file in storage
            bucket: Storage bucket name
            expires_in: URL expiration time in seconds (default 1 hour)
            
        Returns:
            Signed URL string
        """
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.supabase_url}/storage/v1/object/sign/{bucket}/{file_path}",
                headers={
                    "Authorization": f"Bearer {self.supabase_service_key}",
                    "Content-Type": "application/json"
                },
                json={"expiresIn": expires_in}
            )
            
            if response.status_code != 200:
                raise RuntimeError(
                    f"Failed to generate signed URL: {response.status_code} - {response.text}"
                )
            
            data = response.json()
            signed_path = data.get("signedURL")
            
            if not signed_path:
                raise ValueError(f"No signedURL in response: {data}")
            
            # Return full URL
            return f"{self.supabase_url}/storage/v1{signed_path}"
    
    async def delete_file(
        self,
        file_path: str,
        bucket: str = "videos"
    ) -> bool:
        """
        Delete a file from Supabase Storage
        
        Args:
            file_path: Path to the file in storage
            bucket: Storage bucket name
            
        Returns:
            True if deleted successfully
        """
        async with httpx.AsyncClient() as client:
            response = await client.delete(
                f"{self.supabase_url}/storage/v1/object/{bucket}/{file_path}",
                headers={
                    "Authorization": f"Bearer {self.supabase_service_key}"
                }
            )
            
            return response.status_code == 200
    
    async def list_files(
        self,
        folder_path: str = "",
        bucket: str = "videos"
    ) -> list:
        """
        List files in a Supabase Storage bucket
        
        Args:
            folder_path: Folder path to list (empty for root)
            bucket: Storage bucket name
            
        Returns:
            List of file objects
        """
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.supabase_url}/storage/v1/object/list/{bucket}",
                headers={
                    "Authorization": f"Bearer {self.supabase_service_key}",
                    "Content-Type": "application/json"
                },
                json={"prefix": folder_path}
            )
            
            if response.status_code != 200:
                raise RuntimeError(
                    f"Failed to list files: {response.status_code} - {response.text}"
                )
            
            return response.json()


async def copy_runway_video_to_storage(
    video_url: str,
    job_id: str,
    user_id: str
) -> Dict[str, Any]:
    """
    High-level function to copy a Runway video to Supabase Storage
    
    Args:
        video_url: Runway video URL
        job_id: Job identifier
        user_id: User identifier
        
    Returns:
        Storage information dict
    """
    storage_service = SupabaseStorageService()
    
    # Generate file path: videos/user_123/job_456_20241019_143022.mp4
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    file_path = f"{user_id}/{job_id}_{timestamp}.mp4"
    
    return await storage_service.upload_video_from_url(
        video_url=video_url,
        file_path=file_path,
        bucket="videos"
    )


if __name__ == "__main__":
    async def test():
        # Test the storage service
        service = SupabaseStorageService()
        
        # List files
        files = await service.list_files()
        print(f"Files in storage: {len(files)}")
        
        # Generate signed URL for existing file
        if files:
            first_file = files[0]
            signed_url = await service.get_signed_url(first_file["name"])
            print(f"Signed URL: {signed_url[:60]}...")
    
    asyncio.run(test())