"""LongCat-Video-Avatar 1.6 runtime (admin talking avatar). No Modal import here: pure helpers + the executor body.

Validated configuration (Luz POC, 2026-11-23, PR #124): 1x H100, INT8 DiT, distilled 8 steps, 480p, upstream demo script
`run_demo_avatar_single_audio_to_video.py` run unchanged through torchrun. Only the segment count varies with the audio:
93 frames for the first segment, +80 per continuation segment, 25 fps (3.72 s / 6.92 s / 10.12 s).

Safety model (same as the other runtimes): the CPU broker checks every input before any GPU starts; the GPU executor has
no secrets and no network, mounts the weights read-only, and returns bytes only. Error codes are fixed strings.
"""
import json
import math
import os
import shutil
import subprocess
import tempfile
import threading
import time
from pathlib import Path

AVATAR_RUNTIME = "longcat-avatar@1"

# Pinned upstream (see poc/longcat_avatar_modal/app.py on PR #124).
UPSTREAM_SHA = "58eb336edc5c8c63389838727e40b8c18434e54e"
WEIGHTS_VOLUME_DEFAULT = "alphogenai-longcat-avatar-poc-weights"
WEIGHTS_ROOT = "/avatar-weights"           # /avatar-weights/LongCat-Video and /avatar-weights/LongCat-Video-Avatar-1.6
REPO_DIR = "/opt/LongCat-Video"

MAX_IMAGE_BYTES = 10 * 1024 * 1024
MAX_AUDIO_BYTES = 3 * 1024 * 1024
MAX_IMAGE_PIXELS = 20_000_000
MIN_AUDIO_SECONDS = 1.0
MAX_AUDIO_SECONDS = 10.0
FPS = 25
FIRST_SEGMENT_FRAMES = 93
NEW_FRAMES_PER_SEGMENT = 80
MAX_SEGMENTS = 3
RENDER_TIMEOUT_SECONDS = 440               # measured 375 s on H100 in staging (model load ~200 s + 3 segments ~177 s)
MAX_MP4_BYTES = 40 * 1024 * 1024


class AvatarInputError(ValueError):
    """Only fixed, non-sensitive codes may cross into the business run record."""
    CODES = frozenset({"INVALID_IMAGE", "IMAGE_TOO_LARGE", "INVALID_AUDIO", "AUDIO_TOO_SHORT", "AUDIO_TOO_LONG",
                       "INVALID_REFERENCE", "INVALID_AUDIO_PATH", "AVATAR_EXECUTION_FAILED", "AVATAR_OUTPUT_INVALID"})

    def __init__(self, code):
        if code not in self.CODES:
            raise ValueError("Unknown avatar error")
        self.code = code
        super().__init__(code)


def segments_for(seconds: float) -> int:
    """Fewest segments covering `seconds` of speech (1..3). Mirrors lib/avatar/template.ts::segmentsFor."""
    if not isinstance(seconds, (int, float)) or not math.isfinite(seconds) or seconds <= 0:
        raise AvatarInputError("INVALID_AUDIO")
    frames = math.ceil(seconds * FPS)
    segments = 1 + max(0, math.ceil((frames - FIRST_SEGMENT_FRAMES) / NEW_FRAMES_PER_SEGMENT))
    if segments > MAX_SEGMENTS:
        raise AvatarInputError("AUDIO_TOO_LONG")
    return segments


def video_seconds(segments: int) -> float:
    return (FIRST_SEGMENT_FRAMES + (segments - 1) * NEW_FRAMES_PER_SEGMENT) / FPS


def own_path(user_id: str, folder: str, path, suffixes: tuple) -> bool:
    """A storage path inside `<user_id>/<folder>/`: no traversal, no empty or nested segment, allowed suffix only."""
    if not isinstance(path, str) or ".." in path or "//" in path or "\\" in path:
        return False
    prefix = f"{user_id}/{folder}/"
    rest = path[len(prefix):]
    return path.startswith(prefix) and "/" not in rest and rest.lower().endswith(suffixes) and len(rest) > 6


def audio_duration(path: Path) -> float:
    import av
    try:
        with av.open(str(path)) as container:
            if not any(stream.type == "audio" for stream in container.streams) or container.duration is None:
                raise AvatarInputError("INVALID_AUDIO")
            return float(container.duration) / av.time_base
    except AvatarInputError:
        raise
    except Exception:
        raise AvatarInputError("INVALID_AUDIO") from None


def prepare_audio(raw: bytes) -> dict:
    """CPU check before any GPU: real audio, 1..10 s. Returns 16 kHz mono WAV bytes, the exact duration and segments."""
    if not isinstance(raw, (bytes, bytearray)) or not 44 <= len(raw) <= MAX_AUDIO_BYTES:
        raise AvatarInputError("INVALID_AUDIO")
    with tempfile.TemporaryDirectory() as directory:
        source, wav = Path(directory) / "in.bin", Path(directory) / "speech.wav"
        source.write_bytes(raw)
        seconds = audio_duration(source)
        if seconds < MIN_AUDIO_SECONDS:
            raise AvatarInputError("AUDIO_TOO_SHORT")
        if seconds > MAX_AUDIO_SECONDS:
            raise AvatarInputError("AUDIO_TOO_LONG")
        try:
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(source), "-vn", "-ac", "1", "-ar", "16000",
                            "-t", f"{MAX_AUDIO_SECONDS + 0.5:.1f}", str(wav)], check=True, timeout=30, capture_output=True)
        except Exception:
            raise AvatarInputError("INVALID_AUDIO") from None
        data = wav.read_bytes()
    return {"audio": data, "seconds": seconds, "segments": segments_for(seconds)}


def check_image(raw: bytes) -> None:
    if not isinstance(raw, (bytes, bytearray)) or len(raw) < 64:
        raise AvatarInputError("INVALID_IMAGE")
    if len(raw) > MAX_IMAGE_BYTES:
        raise AvatarInputError("IMAGE_TOO_LARGE")
    magic = bytes(raw[:12])
    if not (magic[:8] == b"\x89PNG\r\n\x1a\n" or magic[:3] == b"\xff\xd8\xff" or (magic[:4] == b"RIFF" and magic[8:12] == b"WEBP")):
        raise AvatarInputError("INVALID_IMAGE")


SEED_ANCHOR = "    global_seed = 42\n"
SEED_PATCH = '    global_seed = int(os.environ.get("AVATAR_SEED", "42"))\n'


def patched_script(source: str) -> str:
    """The pinned upstream script with its fixed seed made configurable. Fails closed if the anchor is not unique."""
    if source.count(SEED_ANCHOR) != 1 or "import os" not in source:
        raise AvatarInputError("AVATAR_EXECUTION_FAILED")
    return source.replace(SEED_ANCHOR, SEED_PATCH)


def command(workdir: Path, segments: int, script: str = "run_demo_avatar_single_audio_to_video.py",
            weights: str = WEIGHTS_ROOT) -> list:
    """The validated upstream invocation (POC README). Fixed flags: INT8, distilled 8 steps, 480p."""
    cmd = [
        "torchrun", "--nproc_per_node=1", script,
        "--context_parallel_size=1", f"--checkpoint_dir={weights}/LongCat-Video-Avatar-1.6",
        "--stage_1=ai2v", f"--input_json={workdir / 'input.json'}", f"--output_dir={workdir / 'out'}",
        "--resolution=480p", "--use_int8", "--use_distill",
        "--lora_path", "loraB/lora.safetensors", "--model_type", "avatar-v1.6", "--mix_steps=4", "--mix_alpha=1.0",
    ]
    if segments > 1:
        cmd += [f"--num_segments={segments}", "--ref_img_index=10", "--mask_frame_range=0"]
    return cmd


TRACE_MAX_LINES = 400                       # the upstream script and tqdm are chatty: cap what reaches the logs
TRACE_HEARTBEAT_SECONDS = 30


def _read_number(path: str):
    try:
        return int(Path(path).read_text().split()[0])
    except Exception:
        return None


def resource_snapshot(cgroup_root: str = "/sys/fs/cgroup", with_gpu: bool = True) -> str:
    """One short line: container memory (current/peak), CPU throttling (cgroup v2), load average and GPU use. Never raises."""
    parts = []
    mib = lambda v: "n/a" if v is None else f"{v / 2 ** 20:.0f}MiB"
    parts.append(f"mem={mib(_read_number(cgroup_root + '/memory.current'))} peak={mib(_read_number(cgroup_root + '/memory.peak'))}")
    try:
        stat = dict(line.split() for line in Path(cgroup_root + "/cpu.stat").read_text().splitlines() if len(line.split()) == 2)
        parts.append(f"cpu_throttled_s={int(stat.get('throttled_usec', 0)) / 1e6:.1f} throttled_periods={stat.get('nr_throttled', 'n/a')}")
    except Exception:
        parts.append("cpu_throttled=n/a")
    try:
        parts.append(f"load={Path('/proc/loadavg').read_text().split()[0]}")
    except Exception:
        pass
    if with_gpu:
        try:
            out = subprocess.run(["nvidia-smi", "--query-gpu=utilization.gpu,memory.used", "--format=csv,noheader,nounits"],
                                 capture_output=True, text=True, timeout=5, check=True).stdout.strip().splitlines()[0]
            util, used = [x.strip() for x in out.split(",")]
            parts.append(f"gpu={util}% vram={used}MiB")
        except Exception:
            parts.append("gpu=n/a")
    return " ".join(parts)


def run_traced(cmd, *, cwd, env, timeout, redact=(), log=print, heartbeat_seconds=TRACE_HEARTBEAT_SECONDS,
               max_lines=TRACE_MAX_LINES, cgroup_root="/sys/fs/cgroup", with_gpu=True) -> None:
    """Runs the render and writes timestamped progress to the container log (the previous version discarded everything,
    so a slow or hung run could not be diagnosed). Otherwise it behaves like subprocess.run(check=True, timeout=...):
    CalledProcessError on a non-zero exit, TimeoutExpired after `timeout` seconds (the whole process group is killed).

    Privacy: every string in `redact` (the prompt, the private work directory) is masked in each line, lines are cut at 200
    characters and at most `max_lines` are shown. A heartbeat reports memory, CPU throttling, load and GPU use.
    """
    started = time.monotonic()
    stamp = lambda: f"[avatar +{time.monotonic() - started:.0f}s]"
    secrets = [r for r in redact if isinstance(r, str) and len(r) >= 3]

    def mask(line: str) -> str:
        for secret in secrets:
            line = line.replace(secret, "[redacted]")
        return line[:200]

    log(f"{stamp()} start {resource_snapshot(cgroup_root, with_gpu)}")
    proc = subprocess.Popen(cmd, cwd=cwd, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, errors="replace",
                            bufsize=1, start_new_session=(os.name == "posix"))
    shown = {"n": 0}

    def pump():
        for raw in proc.stdout:
            line = raw.strip()
            if not line:
                continue
            shown["n"] += 1
            if shown["n"] <= max_lines:
                log(f"{stamp()} {mask(line)}")
            elif shown["n"] == max_lines + 1:
                log(f"{stamp()} (further output not shown)")

    def kill():
        try:
            if os.name == "posix":
                os.killpg(proc.pid, 9)
            else:
                proc.kill()
        except Exception:
            try:
                proc.kill()
            except Exception:
                pass

    reader = threading.Thread(target=pump, daemon=True)
    reader.start()
    stop = threading.Event()

    def beat():
        while not stop.wait(heartbeat_seconds):
            log(f"{stamp()} heartbeat {resource_snapshot(cgroup_root, with_gpu)}")

    threading.Thread(target=beat, daemon=True).start()
    try:
        try:
            code = proc.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            kill()
            log(f"{stamp()} timeout after {timeout}s: process group killed {resource_snapshot(cgroup_root, with_gpu)}")
            raise
        reader.join(5)
        log(f"{stamp()} exited code={code} {resource_snapshot(cgroup_root, with_gpu)}")
        if code != 0:
            raise subprocess.CalledProcessError(code, "avatar")   # no command line in the error (it holds private paths)
    finally:
        stop.set()


def execute(payload: dict, weights: str = WEIGHTS_ROOT, repo: str = REPO_DIR, root: str = "/tmp") -> dict:
    """GPU executor body. `payload`: image bytes, 16 kHz WAV bytes, prompt, seed, segments. Returns the raw MP4.

    Every run uses a fresh private directory that is wiped afterwards, so a warm container never carries one run's
    files into the next. The upstream script is executed as pinned, with one verified one-line patch: its hard-coded
    `global_seed = 42` reads the request seed from the environment instead (default 42, the value of the POC runs).
    """
    segments = payload.get("segments")
    if type(segments) is not int or not 1 <= segments <= MAX_SEGMENTS:
        raise AvatarInputError("INVALID_AUDIO")
    check_image(payload.get("image"))
    audio = payload.get("audio")
    if not isinstance(audio, (bytes, bytearray)) or not 44 <= len(audio) <= MAX_AUDIO_BYTES:
        raise AvatarInputError("INVALID_AUDIO")
    prompt = payload.get("prompt")
    if not isinstance(prompt, str) or not 3 <= len(prompt) <= 600:
        raise AvatarInputError("AVATAR_EXECUTION_FAILED")
    seed = payload.get("seed")
    if type(seed) is not int or not 0 <= seed < 2 ** 31:
        raise AvatarInputError("AVATAR_EXECUTION_FAILED")

    started = time.monotonic()
    workdir = Path(tempfile.mkdtemp(prefix="avatar-run-", dir=root))
    try:
        from io import BytesIO
        from PIL import Image
        Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS
        try:
            with Image.open(BytesIO(bytes(payload["image"]))) as source:
                if source.width * source.height > MAX_IMAGE_PIXELS:
                    raise AvatarInputError("IMAGE_TOO_LARGE")
                source.convert("RGB").save(workdir / "portrait.png")  # decoded and re-encoded: real image, no metadata
        except AvatarInputError:
            raise
        except Exception:
            raise AvatarInputError("INVALID_IMAGE") from None
        (workdir / "speech.wav").write_bytes(bytes(audio))
        (workdir / "out").mkdir()
        (workdir / "input.json").write_text(json.dumps({
            "prompt": prompt, "cond_image": str(workdir / "portrait.png"),
            "cond_audio": {"person1": str(workdir / "speech.wav")},
        }, ensure_ascii=False), encoding="utf-8")
        script = Path(repo) / f"avatar_run_{workdir.name}.py"  # next to the package so `longcat_video` imports resolve
        try:
            script.write_text(patched_script((Path(repo) / "run_demo_avatar_single_audio_to_video.py").read_text(encoding="utf-8")), encoding="utf-8")
            print(f"[avatar] inputs ready after {time.monotonic() - started:.1f}s, segments={segments}, starting the render", flush=True)
            run_traced(command(workdir, segments, script.name, weights), cwd=repo, timeout=RENDER_TIMEOUT_SECONDS,
                       env={**os.environ, "AVATAR_SEED": str(seed), "PYTHONUNBUFFERED": "1"}, redact=(prompt, str(workdir)),
                       log=lambda m: print(m, flush=True))
        except AvatarInputError:
            raise
        except Exception:
            raise AvatarInputError("AVATAR_EXECUTION_FAILED") from None
        finally:
            script.unlink(missing_ok=True)
        outputs = sorted((workdir / "out").glob("*.mp4"))
        if len(outputs) != 1:
            raise AvatarInputError("AVATAR_OUTPUT_INVALID")
        raw = outputs[0].read_bytes()
        if not 8 <= len(raw) <= MAX_MP4_BYTES or raw[4:8] != b"ftyp":
            raise AvatarInputError("AVATAR_OUTPUT_INVALID")
        return {"mp4": raw, "generation_seconds": round(time.monotonic() - started, 2)}
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


# ---------------------------------------------------------------------------------------------------------------------
# Hosted STAGING rehearsal without a GPU. The broker normally submits the payload to `execute_avatar` (H100). With the
# two settings below it returns a synthetic MP4 instead, so the hosted flow (Preview -> dispatch -> broker -> storage ->
# Studio) can be validated for free. Fail-closed: the flag alone does nothing, and it refuses to run unless the broker's own
# SUPABASE_URL belongs to the explicitly allowed project, so it can never fake a render on another database.
SIMULATION_FLAG = "AVATAR_SIMULATE"
SIMULATION_FLAG_VALUE = "no-gpu-staging-only"
SIMULATION_REF = "AVATAR_SIMULATE_SUPABASE_REF"


def simulation_enabled(env=None) -> bool:
    env = os.environ if env is None else env
    if env.get(SIMULATION_FLAG) != SIMULATION_FLAG_VALUE:
        return False
    ref = env.get(SIMULATION_REF, "")
    if not ref or ref not in env.get("SUPABASE_URL", ""):
        raise AvatarInputError("AVATAR_EXECUTION_FAILED")  # simulation requested for a database it is not allowed on
    return True


def simulated_output(payload: dict) -> dict:
    """Synthetic MP4 shaped like the real output (25 fps, whole segments, the request's own audio, shorter than the video)."""
    segments, audio = payload.get("segments"), payload.get("audio")
    if type(segments) is not int or not 1 <= segments <= MAX_SEGMENTS or not isinstance(audio, (bytes, bytearray)):
        raise AvatarInputError("AVATAR_EXECUTION_FAILED")
    with tempfile.TemporaryDirectory() as directory:
        wav, out = Path(directory) / "speech.wav", Path(directory) / "simulated.mp4"
        wav.write_bytes(bytes(audio))
        try:
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi",
                            "-i", f"testsrc2=size=272x368:rate={FPS}:duration={video_seconds(segments)}", "-i", str(wav),
                            "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", str(out)],
                           check=True, timeout=120, capture_output=True)
        except Exception:
            raise AvatarInputError("AVATAR_OUTPUT_INVALID") from None
        return {"mp4": out.read_bytes(), "generation_seconds": 0.5}
