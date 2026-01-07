"""
SVI (Stable Video Infinity) Client
Unified client for video generation via SVI Runpod endpoint
"""
import os
import requests
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)


class SVIClient:
    """Client for SVI video generation endpoint"""
    
    def __init__(self, endpoint_url: Optional[str] = None):
        """Initialize SVI client with endpoint URL"""
        self.endpoint_url = endpoint_url or os.getenv("SVI_ENDPOINT_URL")
        if not self.endpoint_url:
            raise ValueError("SVI_ENDPOINT_URL must be set")
        
        self.endpoint_url = self.endpoint_url.rstrip("/")
        logger.info(f"SVI Client initialized with endpoint: {self.endpoint_url}")
    
    def generate_video(
        self,
        prompt: str,
        duration_sec: int = 10,
        resolution: str = "1920x1080",
        fps: int = 24,
        seed: Optional[int] = None,
        mode: str = "film"
    ) -> Dict[str, Any]:
        """
        Generate video using SVI endpoint
        
        Args:
            prompt: Text prompt for video generation
            duration_sec: Video duration in seconds (default: 10)
            resolution: Video resolution (default: 1920x1080)
            fps: Frames per second (default: 24)
            seed: Random seed for reproducibility (optional)
            mode: Generation mode - "film" or "shot" (default: film)
        
        Returns:
            Dictionary with video_url and metadata
        """
        endpoint = f"{self.endpoint_url}/generate_{mode}"
        
        payload = {
            "prompt": prompt,
            "duration": duration_sec,
            "resolution": resolution,
            "fps": fps
        }
        
        if seed is not None:
            payload["seed"] = seed
        
        logger.info(f"Generating video via SVI: prompt='{prompt[:50]}...', duration={duration_sec}s, mode={mode}")
        
        try:
            response = requests.post(
                endpoint,
                json=payload,
                timeout=900  # 15 minutes timeout
            )
            response.raise_for_status()
            
            result = response.json()
            logger.info(f"SVI video generated successfully: {result.get('video_url', 'N/A')}")
            
            return result
            
        except requests.exceptions.RequestException as e:
            logger.error(f"SVI video generation failed: {e}")
            raise
    
    def generate_from_keyword(
        self,
        keyword: str,
        duration_sec: int = 60,
        resolution: str = "1920x1080",
        fps: int = 24,
        seed: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Generate video from keyword using prompt_stream endpoint
        
        Args:
            keyword: Keyword for video generation
            duration_sec: Video duration in seconds (default: 60)
            resolution: Video resolution (default: 1920x1080)
            fps: Frames per second (default: 24)
            seed: Random seed for reproducibility (optional)
        
        Returns:
            Dictionary with video_url and metadata
        """
        endpoint = f"{self.endpoint_url}/prompt_stream"
        
        payload = {
            "keyword": keyword,
            "duration": duration_sec,
            "resolution": resolution,
            "fps": fps
        }
        
        if seed is not None:
            payload["seed"] = seed
        
        logger.info(f"Generating video from keyword via SVI: keyword='{keyword}', duration={duration_sec}s")
        
        try:
            response = requests.post(
                endpoint,
                json=payload,
                timeout=900  # 15 minutes timeout
            )
            response.raise_for_status()
            
            result = response.json()
            logger.info(f"SVI video generated from keyword successfully: {result.get('video_url', 'N/A')}")
            
            return result
            
        except requests.exceptions.RequestException as e:
            logger.error(f"SVI video generation from keyword failed: {e}")
            raise
    
    def health_check(self) -> bool:
        """
        Check if SVI endpoint is healthy
        
        Returns:
            True if endpoint is healthy, False otherwise
        """
        try:
            response = requests.get(
                f"{self.endpoint_url}/healthz",
                timeout=10
            )
            return response.status_code == 200
        except requests.exceptions.RequestException:
            return False


def generate_svi_video(
    prompt: str,
    duration_sec: int = 10,
    resolution: str = "1920x1080",
    fps: int = 24,
    seed: Optional[int] = None
) -> Dict[str, Any]:
    """
    Convenience function for generating SVI video
    
    Args:
        prompt: Text prompt for video generation
        duration_sec: Video duration in seconds (default: 10)
        resolution: Video resolution (default: 1920x1080)
        fps: Frames per second (default: 24)
        seed: Random seed for reproducibility (optional)
    
    Returns:
        Dictionary with video_url and metadata
    """
    client = SVIClient()
    return client.generate_video(
        prompt=prompt,
        duration_sec=duration_sec,
        resolution=resolution,
        fps=fps,
        seed=seed
    )
