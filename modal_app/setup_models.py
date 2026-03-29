"""
AlphoGenAI Mini — Model Setup Script
=====================================
Run this ONCE to download all open-source models to the Modal volume.
After this, the pipeline loads everything locally — no external calls.

Usage:
    modal run modal_app/setup_models.py

Models downloaded:
  - stabilityai/sdxl-turbo          (T2I, ~3.5GB)  — Free plan
  - Wan-AI/Wan2.2-TI2V-5B           (I2V, ~10GB)   — Free plan (SVI)
  - Kijai/WanVideo_comfy LoRA        (SVI 2.0 Pro)  — Free plan
  - Lightricks/LTX-Video            (T2V, ~9GB)    — Pro plan
"""
import modal

app = modal.App("alphogenai-setup")

setup_image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "torch==2.5.1",
        "diffusers>=0.31.0",
        "transformers>=4.45.0",
        "accelerate>=0.33.0",
        "safetensors",
        "sentencepiece",
        "peft",
        "huggingface_hub",
    )
)

models_volume = modal.Volume.from_name("alphogenai-models", create_if_missing=True)

MODEL_DIR = "/models"


@app.function(
    image=setup_image,
    volumes={MODEL_DIR: models_volume},
    timeout=3600,  # 1 hour max for large downloads
)
def download_all_models():
    """Download all models to the Modal volume. Run once."""
    import torch
    from pathlib import Path

    print("=" * 60)
    print("AlphoGenAI — Downloading all models to volume")
    print("=" * 60)

    # ------------------------------------------------------------------
    # 1. SDXL-Turbo (replaces FLUX.1-schnell — not gated, open source)
    # ------------------------------------------------------------------
    sdxl_path = Path(MODEL_DIR) / "sdxl-turbo"
    if sdxl_path.exists() and any(sdxl_path.iterdir()):
        print("[1/4] SDXL-Turbo — already downloaded, skipping")
    else:
        print("[1/4] Downloading SDXL-Turbo (~3.5GB)...")
        from diffusers import AutoPipelineForText2Image
        pipe = AutoPipelineForText2Image.from_pretrained(
            "stabilityai/sdxl-turbo",
            torch_dtype=torch.float16,
            variant="fp16",
        )
        pipe.save_pretrained(str(sdxl_path))
        del pipe
        print("[1/4] SDXL-Turbo ✓")

    # ------------------------------------------------------------------
    # 2. Wan2.2-TI2V-5B (Image-to-Video for SVI)
    # ------------------------------------------------------------------
    wan_path = Path(MODEL_DIR) / "wan2.2-ti2v-5b"
    if wan_path.exists() and any(wan_path.iterdir()):
        print("[2/4] Wan2.2-TI2V-5B — already downloaded, skipping")
    else:
        print("[2/4] Downloading Wan2.2-TI2V-5B (~10GB)...")
        from diffusers import WanImageToVideoPipeline, AutoencoderKLWan
        vae = AutoencoderKLWan.from_pretrained(
            "Wan-AI/Wan2.2-TI2V-5B",
            subfolder="vae",
            torch_dtype=torch.float32,
        )
        pipe = WanImageToVideoPipeline.from_pretrained(
            "Wan-AI/Wan2.2-TI2V-5B",
            vae=vae,
            torch_dtype=torch.bfloat16,
        )
        pipe.save_pretrained(str(wan_path))
        del pipe, vae
        print("[2/4] Wan2.2-TI2V-5B ✓")

    # ------------------------------------------------------------------
    # 3. SVI 2.0 Pro LoRA weights
    # ------------------------------------------------------------------
    lora_path = Path(MODEL_DIR) / "svi-lora"
    lora_file = lora_path / "svi_2.0_pro_wan22_high.safetensors"
    if lora_file.exists():
        print("[3/4] SVI 2.0 Pro LoRA — already downloaded, skipping")
    else:
        print("[3/4] Downloading SVI 2.0 Pro LoRA...")
        from huggingface_hub import hf_hub_download
        lora_path.mkdir(parents=True, exist_ok=True)
        hf_hub_download(
            repo_id="Kijai/WanVideo_comfy",
            filename="LoRAs/Stable-Video-Infinity/v2.0/svi_2.0_pro_wan22_high.safetensors",
            local_dir=str(lora_path),
        )
        # Move file to expected location if nested
        nested = lora_path / "LoRAs" / "Stable-Video-Infinity" / "v2.0" / "svi_2.0_pro_wan22_high.safetensors"
        if nested.exists() and not lora_file.exists():
            import shutil
            shutil.move(str(nested), str(lora_file))
        print("[3/4] SVI 2.0 Pro LoRA ✓")

    # ------------------------------------------------------------------
    # 4. LTX-Video (Pro plan — text-to-video)
    # ------------------------------------------------------------------
    ltx_path = Path(MODEL_DIR) / "ltx-video"
    if ltx_path.exists() and any(ltx_path.iterdir()):
        print("[4/4] LTX-Video — already downloaded, skipping")
    else:
        print("[4/4] Downloading LTX-Video (~9GB)...")
        from diffusers import LTXPipeline
        pipe = LTXPipeline.from_pretrained(
            "Lightricks/LTX-Video",
            torch_dtype=torch.bfloat16,
        )
        pipe.save_pretrained(str(ltx_path))
        del pipe
        print("[4/4] LTX-Video ✓")

    # Commit volume changes
    models_volume.commit()

    print("=" * 60)
    print("All models downloaded to /models/")
    print("  /models/sdxl-turbo/")
    print("  /models/wan2.2-ti2v-5b/")
    print("  /models/svi-lora/svi_2.0_pro_wan22_high.safetensors")
    print("  /models/ltx-video/")
    print("=" * 60)


@app.local_entrypoint()
def main():
    download_all_models.remote()
    print("Setup complete! You can now deploy the pipeline:")
    print("  modal deploy modal_app/video_pipeline.py")
