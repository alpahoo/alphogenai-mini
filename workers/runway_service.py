"""
Runway Gen-4 Turbo service for text-to-video generation
"""
import os
import asyncio
import httpx
from typing import Dict, Any, Optional


class RunwayService:
    """Runway Gen-4 Turbo API wrapper for video generation"""
    
    def __init__(self):
        self.api_key = os.getenv("RUNWAY_API_KEY")
        self.base_url = os.getenv("RUNWAY_API_BASE", "https://api.dev.runwayml.com/v1")
        self.model = os.getenv("RUNWAY_MODEL", "gen4_turbo")
        
        if not self.api_key:
            raise ValueError("RUNWAY_API_KEY environment variable is required")
    
    async def generate_video(
        self,
        prompt: str,
        duration: int = 10,
        aspect_ratio: str = "16:9"
    ) -> Dict[str, Any]:
        """
        Generate a video using Runway gen4_turbo (text-to-video)
        
        Args:
            prompt: Text description of the video
            duration: Video duration in seconds (gen4_turbo supports 5s or 10s)
            aspect_ratio: Video aspect ratio ("16:9" or "9:16")
            
        Returns:
            Dict with video_url and metadata
        """
        print(f"[Runway] Generating video: {prompt[:60]}...")
        print(f"[Runway] Duration: {duration}s | Aspect Ratio: {aspect_ratio}")
        
        async with httpx.AsyncClient(timeout=300.0) as client:
            ratio = "1280:720" if aspect_ratio == "16:9" else "720:1280"
            
            payload = {
                "promptText": prompt,
                "model": self.model,
                "duration": duration,
                "ratio": ratio
            }
            
            print(f"[Runway] Request payload:")
            print(f"[Runway]   promptText: {prompt[:100]}... (length: {len(prompt)})")
            print(f"[Runway]   model: {payload['model']}")
            print(f"[Runway]   duration: {payload['duration']}")
            print(f"[Runway]   ratio: {payload['ratio']}")
            
            try:
                response = await client.post(
                    f"{self.base_url}/text_to_video",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                        "X-Runway-Version": "2024-11-06"
                    },
                    json=payload
                )
                response.raise_for_status()
            except httpx.HTTPStatusError as e:
                print(f"[Runway] HTTP {e.response.status_code} Error")
                print(f"[Runway] Response body: {e.response.text}")
                print(f"[Runway] Request URL: {e.request.url}")
                raise RuntimeError(
                    f"Runway API error ({e.response.status_code}): {e.response.text}"
                )
            
            task_data = response.json()
            task_id = task_data.get("id")
            
            print(f"[Runway] Task created: {task_id}")
            
            video_url = await self._poll_generation_status(client, task_id)
            
            result = {
                "video_url": video_url,
                "task_id": task_id,
                "duration": duration,
                "prompt": prompt,
                "model": self.model
            }
            
            print(f"[Runway] ✓ Video ready: {video_url[:60]}...")
            return result
    
    async def _poll_generation_status(
        self,
        client: httpx.AsyncClient,
        task_id: str,
        max_attempts: int = 60
    ) -> str:
        """
        Poll Runway API until video generation is complete
        
        Args:
            client: HTTP client
            task_id: Runway task ID
            max_attempts: Maximum polling attempts (default 60 = 5 minutes)
            
        Returns:
            URL of the generated video
        """
        for attempt in range(max_attempts):
            response = await client.get(
                f"{self.base_url}/tasks/{task_id}",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "X-Runway-Version": "2024-11-06"
                }
            )
            response.raise_for_status()
            data = response.json()
            
            status = data.get("status", "").upper()
            print(f"[Runway] Poll {attempt + 1}/{max_attempts}: {status}")
            
            if status == "COMPLETED" or status == "SUCCEEDED":
                video_url = None
                if "output" in data:
                    if isinstance(data["output"], dict):
                        video_url = data["output"].get("url")
                    elif isinstance(data["output"], list) and len(data["output"]) > 0:
                        video_url = data["output"][0] if isinstance(data["output"][0], str) else data["output"][0].get("url")
                elif "url" in data:
                    video_url = data["url"]
                
                if not video_url:
                    raise ValueError(f"No video URL in completed response: {data}")
                return video_url
            
            elif status == "FAILED":
                error = data.get("error", "Unknown error")
                raise RuntimeError(f"Runway generation failed: {error}")
            
            elif status in ["PENDING", "PROCESSING", "RUNNING"]:
                await asyncio.sleep(5)
                continue
            
            else:
                raise ValueError(f"Unknown Runway status: {status}")
        
        raise TimeoutError(f"Runway generation timeout after {max_attempts * 5}s")
    
    async def add_music_to_video(
        self,
        video_url: str,
        music_url: str
    ) -> Dict[str, Any]:
        """
        Add background music to a video (if Runway supports it)
        Otherwise, return original video_url
        
        Args:
            video_url: URL of the video
            music_url: URL of the music track
            
        Returns:
            Dict with final_video_url
        """
        print(f"[Runway] Music overlay not yet implemented")
        print(f"[Runway] Video: {video_url[:60]}...")
        print(f"[Runway] Music: {music_url[:60]}...")
        
        return {
            "final_video_url": video_url,
            "music_url": music_url,
            "note": "Music overlay pending implementation"
        }
