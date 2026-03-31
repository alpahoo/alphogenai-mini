"""
AlphoGenAI Mini — Model Setup Script
=====================================
Run this ONCE to download all open-source models to the Modal volume.
After this, the pipeline loads everything locally — no external calls.

Usage:
    modal run modal_app/setup_models.py

Models downloaded:
  - stabilityai/sdxl-turbo             (T2I, ~3.5GB)  — Free plan
  - Wan-AI/Wan2.2-I2V-A14B-Diffusers   (I2V, ~28GB)   — Free plan (SVI, MoE 27B/14B active)
  - Kijai/WanVideo_comfy LoRA           (SVI 2.0 Pro)  — Free plan
  - Lightricks/LTX-Video               (T2V, ~9GB)    — Pro plan
"""
import modal

app = modal.App("alphogenai-setup")

setup_image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "torch==2.5.1",
        "diffusers==0.37.1",
        "transformers==4.51.3",
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
    timeout=7200,  # 2 hours max — Wan 14B is ~28GB
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
    # Verify critical files exist (tokenizer vocab + sentencepiece for tokenizer_2)
    required_files = [
        sdxl_path / "tokenizer" / "vocab.json",
        sdxl_path / "tokenizer" / "merges.txt",
        sdxl_path / "tokenizer_2" / "vocab.json",
        sdxl_path / "tokenizer_2" / "merges.txt",
        sdxl_path / "model_index.json",
    ]
    sdxl_complete = sdxl_path.exists() and all(f.exists() for f in required_files)
    if sdxl_complete:
        print("[1/4] SDXL-Turbo — already downloaded (all tokenizers OK), skipping")
    else:
        if sdxl_path.exists():
            import shutil
            missing = [str(f.relative_to(sdxl_path)) for f in required_files if not f.exists()]
            print(f"[1/4] SDXL-Turbo — incomplete (missing: {missing}), re-downloading...")
            shutil.rmtree(str(sdxl_path))
        else:
            print("[1/4] Downloading SDXL-Turbo (~3.5GB)...")
        # Use snapshot_download to get ALL files (save_pretrained misses tokenizer files)
        from huggingface_hub import snapshot_download
        snapshot_download(
            repo_id="stabilityai/sdxl-turbo",
            local_dir=str(sdxl_path),
            local_dir_use_symlinks=False,
        )
        # Verify all required files are present
        missing = [str(f.relative_to(sdxl_path)) for f in required_files if not f.exists()]
        if missing:
            raise RuntimeError(f"SDXL-Turbo download incomplete, still missing: {missing}")
        print("[1/4] SDXL-Turbo ✓ (all tokenizer files verified)")

    # ------------------------------------------------------------------
    # 2. Wan2.2-I2V-A14B (Image-to-Video for SVI — MoE 27B total, 14B active)
    # ------------------------------------------------------------------
    wan_path = Path(MODEL_DIR) / "wan2.2-i2v-a14b"
    # Wan 14B uses T5 tokenizer (SentencePiece) — verify spiece.model exists
    wan_required = [
        wan_path / "model_index.json",
        wan_path / "tokenizer" / "spiece.model",
    ]
    wan_complete = wan_path.exists() and all(f.exists() for f in wan_required)
    if wan_complete:
        print("[2/4] Wan2.2-I2V-A14B — already downloaded (tokenizer OK), skipping")
    else:
        if wan_path.exists():
            import shutil
            missing = [str(f.relative_to(wan_path)) for f in wan_required if not f.exists()]
            print(f"[2/4] Wan2.2-I2V-A14B — incomplete (missing: {missing}), re-downloading...")
            shutil.rmtree(str(wan_path))
        else:
            print("[2/4] Downloading Wan2.2-I2V-A14B-Diffusers (~28GB)...")
        # Use snapshot_download to get ALL files (save_pretrained misses tokenizer files)
        from huggingface_hub import snapshot_download
        snapshot_download(
            repo_id="Wan-AI/Wan2.2-I2V-A14B-Diffusers",
            local_dir=str(wan_path),
            local_dir_use_symlinks=False,
        )
        missing = [str(f.relative_to(wan_path)) for f in wan_required if not f.exists()]
        if missing:
            raise RuntimeError(f"Wan 14B download incomplete, still missing: {missing}")
        print("[2/4] Wan2.2-I2V-A14B ✓ (tokenizer verified)")

    # ------------------------------------------------------------------
    # 3. SVI 2.0 Pro LoRA weights (for Wan2.2-I2V-A14B)
    # ------------------------------------------------------------------
    lora_path = Path(MODEL_DIR) / "svi-lora"
    lora_filename = "SVI_v2_PRO_Wan2.2-I2V-A14B_HIGH_lora_rank_128_fp16.safetensors"
    lora_file = lora_path / lora_filename
    if lora_file.exists():
        print("[3/4] SVI 2.0 Pro LoRA (14B) — already downloaded, skipping")
    else:
        print("[3/4] Downloading SVI 2.0 Pro LoRA for Wan2.2-I2V-A14B...")
        from huggingface_hub import hf_hub_download
        lora_path.mkdir(parents=True, exist_ok=True)
        hf_hub_download(
            repo_id="Kijai/WanVideo_comfy",
            filename=f"LoRAs/Stable-Video-Infinity/v2.0/{lora_filename}",
            local_dir=str(lora_path),
        )
        # Move file to expected location if nested
        nested = lora_path / "LoRAs" / "Stable-Video-Infinity" / "v2.0" / lora_filename
        if nested.exists() and not lora_file.exists():
            import shutil
            shutil.move(str(nested), str(lora_file))
        print("[3/4] SVI 2.0 Pro LoRA (14B) ✓")

    # ------------------------------------------------------------------
    # 4. LTX-Video (Pro plan — text-to-video)
    # ------------------------------------------------------------------
    ltx_path = Path(MODEL_DIR) / "ltx-video"
    ltx_required = [ltx_path / "model_index.json"]
    ltx_complete = ltx_path.exists() and all(f.exists() for f in ltx_required)
    if ltx_complete:
        print("[4/4] LTX-Video — already downloaded, skipping")
    else:
        if ltx_path.exists():
            import shutil
            print("[4/4] LTX-Video — incomplete, re-downloading...")
            shutil.rmtree(str(ltx_path))
        else:
            print("[4/4] Downloading LTX-Video (~9GB)...")
        from huggingface_hub import snapshot_download
        snapshot_download(
            repo_id="Lightricks/LTX-Video",
            local_dir=str(ltx_path),
            local_dir_use_symlinks=False,
        )
        print("[4/4] LTX-Video ✓")

    # Commit volume changes
    models_volume.commit()

    print("=" * 60)
    print("All models downloaded to /models/")
    print("  /models/sdxl-turbo/")
    print("  /models/wan2.2-i2v-a14b/")
    print(f"  /models/svi-lora/{lora_filename}")
    print("  /models/ltx-video/")
    print("=" * 60)


@app.local_entrypoint()
def main():
    download_all_models.remote()
    print("Setup complete! You can now deploy the pipeline:")
    print("  modal deploy modal_app/video_pipeline.py")
