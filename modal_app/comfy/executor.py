"""Thin native ComfyUI client; no business credentials or graph interpreter."""
import json
import subprocess
import time
from pathlib import Path

import requests

MAX_OUTPUT_BYTES = 80 * 1024 * 1024


def execute(graph: dict, reference: bytes | None, models: str = "/models") -> dict:
    root = Path("/root/ComfyUI")
    work = Path("/tmp/comfy-run")
    for folder in ("input", "output", "temp"):
        (work / folder).mkdir(parents=True, exist_ok=True)
    # The volume was verified by the CPU preparation command; never download on GPU.
    marker = Path(models) / ".h3-verified.json"
    if not marker.is_file():
        raise RuntimeError("MODELS_NOT_VERIFIED")
    import hashlib
    catalog_path = Path("/opt/comfy-catalog/h3-video@1.json")
    if json.loads(marker.read_text()).get("catalog_sha256") != hashlib.sha256(catalog_path.read_bytes()).hexdigest():
        raise RuntimeError("MODEL_CATALOG_CHANGED")
    for model in json.loads(catalog_path.read_text())["models"]:
        path = Path(models) / model["path"]
        if not path.is_file() or path.stat().st_size != model["bytes"]:
            raise RuntimeError("MODEL_FILES_CHANGED")
    config = work / "models.yaml"
    config.write_text(f"approved:\n  base_path: {models}\n  diffusion_models: diffusion_models\n"
                      "  text_encoders: text_encoders\n  vae: vae\n  loras: loras\n")
    if reference:
        if len(reference) > 10 * 1024 * 1024:
            raise ValueError("INPUT_TOO_LARGE")
        # Decode and re-encode to ensure a real image, strip metadata and bound pixels.
        from io import BytesIO
        from PIL import Image
        Image.MAX_IMAGE_PIXELS = 20_000_000
        with Image.open(BytesIO(reference)) as source:
            if source.width * source.height > 20_000_000:
                raise ValueError("IMAGE_TOO_LARGE")
            source.convert("RGB").save(work / "input/first_frame.png")
    process = subprocess.Popen([
        "python", "main.py", "--listen", "127.0.0.1", "--port", "8188",
        "--disable-auto-launch", "--disable-all-custom-nodes", "--disable-api-nodes",
        "--disable-metadata", "--extra-model-paths-config", str(config),
        "--input-directory", str(work / "input"), "--output-directory", str(work / "output"),
        "--temp-directory", str(work / "temp"),
    ], cwd=root, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    base = "http://127.0.0.1:8188"
    started = time.monotonic()
    deadline = started + 165
    try:
        while time.monotonic() < min(deadline, started + 60):
            if process.poll() is not None:
                raise RuntimeError("COMFY_START_FAILED")
            try:
                if requests.get(f"{base}/system_stats", timeout=2).ok:
                    break
            except requests.RequestException:
                pass
            time.sleep(1)
        else:
            raise TimeoutError("COMFY_START_TIMEOUT")
        response = requests.post(f"{base}/prompt", json={"prompt": graph}, timeout=10)
        if not response.ok:
            raise ValueError("INVALID_INPUT")
        prompt_id = response.json()["prompt_id"]
        while time.monotonic() < deadline:
            response = requests.get(f"{base}/history/{prompt_id}", timeout=5)
            response.raise_for_status()
            entry = response.json().get(prompt_id)
            if entry:
                if entry.get("status", {}).get("status_str") != "success":
                    raise RuntimeError("COMFY_EXECUTION_FAILED")
                output = entry["outputs"]["15"]
                items = output.get("images") or output.get("videos") or output.get("gifs")
                if not items or len(items) != 1:
                    raise RuntimeError("UNEXPECTED_OUTPUT")
                descriptor = items[0]
                if descriptor.get("type") != "output":
                    raise RuntimeError("UNEXPECTED_OUTPUT")
                with requests.get(f"{base}/view", params=descriptor, timeout=30, stream=True) as media:
                    media.raise_for_status()
                    chunks, size = [], 0
                    for chunk in media.iter_content(1024 * 1024):
                        size += len(chunk)
                        if size > MAX_OUTPUT_BYTES:
                            raise ValueError("OUTPUT_TOO_LARGE")
                        chunks.append(chunk)
                return {"mp4": b"".join(chunks), "generation_seconds": round(time.monotonic() - started, 2)}
            time.sleep(1)
        requests.post(f"{base}/api/jobs/{prompt_id}/cancel", timeout=5)
        raise TimeoutError("TIMEOUT")
    finally:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)
        # The Modal container is single-use; it is never returned to a cross-user pool.


def canonical_hash(graph: dict) -> str:
    import hashlib
    return hashlib.sha256(json.dumps(graph, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()
