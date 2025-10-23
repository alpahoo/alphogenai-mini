"""
OpenAI script generation service for Runway Gen-4 multi-clip workflow
Generates structured 6-scene scripts optimized for 60-second videos
"""
import os
import json
from typing import Dict, Any
from openai import AsyncOpenAI


class OpenAIScriptService:
    """OpenAI-powered script generation for video workflows"""
    
    def __init__(self, api_key: str = None, model: str = "gpt-4o-mini", clip_duration: int = 10):
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        if not self.api_key:
            raise ValueError("OPENAI_API_KEY is required")
        
        self.client = AsyncOpenAI(api_key=self.api_key)
        self.model = model
        self.clip_duration = clip_duration
        
        print(f"[OpenAI Script] Service initialized (model: {self.model}, clip_duration: {self.clip_duration}s)")
    
    async def generate_script(self, prompt: str) -> Dict[str, Any]:
        """
        Generate a 6-scene script for 60-second video using OpenAI
        
        Args:
            prompt: User's video description
            
        Returns:
            Dict with script structure: title, tone, scenes (6 scenes of 10s each)
        """
        print(f"[OpenAI Script] Generating 6-scene script for: {prompt[:60]}...")
        
        total_duration = self.clip_duration * 6
        system_prompt = f"""You are an expert video script writer for Runway Gen-4 video generation.

Your task is to create a 6-scene script for a {total_duration}-second video. Each scene should be {self.clip_duration} seconds long.

CRITICAL REQUIREMENTS:
- Each scene description MUST be under 150 characters (Runway API limit is 1000, but we need margin)
- Be visual and concrete, NOT abstract
- Focus on what the camera sees, not emotions or story
- Use cinematic language: camera movements, lighting, framing
- Each scene should flow naturally to the next
- Avoid repeating the user's full prompt in every scene

Output MUST be valid JSON with this exact structure:
{{
  "title": "Brief title",
  "tone": "inspiring|science|epic|dramatic|light",
  "total_duration": {total_duration},
  "aspect_ratio": "16:9",
  "scenes": [
    {{
      "scene_number": 1,
      "duration": {self.clip_duration},
      "description": "Concise visual description under 150 chars",
      "visual_style": "Style keywords",
      "camera_movement": "Camera movement",
      "lighting": "Lighting setup"
    }},
    ... 5 more scenes ...
  ]
}}

Example scene description (good): "Wide shot: futuristic robot on beach at sunset, golden light, slow zoom"
Example scene description (bad): "A futuristic robot discovers the ocean and feels amazed by the beauty of nature" (too abstract, too long)"""

        user_message = f"""Create a 6-scene video script for: "{prompt}"

Remember:
- Each scene description: under 150 characters
- Be concrete and visual
- Vary camera angles and movements
- Create narrative flow across 6 scenes
- Return only valid JSON"""

        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message}
                ],
                response_format={"type": "json_object"},
                temperature=0.7,
                max_tokens=2000
            )
            
            content = response.choices[0].message.content
            script = json.loads(content)
            
            if "scenes" not in script or len(script["scenes"]) != 6:
                raise ValueError(f"Invalid script structure: expected 6 scenes, got {len(script.get('scenes', []))}")
            
            script.setdefault("title", f"Video: {prompt[:30]}...")
            script.setdefault("tone", self._detect_tone(prompt))
            script.setdefault("total_duration", self.clip_duration * 6)
            script.setdefault("aspect_ratio", "16:9")
            
            for scene in script["scenes"]:
                scene.setdefault("duration", self.clip_duration)
            
            for i, scene in enumerate(script["scenes"]):
                desc = scene.get("description", "")
                if len(desc) > 200:
                    print(f"[OpenAI Script] ⚠️  Scene {i+1} description too long ({len(desc)} chars), truncating")
                    scene["description"] = desc[:150].rstrip()
            
            print(f"[OpenAI Script] ✓ Script generated: {script['title']}")
            print(f"[OpenAI Script] Tone: {script['tone']} | Scenes: 6 | Duration: {script['total_duration']}s")
            
            for i, scene in enumerate(script["scenes"]):
                desc_len = len(scene.get("description", ""))
                print(f"[OpenAI Script] Scene {i+1}: {desc_len} chars")
            
            return script
            
        except Exception as e:
            print(f"[OpenAI Script] ❌ Error: {str(e)}")
            raise RuntimeError(f"OpenAI script generation failed: {str(e)}")
    
    def _detect_tone(self, prompt: str) -> str:
        """Detect tone from prompt keywords (fallback)"""
        prompt_lower = prompt.lower()
        
        if any(word in prompt_lower for word in ["robot", "tech", "science", "futur"]):
            return "science"
        elif any(word in prompt_lower for word in ["epic", "héro", "bataille", "dramatique"]):
            return "epic"
        elif any(word in prompt_lower for word in ["fun", "joyeux", "léger", "amusant"]):
            return "light"
        elif any(word in prompt_lower for word in ["sombre", "mystère", "suspense"]):
            return "dramatic"
        else:
            return "inspiring"
