"""
API service wrappers for AI providers
"""
import httpx
from typing import Dict, Any, List, Optional
from tenacity import retry, stop_after_attempt, wait_exponential
from .config import get_settings


class QwenService:
    """Qwen LLM for script generation"""
    
    def __init__(self):
        self.settings = get_settings()
        self.api_key = self.settings.QWEN_API_KEY
        self.base_url = self.settings.QWEN_API_BASE
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=4, max=10)
    )
    async def generate_script(
        self,
        prompt: str,
        context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Generate video script using Qwen"""
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{self.base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "qwen-plus",
                    "messages": [
                        {
                            "role": "system",
                            "content": "You are a creative video script writer. Generate engaging, concise video scripts with scene descriptions."
                        },
                        {
                            "role": "user",
                            "content": prompt
                        }
                    ],
                    "temperature": 0.8,
                    "max_tokens": 2000,
                }
            )
            response.raise_for_status()
            data = response.json()
            
            script_text = data["choices"][0]["message"]["content"]
            
            return {
                "script": script_text,
                "scenes": self._parse_scenes(script_text),
                "metadata": {
                    "model": data.get("model"),
                    "tokens": data.get("usage", {}),
                }
            }
    
    def _parse_scenes(self, script: str) -> List[Dict[str, str]]:
        """Parse script into scenes"""
        # Simple scene parsing - splits by "Scene" markers
        scenes = []
        lines = script.split("\n")
        current_scene = {"description": "", "narration": ""}
        
        for line in lines:
            line = line.strip()
            if line.lower().startswith("scene"):
                if current_scene["description"] or current_scene["narration"]:
                    scenes.append(current_scene)
                current_scene = {"description": line, "narration": ""}
            elif line:
                current_scene["narration"] += " " + line
        
        if current_scene["description"] or current_scene["narration"]:
            scenes.append(current_scene)
        
        return scenes[:4]  # Limit to 4 scenes


class WANImageService:
    """WAN Image generation for key visuals"""
    
    def __init__(self):
        self.settings = get_settings()
        self.api_key = self.settings.WAN_IMAGE_API_KEY
        self.base_url = self.settings.WAN_IMAGE_API_BASE
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=4, max=10)
    )
    async def generate_image(
        self,
        prompt: str,
        style: str = "cinematic"
    ) -> Dict[str, Any]:
        """Generate key visual using WAN Image"""
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                f"{self.base_url}/images/generate",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "prompt": prompt,
                    "style": style,
                    "width": 1920,
                    "height": 1080,
                    "num_images": 1,
                }
            )
            response.raise_for_status()
            data = response.json()
            
            return {
                "image_url": data["images"][0]["url"],
                "image_id": data["images"][0]["id"],
                "metadata": data.get("metadata", {}),
            }


class PikaService:
    """Pika API for video clip generation"""
    
    def __init__(self):
        self.settings = get_settings()
        self.api_key = self.settings.PIKA_API_KEY
        self.base_url = self.settings.PIKA_API_BASE
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=4, max=10)
    )
    async def generate_clip(
        self,
        prompt: str,
        image_url: Optional[str] = None,
        duration: int = 5
    ) -> Dict[str, Any]:
        """Generate video clip using Pika"""
        async with httpx.AsyncClient(timeout=300.0) as client:
            payload = {
                "prompt": prompt,
                "duration": duration,
                "aspect_ratio": "16:9",
            }
            
            if image_url:
                payload["image"] = image_url
            
            response = await client.post(
                f"{self.base_url}/videos/generate",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json=payload
            )
            response.raise_for_status()
            data = response.json()
            
            # Poll for completion
            video_id = data["id"]
            video_url = await self._poll_video_status(client, video_id)
            
            return {
                "video_url": video_url,
                "video_id": video_id,
                "duration": duration,
            }
    
    async def _poll_video_status(
        self,
        client: httpx.AsyncClient,
        video_id: str,
        max_attempts: int = 60
    ) -> str:
        """Poll Pika API for video completion"""
        import asyncio
        
        for _ in range(max_attempts):
            response = await client.get(
                f"{self.base_url}/videos/{video_id}",
                headers={"Authorization": f"Bearer {self.api_key}"}
            )
            response.raise_for_status()
            data = response.json()
            
            if data["status"] == "completed":
                return data["url"]
            elif data["status"] == "failed":
                raise Exception(f"Video generation failed: {data.get('error')}")
            
            await asyncio.sleep(5)
        
        raise Exception("Video generation timeout")


class ElevenLabsService:
    """ElevenLabs for text-to-speech and SRT generation"""
    
    def __init__(self):
        self.settings = get_settings()
        self.api_key = self.settings.ELEVENLABS_API_KEY
        self.base_url = self.settings.ELEVENLABS_API_BASE
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=4, max=10)
    )
    async def generate_speech(
        self,
        text: str,
        voice_id: str = "21m00Tcm4TlvDq8ikWAM"  # Default voice
    ) -> Dict[str, Any]:
        """Generate speech and SRT captions"""
        async with httpx.AsyncClient(timeout=120.0) as client:
            # Generate audio
            response = await client.post(
                f"{self.base_url}/text-to-speech/{voice_id}",
                headers={
                    "xi-api-key": self.api_key,
                    "Content-Type": "application/json",
                },
                json={
                    "text": text,
                    "model_id": "eleven_multilingual_v2",
                    "voice_settings": {
                        "stability": 0.5,
                        "similarity_boost": 0.75,
                    }
                }
            )
            response.raise_for_status()
            
            # Save audio to temp location or return URL
            audio_bytes = response.content
            
            # Generate SRT from text (simple word timing estimation)
            srt_content = self._generate_srt(text)
            
            return {
                "audio_bytes": audio_bytes,
                "audio_url": None,  # Would upload to storage
                "srt_content": srt_content,
                "duration": len(audio_bytes) / 44100 / 2,  # Rough estimate
            }
    
    def _generate_srt(self, text: str) -> str:
        """Generate SRT captions with estimated timing"""
        words = text.split()
        words_per_second = 2.5
        srt_lines = []
        
        for i in range(0, len(words), 5):  # 5 words per subtitle
            chunk = " ".join(words[i:i+5])
            start_time = i / words_per_second
            end_time = (i + 5) / words_per_second
            
            srt_lines.append(f"{len(srt_lines) + 1}")
            srt_lines.append(
                f"{self._format_srt_time(start_time)} --> {self._format_srt_time(end_time)}"
            )
            srt_lines.append(chunk)
            srt_lines.append("")
        
        return "\n".join(srt_lines)
    
    def _format_srt_time(self, seconds: float) -> str:
        """Format seconds to SRT timestamp"""
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        secs = int(seconds % 60)
        millis = int((seconds % 1) * 1000)
        return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"


class RemotionService:
    """Remotion for final video assembly"""
    
    def __init__(self):
        self.settings = get_settings()
        self.renderer_url = self.settings.REMOTION_RENDERER_URL
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=4, max=10)
    )
    async def render_video(
        self,
        clips: List[Dict[str, Any]],
        audio_url: str,
        srt_content: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Assemble final video using Remotion"""
        async with httpx.AsyncClient(timeout=600.0) as client:
            response = await client.post(
                f"{self.renderer_url}/render",
                json={
                    "composition": "VideoComposition",
                    "inputProps": {
                        "clips": clips,
                        "audio": audio_url,
                        "subtitles": srt_content,
                        "metadata": metadata or {},
                    },
                    "codec": "h264",
                    "outputFormat": "mp4",
                }
            )
            response.raise_for_status()
            data = response.json()
            
            # Poll for render completion
            render_id = data["renderId"]
            video_url = await self._poll_render_status(client, render_id)
            
            return {
                "video_url": video_url,
                "render_id": render_id,
            }
    
    async def _poll_render_status(
        self,
        client: httpx.AsyncClient,
        render_id: str,
        max_attempts: int = 120
    ) -> str:
        """Poll Remotion renderer for completion"""
        import asyncio
        
        for _ in range(max_attempts):
            response = await client.get(
                f"{self.renderer_url}/render/{render_id}"
            )
            response.raise_for_status()
            data = response.json()
            
            if data["status"] == "completed":
                return data["url"]
            elif data["status"] == "failed":
                raise Exception(f"Render failed: {data.get('error')}")
            
            await asyncio.sleep(5)
        
        raise Exception("Render timeout")
