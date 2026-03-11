"""
AlphoGenAI Mini — Modal Video Pipeline
Architecture multi-plan :
  Free    : FLUX.1-schnell (T2I) + Wan2.2-TI2V-5B + SVI 2.0 Pro LoRA (max 90s, A10G)
  Pro     : LTX-Video 13B (T2V natif, 60s streaming, A10G)
  Premium : Seedance 2.0 API (15s, qualité cinématique, A10G)
"""
import modal
import os
from typing import Optional, Literal

app = modal.App("alphogenai-v2")

Plan = Literal["free", "pro", "premium"]

base_image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "torch==2.5.1",
        "torchvision",
        "xformers==0.0.29.post1",
        "diffusers>=0.31.0",
        "transformers>=4.45.0",
        "accelerate>=0.33.0",
        "safetensors",
        "sentencepiece",
        "peft",
        "imageio[ffmpeg]",
        "ffmpeg-python",
        "pillow",
        "numpy",
        "scipy",
        "supabase",
        "boto3",
        "httpx",
        "huggingface_hub",
    )
    .apt_install("ffmpeg", "git")
)

secrets = modal.Secret.from_name("alphogenai-secrets")
models_volume = modal.Volume.from_name("alphogenai-models", create_if_missing=True)

# Fix: use string instead of deprecated modal.gpu.A10G()
GPU_A10G = "A10G"


# ===========================================================================
# MODEL DOWNLOAD — run once to pre-cache all models
# ===========================================================================

@app.function(
    image=base_image,
    gpu=GPU_A10G,
    timeout=3600,
    volumes={"/models": models_volume},
    secrets=[secrets],
)
def download_models():
    """Pre-download all models to persistent volume. Run once."""
    from huggingface_hub import snapshot_download
    import os

    hf_token = os.environ.get("HF_TOKEN")

    print("Downloading FLUX.1-schnell...")
    snapshot_download(
        "black-forest-labs/FLUX.1-schnell",
        local_dir="/models/flux-schnell",
        token=hf_token,
    )

    print("Downloading Wan2.2-TI2V-5B-Diffusers...")
    snapshot_download(
        "Wan-AI/Wan2.2-TI2V-5B-Diffusers",
        local_dir="/models/wan2.2-ti2v-5b",
        token=hf_token,
    )

    print("Downloading LTX-Video...")
    snapshot_download(
        "Lightricks/LTX-Video",
        local_dir="/models/ltx-video",
        token=hf_token,
    )

    models_volume.commit()
    print("All models downloaded and cached!")


# ===========================================================================
# FREE PLAN — FLUX.1-schnell (T2I) + Wan2.2-TI2V-5B
# ===========================================================================

@app.function(
    image=base_image,
    gpu=GPU_A10G,
    timeout=900,
    retries=1,
    volumes={"/models": models_volume},
    secrets=[secrets],
)
def generate_free(prompt: str, job_id: str, max_duration: int = 90):
    """
    Free plan pipeline:
    1. FLUX.1-schnell  → initial image (T2I, 4 steps)
    2. Wan2.2-TI2V-5B → video segments
    3. ffmpeg concat   → final MP4
    GPU: A10G (24GB)
    """
    import torch
    from diffusers import FluxPipeline, WanImageToVideoPipeline, AutoencoderKLWan
    from diffusers.utils import export_to_video
    from PIL import Image
    import tempfile, subprocess, random
    from pathlib import Path

    print(f"[{job_id}][FREE] Starting — max {max_duration}s | GPU: A10G")

    MODEL_DIR = "/models"
    FLUX_DIR  = f"{MODEL_DIR}/flux-schnell"
    WAN_DIR   = f"{MODEL_DIR}/wan2.2-ti2v-5b"

    # ------------------------------------------------------------------
    # Step 1: FLUX.1-schnell — text → initial image
    # ------------------------------------------------------------------
    print(f"[{job_id}] Step 1/3 — FLUX.1-schnell T2I...")
    flux = FluxPipeline.from_pretrained(
        FLUX_DIR,
        torch_dtype=torch.bfloat16,
        local_files_only=True,
    ).to("cuda")
    flux.enable_model_cpu_offload()

    image: Image.Image = flux(
        prompt=prompt,
        num_inference_steps=4,
        guidance_scale=0.0,
        height=480,
        width=832,
    ).images[0]

    del flux
    torch.cuda.empty_cache()
    print(f"[{job_id}] Initial image ✓")

    # ------------------------------------------------------------------
    # Step 2: Wan2.2-TI2V-5B — image → video segments
    # ------------------------------------------------------------------
    print(f"[{job_id}] Step 2/3 — Loading Wan2.2-TI2V-5B...")

    vae = AutoencoderKLWan.from_pretrained(
        WAN_DIR, subfolder="vae", torch_dtype=torch.float32, local_files_only=True
    )
    pipe = WanImageToVideoPipeline.from_pretrained(
        WAN_DIR,
        vae=vae,
        torch_dtype=torch.bfloat16,
        local_files_only=True,
    ).to("cuda")

    SEGMENT_FRAMES   = 81       # ~5s at 16fps
    FPS              = 16
    segment_duration = SEGMENT_FRAMES / FPS
    num_segments     = max(1, min(int(max_duration / segment_duration), 18))

    print(f"[{job_id}] {num_segments} segments × {segment_duration:.1f}s")

    segment_paths = []
    current_image = image

    with tempfile.TemporaryDirectory() as tmpdir:
        for i in range(num_segments):
            seed = random.randint(0, 2**32 - 1)
            generator = torch.Generator(device="cuda").manual_seed(seed)
            print(f"[{job_id}] Segment {i+1}/{num_segments}...")

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

            last = frames[-1]
            current_image = last if isinstance(last, Image.Image) else Image.fromarray(last)
            print(f"[{job_id}] Segment {i+1} ✓")

        del pipe
        torch.cuda.empty_cache()

        # ------------------------------------------------------------------
        # Step 3: ffmpeg concat
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
# PRO PLAN — LTX-Video (T2V natif, 60s, A10G)
# ===========================================================================

@app.function(
    image=base_image,
    gpu=GPU_A10G,
    timeout=600,
    retries=1,
    volumes={"/models": models_volume},
    secrets=[secrets],
)
def generate_pro(prompt: str, job_id: str):
    """Pro plan: LTX-Video — native T2V, up to 60s. GPU: A10G"""
    import torch
    from diffusers import LTXPipeline
    from diffusers.utils import export_to_video
    import tempfile
    from pathlib import Path

    print(f"[{job_id}][PRO] LTX-Video | GPU: A10G")

    pipe = LTXPipeline.from_pretrained(
        "/models/ltx-video",
        torch_dtype=torch.bfloat16,
        local_files_only=True,
    ).to("cuda")
    pipe.enable_model_cpu_offload()

    frames = pipe(
        prompt=prompt,
        negative_prompt="worst quality, inconsistent motion, blurry, jittery, distorted",
        width=768,
        height=512,
        num_frames=241,
        num_inference_steps=50,
        guidance_scale=3.0,
    ).frames[0]

    with tempfile.TemporaryDirectory() as tmpdir:
        output_path = Path(tmpdir) / f"{job_id}.mp4"
        export_to_video(frames, str(output_path), fps=24)
        with open(output_path, "rb") as f:
            return f.read()


# ===========================================================================
# PREMIUM PLAN — Seedance 2.0 API
# ===========================================================================

@app.function(
    image=base_image,
    gpu=GPU_A10G,
    timeout=300,
    retries=2,
    secrets=[secrets],
)
def generate_premium(prompt: str, job_id: str):
    """Premium plan: Seedance 2.0 via API (15s)."""
    import httpx, time

    print(f"[{job_id}][PREMIUM] Seedance 2.0 API...")

    api_key = os.environ.get("SEEDANCE_API_KEY", "")
    api_url = os.environ.get("SEEDANCE_API_URL", "")

    if not api_key or not api_url:
        raise ValueError("SEEDANCE_API_KEY / SEEDANCE_API_URL not configured")

    with httpx.Client(timeout=240) as client:
        resp = client.post(
            f"{api_url}/v1/video/generate",
            headers={"Authorization": f"Bearer {api_key}"},
            json={"prompt": prompt, "duration": 15, "quality": "cinematic"},
        )
        resp.raise_for_status()
        task_id = resp.json()["task_id"]

        for _ in range(60):
            time.sleep(5)
            data = client.get(
                f"{api_url}/v1/video/{task_id}",
                headers={"Authorization": f"Bearer {api_key}"},
            ).json()
            if data["status"] == "completed":
                return client.get(data["video_url"]).content
            elif data["status"] == "failed":
                raise RuntimeError(f"Seedance failed: {data.get('error')}")

    raise TimeoutError("Seedance API timed out")


# ===========================================================================
# R2 Upload
# ===========================================================================

def upload_to_r2(video_bytes: bytes, job_id: str) -> str:
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
    return f"{public_url}/{key}"


# ===========================================================================
# Main orchestrator
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
    from supabase import create_client

    # Debug: verify env vars are present
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SERVICE_KEY")
    print(f"[{job_id}] SUPABASE_URL present: {bool(supabase_url)}")
    print(f"[{job_id}] SUPABASE_SERVICE_KEY present: {bool(supabase_key)}")

    if not supabase_url or not supabase_key:
        raise ValueError("Missing Supabase credentials in Modal secrets")

    supabase = create_client(supabase_url, supabase_key)

    def update_job(**kwargs):
        supabase.table("jobs").update(kwargs).eq("id", job_id).execute()

    try:
        update_job(status="processing", current_stage="generating_video")
        print(f"[{job_id}] Plan={plan} | {prompt[:60]}...")

        if plan == "free":
            video_bytes = generate_free.remote(prompt, job_id, max_duration=90)
        elif plan == "pro":
            video_bytes = generate_pro.remote(prompt, job_id)
        elif plan == "premium":
            video_bytes = generate_premium.remote(prompt, job_id)
        else:
            raise ValueError(f"Unknown plan: {plan}")

        update_job(current_stage="uploading")
        video_url = upload_to_r2(video_bytes, job_id)
        print(f"[{job_id}] Uploaded: {video_url}")

        update_job(
            status="done",
            current_stage="completed",
            video_url=video_url,
            output_url_final=video_url,
        )
        print(f"[{job_id}] ✅ Done!")
        return {"success": True, "job_id": job_id, "video_url": video_url}

    except Exception as e:
        print(f"[{job_id}] ❌ {e}")
        update_job(status="failed", current_stage="failed", error_message=str(e))
        raise


# ===========================================================================
# FastAPI webhook
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
        expected = os.environ.get("MODAL_WEBHOOK_SECRET")
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
        return {"status": "ok", "plans": ["free", "pro", "premium"], "gpu": "A10G"}

    return web


# ===========================================================================
# Local test entrypoint
# ===========================================================================

@app.local_entrypoint()
def test():
    result = generate_video_complete.remote(
        job_id="test-local-001",
        prompt="a cat walking in the rain",
        plan="free",
    )
    print(result)
