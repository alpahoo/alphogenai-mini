"""
Runway API Client - COMPLETELY NEW FILE
Forces Render to use the correct implementation
"""
import os
import asyncio
import httpx
from typing import Dict, Any, Optional


class RunwayService:
    """NEW Runway service with correct endpoint and NO model"""
    
    def __init__(self):
        self.api_key = os.getenv("RUNWAY_API_KEY")
        
        # FORCE CORRECT URL
        base_url = os.getenv("RUNWAY_API_URL", "https://api.dev.runwayml.com/v1").rstrip("/")
        self.endpoint = f"{base_url}/tasks"
        
        print(f"[NEW RUNWAY] Initialized with endpoint: {self.endpoint}")
        print(f"[NEW RUNWAY] NO MODEL - Using Runway default")
        
        if not self.api_key:
            raise ValueError("RUNWAY_API_KEY required")
    
    async def generate_video(
        self,
        prompt: str,
        duration: int = 5,
        aspect_ratio: str = "16:9",
        image_url: Optional[str] = None,
        generation_mode: str = "t2v"
    ) -> Dict[str, Any]:
        """Generate video with NO MODEL SPECIFIED"""
        
        print(f"[NEW RUNWAY] Starting {generation_mode} generation")
        print(f"[NEW RUNWAY] Prompt: {prompt[:50]}...")
        
        async with httpx.AsyncClient(timeout=300.0) as client:
            ratio = "1280:720" if aspect_ratio == "16:9" else "720:1280"
            
            # CORRECT payload structure - NO MODEL
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
            
            print(f"[NEW RUNWAY] === CORRECT CALL ===")
            print(f"[NEW RUNWAY] URL: {self.endpoint}")
            print(f"[NEW RUNWAY] Type: {payload['type']}")
            print(f"[NEW RUNWAY] NO MODEL FIELD")
            print(f"[NEW RUNWAY] ====================")
            
            try:
                response = await client.post(
                    self.endpoint,  # CORRECT: /v1/tasks
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                        "X-Runway-Version": "2024-11-06"
                    },
                    json=payload,
                    timeout=60.0
                )
                
                print(f"[NEW RUNWAY] Response: {response.status_code}")
                response.raise_for_status()
                
            except httpx.HTTPStatusError as e:
                print(f"[NEW RUNWAY] ERROR {e.response.status_code}")
                print(f"[NEW RUNWAY] Response: {e.response.text}")
                print(f"[NEW RUNWAY] URL used: {e.request.url}")
                raise RuntimeError(f"API error: {e.response.text}")
            
            data = response.json()
            task_id = data.get("id")
            
            if not task_id:
                raise ValueError(f"No task ID: {data}")
            
            print(f"[NEW RUNWAY] ✓ Task created: {task_id}")
            
            # Poll for result
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
        """Poll task status"""
        base_url = self.endpoint.replace('/tasks', '')
        status_url = f"{base_url}/tasks/{task_id}"
        
        for i in range(60):  # 5 minutes
            if i > 0:
                await asyncio.sleep(5)
            
            try:
                resp = await client.get(status_url, headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "X-Runway-Version": "2024-11-06"
                })
                resp.raise_for_status()
                
                data = resp.json()
                status = data.get("status", "").upper()
                
                print(f"[NEW RUNWAY] Poll {i+1}: {status}")
                
                if status in ["COMPLETED", "SUCCEEDED"]:
                    # Extract video URL
                    video_url = None
                    if "output" in data:
                        output = data["output"]
                        if isinstance(output, dict):
                            video_url = output.get("url")
                        elif isinstance(output, list) and output:
                            video_url = output[0] if isinstance(output[0], str) else output[0].get("url")
                    
                    if video_url:
                        return video_url
                    raise ValueError(f"No video URL: {data}")
                
                elif status == "FAILED":
                    raise RuntimeError(f"Task failed: {data.get('error')}")
                    
            except httpx.HTTPStatusError:
                if i < 3:
                    continue
                raise
        
        raise TimeoutError("Task timeout")
    
    async def add_music_to_video(self, video_url: str, music_url: str) -> Dict[str, Any]:
        return {"final_video_url": video_url, "music_url": music_url}