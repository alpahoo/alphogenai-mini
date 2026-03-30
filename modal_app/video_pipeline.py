"""
AlphoGenAI Mini — Modal Video Pipeline (v2)
Architecture multi-plan — 100% self-hosted, modèles locaux sur volume Modal :
  Free    : SDXL-Turbo (T2I) + Wan2.2-I2V-A14B + SVI 2.0 Pro LoRA (max 90s, A100)
  Pro     : LTX-Video (T2V natif, 60s, A10G)
  Premium : Seedance 2.0 API (15s, qualité cinématique, A10G)

Models are pre-downloaded to the Modal volume via setup_models.py.
No external API calls (HuggingFace, etc.) during inference.
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
        "diffusers==0.37.1",
        "transformers==4.51.3",
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
    .apt_install("ffmpeg")
)

webhook_image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install("fastapi", "pydantic", "supabase", "httpx", "boto3")
)

secrets = modal.Secret.from_name("alphogenai-secrets-corrected-v2")
models_volume = modal.Volume.from_name("alphogenai-models", create_if_missing=True)

# GPU configuration
GPU_A10G = "A10G"   # 24GB VRAM — Pro/Premium plans
GPU_A100 = "A100-80GB"  # 80GB VRAM — Free plan (Wan 14B MoE 27B params, full GPU without CPU offload)


# ===========================================================================
# LOCAL MODEL PATHS (pre-downloaded via setup_models.py)
# ===========================================================================

SDXL_TURBO_PATH = "/models/sdxl-turbo"
WAN_PATH        = "/models/wan2.2-i2v-a14b"
SVI_LORA_PATH   = "/models/svi-lora/SVI_v2_PRO_Wan2.2-I2V-A14B_HIGH_lora_rank_128_fp16.safetensors"
LTX_PATH        = "/models/ltx-video"


# ===========================================================================
# FREE PLAN — SDXL-Turbo (T2I) + Wan2.2-I2V-A14B + SVI 2.0 Pro LoRA
# ===========================================================================

@app.function(
    image=base_image,
    gpu=GPU_A100,
    timeout=900,
    retries=1,
    volumes={"/models": models_volume},
    secrets=[secrets],
)
def generate_free(prompt: str, job_id: str, max_duration: int = 90):
    """
    Free plan pipeline (100% local, no external calls):
    1. SDXL-Turbo             → initial image (T2I, 1-4 steps)
    2. Wan2.2-I2V-A14B + SVI  → iterative video segments (I2V)
    3. ffmpeg concat          → final MP4
    GPU: A100-80GB — Wan 14B MoE (27B total, ~54GB bf16) fully on GPU
    """
    import torch, gc, time
    import numpy as np
    from diffusers import AutoPipelineForText2Image, WanImageToVideoPipeline
    from diffusers.utils import export_to_video
    from PIL import Image
    import tempfile, subprocess, random
    from pathlib import Path

    print(f"[{job_id}][FREE] Starting — max {max_duration}s | GPU: A100-80GB")
    print(f"[{job_id}] CUDA: {torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'N/A'}")

    # ------------------------------------------------------------------
    # Step 1: SDXL-Turbo — text → initial image (local)
    # ------------------------------------------------------------------
    print(f"[{job_id}] Step 1/3 — SDXL-Turbo T2I (local)...")

    for attempt in range(3):
        try:
            t2i = AutoPipelineForText2Image.from_pretrained(
                SDXL_TURBO_PATH,
                torch_dtype=torch.float16,
                local_files_only=True,
            ).to("cuda")
            break
        except (RuntimeError, torch.cuda.OutOfMemoryError) as cuda_err:
            print(f"[{job_id}] SDXL-Turbo load attempt {attempt+1}/3 failed: {cuda_err}")
            gc.collect()
            torch.cuda.empty_cache()
            if attempt == 2:
                raise RuntimeError(f"Failed to load SDXL-Turbo after 3 attempts: {cuda_err}")
            time.sleep(2)

    image: Image.Image = t2i(
        prompt=prompt,
        num_inference_steps=4,
        guidance_scale=0.0,
        height=480,
        width=832,
    ).images[0]

    # Free SDXL-Turbo before loading Wan 14B
    del t2i
    gc.collect()
    torch.cuda.empty_cache()
    print(f"[{job_id}] Initial image ✓ ({image.size})")

    # Resize image to match Wan 14B expected dimensions
    max_area = 480 * 832
    aspect_ratio = image.height / image.width
    mod_value = 16  # vae_scale_factor * patch_size
    height = round(np.sqrt(max_area * aspect_ratio)) // mod_value * mod_value
    width = round(np.sqrt(max_area / aspect_ratio)) // mod_value * mod_value
    image = image.resize((width, height))
    print(f"[{job_id}] Image resized to {width}x{height}")

    # ------------------------------------------------------------------
    # Step 2: Wan2.2-I2V-A14B + SVI 2.0 Pro LoRA — iterative segments
    # ------------------------------------------------------------------
    print(f"[{job_id}] Step 2/3 — Loading Wan2.2-I2V-A14B + SVI LoRA (local)...")

    for attempt in range(3):
        try:
            pipe = WanImageToVideoPipeline.from_pretrained(
                WAN_PATH,
                torch_dtype=torch.bfloat16,
                local_files_only=True,
            ).to("cuda")
            # A100-80GB has enough VRAM for the full MoE model (27B params, ~54GB in bf16)
            print(f"[{job_id}] Wan 14B loaded on GPU ✓")
            break
        except torch.cuda.OutOfMemoryError as oom_err:
            print(f"[{job_id}] Wan 14B OOM attempt {attempt+1}/3, falling back to CPU offload: {oom_err}")
            gc.collect()
            torch.cuda.empty_cache()
            if attempt == 2:
                # Last resort: use CPU offload (slower but works)
                pipe = WanImageToVideoPipeline.from_pretrained(
                    WAN_PATH,
                    torch_dtype=torch.bfloat16,
                    local_files_only=True,
                )
                pipe.enable_model_cpu_offload()
                print(f"[{job_id}] Wan 14B loaded with CPU offload (fallback)")
            time.sleep(2)
        except RuntimeError as rt_err:
            print(f"[{job_id}] Wan 14B load attempt {attempt+1}/3 failed: {rt_err}")
            gc.collect()
            torch.cuda.empty_cache()
            if attempt == 2:
                raise
            time.sleep(2)

    # Load SVI 2.0 Pro LoRA (trained for Wan2.2-I2V-A14B)
    try:
        pipe.load_lora_weights(SVI_LORA_PATH)
        pipe.set_adapters(["default"], adapter_weights=[0.9])
        print(f"[{job_id}] SVI LoRA loaded ✓")
    except Exception as lora_err:
        print(f"[{job_id}] ⚠️ SVI LoRA loading failed, continuing without: {lora_err}")

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
            # Use same device as the pipeline (cuda if full GPU, cpu if offloaded)
            gen_device = "cuda" if next(pipe.transformer.parameters()).is_cuda else "cpu"
            generator = torch.Generator(device=gen_device).manual_seed(seed)
            print(f"[{job_id}] Segment {i+1}/{num_segments} (seed={seed})...")

            frames = pipe(
                image=current_image,
                prompt=prompt,
                negative_prompt="static, blurry, worst quality, distorted",
                height=height,
                width=width,
                num_frames=SEGMENT_FRAMES,
                guidance_scale=3.5,
                num_inference_steps=40,
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
        gc.collect()
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
    """Pro plan: LTX-Video — native T2V, up to 60s. GPU: A10G. Local only."""
    import torch
    from diffusers import LTXPipeline
    from diffusers.utils import export_to_video
    import tempfile
    from pathlib import Path

    print(f"[{job_id}][PRO] LTX-Video | GPU: A10G (local)")

    pipe = LTXPipeline.from_pretrained(
        LTX_PATH,
        torch_dtype=torch.bfloat16,
        local_files_only=True,
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

    r2_endpoint = os.environ.get("R2_ENDPOINT")
    r2_key_id = os.environ.get("R2_ACCESS_KEY_ID")
    r2_secret = os.environ.get("R2_SECRET_ACCESS_KEY")
    r2_bucket = os.environ.get("R2_BUCKET_NAME", "alphogenai-assets")

    if not all([r2_endpoint, r2_key_id, r2_secret]):
        raise RuntimeError(
            "R2 credentials missing in Modal secrets. "
            "Required: R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL. "
            "Add them to the 'alphogenai-secrets-corrected-v2' secret in Modal dashboard."
        )

    s3 = boto3.client(
        "s3",
        endpoint_url=r2_endpoint,
        aws_access_key_id=r2_key_id,
        aws_secret_access_key=r2_secret,
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )

    key = f"videos/{job_id}.mp4"
    s3.put_object(
        Bucket=r2_bucket,
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
        error_msg = str(e)[:500]  # Truncate to avoid Supabase 400 on long error messages
        print(f"[{job_id}] ❌ {e}")
        try:
            update_job(status="failed", current_stage="failed", error_message=error_msg)
        except Exception as update_err:
            print(f"[{job_id}] ⚠️ Failed to update job status: {update_err}")
        raise


# ===========================================================================
# FastAPI webhook
# ===========================================================================

@app.function(image=webhook_image, secrets=[secrets])
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
            await generate_video_complete.spawn.aio(req.job_id, req.prompt, req.plan, req.user_id)
        except Exception as e:
            # If spawn fails, mark job as failed
            print(f"[webhook] spawn() failed for {req.job_id}: {e}")
            try:
                _sb.table("jobs").update({
                    "status": "failed",
                    "current_stage": "failed",
                    "error_message": f"Failed to spawn pipeline: {str(e)[:400]}",
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

        # 3. Check R2 credentials
        r2_endpoint = os.environ.get("R2_ENDPOINT", "")
        r2_key = os.environ.get("R2_ACCESS_KEY_ID", "")
        r2_secret = os.environ.get("R2_SECRET_ACCESS_KEY", "")
        r2_bucket = os.environ.get("R2_BUCKET_NAME", "")
        r2_public = os.environ.get("R2_PUBLIC_URL", "")
        results["r2"] = {
            "R2_ENDPOINT": bool(r2_endpoint),
            "R2_ACCESS_KEY_ID": bool(r2_key),
            "R2_SECRET_ACCESS_KEY": bool(r2_secret),
            "R2_BUCKET_NAME": r2_bucket or "MISSING",
            "R2_PUBLIC_URL": r2_public[:40] + "..." if len(r2_public) > 40 else r2_public or "MISSING",
            "all_configured": all([r2_endpoint, r2_key, r2_secret, r2_bucket]),
        }

        # 4. Test R2 connectivity
        if results["r2"]["all_configured"]:
            try:
                import boto3
                from botocore.config import Config as BotoConfig
                s3 = boto3.client(
                    "s3",
                    endpoint_url=r2_endpoint,
                    aws_access_key_id=r2_key,
                    aws_secret_access_key=r2_secret,
                    config=BotoConfig(signature_version="s3v4"),
                    region_name="auto",
                )
                s3.head_bucket(Bucket=r2_bucket)
                results["r2_connection"] = {"connected": True}
            except Exception as e:
                results["r2_connection"] = {"connected": False, "error": str(e)[:300]}
        else:
            results["r2_connection"] = {"skipped": "credentials missing"}

        # 5. Test spawn capability
        try:
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
