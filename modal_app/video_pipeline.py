"""
AlphoGenAI Mini — Modal Video Pipeline
Architecture multi-plan :
  Free    : FLUX.1-schnell (T2I) + Wan 2.2 I2V + SVI 2.0 Pro LoRA (max 90s)
  Pro     : LTX-Video 13B (T2V natif, 60s streaming)
  Premium : Seedance 2.0 API (15s, qualité cinématique)
"""
import modal
import os
from typing import Optional, Literal

# ---------------------------------------------------------------------------
# App & base image
# ---------------------------------------------------------------------------
app = modal.App("alphogenai-v2")

Plan = Literal["free", "pro", "premium"]

base_image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "torch==2.4.0",
        "torchvision",
        "diffusers>=0.31.0",
        "transformers>=4.45.0",
        "accelerate>=0.33.0",
        "safetensors",
        "sentencepiece",
        "peft",                    # LoRA support (SVI)
        "imageio[ffmpeg]",
        "ffmpeg-python",
        "pillow",
        "numpy",
        "scipy",
        "supabase",
        "boto3",                   # R2 upload (S3-compatible)
        "httpx",
    )
    .apt_install("ffmpeg", "git")
)

# ---------------------------------------------------------------------------
# Secrets & volumes
# ---------------------------------------------------------------------------
secrets = modal.Secret.from_name("alphogenai-secrets")

models_volume = modal.Volume.from_name(
    "alphogenai-models", create_if_missing=True
)

# ---------------------------------------------------------------------------
# GPU configs per plan
# ---------------------------------------------------------------------------
GPU_FREE    = modal.gpu.A100(size="40GB")   # Wan 2.2 I2V 14B needs A100
GPU_PRO     = modal.gpu.A10G()              # LTX-Video 13B fits on A10G
GPU_PREMIUM = modal.gpu.A10G()              # Seedance via API, no heavy local model


# ===========================================================================
# FREE PLAN — FLUX.1-schnell (T2I) + Wan 2.2 I2V + SVI 2.0 Pro LoRA
# ===========================================================================

@app.function(
    image=base_image,
    gpu=GPU_FREE,
    timeout=900,          # 15 min max (90s video needs several segments)
    retries=1,
    volumes={"/models": models_volume},
    secrets=[secrets],
)
def generate_free(prompt: str, job_id: str, max_duration: int = 90):
    """
    Free plan pipeline:
    1. FLUX.1-schnell → initial image (T2I)
    2. Wan 2.2 I2V + SVI 2.0 Pro LoRA → video segments (iterative)
    3. ffmpeg concat → final video
    """
    import torch
    from diffusers import FluxPipeline, AutoencoderKLWan, WanImageToVideoPipeline
    from diffusers.utils import export_to_video
    from peft import PeftModel
    from PIL import Image
    import tempfile
    from pathlib import Path
    import subprocess

    print(f"[{job_id}][FREE] Starting pipeline — max {max_duration}s")

    MODEL_DIR = "/models"
    FLUX_ID   = "black-forest-labs/FLUX.1-schnell"
    WAN_ID    = "Wan-AI/Wan2.2-I2V-14B-480P"      # Wan 2.2 I2V base model
    SVI_LORA  = "Kijai/WanVideo_comfy"             # SVI 2.0 Pro LoRA weights
    SVI_LORA_PATH = "LoRAs/Stable-Video-Infinity/v2.0/svi_2.0_pro_wan22_high.safetensors"

    # ------------------------------------------------------------------
    # Step 1: FLUX.1-schnell — text → initial image
    # ------------------------------------------------------------------
    print(f"[{job_id}] Step 1/3 — FLUX.1-schnell T2I...")
    flux = FluxPipeline.from_pretrained(
        FLUX_ID,
        torch_dtype=torch.bfloat16,
        cache_dir=MODEL_DIR,
    ).to("cuda")
    flux.enable_model_cpu_offload()

    image: Image.Image = flux(
        prompt=prompt,
        num_inference_steps=4,      # schnell is optimised for 4 steps
        guidance_scale=0.0,
        height=480,
        width=832,
    ).images[0]

    del flux
    torch.cuda.empty_cache()
    print(f"[{job_id}] Initial image generated ✓")

    # ------------------------------------------------------------------
    # Step 2: Wan 2.2 I2V + SVI 2.0 Pro LoRA — iterative segments
    # ------------------------------------------------------------------
    print(f"[{job_id}] Step 2/3 — Loading Wan 2.2 I2V + SVI LoRA...")

    vae = AutoencoderKLWan.from_pretrained(
        WAN_ID, subfolder="vae", torch_dtype=torch.float32, cache_dir=MODEL_DIR
    )
    pipe = WanImageToVideoPipeline.from_pretrained(
        WAN_ID,
        vae=vae,
        torch_dtype=torch.bfloat16,
        cache_dir=MODEL_DIR,
    ).to("cuda")

    # Load SVI 2.0 Pro LoRA
    pipe.load_lora_weights(
        SVI_LORA,
        weight_name=SVI_LORA_PATH,
        cache_dir=MODEL_DIR,
    )
    pipe.set_adapters(["default"], adapter_weights=[0.9])

    # Segment params
    SEGMENT_FRAMES = 81        # ~5s at 16fps per segment (SVI optimal)
    FPS            = 16
    segment_duration = SEGMENT_FRAMES / FPS   # ~5.06s
    num_segments   = max(1, min(int(max_duration / segment_duration), 18))  # max 18 segments ≈ 90s

    print(f"[{job_id}] Generating {num_segments} segments × {segment_duration:.1f}s = {num_segments*segment_duration:.0f}s")

    segment_paths = []
    current_image = image
    import random

    with tempfile.TemporaryDirectory() as tmpdir:
        for i in range(num_segments):
            seed = random.randint(0, 2**32 - 1)   # Different seed per segment (SVI requirement!)
            generator = torch.Generator(device="cuda").manual_seed(seed)

            print(f"[{job_id}] Segment {i+1}/{num_segments} (seed={seed})...")

            frames = pipe(
                image=current_image,
                prompt=prompt,
                num_frames=SEGMENT_FRAMES,
                guidance_scale=5.0,
                num_inference_steps=20,
                generator=generator,
            ).frames[0]

            seg_path = Path(tmpdir) / f"seg_{i:03d}.mp4"
            export_to_video(frames, str(seg_path), fps=FPS)
            segment_paths.append(str(seg_path))

            # Last frame of this segment = first frame of next (SVI Film approach)
            current_image = frames[-1] if isinstance(frames[-1], Image.Image) else Image.fromarray(frames[-1])

            print(f"[{job_id}] Segment {i+1} done ✓")

        del pipe
        torch.cuda.empty_cache()

        # ------------------------------------------------------------------
        # Step 3: ffmpeg concat all segments
        # ------------------------------------------------------------------
        print(f"[{job_id}] Step 3/3 — Concatenating {len(segment_paths)} segments...")

        concat_list = Path(tmpdir) / "concat.txt"
        concat_list.write_text("\n".join(f"file '{p}'" for p in segment_paths))

        output_path = Path(tmpdir) / f"{job_id}.mp4"
        subprocess.run([
            "ffmpeg", "-f", "concat", "-safe", "0",
            "-i", str(concat_list),
            "-c:v", "libx264", "-crf", "18", "-preset", "fast",
            str(output_path), "-y",
        ], check=True, capture_output=True)

        with open(output_path, "rb") as f:
            return f.read()


# ===========================================================================
# PRO PLAN — LTX-Video 13B (T2V natif, 60s)
# ===========================================================================

@app.function(
    image=base_image,
    gpu=GPU_PRO,
    timeout=600,
    retries=1,
    volumes={"/models": models_volume},
    secrets=[secrets],
)
def generate_pro(prompt: str, job_id: str):
    """
    Pro plan: LTX-Video 13B — native text-to-video, up to 60s.
    """
    import torch
    from diffusers import LTXPipeline
    from diffusers.utils import export_to_video
    import tempfile
    from pathlib import Path

    print(f"[{job_id}][PRO] LTX-Video 13B pipeline...")

    pipe = LTXPipeline.from_pretrained(
        "Lightricks/LTX-Video",
        torch_dtype=torch.bfloat16,
        cache_dir="/models",
    ).to("cuda")
    pipe.enable_model_cpu_offload()

    print(f"[{job_id}] Generating ~60s video with LTX-Video...")

    frames = pipe(
        prompt=prompt,
        negative_prompt="worst quality, inconsistent motion, blurry, jittery, distorted",
        width=768,
        height=512,
        num_frames=241,       # ~60s at 4fps (LTX native output)
        num_inference_steps=50,
        guidance_scale=3.0,
    ).frames[0]

    with tempfile.TemporaryDirectory() as tmpdir:
        output_path = Path(tmpdir) / f"{job_id}.mp4"
        export_to_video(frames, str(output_path), fps=24)
        with open(output_path, "rb") as f:
            return f.read()


# ===========================================================================
# PREMIUM PLAN — Seedance 2.0 API (15s, qualité cinématique)
# ===========================================================================

@app.function(
    image=base_image,
    gpu=GPU_PREMIUM,
    timeout=300,
    retries=2,
    secrets=[secrets],
)
def generate_premium(prompt: str, job_id: str):
    """
    Premium plan: Seedance 2.0 via API (15s, cinematic quality).
    TODO: Replace with official Seedance 2.0 API endpoint when available.
    """
    import httpx
    import time

    print(f"[{job_id}][PREMIUM] Seedance 2.0 API...")

    api_key  = os.environ.get("SEEDANCE_API_KEY", "")
    api_url  = os.environ.get("SEEDANCE_API_URL", "")

    if not api_key or not api_url:
        raise ValueError("SEEDANCE_API_KEY / SEEDANCE_API_URL not configured")

    with httpx.Client(timeout=240) as client:
        # Submit generation
        resp = client.post(
            f"{api_url}/v1/video/generate",
            headers={"Authorization": f"Bearer {api_key}"},
            json={"prompt": prompt, "duration": 15, "quality": "cinematic"},
        )
        resp.raise_for_status()
        task_id = resp.json()["task_id"]
        print(f"[{job_id}] Seedance task: {task_id}")

        # Poll until done
        for _ in range(60):
            time.sleep(5)
            status_resp = client.get(
                f"{api_url}/v1/video/{task_id}",
                headers={"Authorization": f"Bearer {api_key}"},
            )
            data = status_resp.json()
            if data["status"] == "completed":
                video_resp = client.get(data["video_url"])
                return video_resp.content
            elif data["status"] == "failed":
                raise RuntimeError(f"Seedance failed: {data.get('error')}")

    raise TimeoutError("Seedance API timed out")


# ===========================================================================
# R2 Upload helper
# ===========================================================================

def upload_to_r2(video_bytes: bytes, job_id: str) -> str:
    """Upload video to Cloudflare R2, return public URL."""
    import boto3
    from botocore.config import Config

    s3 = boto3.client(
        "s3",
        endpoint_url=os.environ["R2_ENDPOINT"],
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )

    key = f"videos/{job_id}.mp4"
    s3.put_object(
        Bucket=os.environ["R2_BUCKET_NAME"],
        Key=key,
        Body=video_bytes,
        ContentType="video/mp4",
    )

    public_url = os.environ.get("R2_PUBLIC_URL", "").rstrip("/")
    return f"{public_url}/{key}" if public_url else f"{os.environ['R2_ENDPOINT']}/{os.environ['R2_BUCKET_NAME']}/{key}"


# ===========================================================================
# Main orchestrator — routes by plan
# ===========================================================================

@app.function(
    image=base_image,
    secrets=[secrets],
    timeout=1200,
    retries=1,
)
def generate_video_complete(
    job_id: str,
    prompt: str,
    plan: Plan = "free",
    user_id: Optional[str] = None,
):
    """
    Main entry point. Routes to the correct pipeline based on plan.
    Updates Supabase at each stage.
    """
    from supabase import create_client

    supabase = create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_KEY"],
    )

    def update_job(status=None, stage=None, **kwargs):
        payload = {"updated_at": "now()"}
        if status: payload["status"] = status
        if stage:  payload["current_stage"] = stage
        payload.update(kwargs)
        supabase.table("jobs").update(payload).eq("id", job_id).execute()

    try:
        update_job(status="processing", stage="generating_video")
        print(f"[{job_id}] Plan: {plan} | Prompt: {prompt[:60]}...")

        # Route to plan-specific generator
        if plan == "free":
            update_job(stage="generating_video")
            video_bytes = generate_free.remote(prompt, job_id, max_duration=90)

        elif plan == "pro":
            update_job(stage="generating_video")
            video_bytes = generate_pro.remote(prompt, job_id)

        elif plan == "premium":
            update_job(stage="generating_video")
            video_bytes = generate_premium.remote(prompt, job_id)

        else:
            raise ValueError(f"Unknown plan: {plan}")

        # Upload to R2
        update_job(stage="uploading")
        print(f"[{job_id}] Uploading to R2...")
        video_url = upload_to_r2(video_bytes, job_id)
        print(f"[{job_id}] Uploaded: {video_url}")

        # Done
        update_job(
            status="done",
            stage="completed",
            video_url=video_url,
            output_url_final=video_url,
        )
        print(f"[{job_id}] ✅ Pipeline complete!")
        return {"success": True, "job_id": job_id, "video_url": video_url}

    except Exception as e:
        print(f"[{job_id}] ❌ Error: {e}")
        update_job(status="failed", stage="failed", error_message=str(e))
        raise


# ===========================================================================
# FastAPI webhook — triggered by Next.js POST /api/jobs
# ===========================================================================

@app.function(image=base_image, secrets=[secrets])
@modal.asgi_app()
def webhook():
    from fastapi import FastAPI, HTTPException, Header
    from pydantic import BaseModel

    web = FastAPI(title="AlphoGenAI Webhook")

    class JobRequest(BaseModel):
        job_id: str
        prompt: str
        plan: Plan = "free"
        user_id: Optional[str] = None

    @web.post("/webhook")
    async def trigger(req: JobRequest, x_webhook_secret: str = Header(None)):
        expected = os.environ.get("WEBHOOK_SECRET")
        if expected and x_webhook_secret != expected:
            raise HTTPException(status_code=401, detail="Unauthorized")

        generate_video_complete.spawn(req.job_id, req.prompt, req.plan, req.user_id)

        return {
            "success": True,
            "message": f"Pipeline started for job {req.job_id}",
            "plan": req.plan,
        }

    @web.get("/health")
    async def health():
        return {"status": "ok", "plans": ["free", "pro", "premium"]}

    return web


# ===========================================================================
# Local test
# ===========================================================================

@app.local_entrypoint()
def test():
    result = generate_video_complete.remote(
        job_id="test-001",
        prompt="A rocket launching into space at sunset",
        plan="free",
    )
    print(result)
