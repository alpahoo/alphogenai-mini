#!/usr/bin/env python3
"""
Audio Ambience Orchestrator

Integrates audio generation into the video generation pipeline.
This orchestrator is called by the main worker after video generation completes.

Author: AlphoGenAI Team
"""

import os
import logging
import asyncio
import httpx
from typing import Dict, Any, Optional, List
from datetime import datetime

logger = logging.getLogger(__name__)


class AudioOrchestrator:
    """
    Orchestrates audio generation and mixing for video jobs.
    
    Workflow:
    1. Check if audio is enabled (AUDIO_MODE=auto)
    2. Try Diff-Foley (video-conditioned) if enabled
    3. Fallback to AudioLDM2 (text-to-audio)
    4. Use CLAP to select best audio
    5. Mix audio with video
    6. Upload final video
    """
    
    def __init__(self):
        """Initialize audio orchestrator."""
        self.audio_backend_url = os.getenv("AUDIO_BACKEND_URL")
        self.audio_mode = os.getenv("AUDIO_MODE", "auto")
        self.audio_priority = os.getenv("AUDIO_PRIORITY", "audioldm2")
        self.audio_difffoley = os.getenv("AUDIO_DIFFFOLEY", "false").lower() == "true"
        self.clap_enable = os.getenv("CLAP_ENABLE", "true").lower() == "true"
        
        if not self.audio_backend_url:
            logger.warning("AUDIO_BACKEND_URL not set - audio generation disabled")
            self.audio_mode = "off"
    
    async def process_audio(
        self,
        job_id: str,
        video_url: str,
        prompt: str,
        duration: float = 60.0
    ) -> Dict[str, Any]:
        """
        Process audio for a video job.
        
        Args:
            job_id: Job ID
            video_url: URL of the generated video
            prompt: Original text prompt
            duration: Video duration in seconds
            
        Returns:
            Dictionary with audio_url, audio_score, output_url_final
        """
        try:
            if self.audio_mode == "off":
                logger.info(f"Audio generation disabled for job {job_id}")
                return {
                    "audio_url": None,
                    "audio_score": None,
                    "output_url_final": video_url
                }
            
            logger.info(f"Starting audio generation for job {job_id}")
            
            candidates = await self._generate_audio_candidates(
                video_url, prompt, duration
            )
            
            if not candidates:
                logger.warning(f"No audio candidates generated for job {job_id}")
                return {
                    "audio_url": None,
                    "audio_score": None,
                    "output_url_final": video_url
                }
            
            best_audio = await self._select_best_audio(prompt, candidates)
            
            
            logger.info(f"Audio generation completed for job {job_id}: {best_audio['url']}")
            
            return {
                "audio_url": best_audio["url"],
                "audio_score": best_audio["score"],
                "output_url_final": video_url  # Will be updated after mixing
            }
            
        except Exception as e:
            logger.error(f"Audio processing failed for job {job_id}: {e}")
            return {
                "audio_url": None,
                "audio_score": None,
                "output_url_final": video_url,
                "error": str(e)
            }
    
    async def _generate_audio_candidates(
        self,
        video_url: str,
        prompt: str,
        duration: float
    ) -> List[Dict[str, Any]]:
        """
        Generate audio candidates using available methods.
        
        Returns:
            List of candidates with url, source, metadata
        """
        candidates = []
        
        async with httpx.AsyncClient(timeout=120.0) as client:
            if self.audio_difffoley and self.audio_priority == "difffoley":
                try:
                    logger.info("Generating audio with Diff-Foley...")
                    response = await client.post(
                        f"{self.audio_backend_url}/audio/difffoley",
                        json={
                            "video_url": video_url,
                            "duration": duration,
                            "target_lufs": -16.0,
                            "normalize": True
                        }
                    )
                    
                    if response.status_code == 200:
                        result = response.json()
                        candidates.append({
                            "url": result["audio_url"],
                            "source": "difffoley",
                            "metadata": {
                                "duration": result.get("duration"),
                                "sample_rate": result.get("sample_rate"),
                                "generation_time": result.get("generation_time")
                            }
                        })
                        logger.info("✓ Diff-Foley audio generated")
                    else:
                        logger.warning(f"Diff-Foley failed: {response.status_code}")
                        
                except Exception as e:
                    logger.error(f"Diff-Foley generation error: {e}")
            
            try:
                logger.info("Generating audio with AudioLDM2...")
                response = await client.post(
                    f"{self.audio_backend_url}/audio/audioldm2",
                    json={
                        "prompt": prompt,
                        "duration": duration,
                        "guidance_scale": 3.5,
                        "num_inference_steps": 50
                    }
                )
                
                if response.status_code == 200:
                    result = response.json()
                    candidates.append({
                        "url": result["audio_url"],
                        "source": "audioldm2",
                        "metadata": {
                            "duration": result.get("duration"),
                            "sample_rate": result.get("sample_rate"),
                            "tags": result.get("tags", []),
                            "generation_time": result.get("generation_time")
                        }
                    })
                    logger.info("✓ AudioLDM2 audio generated")
                else:
                    logger.error(f"AudioLDM2 failed: {response.status_code}")
                    
            except Exception as e:
                logger.error(f"AudioLDM2 generation error: {e}")
        
        return candidates
    
    async def _select_best_audio(
        self,
        prompt: str,
        candidates: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Select best audio using CLAP scoring.
        
        Returns:
            Best candidate with url, source, score
        """
        if len(candidates) == 1:
            return {
                "url": candidates[0]["url"],
                "source": candidates[0]["source"],
                "score": 1.0,
                "metadata": candidates[0]["metadata"]
            }
        
        if not self.clap_enable:
            logger.info("CLAP disabled, using first candidate")
            return {
                "url": candidates[0]["url"],
                "source": candidates[0]["source"],
                "score": 1.0,
                "metadata": candidates[0]["metadata"]
            }
        
        try:
            logger.info(f"Scoring {len(candidates)} candidates with CLAP...")
            
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    f"{self.audio_backend_url}/audio/clap/select",
                    json={
                        "prompt": prompt,
                        "candidates": candidates
                    }
                )
                
                if response.status_code == 200:
                    result = response.json()
                    
                    best_source = result["best_source"]
                    best_candidate = next(
                        c for c in candidates if c["source"] == best_source
                    )
                    
                    logger.info(f"✓ Best audio: {best_source} (score: {result['scores'][best_source]:.3f})")
                    
                    return {
                        "url": result["best_url"],
                        "source": best_source,
                        "score": result["scores"][best_source],
                        "metadata": best_candidate["metadata"],
                        "all_scores": result["scores"]
                    }
                else:
                    logger.error(f"CLAP selection failed: {response.status_code}")
                    return {
                        "url": candidates[0]["url"],
                        "source": candidates[0]["source"],
                        "score": 0.5,
                        "metadata": candidates[0]["metadata"]
                    }
                    
        except Exception as e:
            logger.error(f"CLAP selection error: {e}")
            return {
                "url": candidates[0]["url"],
                "source": candidates[0]["source"],
                "score": 0.5,
                "metadata": candidates[0]["metadata"]
            }
