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
        "torch==2.4.0",
        "torchvision",
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
    )
    .apt_install("ffmpeg", "git")
)

secrets = modal.Secret.from_name("alphogenai-secrets")
models_volume = modal.Volume.from_name("alphogenai-models", create_if_missing=True)

# All plans run on A10G (24GB VRAM)
GPU_A10G = "A10G"


# ===========================================================================
# FREE PLAN — FLUX.1-schnell (T2I) + Wan2.2-TI2V-5B + SVI 2.0 Pro LoRA
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
    2. Wan2.2-TI2V-5B + SVI 2.0 Pro LoRA → iterative video segments
    3. ffmpeg concat   → final MP4
    GPU: A10G (24GB) — Wan2.2 5B fits comfortably
    """
    import torch
    from diffusers import FluxPipeline, WanImageToVideoPipeline, AutoencoderKLWan
    from diffusers.utils import export_to_video
    from PIL import Image
    import tempfile, subprocess, random
    from pathlib import Path

    print(f"[{job_id}][FREE] Starting — max {max_duration}s | GPU: A10G")

    MODEL_DIR = "/models"
    FLUX_ID   = "black-forest-labs/FLUX.1-schnell"
    WAN_ID    = "Wan-AI/Wan2.2-TI2V-5B"           # 5B — fits on A10G
    SVI_LORA  = "Kijai/WanVideo_comfy"
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
        num_inference_steps=4,
        guidance_scale=0.0,
        height=480,
        width=832,
    ).images[0]

    del flux
    torch.cuda.empty_cache()
    print(f"[{job_id}] Initial image ✓")

    # ------------------------------------------------------------------
    # Step 2: Wan2.2-TI2V-5B + SVI 2.0 Pro LoRA — iterative segments
    # ------------------------------------------------------------------
    print(f"[{job_id}] Step 2/3 — Loading Wan2.2-TI2V-5B + SVI 2.0 Pro LoRA...")

    vae = AutoencoderKLWan.from_pretrained(
        WAN_ID, subfolder="vae", torch_dtype=torch.float32, cache_dir=MODEL_DIR
    )
    pipe = WanImageToVideoPipeline.from_pretrained(
        WAN_ID,
        vae=vae,
        torch_dtype=torch.bfloat16,
        cache_dir=MODEL_DIR,
    ).to("cuda")

    pipe.load_lora_weights(
        SVI_LORA,
        weight_name=SVI_LORA_PATH,
        cache_dir=MODEL_DIR,
    )
    pipe.set_adapters(["default"], adapter_weights=[0.9])

    SEGMENT_FRAMES   = 81       # ~5s at 16fps
    FPS              = 16
    segment_duration = SEGMENT_FRAMES / FPS
    num_segments     = max(1, min(int(max_duration / segment_duration), 18))

    print(f"[{job_id}] {num_segments} segments × {segment_duration:.1f}s ≈ {num_segments*segment_duration:.0f}s")

    segment_paths = []
    current_image = image

    with tempfile.TemporaryDirectory() as tmpdir:
        for i in range(num_segments):
            seed = random.randint(0, 2**32 - 1)   # Different seed per segment!
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

            # Last frame becomes first frame of next segment
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
# PRO PLAN — LTX-Video 13B (T2V natif, 60s, A10G)
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
    """Pro plan: LTX-Video 13B — native T2V, up to 60s. GPU: A10G"""
    import torch
    from diffusers import LTXPipeline
    from diffusers.utils import export_to_video
    import tempfile
    from pathlib import Path

    print(f"[{job_id}][PRO] LTX-Video 13B | GPU: A10G")

    pipe = LTXPipeline.from_pretrained(
        "Lightricks/LTX-Video",
        torch_dtype=torch.bfloat16,
        cache_dir="/models",
    ).to("cuda")
    pipe.enable_model_cpu_offload()

    frames = pipe(
        prompt=prompt,
        negative_prompt="worst quality, inconsistent motion, blurry, jittery, distorted",
        width=768,
        height=512,
        num_frames=241,         # ~60s at 4fps (LTX native)
        num_inference_steps=50,
        guidance_scale=3.0,
    ).frames[0]

    with tempfile.TemporaryDirectory() as tmpdir:
        output_path = Path(tmpdir) / f"{job_id}.mp4"
        export_to_video(frames, str(output_path), fps=24)
        with open(output_path, "rb") as f:
            return f.read()


# ===========================================================================
# PREMIUM PLAN — Seedance 2.0 API (15s, cinématique, A10G)
# ===========================================================================

@app.function(
    image=base_image,
    gpu=GPU_A10G,
    timeout=300,
    retries=2,
    secrets=[secrets],
)
def generate_premium(prompt: str, job_id: str):
    """Premium plan: Seedance 2.0 via API (15s). GPU: A10G"""
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
        print(f"[{job_id}] Seedance task: {task_id}")

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

@app.function(image=base_image, secrets=[secrets], timeout=1200, retries=1)
def generate_video_complete(
    job_id: str,
    prompt: str,
    plan: Plan = "free",
    user_id: Optional[str] = None,
):
    from supabase import create_client

    supabase_url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
    supabase_key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

    if not supabase_url or not supabase_key:
        raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_KEY (or their aliases) must be set in Modal secrets")

    supabase = create_client(supabase_url, supabase_key)

    def update_job(**kwargs):
        supabase.table("jobs").update(kwargs).eq("id", job_id).execute()

    try:
        update_job(status="in_progress", current_stage="generating_video")
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

        # Update job status immediately from webhook (don't rely on spawn)
        try:
            from supabase import create_client as _create_client
            _url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
            _key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
            if _url and _key:
                _sb = _create_client(_url, _key)
                _sb.table("jobs").update({
                    "status": "in_progress",
                    "current_stage": "spawning_pipeline",
                }).eq("id", req.job_id).execute()
        except Exception as e:
            print(f"[webhook] Failed to update job {req.job_id}: {e}")

        try:
            generate_video_complete.spawn(req.job_id, req.prompt, req.plan, req.user_id)
        except Exception as e:
            # If spawn fails, mark job as failed
            print(f"[webhook] spawn() failed for {req.job_id}: {e}")
            try:
                _sb.table("jobs").update({
                    "status": "failed",
                    "current_stage": "failed",
                    "error_message": f"Failed to spawn pipeline: {e}",
                }).eq("id", req.job_id).execute()
            except Exception:
                pass
            raise HTTPException(status_code=500, detail=f"Spawn failed: {e}")

        return {"success": True, "message": f"Pipeline started for job {req.job_id}", "plan": req.plan}

    @web.get("/health")
    async def health():
        return {"status": "ok", "plans": ["free", "pro", "premium"], "gpu": "A10G"}

    @web.get("/debug")
    async def debug():
        """Diagnostic endpoint — tests Supabase connectivity from inside Modal."""
        import traceback

        results = {}

        # 1. Check env vars
        supabase_url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
        supabase_key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
        results["env"] = {
            "SUPABASE_URL": bool(supabase_url),
            "SUPABASE_SERVICE_KEY": bool(supabase_key),
            "url_prefix": supabase_url[:30] + "..." if supabase_url else "MISSING",
            "key_prefix": supabase_key[:8] + "..." if supabase_key else "MISSING",
        }

        # 2. Test Supabase connection
        try:
            from supabase import create_client
            sb = create_client(supabase_url, supabase_key)
            count = sb.table("jobs").select("id", count="exact").limit(1).execute()
            results["supabase"] = {"connected": True, "jobs_count": count.count}
        except Exception as e:
            results["supabase"] = {"connected": False, "error": str(e), "trace": traceback.format_exc()[-500:]}

        # 3. Test spawn capability
        try:
            # Check if generate_video_complete is callable
            results["spawn"] = {"function_exists": hasattr(generate_video_complete, "spawn")}
        except Exception as e:
            results["spawn"] = {"error": str(e)}

        return results

    return web


@app.local_entrypoint()
def test():
    result = generate_video_complete.remote(
        job_id="test-001",
        prompt="A rocket launching into space at sunset",
        plan="free",
    )
    print(result)
