"""
AlphoGenAI — T2I Model Lab: Setup Script
=========================================
Isolated from production (`alphogenai-v2`). Downloads each T2I candidate to
its own folder under /models/lab/ on the shared `alphogenai-models` volume.
Each candidate has its own local_entrypoint for on-demand fetching.

Usage:
    modal run modal_app/setup_model_lab.py::download_zimage_turbo
    modal run modal_app/setup_model_lab.py::download_qwen_image_2512
    modal run modal_app/setup_model_lab.py::download_dreamomni2
    modal run modal_app/setup_model_lab.py::download_flux_schnell
    modal run modal_app/setup_model_lab.py::download_flux_dev   # admin-only

Candidates:
  - Tongyi-MAI/Z-Image-Turbo          → /models/lab/z-image-turbo    (~12GB)
  - Qwen/Qwen-Image-2512               → /models/lab/qwen-image-2512  (~40GB)
  - xiabs/DreamOmni2                   → /models/lab/dreamomni2       (~15GB)
  - black-forest-labs/FLUX.1-schnell   → /models/lab/flux-schnell     (~24GB)
  - black-forest-labs/FLUX.1-dev       → /models/lab/flux-dev         (~24GB, admin-only)

The SDXL-Turbo baseline is already at /models/sdxl-turbo (production volume)
so no download is needed for it.
"""
import modal
import os

app = modal.App("alphogenai-model-lab-setup")

setup_image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "torch==2.5.1",
        "diffusers>=0.38.0",
        "transformers>=4.52.0",
        "accelerate>=0.33.0",
        "safetensors",
        "sentencepiece",
        "peft",
        "huggingface_hub",
    )
)

models_volume = modal.Volume.from_name("alphogenai-models", create_if_missing=True)


def _download(repo_id: str, local_name: str, label: str):
    """Idempotent snapshot_download to /models/lab/<local_name>.

    Uses a .hf-cache-complete sentinel file so the check works for both
    diffusers (model_index.json) and transformers (config.json) models.
    """
    from pathlib import Path
    from huggingface_hub import snapshot_download

    path = Path("/models/lab") / local_name
    complete_marker = path / ".hf-cache-complete"

    if path.exists() and complete_marker.exists():
        print(f"{label} — already downloaded, skipping")
        return

    if path.exists():
        import shutil
        print(f"{label} — incomplete, re-downloading...")
        shutil.rmtree(str(path))
    else:
        print(f"Downloading {label}...")

    hf_token = os.environ.get("HF_TOKEN")
    snapshot_download(
        repo_id=repo_id,
        local_dir=str(path),
        local_dir_use_symlinks=False,
        token=hf_token if hf_token else None,
    )
    complete_marker.touch()
    models_volume.commit()
    print(f"{label} ✓")


@app.function(image=setup_image, volumes={"/models": models_volume}, timeout=3600)
def _download_zimage_turbo():
    _download("Tongyi-MAI/Z-Image-Turbo", "z-image-turbo", "Z-Image-Turbo (~12GB)")


@app.function(image=setup_image, volumes={"/models": models_volume}, timeout=7200)
def _download_qwen_image_2512():
    _download("Qwen/Qwen-Image-2512", "qwen-image-2512", "Qwen-Image-2512 (~40GB)")


@app.function(image=setup_image, volumes={"/models": models_volume}, timeout=3600)
def _download_dreamomni2():
    _download("xiabs/DreamOmni2", "dreamomni2", "DreamOmni2 (~15GB)")


@app.function(image=setup_image, volumes={"/models": models_volume}, timeout=3600)
def _download_flux_schnell():
    _download("black-forest-labs/FLUX.1-schnell", "flux-schnell", "FLUX.1-schnell (~24GB)")


@app.function(image=setup_image, volumes={"/models": models_volume}, timeout=3600)
def _download_flux_dev():
    """Admin-only — FLUX.1-dev Non-Commercial License. Never deployed via API."""
    _download("black-forest-labs/FLUX.1-dev", "flux-dev", "FLUX.1-dev (~24GB, admin-only)")


@app.local_entrypoint()
def download_zimage_turbo():
    _download_zimage_turbo.remote()
    print("Done — run: modal run modal_app/model_lab.py::test_zimage_turbo")


@app.local_entrypoint()
def download_qwen_image_2512():
    _download_qwen_image_2512.remote()
    print("Done — run: modal run modal_app/model_lab.py::test_qwen_image_2512")


@app.local_entrypoint()
def download_dreamomni2():
    _download_dreamomni2.remote()
    print("Done — run: modal run modal_app/model_lab.py::test_dreamomni2")


@app.local_entrypoint()
def download_flux_schnell():
    _download_flux_schnell.remote()
    print("Done — run: modal run modal_app/model_lab.py::test_flux_schnell")


@app.local_entrypoint()
def download_flux_dev():
    _download_flux_dev.remote()
    print("Done — run: modal run modal_app/model_lab.py::test_flux_dev")
