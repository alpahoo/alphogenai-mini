"""LOCAL rehearsal only: runs the REAL CPU broker (`modal_app.comfy.broker.run`) against the LOCAL database,
with the GPU replaced by a synthetic MP4. Usage: python sim_run.py <run_id> <mode>   (mode: ok | fail | slow)

Everything except the GPU is production code: claim RPC, hash check, owner path checks, audio check (ffmpeg),
payload shape, finalisation (`shift_audio`), upload and `finish_comfy_admin_run`. Refuses a non-local Supabase URL.
"""
import os
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

if not re.match(r"^http://(127\.0\.0\.1|localhost):\d+", os.environ.get("SUPABASE_URL", "")):
    raise SystemExit("Refusing to run: SUPABASE_URL is not a local stack")

from modal_app.comfy.avatar import video_seconds  # noqa: E402
from modal_app.comfy.broker import run  # noqa: E402


def invoke(payload, reference, run_id, runtime="longcat-avatar@1"):
    mode = sys.argv[2] if len(sys.argv) > 2 else "ok"
    assert runtime == "longcat-avatar@1" and reference is None
    assert sorted(payload) == ["audio", "image", "prompt", "seed", "segments"], sorted(payload)
    if mode == "slow":
        time.sleep(float(os.environ.get("SIM_SLOW_SECONDS", "20")))
    if mode == "fail":
        raise RuntimeError("simulated GPU failure with a secret detail")
    seconds = video_seconds(payload["segments"])
    with tempfile.TemporaryDirectory() as directory:
        wav, out = Path(directory) / "speech.wav", Path(directory) / "out.mp4"
        wav.write_bytes(payload["audio"])
        # Same shape as the real output: 25 fps video of whole segments, speech shorter than the video (the Luz case).
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", f"testsrc2=size=272x368:rate=25:duration={seconds}",
                        "-i", str(wav), "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", str(out)],
                       check=True, timeout=120)
        return {"mp4": out.read_bytes(), "generation_seconds": 190.0}


if __name__ == "__main__":
    run(sys.argv[1], invoke)
