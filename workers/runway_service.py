"""
Runway API service - MINIMAL VERSION
NO MODEL SPECIFIED - Uses Runway default
CORRECT ENDPOINT - /v1/tasks only
"""
import os
import asyncio
import httpx
from typing import Dict, Any, Optional


class RunwayService:
    """Minimal Runway service - No model, correct endpoint"""
    
    def __init__(self):
        self.api_key = os.getenv("RUNWAY_API_KEY")
        
        # CORRECT URL CONSTRUCTION
        base_url = os.getenv("RUNWAY_API_URL", "https://api.dev.runwayml.com/v1").rstrip("/")
        self.tasks_url = f"{base_url}/tasks"
        
        print(f"[Runway MINIMAL] Initialized:")
        print(f"[Runway MINIMAL]   URL: {self.tasks_url}")
        print(f"[Runway MINIMAL]   No model specified - using Runway default")
        print(f"[Runway MINIMAL]   API Key: {'SET' if self.api_key else 'NOT SET'}")
        
        if not self.api_key:
            raise ValueError("RUNWAY_API_KEY environment variable is required")
    
    async def generate_video(
        self,
        prompt: str,
        duration: int = 5,
        aspect_ratio: str = "16:9",
        image_url: Optional[str] = None,
        generation_mode: str = "t2v"
    ) -> Dict[str, Any]:
        """Generate video with MINIMAL payload - no model specified"""
        
        print(f"[Runway MINIMAL] Generating {generation_mode}: {prompt[:50]}...")
        
        async with httpx.AsyncClient(timeout=300.0) as client:
            ratio = "1280:720" if aspect_ratio == "16:9" else "720:1280"
            
            # MINIMAL PAYLOAD - NO MODEL
            if generation_mode == "i2v" and image_url:
                payload = {
                    "type": "image_to_video",
                    "input": {
                        "image": {"url": image_url},
                        "promptText": prompt,
                        "duration": duration,
                        "ratio": ratio
                    }
                }
            else:
                payload = {
                    "type": "text_to_video",
                    "input": {
                        "promptText": prompt,
                        "duration": duration,
                        "ratio": ratio
                    }
                }
            
            print(f"[Runway MINIMAL] === MINIMAL API CALL ===")
            print(f"[Runway MINIMAL] URL: {self.tasks_url}")
            print(f"[Runway MINIMAL] Type: {payload['type']}")
            print(f"[Runway MINIMAL] NO MODEL - Using default")
            print(f"[Runway MINIMAL] Duration: {duration}s")
            print(f"[Runway MINIMAL] ========================")
            
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
                "X-Runway-Version": "2024-11-06"
            }
            
            try:
                response = await client.post(
                    self.tasks_url,  # CORRECT: /v1/tasks
                    headers=headers,
                    json=payload,
                    timeout=60.0
                )
                
                print(f"[Runway MINIMAL] Response: {response.status_code}")
                
                if response.status_code != 200:
                    error_text = response.text
                    print(f"[Runway MINIMAL] Error response: {error_text}")
                
                response.raise_for_status()
                
            except httpx.HTTPStatusError as e:
                error_text = e.response.text
                print(f"[Runway MINIMAL] HTTP {e.response.status_code} Error")
                print(f"[Runway MINIMAL] Response: {error_text}")
                print(f"[Runway MINIMAL] URL used: {e.request.url}")
                
                raise RuntimeError(f"Runway API error ({e.response.status_code}): {error_text}")
            
            task_data = response.json()
            task_id = task_data.get("id")
            
            if not task_id:
                raise ValueError(f"No task ID in response: {task_data}")
            
            print(f"[Runway MINIMAL] ✓ Task created: {task_id}")
            
            # Simple polling
            video_url = await self._poll_task(client, task_id)
            
            return {
                "video_url": video_url,
                "task_id": task_id,
                "duration": duration,
                "prompt": prompt,
                "model": "default",
                "generation_mode": generation_mode
            }
    
    async def _poll_task(self, client: httpx.AsyncClient, task_id: str) -> str:
        """Simple task polling"""
        base_url = self.tasks_url.replace('/tasks', '')
        status_url = f"{base_url}/tasks/{task_id}"
        
        for attempt in range(60):  # 5 minutes max
            if attempt > 0:
                await asyncio.sleep(5)
            
            try:
                response = await client.get(status_url, headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "X-Runway-Version": "2024-11-06"
                })
                response.raise_for_status()
                
                data = response.json()
                status = data.get("status", "").upper()
                
                print(f"[Runway MINIMAL] Status {attempt + 1}: {status}")
                
                if status in ["COMPLETED", "SUCCEEDED"]:
                    # Find video URL
                    video_url = None
                    if "output" in data:
                        output = data["output"]
                        if isinstance(output, dict):
                            video_url = output.get("url")
                        elif isinstance(output, list) and output:
                            video_url = output[0] if isinstance(output[0], str) else output[0].get("url")
                    
                    if not video_url and "url" in data:
                        video_url = data["url"]
                    
                    if video_url:
                        return video_url
                    else:
                        raise ValueError(f"No video URL in response: {data}")
                
                elif status == "FAILED":
                    error = data.get("error", "Unknown error")
                    raise RuntimeError(f"Task failed: {error}")
                
            except httpx.HTTPStatusError:
                if attempt < 3:
                    continue
                raise
        
        raise TimeoutError("Task timeout")
    
    async def add_music_to_video(self, video_url: str, music_url: str) -> Dict[str, Any]:
        return {"final_video_url": video_url, "music_url": music_url}