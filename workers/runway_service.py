"""
Runway gen4_turbo service for image-to-video generation
"""
import os
import asyncio
import httpx
from typing import Dict, Any, Optional


class RunwayService:
    """Runway gen4_turbo API wrapper for image-to-video generation"""
    
    def __init__(self):
        self.api_key = os.getenv("RUNWAY_API_KEY")
        self.base_url = os.getenv("RUNWAY_API_BASE", "https://api.dev.runwayml.com/v1")
        self.model = "gen4_turbo"
        
        if not self.api_key:
            raise ValueError("RUNWAY_API_KEY environment variable is required")
    
    async def generate_video(
        self,
        image_url: str,
        prompt: Optional[str] = None,
        duration: int = 10,
        seed: Optional[int] = None,
        aspect_ratio: str = "16:9"
    ) -> Dict[str, Any]:
        """
        Generate a video from an image using Runway gen4_turbo (I2V)
        
        Args:
            image_url: URL of the source image
            prompt: Optional text prompt to guide the animation
            duration: Video duration in seconds (2-10)
            seed: Optional seed for reproducibility (0-4294967295)
            aspect_ratio: Video aspect ratio ("16:9" or "9:16")
            
        Returns:
            Dict with video_url and metadata
        """
        print(f"[Runway Video] Generating video from image...")
        print(f"[Runway Video] Image: {image_url[:60]}...")
        if prompt:
            print(f"[Runway Video] Prompt: {prompt[:60]}...")
        print(f"[Runway Video] Duration: {duration}s | Seed: {seed}")
        
        async with httpx.AsyncClient(timeout=300.0) as client:
            ratio_map = {
                "16:9": "1280:720",
                "9:16": "720:1280",
                "1:1": "960:960"
            }
            ratio = ratio_map.get(aspect_ratio, "1280:720")
            
            payload = {
                "promptImage": image_url,
                "model": self.model,
                "duration": duration,
                "ratio": ratio
            }
            
            if prompt:
                payload["promptText"] = prompt
            
            if seed is not None:
                payload["seed"] = seed
            
            print(f"[Runway Video] Request payload:")
            print(f"[Runway Video]   promptImage: {image_url[:60]}...")
            print(f"[Runway Video]   model: {payload['model']}")
            print(f"[Runway Video]   duration: {payload['duration']}")
            print(f"[Runway Video]   ratio: {payload['ratio']}")
            if prompt:
                print(f"[Runway Video]   promptText: {prompt[:60]}...")
            if seed is not None:
                print(f"[Runway Video]   seed: {seed}")
            
            try:
                response = await client.post(
                    f"{self.base_url}/image_to_video",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                        "X-Runway-Version": "2024-11-06"
                    },
                    json=payload
                )
                response.raise_for_status()
            except httpx.HTTPStatusError as e:
                print(f"[Runway Video] HTTP {e.response.status_code} Error")
                print(f"[Runway Video] Response body: {e.response.text}")
                raise RuntimeError(
                    f"Runway Video API error ({e.response.status_code}): {e.response.text}"
                )
            
            task_data = response.json()
            task_id = task_data.get("id")
            
            print(f"[Runway Video] Task created: {task_id}")
            
            video_url = await self._poll_generation_status(client, task_id)
            
            result = {
                "video_url": video_url,
                "task_id": task_id,
                "duration": duration,
                "prompt": prompt,
                "seed": seed,
                "model": self.model,
                "image_url": image_url
            }
            
            print(f"[Runway Video] ✓ Video ready: {video_url[:60]}...")
            return result
    
    async def _poll_generation_status(
        self,
        client: httpx.AsyncClient,
        task_id: str,
        max_attempts: int = 120
    ) -> str:
        """
        Poll Runway API until video generation is complete
        
        Args:
            client: HTTP client
            task_id: Runway task ID
            max_attempts: Maximum polling attempts (default 120 = 10 minutes)
            
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
            print(f"[Runway Video] Poll {attempt + 1}/{max_attempts}: {status}")
            
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
                raise RuntimeError(f"Runway video generation failed: {error}")
            
            elif status in ["PENDING", "PROCESSING", "RUNNING"]:
                await asyncio.sleep(5)
                continue
            
            else:
                raise ValueError(f"Unknown Runway status: {status}")
        
        raise TimeoutError(f"Runway video generation timeout after {max_attempts * 5}s")
