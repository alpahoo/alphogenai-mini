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
  - Lightricks/LTX-2.3                  (T2V+Audio, BF16 full pipeline) — Pro plan (experimental)
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
    # 4. LTX-2.3 (BF16 full pipeline) — experimental T2V+Audio (Pro plan)
    #    Note: LTX-2.3-fp8 (transformer-only weights) is a separate repo —
    #    load that as a transformer override on top of this full pipeline.
    # ------------------------------------------------------------------
    ltx_path = Path(MODEL_DIR) / "ltx-2.3"
    ltx_required = [ltx_path / "model_index.json"]
    ltx_complete = ltx_path.exists() and all(f.exists() for f in ltx_required)
    if ltx_complete:
        print("[4/4] LTX-2.3 — already downloaded, skipping")
    else:
        if ltx_path.exists():
            import shutil
            print("[4/4] LTX-2.3 — incomplete, re-downloading...")
            shutil.rmtree(str(ltx_path))
        else:
            print("[4/4] Downloading LTX-2.3 (~30GB)...")
        from huggingface_hub import snapshot_download
        snapshot_download(
            repo_id="Lightricks/LTX-2.3",
            local_dir=str(ltx_path),
            local_dir_use_symlinks=False,
        )
        print("[4/4] LTX-2.3 ✓")

    # ------------------------------------------------------------------
    # 5. Real-ESRGAN 4x Upscaler (~67MB)
    # ------------------------------------------------------------------
    esrgan_path = Path(MODEL_DIR) / "realesrgan-x4plus"
    esrgan_file = esrgan_path / "RealESRGAN_x4.pth"
    if esrgan_file.exists():
        print("[5/7] Real-ESRGAN 4x — already downloaded, skipping")
    else:
        print("[5/7] Downloading Real-ESRGAN 4x (~67MB)...")
        from huggingface_hub import hf_hub_download
        esrgan_path.mkdir(parents=True, exist_ok=True)
        hf_hub_download(
            repo_id="ai-forever/Real-ESRGAN",
            filename="RealESRGAN_x4.pth",
            local_dir=str(esrgan_path),
        )
        print("[5/7] Real-ESRGAN 4x ✓")

    # ------------------------------------------------------------------
    # 6. VACE 14B (ali-vilab/VACE-Wan2.1-14B-Diffusers, ~28GB)
    # ------------------------------------------------------------------
    vace_path = Path(MODEL_DIR) / "vace-14b"
    vace_required = [vace_path / "model_index.json"]
    vace_complete = vace_path.exists() and all(f.exists() for f in vace_required)
    if vace_complete:
        print("[6/7] VACE 14B — already downloaded, skipping")
    else:
        if vace_path.exists():
            import shutil
            print("[6/7] VACE 14B — incomplete, re-downloading...")
            shutil.rmtree(str(vace_path))
        else:
            print("[6/7] Downloading VACE 14B (~28GB)...")
        from huggingface_hub import snapshot_download
        snapshot_download(
            repo_id="ali-vilab/VACE-Wan2.1-14B-Diffusers",
            local_dir=str(vace_path),
            local_dir_use_symlinks=False,
        )
        print("[6/7] VACE 14B ✓")

    # ------------------------------------------------------------------
    # 7. EchoMimicV2 (antgroup/echomimic_v2, ~5GB)
    # ------------------------------------------------------------------
    echomimic_path = Path(MODEL_DIR) / "echomimic-v2"
    echomimic_required = [echomimic_path / "pretrained_weights"]
    echomimic_complete = echomimic_path.exists() and all(f.exists() for f in echomimic_required)
    if echomimic_complete:
        print("[7/7] EchoMimicV2 — already downloaded, skipping")
    else:
        if echomimic_path.exists():
            import shutil
            print("[7/7] EchoMimicV2 — incomplete, re-downloading...")
            shutil.rmtree(str(echomimic_path))
        else:
            print("[7/7] Downloading EchoMimicV2 (~5GB)...")
        from huggingface_hub import snapshot_download
        snapshot_download(
            repo_id="antgroup/echomimic_v2",
            local_dir=str(echomimic_path),
            local_dir_use_symlinks=False,
        )
        print("[7/7] EchoMimicV2 ✓")

    # Commit volume changes
    models_volume.commit()

    print("=" * 60)
    print("All models downloaded to /models/")
    print("  /models/sdxl-turbo/")
    print("  /models/wan2.2-i2v-a14b/")
    print(f"  /models/svi-lora/{lora_filename}")
    print("  /models/ltx-2.3/")
    print("  /models/realesrgan-x4plus/")
    print("  /models/vace-14b/")
    print("  /models/echomimic-v2/")
    print("=" * 60)


@app.local_entrypoint()
def main():
    download_all_models.remote()
    print("Setup complete! You can now deploy the pipeline:")
    print("  modal deploy modal_app/video_pipeline.py")
