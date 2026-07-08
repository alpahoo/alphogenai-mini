"""
T-1147e1 - Modal GPU self-hosted lip-sync spike.

Experimental only. This file is intentionally not imported by the production
video pipeline and is not connected to user UI. Run it manually with an explicit
GPU/cost GO to test one short clip against a self-hosted/open-source model.

Candidate 1: MuseTalk (lip-sync focused). The function downloads one base clip
and one AlphoGen TTS audio segment, trims them to a small cap, runs MuseTalk,
uploads the resulting MP4 to R2, and returns timing/probe metadata.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import time
import uuid
from pathlib import Path
from typing import Any

import modal

app = modal.App("alphogenai-self-hosted-lipsync-spike")

secrets = modal.Secret.from_name("alphogenai-secrets-corrected-v2")
musetalk_volume = modal.Volume.from_name("alphogenai-musetalk-spike", create_if_missing=True)

# Keep this isolated from modal_app.video_pipeline images. MuseTalk's dependency
# stack is different from the production render image and should not perturb it.
musetalk_image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("bash", "git", "ffmpeg", "libgl1", "libglib2.0-0", "wget")
    .pip_install("boto3", "requests", "pyyaml")
    .run_commands(
        "git clone --depth 1 https://github.com/TMElyralab/MuseTalk.git /opt/MuseTalk",
        "cd /opt/MuseTalk && pip install -r requirements.txt",
    )
)

SPIKE_ROOT = Path("/tmp/alphogen-musetalk-spike")
MODEL_ROOT = Path("/models/musetalk")


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
    result = _run([
        "ffprobe", "-v", "error", "-print_format", "json",
        "-show_format", "-show_streams", str(path),
    ], timeout=60)
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


def _ensure_musetalk_weights() -> None:
    """Download MuseTalk weights into a persistent Modal volume if absent.

    MuseTalk's official repo provides a download script. We keep this here rather
    than in the image build so the heavy model payload is stored in a volume and
    not baked into every image layer.
    """
    marker = MODEL_ROOT / ".downloaded"
    if marker.exists():
        return

    MODEL_ROOT.mkdir(parents=True, exist_ok=True)
    repo = Path("/opt/MuseTalk")
    script = repo / "download_weights.sh"
    if not script.exists():
        raise RuntimeError("MuseTalk download_weights.sh not found in cloned repo")

    # The script downloads into the repo by default. Move/copy the resulting
    # weights into /models/musetalk and symlink expected paths back if needed.
    _run(["bash", str(script)], cwd=str(repo), timeout=3600)

    for name in ["models", "checkpoints", "weights"]:
        src = repo / name
        dst = MODEL_ROOT / name
        if src.exists() and not dst.exists():
            if src.is_dir():
                shutil.copytree(src, dst)
            else:
                shutil.copy2(src, dst)

    marker.write_text(str(time.time()), encoding="utf-8")
    musetalk_volume.commit()


def _prepare_inputs(video_url: str, audio_url: str, max_seconds: float, workdir: Path) -> tuple[Path, Path]:
    raw_video = workdir / "raw_base.mp4"
    raw_audio = workdir / "raw_audio"
    input_video = workdir / "input_base.mp4"
    input_audio = workdir / "input_audio.wav"

    _download(video_url, raw_video)
    _download(audio_url, raw_audio)

    # Normalize both assets to the same small cap. Keeping this under 5 seconds
    # is the whole point of T-1147e1: tiny GPU spend, fast failure, comparable to
    # the HeyGen one-segment gate.
    _run([
        "ffmpeg", "-y", "-i", str(raw_video), "-t", str(max_seconds),
        "-vf", "scale=720:720:force_original_aspect_ratio=decrease,pad=720:720:(ow-iw)/2:(oh-ih)/2",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-an", str(input_video),
    ], timeout=120)
    _run([
        "ffmpeg", "-y", "-i", str(raw_audio), "-t", str(max_seconds),
        "-ar", "16000", "-ac", "1", str(input_audio),
    ], timeout=120)
    return input_video, input_audio


@app.function(
    image=musetalk_image,
    gpu="A10G",
    secrets=[secrets],
    volumes={"/models": musetalk_volume},
    timeout=3600,
    retries=0,
)
def run_musetalk_one_clip(video_url: str, audio_url: str, max_seconds: float = 5.0) -> dict[str, Any]:
    """Run one MuseTalk lip-sync clip and upload the output to R2.

    This is an experimental spike function. It may require dependency/model
    tuning on the first execution; failures are returned as explicit errors by
    Modal and should not affect production.
    """
    if max_seconds <= 0 or max_seconds > 8:
        raise ValueError("max_seconds must be between 0 and 8 for the spike")

    started = time.time()
    run_id = uuid.uuid4().hex[:12]
    workdir = SPIKE_ROOT / run_id
    outdir = workdir / "out"
    workdir.mkdir(parents=True, exist_ok=True)
    outdir.mkdir(parents=True, exist_ok=True)

    _ensure_musetalk_weights()
    input_video, input_audio = _prepare_inputs(video_url, audio_url, max_seconds, workdir)

    config_path = workdir / "musetalk_input.yaml"
    config_path.write_text(
        "task_0:\n"
        f"  video_path: {input_video}\n"
        f"  audio_path: {input_audio}\n",
        encoding="utf-8",
    )

    repo = Path("/opt/MuseTalk")
    env = os.environ.copy()
    env["PYTHONPATH"] = f"{repo}:{env.get('PYTHONPATH', '')}"

    # Official MuseTalk inference entrypoint. Keep stderr tail in Modal logs if
    # this breaks due to upstream dependency drift; that is a valid spike result.
    result = subprocess.run(
        [
            "python", "-m", "scripts.inference",
            "--inference_config", str(config_path),
            "--result_dir", str(outdir),
        ],
        cwd=str(repo),
        env=env,
        capture_output=True,
        text=True,
        timeout=3000,
    )
    if result.returncode != 0:
        tail = (result.stderr or result.stdout)[-4000:]
        raise RuntimeError(f"MuseTalk inference failed ({result.returncode}):\n{tail}")

    candidates = sorted(outdir.rglob("*.mp4"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not candidates:
        raise RuntimeError(f"MuseTalk produced no MP4 under {outdir}")

    output_path = candidates[0]
    probe = _probe(output_path)
    key = f"experiments/self-hosted-lipsync/musetalk/{run_id}.mp4"
    output_url = _upload_to_r2(output_path.read_bytes(), key)

    return {
        "provider": "musetalk_modal_spike",
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
      modal run modal_app/self_hosted_lipsync_spike.py --video-url <base> --audio-url <audio> --max-seconds 5
    """
    result = run_musetalk_one_clip.remote(video_url, audio_url, max_seconds)
    print(json.dumps(result, indent=2))
