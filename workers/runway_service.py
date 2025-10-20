"""
Runway API service - Version 2 with correct endpoint and model
COMPLETELY REWRITTEN to fix persistent URL and model issues
"""
import os
import asyncio
import httpx
from typing import Dict, Any, Optional


class RunwayService:
    """Runway API wrapper - V2 with correct structure"""
    
    def __init__(self):
        self.api_key = os.getenv("RUNWAY_API_KEY")
        
        # Build correct URL - NEVER concatenate endpoints
        base_url = os.getenv("RUNWAY_API_URL", "https://api.dev.runwayml.com/v1").rstrip("/")
        self.tasks_url = f"{base_url}/tasks"
        
        # Try simpler model name or no model at all
        self.model = os.getenv("RUNWAY_MODEL", "gen3")  # Simpler name
        
        print(f"[Runway V2] Initialized:")
        print(f"[Runway V2]   Tasks URL: {self.tasks_url}")
        print(f"[Runway V2]   Model: {self.model}")
        print(f"[Runway V2]   API Key: {'SET' if self.api_key else 'NOT SET'}")
        
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
        """Generate video with correct Runway API structure"""
        
        print(f"[Runway V2] Generating {generation_mode.upper()}: {prompt[:60]}...")
        print(f"[Runway V2] Duration: {duration}s | Ratio: {aspect_ratio}")
        
        async with httpx.AsyncClient(timeout=300.0) as client:
            ratio = "1280:720" if aspect_ratio == "16:9" else "720:1280"
            
            # Build correct payload structure
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
            
            # Only add model if it's set and not empty
            if self.model and self.model.strip():
                payload["model"] = self.model
            
            print(f"[Runway V2] === CORRECT API CALL ===")
            print(f"[Runway V2] URL: {self.tasks_url}")
            print(f"[Runway V2] Type: {payload['type']}")
            print(f"[Runway V2] Model: {payload.get('model', 'DEFAULT')}")
            print(f"[Runway V2] Prompt: {payload['input']['promptText'][:50]}...")
            print(f"[Runway V2] ========================")
            
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
                "X-Runway-Version": "2024-11-06"
            }
            
            try:
                # Make the correct API call
                response = await client.post(
                    self.tasks_url,  # Correct URL: /v1/tasks
                    headers=headers,
                    json=payload,
                    timeout=60.0
                )
                
                print(f"[Runway V2] Response status: {response.status_code}")
                
                if response.status_code == 403:
                    error_data = response.json()
                    if "Model variant" in error_data.get("error", ""):
                        print(f"[Runway V2] Model '{self.model}' not available, trying without model...")
                        
                        # Retry without model specification
                        payload_no_model = payload.copy()
                        if "model" in payload_no_model:
                            del payload_no_model["model"]
                        
                        response = await client.post(
                            self.tasks_url,
                            headers=headers,
                            json=payload_no_model,
                            timeout=60.0
                        )
                        print(f"[Runway V2] Retry without model: {response.status_code}")
                
                response.raise_for_status()
                
            except httpx.HTTPStatusError as e:
                error_text = e.response.text
                print(f"[Runway V2] HTTP {e.response.status_code} Error")
                print(f"[Runway V2] Response: {error_text}")
                print(f"[Runway V2] URL used: {e.request.url}")
                
                raise RuntimeError(f"Runway API error ({e.response.status_code}): {error_text}")
            
            task_data = response.json()
            task_id = task_data.get("id")
            
            if not task_id:
                raise ValueError(f"No task ID in response: {task_data}")
            
            print(f"[Runway V2] ✓ Task created: {task_id}")
            
            # Poll for completion
            video_url = await self._poll_task_status(client, task_id)
            
            result = {
                "video_url": video_url,
                "task_id": task_id,
                "duration": duration,
                "prompt": prompt,
                "model": self.model,
                "generation_mode": generation_mode,
                "image_url": image_url if generation_mode == "i2v" else None
            }
            
            print(f"[Runway V2] ✓ Video ready: {video_url[:60]}...")
            return result
    
    async def _poll_task_status(
        self,
        client: httpx.AsyncClient,
        task_id: str,
        max_attempts: int = 60
    ) -> str:
        """Poll task status until completion"""
        
        base_url = self.tasks_url.replace('/tasks', '')
        status_url = f"{base_url}/tasks/{task_id}"
        
        for attempt in range(max_attempts):
            await asyncio.sleep(5 if attempt > 0 else 1)
            
            try:
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
                
                print(f"[Runway V2] Poll {attempt + 1}/{max_attempts}: {status}")
                
                if status in ["COMPLETED", "SUCCEEDED"]:
                    # Extract video URL
                    video_url = None
                    if "output" in data:
                        if isinstance(data["output"], dict):
                            video_url = data["output"].get("url")
                        elif isinstance(data["output"], list) and data["output"]:
                            first_output = data["output"][0]
                            video_url = first_output if isinstance(first_output, str) else first_output.get("url")
                    
                    if not video_url and "url" in data:
                        video_url = data["url"]
                    
                    if video_url:
                        return video_url
                    else:
                        raise ValueError(f"No video URL found in response: {data}")
                
                elif status == "FAILED":
                    error = data.get("error", "Unknown error")
                    raise RuntimeError(f"Runway task failed: {error}")
                
                elif status not in ["PENDING", "PROCESSING", "RUNNING"]:
                    raise ValueError(f"Unknown status: {status}")
                    
            except httpx.HTTPStatusError as e:
                print(f"[Runway V2] Status check error: {e.response.status_code}")
                if attempt < 3:  # Retry first few attempts
                    continue
                raise
        
        raise TimeoutError(f"Task timeout after {max_attempts * 5}s")
    
    async def add_music_to_video(self, video_url: str, music_url: str) -> Dict[str, Any]:
        """Music overlay placeholder"""
        return {
            "final_video_url": video_url,
            "music_url": music_url,
            "note": "Music overlay not implemented"
        }