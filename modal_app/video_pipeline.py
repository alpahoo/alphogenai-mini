"""
AlphoGenAI Mini â€” Modal Video Pipeline (v3 â€” simplified)

Single-clip pipeline: prompt â†’ SDXL-Turbo (T2I) â†’ Wan I2V (1 clip, 5s) â†’ R2

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
        "sentry-sdk",
        "cryptography",
    )
    .apt_install("ffmpeg")
    .add_local_python_source("modal_app.engines")
    .add_local_python_source("modal_app.utils")
)

webhook_image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install("fastapi", "pydantic", "supabase", "httpx", "boto3", "sentry-sdk", "cryptography")
)

# LTX-2.3 â€” SDK officiel Lightricks (ltx-core + ltx-pipelines), checkpoint FP8.
# Deps validÃ©es dans modal_app/ltx_video.py (app de test isolÃ©e). Image dÃ©diÃ©e
# Ã  cette seule fonction : torch 2.7 n'impacte pas base_image (Wan reste 2.5.1).
ltx23_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git", "ffmpeg", "libsndfile1")
    .pip_install(
        "torch==2.7.0",
        "torchvision",
        "torchaudio==2.7.0",
        "git+https://github.com/Lightricks/LTX-2.git#subdirectory=packages/ltx-core",
        "git+https://github.com/Lightricks/LTX-2.git#subdirectory=packages/ltx-pipelines",
        "transformers>=4.44.0",
        "accelerate>=0.33.0",
        "sentencepiece",
        "pillow",
        "soundfile",
        "scipy",
        "numpy",
        "huggingface_hub",
        "requests",
        "einops",
        "omegaconf",
        "boto3",
        "supabase",
        "httpx",
    )
)

overlay_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "fonts-dejavu-core")
    .pip_install("pillow", "httpx", "boto3", "supabase", "sentry-sdk", "cryptography")
)

# Explainer renderer (code-based slides + Kokoro voice) â€” CPU only, no GPU.
# Mirrors infra/explainer-renderer/Dockerfile: Node 22 (HyperFrames) + chromium
# + ffmpeg + python/kokoro-onnx + the model baked in. Renderer scripts (build.js,
# tts_kokoro.py) are mounted from infra/explainer-renderer/.
explainer_image = (
    modal.Image.from_registry("node:22-bookworm-slim", add_python="3.11")
    .apt_install(
        "ffmpeg", "chromium", "espeak-ng", "curl", "ca-certificates",
        "fonts-liberation", "fonts-noto-color-emoji",
        "libnss3", "libatk1.0-0", "libatk-bridge2.0-0", "libcups2", "libdrm2",
        "libxkbcommon0", "libxcomposite1", "libxdamage1", "libxfixes3",
        "libxrandr2", "libgbm1", "libasound2", "libpango-1.0-0", "libcairo2",
    )
    .pip_install("kokoro-onnx", "soundfile", "supabase", "boto3", "sentry-sdk", "cryptography")
    .run_commands(
        "mkdir -p /models",
        "curl -fsSL -o /models/kokoro-v1.0.onnx https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx",
        "curl -fsSL -o /models/voices-v1.0.bin https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin",
        "npx --yes hyperframes@0.6.110 --help >/dev/null 2>&1 || true",
    )
    .env({
        "PUPPETEER_EXECUTABLE_PATH": "/usr/bin/chromium",
        "PUPPETEER_SKIP_DOWNLOAD": "1",
        "KOKORO_MODEL_DIR": "/models",
    })
    .add_local_file("infra/explainer-renderer/build.js", "/app/build.js", copy=True)
    .add_local_file("infra/explainer-renderer/tts_kokoro.py", "/app/tts_kokoro.py", copy=True)
)

# ---------------------------------------------------------------------------
# Infra
# ---------------------------------------------------------------------------
secrets = modal.Secret.from_name("alphogenai-secrets-corrected-v2")
models_volume = modal.Volume.from_name("alphogenai-models", create_if_missing=True)
# Volume partagÃ© avec l'app de test ltx_video.py â€” contient dÃ©jÃ  le checkpoint FP8
# + Gemma (tÃ©lÃ©chargÃ©s et validÃ©s). MontÃ© Ã  /cache pour generate_clip_ltx23.
hf_volume = modal.Volume.from_name("huggingface-cache", create_if_missing=True)

GPU = "A100-80GB"

SDXL_TURBO_PATH = "/models/sdxl-turbo"
WAN_PATH        = "/models/wan2.2-i2v-a14b"
ENABLE_SVI_LORA = False  # disabled â€” stabilise pipeline first
SVI_LORA_PATH   = "/models/svi-lora/SVI_v2_PRO_Wan2.2-I2V-A14B_HIGH_lora_rank_128_fp16.safetensors"
# LTX-2.3 FP8 (SDK officiel) â€” exige H100 (FP8 e4m3 scaled_mm = Hopper/Ada only).
LTX23_FP8       = "/cache/ltx23-base/ltx-2.3-22b-distilled-fp8.safetensors"
LTX23_GEMMA     = "/cache/ltx23-distilled"

# ---------------------------------------------------------------------------
# Pipeline params
# ---------------------------------------------------------------------------
NUM_FRAMES      = 81    # ~5s at 16 fps
FPS             = 16
NUM_STEPS       = 20    # balanced quality/speed (was 25 â€” too slow on cold starts)
GUIDANCE_SCALE  = 3.5
IMG_HEIGHT      = 720
IMG_WIDTH       = 1280  # 720p (was 832Ã—480)

# ---------------------------------------------------------------------------
# MVP scene limits (server-side hard cap â€” mirrors lib/storyboard.ts)
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
        log(job_id, f"update_job â†’ {fields}")
    except Exception as e:
        log(job_id, f"update_job FAILED: {e}")


def frames_to_mp4(frames, output_path: str, fps: int = FPS):
    """Convert numpy frames [0,1] float32 â†’ H.264 MP4 via ffmpeg."""
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
        log(job_id, f"update_scene[{scene_index}] â†’ {fields}")
    except Exception as e:
        log(job_id, f"update_scene[{scene_index}] FAILED: {e}")


# ===========================================================================
# GPU function â€” single clip generation
# ===========================================================================

@app.function(
    image=base_image,
    gpu=GPU,
    timeout=1800,  # 30 min max (cold start + 14B model load + inference)
    retries=0,
    volumes={"/models": models_volume},
    secrets=[secrets],
)
def generate_clip(prompt: str, job_id: str, image_url: Optional[str] = None) -> bytes:
    """
    Single-clip pipeline:
      1. User image OR SDXL-Turbo â†’ 1 image
      2. Wan2.2-I2V-A14B â†’ 81 frames (~5s)
      3. ffmpeg â†’ MP4 bytes

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
# Multi-scene generation (no GPU â€” just coordinates scene-by-scene)
# ===========================================================================

def _safe_overlay_text(value, max_len: int = 220) -> str:
    if not isinstance(value, str):
        return ""
    text = " ".join(value.replace("\n", " ").split()).strip()
    return text[:max_len].strip()


def _wrap_overlay_text(draw, text: str, font, max_width: int, max_lines: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        bbox = draw.textbbox((0, 0), candidate, font=font)
        if bbox[2] - bbox[0] <= max_width or not current:
            current = candidate
            continue
        lines.append(current)
        current = word
        if len(lines) >= max_lines:
            break
    if current and len(lines) < max_lines:
        lines.append(current)
    if len(lines) == max_lines and len(words) > len(" ".join(lines).split()):
        lines[-1] = lines[-1].rstrip(" .") + "..."
    return lines[:max_lines]


def _probe_video(path: str) -> tuple[int, int, float]:
    import subprocess

    dim = subprocess.run(
        [
            "ffprobe", "-v", "error", "-select_streams", "v:0",
            "-show_entries", "stream=width,height",
            "-of", "csv=s=x:p=0", path,
        ],
        capture_output=True, text=True,
    )
    width, height = 1280, 720
    if "x" in dim.stdout:
        try:
            width, height = map(int, dim.stdout.strip().split("x")[:2])
        except Exception:
            width, height = 1280, 720

    dur = subprocess.run(
        [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", path,
        ],
        capture_output=True, text=True,
    )
    try:
        duration = float(dur.stdout.strip())
    except Exception:
        duration = 0.0
    return width, height, max(duration, 0.1)


def _render_overlay_png(path: str, width: int, height: int, element: dict, safe_area: int):
    from PIL import Image, ImageDraw, ImageFont

    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    font_regular = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
    font_bold = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

    kind = element.get("kind")
    position = element.get("position")
    text = _safe_overlay_text(element.get("text"), 220)
    subtext = _safe_overlay_text(element.get("subtext"), 180)
    if not text:
        image.save(path)
        return

    title_font = ImageFont.truetype(font_bold, max(24, int(height * 0.045)))
    body_font = ImageFont.truetype(font_regular, max(18, int(height * 0.03)))
    small_font = ImageFont.truetype(font_bold, max(16, int(height * 0.024)))

    if kind == "caption":
        max_w = int(width * 0.78)
        lines = _wrap_overlay_text(draw, text, body_font, max_w, 3)
        line_h = int(height * 0.043)
        box_w = max(draw.textbbox((0, 0), line, font=body_font)[2] for line in lines) + 44
        box_h = len(lines) * line_h + 30
        x = (width - box_w) // 2
        y = height - safe_area - box_h
        draw.rounded_rectangle((x, y, x + box_w, y + box_h), radius=18, fill=(0, 0, 0, 150))
        for idx, line in enumerate(lines):
            draw.text((x + 22, y + 15 + idx * line_h), line, fill=(255, 255, 255, 238), font=body_font)
    elif kind == "source_card":
        max_w = int(width * 0.42)
        lines = _wrap_overlay_text(draw, text, small_font, max_w, 2)
        line_h = int(height * 0.034)
        box_w = max([draw.textbbox((0, 0), line, font=small_font)[2] for line in lines] + [100]) + 36
        box_h = 34 + len(lines) * line_h + 22
        x = safe_area
        y = safe_area
        draw.rounded_rectangle((x, y, x + box_w, y + box_h), radius=18, fill=(0, 0, 0, 130))
        draw.text((x + 18, y + 14), "SOURCE", fill=(170, 190, 255, 230), font=small_font)
        for idx, line in enumerate(lines):
            draw.text((x + 18, y + 42 + idx * line_h), line, fill=(255, 255, 255, 235), font=small_font)
    else:
        max_w = int(width * 0.62)
        title_lines = _wrap_overlay_text(draw, text, title_font, max_w, 2)
        sub_lines = _wrap_overlay_text(draw, subtext, body_font, max_w, 2) if subtext else []
        line_h = int(height * 0.058)
        sub_h = int(height * 0.04)
        box_w = max(
            [draw.textbbox((0, 0), line, font=title_font)[2] for line in title_lines]
            + [draw.textbbox((0, 0), line, font=body_font)[2] for line in sub_lines]
            + [240]
        ) + 56
        box_h = len(title_lines) * line_h + len(sub_lines) * sub_h + 42
        if position == "top":
            x, y = safe_area, safe_area
        elif position == "center":
            x, y = (width - box_w) // 2, (height - box_h) // 2
        else:
            x, y = safe_area, height - safe_area - box_h
        draw.rounded_rectangle((x, y, x + box_w, y + box_h), radius=20, fill=(0, 0, 0, 145))
        cursor = y + 20
        for line in title_lines:
            draw.text((x + 28, cursor), line, fill=(255, 255, 255, 245), font=title_font)
            cursor += line_h
        for line in sub_lines:
            draw.text((x + 28, cursor), line, fill=(230, 230, 230, 225), font=body_font)
            cursor += sub_h

    image.save(path)


def _render_brand_png(path: str, width: int, height: int, brand: dict, safe_area: int):
    from PIL import Image, ImageDraw, ImageFont

    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    watermark = _safe_overlay_text(brand.get("watermark_text"), 60)
    if watermark:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", max(18, int(height * 0.03)))
        bbox = draw.textbbox((0, 0), watermark, font=font)
        opacity = brand.get("logo_opacity") if isinstance(brand.get("logo_opacity"), (int, float)) else 0.55
        alpha = max(45, min(180, int(255 * float(opacity) * 0.55)))
        x = width - safe_area - (bbox[2] - bbox[0])
        y = safe_area
        draw.text((x, y), watermark, fill=(255, 255, 255, alpha), font=font)
    image.save(path)


@app.function(image=overlay_image, secrets=[secrets], timeout=600, retries=0)
def apply_overlays_to_video(video_url: str, job_id: str, overlay_plan: dict) -> str:
    """Burn deterministic text/brand overlays onto a completed video and upload a copy."""
    import subprocess
    import tempfile
    from pathlib import Path
    import httpx

    if not isinstance(overlay_plan, dict) or not overlay_plan.get("enabled"):
        return video_url

    print(f"[overlay] job={job_id} downloading source video...")
    with httpx.Client(timeout=90) as client:
        resp = client.get(video_url)
        resp.raise_for_status()

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        input_path = tmp / "input.mp4"
        output_path = tmp / "overlay.mp4"
        input_path.write_bytes(resp.content)

        width, height, duration = _probe_video(str(input_path))
        safe_pct = overlay_plan.get("safe_area_pct")
        safe_area = int(min(width, height) * ((safe_pct if isinstance(safe_pct, (int, float)) else 5) / 100))
        print(f"[overlay] source {width}x{height}, {duration:.2f}s, safe={safe_area}px")

        overlays: list[tuple[Path, float, float]] = []
        brand = overlay_plan.get("brand") if isinstance(overlay_plan.get("brand"), dict) else {}
        brand_path = tmp / "brand.png"
        _render_brand_png(str(brand_path), width, height, brand, safe_area)
        overlays.append((brand_path, 0.0, duration))

        elements = overlay_plan.get("elements") if isinstance(overlay_plan.get("elements"), list) else []
        for idx, element in enumerate(elements[:80]):
            if not isinstance(element, dict):
                continue
            start = element.get("start_sec")
            end = element.get("end_sec")
            start_sec = float(start) if isinstance(start, (int, float)) else 0.0
            end_sec = float(end) if isinstance(end, (int, float)) else min(duration, start_sec + 4.0)
            if end_sec <= start_sec or start_sec >= duration:
                continue
            png_path = tmp / f"overlay_{idx:03d}.png"
            _render_overlay_png(str(png_path), width, height, element, safe_area)
            overlays.append((png_path, max(0.0, start_sec), min(duration, end_sec)))

        if not overlays:
            return video_url

        cmd = ["ffmpeg", "-y", "-i", str(input_path)]
        for png_path, _, _ in overlays:
            cmd += ["-loop", "1", "-i", str(png_path)]

        current = "[0:v]"
        filter_parts = []
        for idx, (_, start, end) in enumerate(overlays, start=1):
            out = f"[v{idx}]"
            filter_parts.append(
                f"{current}[{idx}:v]overlay=0:0:enable='between(t,{start:.3f},{end:.3f})'{out}"
            )
            current = out

        cmd += [
            "-filter_complex", ";".join(filter_parts),
            "-map", current,
            "-map", "0:a?",
            "-c:v", "libx264", "-preset", "fast", "-crf", "20",
            "-pix_fmt", "yuv420p",
            "-c:a", "copy",
            "-movflags", "+faststart",
            "-shortest",
            str(output_path),
        ]

        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise RuntimeError(f"ffmpeg overlay failed: {result.stderr[-500:]}")

        output_url = upload_to_r2(output_path.read_bytes(), job_id, suffix="_overlay")
        print(f"[overlay] job={job_id} uploaded {output_url}")
        return output_url


@app.function(
    image=base_image,
    secrets=[secrets],
    # Timeout rationale: each scene â‰ˆ 12 min (cold start + gen).
    # 10 scenes Ã— 12 min = 120 min.  Set to 150 min (9000s) for safety margin.
    timeout=9000,
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
    init_engines(
        generate_clip_fn=generate_clip.remote,
        generate_clip_ltx23_fn=generate_clip_ltx23.remote,
    )

    total = len(scenes)

    # Server-side hard cap â€” never trust storyboard length from DB blindly
    if total > ABSOLUTE_MAX_SCENES:
        log(job_id, f"scene count {total} exceeds cap {ABSOLUTE_MAX_SCENES}, truncating")
        scenes = scenes[:ABSOLUTE_MAX_SCENES]
        total = ABSOLUTE_MAX_SCENES

    log(job_id, f"generate_multi_scene START: {total} scene(s)")
    clip_urls: list = []
    # Track if ANY scene used fallback â€” if so, job-level engine_used = "wan_i2v"
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
            ms_sb = get_supabase_client()
            engine_key = select_engine(
                plan=plan, duration_seconds=scene_dur, preferred=preferred_engine,
                supabase_client=ms_sb,
            )
            # Only first scene (idx=0) gets the user-uploaded image
            scene_image_url = image_url if idx == 0 else None
            video_bytes, actual_engine = generate_with_fallback(
                engine_key, prompt=scene_prompt,
                job_id=f"{job_id}_scene_{idx:02d}",
                duration_seconds=scene_dur,
                image_url=scene_image_url,
                supabase_client=ms_sb,
            )
            if actual_engine != engine_key:
                log(job_id, f"scene [{idx+1}/{total}] fallback: {engine_key} â†’ {actual_engine}")
                any_fallback = True

            suffix = f"_scene_{idx:02d}"
            clip_url = upload_to_r2(video_bytes, job_id, suffix=suffix)
            elapsed = time.monotonic() - t0

            log(job_id, f"scene [{idx+1}/{total}] DONE in {elapsed:.0f}s | {len(video_bytes)/1e6:.1f} MB â†’ {clip_url}")
            update_scene(job_id, idx, status="done", clip_url=clip_url)
            clip_urls.append(clip_url)

        except Exception as e:
            elapsed = time.monotonic() - t0
            error_msg = normalize_error(e)[:500]
            log(job_id, f"scene [{idx+1}/{total}] FAILED after {elapsed:.0f}s â€” {error_msg}")
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


# ===========================================================================
# Scene chaining helpers (EvoLink multi-scene continuity via first_frame)
# ===========================================================================

@app.function(image=base_image, secrets=[secrets], timeout=180, retries=0)
def extract_last_frame(job_id: str, scene_index: int, video_url: str) -> str:
    """
    Download `video_url`, extract the last frame as JPEG via ffmpeg, upload to R2.
    Writes the R2 URL back to job_scenes[scene_index].last_frame_url.

    Used by the multi-scene EvoLink chaining path: the extracted frame is fed
    as `first_frame_url` into the next scene so characters / composition stay
    visually continuous across cuts.
    """
    import subprocess
    import tempfile
    from pathlib import Path
    import httpx

    log(job_id, f"extract_last_frame scene={scene_index} url={video_url[:80]}")

    with tempfile.TemporaryDirectory(prefix=f"lastframe_{job_id}_") as tmpdir:
        tmppath = Path(tmpdir)
        video_path = tmppath / "input.mp4"
        frame_path = tmppath / "last.jpg"

        # Download video
        with httpx.Client(timeout=120.0, follow_redirects=True) as client:
            resp = client.get(video_url)
            resp.raise_for_status()
            video_path.write_bytes(resp.content)
        log(job_id, f"extract_last_frame downloaded {len(resp.content)/1e6:.1f} MB")

        # Probe duration so we seek just before EOF (a plain -sseof 0 sometimes
        # lands on a black frame in AV1/H.265 streams; seeking to duration-100ms
        # gives a clean I-frame snapshot in practice).
        try:
            probe = subprocess.run(
                ["ffprobe", "-v", "error",
                 "-show_entries", "format=duration",
                 "-of", "default=noprint_wrappers=1:nokey=1",
                 str(video_path)],
                capture_output=True, text=True, check=True,
            )
            duration = float(probe.stdout.strip())
            seek = max(0.0, duration - 0.1)
        except Exception as e:
            log(job_id, f"ffprobe failed ({e}); falling back to -sseof")
            seek = None

        if seek is not None:
            cmd = ["ffmpeg", "-y", "-ss", f"{seek:.3f}", "-i", str(video_path),
                   "-frames:v", "1", "-q:v", "2", str(frame_path)]
        else:
            cmd = ["ffmpeg", "-y", "-sseof", "-0.2", "-i", str(video_path),
                   "-frames:v", "1", "-q:v", "2", str(frame_path)]

        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0 or not frame_path.exists():
            raise RuntimeError(f"ffmpeg extract failed: {result.stderr[-300:]}")

        frame_bytes = frame_path.read_bytes()
        log(job_id, f"extract_last_frame frame={len(frame_bytes)/1024:.0f} KB")

    # Upload JPEG to R2 under frames/ prefix
    import boto3
    from botocore.config import Config

    r2_endpoint = os.environ.get("R2_ENDPOINT")
    r2_key_id   = os.environ.get("R2_ACCESS_KEY_ID")
    r2_secret   = os.environ.get("R2_SECRET_ACCESS_KEY")
    r2_bucket   = os.environ.get("R2_BUCKET_NAME", "alphogenai-assets")
    if not all([r2_endpoint, r2_key_id, r2_secret]):
        raise RuntimeError("R2 credentials missing")

    s3 = boto3.client(
        "s3", endpoint_url=r2_endpoint,
        aws_access_key_id=r2_key_id, aws_secret_access_key=r2_secret,
        config=Config(signature_version="s3v4"), region_name="auto",
    )
    key = f"frames/{job_id}_scene_{scene_index:02d}_last.jpg"
    s3.put_object(Bucket=r2_bucket, Key=key, Body=frame_bytes, ContentType="image/jpeg")

    public_url = os.environ.get("R2_PUBLIC_URL", "").rstrip("/")
    frame_url = f"{public_url}/{key}"
    log(job_id, f"extract_last_frame â†’ {frame_url}")

    # Persist so the Next.js poller can fire the next EvoLink scene with it
    update_scene(job_id, scene_index, last_frame_url=frame_url)
    return frame_url


def _probe_video_duration(video_bytes: bytes) -> float:
    """Get video duration in seconds using ffprobe."""
    import subprocess
    import tempfile
    from pathlib import Path

    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
        f.write(video_bytes)
        f.flush()
        probe = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", f.name],
            capture_output=True, text=True,
        )
        import os
        os.unlink(f.name)
    return float(probe.stdout.strip())


def _is_musicgen_enabled() -> bool:
    """Check if MusicGen provider is enabled via admin toggle."""
    try:
        sb = get_supabase_client()
        result = sb.table("app_settings").select("value").eq("key", "providers").single().execute()
        if result.data and result.data.get("value"):
            providers = result.data["value"]
            return providers.get("musicgen", {}).get("enabled", True)
    except Exception:
        pass
    return True  # default enabled if DB read fails


def _derive_music_prompt(job_prompt: str, audio_prompt: str | None, audio_mode: str) -> str:
    """Build ACE-Step caption from job context.

    ACE-Step works best with tag-style descriptions: genre, mood,
    instrumentation keywords rather than natural language sentences.
    """
    if audio_mode == "custom" and audio_prompt:
        return audio_prompt[:500]

    # Auto mode: build tag-style caption from video prompt keywords
    prompt_lower = job_prompt.lower()

    # Detect mood from video prompt
    mood_map = {
        "epic": "epic, powerful, grandiose",
        "dramatic": "dramatic, intense, cinematic",
        "action": "energetic, fast tempo, intense, driving",
        "calm": "calm, peaceful, serene, gentle",
        "nature": "ambient, atmospheric, nature, peaceful",
        "sad": "melancholic, emotional, slow, reflective",
        "happy": "uplifting, bright, cheerful, warm",
        "horror": "dark, suspenseful, eerie, tension",
        "romantic": "romantic, warm, soft, emotional",
        "sci-fi": "electronic, futuristic, synth, atmospheric",
        "technology": "modern, electronic, minimal, clean",
        "corporate": "corporate, professional, upbeat, motivational",
        "travel": "adventurous, inspiring, world music, uplifting",
        "food": "light, acoustic, warm, pleasant",
    }

    detected_tags = []
    for keyword, tags in mood_map.items():
        if keyword in prompt_lower:
            detected_tags.append(tags)

    if detected_tags:
        tag_str = ", ".join(detected_tags[:3])
    else:
        tag_str = "cinematic, ambient, atmospheric, gentle"

    return f"instrumental, background music, {tag_str}, no vocals"


@app.function(image=base_image, secrets=[secrets], timeout=900, retries=0)
def concat_and_finalize(job_id: str) -> str:
    """
    Concatenate every done scene of `job_id` (ordered by scene_index) into a
    single MP4, optionally generate background music with MusicGen, upload
    to R2, and mark the job as done.

    Reads clip_urls directly from Supabase job_scenes â€” no client payload
    trusted.  If only one scene is done we short-circuit (but still add
    music if requested).
    """
    import traceback

    try:
        sb = get_supabase_client()
        res = sb.table("job_scenes") \
            .select("scene_index, clip_url, status") \
            .eq("job_id", job_id) \
            .order("scene_index") \
            .execute()
        rows = res.data or []
        clip_urls = [r["clip_url"] for r in rows
                     if r.get("status") == "done" and r.get("clip_url")]

        if not clip_urls:
            raise RuntimeError(f"no done scenes for job {job_id}")

        log(job_id, f"concat_and_finalize: {len(clip_urls)} clip(s)")

        # Read job metadata for plan + audio settings
        job_row = sb.table("jobs") \
            .select("plan, prompt, audio_mode, audio_prompt") \
            .eq("id", job_id).single().execute()
        job_data = job_row.data or {}
        plan = job_data.get("plan", "free")
        audio_mode = job_data.get("audio_mode", "auto")
        audio_prompt = job_data.get("audio_prompt")
        job_prompt = job_data.get("prompt", "")

        if len(clip_urls) == 1:
            # Single scene: download bytes for potential music mux
            import httpx
            with httpx.Client(timeout=120) as client:
                resp = client.get(clip_urls[0])
                resp.raise_for_status()
            final_bytes = resp.content
            log(job_id, f"single scene downloaded: {len(final_bytes)/1e6:.1f}MB")
        else:
            update_job(job_id, current_stage="encoding")
            final_bytes = assemble_scenes.remote(job_id, clip_urls)

        # Watermark for free plan
        if plan == "free":
            try:
                final_bytes = add_watermark.remote(final_bytes)
            except Exception as e:
                log(job_id, f"watermark skipped: {e}")

        # â”€â”€ Background music generation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        music_url = None
        if audio_mode != "none" and _is_musicgen_enabled():
            try:
                update_job(job_id, current_stage="generating_music")

                # Probe video duration
                video_duration = _probe_video_duration(final_bytes)
                duration_int = max(2, int(video_duration))
                log(job_id, f"video duration: {video_duration:.1f}s â†’ generating {duration_int}s music")

                # Build music prompt
                music_prompt = _derive_music_prompt(job_prompt, audio_prompt, audio_mode)
                log(job_id, f"music prompt: {music_prompt[:80]}")

                # Generate music via MusicGen on A10G
                music_bytes = generate_music.remote(music_prompt, duration_int)
                log(job_id, f"music generated: {len(music_bytes)/1024:.1f}KB")

                # Upload music to R2
                music_url = upload_to_r2(music_bytes, job_id, suffix="_music", content_type="audio/mpeg", extension="mp3")
                log(job_id, f"music uploaded â†’ {music_url}")

                # Update audio_url on job
                from datetime import datetime, timezone
                sb.table("jobs").update({
                    "audio_url": music_url,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }).eq("id", job_id).execute()

                # Mux music into video at 30% volume
                update_job(job_id, current_stage="encoding")
                final_bytes = mux_audio.remote(final_bytes, music_bytes, music_volume=0.3)
                log(job_id, f"music muxed into video: {len(final_bytes)/1e6:.1f}MB")

            except Exception as e:
                log(job_id, f"music generation skipped (non-blocking): {e}")
                # Continue without music â€” video is still valid
        else:
            log(job_id, f"music skipped: audio_mode={audio_mode}, musicgen_enabled={_is_musicgen_enabled()}")

        # â”€â”€ Upload final video â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        update_job(job_id, current_stage="uploading")
        final_url = upload_to_r2(final_bytes, job_id, suffix="_final")
        log(job_id, f"concat_and_finalize uploaded â†’ {final_url}")

        update_job(
            job_id,
            status="done",
            current_stage="completed",
            video_url=final_url,
            output_url_final=final_url,
        )
        return final_url
    except Exception as e:
        tb = traceback.format_exc()
        log(job_id, f"concat_and_finalize FAILED:\n{tb}")
        update_job(
            job_id, status="failed", current_stage="failed",
            error_message=f"concat_failed: {str(e)[:400]}",
        )
        _report_sentry(e, job_id=job_id, stage="concat")
        raise


@app.function(image=base_image, secrets=[secrets], timeout=300, retries=0)
def apply_voiceover_to_job(job_id: str) -> str:
    """Mux a cloned-voice track into a Story Video's final video (voice-over).

    Reads jobs.video_url + jobs.avatar_final.audio_url server-side, replaces the
    clip's native audio with the voice track, uploads, and marks the job done.
    The voice URL is never trusted from the client â€” it is read from the DB.
    """
    import traceback
    import httpx

    try:
        sb = get_supabase_client()
        job_row = sb.table("jobs") \
            .select("video_url, output_url_final, avatar_final") \
            .eq("id", job_id).single().execute()
        job_data = job_row.data or {}
        af = job_data.get("avatar_final") or {}
        video_url = job_data.get("video_url") or job_data.get("output_url_final")
        audio_url = af.get("audio_url")

        if not video_url or not audio_url:
            raise RuntimeError(
                f"apply_voiceover: missing video_url={bool(video_url)} audio_url={bool(audio_url)}"
            )

        log(job_id, f"apply_voiceover: downloading video + voice track")
        with httpx.Client(timeout=120, follow_redirects=True) as client:
            v = client.get(video_url); v.raise_for_status()
            a = client.get(audio_url); a.raise_for_status()
        video_bytes = v.content
        audio_bytes = a.content

        # Replace native audio with the cloned voice (full volume).
        muxed = mux_audio.remote(video_bytes, audio_bytes, music_volume=1.0)

        final_url = upload_to_r2(muxed, job_id, suffix="_voiceover")
        log(job_id, f"apply_voiceover uploaded â†’ {final_url}")

        update_job(
            job_id,
            status="done",
            current_stage="completed",
            video_url=final_url,
            output_url_final=final_url,
            avatar_final={**af, "stage": "done"},
        )
        return final_url
    except Exception as e:
        tb = traceback.format_exc()
        log(job_id, f"apply_voiceover FAILED:\n{tb}")
        # Fallback: keep the existing video (voice not burned in) so the job
        # still completes rather than hanging.
        try:
            sb = get_supabase_client()
            jr = sb.table("jobs").select("video_url, avatar_final").eq("id", job_id).single().execute()
            jd = jr.data or {}
            af = jd.get("avatar_final") or {}
            vu = jd.get("video_url")
            update_job(
                job_id,
                status="done",
                current_stage="completed",
                **({"video_url": vu, "output_url_final": vu} if vu else {}),
                avatar_final={**af, "stage": "done"},
            )
        except Exception:
            pass
        _report_sentry(e, job_id=job_id, stage="voiceover")
        raise


@app.function(image=overlay_image, secrets=[secrets], timeout=600, retries=0)
def apply_research_voiceover_to_video(job_id: str) -> str:
    """Mux a Research Story's TTS voice-over into its final video (T-1113).

    Reads jobs.video_url (raw base) + jobs.voiceover_url server-side â€” neither is
    trusted from the client. Ducks the clip's native audio and mixes the voice on
    top, uploads a `_voiced` copy, and RETURNS the URL. The SaaS route writes it
    to jobs.output_url_final while keeping video_url raw, so a failure here never
    destroys the original (the route falls back to the raw video).
    """
    import subprocess
    import tempfile
    from pathlib import Path
    import httpx

    sb = get_supabase_client()
    job_row = sb.table("jobs") \
        .select("video_url, voiceover_url") \
        .eq("id", job_id).single().execute()
    job_data = job_row.data or {}
    video_url = job_data.get("video_url")
    voiceover_url = job_data.get("voiceover_url")
    if not video_url or not voiceover_url:
        raise RuntimeError(
            f"apply_research_voiceover: missing video_url={bool(video_url)} "
            f"voiceover_url={bool(voiceover_url)}"
        )

    print(f"[research_voiceover] job={job_id} downloading video + voice...")
    with httpx.Client(timeout=120, follow_redirects=True) as client:
        v = client.get(video_url); v.raise_for_status()
        a = client.get(voiceover_url); a.raise_for_status()

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        video_path = tmp / "input.mp4"
        voice_path = tmp / "voice.mp3"
        output_path = tmp / "voiced.mp4"
        video_path.write_bytes(v.content)
        voice_path.write_bytes(a.content)

        # Log file sizes for diagnostics
        video_size = len(v.content) / 1e6
        audio_size = len(a.content) / 1e6
        print(f"[research_voiceover] Downloaded: video={video_size:.1f}MB, voice={audio_size:.1f}MB")

        # Probe both files to confirm they're readable
        for label, fpath in [("video", video_path), ("voice", voice_path)]:
            probe_cmd = ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(fpath)]
            probe_result = subprocess.run(probe_cmd, capture_output=True, text=True)
            duration = probe_result.stdout.strip()
            print(f"[research_voiceover] {label} duration: {duration}s (probe returncode={probe_result.returncode})")

        # Mux the voice-over as the audio track.
        mux_cmd = [
            "ffmpeg", "-y",
            "-i", str(video_path),
            "-i", str(voice_path),
            "-map", "0:v", "-map", "1:a",
            "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
            "-movflags", "+faststart",
            str(output_path),
        ]
        print(f"[research_voiceover] Running ffmpeg: {' '.join(mux_cmd)}")
        result = subprocess.run(mux_cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise RuntimeError(f"ffmpeg voiceover mux failed (code={result.returncode}): {result.stderr[-800:]}")

        output_url = upload_to_r2(output_path.read_bytes(), job_id, suffix="_voiced")
        print(f"[research_voiceover] job={job_id} uploaded {output_url}")
        return output_url


# ---------------------------------------------------------------------------
# Audio generation (AudioLDM2 on A10G â€” for Wan only, Seedance has native audio)
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


# ---------------------------------------------------------------------------
# Music generation (ACE-Step 1.5 on A10G â€” background music for videos)
# ---------------------------------------------------------------------------
acestep_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git", "ffmpeg", "build-essential")
    .run_commands(
        "git clone --branch v0.1.6 --depth 1 https://github.com/ace-step/ACE-Step-1.5.git /opt/ace-step",
        # ACE-Step pins torch/torchaudio 2.10.0+cu128 â€” install from PyTorch index
        "pip install torch==2.10.0+cu128 torchaudio==2.10.0+cu128 --index-url https://download.pytorch.org/whl/cu128",
        # nano-vllm is bundled in third_parts/
        "pip install /opt/ace-step/acestep/third_parts/nano-vllm",
        # Install ACE-Step â€” use PyTorch index for any remaining +cu128 deps
        "pip install /opt/ace-step --extra-index-url https://download.pytorch.org/whl/cu128",
    )
)

acestep_volume = modal.Volume.from_name("acestep-models", create_if_missing=True)


@app.function(
    image=acestep_image,
    gpu="A10G",
    secrets=[secrets],
    timeout=600,
    retries=0,
    volumes={"/opt/ace-step/checkpoints": acestep_volume},
)
def generate_music(prompt: str, duration_seconds: int = 30) -> bytes:
    """Generate background music using ACE-Step 1.5 (2B Turbo). Returns MP3 bytes.

    Uses tag-style captions for genre/mood/instrumentation control.
    Generates full tracks up to 600s in a single pass â€” no stitching needed.
    Output: 48kHz MP3 at 192kbps.
    """
    import subprocess
    import tempfile
    from pathlib import Path

    duration = max(10, min(600, duration_seconds))  # ACE-Step: 10-600s
    print(f"[ace-step] generating {duration}s music for: {prompt[:80]}")

    # Initialize DiT handler (2B Turbo â€” 8 inference steps, fast)
    from acestep.handler import AceStepHandler
    dit_handler = AceStepHandler()
    init_status, enable_generate = dit_handler.initialize_service(
        project_root="/opt/ace-step",
        config_path="acestep-v15-turbo",
        device="cuda",
    )
    print(f"[ace-step] DiT initialized: {init_status}")

    # Initialize LM handler (1.7B â€” good quality, fits comfortably on A10G)
    from acestep.llm_inference import LLMHandler
    llm_handler = LLMHandler()
    lm_status, lm_success = llm_handler.initialize(
        checkpoint_dir="/opt/ace-step/checkpoints",
        lm_model_path="acestep-5Hz-lm-1.7B",
        backend="vllm",
        device="cuda",
    )
    print(f"[ace-step] LM initialized: {lm_status}, success={lm_success}")

    # Generate instrumental track
    from acestep.inference import GenerationParams, GenerationConfig, generate_music as ace_generate

    params = GenerationParams(
        caption=prompt[:512],
        lyrics="[Instrumental]",
        instrumental=True,
        duration=float(duration),
        inference_steps=8,        # turbo: 8 steps
        guidance_scale=7.0,
        thinking=True,            # LM chain-of-thought for better tags
        seed=-1,                  # random seed
    )

    config = GenerationConfig(
        batch_size=1,
        audio_format="wav",
        seeds=[-1],
        use_random_seed=True,
    )

    result = ace_generate(
        dit_handler=dit_handler,
        llm_handler=llm_handler,
        params=params,
        config=config,
        save_dir="/tmp/ace-output",
    )

    if not result.success:
        raise RuntimeError(f"ACE-Step generation failed: {result.error}")

    # Read the generated WAV and convert to MP3
    audio_info = result.audios[0]
    wav_path = Path(audio_info["path"])
    print(f"[ace-step] generated: {wav_path} (sr={audio_info['sample_rate']})")

    with tempfile.TemporaryDirectory() as tmpdir:
        mp3_path = Path(tmpdir) / "music.mp3"

        # Apply 2s fade-out at end, then encode to MP3
        fade_start = max(0, duration - 2)
        subprocess.run(
            ["ffmpeg", "-y", "-i", str(wav_path),
             "-af", f"afade=t=out:st={fade_start}:d=2",
             "-codec:a", "libmp3lame", "-b:a", "192k", str(mp3_path)],
            capture_output=True, check=True,
        )
        mp3_bytes = mp3_path.read_bytes()

    # Clean up WAV
    wav_path.unlink(missing_ok=True)

    print(f"[ace-step] encoded MP3: {len(mp3_bytes) / 1024:.1f} KB ({duration}s)")
    return mp3_bytes


@app.function(image=base_image, secrets=[secrets], timeout=120, retries=0)
def mux_audio(video_bytes: bytes, audio_bytes: bytes, music_volume: float = 1.0) -> bytes:
    """Combine video + audio into a single MP4 using ffmpeg.

    Args:
        video_bytes: Raw MP4 video bytes.
        audio_bytes: Raw MP3/WAV audio bytes.
        music_volume: Volume level for the audio track (0.0â€“1.0).
                      1.0 = full volume, 0.3 = background music level.
    """
    import subprocess
    import tempfile
    from pathlib import Path

    with tempfile.TemporaryDirectory() as tmpdir:
        video_path = Path(tmpdir) / "video.mp4"
        audio_path = Path(tmpdir) / "audio.mp3"
        output_path = Path(tmpdir) / "output.mp4"

        video_path.write_bytes(video_bytes)
        audio_path.write_bytes(audio_bytes)

        if music_volume < 1.0:
            # Apply volume attenuation for background music
            result = subprocess.run(
                [
                    "ffmpeg", "-y",
                    "-i", str(video_path),
                    "-i", str(audio_path),
                    "-filter_complex",
                    f"[1:a]volume={music_volume}[a]",
                    "-map", "0:v",
                    "-map", "[a]",
                    "-c:v", "copy",
                    "-c:a", "aac", "-b:a", "192k",
                    "-shortest",
                    str(output_path),
                ],
                capture_output=True, text=True,
            )
        else:
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
        print(f"[mux_audio] {len(video_bytes)/1e6:.1f}MB video + {len(audio_bytes)/1e3:.0f}KB audio (vol={music_volume}) â†’ {len(muxed)/1e6:.1f}MB")
        return muxed


@app.function(image=base_image, secrets=[secrets], timeout=300, retries=0)
def export_social_formats(video_url: str, job_id: str) -> dict:
    """Re-encode video into TikTok (9:16), Instagram (1:1), and YouTube (16:9) formats.

    Downloads the original, runs ffmpeg crop/pad, uploads each to R2.
    Returns dict of { tiktok: url, instagram: url, youtube: url }.
    """
    import subprocess
    import tempfile
    from pathlib import Path
    import httpx

    print(f"[social] job={job_id} downloading source video...")
    with httpx.Client(timeout=60) as client:
        resp = client.get(video_url)
        resp.raise_for_status()
    video_bytes = resp.content
    print(f"[social] downloaded {len(video_bytes) / 1e6:.1f} MB")

    with tempfile.TemporaryDirectory() as tmpdir:
        input_path = Path(tmpdir) / "input.mp4"
        input_path.write_bytes(video_bytes)

        # Probe original dimensions
        probe = subprocess.run(
            ["ffprobe", "-v", "error", "-select_streams", "v:0",
             "-show_entries", "stream=width,height",
             "-of", "csv=s=x:p=0", str(input_path)],
            capture_output=True, text=True,
        )
        w, h = map(int, probe.stdout.strip().split("x")) if "x" in probe.stdout else (1280, 720)
        print(f"[social] source: {w}x{h}")

        results = {}

        # 9:16 TikTok (vertical) â€” crop center horizontally, pad if needed
        tiktok_path = Path(tmpdir) / "tiktok.mp4"
        target_w_9_16 = int(h * 9 / 16)  # width based on original height
        if target_w_9_16 > w:
            # Need to pad (add black bars top/bottom to make it 9:16)
            target_h = int(w * 16 / 9)
            vf = f"scale={w}:{target_h}:force_original_aspect_ratio=decrease,pad={w}:{target_h}:(ow-iw)/2:(oh-ih)/2:black"
        else:
            # Crop from center
            vf = f"crop={target_w_9_16}:{h}:(iw-{target_w_9_16})/2:0"
        subprocess.run(
            ["ffmpeg", "-y", "-i", str(input_path), "-vf", vf,
             "-c:v", "libx264", "-preset", "fast", "-crf", "23",
             "-c:a", "aac", "-b:a", "192k", str(tiktok_path)],
            capture_output=True, check=True,
        )
        tiktok_url = upload_to_r2(tiktok_path.read_bytes(), job_id, suffix="_tiktok")
        results["tiktok"] = tiktok_url
        print(f"[social] tiktok: {tiktok_path.stat().st_size / 1e6:.1f} MB â†’ {tiktok_url}")

        # 1:1 Instagram (square) â€” crop to square from center
        insta_path = Path(tmpdir) / "insta.mp4"
        side = min(w, h)
        vf_insta = f"crop={side}:{side}:(iw-{side})/2:(ih-{side})/2"
        subprocess.run(
            ["ffmpeg", "-y", "-i", str(input_path), "-vf", vf_insta,
             "-c:v", "libx264", "-preset", "fast", "-crf", "23",
             "-c:a", "aac", "-b:a", "192k", str(insta_path)],
            capture_output=True, check=True,
        )
        insta_url = upload_to_r2(insta_path.read_bytes(), job_id, suffix="_insta")
        results["instagram"] = insta_url
        print(f"[social] instagram: {insta_path.stat().st_size / 1e6:.1f} MB â†’ {insta_url}")

        # 16:9 YouTube â€” original is already 16:9 (or close), just copy
        results["youtube"] = video_url
        print(f"[social] youtube: using original â†’ {video_url}")

        # Update job
        update_job(job_id, social_exports=results)
        print(f"[social] job={job_id} DONE â€” 3 formats exported")

    return results


@app.function(image=base_image, secrets=[secrets], timeout=120, retries=0)
def generate_thumbnail(video_url: str, job_id: str, title: str = "") -> str:
    """Extract best frame from video + optional title overlay.

    Returns R2 URL of the thumbnail JPG.
    """
    import subprocess
    import tempfile
    from pathlib import Path
    import httpx

    print(f"[thumbnail] job={job_id} downloading video...")
    with httpx.Client(timeout=60) as client:
        resp = client.get(video_url)
        resp.raise_for_status()

    with tempfile.TemporaryDirectory() as tmpdir:
        input_path = Path(tmpdir) / "input.mp4"
        thumb_path = Path(tmpdir) / "thumb.jpg"
        input_path.write_bytes(resp.content)

        # Probe duration
        probe = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "csv=s=x:p=0", str(input_path)],
            capture_output=True, text=True,
        )
        duration = float(probe.stdout.strip()) if probe.stdout.strip() else 3.0

        # Extract frame at ~30% of video (usually the most interesting moment)
        timestamp = min(duration * 0.3, duration - 0.1)

        if title:
            # Frame + title overlay
            safe_title = title.replace("'", "").replace('"', '')[:60]
            vf = (
                f"drawtext="
                f"text='{safe_title}':"
                f"fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:"
                f"fontsize=36:"
                f"fontcolor=white:"
                f"box=1:boxcolor=black@0.6:boxborderw=12:"
                f"x=(w-tw)/2:y=h-th-40"
            )
            subprocess.run(
                ["ffmpeg", "-y", "-ss", str(timestamp), "-i", str(input_path),
                 "-vf", vf, "-frames:v", "1", "-q:v", "2", str(thumb_path)],
                capture_output=True, check=True,
            )
        else:
            # Just extract frame
            subprocess.run(
                ["ffmpeg", "-y", "-ss", str(timestamp), "-i", str(input_path),
                 "-frames:v", "1", "-q:v", "2", str(thumb_path)],
                capture_output=True, check=True,
            )

        thumb_bytes = thumb_path.read_bytes()
        print(f"[thumbnail] extracted {len(thumb_bytes) / 1024:.0f} KB")

        thumb_url = upload_to_r2(
            thumb_bytes, job_id,
            suffix="_thumb", content_type="image/jpeg", extension="jpg",
        )
        print(f"[thumbnail] uploaded â†’ {thumb_url}")
        return thumb_url


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
        print(f"[watermark] applied â†’ {len(watermarked)/1e6:.1f}MB")
        return watermarked


# ===========================================================================
# Experimental T2I/T2V candidates (model lab Step 1) â€” NOT wired into
# generate_clip() or generate_video_complete(). Reachable only via
# `modal run modal_app/video_pipeline.py::test_<name>`.
# ===========================================================================

# NVIDIA NIM FLUX endpoints â€” verify current names at build.nvidia.com
_NIM_FLUX_MODELS = [
    "black-forest-labs/flux.1-dev",      # best quality
    "black-forest-labs/flux.1-schnell",  # fast, Apache 2.0
    "black-forest-labs/flux.2-klein",    # compact tertiary fallback (verify endpoint name)
]


@app.function(image=base_image, secrets=[secrets, modal.Secret.from_name("Nvidia")], timeout=180, retries=0)
def generate_image_flux_nim(prompt: str) -> bytes:
    """Generate an image via NVIDIA NIM: tries flux.1-dev â†’ schnell â†’ flux.2-klein.

    All 3 are ACTIVE on the existing NVIDIA NGC account. Returns PNG bytes.
    No GPU needed â€” NIM is a hosted REST API.
    """
    import base64
    import httpx

    api_key = os.environ.get("NVIDIA_API_KEY")
    if not api_key:
        raise RuntimeError("NVIDIA_API_KEY missing in Modal secrets")

    headers = {"Authorization": f"Bearer {api_key}", "Accept": "application/json"}

    def _call(model: str) -> bytes:
        resp = httpx.post(
            f"https://ai.api.nvidia.com/v1/genai/{model}",
            headers=headers,
            json={"prompt": prompt[:1000]},
            timeout=120,
        )
        resp.raise_for_status()
        data = resp.json()
        # Handle multiple possible NIM response shapes
        b64 = (
            data.get("image")
            or (data.get("images") or [None])[0]
            or (data.get("artifacts") or [{}])[0].get("base64")
        )
        if not b64:
            raise RuntimeError(f"NVIDIA NIM response missing image data: {str(data)[:200]}")
        if isinstance(b64, str) and b64.startswith("data:"):
            b64 = b64.split(",", 1)[1]
        return base64.b64decode(b64)

    last_exc: Exception = RuntimeError("no NIM models configured")
    for model in _NIM_FLUX_MODELS:
        try:
            print(f"[flux_nim] requesting {model}...")
            return _call(model)
        except Exception as e:
            print(f"[flux_nim] {model} failed ({e}), trying next...")
            last_exc = e
    raise last_exc


@app.function(
    image=ltx23_image,
    gpu="H100",  # FP8 e4m3 scaled_mm exige Hopper/Ada â€” A100 ne supporte pas FP8
    timeout=1800,
    retries=0,
    volumes={"/cache": hf_volume},
)
def generate_clip_ltx23(
    prompt: str,
    job_id: Optional[str] = None,
    image_url: Optional[str] = None,
    duration_seconds: float = 5.0,
    seed: int = 42,
) -> bytes:
    """GÃ©nÃ¨re un clip LTX-2.3 (SDK officiel Lightricks, checkpoint FP8), MP4 bytes.

    Mode auto : image_url fourni â†’ I2V (image animÃ©e) ; sinon â†’ T2V direct.
    Audio natif embarquÃ© dans le MP4 (pas d'AudioLDM2 sÃ©parÃ©).
    Config validÃ©e : TI2VidOneStagePipeline + FP8 scaled_mm + offload NONE +
    inference_mode (cf. modal_app/ltx_video.py). Scale-to-zero (plain @app.function).
    """
    import time
    import tempfile
    from io import BytesIO
    from pathlib import Path

    import torch
    import requests as _req
    from PIL import Image
    from ltx_pipelines.ti2vid_one_stage import TI2VidOneStagePipeline
    from ltx_pipelines.utils.types import OffloadMode
    from ltx_pipelines.utils.args import ImageConditioningInput
    from ltx_pipelines.utils.media_io import encode_video
    from ltx_core.components.guiders import MultiModalGuiderParams
    from ltx_core.quantization import QuantizationPolicy
    from ltx_core.quantization.fp8_scaled_mm import (
        get_fp8_swap_module_ops,
        fp8_scaled_mm_fuse_rule,
    )

    if not Path(LTX23_FP8).exists():
        raise FileNotFoundError(f"Checkpoint FP8 manquant: {LTX23_FP8}")

    mode = "I2V" if image_url else "T2V"
    print(f"[ltx23] {mode} | job={job_id} | chargement pipeline FP8 (H100)...")

    fp8_policy = QuantizationPolicy(
        module_ops=get_fp8_swap_module_ops(LTX23_FP8),
        fuse_rule=fp8_scaled_mm_fuse_rule,
    )
    pipeline = TI2VidOneStagePipeline(
        checkpoint_path=LTX23_FP8,
        gemma_root=LTX23_GEMMA,
        loras=[],
        quantization=fp8_policy,
        offload_mode=OffloadMode.NONE,
    )

    # Params prod validÃ©s
    width, height, frame_rate, steps = 768, 512, 25.0, 8
    num_frames = max(9, int(round(duration_seconds * frame_rate)))
    negative_prompt = "worst quality, inconsistent motion, blurry, jittery, distorted, static"

    # stg_scale=0 : dÃ©sactive Skip-Transformer-Guidance (Ã©conomie VRAM)
    video_params = MultiModalGuiderParams(
        cfg_scale=3.0, stg_scale=0.0, rescale_scale=0.7, modality_scale=3.0, stg_blocks=[],
    )
    audio_params = MultiModalGuiderParams(
        cfg_scale=7.0, stg_scale=0.0, rescale_scale=0.7, modality_scale=3.0, stg_blocks=[],
    )

    with tempfile.TemporaryDirectory() as tmpdir:
        images = []
        if image_url:
            img_bytes = _req.get(image_url, timeout=30).content
            img_path = f"{tmpdir}/input.jpg"
            Image.open(BytesIO(img_bytes)).convert("RGB").save(img_path)
            images = [ImageConditioningInput(img_path, 0, 1.0, 0)]

        out_path = f"{tmpdir}/output.mp4"
        t0 = time.time()
        # inference_mode englobe encode_video : dÃ©codage VAE paresseux (sinon
        # RuntimeError: Inference tensors do not track version counter).
        with torch.inference_mode():
            video, audio = pipeline(
                prompt=prompt,
                negative_prompt=negative_prompt,
                seed=seed,
                height=height,
                width=width,
                num_frames=num_frames,
                frame_rate=frame_rate,
                num_inference_steps=steps,
                video_guider_params=video_params,
                audio_guider_params=audio_params,
                images=images,
            )
            encode_video(video, fps=frame_rate, audio=audio, output_path=out_path, video_chunks_number=1)
        video_bytes = Path(out_path).read_bytes()

    print(f"[ltx23] {mode} terminÃ© en {time.time()-t0:.1f}s â€” {len(video_bytes)//1024} KB")
    return video_bytes


# ===========================================================================
# Explainer (code-based slides + Kokoro voice) â€” CPU only, ~cents/video
# ===========================================================================
@app.function(image=explainer_image, secrets=[secrets], timeout=1200, retries=0)
def render_explainer(job_id: str, storyboard: dict, brand: Optional[dict] = None,
                     product_url: Optional[str] = None, voice: str = "af_heart") -> str:
    """Render an explainer MP4 from a research storyboard and write it to the job.

    Pipeline (all CPU): product screenshot (chromium) -> Kokoro TTS per scene ->
    HyperFrames composition (build.js) -> render -> upload R2 -> update_job done.
    Reuses the same renderer scripts as the VPS service (build.js, tts_kokoro.py).
    """
    import json
    import subprocess
    import tempfile
    from pathlib import Path

    try:
        update_job(job_id, status="in_progress", current_stage="rendering_explainer")
        sb = dict(storyboard or {})
        sb.setdefault("meta", {})
        if brand:
            sb["meta"]["brand"] = brand
        eff_voice = (brand or {}).get("voice") or voice

        with tempfile.TemporaryDirectory() as work:
            assets = Path(work) / "assets"
            assets.mkdir(parents=True, exist_ok=True)
            sb_path = Path(work) / "storyboard.json"
            sb_path.write_text(json.dumps(sb))

            if product_url and str(product_url).startswith(("http://", "https://")):
                try:
                    subprocess.run([
                        "chromium", "--headless=new", "--no-sandbox", "--disable-gpu",
                        "--hide-scrollbars", "--window-size=1440,900",
                        "--virtual-time-budget=9000",
                        f"--screenshot={assets / 'shot.png'}", product_url,
                    ], timeout=70, check=False)
                except Exception as e:
                    log(job_id, f"[explainer] screenshot skipped: {e}")

            subprocess.run(["python3", "/app/tts_kokoro.py", str(sb_path), str(assets), eff_voice],
                           check=True, timeout=400)
            subprocess.run(["node", "/app/build.js", str(sb_path), work], check=True, timeout=120)
            subprocess.run(["npx", "--yes", "hyperframes@0.6.110", "render"],
                           cwd=work, check=True, timeout=900)

            renders = sorted((Path(work) / "renders").glob("*.mp4"))
            if not renders:
                raise RuntimeError("no mp4 produced")
            video_bytes = renders[-1].read_bytes()

        url = upload_to_r2(video_bytes, job_id, suffix="_explainer")
        update_job(job_id, status="done", current_stage="completed",
                   video_url=url, output_url_final=url)
        log(job_id, f"[explainer] DONE â†’ {url} ({len(video_bytes)//1024} KB)")
        return url
    except Exception as e:
        import traceback
        log(job_id, f"[explainer] FAILED:\n{traceback.format_exc()}")
        update_job(job_id, status="failed", current_stage="failed",
                   error_message=normalize_error(e)[:500])
        _report_sentry(e, job_id=job_id)
        raise


# ===========================================================================
# Native Product Ad (private presenter + product media + deterministic edit)
# ===========================================================================
@app.function(image=overlay_image, secrets=[secrets], timeout=900, retries=0)
def render_native_product_ad(job_id: str) -> str:
    """Compose an AlphoGen-owned short Product Ad.

    All media is resolved server-side from private storage. A completed native
    animation is preferred; if it is unavailable, the normalized performance
    clip is used with the same generated speech track so the job still ships.
    """
    import json
    import re
    import subprocess
    import tempfile
    from io import BytesIO
    from pathlib import Path
    from urllib.parse import urljoin

    import httpx
    from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

    def storage_bytes(sb, bucket: str, path: str) -> bytes:
        data = sb.storage.from_(bucket).download(path)
        if not data or len(data) < 100:
            raise RuntimeError("private media unavailable")
        return bytes(data)

    def cover(image: Image.Image, size: tuple[int, int]) -> Image.Image:
        src = image.convert("RGB")
        scale = max(size[0] / src.width, size[1] / src.height)
        resized = src.resize(
            (max(1, int(src.width * scale)), max(1, int(src.height * scale))),
            Image.Resampling.LANCZOS,
        )
        left = max(0, (resized.width - size[0]) // 2)
        top = max(0, (resized.height - size[1]) // 2)
        return resized.crop((left, top, left + size[0], top + size[1]))

    def fetch_product_images(state: dict, limit: int = 3) -> list[Image.Image]:
        product = state.get("product") if isinstance(state.get("product"), dict) else {}
        image_urls = product.get("imageUrls")
        if not isinstance(image_urls, list):
            image_urls = []
        legacy_url = product.get("imageUrl")
        if legacy_url:
            image_urls = [legacy_url, *image_urls]
        page_url = str(state.get("url") or "")
        with httpx.Client(timeout=18, follow_redirects=True) as client:
            if not image_urls and page_url.startswith(("http://", "https://")):
                try:
                    html = client.get(
                        page_url,
                        headers={"User-Agent": "AlphoGenProductRenderer/1.0"},
                    ).text[:1_500_000]
                    match = re.search(
                        r'<meta[^>]+(?:property|name)=["\'](?:og:image|twitter:image)["\'][^>]+content=["\']([^"\']+)',
                        html,
                        re.I,
                    )
                    if not match:
                        match = re.search(
                            r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\'](?:og:image|twitter:image)["\']',
                            html,
                            re.I,
                    )
                    if match:
                        image_urls = [urljoin(page_url, match.group(1))]
                except Exception:
                    image_urls = []
            images: list[Image.Image] = []
            seen: set[str] = set()
            for image_url in image_urls:
                value = str(image_url or "")
                if (
                    not value.startswith(("http://", "https://"))
                    or value in seen
                ):
                    continue
                seen.add(value)
                try:
                    response = client.get(value)
                    response.raise_for_status()
                    image = Image.open(BytesIO(response.content)).convert("RGB")
                    if image.width >= 240 and image.height >= 240:
                        images.append(image)
                    if len(images) >= limit:
                        break
                except Exception:
                    continue
            return images

    def wrap(draw, text: str, font, max_width: int, max_lines: int) -> list[str]:
        words = str(text or "").split()
        lines: list[str] = []
        current = ""
        for word in words:
            candidate = f"{current} {word}".strip()
            if draw.textlength(candidate, font=font) <= max_width:
                current = candidate
            else:
                if current:
                    lines.append(current)
                current = word
                if len(lines) >= max_lines:
                    break
        if current and len(lines) < max_lines:
            lines.append(current)
        return lines or [""]

    try:
        update_job(job_id, status="in_progress", current_stage="native_rendering")
        sb = get_supabase_client()
        job_res = (
            sb.table("jobs")
            .select("id,user_id,engine_used,app_state")
            .eq("id", job_id)
            .single()
            .execute()
        )
        job = job_res.data or {}
        if job.get("engine_used") != "native_product_ad":
            raise RuntimeError("invalid native Product Ad job")
        state = job.get("app_state") or {}
        if not isinstance(state, dict):
            state = json.loads(state)
        animation_id = str(state.get("animation_id") or "")
        if not animation_id:
            raise RuntimeError("native animation missing")

        animation_res = (
            sb.table("user_presenter_native_animations")
            .select(
                "id,user_id,native_base_id,audio_path,output_video_path,"
                "output_duration_seconds,status"
            )
            .eq("id", animation_id)
            .eq("user_id", job.get("user_id"))
            .single()
            .execute()
        )
        animation = animation_res.data or {}
        base_res = (
            sb.table("user_presenter_native_bases")
            .select("id,user_id,status,normalized_video_path")
            .eq("id", animation.get("native_base_id"))
            .eq("user_id", job.get("user_id"))
            .single()
            .execute()
        )
        native_base = base_res.data or {}
        if native_base.get("status") != "ready" or not native_base.get("normalized_video_path"):
            raise RuntimeError("normalized presenter unavailable")

        fallback_used = animation.get("status") != "ready"
        presenter_bytes = None
        if not fallback_used and animation.get("output_video_path"):
            try:
                presenter_bytes = storage_bytes(
                    sb,
                    "user-presenter-native-animations",
                    animation["output_video_path"],
                )
            except Exception:
                fallback_used = True
        if presenter_bytes is None:
            presenter_bytes = storage_bytes(
                sb,
                "user-presenter-native-bases",
                native_base["normalized_video_path"],
            )
        audio_bytes = storage_bytes(
            sb,
            "user-presenter-native-animations",
            animation["audio_path"],
        )

        fmt = str(state.get("format") or "portrait")
        dimensions = {
            "portrait": (720, 1280),
            "square": (900, 900),
            "landscape": (1280, 720),
        }
        width, height = dimensions.get(fmt, dimensions["portrait"])
        script = str(state.get("script") or "")
        product = state.get("product") if isinstance(state.get("product"), dict) else {}
        product_title = str(product.get("title") or "Featured product")[:90]
        product_host = str(product.get("hostname") or "Product ad")[:60]
        product_images = fetch_product_images(state)

        with tempfile.TemporaryDirectory() as work:
            root = Path(work)
            presenter_path = root / "presenter.mp4"
            audio_path = root / "speech.mp3"
            hook_path = root / "hook.png"
            middle_bg_path = root / "middle-background.png"
            middle_overlay_a_path = root / "middle-overlay-a.png"
            middle_overlay_b_path = root / "middle-overlay-b.png"
            outro_path = root / "outro.png"
            output_path = root / "product-ad.mp4"
            presenter_path.write_bytes(presenter_bytes)
            audio_path.write_bytes(audio_bytes)

            bold_path = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
            regular_path = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
            title_font = ImageFont.truetype(bold_path, max(29, int(height * 0.052)))
            caption_font = ImageFont.truetype(bold_path, max(22, int(height * 0.030)))
            small_font = ImageFont.truetype(regular_path, max(16, int(height * 0.021)))

            probe = subprocess.run(
                [
                    "ffprobe", "-v", "error", "-show_entries", "format=duration",
                    "-of", "default=noprint_wrappers=1:nokey=1", str(audio_path),
                ],
                check=True,
                capture_output=True,
                text=True,
                timeout=30,
            )
            duration = min(8.0, max(0.6, float(probe.stdout.strip())))
            edge_duration = min(1.15, max(0.55, duration * 0.18))
            if duration < 2.2:
                edge_duration = max(0.15, duration * 0.22)
            edge_duration = min(
                edge_duration,
                max(0.1, (duration - 0.3) / 2),
            )
            middle_duration = max(0.4, duration - (edge_duration * 2))

            def dark_studio(image: Optional[Image.Image] = None) -> Image.Image:
                if image:
                    result = cover(image, (width, height))
                    result = result.filter(ImageFilter.GaussianBlur(max(12, width // 38)))
                    return ImageEnhance.Brightness(result).enhance(0.34)
                result = Image.new("RGB", (width, height), (16, 23, 37))
                pixels = result.load()
                for y in range(height):
                    mix = y / max(1, height - 1)
                    color = (int(15 + 24 * mix), int(23 + 17 * mix), int(38 + 28 * mix))
                    for x in range(width):
                        pixels[x, y] = color
                return result

            def add_bottom_scrim(image: Image.Image, strength: int = 210) -> Image.Image:
                layer = image.convert("RGBA")
                shade = Image.new("RGBA", (width, height), (0, 0, 0, 0))
                shade_draw = ImageDraw.Draw(shade)
                start = int(height * 0.48)
                for y in range(start, height):
                    alpha = int(strength * ((y - start) / max(1, height - start)))
                    shade_draw.line((0, y, width, y), fill=(5, 9, 16, alpha))
                return Image.alpha_composite(layer, shade)

            def product_hero(image: Optional[Image.Image]) -> Image.Image:
                if not image:
                    return dark_studio()
                canvas = dark_studio(image).convert("RGBA")
                max_w = int(width * (0.88 if fmt != "landscape" else 0.68))
                max_h = int(height * (0.55 if fmt == "portrait" else 0.66))
                scale = min(max_w / image.width, max_h / image.height)
                fitted = image.convert("RGB").resize(
                    (
                        max(1, int(image.width * scale)),
                        max(1, int(image.height * scale)),
                    ),
                    Image.Resampling.LANCZOS,
                ).convert("RGBA")
                mask = Image.new("L", fitted.size, 0)
                ImageDraw.Draw(mask).rounded_rectangle(
                    (0, 0, fitted.width, fitted.height),
                    radius=max(18, width // 32),
                    fill=255,
                )
                x = (width - fitted.width) // 2
                y = max(78, int(height * 0.09))
                canvas.paste(fitted, (x, y), mask)
                return canvas

            def paste_rounded(
                canvas: Image.Image,
                image: Image.Image,
                box: tuple[int, int, int, int],
                radius: int,
            ) -> None:
                fitted = cover(image, (box[2] - box[0], box[3] - box[1])).convert("RGBA")
                mask = Image.new("L", fitted.size, 0)
                ImageDraw.Draw(mask).rounded_rectangle(
                    (0, 0, fitted.width, fitted.height),
                    radius=radius,
                    fill=255,
                )
                canvas.paste(fitted, box[:2], mask)

            def draw_centered(
                draw: ImageDraw.ImageDraw,
                text: str,
                font,
                y: int,
                max_width: int,
                max_lines: int,
                fill: tuple[int, int, int, int],
            ) -> int:
                line_height = int(font.size * 1.13)
                for line in wrap(draw, text, font, max_width, max_lines):
                    line_width = draw.textlength(line, font=font)
                    draw.text(((width - line_width) / 2, y), line, font=font, fill=fill)
                    y += line_height
                return y

            hero_image = product_images[0] if product_images else None
            detail_image = product_images[1] if len(product_images) > 1 else hero_image
            pip_image = product_images[2] if len(product_images) > 2 else hero_image

            hook = add_bottom_scrim(
                product_hero(hero_image),
                225,
            )
            hook_draw = ImageDraw.Draw(hook)
            hook_draw.rounded_rectangle(
                (28, 26, 230, 68),
                radius=21,
                fill=(8, 13, 23, 210),
            )
            hook_draw.text(
                (46, 46),
                "ALPHOGEN PRODUCT",
                font=small_font,
                fill=(255, 255, 255, 242),
                anchor="lm",
            )
            hook_title_y = int(height * 0.66)
            draw_centered(
                hook_draw,
                product_title,
                title_font,
                hook_title_y,
                width - 88,
                3,
                (255, 255, 255, 255),
            )
            hook.save(hook_path)

            middle_background = dark_studio(hero_image)
            middle_draw = ImageDraw.Draw(middle_background)
            middle_draw.rectangle(
                (0, 0, width, int(height * 0.12)),
                fill=(6, 10, 18, 185),
            )
            middle_draw.text(
                (30, int(height * 0.06)),
                "AlphoGen Product Ad",
                font=small_font,
                fill=(245, 247, 252, 238),
                anchor="lm",
            )
            middle_background.save(middle_bg_path)

            if fmt == "portrait":
                presenter_box = (0, int(height * 0.12), width, int(height * 0.12) + width)
                pip_box = (width - 212, 92, width - 28, 276)
                caption_box = (28, int(height * 0.77), width - 28, int(height * 0.94))
            elif fmt == "square":
                presenter_box = (0, 0, width, height)
                pip_box = (width - 238, 34, width - 34, 238)
                caption_box = (34, int(height * 0.72), width - 34, int(height * 0.94))
            else:
                presenter_box = (0, 0, height, height)
                pip_box = (int(width * 0.69), int(height * 0.17), width - 44, int(height * 0.63))
                caption_box = (int(width * 0.55), int(height * 0.69), width - 44, int(height * 0.92))

            script_words = script.split()
            split_at = max(1, (len(script_words) + 1) // 2)
            caption_parts = [
                " ".join(script_words[:split_at]),
                " ".join(script_words[split_at:]) or " ".join(script_words[:split_at]),
            ]

            def middle_overlay(caption: str) -> Image.Image:
                overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
                draw = ImageDraw.Draw(overlay)
                if pip_image:
                    draw.rounded_rectangle(
                        (pip_box[0] - 5, pip_box[1] - 5, pip_box[2] + 5, pip_box[3] + 5),
                        radius=25,
                        fill=(255, 255, 255, 238),
                    )
                    paste_rounded(overlay, pip_image, pip_box, 20)
                draw.rounded_rectangle(
                    caption_box,
                    radius=24,
                    fill=(7, 11, 20, 226),
                    outline=(255, 255, 255, 42),
                    width=2,
                )
                lines = wrap(
                    draw,
                    caption,
                    caption_font,
                    caption_box[2] - caption_box[0] - 42,
                    2,
                )
                line_height = int(caption_font.size * 1.16)
                text_y = caption_box[1] + (
                    (caption_box[3] - caption_box[1] - len(lines) * line_height) // 2
                )
                for line in lines:
                    line_width = draw.textlength(line, font=caption_font)
                    draw.text(
                        ((width - line_width) / 2, text_y),
                        line,
                        font=caption_font,
                        fill=(255, 255, 255, 255),
                    )
                    text_y += line_height
                return overlay

            middle_overlay(caption_parts[0]).save(middle_overlay_a_path)
            middle_overlay(caption_parts[1]).save(middle_overlay_b_path)

            outro = add_bottom_scrim(
                product_hero(detail_image),
                230,
            )
            outro_draw = ImageDraw.Draw(outro)
            cta = "Découvrir le produit" if state.get("language") == "french" else "Discover the product"
            outro_y = int(height * 0.63)
            outro_y = draw_centered(
                outro_draw,
                product_title,
                title_font,
                outro_y,
                width - 88,
                2,
                (255, 255, 255, 255),
            )
            cta_width = outro_draw.textlength(cta, font=small_font)
            cta_box = (
                int((width - cta_width) / 2) - 26,
                outro_y + 18,
                int((width + cta_width) / 2) + 26,
                outro_y + 66,
            )
            outro_draw.rounded_rectangle(cta_box, radius=24, fill=(255, 255, 255, 242))
            outro_draw.text(
                (width / 2, outro_y + 42),
                cta,
                font=small_font,
                fill=(10, 16, 28, 255),
                anchor="mm",
            )
            outro_draw.text(
                (width / 2, height - 34),
                product_host,
                font=small_font,
                fill=(235, 239, 247, 225),
                anchor="ms",
            )
            outro.save(outro_path)

            panel_w = presenter_box[2] - presenter_box[0]
            panel_h = presenter_box[3] - presenter_box[1]
            caption_switch = middle_duration / 2
            filter_graph = (
                f"[0:v]trim=duration={edge_duration:.3f},setpts=PTS-STARTPTS,"
                f"scale={width}:{height},setsar=1[hook];"
                f"[3:v]trim=duration={middle_duration:.3f},setpts=PTS-STARTPTS,"
                f"scale={width}:{height},setsar=1[midbg];"
                f"[1:v]trim=start={edge_duration:.3f}:end={duration - edge_duration:.3f},"
                f"setpts=PTS-STARTPTS,scale={panel_w}:{panel_h}:force_original_aspect_ratio=increase,"
                f"crop={panel_w}:{panel_h},setsar=1[presenter];"
                f"[midbg][presenter]overlay={presenter_box[0]}:{presenter_box[1]}:shortest=1[mid0];"
                f"[mid0][4:v]overlay=0:0:shortest=1:"
                f"enable='between(t,0,{caption_switch:.3f})'[mid1];"
                f"[mid1][5:v]overlay=0:0:shortest=1:"
                f"enable='gte(t,{caption_switch:.3f})'[middle];"
                f"[6:v]trim=duration={edge_duration:.3f},setpts=PTS-STARTPTS,"
                f"scale={width}:{height},setsar=1[outro];"
                "[hook][middle][outro]concat=n=3:v=1:a=0[v]"
            )
            command = [
                "ffmpeg", "-y",
                "-loop", "1", "-framerate", "25", "-i", str(hook_path),
                "-stream_loop", "-1", "-i", str(presenter_path),
                "-i", str(audio_path),
                "-loop", "1", "-framerate", "25", "-i", str(middle_bg_path),
                "-loop", "1", "-framerate", "25", "-i", str(middle_overlay_a_path),
                "-loop", "1", "-framerate", "25", "-i", str(middle_overlay_b_path),
                "-loop", "1", "-framerate", "25", "-i", str(outro_path),
                "-filter_complex", filter_graph,
                "-map", "[v]", "-map", "2:a:0",
                "-t", f"{duration:.3f}",
                "-r", "25", "-c:v", "libx264", "-preset", "medium", "-crf", "19",
                "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k",
                "-movflags", "+faststart", "-shortest", str(output_path),
            ]
            rendered = subprocess.run(
                command,
                check=False,
                capture_output=True,
                text=True,
                timeout=300,
            )
            if rendered.returncode != 0:
                raise RuntimeError(f"ffmpeg native Product Ad failed: {rendered.stderr[-500:]}")
            video_bytes = output_path.read_bytes()

        url = upload_to_r2(video_bytes, job_id, suffix="_native_product_ad")
        final_state = dict(state)
        final_state["native_fallback"] = bool(fallback_used)
        final_state["render"] = {
            "duration_seconds": round(duration, 3),
            "format": fmt,
            "product_media": bool(product_images),
            "product_media_count": len(product_images),
            "edit_version": "three-shot-v2",
        }
        update_job(
            job_id,
            status="done",
            current_stage="completed",
            video_url=url,
            output_url_final=url,
            error_message=None,
            app_state=final_state,
        )
        log(
            job_id,
            f"[native-product-ad] DONE fallback={fallback_used} media={len(product_images)} -> {url}",
        )
        return url
    except Exception as e:
        import traceback
        log(job_id, f"[native-product-ad] FAILED:\n{traceback.format_exc()}")
        update_job(
            job_id,
            status="failed",
            current_stage="failed",
            error_message="Native Product Ad rendering could not be completed.",
        )
        _report_sentry(e, job_id=job_id)
        raise


# ===========================================================================
# Orchestrator (no GPU â€” just coordinates)
# ===========================================================================

@app.function(
    image=base_image,
    secrets=[secrets],
    # Timeout rationale: must outlive generate_multi_scene (9000s) + assemble (600s)
    # + upload overhead.  Set to 10200s (~170 min).
    timeout=10200,
    retries=0,
)
def generate_video_complete(
    job_id: str,
    prompt: str,
    user_id: Optional[str] = None,
    preferred_engine: Optional[str] = None,
    image_url: Optional[str] = None,
    references: Optional[dict] = None,
):
    import traceback
    from modal_app.engines import init_engines
    init_engines(
        generate_clip_fn=generate_clip.remote,
        generate_clip_ltx23_fn=generate_clip_ltx23.remote,
    )

    log(job_id, f"orchestrator start | prompt={prompt[:60]}"
        f"{f' | preferred={preferred_engine}' if preferred_engine else ''}")

    try:
        # Fetch job to read storyboard â€” scene_count is ALWAYS derived
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
        # Route: single-scene â†’ original pipeline (unchanged)
        # ------------------------------------------------------------------
        if len(storyboard) <= 1:
            log(job_id, "single-scene path (v3 compat)")
            # status already "in_progress" from webhook â€” only update stage
            update_job(job_id, status="in_progress", current_stage="generating_scene_1")

            from modal_app.engines import select_engine, generate_with_fallback
            supabase_client_for_engines = get_supabase_client()
            clip_dur = int(storyboard[0]["duration_sec"]) if storyboard else 5
            engine_key = select_engine(
                plan=plan, duration_seconds=clip_dur, preferred=preferred_engine,
                supabase_client=supabase_client_for_engines, references=references,
            )
            log(job_id, f"engine selected: {engine_key}"
                f"{' (with references)' if references else ''}")

            # Cost tracking (before generation â€” recorded even on failure)
            try:
                from modal_app.utils.costs import estimate_cost
                estimated_cost = round(estimate_cost(engine_key, clip_dur, supabase_client_for_engines), 4)
                log(job_id, f"cost estimated: {engine_key} â†’ ${estimated_cost:.4f}")
                update_job(job_id, engine_used=engine_key, estimated_cost_usd=estimated_cost)
            except Exception as e:
                log(job_id, f"cost tracking skipped: {e}")

            video_bytes, actual_engine = generate_with_fallback(
                engine_key, prompt=prompt, job_id=job_id, duration_seconds=clip_dur,
                image_url=image_url, supabase_client=supabase_client_for_engines,
                references=references,
            )
            if actual_engine != engine_key:
                log(job_id, f"fallback triggered: {engine_key} â†’ {actual_engine}")
                update_job(job_id, engine_used=actual_engine)
                try:
                    from modal_app.utils.costs import estimate_cost
                    fallback_cost = round(estimate_cost(actual_engine, clip_dur, supabase_client_for_engines), 4)
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
            log(job_id, f"uploaded â†’ {video_url}")

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
                    log(job_id, f"audio uploaded â†’ {audio_url}")

                    update_job(job_id, current_stage="muxing_audio")
                    muxed_bytes = mux_audio.remote(video_bytes, audio_bytes)
                    final_url = upload_to_r2(muxed_bytes, job_id, suffix="_final")
                    log(job_id, f"muxed video+audio â†’ {final_url}")
                    update_job(job_id, audio_url=audio_url)
                except Exception as e:
                    log(job_id, f"audio generation skipped (non-blocking): {e}")
                    # Video is already uploaded â€” proceed without audio

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
        # Route: multi-scene â†’ generate each scene, then assemble
        # ------------------------------------------------------------------
        log(job_id, f"multi-scene path: {len(storyboard)} scenes")
        # status already "in_progress" from webhook â€” only update stage
        update_job(job_id, status="in_progress", current_stage="generating_scene_1")

        # Total duration needed for cost recalculation on fallback
        total_dur = sum(int(s.get("duration_sec", 5)) for s in storyboard)

        # Cost tracking (before generation â€” recorded even on failure)
        try:
            from modal_app.engines import select_engine as _sel
            from modal_app.utils.costs import estimate_cost
            orchestrator_sb = get_supabase_client()
            ms_engine_key = _sel(
                plan=plan, duration_seconds=int(storyboard[0].get("duration_sec", 5)),
                preferred=preferred_engine, supabase_client=orchestrator_sb,
            )
            estimated_cost = round(estimate_cost(ms_engine_key, total_dur, orchestrator_sb), 4)
            log(job_id, f"cost estimated: {ms_engine_key} Ã— {len(storyboard)} scenes â†’ ${estimated_cost:.4f}")
            update_job(job_id, engine_used=ms_engine_key, estimated_cost_usd=estimated_cost)
        except Exception as e:
            log(job_id, f"cost tracking skipped: {e}")

        # Step 1: generate all scene clips
        ms_result = generate_multi_scene.remote(job_id, storyboard, plan, preferred_engine, image_url)
        clip_urls = ms_result["clip_urls"]
        ms_any_fallback = ms_result["any_fallback"]

        # Multi-scene engine_used rule:
        # If ANY scene used fallback â†’ job-level engine_used = "wan_i2v"
        # This ensures the cost displayed reflects the actual engine used.
        if ms_any_fallback:
            log(job_id, "multi-scene fallback detected â†’ engine_used = wan_i2v")
            try:
                from modal_app.utils.costs import estimate_cost
                fallback_cost = round(estimate_cost("wan_i2v", total_dur, get_supabase_client()), 4)
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
        log(job_id, f"final uploaded â†’ {video_url}")

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
                log(job_id, f"audio uploaded â†’ {audio_url}")

                update_job(job_id, current_stage="muxing_audio")
                muxed_bytes = mux_audio.remote(final_bytes, audio_bytes)
                final_url = upload_to_r2(muxed_bytes, job_id, suffix="_with_audio")
                log(job_id, f"muxed video+audio â†’ {final_url}")
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
        # Report to Sentry if configured
        _report_sentry(e, job_id=job_id, prompt=prompt)
        raise


def _report_sentry(exc: Exception, **context) -> None:
    """Report exception to Sentry if SENTRY_DSN is configured. Non-blocking."""
    dsn = os.environ.get("SENTRY_DSN")
    if not dsn:
        return
    try:
        import sentry_sdk
        if not sentry_sdk.Hub.current.client:
            sentry_sdk.init(dsn=dsn, environment=os.environ.get("ENV", "production"))
        with sentry_sdk.push_scope() as scope:
            for k, v in context.items():
                scope.set_tag(k, str(v)[:200] if v else "null")
            sentry_sdk.capture_exception(exc)
    except Exception as sentry_err:
        print(f"[sentry] report failed: {sentry_err}")


# ===========================================================================
# Podcast render (T-1131e) â€” two-shot voice-first compositing, CPU only.
# ===========================================================================

PODCAST_GAP_MS = 300
PODCAST_FPS = 24
_PODCAST_COLORS = {"host": (52, 201, 138), "guest": (91, 141, 239)}


def _podcast_probe_duration(path: str) -> float:
    """Real audio duration in seconds via ffprobe (0.0 on failure)."""
    import subprocess
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", path],
            capture_output=True, text=True, timeout=60,
        )
        return max(0.0, float(out.stdout.strip()))
    except Exception:
        return 0.0


def _podcast_mix(a, b, t: float):
    return tuple(int(a[i] * (1 - t) + b[i] * t) for i in range(3))


def _podcast_avatar(name: str, color, size: int = 220):
    """Generate a polished placeholder presenter. No external fetch (V1)."""
    from PIL import Image, ImageDraw, ImageFont
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    center = size // 2
    for r in range(size // 2, 8, -6):
        t = r / (size / 2)
        fill = _podcast_mix(color, (15, 20, 32), min(0.78, t))
        d.ellipse([center - r, center - r, center + r, center + r], fill=fill)
    d.ellipse([8, 8, size - 8, size - 8], outline=_podcast_mix(color, (255, 255, 255), 0.18), width=5)
    d.ellipse([18, 18, size - 18, size - 18], outline=_podcast_mix(color, (255, 255, 255), 0.04), width=2)

    skin = _podcast_mix(color, (245, 247, 250), 0.58)
    shadow = _podcast_mix(color, (8, 11, 18), 0.35)
    d.ellipse([size * 0.34, size * 0.25, size * 0.66, size * 0.57], fill=skin, outline=shadow, width=3)
    d.rounded_rectangle([size * 0.25, size * 0.56, size * 0.75, size * 0.88], radius=int(size * 0.16), fill=_podcast_mix(color, (20, 24, 34), 0.30))
    d.arc([size * 0.18, size * 0.42, size * 0.82, size * 0.95], 202, 338, fill=_podcast_mix(color, (245, 247, 250), 0.30), width=6)

    initial = (name.strip()[:1] or "?").upper()
    try:
        f = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", int(size * 0.24))
    except Exception:
        f = ImageFont.load_default()
    bb = d.textbbox((0, 0), initial, font=f)
    d.text(((size - (bb[2] - bb[0])) / 2, size * 0.56), initial, font=f, fill=(247, 250, 255))
    return img


def _podcast_circle_portrait(img_bytes: bytes, size: int):
    """Center-crop an arbitrary portrait into a circular RGBA avatar of `size`.

    Matches the placeholder's round shape so the two-shot card layout (paste
    with alpha mask, dimming for the inactive speaker) works unchanged whether
    the avatar is a generated placeholder or a real persona portrait (T-1136e).
    """
    from io import BytesIO
    from PIL import Image, ImageDraw
    im = Image.open(BytesIO(img_bytes)).convert("RGBA")
    w, h = im.size
    side = min(w, h)
    left, top = (w - side) // 2, (h - side) // 2
    im = im.crop((left, top, left + side, top + side)).resize((size, size), Image.LANCZOS)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, size - 1, size - 1], fill=255)
    im.putalpha(mask)
    return im


def _resolve_persona_avatar(sb, speaker: dict, size: int, podcast_id: str, owner_id=None):
    """Return an RGBA portrait for a speaker's persona, or None to fall back.

    Fallback-safe (T-1136e): returns None â€” so the caller keeps the placeholder
    avatar â€” for ANY of: no persona_id, persona missing/removed, no portrait
    path, not visible to the podcast owner, unresolvable/expired URL, or a
    download/decode error. Never raises.

    Visibility (hardening): only a catalog persona (user_id IS NULL) OR a persona
    owned by the podcast owner (persona.user_id == owner_id) may be used â€” the
    same rule the API's RLS/GET enforces, applied here too since render runs with
    the service role (RLS bypassed). A public http(s) portrait_path is used
    directly; a private storage path is signed from the `podcast-personas` bucket.
    """
    import httpx
    persona_id = (speaker or {}).get("persona_id")
    if not persona_id:
        return None
    try:
        rows = (
            sb.table("podcast_personas").select("user_id,portrait_path,status")
            .eq("id", persona_id).eq("status", "active").limit(1).execute().data
        ) or []
        row = rows[0] if rows else None
        if not row:
            return None
        # Ownership/visibility: catalog (user_id NULL) or owned by podcast owner.
        persona_owner = row.get("user_id")
        if persona_owner is not None and persona_owner != owner_id:
            return None
        path = (row.get("portrait_path") or "").strip()
        if not path:
            return None
        if path.startswith("http://") or path.startswith("https://"):
            url = path
        else:
            signed = sb.storage.from_("podcast-personas").create_signed_url(path, 3600)
            url = None
            if isinstance(signed, dict):
                url = signed.get("signedURL") or signed.get("signedUrl")
            if not url:
                return None
        with httpx.Client(timeout=30, follow_redirects=True) as client:
            resp = client.get(url)
            resp.raise_for_status()
            data = resp.content
        return _podcast_circle_portrait(data, size)
    except Exception as e:
        log(podcast_id, f"persona avatar fallback (speaker {(speaker or {}).get('id')}): {e}")
        return None


def _resolve_base_clip_url(sb, speaker: dict, podcast_id: str, owner_id=None, preferred_clip_id=None):
    """Return a ready 1:1 talking-head base clip R2 URL for a speaker's persona,
    or None (â†’ keep the static portrait). T-1144a. Never raises.

    Visibility mirrors _resolve_persona_avatar (service role bypasses RLS): only a
    catalog persona (user_id NULL) or one owned by the podcast owner is used.
    Reads the cached clip only â€” NO HeyGen call, no credit spend.
    """
    persona_id = (speaker or {}).get("persona_id")
    if not persona_id:
        return None
    try:
        prows = (
            sb.table("podcast_personas").select("user_id,status")
            .eq("id", persona_id).eq("status", "active").limit(1).execute().data
        ) or []
        if not prows:
            return None
        p_owner = prows[0].get("user_id")
        if p_owner is not None and p_owner != owner_id:
            return None
        if preferred_clip_id:
            rows = (
                sb.table("podcast_persona_base_clips").select("video_url,status,created_at")
                .eq("id", preferred_clip_id).eq("persona_id", persona_id)
                .eq("status", "ready").limit(1).execute().data
            ) or []
        else:
            rows = (
                sb.table("podcast_persona_base_clips").select("video_url,status,created_at")
                .eq("persona_id", persona_id).eq("provider", "heygen")
                .eq("aspect_ratio", "1:1").eq("resolution", "720p")
                .eq("clip_kind", "talking_head").eq("prompt_version", "base-v1")
                .eq("status", "ready").order("created_at", desc=True).limit(1)
                .execute().data
            ) or []
        url = (rows[0].get("video_url") or "").strip() if rows else ""
        return url or None
    except Exception as e:
        log(podcast_id, f"base clip resolve fallback (speaker {(speaker or {}).get('id')}): {e}")
        return None


def _resolve_segment_lipsync_clips(sb, podcast_id: str, quality_mode: str = "premium"):
    """Return {segment_id: r2_video_url} for READY per-segment lip-sync clips
    Next orchestrates providers and caches into podcast_segment_lipsync_clips;
    Modal only reads ready rows here and never calls a provider. Never raises.
    Any missing/failed segment simply falls back to the talking_visual visual.
    """
    out = {}
    try:
        # T-1146: only use a clip whose audio_url matches the segment's CURRENT
        # audio. After a line is edited + revoiced, the old clip (old audio) must
        # NOT be reused. Newest ready row per segment wins; stale/mismatched skip.
        segs = (
            sb.table("podcast_segments")
            .select("id,audio_url").eq("podcast_id", podcast_id)
            .execute().data
        ) or []
        cur_audio = {s.get("id"): (s.get("audio_url") or "") for s in segs}
        rows = (
            sb.table("podcast_segment_lipsync_clips")
            .select("segment_id,video_url,status,audio_url,provider,updated_at")
            .eq("podcast_id", podcast_id).eq("status", "ready")
            .order("updated_at", desc=True)
            .execute().data
        ) or []
        preferred_provider = "latentsync_modal" if quality_mode == "balanced" else "heygen"
        # Balanced may use a cached HeyGen fallback, but Premium must never pick
        # a cheaper Balanced clip just because it is newer.
        # The query already returns newest-first. Python's stable sort keeps
        # that order within each provider priority without parsing timestamps.
        ordered_rows = sorted(
            rows,
            key=lambda r: (
                0 if r.get("provider") == preferred_provider else
                1 if preferred_provider == "latentsync_modal" and r.get("provider") == "heygen" else
                2
            ),
        )
        for r in ordered_rows:
            sid = r.get("segment_id")
            url = (r.get("video_url") or "").strip()
            if not sid or not url or sid in out:
                continue
            provider = r.get("provider") or "heygen"
            if provider != preferred_provider and not (
                preferred_provider == "latentsync_modal" and provider == "heygen"
            ):
                continue
            if (r.get("audio_url") or "") != cur_audio.get(sid, "__none__"):
                continue  # stale clip (segment audio changed) -> fallback
            out[sid] = url
    except Exception as e:
        log(podcast_id, f"lipsync clips resolve fallback: {e}")
    return out


def _extract_base_clip_frames(video_url: str, workdir: str, label: str, size: int, podcast_id: str):
    """Download a base clip (R2) and pre-extract looping RGBA frames sized to the
    speaker-card avatar (rounded square). Returns {"fps", "bright", "dim"} or None
    on ANY failure (â†’ static portrait fallback). T-1144a.

    NOT segment lip-sync â€” a looping "talking base clip visual". Uses ffmpeg + PIL
    only (already in the render image); no cv2/new deps, no HeyGen. 1:1 source â†’
    no letterboxing.
    """
    import glob
    import subprocess
    import httpx
    from PIL import Image, ImageDraw
    EXTRACT_FPS = 10
    try:
        clip_path = os.path.join(workdir, f"baseclip_{label}.mp4")
        with httpx.Client(timeout=60, follow_redirects=True) as client:
            resp = client.get(video_url)
            resp.raise_for_status()
            with open(clip_path, "wb") as fh:
                fh.write(resp.content)
        frames_dir = os.path.join(workdir, f"baseclip_{label}_frames")
        os.makedirs(frames_dir, exist_ok=True)
        subprocess.run(
            ["ffmpeg", "-y", "-i", clip_path, "-vf", f"fps={EXTRACT_FPS}",
             os.path.join(frames_dir, "%04d.png")],
            capture_output=True, timeout=120,
        )
        files = sorted(glob.glob(os.path.join(frames_dir, "*.png")))
        if not files:
            return None
        mask = Image.new("L", (size, size), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * 0.14), fill=255)
        bright, dim = [], []
        for fp in files:
            rgba = Image.open(fp).convert("RGB").resize((size, size)).convert("RGBA")
            rgba.putalpha(mask)
            bright.append(rgba)
            r_, g_, b_, a_ = rgba.split()
            dim.append(Image.merge("RGBA", (
                Image.eval(r_, lambda v: int(v * 0.54)),
                Image.eval(g_, lambda v: int(v * 0.54)),
                Image.eval(b_, lambda v: int(v * 0.54)),
                a_,
            )))
        return {"fps": EXTRACT_FPS, "bright": bright, "dim": dim}
    except Exception as e:
        log(podcast_id, f"base clip frames fallback ({label}): {e}")
        return None


def _extract_editorial_clip_frames(video_url: str, workdir: str, label: str, width: int, height: int, podcast_id: str):
    """Extract a studio clip as full-frame editorial images.

    Frames are kept at half resolution to bound memory, then upscaled while
    composing. This is the real-studio path: no avatar cards or split screen.
    """
    import glob
    import subprocess
    import httpx
    from PIL import Image
    extract_fps = 8
    iw, ih = max(320, width // 2), max(180, height // 2)
    try:
        clip_path = os.path.join(workdir, f"editorial_{label}.mp4")
        with httpx.Client(timeout=90, follow_redirects=True) as client:
            resp = client.get(video_url)
            resp.raise_for_status()
            with open(clip_path, "wb") as fh:
                fh.write(resp.content)
        frames_dir = os.path.join(workdir, f"editorial_{label}_frames")
        os.makedirs(frames_dir, exist_ok=True)
        vf = f"fps={extract_fps},scale={iw}:{ih}:force_original_aspect_ratio=increase,crop={iw}:{ih}"
        subprocess.run(
            ["ffmpeg", "-y", "-i", clip_path, "-vf", vf, os.path.join(frames_dir, "%04d.jpg")],
            capture_output=True, timeout=180,
        )
        files = sorted(glob.glob(os.path.join(frames_dir, "*.jpg")))
        frames = [Image.open(fp).convert("RGB").copy() for fp in files]
        return {"fps": extract_fps, "frames": frames} if frames else None
    except Exception as e:
        log(podcast_id, f"editorial clip frames fallback ({label}): {e}")
        return None


def _load_editorial_still(image_url: str, width: int, height: int, podcast_id: str):
    """Load one permanent studio-pack still and crop it to the output frame."""
    import io
    import httpx
    from PIL import Image, ImageOps
    try:
        with httpx.Client(timeout=60, follow_redirects=True) as client:
            resp = client.get(image_url)
            resp.raise_for_status()
        return ImageOps.fit(Image.open(io.BytesIO(resp.content)).convert("RGB"), (width, height))
    except Exception as e:
        log(podcast_id, f"studio still fallback: {e}")
        return None


# Target speech level for per-segment RMS normalization (T-1137a-fix). Around
# -20 dBFS RMS reads natural for dialogue and leaves headroom for peaks.
_PODCAST_TARGET_RMS_DB = -20.0
_PODCAST_PEAK_CEIL_DB = -1.0


def _parse_volumedetect(stderr_text: str):
    """Extract (mean_volume, max_volume) in dBFS from ffmpeg `volumedetect`.

    Returns a (mean, max) tuple, or None if mean_volume is absent or non-finite.
    max defaults to 0.0 when not present. Pure/testable â€” no ffmpeg needed.
    """
    import math
    import re
    mm = re.search(r"mean_volume:\s*(-?\d+(?:\.\d+)?)\s*dB", stderr_text)
    if not mm:
        return None
    mx = re.search(r"max_volume:\s*(-?\d+(?:\.\d+)?)\s*dB", stderr_text)
    try:
        mean = float(mm.group(1))
        peak = float(mx.group(1)) if mx else 0.0
        if not (math.isfinite(mean) and math.isfinite(peak)):
            return None
        return (mean, peak)
    except ValueError:
        return None


def _podcast_normalize_segment(mp3_path: str, wav_path: str, podcast_id: str):
    """Normalize one segment to a fixed RMS target (T-1137a-fix).

    loudnorm (single- AND two-pass) left some turns ~16 dB quieter because its
    linear mode caps gain to protect the true-peak, so a soft turn with one stray
    transient stays quiet. We RMS-normalize instead: measure mean_volume
    (volumedetect), apply the gain to hit the target, and a peak limiter catches
    stray transients â€” so the BODY of every turn reaches the same level regardless
    of a single loud peak. Deterministic, no pumping.

    Fallback-safe: any measurement/parse/apply failure falls back to the original
    single-pass loudnorm and never leaves the render without a wav.
    """
    import os
    import subprocess

    def _apply(af: str) -> bool:
        p = subprocess.run(
            ["ffmpeg", "-y", "-i", mp3_path, "-af", af, "-ar", "44100", "-ac", "1", wav_path],
            capture_output=True, timeout=120,
        )
        return p.returncode == 0 and os.path.exists(wav_path) and os.path.getsize(wav_path) > 0

    try:
        p1 = subprocess.run(
            ["ffmpeg", "-i", mp3_path, "-af", "volumedetect", "-f", "null", "-"],
            capture_output=True, timeout=120,
        )
        parsed = _parse_volumedetect(p1.stderr.decode("utf-8", "ignore"))
        if not parsed:
            raise ValueError("no mean_volume in volumedetect output")
        mean, peak = parsed
        # Clamp the correction: a near-silent clip (huge gain) or an already-hot
        # clip (negative gain) shouldn't get an extreme adjustment.
        gain = max(-30.0, min(40.0, _PODCAST_TARGET_RMS_DB - mean))
        # Tier 1: full RMS gain + peak limiter (level auto-leveling disabled so it
        # only limits and doesn't undo our gain; limit=0.9 â‰ˆ -0.9 dBFS ceiling).
        if _apply(f"volume={gain:.2f}dB,alimiter=level=false:limit=0.9"):
            return
        # Tier 2 (if the limiter filter/flags are unavailable): limiter-free, with
        # the gain capped so the measured peak can't exceed the ceiling. Fixes most
        # of the gap without any pumping/clipping.
        gain2 = min(gain, _PODCAST_PEAK_CEIL_DB - peak)
        if _apply(f"volume={gain2:.2f}dB"):
            return
        raise RuntimeError("rms normalize passes failed")
    except Exception as e:
        log(podcast_id, f"rms normalize fallback -> single-pass loudnorm: {e}")

    # Fallback: original single-pass behaviour (never break the render).
    subprocess.run(
        ["ffmpeg", "-y", "-i", mp3_path, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
         "-ar", "44100", "-ac", "1", wav_path],
        capture_output=True, timeout=120,
    )


@app.function(image=overlay_image, secrets=[secrets], timeout=1800, retries=0)
def render_podcast(podcast_id: str) -> str:
    """Render a two-shot voice-first podcast MP4 from ready segments.

    Reads everything server-side from Supabase (never trusts a client payload):
    podcast (layout/aspect/title), speakers (host/guest), and segments
    (audio_url/text/order). Probes the REAL audio durations with ffprobe and
    rewrites start_ms/end_ms, composes a two-shot timeline with deterministic
    captions, muxes the concatenated dialogue, uploads to R2 and writes
    podcasts.video_url + render_status='done'. On failure: render_status='failed'.

    CPU only. No lip-sync. The TTS provider is never referenced here.
    """
    import subprocess
    import tempfile
    import httpx
    from PIL import Image, ImageDraw, ImageFont

    sb = get_supabase_client()

    def fail(msg: str):
        log(podcast_id, f"render_podcast failed: {msg}")
        try:
            sb.table("podcasts").update({"render_status": "failed", "render_error": msg[:2000]}).eq("id", podcast_id).execute()
        except Exception as e:
            log(podcast_id, f"failed-status update error: {e}")
        return ""

    try:
        sb.table("podcasts").update({"render_status": "rendering", "render_error": None}).eq("id", podcast_id).execute()

        podcast = sb.table("podcasts").select("*").eq("id", podcast_id).single().execute().data
        if not podcast:
            return fail("Podcast not found")
        if podcast.get("layout") != "two_shot":
            return fail("Only the two_shot layout is supported in V1")

        speakers = sb.table("podcast_speakers").select("*").eq("podcast_id", podcast_id).execute().data or []
        host = next((s for s in speakers if s["role"] == "host"), None)
        guest = next((s for s in speakers if s["role"] == "guest"), None)
        if not host or not guest:
            return fail("Podcast is missing its speakers")

        segments = (
            sb.table("podcast_segments").select("*").eq("podcast_id", podcast_id)
            .order("order_index").execute().data or []
        )
        if not segments:
            return fail("Podcast has no segments")
        if any(s.get("status") != "ready" or not s.get("audio_url") for s in segments):
            return fail("All segments must have ready audio before rendering")

        spk_by_id = {s["id"]: s for s in speakers}
        W = 1280 if podcast.get("aspect_ratio", "16:9") == "16:9" else 720
        H = 720 if podcast.get("aspect_ratio", "16:9") == "16:9" else 1280

        workdir = tempfile.mkdtemp(prefix="podcast-")
        # 1) Download + transcode each segment to a uniform wav, probe real duration.
        # Use httpx (not urllib) â€” R2's edge rejects the default urllib UA (403).
        seg_wavs, durations = [], []
        with httpx.Client(timeout=120, follow_redirects=True) as client:
            for i, seg in enumerate(segments):
                mp3 = os.path.join(workdir, f"seg{i}.mp3")
                wav = os.path.join(workdir, f"seg{i}.wav")
                resp = client.get(seg["audio_url"])
                resp.raise_for_status()
                with open(mp3, "wb") as fh:
                    fh.write(resp.content)
                # Per-segment loudness normalization (EBU R128) so speakers sit at a
                # consistent level. Two-pass (T-1137a) â€” single-pass left some
                # turns 15-20 dB quieter; two-pass hits the target precisely.
                _podcast_normalize_segment(mp3, wav, podcast_id)
                seg_wavs.append(wav)
                durations.append(_podcast_probe_duration(wav))

        # 2) Build the dialogue track: seg + silence gap between turns.
        gap = os.path.join(workdir, "gap.wav")
        subprocess.run(["ffmpeg", "-y", "-f", "lavfi", "-i",
                        f"anullsrc=r=44100:cl=mono", "-t", str(PODCAST_GAP_MS / 1000.0), gap],
                       capture_output=True, timeout=60)
        concat_list = os.path.join(workdir, "audio.txt")
        with open(concat_list, "w") as f:
            for i, wav in enumerate(seg_wavs):
                f.write(f"file '{wav}'\n")
                if i < len(seg_wavs) - 1:
                    f.write(f"file '{gap}'\n")
        full_audio = os.path.join(workdir, "full.wav")
        subprocess.run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", concat_list, "-c", "copy", full_audio],
                       capture_output=True, timeout=120)

        # 3) Timeline from REAL durations; rewrite start_ms/end_ms in DB.
        timeline, cursor = [], 0.0
        for i, seg in enumerate(segments):
            start = cursor
            end = start + durations[i]
            timeline.append((start, end, seg))
            sb.table("podcast_segments").update({
                "start_ms": int(start * 1000), "end_ms": int(end * 1000),
            }).eq("id", seg["id"]).execute()
            cursor = end + PODCAST_GAP_MS / 1000.0
        total = max(cursor, 1.0)

        # 4) Studio-style visuals + fonts.
        # Prefer a real persona portrait when the speaker has one (T-1136e);
        # fall back to the generated placeholder on any miss (fallback-safe).
        owner_id = podcast.get("user_id")
        host_av = _resolve_persona_avatar(sb, host, 220, podcast_id, owner_id) or _podcast_avatar(host.get("name", "Host"), _PODCAST_COLORS["host"])
        guest_av = _resolve_persona_avatar(sb, guest, 220, podcast_id, owner_id) or _podcast_avatar(guest.get("name", "Guest"), _PODCAST_COLORS["guest"])
        def dim_avatar(av):
            r, g, b, a = av.split()
            return Image.merge("RGBA", (
                Image.eval(r, lambda v: int(v * 0.54)),
                Image.eval(g, lambda v: int(v * 0.54)),
                Image.eval(b, lambda v: int(v * 0.54)),
                a,
            ))

        host_dim = dim_avatar(host_av)
        guest_dim = dim_avatar(guest_av)
        fb = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
        fr = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
        f_name = ImageFont.truetype(fb, 26 if W >= 1000 else 22)
        f_role = ImageFont.truetype(fb, 18 if W >= 1000 else 16)
        f_title = ImageFont.truetype(fb, 24 if W >= 1000 else 20)
        f_cap = ImageFont.truetype(fb, 30 if W >= 1000 else 26)
        f_small = ImageFont.truetype(fr, 17 if W >= 1000 else 15)

        def wrap(draw, text, font, maxw, maxlines=3):
            words, lines, cur = text.split(), [], ""
            for w_ in words:
                t = (cur + " " + w_).strip()
                if draw.textlength(t, font=font) <= maxw:
                    cur = t
                else:
                    if cur:
                        lines.append(cur)
                    cur = w_
                    if len(lines) >= maxlines:
                        break
            if cur and len(lines) < maxlines:
                lines.append(cur)
            return lines

        def draw_text_box(draw, xy, text, font, fill, pad_x=14, pad_y=8, bg=(18, 22, 32), radius=14):
            x, y = xy
            bb = draw.textbbox((0, 0), text, font=font)
            w_txt, h_txt = bb[2] - bb[0], bb[3] - bb[1]
            draw.rounded_rectangle([x, y, x + w_txt + pad_x * 2, y + h_txt + pad_y * 2], radius=radius, fill=bg)
            draw.text((x + pad_x, y + pad_y - bb[1]), text, font=font, fill=fill)
            return x + w_txt + pad_x * 2

        def draw_waveform(draw, x, y, width, color, active=True):
            bars = 18
            step = width / bars
            for i in range(bars):
                amp = (0.35 + 0.55 * abs(((i * 7) % 11) - 5) / 5) if active else 0.22
                h_bar = int(10 + amp * 34)
                bx = int(x + i * step)
                draw.rounded_rectangle([bx, y - h_bar // 2, bx + 5, y + h_bar // 2], radius=3,
                                       fill=color if active else (74, 82, 100))

        def draw_background(draw):
            top = (248, 250, 255) if W >= 1000 else (245, 248, 253)
            bottom = (224, 231, 243)
            for yy in range(H):
                t_ = yy / max(1, H - 1)
                draw.line([(0, yy), (W, yy)], fill=_podcast_mix(top, bottom, t_))
            draw.ellipse([-W * 0.18, H * 0.08, W * 0.34, H * 0.72], fill=(226, 244, 243))
            draw.ellipse([W * 0.66, H * 0.02, W * 1.18, H * 0.72], fill=(235, 229, 255))
            draw.rounded_rectangle([W * 0.12, H * 0.72, W * 0.88, H * 0.90], radius=36, fill=(222, 228, 239))
            draw.rounded_rectangle([W * 0.14, H * 0.74, W * 0.86, H * 0.88], radius=30, fill=(240, 243, 249))

        landscape = W >= H
        panel_w = int(W * (0.34 if landscape else 0.39))
        panel_h = int(H * (0.48 if landscape else 0.36))
        gap_px = int(W * 0.045)
        x0 = (W - (panel_w * 2 + gap_px)) // 2
        y0 = int(H * (0.19 if landscape else 0.17))
        avatar_size = min(host_av.width, int(panel_h * 0.48))

        # Talking-duo base clips (T-1144a): if a speaker persona has a ready 1:1
        # base clip cached on R2, animate its looping frames in the card instead of
        # the static portrait. This is a "talking base clip visual", NOT segment
        # lip-sync. Fallback-safe: any miss keeps the static avatar. No HeyGen call.
        # Render mode: "static" bypasses base clips entirely (static
        # portraits only); "talking_visual" (default) keeps the looping-clip
        # visual; "lipsync_premium" plays cached segment clips when present and
        # falls back to talking_visual for missing/failed segments.
        _meta = podcast.get("metadata") or {}
        render_mode = _meta.get("render_mode") if isinstance(_meta, dict) else None
        if render_mode not in ("static", "talking_visual", "lipsync_premium"):
            render_mode = "talking_visual"
        _studio_base_ids = _meta.get("studio_base_clips") if isinstance(_meta, dict) else {}
        if not isinstance(_studio_base_ids, dict):
            _studio_base_ids = {}
        _studio_shot_urls = _meta.get("studio_shots") if isinstance(_meta, dict) else {}
        if not isinstance(_studio_shot_urls, dict):
            _studio_shot_urls = {}
        editorial_mode = bool(
            W >= H
            and render_mode in ("talking_visual", "lipsync_premium")
            and all(isinstance(_studio_shot_urls.get(k), str) for k in ("wide", "host", "guest"))
        )
        editorial_stills = {}
        if editorial_mode:
            for _key in ("wide", "host", "guest", "alternate"):
                _url = _studio_shot_urls.get(_key)
                if isinstance(_url, str) and _url.startswith("http"):
                    _still = _load_editorial_still(_url, W, H, podcast_id)
                    if _still:
                        editorial_stills[_key] = _still
            editorial_mode = all(k in editorial_stills for k in ("wide", "host", "guest"))
        # Per-segment lip-sync frames (T-1144b premium): {segment_id: frames dict}.
        # Populated only for lipsync_premium; empty otherwise â†’ talking_visual path.
        seg_lipsync_frames = {}
        host_editorial_frames = None
        guest_editorial_frames = None
        if render_mode == "static":
            host_frames = None
            guest_frames = None
            log(podcast_id, "render_mode=static â†’ static portraits (base clips bypassed)")
        else:
            _host_clip = _resolve_base_clip_url(
                sb, host, podcast_id, owner_id, _studio_base_ids.get("host")
            )
            _guest_clip = _resolve_base_clip_url(
                sb, guest, podcast_id, owner_id, _studio_base_ids.get("guest")
            )
            if editorial_mode:
                host_frames = None
                guest_frames = None
                host_editorial_frames = _extract_editorial_clip_frames(
                    _host_clip, workdir, "host", W, H, podcast_id
                ) if _host_clip else None
                guest_editorial_frames = _extract_editorial_clip_frames(
                    _guest_clip, workdir, "guest", W, H, podcast_id
                ) if _guest_clip else None
            else:
                host_frames = _extract_base_clip_frames(_host_clip, workdir, "host", avatar_size, podcast_id) if _host_clip else None
                guest_frames = _extract_base_clip_frames(_guest_clip, workdir, "guest", avatar_size, podcast_id) if _guest_clip else None
            log(podcast_id, f"render_mode={render_mode} â†’ talking-duo base clips host={'yes' if host_frames else 'no'} guest={'yes' if guest_frames else 'no'}")
            if render_mode == "lipsync_premium":
                # Read the cached per-segment lip-sync clips (Next already generated
                # them). Extract each into frames; the active speaker plays its clip
                # in sync during its segment. Missing/failed segments fall back to the
                # talking_visual base-clip loop above. NO HeyGen call here.
                _quality_mode = _meta.get("lipsync_quality_mode") if isinstance(_meta, dict) else None
                _ls = _resolve_segment_lipsync_clips(sb, podcast_id, _quality_mode or "premium")
                for _seg_id, _url in _ls.items():
                    _f = (
                        _extract_editorial_clip_frames(
                            _url, workdir, f"ls_{str(_seg_id)[:8]}", W, H, podcast_id
                        )
                        if editorial_mode
                        else _extract_base_clip_frames(
                            _url, workdir, f"ls_{str(_seg_id)[:8]}", avatar_size, podcast_id
                        )
                    )
                    if _f:
                        seg_lipsync_frames[_seg_id] = _f
                log(podcast_id, f"lipsync_premium â†’ {len(seg_lipsync_frames)}/{len(_ls)} segment clips ready (rest fallback to talking_visual)")

        bar_x, bar_y, bar_w = int(W * 0.16), H - 34, int(W * 0.68)

        # The whole layout is constant WITHIN a segment (active speaker, caption,
        # static waveform) â€” only the progress bar animates. So we render ONE base
        # image per segment and per output frame just copy it and draw the bar.
        # This keeps a 10-min render fast on CPU (no full redraw 24Ã—/s).
        def build_base(active):
            img = Image.new("RGB", (W, H), (248, 250, 255))
            d = ImageDraw.Draw(img)
            draw_background(d)
            active_role = spk_by_id.get(active["speaker_id"], {}).get("role", "host")
            acol = _PODCAST_COLORS[active_role]
            podcast_title = (podcast.get("title") or "Podcast Video").strip()[:54]
            title_w = d.textlength(podcast_title, font=f_title)
            d.text(((W - title_w) / 2, int(H * 0.055)), podcast_title, font=f_title, fill=(18, 24, 34))

            for idx, (sp, av, av_dim, role) in enumerate([
                (host, host_av, host_dim, "host"), (guest, guest_av, guest_dim, "guest"),
            ]):
                col = _PODCAST_COLORS[role]
                is_active = role == active_role
                px = x0 + idx * (panel_w + gap_px)
                box = [px, y0, px + panel_w, y0 + panel_h]
                shadow = [box[0] + 8, box[1] + 10, box[2] + 8, box[3] + 10]
                d.rounded_rectangle(shadow, radius=30, fill=(203, 211, 225))
                d.rounded_rectangle(box, radius=30, fill=(255, 255, 255) if is_active else (235, 239, 247))
                d.rounded_rectangle(box, radius=30, outline=col if is_active else (218, 224, 235), width=5 if is_active else 2)

                header_y = y0 + 20
                role_label = "HOST" if role == "host" else "GUEST"
                draw_text_box(d, (px + 22, header_y), role_label, f_role,
                              (8, 14, 24) if is_active else (112, 122, 138),
                              bg=col if is_active else (224, 229, 239), radius=12)
                nm = (sp.get("name") or role.title()).strip()[:24]
                d.text((px + 22, header_y + 44), nm, font=f_name,
                       fill=(18, 24, 34) if is_active else (94, 105, 123))

                ax = px + (panel_w - avatar_size) // 2
                ay = y0 + int(panel_h * 0.22)
                _frames = host_frames if role == "host" else guest_frames
                if _frames:
                    # Baseline still from the talking base clip (animated per output
                    # frame in compose_frame) â€” a real person, not the round icon.
                    fr0 = (_frames["bright"] if is_active else _frames["dim"])[0]
                    img.paste(fr0, (ax, ay), fr0)
                else:
                    avi = (av if is_active else av_dim).resize((avatar_size, avatar_size))
                    img.paste(avi, (ax, ay), avi)
                draw_waveform(d, px + 32, y0 + panel_h - 54, panel_w - 64, col, active=is_active)
                if is_active:
                    d.ellipse([px + panel_w - 48, y0 + 26, px + panel_w - 26, y0 + 48], fill=col)

            caption_lines = wrap(d, active["text"], f_cap, W - int(W * 0.22), maxlines=3)
            line_h = 38 if W >= 1000 else 34
            cap_w = max([d.textlength(ln, font=f_cap) for ln in caption_lines] or [0]) + 58
            cap_h = len(caption_lines) * line_h + 34
            cap_x = (W - cap_w) / 2
            cap_y = H - 76 - cap_h
            d.rounded_rectangle([cap_x, cap_y, cap_x + cap_w, cap_y + cap_h], radius=24, fill=(18, 24, 34))
            d.rounded_rectangle([cap_x, cap_y, cap_x + 8, cap_y + cap_h], radius=4, fill=acol)
            cy = cap_y + 18
            for ln in caption_lines:
                tw = d.textlength(ln, font=f_cap)
                d.text(((W - tw) / 2, cy), ln, font=f_cap, fill=(247, 250, 255))
                cy += line_h

            # Static branding label (the progress bar fill is drawn per output frame).
            d.text((bar_x, bar_y - 28), "AlphoGen Podcast", font=f_small, fill=(88, 99, 116))
            d.rounded_rectangle([bar_x, bar_y, bar_x + bar_w, bar_y + 8], radius=4, fill=(207, 216, 229))
            return img, acol

        def build_editorial_overlay(active):
            """Broadcast graphics over a real, full-frame shared studio shot."""
            overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            d = ImageDraw.Draw(overlay, "RGBA")
            active_role = spk_by_id.get(active["speaker_id"], {}).get("role", "host")
            active_speaker = host if active_role == "host" else guest
            acol = _PODCAST_COLORS[active_role]
            # Gentle broadcast-safe gradients keep captions readable without
            # hiding the studio, microphones or the second person in wide shots.
            d.rectangle([0, 0, W, int(H * 0.15)], fill=(6, 10, 17, 112))
            d.rectangle([0, int(H * 0.64), W, H], fill=(6, 10, 17, 178))
            d.text((34, 24), "AlphoGen Podcast", font=f_small, fill=(244, 247, 252, 235))
            podcast_title = (podcast.get("title") or "Podcast Video").strip()[:54]
            title_w = d.textlength(podcast_title, font=f_title)
            d.text(((W - title_w) / 2, 20), podcast_title, font=f_title, fill=(255, 255, 255, 242))

            role_label = "HOST" if active_role == "host" else "GUEST"
            name = (active_speaker.get("name") or active_role.title()).strip()[:28]
            name_y = int(H * 0.68)
            role_end = draw_text_box(
                d, (42, name_y), role_label, f_role, (8, 14, 24, 255),
                bg=(*acol, 240), radius=10,
            )
            d.text((role_end + 16, name_y + 5), name, font=f_name, fill=(255, 255, 255, 245))

            caption_lines = wrap(d, active["text"], f_cap, W - 110, maxlines=3)
            line_h = 38 if W >= 1000 else 34
            cap_y = name_y + 52
            for line in caption_lines:
                d.text((48, cap_y), line, font=f_cap, fill=(255, 255, 255, 255),
                       stroke_width=1, stroke_fill=(0, 0, 0, 180))
                cap_y += line_h
            d.rounded_rectangle([bar_x, bar_y, bar_x + bar_w, bar_y + 8], radius=4, fill=(184, 194, 209, 170))
            return overlay, acol

        # One base per timeline entry (segment). Reused across all frames of that segment.
        bases = [build_base(seg) for (_st, _en, seg) in timeline]
        editorial_overlays = [build_editorial_overlay(seg) for (_st, _en, seg) in timeline] if editorial_mode else []

        def active_index(t):
            for i, (st, en, _s) in enumerate(timeline):
                if st <= t < en:
                    return i
                if t < st:
                    return max(0, i - 1)
            return len(timeline) - 1

        def compose_editorial_frame(idx, t):
            """Director-style shared-studio edit: wide, active close-up, reaction."""
            from PIL import Image
            st, en, active_seg = timeline[idx]
            active_role = spk_by_id.get(active_seg["speaker_id"], {}).get("role", "host")
            local_t = max(0.0, t - st)
            in_gap = not (st <= t < en)
            # Establish the physical shared set, then cut to the current speaker.
            if idx == 0 and local_t < min(1.15, max(0.0, en - st)):
                bg = editorial_stills["wide"]
            elif in_gap:
                bg = editorial_stills.get("alternate") or editorial_stills["wide"]
            else:
                segment_frames = seg_lipsync_frames.get(active_seg.get("id"))
                role_frames = host_editorial_frames if active_role == "host" else guest_editorial_frames
                chosen = segment_frames or role_frames
                if chosen and chosen.get("frames"):
                    frames = chosen["frames"]
                    frame_i = min(int(local_t * chosen["fps"]), len(frames) - 1)
                    bg = frames[frame_i]
                else:
                    bg = editorial_stills[active_role]
            if bg.size != (W, H):
                bg = bg.resize((W, H), Image.Resampling.LANCZOS)
            img = bg.convert("RGBA")
            overlay, acol = editorial_overlays[idx]
            img = Image.alpha_composite(img, overlay)
            d = ImageDraw.Draw(img, "RGBA")
            elapsed = min(1.0, max(0.0, t / total))
            fill_w = int(bar_w * elapsed)
            d.rounded_rectangle([bar_x, bar_y, bar_x + fill_w, bar_y + 8], radius=4, fill=(*acol, 255))
            return img.convert("RGB")

        def compose_frame(idx, t):
            base_img, acol = bases[idx]
            img = base_img.copy()
            # Animate the talking base-clip frames over the card avatar region
            # (T-1144a): loop the pre-extracted frames; active speaker bright,
            # listener dimmed. No-op when a speaker has no base clip (static).
            if host_frames or guest_frames or seg_lipsync_frames:
                active_seg = timeline[idx][2]
                active_role = spk_by_id.get(active_seg["speaker_id"], {}).get("role", "host")
                seg_start = timeline[idx][0]
                # Premium: the active speaker's segment lip-sync clip, played in sync
                # with its audio (local time within the segment, clamped â€” no loop).
                _ls = seg_lipsync_frames.get(active_seg.get("id")) if seg_lipsync_frames else None
                ay = y0 + int(panel_h * 0.22)
                for _i, (_role, _fr) in enumerate([("host", host_frames), ("guest", guest_frames)]):
                    _px = x0 + _i * (panel_w + gap_px)
                    if _role == active_role and _ls:
                        _lst = _ls["bright"]
                        _j = int(max(0.0, t - seg_start) * _ls["fps"])
                        _cur = _lst[min(_j, len(_lst) - 1)]
                        img.paste(_cur, (_px + (panel_w - avatar_size) // 2, ay), _cur)
                    elif render_mode == "lipsync_premium" and _role != active_role:
                        # Frozen inactive speaker, matched to the active clip's size
                        # and shape: reuse the talking_visual base-clip DIM frame
                        # (already avatar_size, rounded square). Only fall back to the
                        # round portrait — resized to avatar_size — if there is no base
                        # clip, so active/inactive cards never mismatch in size.
                        if _fr:
                            _cur = _fr["dim"][0]
                        else:
                            _base_dim = host_dim if _role == "host" else guest_dim
                            _cur = _base_dim.resize((avatar_size, avatar_size))
                        img.paste(_cur, (_px + (panel_w - avatar_size) // 2, ay), _cur)
                    elif _fr:
                        _lst = _fr["bright"] if _role == active_role else _fr["dim"]
                        _cur = _lst[int(t * _fr["fps"]) % len(_lst)]
                        img.paste(_cur, (_px + (panel_w - avatar_size) // 2, ay), _cur)
            d = ImageDraw.Draw(img)
            elapsed = min(1.0, max(0.0, t / total))
            fill_w = int(bar_w * elapsed)
            d.rounded_rectangle([bar_x, bar_y, bar_x + fill_w, bar_y + 8], radius=4, fill=acol)
            d.ellipse([bar_x + fill_w - 7, bar_y - 4, bar_x + fill_w + 7, bar_y + 12], fill=acol)
            return img

        # 5) Pipe frames â†’ ffmpeg with the dialogue track â†’ MP4.
        out_path = os.path.join(workdir, "output.mp4")
        proc = subprocess.Popen(
            ["ffmpeg", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
             "-r", str(PODCAST_FPS), "-i", "-", "-i", full_audio,
             "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-preset", "veryfast",
             "-c:a", "aac", "-b:a", "128k", "-shortest", out_path],
            stdin=subprocess.PIPE, stderr=subprocess.DEVNULL,
        )
        n_frames = int(total * PODCAST_FPS) + 1
        for fi in range(n_frames):
            t = fi / PODCAST_FPS
            idx = active_index(t)
            frame = compose_editorial_frame(idx, t) if editorial_mode else compose_frame(idx, t)
            proc.stdin.write(frame.tobytes())
        proc.stdin.close()
        if proc.wait() != 0:
            return fail("ffmpeg encode failed")

        with open(out_path, "rb") as f:
            mp4 = f.read()
        video_url = upload_to_r2(mp4, podcast_id, suffix="-podcast", content_type="video/mp4", extension="mp4")

        sb.table("podcasts").update({
            "video_url": video_url, "render_status": "done", "render_error": None,
        }).eq("id", podcast_id).execute()
        log(podcast_id, f"render_podcast done â†’ {video_url} ({total:.1f}s)")
        return video_url
    except Exception as e:
        return fail(normalize_error(e))


@app.function(image=base_image, secrets=[secrets], timeout=180, retries=0)
def trim_base_clip_for_lipsync(
    base_url: str,
    duration_seconds: float,
    podcast_id: str,
    segment_id: str,
    cache_key: str,
) -> str:
    """Prepare a persona base clip for HeyGen lip-sync (T-1144b / T-1149e).

    Two hard guarantees, because HeyGen rejects clips otherwise:
      1. The output ALWAYS has an AAC audio track. HeyGen requires the source
         video to carry audio even though it replaces it with our TTS. Some base
         clips (e.g. BytePlus studio motion bases) ship video-only → we mux a
         SILENT stereo AAC track via anullsrc so any provider's clip works.
      2. If duration_seconds > 0 and shorter than the source, the video is
         trimmed to it (HeyGen needs audio/video within ±15%; end_time alone is
         not enough). duration_seconds <= 0 means "keep full length, just ensure
         audio". Modal has ffmpeg; Vercel's ffmpeg-static is too fragile.
    Downloads base_url, re-encodes, uploads a permanent R2 copy, returns its URL.
    NO HeyGen call, no credit spend, no DB write.
    """
    import os as _os
    import shutil
    import subprocess
    import tempfile
    import uuid as _uuid
    import httpx

    dur = round(float(duration_seconds), 2)
    workdir = tempfile.mkdtemp()
    in_path = _os.path.join(workdir, "base.mp4")
    out_path = _os.path.join(workdir, "trimmed.mp4")
    try:
        with httpx.stream("GET", base_url, timeout=90, follow_redirects=True) as r:
            r.raise_for_status()
            with open(in_path, "wb") as f:
                for chunk in r.iter_bytes():
                    f.write(chunk)
        # Always synthesize a silent stereo AAC track and map it as the audio, so
        # the output is guaranteed to have audio regardless of the source (fixes
        # video-only BytePlus studio bases → HeyGen "audio missing"). HeyGen swaps
        # in our TTS anyway, so the silent track's content is irrelevant.
        cmd = [
            "ffmpeg", "-y",
            "-i", in_path,
            "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
            "-map", "0:v:0", "-map", "1:a:0",
        ]
        if dur > 0:
            cmd += ["-t", str(max(0.5, dur))]
        cmd += [
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast",
            "-c:a", "aac", "-shortest",
            "-movflags", "+faststart", out_path,
        ]
        subprocess.run(cmd, check=True, capture_output=True)
        with open(out_path, "rb") as f:
            data = f.read()

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
        bucket = os.environ.get("R2_BUCKET_NAME", "alphogenai-assets")
        # Unique suffix per trim: the R2 public host is a CDN, so reusing a key
        # can serve a stale edge copy to HeyGen (a prior trim of the same segment
        # was cached audio-less → "audio missing"). A fresh key = fresh fetch.
        key = f"podcast/lipsync-trim/{podcast_id}/{segment_id}-{cache_key}-{_uuid.uuid4().hex[:8]}.mp4"
        s3.put_object(Bucket=bucket, Key=key, Body=data, ContentType="video/mp4")
        public = os.environ.get("R2_PUBLIC_URL", "").rstrip("/")
        return f"{public}/{key}"
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


@app.function(
    image=overlay_image,
    secrets=[secrets],
    timeout=600,
    retries=0,
)
def normalize_native_presenter_base(base_id: str) -> dict:
    """Create a private, model-ready performance clip without GPU inference.

    Contract: square 720p, 25 fps, H.264/yuv420p, silent stereo AAC, max 30 s.
    The original private upload is preserved. The normalized copy stays in the
    same private Supabase bucket and is never exposed through a public URL.
    """
    import json
    import shutil
    import subprocess
    import tempfile
    from datetime import datetime, timezone
    from pathlib import Path
    from urllib.parse import quote

    import httpx

    table = "user_presenter_native_bases"
    bucket = "user-presenter-native-bases"
    version = "square-720p25-silent-v1"
    sb = get_supabase_client()
    workdir = Path(tempfile.mkdtemp(prefix="native-presenter-"))
    now_iso = lambda: datetime.now(timezone.utc).isoformat()

    def update_state(**fields):
        return (
            sb.table(table)
            .update(fields)
            .eq("id", base_id)
            .neq("status", "removed")
            .execute()
        )

    try:
        response = (
            sb.table(table)
            .select(
                "id,user_id,video_path,status,normalized_video_path,"
                "normalization_version"
            )
            .eq("id", base_id)
            .single()
            .execute()
        )
        row = response.data
        if not row:
            raise ValueError("native_base_not_found")
        if row.get("status") == "removed":
            raise ValueError("native_base_removed")
        if (
            row.get("status") == "ready"
            and row.get("normalized_video_path")
            and row.get("normalization_version") == version
        ):
            return {
                "base_id": base_id,
                "status": "ready",
                "reused": True,
            }

        source_path = str(row.get("video_path") or "")
        user_id = str(row.get("user_id") or "")
        if not source_path or not user_id:
            raise ValueError("native_base_source_missing")
        normalized_path = f"{user_id}/{base_id}/normalized-v1.mp4"

        update_state(
            status="normalizing",
            error_code=None,
            normalization_started_at=now_iso(),
        )

        supabase_url = (
            os.environ.get("SUPABASE_URL")
            or os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
        ).rstrip("/")
        service_key = (
            os.environ.get("SUPABASE_SERVICE_KEY")
            or os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
        )
        if not supabase_url or not service_key:
            raise RuntimeError("supabase_storage_not_configured")
        headers = {
            "Authorization": f"Bearer {service_key}",
            "apikey": service_key,
        }

        source_file = workdir / "source"
        output_file = workdir / "normalized.mp4"
        source_url = (
            f"{supabase_url}/storage/v1/object/{bucket}/"
            f"{quote(source_path, safe='/')}"
        )
        with httpx.stream(
            "GET",
            source_url,
            headers=headers,
            timeout=180,
            follow_redirects=True,
        ) as download:
            download.raise_for_status()
            with source_file.open("wb") as handle:
                for chunk in download.iter_bytes():
                    handle.write(chunk)

        normalize_cmd = [
            "ffmpeg", "-y",
            "-i", str(source_file),
            "-f", "lavfi",
            "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
            "-map", "0:v:0",
            "-map", "1:a:0",
            "-t", "30",
            "-vf",
            (
                "scale=720:720:force_original_aspect_ratio=increase,"
                "crop=720:720,"
                "fps=25,setsar=1"
            ),
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "18",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac",
            "-b:a", "96k",
            "-shortest",
            "-movflags", "+faststart",
            str(output_file),
        ]
        normalized = subprocess.run(
            normalize_cmd,
            capture_output=True,
            text=True,
            timeout=420,
        )
        if normalized.returncode != 0 or not output_file.exists():
            raise RuntimeError(
                f"normalization_failed: {(normalized.stderr or '')[-800:]}"
            )

        probe = subprocess.run(
            [
                "ffprobe", "-v", "error",
                "-print_format", "json",
                "-show_format", "-show_streams",
                str(output_file),
            ],
            capture_output=True,
            text=True,
            timeout=60,
            check=True,
        )
        metadata = json.loads(probe.stdout or "{}")
        streams = metadata.get("streams", [])
        video_stream = next(
            (stream for stream in streams if stream.get("codec_type") == "video"),
            None,
        )
        has_audio = any(
            stream.get("codec_type") == "audio" for stream in streams
        )
        duration = float(metadata.get("format", {}).get("duration") or 0)
        if (
            not video_stream
            or not has_audio
            or int(video_stream.get("width") or 0) != 720
            or int(video_stream.get("height") or 0) != 720
            or duration < 0.5
            or duration > 30.5
        ):
            raise RuntimeError("normalized_output_invalid")

        fps_raw = str(
            video_stream.get("avg_frame_rate")
            or video_stream.get("r_frame_rate")
            or "25/1"
        )
        numerator, _, denominator = fps_raw.partition("/")
        fps = float(numerator) / max(float(denominator or 1), 1)

        upload_url = (
            f"{supabase_url}/storage/v1/object/{bucket}/"
            f"{quote(normalized_path, safe='/')}"
        )
        upload_headers = {
            **headers,
            "Content-Type": "video/mp4",
            "x-upsert": "true",
        }
        upload = httpx.post(
            upload_url,
            headers=upload_headers,
            content=output_file.read_bytes(),
            timeout=180,
        )
        upload.raise_for_status()

        update_state(
            status="ready",
            error_code=None,
            normalized_video_path=normalized_path,
            normalized_duration_seconds=round(duration, 3),
            normalized_width=720,
            normalized_height=720,
            normalized_fps=round(fps, 3),
            normalization_version=version,
            normalized_at=now_iso(),
        )
        return {
            "base_id": base_id,
            "status": "ready",
            "reused": False,
            "duration_seconds": round(duration, 3),
            "width": 720,
            "height": 720,
            "fps": round(fps, 3),
        }
    except Exception as exc:
        print(f"[native-presenter:{base_id}] normalization failed: {exc}")
        try:
            update_state(status="failed", error_code="normalization_failed")
        except Exception as update_exc:
            print(
                f"[native-presenter:{base_id}] failure state update failed: "
                f"{update_exc}"
            )
        raise
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


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
        image_url: Optional[str] = None
        references: Optional[dict] = None  # Multi-Reference V1 payload

    class FrameExtractRequest(BaseModel):
        job_id: str
        scene_index: int
        video_url: str

    class ConcatRequest(BaseModel):
        job_id: str

    class RenderExplainerRequest(BaseModel):
        job_id: str
        storyboard: dict
        brand: Optional[dict] = None
        product_url: Optional[str] = None
        voice: str = "af_heart"

    class RenderPodcastRequest(BaseModel):
        podcast_id: str

    class TrimBaseClipRequest(BaseModel):
        podcast_id: str
        segment_id: str
        base_url: str
        duration_seconds: float
        cache_key: str

    class NormalizeNativePresenterBaseRequest(BaseModel):
        base_id: str

    class RenderNativeProductAdRequest(BaseModel):
        job_id: str

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
                req.job_id, req.prompt, req.user_id, req.preferred_engine,
                req.image_url, req.references,
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

    @web.post("/extract-frame")
    async def extract_frame(req: FrameExtractRequest, x_webhook_secret: str = Header(None)):
        """Trigger ffmpeg last-frame extraction for a scene (multi-scene chaining).

        Spawns extract_last_frame on Modal (base_image, has ffmpeg). Returns
        immediately with 202-style success â€” the Next.js poller picks up the
        new last_frame_url on the next GET.
        """
        expected = os.environ.get("MODAL_WEBHOOK_SECRET")
        if expected and x_webhook_secret != expected:
            raise HTTPException(status_code=401, detail="Unauthorized")
        try:
            await extract_last_frame.spawn.aio(req.job_id, req.scene_index, req.video_url)
        except Exception as e:
            print(f"[webhook /extract-frame] spawn failed: {e}")
            raise HTTPException(status_code=500, detail=str(e)[:200])
        return {"success": True, "job_id": req.job_id, "scene_index": req.scene_index}

    @web.post("/concat-scenes")
    async def concat_scenes(req: ConcatRequest, x_webhook_secret: str = Header(None)):
        """Trigger final concat of all done scenes for a job.

        Spawns concat_and_finalize on Modal (reads clip_urls server-side from
        Supabase, never trusting client payload). Job is marked done when the
        Modal function finishes; the Next.js poller observes the new
        video_url.
        """
        expected = os.environ.get("MODAL_WEBHOOK_SECRET")
        if expected and x_webhook_secret != expected:
            raise HTTPException(status_code=401, detail="Unauthorized")
        try:
            await concat_and_finalize.spawn.aio(req.job_id)
        except Exception as e:
            print(f"[webhook /concat-scenes] spawn failed: {e}")
            raise HTTPException(status_code=500, detail=str(e)[:200])
        return {"success": True, "job_id": req.job_id}

    @web.post("/render-explainer")
    async def render_explainer_ep(req: RenderExplainerRequest, x_webhook_secret: str = Header(None)):
        """Render a code-based explainer (slides + Kokoro voice) for a research job.

        Spawns render_explainer (CPU, no GPU). The job is marked done with
        output_url_final when finished; the Next.js poller / Library observes it.
        """
        expected = os.environ.get("MODAL_WEBHOOK_SECRET")
        if expected and x_webhook_secret != expected:
            raise HTTPException(status_code=401, detail="Unauthorized")
        try:
            await render_explainer.spawn.aio(
                req.job_id, req.storyboard, req.brand, req.product_url, req.voice,
            )
        except Exception as e:
            print(f"[webhook /render-explainer] spawn failed: {e}")
            raise HTTPException(status_code=500, detail=str(e)[:200])
        return {"success": True, "job_id": req.job_id}

    @web.post("/render-podcast")
    async def render_podcast_ep(req: RenderPodcastRequest, x_webhook_secret: str = Header(None)):
        """Render a two-shot voice-first podcast (T-1131e). Spawns render_podcast
        (CPU). Modal reads podcast/speakers/segments server-side, writes
        podcasts.video_url + render_status when done; the Next.js poller observes it.
        """
        expected = os.environ.get("MODAL_WEBHOOK_SECRET")
        if expected and x_webhook_secret != expected:
            raise HTTPException(status_code=401, detail="Unauthorized")
        try:
            await render_podcast.spawn.aio(req.podcast_id)
        except Exception as e:
            print(f"[webhook /render-podcast] spawn failed: {e}")
            raise HTTPException(status_code=500, detail=str(e)[:200])
        return {"success": True, "podcast_id": req.podcast_id}

    @web.post("/trim-base-clip")
    async def trim_base_clip_ep(req: TrimBaseClipRequest, x_webhook_secret: str = Header(None)):
        """Trim a persona base clip to a segment's audio length for lip-sync
        (T-1144b). Runs ffmpeg on a CPU image and returns the R2 URL synchronously
        so the Next orchestration can pass a correctly-sized clip to HeyGen. No
        HeyGen call here, no credit spend."""
        expected = os.environ.get("MODAL_WEBHOOK_SECRET")
        if expected and x_webhook_secret != expected:
            raise HTTPException(status_code=401, detail="Unauthorized")
        try:
            url = await trim_base_clip_for_lipsync.remote.aio(
                req.base_url, req.duration_seconds, req.podcast_id, req.segment_id, req.cache_key,
            )
        except Exception as e:
            print(f"[webhook /trim-base-clip] failed: {e}")
            raise HTTPException(status_code=500, detail=str(e)[:200])
        return {"success": True, "url": url}

    @web.post("/normalize-native-presenter-base")
    async def normalize_native_presenter_base_ep(
        req: NormalizeNativePresenterBaseRequest,
        x_webhook_secret: str = Header(None),
    ):
        """Spawn private CPU normalization for one retained performance clip."""
        expected = os.environ.get("MODAL_WEBHOOK_SECRET")
        if not expected or x_webhook_secret != expected:
            raise HTTPException(status_code=401, detail="Unauthorized")
        try:
            await normalize_native_presenter_base.spawn.aio(req.base_id)
        except Exception as e:
            print(
                "[webhook /normalize-native-presenter-base] spawn failed: "
                f"{e}"
            )
            raise HTTPException(status_code=500, detail=str(e)[:200])
        return {"success": True, "base_id": req.base_id}

    @web.post("/render-native-product-ad")
    async def render_native_product_ad_ep(
        req: RenderNativeProductAdRequest,
        x_webhook_secret: str = Header(None),
    ):
        """Spawn the provider-neutral native Product Ad compositor."""
        expected = os.environ.get("MODAL_WEBHOOK_SECRET")
        if not expected or x_webhook_secret != expected:
            raise HTTPException(status_code=401, detail="Unauthorized")
        try:
            await render_native_product_ad.spawn.aio(req.job_id)
        except Exception as e:
            print(f"[webhook /render-native-product-ad] spawn failed: {e}")
            raise HTTPException(status_code=500, detail=str(e)[:200])
        return {"success": True, "job_id": req.job_id}

    @web.post("/apply-voiceover")
    async def apply_voiceover(req: ConcatRequest, x_webhook_secret: str = Header(None)):
        """Mux the cloned-voice track into a Story Video's final video.

        Spawns apply_voiceover_to_job (reads video_url + avatar_final.audio_url
        server-side from Supabase). Job is marked done when finished; the
        Next.js poller observes the new video_url.
        """
        expected = os.environ.get("MODAL_WEBHOOK_SECRET")
        if expected and x_webhook_secret != expected:
            raise HTTPException(status_code=401, detail="Unauthorized")
        try:
            await apply_voiceover_to_job.spawn.aio(req.job_id)
        except Exception as e:
            print(f"[webhook /apply-voiceover] spawn failed: {e}")
            raise HTTPException(status_code=500, detail=str(e)[:200])
        return {"success": True, "job_id": req.job_id}

    @web.post("/apply-research-voiceover")
    async def apply_research_voiceover(req: ConcatRequest, x_webhook_secret: str = Header(None)):
        """Mux a Research Story's TTS voice-over into its final video (T-1113).

        Reads video_url + voiceover_url server-side from Supabase (never trusts
        the client). Returns the voiced URL synchronously so the SaaS keeps the
        raw video_url and writes the voiced copy to output_url_final. On failure
        the SaaS route falls back to the raw video.
        """
        expected = os.environ.get("MODAL_WEBHOOK_SECRET")
        if expected and x_webhook_secret != expected:
            raise HTTPException(status_code=401, detail="Unauthorized")
        try:
            output_url = await apply_research_voiceover_to_video.remote.aio(req.job_id)
        except Exception as e:
            print(f"[webhook /apply-research-voiceover] failed: {e}")
            raise HTTPException(status_code=500, detail=str(e)[:200])
        return {"success": True, "job_id": req.job_id, "output_url": output_url}

    class OverlayRequest(BaseModel):
        job_id: str
        video_url: str
        overlay_plan: dict

    @web.post("/apply-overlays")
    async def apply_overlays(req: OverlayRequest, x_webhook_secret: str = Header(None)):
        """Burn deterministic post-production overlays onto a completed video.

        Runs on a CPU image (ffmpeg + Pillow). This endpoint returns the
        branded URL synchronously so the SaaS can keep the raw video_url and
        write the branded copy to output_url_final. If this endpoint fails, the
        SaaS route falls back to the raw video.
        """
        expected = os.environ.get("MODAL_WEBHOOK_SECRET")
        if expected and x_webhook_secret != expected:
            raise HTTPException(status_code=401, detail="Unauthorized")
        try:
            output_url = await apply_overlays_to_video.remote.aio(
                req.video_url,
                req.job_id,
                req.overlay_plan,
            )
        except Exception as e:
            print(f"[webhook /apply-overlays] failed: {e}")
            raise HTTPException(status_code=500, detail=str(e)[:200])
        return {"success": True, "job_id": req.job_id, "output_url": output_url}

    class SocialExportRequest(BaseModel):
        job_id: str
        video_url: str

    @web.post("/export-social")
    async def trigger_export_social(req: SocialExportRequest, x_webhook_secret: str = Header(None)):
        """Trigger ffmpeg multi-format export (9:16, 1:1, 16:9).

        Spawns export_social_formats on Modal (base_image, has ffmpeg).
        Results are written to social_exports column when done.
        """
        expected = os.environ.get("MODAL_WEBHOOK_SECRET")
        if expected and x_webhook_secret != expected:
            raise HTTPException(status_code=401, detail="Unauthorized")
        try:
            await export_social_formats.spawn.aio(req.video_url, req.job_id)
        except Exception as e:
            print(f"[webhook /export-social] spawn failed: {e}")
            raise HTTPException(status_code=500, detail=str(e)[:200])
        return {"success": True, "job_id": req.job_id}

    @web.post("/flush-cache")
    async def flush_cache(x_webhook_secret: str = Header(None)):
        """Invalidate in-memory engine registry + costs caches.

        Called by admin UI after editing engine configs.
        Auth via MODAL_WEBHOOK_SECRET.
        """
        expected = os.environ.get("MODAL_WEBHOOK_SECRET")
        if expected and x_webhook_secret != expected:
            raise HTTPException(status_code=401, detail="Unauthorized")

        try:
            from modal_app.engines.registry import invalidate_cache as inv_reg
            from modal_app.utils.costs import invalidate_cache as inv_costs
            inv_reg()
            inv_costs()
            print("[flush-cache] registry + costs caches invalidated")
            return {"success": True, "caches": ["registry", "costs"]}
        except Exception as e:
            print(f"[flush-cache] failed: {e}")
            return {"success": False, "error": str(e)[:200]}

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


@app.local_entrypoint()
def test_flux_nim(prompt: str = "A futuristic city skyline at sunset, cinematic lighting"):
    image_bytes = generate_image_flux_nim.remote(prompt)
    out_path = "output_flux_nim_test.png"
    with open(out_path, "wb") as f:
        f.write(image_bytes)
    print(f"Saved {len(image_bytes)/1024:.1f} KB â†’ {out_path}")


@app.local_entrypoint()
def test_ltx23(
    prompt: str = "A futuristic city skyline at sunset, cinematic lighting",
    image_url: str = "",
):
    """Test l'intÃ©gration generate_clip_ltx23 (FP8/SDK) â€” T2V par dÃ©faut.
    Passer --image-url <url> pour tester le mode I2V.
    Usage: modal run modal_app/video_pipeline.py::test_ltx23
    """
    mode = "I2V" if image_url else "T2V"
    print(f"[test_ltx23] mode={mode}")
    video_bytes = generate_clip_ltx23.remote(
        prompt, job_id="test-ltx23", image_url=(image_url or None),
    )
    out_path = f"output_ltx23_integration_{mode.lower()}.mp4"
    with open(out_path, "wb") as f:
        f.write(video_bytes)
    print(f"Saved {len(video_bytes)/1e6:.1f} MB â†’ {out_path}")
