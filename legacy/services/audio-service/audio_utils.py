#!/usr/bin/env python3
"""
Audio Generation Utilities

This module provides wrappers for audio generation models:
- AudioLDM2: Text-to-audio generation
- Diff-Foley: Video-conditioned audio generation
- CLAP: Audio-text similarity scoring
"""

import os
import logging
import asyncio
import tempfile
from typing import Optional, Dict, Any, List
from pathlib import Path
import numpy as np

logger = logging.getLogger(__name__)


class AudioGenerationError(Exception):
    """Exception raised when audio generation fails."""
    pass


class AudioLDM2Generator:
    """
    AudioLDM2 text-to-audio generator.
    
    Uses AudioLDM2 model from Hugging Face to generate audio from text prompts.
    """
    
    def __init__(self, model_name: str = "cvssp/audioldm2", device: str = "cuda", mock_mode: bool = False):
        """
        Initialize AudioLDM2 generator.
        
        Args:
            model_name: Hugging Face model name
            device: Device to run on (cuda/cpu)
            mock_mode: If True, use mock generation for testing
        """
        self.model_name = model_name
        self.device = device
        self.mock_mode = mock_mode
        self.pipeline = None
        
        if not mock_mode:
            self._load_model()
    
    def _load_model(self):
        """Load AudioLDM2 model."""
        try:
            logger.info(f"Loading AudioLDM2 model: {self.model_name}")
            
            from diffusers import AudioLDM2Pipeline
            import torch
            
            self.pipeline = AudioLDM2Pipeline.from_pretrained(
                self.model_name,
                torch_dtype=torch.float16 if self.device == "cuda" else torch.float32
            )
            
            if self.device == "cuda":
                self.pipeline = self.pipeline.to(self.device)
                self.pipeline.enable_model_cpu_offload()
            
            logger.info("AudioLDM2 model loaded successfully")
            
        except Exception as e:
            logger.error(f"Failed to load AudioLDM2 model: {e}")
            raise AudioGenerationError(f"Model loading failed: {e}")
    
    async def generate(
        self,
        prompt: str,
        duration: float = 5.0,
        seed: Optional[int] = None,
        negative_prompt: Optional[str] = None,
        guidance_scale: float = 3.5,
        num_inference_steps: int = 50
    ) -> Dict[str, Any]:
        """
        Generate audio from text prompt.
        
        Args:
            prompt: Text description of desired audio
            duration: Audio duration in seconds
            seed: Random seed for reproducibility
            negative_prompt: Negative prompt to avoid certain sounds
            guidance_scale: Guidance scale for generation
            num_inference_steps: Number of denoising steps
            
        Returns:
            Dictionary with audio_path, duration, sample_rate, etc.
        """
        if self.mock_mode:
            return await self._mock_generate(prompt, duration, seed)
        
        try:
            import torch
            import soundfile as sf
            
            logger.info(f"Generating audio: {prompt[:50]}...")
            
            generator = None
            if seed is not None:
                generator = torch.Generator(device=self.device).manual_seed(seed)
            
            audio = self.pipeline(
                prompt,
                negative_prompt=negative_prompt,
                num_inference_steps=num_inference_steps,
                audio_length_in_s=duration,
                guidance_scale=guidance_scale,
                generator=generator
            ).audios[0]
            
            temp_dir = Path(tempfile.gettempdir()) / "audio-service"
            temp_dir.mkdir(exist_ok=True)
            
            audio_path = temp_dir / f"audioldm2_{os.urandom(8).hex()}.wav"
            
            sample_rate = 16000
            sf.write(str(audio_path), audio, sample_rate)
            
            logger.info(f"Audio generated: {audio_path}")
            
            return {
                "audio_path": str(audio_path),
                "duration": duration,
                "sample_rate": sample_rate,
                "seed": seed,
                "tags": self._extract_tags(prompt)
            }
            
        except Exception as e:
            logger.error(f"AudioLDM2 generation failed: {e}")
            raise AudioGenerationError(f"Generation failed: {e}")
    
    async def _mock_generate(self, prompt: str, duration: float, seed: Optional[int]) -> Dict[str, Any]:
        """Mock generation for testing without GPU."""
        logger.info(f"Mock AudioLDM2 generation: {prompt[:50]}...")
        
        await asyncio.sleep(1)
        
        import soundfile as sf
        
        temp_dir = Path(tempfile.gettempdir()) / "audio-service"
        temp_dir.mkdir(exist_ok=True)
        
        audio_path = temp_dir / f"audioldm2_mock_{os.urandom(8).hex()}.wav"
        
        sample_rate = 16000
        samples = int(duration * sample_rate)
        audio = np.zeros(samples, dtype=np.float32)
        
        sf.write(str(audio_path), audio, sample_rate)
        
        return {
            "audio_path": str(audio_path),
            "duration": duration,
            "sample_rate": sample_rate,
            "seed": seed,
            "tags": ["mock", "silent"]
        }
    
    def _extract_tags(self, prompt: str) -> List[str]:
        """Extract relevant tags from prompt."""
        keywords = ["ambient", "music", "sound", "noise", "nature", "urban", "ocean", "wind", "rain"]
        return [kw for kw in keywords if kw in prompt.lower()]


class DiffFoleyGenerator:
    """
    Diff-Foley video-conditioned audio generator.
    
    Generates synchronized audio effects based on video content.
    Note: This is a research model and may require custom implementation.
    """
    
    def __init__(self, model_path: Optional[str] = None, device: str = "cuda", mock_mode: bool = False):
        """
        Initialize Diff-Foley generator.
        
        Args:
            model_path: Path to model weights
            device: Device to run on
            mock_mode: If True, use mock generation
        """
        self.model_path = model_path
        self.device = device
        self.mock_mode = mock_mode
        self.model = None
        
        if not mock_mode:
            self._load_model()
    
    def _load_model(self):
        """Load Diff-Foley model."""
        try:
            logger.info("Loading Diff-Foley model...")
            
            
            logger.warning("Diff-Foley not fully implemented - using fallback")
            self.model = {"type": "placeholder", "device": self.device}
            
        except Exception as e:
            logger.error(f"Failed to load Diff-Foley model: {e}")
            raise AudioGenerationError(f"Model loading failed: {e}")
    
    async def generate(
        self,
        video_url: str,
        duration: float,
        seed: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Generate audio from video.
        
        Args:
            video_url: URL of the video
            duration: Video duration in seconds
            seed: Random seed
            
        Returns:
            Dictionary with audio_path, duration, sample_rate, score
        """
        if self.mock_mode:
            return await self._mock_generate(video_url, duration, seed)
        
        try:
            logger.info(f"Generating audio from video: {video_url}")
            
            
            logger.warning("Using mock Diff-Foley generation")
            return await self._mock_generate(video_url, duration, seed)
            
        except Exception as e:
            logger.error(f"Diff-Foley generation failed: {e}")
            raise AudioGenerationError(f"Generation failed: {e}")
    
    async def _mock_generate(self, video_url: str, duration: float, seed: Optional[int]) -> Dict[str, Any]:
        """Mock generation for testing."""
        logger.info(f"Mock Diff-Foley generation for: {video_url}")
        
        await asyncio.sleep(2)
        
        import soundfile as sf
        
        temp_dir = Path(tempfile.gettempdir()) / "audio-service"
        temp_dir.mkdir(exist_ok=True)
        
        audio_path = temp_dir / f"difffoley_mock_{os.urandom(8).hex()}.wav"
        
        sample_rate = 48000
        samples = int(duration * sample_rate)
        audio = np.zeros(samples, dtype=np.float32)
        
        sf.write(str(audio_path), audio, sample_rate)
        
        return {
            "audio_path": str(audio_path),
            "duration": duration,
            "sample_rate": sample_rate,
            "score": 0.75,  # Mock score
            "seed": seed
        }


class CLAPScorer:
    """
    CLAP (Contrastive Language-Audio Pretraining) scorer.
    
    Uses LAION CLAP to compute audio-text similarity scores.
    """
    
    def __init__(self, model_name: str = "laion/clap-htsat-unfused", device: str = "cpu", mock_mode: bool = False):
        """
        Initialize CLAP scorer.
        
        Args:
            model_name: CLAP model name
            device: Device to run on (CPU is fine for CLAP)
            mock_mode: If True, use mock scoring
        """
        self.model_name = model_name
        self.device = device
        self.mock_mode = mock_mode
        self.model = None
        self.processor = None
        
        if not mock_mode:
            self._load_model()
    
    def _load_model(self):
        """Load CLAP model."""
        try:
            logger.info(f"Loading CLAP model: {self.model_name}")
            
            from transformers import ClapModel, ClapProcessor
            
            self.processor = ClapProcessor.from_pretrained(self.model_name)
            self.model = ClapModel.from_pretrained(self.model_name)
            self.model = self.model.to(self.device)
            self.model.eval()
            
            logger.info("CLAP model loaded successfully")
            
        except Exception as e:
            logger.error(f"Failed to load CLAP model: {e}")
            raise AudioGenerationError(f"Model loading failed: {e}")
    
    async def score_candidates(
        self,
        prompt: str,
        candidates: List[Dict[str, str]]
    ) -> Dict[str, float]:
        """
        Score audio candidates against text prompt.
        
        Args:
            prompt: Text prompt to match against
            candidates: List of dicts with 'url' and 'source' keys
            
        Returns:
            Dictionary mapping source to score (0-1)
        """
        if self.mock_mode:
            return await self._mock_score(prompt, candidates)
        
        try:
            import torch
            import librosa
            import requests
            from io import BytesIO
            
            logger.info(f"Scoring {len(candidates)} candidates with CLAP")
            
            scores = {}
            
            for candidate in candidates:
                try:
                    response = requests.get(candidate["url"], timeout=30)
                    audio_bytes = BytesIO(response.content)
                    
                    audio, sr = librosa.load(audio_bytes, sr=48000, mono=True)
                    
                    inputs = self.processor(
                        text=[prompt],
                        audios=[audio],
                        return_tensors="pt",
                        padding=True,
                        sampling_rate=48000
                    )
                    
                    inputs = {k: v.to(self.device) for k, v in inputs.items()}
                    
                    with torch.no_grad():
                        outputs = self.model(**inputs)
                        logits_per_audio = outputs.logits_per_audio
                        score = torch.sigmoid(logits_per_audio).item()
                    
                    scores[candidate["source"]] = score
                    logger.info(f"  {candidate['source']}: {score:.3f}")
                    
                except Exception as e:
                    logger.error(f"Failed to score {candidate['source']}: {e}")
                    scores[candidate["source"]] = 0.0
            
            return scores
            
        except Exception as e:
            logger.error(f"CLAP scoring failed: {e}")
            raise AudioGenerationError(f"Scoring failed: {e}")
    
    async def _mock_score(self, prompt: str, candidates: List[Dict[str, str]]) -> Dict[str, float]:
        """Mock scoring for testing."""
        logger.info(f"Mock CLAP scoring for: {prompt[:50]}...")
        
        await asyncio.sleep(0.5)
        
        scores = {}
        for candidate in candidates:
            if candidate["source"] == "difffoley":
                scores[candidate["source"]] = 0.81
            elif candidate["source"] == "audioldm2":
                scores[candidate["source"]] = 0.64
            else:
                scores[candidate["source"]] = 0.50
        
        return scores
