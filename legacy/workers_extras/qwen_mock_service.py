"""
Mock Qwen service for script generation (no API calls)
Generates 6 coherent scenes for 60-second videos
"""
import random
from typing import Dict, Any, List


class QwenMockService:
    """Mock Qwen LLM for script generation - returns fake structured scripts"""
    
    def __init__(self):
        self.mock_enabled = True
        print("[Qwen Mock] Service initialized (mock mode)")
    
    async def generate_script(self, prompt: str) -> Dict[str, Any]:
        """
        Generate a 6-scene script for 60-second video
        
        Args:
            prompt: User's video description
            
        Returns:
            Dict with script structure: title, tone, scenes (6 scenes of 10s each)
        """
        print(f"[Qwen Mock] Generating 6-scene script for: {prompt[:60]}...")
        
        theme = self._extract_theme(prompt)
        tone = self._detect_tone(prompt)
        
        scenes = [
            {
                "scene_number": 1,
                "duration": 10,
                "description": f"Opening shot: {prompt}. Wide establishing shot with cinematic lighting.",
                "visual_style": "cinematic, professional",
                "camera_movement": "slow zoom in",
                "lighting": "natural, warm"
            },
            {
                "scene_number": 2,
                "duration": 10,
                "description": f"Close-up details: {prompt}. Focus on key elements and textures.",
                "visual_style": "detailed, immersive",
                "camera_movement": "slow pan",
                "lighting": "focused, dramatic"
            },
            {
                "scene_number": 3,
                "duration": 10,
                "description": f"Action sequence: {prompt}. Dynamic movement and energy.",
                "visual_style": "dynamic, energetic",
                "camera_movement": "tracking shot",
                "lighting": "vibrant, high contrast"
            },
            {
                "scene_number": 4,
                "duration": 10,
                "description": f"Peak moment: {prompt}. The climax of the narrative.",
                "visual_style": "powerful, dramatic",
                "camera_movement": "slow motion",
                "lighting": "dramatic, focused"
            },
            {
                "scene_number": 5,
                "duration": 10,
                "description": f"Transition: {prompt}. Begin to resolve the story.",
                "visual_style": "smooth, flowing",
                "camera_movement": "gentle pan out",
                "lighting": "soft, balanced"
            },
            {
                "scene_number": 6,
                "duration": 10,
                "description": f"Closing shot: {prompt}. Memorable final image.",
                "visual_style": "memorable, impactful",
                "camera_movement": "static wide shot",
                "lighting": "warm, inviting"
            }
        ]
        
        script = {
            "title": f"Vidéo IA: {theme}",
            "tone": tone,
            "total_duration": 60,
            "aspect_ratio": "16:9",
            "scenes": scenes
        }
        
        print(f"[Qwen Mock] ✓ Script generated: {script['title']}")
        print(f"[Qwen Mock] Tone: {tone} | Scenes: 6 | Duration: 60s")
        
        return script
    
    def _extract_theme(self, prompt: str) -> str:
        """Extract main theme from prompt"""
        words = prompt.split()[:5]
        return " ".join(words) + "..."
    
    def _detect_tone(self, prompt: str) -> str:
        """Detect tone from prompt keywords"""
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
    
    def _enhance_prompt(self, prompt: str) -> str:
        """Add cinematic enhancements to the prompt"""
        enhancements = [
            "cinematic lighting, high quality, 4K",
            "professional cinematography, detailed",
            "movie-quality visuals, sharp focus"
        ]
        enhancement = random.choice(enhancements)
        return f"{prompt}, {enhancement}"
