"""Thin native ComfyUI client; no business credentials or graph interpreter."""
import json
import subprocess
import time
from pathlib import Path

import requests

MAX_OUTPUT_BYTES = 80 * 1024 * 1024

# Per-runtime execution facts. Graphs never choose these; the broker passes the runtime stored at admission.
RUNTIMES = {
    "h3-video@1": {"catalog": "h3-video@1.json", "marker": ".h3-verified.json", "output_node": "15", "key": "mp4", "deadline_s": 165},
    "moss-image@1": {"catalog": "moss-image@1.json", "marker": ".moss-image-verified.json", "output_node": "9", "key": "png", "deadline_s": 240},
}


# Largest H3 render the 180 s executor ran before: 640x640 (1:1, the biggest of the 480p sizes),
# 124 frames (5 s). Anything bigger (704p, or 480p longer than 5 s) goes to the long executor. Measured 25 Nov 2026 on H100: 704x1280 5 s
# took 322 s of execution plus a 37 s cold start.
H3_STANDARD_PIXEL_FRAMES = 640 * 640 * 124


def h3_needs_long_executor(graph: dict) -> bool:
    """True when the bound H3 graph is larger than what the standard executor was validated for.
    The graph is bound by the server template (node 6 carries width, height and length)."""
    try:
        inputs = graph["6"]["inputs"]
        return int(inputs["width"]) * int(inputs["height"]) * int(inputs["length"]) > H3_STANDARD_PIXEL_FRAMES
    except (KeyError, TypeError, ValueError):
        return False


# Per-request limit while polling ComfyUI for the result. A slow or failed poll is not fatal: ComfyUI's
# HTTP server can stall for several seconds while it loads models (seen 26 Nov 2026 on run 3a4fd6cb,
# which failed on a single 5 s read timeout). Only the run deadline ends the wait.
HISTORY_POLL_TIMEOUT_S = 10


def wait_for_history(base: str, prompt_id: str, deadline: float, process, *,
                     get=None, sleep=time.sleep, now=time.monotonic) -> dict | None:
    """History entry of the prompt, or None at the deadline. Retries slow, failed or malformed
    polls; stops at once if ComfyUI itself has exited."""
    get = get or requests.get
    while now() < deadline:
        if process.poll() is not None:
            raise RuntimeError("COMFY_EXITED")
        try:
            response = get(f"{base}/history/{prompt_id}", timeout=HISTORY_POLL_TIMEOUT_S)
            response.raise_for_status()
            entry = response.json().get(prompt_id)
        except (requests.RequestException, ValueError, AttributeError):
            entry = None
        if entry:
            return entry
        sleep(1)
    return None


def execute(graph: dict, reference: bytes | None, models: str = "/models", runtime: str = "h3-video@1",
            deadline_s: int | None = None) -> dict:
    spec = RUNTIMES[runtime]
    root = Path("/root/ComfyUI")
    work = Path("/tmp/comfy-run")
    for folder in ("input", "output", "temp"):
        (work / folder).mkdir(parents=True, exist_ok=True)
    # The volume was verified by the CPU preparation command; never download on GPU.
    marker = Path(models) / spec["marker"]
    if not marker.is_file():
        raise RuntimeError("MODELS_NOT_VERIFIED")
    import hashlib
    catalog_path = Path("/opt/comfy-catalog") / spec["catalog"]
    if json.loads(marker.read_text()).get("catalog_sha256") != hashlib.sha256(catalog_path.read_bytes()).hexdigest():
        raise RuntimeError("MODEL_CATALOG_CHANGED")
    for model in json.loads(catalog_path.read_text())["models"]:
        path = Path(models) / model["path"]
        if not path.is_file() or path.stat().st_size != model["bytes"]:
            raise RuntimeError("MODEL_FILES_CHANGED")
    config = work / "models.yaml"
    config.write_text(f"approved:\n  base_path: {models}\n  diffusion_models: diffusion_models\n"
                      "  text_encoders: text_encoders\n  vae: vae\n  loras: loras\n")
    if reference and runtime != "h3-video@1":
        raise ValueError("REFERENCE_NOT_SUPPORTED")
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
    deadline = started + (deadline_s or spec["deadline_s"])
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
        entry = wait_for_history(base, prompt_id, deadline, process)
        if entry:
            if entry.get("status", {}).get("status_str") != "success":
                raise RuntimeError("COMFY_EXECUTION_FAILED")
            output = entry["outputs"][spec["output_node"]]
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
            return {spec["key"]: b"".join(chunks), "generation_seconds": round(time.monotonic() - started, 2)}
        try:
            requests.post(f"{base}/api/jobs/{prompt_id}/cancel", timeout=5)
        except requests.RequestException:
            pass  # The single-use container is terminated anyway.
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
