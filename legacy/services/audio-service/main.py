#!/usr/bin/env python3
"""
Audio Ambience Service - FastAPI Application

This service provides audio generation and selection capabilities for video content.
It exposes three main endpoints:
1. /audio/audioldm2 - Generate audio from text prompt
2. /audio/difffoley - Generate audio from video (video-conditioned)
3. /audio/clap/select - Select best audio using CLAP scoring

Author: AlphoGenAI Team
"""

import os
import logging
from typing import Optional, List, Dict, Any
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, HTTPException, BackgroundTasks, UploadFile, File
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, HttpUrl
import uvicorn

from audio_utils import (
    AudioLDM2Generator,
    DiffFoleyGenerator,
    CLAPScorer,
    AudioGenerationError
)
from mix_utils import AudioMixer, MixingError
from storage_utils import StorageManager, StorageError

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Audio Ambience Service",
    description="AI-powered audio generation and selection for video content",
    version="1.0.0"
)

audioldm2_generator: Optional[AudioLDM2Generator] = None
difffoley_generator: Optional[DiffFoleyGenerator] = None
clap_scorer: Optional[CLAPScorer] = None
audio_mixer: Optional[AudioMixer] = None
storage_manager: Optional[StorageManager] = None

AUDIO_MODE = os.getenv("AUDIO_MODE", "auto")
AUDIO_PRIORITY = os.getenv("AUDIO_PRIORITY", "audioldm2")
AUDIO_DIFFFOLEY = os.getenv("AUDIO_DIFFFOLEY", "false").lower() == "true"
AUDIO_MOCK = os.getenv("AUDIO_MOCK", "false").lower() == "true"
CLAP_ENABLE = os.getenv("CLAP_ENABLE", "true").lower() == "true"


class AudioLDM2Request(BaseModel):
    """Request for AudioLDM2 generation."""
    prompt: str = Field(..., description="Text description of desired audio")
    duration: float = Field(5.0, ge=1.0, le=60.0, description="Audio duration in seconds")
    seed: Optional[int] = Field(None, description="Random seed for reproducibility")
    negative_prompt: Optional[str] = Field(None, description="Negative prompt to avoid certain sounds")
    guidance_scale: float = Field(3.5, ge=1.0, le=20.0, description="Guidance scale for generation")
    num_inference_steps: int = Field(50, ge=10, le=200, description="Number of denoising steps")

class AudioLDM2Response(BaseModel):
    """Response from AudioLDM2 generation."""
    audio_url: str
    duration: float
    sample_rate: int
    tags: List[str] = []
    seed: Optional[int] = None
    generation_time: float

class DiffFoleyRequest(BaseModel):
    """Request for Diff-Foley generation."""
    video_url: HttpUrl = Field(..., description="URL of the video to generate audio for")
    duration: float = Field(..., description="Video duration in seconds")
    target_lufs: float = Field(-16.0, description="Target loudness in LUFS")
    normalize: bool = Field(True, description="Whether to normalize audio")
    seed: Optional[int] = Field(None, description="Random seed")

class DiffFoleyResponse(BaseModel):
    """Response from Diff-Foley generation."""
    audio_url: str
    score: float = Field(..., ge=0.0, le=1.0, description="Quality score")
    duration: float
    sample_rate: int
    normalized: bool
    generation_time: float

class AudioCandidate(BaseModel):
    """Audio candidate for CLAP selection."""
    url: HttpUrl
    source: str = Field(..., description="Source of audio (difffoley, audioldm2, etc.)")
    metadata: Dict[str, Any] = Field(default_factory=dict)

class CLAPSelectRequest(BaseModel):
    """Request for CLAP-based audio selection."""
    prompt: str = Field(..., description="Text prompt to match against")
    candidates: List[AudioCandidate] = Field(..., min_items=1, description="Audio candidates to score")

class CLAPSelectResponse(BaseModel):
    """Response from CLAP selection."""
    best_url: str
    best_source: str
    scores: Dict[str, float]
    selection_time: float


class VideoMixRequest(BaseModel):
    """Request to mix/replace audio in a video."""
    video_url: HttpUrl
    audio_url: HttpUrl
    target_lufs: float = Field(-16.0, description="Target loudness for audio normalization (LUFS)")
    mode: str = Field("replace", description="replace|mix (replace audio track or mix with existing)")
    audio_volume: float = Field(1.0, ge=0.0, le=2.0, description="Volume multiplier when mode=mix")


class VideoMixResponse(BaseModel):
    """Response with final mixed video URL."""
    output_url_final: str
    audio_url: str
    mode: str
    processing_time: float


@app.on_event("startup")
async def startup_event():
    """Initialize models and services on startup."""
    global audioldm2_generator, difffoley_generator, clap_scorer, audio_mixer, storage_manager
    
    logger.info("Starting Audio Ambience Service...")
    logger.info(f"Configuration: MODE={AUDIO_MODE}, PRIORITY={AUDIO_PRIORITY}, "
                f"DIFFFOLEY={AUDIO_DIFFFOLEY}, MOCK={AUDIO_MOCK}, CLAP={CLAP_ENABLE}")
    
    try:
        storage_manager = StorageManager()
        logger.info("✓ Storage manager initialized")
        
        audio_mixer = AudioMixer()
        logger.info("✓ Audio mixer initialized")
        
        if CLAP_ENABLE:
            clap_scorer = CLAPScorer(mock_mode=AUDIO_MOCK)
            logger.info("✓ CLAP scorer initialized")
        
        if AUDIO_MODE != "off":
            audioldm2_generator = AudioLDM2Generator(mock_mode=AUDIO_MOCK)
            logger.info("✓ AudioLDM2 generator initialized")
        
        if AUDIO_DIFFFOLEY and AUDIO_MODE != "off":
            try:
                difffoley_generator = DiffFoleyGenerator(mock_mode=AUDIO_MOCK)
                logger.info("✓ Diff-Foley generator initialized")
            except Exception as e:
                logger.warning(f"Diff-Foley initialization failed (will use fallback): {e}")
                difffoley_generator = None
        
        logger.info("Audio Ambience Service started successfully!")
        
    except Exception as e:
        logger.error(f"Failed to initialize service: {e}")
        raise


@app.get("/health")
@app.get("/healthz")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "audio-ambience",
        "mode": AUDIO_MODE,
        "mock": AUDIO_MOCK,
        "models": {
            "audioldm2": audioldm2_generator is not None,
            "difffoley": difffoley_generator is not None,
            "clap": clap_scorer is not None
        },
        "timestamp": datetime.utcnow().isoformat()
    }


@app.post("/audio/audioldm2", response_model=AudioLDM2Response)
async def generate_audioldm2(request: AudioLDM2Request):
    """
    Generate audio from text prompt using AudioLDM2.
    
    This endpoint uses AudioLDM2 to generate ambient audio based on a text description.
    The generated audio is normalized to -16 LUFS and uploaded to storage.
    """
    if AUDIO_MODE == "off":
        raise HTTPException(status_code=503, detail="Audio generation is disabled (AUDIO_MODE=off)")
    
    if audioldm2_generator is None:
        raise HTTPException(status_code=503, detail="AudioLDM2 generator not initialized")
    
    try:
        start_time = datetime.utcnow()
        logger.info(f"Generating audio with AudioLDM2: {request.prompt[:50]}...")
        
        result = await audioldm2_generator.generate(
            prompt=request.prompt,
            duration=request.duration,
            seed=request.seed,
            negative_prompt=request.negative_prompt,
            guidance_scale=request.guidance_scale,
            num_inference_steps=request.num_inference_steps
        )
        
        normalized_path = await audio_mixer.normalize_audio(
            result["audio_path"],
            target_lufs=-16.0
        )
        
        audio_url = await storage_manager.upload_audio(
            normalized_path,
            prefix="audio/audioldm2"
        )
        
        generation_time = (datetime.utcnow() - start_time).total_seconds()
        
        logger.info(f"AudioLDM2 generation completed in {generation_time:.2f}s")
        
        return AudioLDM2Response(
            audio_url=audio_url,
            duration=result["duration"],
            sample_rate=result["sample_rate"],
            tags=result.get("tags", []),
            seed=result.get("seed"),
            generation_time=generation_time
        )
        
    except AudioGenerationError as e:
        logger.error(f"AudioLDM2 generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error in AudioLDM2 generation: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@app.post("/audio/difffoley", response_model=DiffFoleyResponse)
async def generate_difffoley(request: DiffFoleyRequest):
    """
    Generate audio from video using Diff-Foley (video-conditioned generation).
    
    This endpoint uses Diff-Foley to generate synchronized audio effects based on
    the visual content of the video. Falls back to AudioLDM2 if Diff-Foley is unavailable.
    """
    if AUDIO_MODE == "off":
        raise HTTPException(status_code=503, detail="Audio generation is disabled (AUDIO_MODE=off)")
    
    if not AUDIO_DIFFFOLEY or difffoley_generator is None:
        raise HTTPException(
            status_code=501,
            detail="Diff-Foley is not enabled (set AUDIO_DIFFFOLEY=true)"
        )
    
    try:
        start_time = datetime.utcnow()
        logger.info(f"Generating audio with Diff-Foley for video: {request.video_url}")
        
        result = await difffoley_generator.generate(
            video_url=str(request.video_url),
            duration=request.duration,
            seed=request.seed
        )
        
        audio_path = result["audio_path"]
        if request.normalize:
            audio_path = await audio_mixer.normalize_audio(
                audio_path,
                target_lufs=request.target_lufs
            )
        
        audio_url = await storage_manager.upload_audio(
            audio_path,
            prefix="audio/difffoley"
        )
        
        generation_time = (datetime.utcnow() - start_time).total_seconds()
        
        logger.info(f"Diff-Foley generation completed in {generation_time:.2f}s")
        
        return DiffFoleyResponse(
            audio_url=audio_url,
            score=result.get("score", 0.0),
            duration=result["duration"],
            sample_rate=result["sample_rate"],
            normalized=request.normalize,
            generation_time=generation_time
        )
        
    except AudioGenerationError as e:
        logger.error(f"Diff-Foley generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error in Diff-Foley generation: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@app.post("/audio/clap/select", response_model=CLAPSelectResponse)
async def select_with_clap(request: CLAPSelectRequest):
    """
    Select the best audio from candidates using CLAP (audio-text similarity).
    
    This endpoint uses CLAP to score each audio candidate against the text prompt
    and returns the best match along with all scores.
    """
    if not CLAP_ENABLE or clap_scorer is None:
        raise HTTPException(status_code=503, detail="CLAP scorer not initialized")
    
    if len(request.candidates) == 0:
        raise HTTPException(status_code=400, detail="No candidates provided")
    
    try:
        start_time = datetime.utcnow()
        logger.info(f"Scoring {len(request.candidates)} candidates with CLAP")
        
        scores = await clap_scorer.score_candidates(
            prompt=request.prompt,
            candidates=[
                {"url": str(c.url), "source": c.source}
                for c in request.candidates
            ]
        )
        
        best_source = max(scores.items(), key=lambda x: x[1])[0]
        best_candidate = next(c for c in request.candidates if c.source == best_source)
        
        selection_time = (datetime.utcnow() - start_time).total_seconds()
        
        logger.info(f"CLAP selection completed in {selection_time:.2f}s: {best_source} (score: {scores[best_source]:.3f})")
        
        return CLAPSelectResponse(
            best_url=str(best_candidate.url),
            best_source=best_source,
            scores=scores,
            selection_time=selection_time
        )
        
    except Exception as e:
        logger.error(f"CLAP selection failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/video/mix", response_model=VideoMixResponse)
async def mix_video_with_audio(request: VideoMixRequest):
    """
    Mix (or replace) an audio track into a video, then upload the final video.

    This endpoint:
    - downloads `video_url` and `audio_url`
    - normalizes the audio to `target_lufs`
    - either replaces the video's audio track (mode=replace) or mixes it (mode=mix)
    - uploads the resulting mp4 and returns a public URL
    """
    if audio_mixer is None or storage_manager is None:
        raise HTTPException(status_code=503, detail="Service not initialized")

    start_time = datetime.utcnow()

    try:
        import tempfile
        from pathlib import Path

        temp_dir = Path(tempfile.gettempdir()) / "audio-service"
        temp_dir.mkdir(exist_ok=True)

        video_path = temp_dir / f"video_{os.urandom(8).hex()}.mp4"
        audio_path = temp_dir / f"audio_{os.urandom(8).hex()}.wav"

        async with httpx.AsyncClient(timeout=300.0) as client:
            v = await client.get(str(request.video_url))
            v.raise_for_status()
            video_path.write_bytes(v.content)

            a = await client.get(str(request.audio_url))
            a.raise_for_status()
            audio_path.write_bytes(a.content)

        normalized_audio_path = await audio_mixer.normalize_audio(
            str(audio_path),
            target_lufs=request.target_lufs,
        )

        if request.mode == "mix":
            mixed_path = await audio_mixer.mix_audio_with_video(
                video_path=str(video_path),
                audio_path=normalized_audio_path,
                audio_volume=request.audio_volume,
            )
            mode = "mix"
        else:
            mixed_path = await audio_mixer.replace_audio_in_video(
                video_path=str(video_path),
                audio_path=normalized_audio_path,
            )
            mode = "replace"

        output_url_final = await storage_manager.upload_video(
            mixed_path,
            prefix="videos/final",
            public=True,
        )

        processing_time = (datetime.utcnow() - start_time).total_seconds()

        return VideoMixResponse(
            output_url_final=output_url_final,
            audio_url=str(request.audio_url),
            mode=mode,
            processing_time=processing_time,
        )

    except (MixingError, StorageError) as e:
        logger.error(f"Mixing failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error in /video/mix: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@app.get("/")
async def root():
    """Root endpoint with service information."""
    return {
        "service": "Audio Ambience Service",
        "version": "1.0.0",
        "endpoints": {
            "health": "/health",
            "audioldm2": "/audio/audioldm2",
            "difffoley": "/audio/difffoley",
            "clap_select": "/audio/clap/select"
        },
        "docs": "/docs"
    }


if __name__ == "__main__":
    port = int(os.getenv("PORT", 3000))
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        log_level="info"
    )
