from __future__ import annotations

import os
import time
import uuid
from dataclasses import dataclass
from typing import Optional, Tuple

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

    if cfg.allow_fake_output:
        local_path = _fake_generate(cfg, global_caption, num_frames)
    else:
        # Placeholder: integrate HoloCine pipeline here
        # Load WAN 2.2 + HoloCine models, assemble pipeline, generate frames/video
        # Write MP4 to cfg.outputs_path and set local_path
        local_path = _fake_generate(cfg, global_caption, num_frames)

    elapsed = time.time() - start
    vram_peak_gb = 0.0
    if torch.cuda.is_available():
        vram_peak_gb = torch.cuda.max_memory_allocated() / (1024 ** 3)

    vr = VideoResult(job_id=str(uuid.uuid4()), local_path=local_path, time_s=elapsed, vram_peak_gb=vram_peak_gb)
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
