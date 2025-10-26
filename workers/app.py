"""
FastAPI web server for video assembly endpoints
Runs alongside the polling worker to provide direct assembly services
"""
import os
import asyncio
from typing import Dict, Any, Optional, List
from pathlib import Path

from fastapi import FastAPI, Request, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .supabase_client import SupabaseClient
from .ffmpeg_assembler import FFmpegAssembler
from .music_library import get_music_library, get_default_music_url


app = FastAPI(title="AlphogenAI Assembly Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AssembleRequest(BaseModel):
    job_id: str = Field(..., description="UUID of the completed job")
    music_url: Optional[str] = Field(None, description="Direct URL to music MP3 file")
    clip_indices: Optional[List[int]] = Field(None, description="Which clips to include (0-indexed)")
    crossfade_ms: int = Field(0, description="Crossfade duration in milliseconds (0 = fast concat)")
    target_ratio: str = Field("1280:720", description="Video aspect ratio")
    normalize_audio: bool = Field(True, description="Normalize audio levels")
    music_volume: float = Field(0.4, description="Music volume (0.0-1.0)")


def verify_auth_header(request: Request):
    """Verify the X-Assembler-Secret header"""
    secret = os.environ.get("ASSEMBLER_SHARED_SECRET")
    if not secret:
        raise HTTPException(status_code=500, detail="Server configuration error: missing ASSEMBLER_SHARED_SECRET")
    
    auth_header = request.headers.get("X-Assembler-Secret")
    if not auth_header:
        raise HTTPException(status_code=401, detail="Missing X-Assembler-Secret header")
    
    if auth_header != secret:
        raise HTTPException(status_code=401, detail="Invalid authentication secret")


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"ok": True, "service": "alphogenai-assembly"}


@app.post("/assemble/reuse")
async def assemble_reuse(req: AssembleRequest, request: Request):
    """
    Assemble video from existing clip URLs
    
    This endpoint:
    1. Fetches job from database
    2. Extracts existing clip URLs from app_state
    3. Downloads and concatenates clips with FFmpeg
    4. Adds music overlay from external URL
    5. Returns MP4 as binary response (no storage upload)
    """
    verify_auth_header(request)
    
    print(f"\n{'='*70}")
    print(f"🎬 Assembly Service - Reuse Mode")
    print(f"{'='*70}")
    print(f"Job ID: {req.job_id}")
    print(f"Music URL: {req.music_url or 'default'}")
    print(f"Clip indices: {req.clip_indices or 'all'}")
    print(f"{'='*70}\n")
    
    try:
        supabase = SupabaseClient()
        
        result = supabase.client.table("jobs") \
            .select("*") \
            .eq("id", req.job_id) \
            .single() \
            .execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail=f"Job {req.job_id} not found")
        
        job = result.data
        
        if job["status"] not in ["done", "completed"]:
            raise HTTPException(
                status_code=400,
                detail=f"Job status is '{job['status']}', must be 'done' or 'completed'"
            )
        
        app_state = job.get("app_state", {})
        video_clips = app_state.get("video_clips", {})
        
        if not video_clips:
            video_clips = app_state.get("runway_tasks", {})
        
        if not video_clips:
            raise HTTPException(
                status_code=400,
                detail="Job has no video_clips in app_state"
            )
        
        scene_keys = sorted(video_clips.keys(), key=lambda x: int(x.replace("scene_", "")))
        
        if req.clip_indices:
            if any(i >= len(scene_keys) for i in req.clip_indices):
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid clip_indices: max index is {len(scene_keys) - 1}"
                )
            scene_keys = [scene_keys[i] for i in req.clip_indices]
        
        clip_urls = []
        for scene_key in scene_keys:
            scene_data = video_clips[scene_key]
            video_url = scene_data.get("video_url")
            if not video_url:
                raise HTTPException(
                    status_code=400,
                    detail=f"Scene {scene_key} has no video_url"
                )
            clip_urls.append(video_url)
        
        print(f"[Assembly] Found {len(clip_urls)} clips to assemble")
        
        if len(clip_urls) > 20:
            raise HTTPException(
                status_code=400,
                detail=f"Too many clips: {len(clip_urls)} (max 20)"
            )
        
        music_url = req.music_url
        if not music_url:
            music_url = get_default_music_url()
            print(f"[Assembly] Using default music: {music_url}")
        
        assembler = FFmpegAssembler()
        
        try:
            final_video_path = await assembler.assemble_clips(
                clip_urls=clip_urls,
                music_url=music_url,
                output_filename=f"{req.job_id}_assembled.mp4"
            )
        except Exception as e:
            failed_url = str(e)
            if "404" in str(e) or "400" in str(e) or "403" in str(e):
                raise HTTPException(
                    status_code=424,
                    detail=f"Failed to download clip or music: {str(e)}"
                )
            raise HTTPException(
                status_code=500,
                detail=f"Assembly failed: {str(e)}"
            )
        
        video_path = Path(final_video_path)
        if not video_path.exists():
            raise HTTPException(
                status_code=500,
                detail="Assembly completed but output file not found"
            )
        
        video_bytes = video_path.read_bytes()
        video_size_mb = len(video_bytes) / 1024 / 1024
        
        print(f"\n[Assembly] ✅ Assembly complete")
        print(f"[Assembly] File size: {video_size_mb:.2f} MB")
        print(f"[Assembly] Returning binary response\n")
        
        try:
            import shutil
            shutil.rmtree(video_path.parent)
        except Exception as e:
            print(f"[Assembly] Warning: Failed to cleanup temp files: {e}")
        
        return Response(
            content=video_bytes,
            media_type="video/mp4",
            headers={
                "Content-Disposition": f'attachment; filename="{req.job_id}_assembled.mp4"',
                "Content-Length": str(len(video_bytes))
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"\n[Assembly] ❌ Error: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
