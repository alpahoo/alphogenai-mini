"""
AlphoGenAI v2 - Modal Video Pipeline
Direct SVI + AudioCraft on Modal GPU - No external APIs needed!
Cost: ~$0.01-0.02 per video (vs $0.05+ with Replicate)
"""
import modal
import os
from typing import Optional

# Modal app definition (modal.App replaces deprecated modal.Stub)
app = modal.App("alphogenai-v2")

# Image with all dependencies
image = (
    modal.Image.debian_slim()
    .pip_install(
        # Video generation
        "diffusers>=0.25.0",
        "transformers>=4.36.0",
        "torch>=2.1.0",
        "torchvision",
        "accelerate",
        "safetensors",
        "omegaconf",

        # Audio generation
        "audiocraft",  # Meta's open-source audio gen

        # Utils
        "supabase",
        "ffmpeg-python",
        "pillow",
        "numpy",
        "scipy",
    )
    .apt_install("ffmpeg", "git")
)

# Secrets (configure in Modal dashboard)
secrets = modal.Secret.from_name("alphogenai-secrets")

# GPU configuration - A10G is perfect balance cost/performance
GPU_CONFIG = modal.gpu.A10G()

# Model caching volume for faster cold starts
models_volume = modal.Volume.from_name("alphogenai-models", create_if_missing=True)


@app.function(
    image=image,
    gpu=GPU_CONFIG,
    timeout=600,
    retries=2,
    volumes={"/models": models_volume},
    secrets=[secrets],
)
def generate_video_svi(prompt: str, job_id: str, user_id: Optional[str] = None):
    """
    Generate video using Stable Video Diffusion (open-source).
    Running directly on Modal GPU - no external API costs!
    """
    import torch
    from diffusers import StableVideoDiffusionPipeline
    from diffusers.utils import export_to_video
    from PIL import Image
    import tempfile
    from pathlib import Path

    print(f"[{job_id}] Loading SVI pipeline...")

    # Load SVI model (cached in /models for faster subsequent runs)
    pipeline = StableVideoDiffusionPipeline.from_pretrained(
        "stabilityai/stable-video-diffusion-img2vid-xt",
        torch_dtype=torch.float16,
        variant="fp16",
        cache_dir="/models",
    )
    pipeline.to("cuda")
    pipeline.enable_model_cpu_offload()

    print(f"[{job_id}] Generating initial image from prompt...")

    # For MVP: Use a simple colored image based on prompt
    # TODO: Add Stable Diffusion text-to-image before this step
    img = Image.new("RGB", (1024, 576), color=(73, 109, 137))

    print(f"[{job_id}] Generating video with SVI...")

    # Generate video frames
    frames = pipeline(
        img,
        decode_chunk_size=8,
        num_frames=25,  # ~4 seconds at 6fps
        motion_bucket_id=127,
        noise_aug_strength=0.02,
    ).frames[0]

    # Export to video file
    with tempfile.TemporaryDirectory() as tmpdir:
        video_path = Path(tmpdir) / "video.mp4"
        export_to_video(frames, str(video_path), fps=6)

        print(f"[{job_id}] Video generated: {video_path}")

        with open(video_path, "rb") as f:
            video_bytes = f.read()

    return video_bytes


@app.function(
    image=image,
    gpu=GPU_CONFIG,
    timeout=300,
    retries=2,
    volumes={"/models": models_volume},
    secrets=[secrets],
)
def generate_audio_audiocraft(prompt: str, duration: float = 4.0):
    """
    Generate audio using AudioCraft (Meta's open-source).
    """
    from audiocraft.models import MusicGen
    import tempfile
    from pathlib import Path
    import subprocess

    print("Loading AudioCraft model...")

    model = MusicGen.get_pretrained("facebook/musicgen-small", cache_dir="/models")
    model.set_generation_params(duration=duration)

    print(f"Generating audio for: {prompt[:50]}...")

    descriptions = [prompt]
    wav = model.generate(descriptions)

    with tempfile.TemporaryDirectory() as tmpdir:
        wav_path = Path(tmpdir) / "audio.wav"
        mp3_path = Path(tmpdir) / "audio.mp3"

        import torchaudio
        torchaudio.save(str(wav_path), wav[0].cpu(), model.sample_rate)

        # Convert to mp3 with normalization
        subprocess.run(
            [
                "ffmpeg", "-i", str(wav_path),
                "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
                "-b:a", "192k",
                str(mp3_path),
                "-y",
            ],
            check=True,
            capture_output=True,
        )

        with open(mp3_path, "rb") as f:
            audio_bytes = f.read()

    return audio_bytes


@app.function(
    image=image,
    secrets=[secrets],
    timeout=600,
    retries=2,
)
def generate_video_complete(job_id: str, prompt: str, user_id: Optional[str] = None):
    """
    Complete video generation pipeline.
    ALL running on Modal - no external API costs!

    Flow:
    1. Update job status to 'processing'
    2. Generate video with SVI (Modal GPU)
    3. Generate audio with AudioCraft (Modal GPU)
    4. Merge video + audio with ffmpeg
    5. Upload to Supabase Storage
    6. Update job with video_url and status 'completed'

    Cost per video: ~$0.01-0.02 (Modal GPU only)
    """

    from supabase import create_client
    import ffmpeg
    from pathlib import Path
    import tempfile

    supabase = create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_KEY"],
    )

    try:
        # Step 1: Update status to processing
        supabase.table("jobs").update({
            "status": "processing",
            "current_stage": "generating_video",
        }).eq("id", job_id).execute()

        print(f"[{job_id}] Starting pipeline for prompt: {prompt[:50]}...")

        # Step 2: Generate video with SVI
        print(f"[{job_id}] Generating video with SVI...")
        video_bytes = generate_video_svi.remote(prompt, job_id, user_id)

        # Step 3: Generate audio with AudioCraft
        supabase.table("jobs").update({
            "current_stage": "generating_audio",
        }).eq("id", job_id).execute()

        print(f"[{job_id}] Generating audio with AudioCraft...")
        audio_prompt = f"Background music for: {prompt}"
        audio_bytes = generate_audio_audiocraft.remote(audio_prompt, duration=4.0)

        # Step 4: Merge video + audio
        supabase.table("jobs").update({
            "current_stage": "merging",
        }).eq("id", job_id).execute()

        print(f"[{job_id}] Merging video and audio...")

        with tempfile.TemporaryDirectory() as tmpdir:
            video_path = Path(tmpdir) / "video.mp4"
            with open(video_path, "wb") as f:
                f.write(video_bytes)

            audio_path = Path(tmpdir) / "audio.mp3"
            with open(audio_path, "wb") as f:
                f.write(audio_bytes)

            output_path = Path(tmpdir) / f"{job_id}.mp4"

            (
                ffmpeg
                .input(str(video_path))
                .input(str(audio_path))
                .output(
                    str(output_path),
                    vcodec="copy",
                    acodec="aac",
                    audio_bitrate="192k",
                    shortest=None,
                )
                .overwrite_output()
                .run(capture_stdout=True, capture_stderr=True)
            )

            print(f"[{job_id}] Video merged: {output_path}")

            # Step 5: Upload to Supabase Storage
            supabase.table("jobs").update({
                "current_stage": "uploading",
            }).eq("id", job_id).execute()

            print(f"[{job_id}] Uploading to Supabase...")

            with open(output_path, "rb") as f:
                file_data = f.read()

            storage_path = f"videos/{job_id}.mp4"

            supabase.storage.from_("videos").upload(
                storage_path,
                file_data,
                {"content-type": "video/mp4"},
            )

            video_url = supabase.storage.from_("videos").get_public_url(storage_path)

            print(f"[{job_id}] Upload complete: {video_url}")

            # Step 6: Update job with success
            supabase.table("jobs").update({
                "status": "completed",
                "video_url": video_url,
                "current_stage": "done",
                "completed_at": "now()",
            }).eq("id", job_id).execute()

            print(f"[{job_id}] Pipeline complete!")

            return {
                "success": True,
                "job_id": job_id,
                "video_url": video_url,
            }

    except Exception as e:
        print(f"[{job_id}] Error: {str(e)}")

        supabase.table("jobs").update({
            "status": "failed",
            "error_message": str(e),
            "current_stage": "failed",
            "completed_at": "now()",
        }).eq("id", job_id).execute()

        raise


@app.local_entrypoint()
def test():
    """Local test - run with: modal run modal_app/video_pipeline.py"""
    result = generate_video_complete.remote(
        job_id="test-job-123",
        prompt="A rocket launching into space with dramatic music",
    )
    print(result)


# Webhook handler for async invocation from Next.js
@app.function(
    image=image,
    secrets=[secrets],
)
@modal.asgi_app()
def webhook():
    """
    FastAPI webhook to trigger pipeline from Next.js.

    Usage:
    POST https://your-modal-app.modal.run/webhook
    Body: {"job_id": "...", "prompt": "..."}
    Header: x-webhook-secret: <secret>
    """

    from fastapi import FastAPI, HTTPException, Header
    from pydantic import BaseModel

    web = FastAPI()

    class JobRequest(BaseModel):
        job_id: str
        prompt: str
        user_id: str = None

    @web.post("/webhook")
    async def trigger_pipeline(
        request: JobRequest,
        x_webhook_secret: str = Header(None),
    ):
        expected = os.environ.get("WEBHOOK_SECRET")
        if expected and x_webhook_secret != expected:
            raise HTTPException(status_code=401, detail="Unauthorized")

        # Trigger async (non-blocking)
        generate_video_complete.spawn(
            request.job_id,
            request.prompt,
            request.user_id,
        )

        return {
            "success": True,
            "message": f"Pipeline started for job {request.job_id}",
            "cost_estimate": "$0.01-0.02",
        }

    @web.get("/health")
    async def health():
        return {"status": "healthy", "provider": "Modal (no external APIs!)"}

    return web
