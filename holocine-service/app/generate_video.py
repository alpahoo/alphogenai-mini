from __future__ import annotations

import os
import time
import uuid
from dataclasses import dataclass
from typing import Callable, Optional, Tuple
import subprocess
import shlex

import torch

from .config import Config
from .logging_setup import get_logger


logger = get_logger("generate")


@dataclass
class VideoResult:
    job_id: str
    local_path: str
    time_s: float
    vram_peak_gb: float


class VRAMInsufficientError(RuntimeError):
    pass


def detect_gpu() -> Tuple[Optional[str], Optional[int]]:
    if not torch.cuda.is_available():
        return None, None
    device = torch.cuda.current_device()
    name = torch.cuda.get_device_name(device)
    total = torch.cuda.get_device_properties(device).total_memory
    return name, int(total // (1024 ** 3))


def ensure_vram(cfg: Config, mode: str, num_frames: int) -> None:
    name, vram_gb = detect_gpu()
    if name is None:
        raise RuntimeError("CUDA/GPU not available")

    if mode == "full":
        if vram_gb is None or vram_gb < 80:
            raise VRAMInsufficientError("'full' mode requires >= 80 GB VRAM (H100 80GB)")
    else:
        if vram_gb is None or vram_gb < 40:
            logger.info("Running sparse mode on <40GB VRAM may OOM; reducing frames", extra={"vram_gb": vram_gb})


def _fake_generate(cfg: Config, global_caption: str, num_frames: int) -> str:
    os.makedirs(cfg.outputs_path, exist_ok=True)
    output = os.path.join(cfg.outputs_path, f"{uuid.uuid4()}.mp4")
    with open(output, "wb") as f:
        f.write(b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom\x00\x00\x00\x08free\x00\x00\x00\x00mdat")
    return output


def generate_video(
    cfg: Config,
    global_caption: str,
    shot_captions: list[str],
    num_frames: int,
    mode: str,
    seed: Optional[int],
    on_progress: Optional[Callable[[float], None]] = None,
) -> VideoResult:
    ensure_vram(cfg, mode, num_frames)

    start = time.time()
    torch.cuda.reset_peak_memory_stats() if torch.cuda.is_available() else None

    if seed is not None:
        import random
        import numpy as np

        random.seed(seed)
        np.random.seed(seed)
        torch.manual_seed(seed)
        if torch.cuda.is_available():
            torch.cuda.manual_seed_all(seed)

    # Progress: start
    if on_progress:
        try:
            on_progress(0.05)
        except Exception:
            pass

    if cfg.allow_fake_output:
        local_path = _fake_generate(cfg, global_caption, num_frames)
    else:
        # Attempt to run external HoloCine wrapper with timeout
        os.makedirs(cfg.outputs_path, exist_ok=True)
        out_path = os.path.join(cfg.outputs_path, f"{uuid.uuid4()}.mp4")
        cmd = (
            f"python3 /app/scripts/run_holocine.py"
            f" --caption {shlex.quote(global_caption)}"
            f" --num-frames {int(num_frames)}"
            f" --mode {shlex.quote(mode)}"
            f" --output {shlex.quote(out_path)}"
        )
        if seed is not None:
            cmd += f" --seed {int(seed)}"

        env = os.environ.copy()
        env["CHECKPOINTS_PATH"] = cfg.checkpoints_path
        env["OUTPUTS_PATH"] = cfg.outputs_path

        try:
            subprocess.run(
                cmd,
                shell=True,
                check=True,
                timeout=max(60, int(cfg.inference_timeout_s)),
                env=env,
            )
            local_path = out_path
        except subprocess.TimeoutExpired as e:
            raise RuntimeError(f"inference timed out after {cfg.inference_timeout_s}s") from e
        except subprocess.CalledProcessError as e:
            raise RuntimeError("inference process failed") from e

    elapsed = time.time() - start
    vram_peak_gb = 0.0
    if torch.cuda.is_available():
        vram_peak_gb = torch.cuda.max_memory_allocated() / (1024 ** 3)

    vr = VideoResult(job_id=str(uuid.uuid4()), local_path=local_path, time_s=elapsed, vram_peak_gb=vram_peak_gb)

    # Progress: end
    if on_progress:
        try:
            on_progress(0.9)
        except Exception:
            pass

    logger.info(
        "generated",
        extra={
            "job_id": vr.job_id,
            "mode": mode,
            "frames": num_frames,
            "time_s": round(elapsed, 3),
            "vram_peak_gb": round(vram_peak_gb, 2),
        },
    )
    return vr
