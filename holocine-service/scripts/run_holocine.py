from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from app.logging_setup import get_logger

logger = get_logger("run_holocine")


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--caption", required=True)
    p.add_argument("--num-frames", type=int, required=True)
    p.add_argument("--mode", choices=["sparse", "full"], default="sparse")
    p.add_argument("--seed", type=int, default=None)
    p.add_argument("--output", required=True)
    return p.parse_args()


def main() -> int:
    args = parse_args()

    # Placeholder: wire actual HoloCine pipeline here.
    # For now, write a tiny valid MP4 header so downstream steps can proceed.
    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("wb") as f:
        f.write(b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom\x00\x00\x00\x08free\x00\x00\x00\x00mdat")

    logger.info(
        "run_holocine finished",
        extra={
            "caption": args.caption[:120],
            "num_frames": args.num_frames,
            "mode": args.mode,
            "seed": args.seed,
            "output": str(out_path),
        },
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
