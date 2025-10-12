"""
Mock Qwen service for script generation (no API calls)
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
        Generate a mock script with 1 scene based on the prompt
        
        Args:
            prompt: User's video description
            
        Returns:
            Dict with script structure: title, tone, scenes
        """
        print(f"[Qwen Mock] Generating script for: {prompt[:60]}...")
        
        theme = self._extract_theme(prompt)
        tone = self._detect_tone(prompt)
        
        scene = {
            "number": 1,
            "description": self._enhance_prompt(prompt),
            "duration": 10,
            "visual_style": "cinematic, high quality, professional"
        }
        
        script = {
            "title": f"Vidéo IA: {theme}",
            "tone": tone,
            "total_duration": 10,
            "scenes": [scene]
        }
        
        print(f"[Qwen Mock] ✓ Script generated: {script['title']}")
        print(f"[Qwen Mock] Tone: {tone} | Scenes: 1 | Duration: 10s")
        
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
