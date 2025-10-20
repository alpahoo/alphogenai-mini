"""
Runway gen4_image_turbo service for text-to-image generation
"""
import os
import asyncio
import httpx
from typing import Dict, Any, Optional


class RunwayImageService:
    """Runway gen4_image_turbo API wrapper for image generation"""
    
    def __init__(self):
        self.api_key = os.getenv("RUNWAY_API_KEY")
        self.base_url = os.getenv("RUNWAY_API_BASE", "https://api.dev.runwayml.com/v1")
        
        if not self.api_key:
            raise ValueError("RUNWAY_API_KEY environment variable is required")
    
    async def generate_image(
        self,
        prompt: str,
        seed: Optional[int] = None,
        aspect_ratio: str = "16:9"
    ) -> Dict[str, Any]:
        """
        Generate an image using Runway gen4_image_turbo
        
        Args:
            prompt: Text description of the image
            seed: Optional seed for reproducibility (0-4294967295)
            aspect_ratio: Image aspect ratio ("16:9", "9:16", "1:1", etc.)
            
        Returns:
            Dict with image_url and metadata
        """
        print(f"[Runway Image] Generating image: {prompt[:60]}...")
        print(f"[Runway Image] Seed: {seed} | Aspect Ratio: {aspect_ratio}")
        
        async with httpx.AsyncClient(timeout=300.0) as client:
            ratio_map = {
                "16:9": "1280:720",
                "9:16": "720:1280",
                "1:1": "960:960",
                "4:3": "1104:832",
                "3:4": "832:1104"
            }
            ratio = ratio_map.get(aspect_ratio, "1280:720")
            
            payload = {
                "promptText": prompt,
                "model": "gen4_image_turbo",
                "ratio": ratio
            }
            
            if seed is not None:
                payload["seed"] = seed
            
            print(f"[Runway Image] Request payload:")
            print(f"[Runway Image]   promptText: {prompt[:100]}...")
            print(f"[Runway Image]   model: {payload['model']}")
            print(f"[Runway Image]   ratio: {payload['ratio']}")
            print(f"[Runway Image]   seed: {seed}")
            
            try:
                response = await client.post(
                    f"{self.base_url}/text_to_image",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                        "X-Runway-Version": "2024-11-06"
                    },
                    json=payload
                )
                response.raise_for_status()
            except httpx.HTTPStatusError as e:
                print(f"[Runway Image] HTTP {e.response.status_code} Error")
                print(f"[Runway Image] Response body: {e.response.text}")
                raise RuntimeError(
                    f"Runway Image API error ({e.response.status_code}): {e.response.text}"
                )
            
            task_data = response.json()
            task_id = task_data.get("id")
            
            print(f"[Runway Image] Task created: {task_id}")
            
            image_url = await self._poll_generation_status(client, task_id)
            
            result = {
                "image_url": image_url,
                "task_id": task_id,
                "prompt": prompt,
                "seed": seed,
                "model": "gen4_image_turbo",
                "aspect_ratio": aspect_ratio
            }
            
            print(f"[Runway Image] ✓ Image ready: {image_url[:60]}...")
            return result
    
    async def _poll_generation_status(
        self,
        client: httpx.AsyncClient,
        task_id: str,
        max_attempts: int = 60
    ) -> str:
        """
        Poll Runway API until image generation is complete
        
        Args:
            client: HTTP client
            task_id: Runway task ID
            max_attempts: Maximum polling attempts (default 60 = 5 minutes)
            
        Returns:
            URL of the generated image
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
            print(f"[Runway Image] Poll {attempt + 1}/{max_attempts}: {status}")
            
            if status == "COMPLETED" or status == "SUCCEEDED":
                image_url = None
                if "output" in data:
                    if isinstance(data["output"], dict):
                        image_url = data["output"].get("url")
                    elif isinstance(data["output"], list) and len(data["output"]) > 0:
                        image_url = data["output"][0] if isinstance(data["output"][0], str) else data["output"][0].get("url")
                elif "url" in data:
                    image_url = data["url"]
                
                if not image_url:
                    raise ValueError(f"No image URL in completed response: {data}")
                return image_url
            
            elif status == "FAILED":
                error = data.get("error", "Unknown error")
                raise RuntimeError(f"Runway image generation failed: {error}")
            
            elif status in ["PENDING", "PROCESSING", "RUNNING"]:
                await asyncio.sleep(5)
                continue
            
            else:
                raise ValueError(f"Unknown Runway status: {status}")
        
        raise TimeoutError(f"Runway image generation timeout after {max_attempts * 5}s")
