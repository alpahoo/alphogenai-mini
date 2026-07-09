"""
T-1147e2 - Modal GPU LatentSync one-clip lip-sync spike.

Experimental only. This file is intentionally isolated from production podcast
rendering. Run manually with an explicit GPU/cost GO to compare one short
AlphoGen persona clip + one AlphoGen TTS segment against the HeyGen baseline.
"""
from __future__ import annotations

import json
import os
import subprocess
import time
import uuid
from pathlib import Path
from typing import Any

import modal

app = modal.App("alphogenai-latentsync-spike")

secrets = modal.Secret.from_name("alphogenai-secrets-corrected-v2")
latentsync_volume = modal.Volume.from_name("alphogenai-latentsync-spike", create_if_missing=True)

# Keep this separate from the production Modal image. LatentSync pins a CUDA
# PyTorch stack and diffusion/video dependencies that should not touch render_podcast.
latentsync_image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("bash", "git", "ffmpeg", "libgl1", "libglib2.0-0", "wget")
    .pip_install("boto3", "requests")
    .run_commands(
        "git clone --depth 1 https://github.com/bytedance/LatentSync.git /opt/LatentSync",
        "cd /opt/LatentSync && pip install -r requirements.txt",
    )
)

SPIKE_ROOT = Path("/tmp/alphogen-latentsync-spike")
MODEL_ROOT = Path("/models/latentsync")


def _run(cmd: list[str], cwd: str | None = None, timeout: int = 900) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout)
    if result.returncode != 0:
        tail = (result.stderr or result.stdout)[-4000:]
        raise RuntimeError(f"Command failed ({result.returncode}): {' '.join(cmd)}\n{tail}")
    return result


def _download(url: str, path: Path) -> None:
    import requests

    with requests.get(url, stream=True, timeout=120) as response:
        response.raise_for_status()
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("wb") as handle:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    handle.write(chunk)


def _probe(path: Path) -> dict[str, Any]:
    result = _run(
        [
            "ffprobe",
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            str(path),
        ],
        timeout=60,
    )
    data = json.loads(result.stdout or "{}")
    streams = data.get("streams", [])
    duration = float(data.get("format", {}).get("duration") or 0)
    return {
        "duration_seconds": round(duration, 3),
        "streams": [
            {
                "type": s.get("codec_type"),
                "codec": s.get("codec_name"),
                "width": s.get("width"),
                "height": s.get("height"),
            }
            for s in streams
        ],
        "has_video": any(s.get("codec_type") == "video" for s in streams),
        "has_audio": any(s.get("codec_type") == "audio" for s in streams),
    }


def _upload_to_r2(file_bytes: bytes, key: str, content_type: str = "video/mp4") -> str:
    import boto3
    from botocore.config import Config

    required = ["R2_ENDPOINT", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"]
    missing = [name for name in required if not os.environ.get(name)]
    if missing:
        raise RuntimeError(f"R2 credentials missing in Modal secrets: {', '.join(missing)}")

    bucket = os.environ.get("R2_BUCKET_NAME", "alphogenai-assets")
    s3 = boto3.client(
        "s3",
        endpoint_url=os.environ["R2_ENDPOINT"],
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )
    s3.put_object(Bucket=bucket, Key=key, Body=file_bytes, ContentType=content_type)
    public_url = os.environ.get("R2_PUBLIC_URL", "").rstrip("/")
    return f"{public_url}/{key}"


def _ensure_latentsync_weights() -> None:
    marker = MODEL_ROOT / ".downloaded"
    if marker.exists():
        return

    MODEL_ROOT.mkdir(parents=True, exist_ok=True)
    repo = Path("/opt/LatentSync")
    checkpoints = repo / "checkpoints"
    checkpoints.mkdir(parents=True, exist_ok=True)

    _run(
        [
            "huggingface-cli",
            "download",
            "ByteDance/LatentSync-1.6",
            "latentsync_unet.pt",
            "--local-dir",
            str(MODEL_ROOT),
        ],
        timeout=3600,
    )
    _run(
        [
            "huggingface-cli",
            "download",
            "ByteDance/LatentSync-1.6",
            "whisper/tiny.pt",
            "--local-dir",
            str(MODEL_ROOT),
        ],
        timeout=3600,
    )

    # LatentSync's scripts expect checkpoints under the repo. Symlink from the
    # persistent volume so later runs skip the heavy downloads.
    for relative in ["latentsync_unet.pt", "whisper"]:
        src = MODEL_ROOT / relative
        dst = checkpoints / relative
        if dst.exists() or dst.is_symlink():
            continue
        dst.symlink_to(src, target_is_directory=src.is_dir())

    marker.write_text(str(time.time()), encoding="utf-8")
    latentsync_volume.commit()


def _prepare_inputs(video_url: str, audio_url: str, max_seconds: float, workdir: Path) -> tuple[Path, Path]:
    raw_video = workdir / "raw_base.mp4"
    raw_audio = workdir / "raw_audio"
    input_video = workdir / "input_base.mp4"
    input_audio = workdir / "input_audio.wav"

    _download(video_url, raw_video)
    _download(audio_url, raw_audio)

    # LatentSync README recommends 25 fps video and 16 kHz audio preprocessing.
    # Keep this under 5 seconds for a capped one-clip benchmark.
    _run(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(raw_video),
            "-t",
            str(max_seconds),
            "-r",
            "25",
            "-vf",
            "scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-an",
            str(input_video),
        ],
        timeout=120,
    )
    _run(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(raw_audio),
            "-t",
            str(max_seconds),
            "-ar",
            "16000",
            "-ac",
            "1",
            str(input_audio),
        ],
        timeout=120,
    )
    return input_video, input_audio


@app.function(
    image=latentsync_image,
    gpu="A10G",
    secrets=[secrets],
    volumes={"/models": latentsync_volume},
    timeout=3600,
    retries=0,
)
def run_latentsync_one_clip(video_url: str, audio_url: str, max_seconds: float = 5.0) -> dict[str, Any]:
    if max_seconds <= 0 or max_seconds > 8:
        raise ValueError("max_seconds must be between 0 and 8 for the spike")

    started = time.time()
    run_id = uuid.uuid4().hex[:12]
    workdir = SPIKE_ROOT / run_id
    output_path = workdir / "latentsync_output.mp4"
    workdir.mkdir(parents=True, exist_ok=True)

    _ensure_latentsync_weights()
    input_video, input_audio = _prepare_inputs(video_url, audio_url, max_seconds, workdir)

    repo = Path("/opt/LatentSync")
    env = os.environ.copy()
    env["PYTHONPATH"] = f"{repo}:{env.get('PYTHONPATH', '')}"

    result = subprocess.run(
        [
            "python",
            "-m",
            "scripts.inference",
            "--unet_config_path",
            "configs/unet/stage2_512.yaml",
            "--inference_ckpt_path",
            "checkpoints/latentsync_unet.pt",
            "--inference_steps",
            "20",
            "--guidance_scale",
            "1.5",
            "--enable_deepcache",
            "--video_path",
            str(input_video),
            "--audio_path",
            str(input_audio),
            "--video_out_path",
            str(output_path),
        ],
        cwd=str(repo),
        env=env,
        capture_output=True,
        text=True,
        timeout=3000,
    )
    if result.returncode != 0:
        tail = (result.stderr or result.stdout)[-4000:]
        raise RuntimeError(f"LatentSync inference failed ({result.returncode}):\n{tail}")
    if not output_path.exists():
        raise RuntimeError(f"LatentSync produced no output at {output_path}")

    probe = _probe(output_path)
    key = f"experiments/self-hosted-lipsync/latentsync/{run_id}.mp4"
    output_url = _upload_to_r2(output_path.read_bytes(), key)

    return {
        "provider": "latentsync_modal_spike",
        "gpu": "A10G",
        "max_seconds": max_seconds,
        "elapsed_seconds": round(time.time() - started, 2),
        "input_video_probe": _probe(input_video),
        "input_audio_probe": _probe(input_audio),
        "output_probe": probe,
        "output_url": output_url,
    }


@app.local_entrypoint()
def main(video_url: str, audio_url: str, max_seconds: float = 5.0):
    """Manual operator entrypoint.

    Example:
      python -m modal run modal_app/latentsync_lipsync_spike.py --video-url <base> --audio-url <audio> --max-seconds 5
    """
    result = run_latentsync_one_clip.remote(video_url, audio_url, max_seconds)
    print(json.dumps(result, indent=2))
