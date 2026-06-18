"""
AlphoGenAI — T2I Model Lab (Step 1)
=====================================
Isolated, admin-only T2I comparison lab — separate Modal app from production.
Runs each self-hosted T2I candidate (plus the current SDXL-Turbo baseline)
against the same test prompt for side-by-side quality/speed comparison.

Download models first via setup_model_lab.py, then test:
    modal run modal_app/model_lab.py::test_zimage_turbo
    modal run modal_app/model_lab.py::test_qwen_image_2512
    modal run modal_app/model_lab.py::test_dreamomni2
    modal run modal_app/model_lab.py::test_flux_schnell
    modal run modal_app/model_lab.py::test_flux_dev          # admin-only
    modal run modal_app/model_lab.py::test_sdxl_turbo_baseline

Nothing here is wired into generate_clip(), generate_video_complete(),
the engine registry, or any Next.js route.

FLUX.1-dev licensing: internal evaluation only — this app is never deployed
to users. Confirm BFL's Non-Commercial License permits evaluation at your
company before using output beyond personal comparison.
"""
import modal

app = modal.App("alphogenai-model-lab")

lab_image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "torch==2.5.1",
        "diffusers>=0.38.0",
        "transformers>=4.52.0",
        "accelerate>=0.33.0",
        "safetensors",
        "sentencepiece",
        "peft",
        "pillow",
    )
)

models_volume = modal.Volume.from_name("alphogenai-models", create_if_missing=True)

GPU = "A100-80GB"
LAB_DIR = "/models/lab"
SDXL_TURBO_PATH = "/models/sdxl-turbo"

TEST_PROMPT = "A futuristic city skyline at sunset, cinematic lighting, ultra detailed"


def _require_model(path: str, label: str):
    from pathlib import Path
    if not Path(path).exists():
        models_root = Path("/models")
        contents = [c.name for c in models_root.iterdir()] if models_root.exists() else []
        raise FileNotFoundError(f"{label} missing at {path}. /models has: {contents}")


def _to_png_bytes(image) -> bytes:
    from io import BytesIO
    buf = BytesIO()
    image.save(buf, format="PNG")
    return buf.getvalue()


def _save_png(image_bytes: bytes, out_path: str):
    with open(out_path, "wb") as f:
        f.write(image_bytes)
    print(f"Saved {len(image_bytes)/1024:.1f} KB → {out_path}")


@app.function(image=lab_image, gpu=GPU, volumes={"/models": models_volume}, timeout=900)
def generate_image_zimage_turbo(prompt: str) -> bytes:
    """Z-Image-Turbo (Tongyi-MAI/Z-Image-Turbo) — Apache 2.0, 8-step fast T2I.

    Recommended first candidate: same step count as SDXL-Turbo (4-8 steps,
    guidance-free), far more parameters, #1 trending on HF.
    """
    import torch
    from diffusers import DiffusionPipeline

    path = f"{LAB_DIR}/z-image-turbo"
    _require_model(path, "Z-Image-Turbo")
    pipe = DiffusionPipeline.from_pretrained(
        path, torch_dtype=torch.bfloat16, local_files_only=True,
    ).to("cuda")
    image = pipe(
        prompt=prompt,
        num_inference_steps=8,
        guidance_scale=0.0,
        generator=torch.Generator(device="cuda").manual_seed(42),
    ).images[0]
    return _to_png_bytes(image)


@app.function(image=lab_image, gpu=GPU, volumes={"/models": models_volume}, timeout=1200)
def generate_image_qwen_image_2512(prompt: str) -> bytes:
    """Qwen-Image-2512 (Qwen/Qwen-Image-2512) — Apache 2.0, dated Dec 2025 release."""
    import torch
    from diffusers import DiffusionPipeline

    path = f"{LAB_DIR}/qwen-image-2512"
    _require_model(path, "Qwen-Image-2512")
    pipe = DiffusionPipeline.from_pretrained(
        path, torch_dtype=torch.bfloat16, local_files_only=True,
    ).to("cuda")
    image = pipe(
        prompt=prompt,
        num_inference_steps=30,
        generator=torch.Generator(device="cuda").manual_seed(42),
    ).images[0]
    return _to_png_bytes(image)


@app.function(image=lab_image, gpu=GPU, volumes={"/models": models_volume}, timeout=1200)
def generate_image_dreamomni2(prompt: str) -> bytes:
    """DreamOmni2 (xiabs/DreamOmni2) — Apache 2.0, ~7.6B. Uses transformers (not diffusers).

    Uses DiffusionPipeline auto-dispatch with trust_remote_code=True as a
    first attempt. If it fails, adapt this function to match the repo's
    inference_gen.py (check xiabs/DreamOmni2 model card for CLI usage).
    """
    import torch
    from diffusers import DiffusionPipeline

    path = f"{LAB_DIR}/dreamomni2"
    _require_model(path, "DreamOmni2")
    pipe = DiffusionPipeline.from_pretrained(
        path,
        torch_dtype=torch.bfloat16,
        local_files_only=True,
        trust_remote_code=True,
    ).to("cuda")
    image = pipe(
        prompt=prompt,
        generator=torch.Generator(device="cuda").manual_seed(42),
    ).images[0]
    return _to_png_bytes(image)


@app.function(image=lab_image, gpu=GPU, volumes={"/models": models_volume}, timeout=1200)
def generate_image_flux_schnell(prompt: str) -> bytes:
    """FLUX.1-schnell (self-host) — Apache 2.0, 12B, 4-step distilled."""
    import torch
    from diffusers import FluxPipeline

    path = f"{LAB_DIR}/flux-schnell"
    _require_model(path, "FLUX.1-schnell")
    pipe = FluxPipeline.from_pretrained(
        path, torch_dtype=torch.bfloat16, local_files_only=True,
    ).to("cuda")
    image = pipe(
        prompt=prompt,
        num_inference_steps=4,
        guidance_scale=0.0,
        generator=torch.Generator(device="cuda").manual_seed(42),
    ).images[0]
    return _to_png_bytes(image)


@app.function(image=lab_image, gpu=GPU, volumes={"/models": models_volume}, timeout=1800)
def generate_image_flux_dev(prompt: str) -> bytes:
    """FLUX.1-dev (self-host, admin-only) — FLUX.1-dev Non-Commercial License.

    Never exposed to users. Internal evaluation only.
    """
    import torch
    from diffusers import FluxPipeline

    path = f"{LAB_DIR}/flux-dev"
    _require_model(path, "FLUX.1-dev")
    pipe = FluxPipeline.from_pretrained(
        path, torch_dtype=torch.bfloat16, local_files_only=True,
    ).to("cuda")
    image = pipe(
        prompt=prompt,
        num_inference_steps=28,
        guidance_scale=3.5,
        generator=torch.Generator(device="cuda").manual_seed(42),
    ).images[0]
    return _to_png_bytes(image)


@app.function(image=lab_image, gpu=GPU, volumes={"/models": models_volume}, timeout=600)
def generate_image_sdxl_turbo(prompt: str) -> bytes:
    """SDXL-Turbo baseline — current production T2I step in generate_clip().

    Reuses the already-downloaded /models/sdxl-turbo from the production
    volume for apples-to-apples comparison against candidates.
    """
    import torch
    from diffusers import AutoPipelineForText2Image

    _require_model(SDXL_TURBO_PATH, "SDXL-Turbo")
    pipe = AutoPipelineForText2Image.from_pretrained(
        SDXL_TURBO_PATH, torch_dtype=torch.float16, local_files_only=True,
    ).to("cuda")
    image = pipe(
        prompt=prompt,
        num_inference_steps=4,
        guidance_scale=0.0,
        generator=torch.Generator(device="cuda").manual_seed(42),
    ).images[0]
    return _to_png_bytes(image)


# ===========================================================================
# Test entrypoints — one per candidate + baseline
# All write output_lab_<name>.png locally for manual inspection.
# ===========================================================================

@app.local_entrypoint()
def test_zimage_turbo(prompt: str = TEST_PROMPT):
    _save_png(generate_image_zimage_turbo.remote(prompt), "output_lab_zimage_turbo.png")


@app.local_entrypoint()
def test_qwen_image_2512(prompt: str = TEST_PROMPT):
    _save_png(generate_image_qwen_image_2512.remote(prompt), "output_lab_qwen_image_2512.png")


@app.local_entrypoint()
def test_dreamomni2(prompt: str = TEST_PROMPT):
    _save_png(generate_image_dreamomni2.remote(prompt), "output_lab_dreamomni2.png")


@app.local_entrypoint()
def test_flux_schnell(prompt: str = TEST_PROMPT):
    _save_png(generate_image_flux_schnell.remote(prompt), "output_lab_flux_schnell.png")


@app.local_entrypoint()
def test_flux_dev(prompt: str = TEST_PROMPT):
    _save_png(generate_image_flux_dev.remote(prompt), "output_lab_flux_dev.png")


@app.local_entrypoint()
def test_sdxl_turbo_baseline(prompt: str = TEST_PROMPT):
    _save_png(generate_image_sdxl_turbo.remote(prompt), "output_lab_sdxl_turbo.png")
