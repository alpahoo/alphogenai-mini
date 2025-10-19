"""
Runway Gen-4 Turbo service for text-to-video generation
FIXED VERSION - Uses correct API endpoint without concatenation
"""
import os
import asyncio
import httpx
from typing import Dict, Any, Optional


class RunwayService:
    """Runway Gen-4 Turbo API wrapper for video generation - FIXED VERSION"""
    
    def __init__(self):
        self.api_key = os.getenv("RUNWAY_API_KEY")
        # Base URL without /tasks - we'll add it in the code
        base_url = os.getenv("RUNWAY_API_URL", "https://api.dev.runwayml.com/v1").rstrip("/")
        self.api_url = f"{base_url}/tasks"
        self.model = os.getenv("RUNWAY_MODEL", "gen4_turbo")
        
        print(f"[Runway] FIXED VERSION Initialized with:")
        print(f"[Runway]   API URL: {self.api_url}")
        print(f"[Runway]   Model: {self.model}")
        print(f"[Runway]   API Key: {'***' + self.api_key[-4:] if self.api_key else 'NOT SET'}")
        
        if not self.api_key:
            raise ValueError("RUNWAY_API_KEY environment variable is required")
    
    async def generate_video(
        self,
        prompt: str,
        duration: int = 10,
        aspect_ratio: str = "16:9",
        image_url: Optional[str] = None,
        generation_mode: str = "t2v"
    ) -> Dict[str, Any]:
        """
        Generate a video using Runway gen4_turbo (text-to-video or image-to-video)
        FIXED VERSION - Uses direct API endpoint
        """
        print(f"[Runway] FIXED - Generating video ({generation_mode}): {prompt[:60]}...")
        print(f"[Runway] Duration: {duration}s | Aspect Ratio: {aspect_ratio}")
        if image_url:
            print(f"[Runway] Reference image: {image_url[:60]}...")
        
        async with httpx.AsyncClient(timeout=300.0) as client:
            ratio = "1280:720" if aspect_ratio == "16:9" else "720:1280"
            
            # Correct Runway API payload structure
            if generation_mode == "i2v" and image_url:
                # Image-to-Video payload
                payload = {
                    "type": "image_to_video",
                    "model": self.model,
                    "input": {
                        "image": {"url": image_url},
                        "promptText": prompt,
                        "duration": duration,
                        "ratio": ratio
                    }
                }
            else:
                # Text-to-Video payload
                payload = {
                    "type": "text_to_video", 
                    "model": self.model,
                    "input": {
                        "promptText": prompt,
                        "duration": duration,
                        "ratio": ratio
                    }
                }
            
            print(f"[Runway] FIXED - Request payload:")
            print(f"[Runway]   type: {payload['type']}")
            print(f"[Runway]   model: {payload['model']}")
            print(f"[Runway]   input.promptText: {payload['input']['promptText'][:100]}... (length: {len(prompt)})")
            print(f"[Runway]   input.duration: {payload['input']['duration']}")
            print(f"[Runway]   input.ratio: {payload['input']['ratio']}")
            if "image" in payload['input']:
                print(f"[Runway]   input.image.url: {payload['input']['image']['url'][:60]}...")
            
            # FIXED: Use correct Runway API endpoint
            print(f"[Runway] ===== CORRECT API CALL =====")
            print(f"[Runway] URL: {self.api_url}")
            print(f"[Runway] Type: {payload['type']}")
            print(f"[Runway] ===============================")
            
            try:
                response = await client.post(
                    self.api_url,
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
                "model": self.model,
                "generation_mode": generation_mode,
                "image_url": image_url if generation_mode == "i2v" else None
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
        FIXED VERSION - Uses correct status endpoint
        """
        for attempt in range(max_attempts):
            # FIXED: Build status URL correctly
            base_url = self.api_url.replace('/tasks', '')
            status_url = f"{base_url}/tasks/{task_id}"
            
            response = await client.get(
                status_url,
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
        """
        print(f"[Runway] Music overlay not yet implemented")
        print(f"[Runway] Video: {video_url[:60]}...")
        print(f"[Runway] Music: {music_url[:60]}...")
        
        return {
            "final_video_url": video_url,
            "music_url": music_url,
            "note": "Music overlay pending implementation"
        }