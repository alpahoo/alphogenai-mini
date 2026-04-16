"""
AlphoGenAI Mini — Modal Video Pipeline (v3 — simplified)

Single-clip pipeline: prompt → SDXL-Turbo (T2I) → Wan I2V (1 clip, 5s) → R2

Models pre-downloaded to Modal volume via setup_models.py.
No external API calls during inference.
"""
import modal
import os
from typing import Optional

app = modal.App("alphogenai-v2")

# ---------------------------------------------------------------------------
# Images
# ---------------------------------------------------------------------------
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
        "pillow",
        "numpy",
        "scipy",
        "ftfy",
        "supabase",
        "boto3",
        "httpx",
    )
    .apt_install("ffmpeg")
    .add_local_python_source("modal_app.engines")
    .add_local_python_source("modal_app.utils")
)

webhook_image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install("fastapi", "pydantic", "supabase", "httpx", "boto3")
)

# ---------------------------------------------------------------------------
# Infra
# ---------------------------------------------------------------------------
secrets = modal.Secret.from_name("alphogenai-secrets-corrected-v2")
models_volume = modal.Volume.from_name("alphogenai-models", create_if_missing=True)

GPU = "A100-80GB"

SDXL_TURBO_PATH = "/models/sdxl-turbo"
WAN_PATH        = "/models/wan2.2-i2v-a14b"
ENABLE_SVI_LORA = False  # disabled — stabilise pipeline first
SVI_LORA_PATH   = "/models/svi-lora/SVI_v2_PRO_Wan2.2-I2V-A14B_HIGH_lora_rank_128_fp16.safetensors"

# ---------------------------------------------------------------------------
# Pipeline params
# ---------------------------------------------------------------------------
NUM_FRAMES      = 81    # ~5s at 16 fps
FPS             = 16
NUM_STEPS       = 25    # higher quality (was 15 — fast but lower detail)
GUIDANCE_SCALE  = 3.5
IMG_HEIGHT      = 720
IMG_WIDTH       = 1280  # 720p (was 832×480)

# ---------------------------------------------------------------------------
# MVP scene limits (server-side hard cap — mirrors lib/storyboard.ts)
# ---------------------------------------------------------------------------
MAX_SCENES = {"free": 1, "pro": 3, "premium": 10}
ABSOLUTE_MAX_SCENES = 10  # never exceed, regardless of plan


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def log(job_id: str, msg: str):
    print(f"[job:{job_id}] {msg}")


def normalize_error(e: Exception) -> str:
    """Return a short, classifiable error tag + message."""
    msg = str(e)[:400]
    name = type(e).__name__
    if "timeout" in msg.lower() or isinstance(e, TimeoutError):
        return f"timeout: {msg}"
    if "OutOfMemoryError" in name or "CUDA" in msg:
        return f"gpu_oom: {msg}"
    if "FileNotFoundError" in name or "not found" in msg.lower():
        return f"model_load_failed: {msg}"
    if "R2" in msg or "S3" in msg or "boto" in msg.lower():
        return f"upload_failed: {msg}"
    if "ffmpeg" in msg.lower() or "encoding" in msg.lower():
        return f"encoding_failed: {msg}"
    return f"generation_failed: {msg}"


def get_supabase_client():
    from supabase import create_client
    url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        raise ValueError("SUPABASE_URL / SUPABASE_SERVICE_KEY missing in Modal secrets")
    return create_client(url, key)


def update_job(job_id: str, **fields):
    """Partial update of a job row. Logs every update."""
    try:
        sb = get_supabase_client()
        sb.table("jobs").update(fields).eq("id", job_id).execute()
        log(job_id, f"update_job → {fields}")
    except Exception as e:
        log(job_id, f"update_job FAILED: {e}")


def frames_to_mp4(frames, output_path: str, fps: int = FPS):
    """Convert numpy frames [0,1] float32 → H.264 MP4 via ffmpeg."""
    import numpy as np
    import subprocess
    import tempfile
    from pathlib import Path
    from PIL import Image

    tmpdir = Path(output_path).parent
    frame_dir = tmpdir / "frames"
    frame_dir.mkdir(exist_ok=True)

    for i, frame in enumerate(frames):
        if isinstance(frame, Image.Image):
            frame.save(frame_dir / f"{i:04d}.png")
        else:
            arr = frame
            if hasattr(arr, 'cpu'):
                arr = arr.cpu().numpy()
            if not isinstance(arr, np.ndarray):
                arr = np.array(arr)
            if arr.dtype != np.uint8:
                if arr.max() <= 1.0:
                    arr = (arr * 255).astype(np.uint8)
                else:
                    arr = np.clip(arr, 0, 255).astype(np.uint8)
            Image.fromarray(arr).save(frame_dir / f"{i:04d}.png")

    result = subprocess.run(
        [
            "ffmpeg", "-y",
            "-framerate", str(fps),
            "-i", str(frame_dir / "%04d.png"),
            "-c:v", "libx264", "-crf", "18", "-preset", "fast",
            "-pix_fmt", "yuv420p",
            str(output_path),
        ],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {result.stderr[-500:]}")


def upload_to_r2(
    file_bytes: bytes,
    job_id: str,
    suffix: str = "",
    content_type: str = "video/mp4",
    extension: str = "mp4",
) -> str:
    """Upload file bytes to R2. Supports video (mp4) and audio (mp3)."""
    import boto3
    from botocore.config import Config

    r2_endpoint = os.environ.get("R2_ENDPOINT")
    r2_key_id   = os.environ.get("R2_ACCESS_KEY_ID")
    r2_secret   = os.environ.get("R2_SECRET_ACCESS_KEY")
    r2_bucket   = os.environ.get("R2_BUCKET_NAME", "alphogenai-assets")

    if not all([r2_endpoint, r2_key_id, r2_secret]):
        raise RuntimeError("R2 credentials missing in Modal secrets")

    s3 = boto3.client(
        "s3",
        endpoint_url=r2_endpoint,
        aws_access_key_id=r2_key_id,
        aws_secret_access_key=r2_secret,
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )

    key = f"videos/{job_id}{suffix}.{extension}"
    s3.put_object(Bucket=r2_bucket, Key=key, Body=file_bytes, ContentType=content_type)

    public_url = os.environ.get("R2_PUBLIC_URL", "").rstrip("/")
    return f"{public_url}/{key}"


def update_scene(job_id: str, scene_index: int, **fields):
    """Update a single scene row in job_scenes."""
    try:
        sb = get_supabase_client()
        sb.table("job_scenes").update(fields).eq("job_id", job_id).eq("scene_index", scene_index).execute()
        log(job_id, f"update_scene[{scene_index}] → {fields}")
    except Exception as e:
        log(job_id, f"update_scene[{scene_index}] FAILED: {e}")


# ===========================================================================
# GPU function — single clip generation
# ===========================================================================

@app.function(
    image=base_image,
    gpu=GPU,
    timeout=1200,  # 20 min max
    retries=0,
    volumes={"/models": models_volume},
    secrets=[secrets],
)
def generate_clip(prompt: str, job_id: str, image_url: Optional[str] = None) -> bytes:
    """
    Single-clip pipeline:
      1. User image OR SDXL-Turbo → 1 image
      2. Wan2.2-I2V-A14B → 81 frames (~5s)
      3. ffmpeg → MP4 bytes

    If image_url is provided, skips T2I and downloads the user's image.
    """
    import torch
    import gc
    import numpy as np
    from diffusers import AutoPipelineForText2Image, WanImageToVideoPipeline
    from PIL import Image
    import tempfile
    from pathlib import Path

    log(job_id, f"generate_clip start | GPU={GPU} steps={NUM_STEPS}"
        f"{' | I2V mode (user image)' if image_url else ''}")

    # --- verify models ------------------------------------------------
    wan_needed = True
    t2i_needed = not image_url
    for name, path in [("SDXL-Turbo", SDXL_TURBO_PATH), ("Wan 14B", WAN_PATH)]:
        if name == "SDXL-Turbo" and not t2i_needed:
            continue
        if not Path(path).exists():
            vol = Path("/models")
            contents = [c.name for c in vol.iterdir()] if vol.exists() else []
            raise FileNotFoundError(f"{name} missing at {path}. Volume has: {contents}")
        log(job_id, f"{name} OK")

    # --- step 1: Get first frame image --------------------------------
    if image_url:
        # I2V mode: download user-uploaded image
        import httpx
        from io import BytesIO
        log(job_id, f"downloading user image: {image_url[:80]}")
        resp = httpx.get(image_url, timeout=30)
        resp.raise_for_status()
        image = Image.open(BytesIO(resp.content)).convert("RGB")
        log(job_id, f"user image loaded {image.size}")
    else:
        # T2I mode: generate image via SDXL-Turbo
        log(job_id, "loading SDXL-Turbo")
        t2i = AutoPipelineForText2Image.from_pretrained(
            SDXL_TURBO_PATH, torch_dtype=torch.float16, local_files_only=True,
        ).to("cuda")

        image = t2i(
            prompt=prompt, num_inference_steps=4, guidance_scale=0.0,
            height=IMG_HEIGHT, width=IMG_WIDTH,
        ).images[0]
        log(job_id, f"image generated {image.size}")

        del t2i; gc.collect(); torch.cuda.empty_cache()

    # resize for Wan (must be divisible by 16)
    max_area = IMG_HEIGHT * IMG_WIDTH
    ar = image.height / image.width
    h = round(np.sqrt(max_area * ar)) // 16 * 16
    w = round(np.sqrt(max_area / ar)) // 16 * 16
    image = image.resize((w, h))

    # --- step 2: Wan I2V (single clip) --------------------------------
    log(job_id, "loading Wan 14B")

    try:
        pipe = WanImageToVideoPipeline.from_pretrained(
            WAN_PATH, torch_dtype=torch.bfloat16, local_files_only=True,
        ).to("cuda")
        log(job_id, "Wan 14B on GPU")
    except torch.cuda.OutOfMemoryError:
        gc.collect(); torch.cuda.empty_cache()
        pipe = WanImageToVideoPipeline.from_pretrained(
            WAN_PATH, torch_dtype=torch.bfloat16, local_files_only=True,
        )
        pipe.enable_model_cpu_offload()
        log(job_id, "Wan 14B with CPU offload (fallback)")

    if ENABLE_SVI_LORA and Path(SVI_LORA_PATH).exists():
        try:
            pipe.load_lora_weights(SVI_LORA_PATH)
            pipe.set_adapters(["default"], adapter_weights=[0.9])
            log(job_id, "SVI LoRA loaded")
        except Exception as e:
            log(job_id, f"SVI LoRA skipped: {e}")

    gen_device = "cuda" if next(pipe.transformer.parameters()).is_cuda else "cpu"
    generator = torch.Generator(device=gen_device).manual_seed(42)

    log(job_id, f"inference {NUM_FRAMES} frames, {NUM_STEPS} steps, {w}x{h}")
    output = pipe(
        image=image,
        prompt=prompt,
        negative_prompt="static, blurry, worst quality, distorted",
        height=h, width=w,
        num_frames=NUM_FRAMES,
        guidance_scale=GUIDANCE_SCALE,
        num_inference_steps=NUM_STEPS,
        generator=generator,
        output_type="np",
    )
    frames = output.frames[0]
    log(job_id, f"got {len(frames)} frames")

    del pipe; gc.collect(); torch.cuda.empty_cache()

    # --- step 3: encode MP4 -------------------------------------------
    with tempfile.TemporaryDirectory() as tmpdir:
        mp4_path = str(Path(tmpdir) / f"{job_id}.mp4")
        frames_to_mp4(frames, mp4_path, fps=FPS)
        with open(mp4_path, "rb") as f:
            video_bytes = f.read()
        log(job_id, f"encoded {len(video_bytes)/1e6:.1f} MB")
        return video_bytes


# ===========================================================================
# Multi-scene generation (no GPU — just coordinates scene-by-scene)
# ===========================================================================

@app.function(
    image=base_image,
    secrets=[secrets],
    # Timeout rationale: each scene ≈ 8 min (3 min cold start + 5 min gen).
    # 5 scenes × 8 min = 40 min max.  Set to 50 min (3000s) for safety margin.
    timeout=3000,
    retries=0,
)
def generate_multi_scene(job_id: str, scenes: list, plan: str = "free", preferred_engine: Optional[str] = None, image_url: Optional[str] = None) -> list:
    """
    Generate clips for each scene in the storyboard sequentially.

    Each scene calls generate_clip.remote() (which runs on GPU),
    uploads to R2, and updates job_scenes status in Supabase.

    Partial failure policy (MVP):
        If scene N fails, already-uploaded clips for scenes 0..N-1 are
        intentionally KEPT on R2.  They are cheap to store (<50 MB each),
        useful for debugging, and can be reused by a future retry mechanism.
        The parent job is marked failed so the user sees a clear error.

    Returns dict with clip_urls list and any_fallback flag.
    """
    import time

    # Initialize engines in this container (separate from orchestrator).
    # Required for generate_with_fallback() to access WanEngine for fallback.
    from modal_app.engines import init_engines
    init_engines(generate_clip_fn=generate_clip.remote)

    total = len(scenes)

    # Server-side hard cap — never trust storyboard length from DB blindly
    if total > ABSOLUTE_MAX_SCENES:
        log(job_id, f"scene count {total} exceeds cap {ABSOLUTE_MAX_SCENES}, truncating")
        scenes = scenes[:ABSOLUTE_MAX_SCENES]
        total = ABSOLUTE_MAX_SCENES

    log(job_id, f"generate_multi_scene START: {total} scene(s)")
    clip_urls: list = []
    # Track if ANY scene used fallback — if so, job-level engine_used = "wan_i2v"
    any_fallback = False

    for scene in scenes:
        idx = scene["scene_index"]
        scene_prompt = scene["prompt"]
        t0 = time.monotonic()

        log(job_id, f"scene [{idx+1}/{total}] generating | prompt={scene_prompt[:60]}")
        update_scene(job_id, idx, status="in_progress")
        # Update parent job stage so frontend shows per-scene progress
        update_job(job_id, current_stage=f"generating_scene_{idx+1}")

        try:
            from modal_app.engines import select_engine, generate_with_fallback
            scene_dur = int(scene.get("duration_sec", 5))
            engine_key = select_engine(plan=plan, duration_seconds=scene_dur, preferred=preferred_engine)
            # Only first scene (idx=0) gets the user-uploaded image
            scene_image_url = image_url if idx == 0 else None
            video_bytes, actual_engine = generate_with_fallback(
                engine_key, prompt=scene_prompt,
                job_id=f"{job_id}_scene_{idx:02d}",
                duration_seconds=scene_dur,
                image_url=scene_image_url,
            )
            if actual_engine != engine_key:
                log(job_id, f"scene [{idx+1}/{total}] fallback: {engine_key} → {actual_engine}")
                any_fallback = True

            suffix = f"_scene_{idx:02d}"
            clip_url = upload_to_r2(video_bytes, job_id, suffix=suffix)
            elapsed = time.monotonic() - t0

            log(job_id, f"scene [{idx+1}/{total}] DONE in {elapsed:.0f}s | {len(video_bytes)/1e6:.1f} MB → {clip_url}")
            update_scene(job_id, idx, status="done", clip_url=clip_url)
            clip_urls.append(clip_url)

        except Exception as e:
            elapsed = time.monotonic() - t0
            error_msg = normalize_error(e)[:500]
            log(job_id, f"scene [{idx+1}/{total}] FAILED after {elapsed:.0f}s — {error_msg}")
            update_scene(job_id, idx, status="failed", error_message=error_msg)
            # Mark remaining scenes as skipped
            for remaining_scene in scenes[idx + 1:]:
                update_scene(job_id, remaining_scene["scene_index"], status="skipped")
            raise RuntimeError(f"Scene {idx} failed: {error_msg}") from e

    log(job_id, f"generate_multi_scene COMPLETE: {len(clip_urls)}/{total} clips"
         f"{' (fallback used)' if any_fallback else ''}")
    # Return clip URLs + fallback flag for job-level engine_used aggregation
    return {"clip_urls": clip_urls, "any_fallback": any_fallback}


@app.function(image=base_image, secrets=[secrets], timeout=600, retries=0)
def assemble_scenes(job_id: str, clip_urls: list) -> bytes:
    """
    Download scene clips and concatenate them into a single MP4 via ffmpeg.

    Runs on Modal (has ffmpeg via base_image). Returns final video bytes.
    """
    import tempfile
    import subprocess
    from pathlib import Path
    import httpx

    log(job_id, f"assemble_scenes: concatenating {len(clip_urls)} clips")

    with tempfile.TemporaryDirectory(prefix=f"assemble_{job_id}_") as tmpdir:
        tmppath = Path(tmpdir)
        clip_paths = []

        # Download each clip
        client = httpx.Client(timeout=120.0)
        for i, url in enumerate(clip_urls):
            log(job_id, f"downloading clip {i}")
            resp = client.get(url)
            resp.raise_for_status()
            clip_file = tmppath / f"clip_{i:02d}.mp4"
            clip_file.write_bytes(resp.content)
            clip_paths.append(clip_file)
        client.close()

        # Write concat list
        concat_file = tmppath / "concat.txt"
        with open(concat_file, "w") as f:
            for p in clip_paths:
                f.write(f"file '{p}'\n")

        # Concatenate
        output_path = tmppath / "final.mp4"
        result = subprocess.run(
            [
                "ffmpeg", "-y",
                "-f", "concat", "-safe", "0",
                "-i", str(concat_file),
                "-c", "copy",
                str(output_path),
            ],
            capture_output=True, text=True,
        )
        if result.returncode != 0:
            raise RuntimeError(f"ffmpeg concat failed: {result.stderr[-500:]}")

        video_bytes = output_path.read_bytes()
        log(job_id, f"assemble_scenes: final {len(video_bytes)/1e6:.1f} MB")
        return video_bytes


# ---------------------------------------------------------------------------
# Audio generation (AudioLDM2 on A10G — for Wan only, Seedance has native audio)
# ---------------------------------------------------------------------------
audio_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install(
        "torch==2.2.0",
        "torchaudio==2.2.0",
        "diffusers>=0.27.0",
        "transformers>=4.38.0",
        "scipy",
        "accelerate",
    )
)


@app.function(image=audio_image, gpu="A10G", secrets=[secrets], timeout=300, retries=0)
def generate_audio(prompt: str, duration_seconds: int = 5) -> bytes:
    """Generate audio from text prompt using AudioLDM2. Returns MP3 bytes."""
    import torch
    import torchaudio
    import subprocess
    import tempfile
    from pathlib import Path
    from diffusers import AudioLDM2Pipeline

    duration = max(2, min(30, duration_seconds))
    print(f"[audio] generating {duration}s audio for: {prompt[:60]}")

    pipe = AudioLDM2Pipeline.from_pretrained(
        "cvssp/audioldm2",
        torch_dtype=torch.float16,
    ).to("cuda")

    audio = pipe(
        prompt=prompt,
        audio_length_in_s=duration,
        num_inference_steps=50,
        guidance_scale=3.5,
    ).audios[0]

    sample_rate = 16000
    print(f"[audio] generated {len(audio)} samples at {sample_rate}Hz")

    with tempfile.TemporaryDirectory() as tmpdir:
        wav_path = Path(tmpdir) / "audio.wav"
        mp3_path = Path(tmpdir) / "audio.mp3"

        audio_tensor = torch.tensor(audio).unsqueeze(0)
        torchaudio.save(str(wav_path), audio_tensor, sample_rate)

        subprocess.run(
            ["ffmpeg", "-y", "-i", str(wav_path),
             "-codec:a", "libmp3lame", "-b:a", "192k", str(mp3_path)],
            capture_output=True, check=True,
        )
        mp3_bytes = mp3_path.read_bytes()

    print(f"[audio] encoded MP3: {len(mp3_bytes) / 1024:.1f} KB")
    return mp3_bytes


@app.function(image=base_image, secrets=[secrets], timeout=120, retries=0)
def mux_audio(video_bytes: bytes, audio_bytes: bytes) -> bytes:
    """Combine video + audio into a single MP4 using ffmpeg."""
    import subprocess
    import tempfile
    from pathlib import Path

    with tempfile.TemporaryDirectory() as tmpdir:
        video_path = Path(tmpdir) / "video.mp4"
        audio_path = Path(tmpdir) / "audio.mp3"
        output_path = Path(tmpdir) / "output.mp4"

        video_path.write_bytes(video_bytes)
        audio_path.write_bytes(audio_bytes)

        result = subprocess.run(
            [
                "ffmpeg", "-y",
                "-i", str(video_path),
                "-i", str(audio_path),
                "-c:v", "copy",
                "-c:a", "aac", "-b:a", "192k",
                "-shortest",
                str(output_path),
            ],
            capture_output=True, text=True,
        )
        if result.returncode != 0:
            raise RuntimeError(f"ffmpeg mux failed: {result.stderr[-300:]}")

        muxed = output_path.read_bytes()
        print(f"[mux_audio] {len(video_bytes)/1e6:.1f}MB video + {len(audio_bytes)/1e3:.0f}KB audio → {len(muxed)/1e6:.1f}MB")
        return muxed


@app.function(image=base_image, secrets=[secrets], timeout=120, retries=0)
def add_watermark(video_bytes: bytes) -> bytes:
    """Overlay 'AlphoGenAI' watermark on video (free plan only). Uses ffmpeg drawtext."""
    import subprocess
    import tempfile
    from pathlib import Path

    with tempfile.TemporaryDirectory() as tmpdir:
        input_path = Path(tmpdir) / "input.mp4"
        output_path = Path(tmpdir) / "output.mp4"
        input_path.write_bytes(video_bytes)

        # Bottom-right watermark with semi-transparent background
        # Font: DejaVu Sans is bundled with ffmpeg in debian
        drawtext = (
            "drawtext="
            "text='AlphoGenAI':"
            "fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:"
            "fontsize=24:"
            "fontcolor=white@0.85:"
            "box=1:boxcolor=black@0.4:boxborderw=8:"
            "x=w-tw-20:y=h-th-20"
        )

        result = subprocess.run(
            [
                "ffmpeg", "-y",
                "-i", str(input_path),
                "-vf", drawtext,
                "-c:v", "libx264", "-preset", "fast", "-crf", "23",
                "-c:a", "copy",
                str(output_path),
            ],
            capture_output=True, text=True,
        )
        if result.returncode != 0:
            print(f"[watermark] ffmpeg failed: {result.stderr[-300:]}")
            # Non-fatal: return original video if watermark fails
            return video_bytes

        watermarked = output_path.read_bytes()
        print(f"[watermark] applied → {len(watermarked)/1e6:.1f}MB")
        return watermarked


# ===========================================================================
# Orchestrator (no GPU — just coordinates)
# ===========================================================================

@app.function(
    image=base_image,
    secrets=[secrets],
    # Timeout rationale: must outlive generate_multi_scene (3000s) + assemble (600s)
    # + upload overhead.  Set to 3900s (~65 min).
    timeout=3900,
    retries=0,
)
def generate_video_complete(
    job_id: str,
    prompt: str,
    user_id: Optional[str] = None,
    preferred_engine: Optional[str] = None,
    image_url: Optional[str] = None,
):
    import traceback
    from modal_app.engines import init_engines
    init_engines(generate_clip_fn=generate_clip.remote)

    log(job_id, f"orchestrator start | prompt={prompt[:60]}"
        f"{f' | preferred={preferred_engine}' if preferred_engine else ''}")

    try:
        # Fetch job to read storyboard — scene_count is ALWAYS derived
        # server-side from DB, never from client webhook payload.
        sb = get_supabase_client()
        job_row = sb.table("jobs").select("storyboard, target_duration_seconds, plan").eq("id", job_id).single().execute()
        storyboard = (job_row.data or {}).get("storyboard") or []
        plan = (job_row.data or {}).get("plan", "free")

        # Server-side hard cap (defense in depth)
        plan_cap = MAX_SCENES.get(plan, 1)
        if len(storyboard) > plan_cap:
            log(job_id, f"storyboard has {len(storyboard)} scenes but plan '{plan}' allows {plan_cap}, truncating")
            storyboard = storyboard[:plan_cap]

        # ------------------------------------------------------------------
        # Route: single-scene → original pipeline (unchanged)
        # ------------------------------------------------------------------
        if len(storyboard) <= 1:
            log(job_id, "single-scene path (v3 compat)")
            # status already "in_progress" from webhook — only update stage
            update_job(job_id, status="in_progress", current_stage="generating_scene_1")

            from modal_app.engines import select_engine, generate_with_fallback
            clip_dur = int(storyboard[0]["duration_sec"]) if storyboard else 5
            engine_key = select_engine(plan=plan, duration_seconds=clip_dur, preferred=preferred_engine)
            log(job_id, f"engine selected: {engine_key}")

            # Cost tracking (before generation — recorded even on failure)
            try:
                from modal_app.utils.costs import estimate_cost
                estimated_cost = round(estimate_cost(engine_key, clip_dur), 4)
                log(job_id, f"cost estimated: {engine_key} → ${estimated_cost:.4f}")
                update_job(job_id, engine_used=engine_key, estimated_cost_usd=estimated_cost)
            except Exception as e:
                log(job_id, f"cost tracking skipped: {e}")

            video_bytes, actual_engine = generate_with_fallback(
                engine_key, prompt=prompt, job_id=job_id, duration_seconds=clip_dur,
                image_url=image_url,
            )
            if actual_engine != engine_key:
                log(job_id, f"fallback triggered: {engine_key} → {actual_engine}")
                update_job(job_id, engine_used=actual_engine)
                try:
                    from modal_app.utils.costs import estimate_cost
                    fallback_cost = round(estimate_cost(actual_engine, clip_dur), 4)
                    update_job(job_id, estimated_cost_usd=fallback_cost)
                except Exception:
                    pass

            update_job(job_id, current_stage="encoding")

            # Apply watermark for free plan users only
            if plan == "free":
                log(job_id, "applying watermark (free plan)...")
                try:
                    video_bytes = add_watermark.remote(video_bytes)
                except Exception as e:
                    log(job_id, f"watermark skipped: {e}")

            update_job(job_id, current_stage="uploading")
            video_url = upload_to_r2(video_bytes, job_id)
            log(job_id, f"uploaded → {video_url}")

            # Also mark the single scene as done (if it exists)
            if storyboard:
                update_scene(job_id, 0, status="done", clip_url=video_url)

            # Audio generation for Wan (Seedance already has audio in MP4)
            final_url = video_url
            if actual_engine == "wan_i2v":
                try:
                    update_job(job_id, current_stage="generating_audio")
                    log(job_id, "generating audio via AudioLDM2...")
                    # generate_audio is defined in this file (above)
                    audio_bytes = generate_audio.remote(prompt, clip_dur)
                    audio_url = upload_to_r2(
                        audio_bytes, job_id,
                        suffix="_audio", content_type="audio/mpeg", extension="mp3",
                    )
                    log(job_id, f"audio uploaded → {audio_url}")

                    update_job(job_id, current_stage="muxing_audio")
                    muxed_bytes = mux_audio.remote(video_bytes, audio_bytes)
                    final_url = upload_to_r2(muxed_bytes, job_id, suffix="_final")
                    log(job_id, f"muxed video+audio → {final_url}")
                    update_job(job_id, audio_url=audio_url)
                except Exception as e:
                    log(job_id, f"audio generation skipped (non-blocking): {e}")
                    # Video is already uploaded — proceed without audio

            update_job(
                job_id,
                status="done",
                current_stage="completed",
                video_url=video_url,
                output_url_final=final_url,
            )
            log(job_id, "DONE (single-scene)")
            return {"success": True, "video_url": final_url}

        # ------------------------------------------------------------------
        # Route: multi-scene → generate each scene, then assemble
        # ------------------------------------------------------------------
        log(job_id, f"multi-scene path: {len(storyboard)} scenes")
        # status already "in_progress" from webhook — only update stage
        update_job(job_id, status="in_progress", current_stage="generating_scene_1")

        # Total duration needed for cost recalculation on fallback
        total_dur = sum(int(s.get("duration_sec", 5)) for s in storyboard)

        # Cost tracking (before generation — recorded even on failure)
        try:
            from modal_app.engines import select_engine as _sel
            from modal_app.utils.costs import estimate_cost
            ms_engine_key = _sel(plan=plan, duration_seconds=int(storyboard[0].get("duration_sec", 5)), preferred=preferred_engine)
            estimated_cost = round(estimate_cost(ms_engine_key, total_dur), 4)
            log(job_id, f"cost estimated: {ms_engine_key} × {len(storyboard)} scenes → ${estimated_cost:.4f}")
            update_job(job_id, engine_used=ms_engine_key, estimated_cost_usd=estimated_cost)
        except Exception as e:
            log(job_id, f"cost tracking skipped: {e}")

        # Step 1: generate all scene clips
        ms_result = generate_multi_scene.remote(job_id, storyboard, plan, preferred_engine, image_url)
        clip_urls = ms_result["clip_urls"]
        ms_any_fallback = ms_result["any_fallback"]

        # Multi-scene engine_used rule:
        # If ANY scene used fallback → job-level engine_used = "wan_i2v"
        # This ensures the cost displayed reflects the actual engine used.
        if ms_any_fallback:
            log(job_id, "multi-scene fallback detected → engine_used = wan_i2v")
            try:
                from modal_app.utils.costs import estimate_cost
                fallback_cost = round(estimate_cost("wan_i2v", total_dur), 4)
                update_job(job_id, engine_used="wan_i2v", estimated_cost_usd=fallback_cost)
            except Exception:
                update_job(job_id, engine_used="wan_i2v")

        # Step 2: assemble into final video
        update_job(job_id, current_stage="encoding")
        final_bytes = assemble_scenes.remote(job_id, clip_urls)

        # Apply watermark for free plan users only
        if plan == "free":
            log(job_id, "applying watermark (free plan)...")
            try:
                final_bytes = add_watermark.remote(final_bytes)
            except Exception as e:
                log(job_id, f"watermark skipped: {e}")

        # Step 3: upload final assembled video
        update_job(job_id, current_stage="uploading")
        video_url = upload_to_r2(final_bytes, job_id, suffix="_final")
        log(job_id, f"final uploaded → {video_url}")

        # Step 4: Audio for Wan multi-scene (Seedance has audio embedded)
        final_url = video_url
        actual_ms_engine = "wan_i2v" if ms_any_fallback else ms_engine_key
        if actual_ms_engine == "wan_i2v":
            try:
                update_job(job_id, current_stage="generating_audio")
                log(job_id, "generating audio via AudioLDM2...")
                from modal_app.audio_generator import generate_audio
                audio_bytes = generate_audio.remote(prompt, total_dur)
                audio_url = upload_to_r2(
                    audio_bytes, job_id,
                    suffix="_audio", content_type="audio/mpeg", extension="mp3",
                )
                log(job_id, f"audio uploaded → {audio_url}")

                update_job(job_id, current_stage="muxing_audio")
                muxed_bytes = mux_audio.remote(final_bytes, audio_bytes)
                final_url = upload_to_r2(muxed_bytes, job_id, suffix="_with_audio")
                log(job_id, f"muxed video+audio → {final_url}")
                update_job(job_id, audio_url=audio_url)
            except Exception as e:
                log(job_id, f"audio generation skipped (non-blocking): {e}")

        update_job(
            job_id,
            status="done",
            current_stage="completed",
            video_url=video_url,
            output_url_final=final_url,
        )
        log(job_id, f"DONE (multi-scene, {len(clip_urls)} clips)")
        return {"success": True, "video_url": video_url}

    except Exception as e:
        tb = traceback.format_exc()
        log(job_id, f"FAILED:\n{tb}")
        error_msg = normalize_error(e)
        update_job(job_id, status="failed", current_stage="failed", error_message=error_msg[:500])
        raise


# ===========================================================================
# Webhook (FastAPI)
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
        plan: str = "free"
        user_id: Optional[str] = None
        scene_count: int = 1
        preferred_engine: Optional[str] = None
        image_url: Optional[str] = None  # I2V: user-uploaded first frame

    @web.post("/webhook")
    async def trigger(req: JobRequest, x_webhook_secret: str = Header(None)):
        expected = os.environ.get("MODAL_WEBHOOK_SECRET")
        if expected and x_webhook_secret != expected:
            raise HTTPException(status_code=401, detail="Unauthorized")

        # Immediate status update
        try:
            sb = get_supabase_client()
            sb.table("jobs").update({
                "status": "in_progress",
                "current_stage": "spawning_pipeline",
            }).eq("id", req.job_id).execute()
        except Exception as e:
            print(f"[webhook] status update failed: {e}")

        try:
            await generate_video_complete.spawn.aio(
                req.job_id, req.prompt, req.user_id, req.preferred_engine, req.image_url
            )
        except Exception as e:
            print(f"[webhook] spawn failed: {e}")
            try:
                sb.table("jobs").update({
                    "status": "failed",
                    "current_stage": "failed",
                    "error_message": normalize_error(e)[:500],
                }).eq("id", req.job_id).execute()
            except Exception:
                pass
            raise HTTPException(status_code=500, detail=str(e)[:200])

        return {"success": True, "job_id": req.job_id}

    @web.get("/health")
    async def health():
        return {"status": "ok", "gpu": GPU, "steps": NUM_STEPS, "frames": NUM_FRAMES}

    @web.get("/debug")
    async def debug():
        import traceback
        results = {}

        url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
        key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
        results["env"] = {"SUPABASE_URL": bool(url), "SUPABASE_SERVICE_KEY": bool(key)}

        try:
            sb = get_supabase_client()
            count = sb.table("jobs").select("id", count="exact").limit(1).execute()
            results["supabase"] = {"connected": True, "jobs_count": count.count}
        except Exception as e:
            results["supabase"] = {"connected": False, "error": str(e)[:300]}

        r2_ok = all([
            os.environ.get("R2_ENDPOINT"),
            os.environ.get("R2_ACCESS_KEY_ID"),
            os.environ.get("R2_SECRET_ACCESS_KEY"),
        ])
        results["r2"] = {"all_configured": r2_ok}

        if r2_ok:
            try:
                import boto3
                from botocore.config import Config as BC
                s3 = boto3.client("s3",
                    endpoint_url=os.environ["R2_ENDPOINT"],
                    aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
                    aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
                    config=BC(signature_version="s3v4"), region_name="auto",
                )
                s3.head_bucket(Bucket=os.environ.get("R2_BUCKET_NAME", "alphogenai-assets"))
                results["r2_connection"] = {"connected": True}
            except Exception as e:
                results["r2_connection"] = {"connected": False, "error": str(e)[:200]}

        return results

    return web


# ===========================================================================
# Volume diagnostic
# ===========================================================================

@app.function(image=base_image, volumes={"/models": models_volume}, timeout=60)
def check_volume():
    from pathlib import Path
    import json

    results = {}
    vol = Path("/models")
    if not vol.exists():
        return {"error": "/models not mounted"}

    for item in sorted(vol.iterdir()):
        if item.is_dir():
            total = sum(f.stat().st_size for f in item.rglob("*") if f.is_file())
            results[item.name] = {"size_gb": round(total / 1e9, 2)}
        elif item.is_file():
            results[item.name] = {"size_mb": round(item.stat().st_size / 1e6, 1)}

    expected = {
        "sdxl-turbo": SDXL_TURBO_PATH,
        "wan2.2-i2v-a14b": WAN_PATH,
    }
    results["_checks"] = {n: Path(p).exists() for n, p in expected.items()}
    print(json.dumps(results, indent=2))
    return results


@app.local_entrypoint()
def test():
    result = generate_video_complete.remote("test-001", "A rocket launching into space at sunset")
    print(result)
