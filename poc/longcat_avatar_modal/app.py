"""
LongCat-Video-Avatar 1.6 : POC Modal isole.

Perimetre : app Modal privee, un portrait + un WAV -> un MP4 (480p, INT8,
distille 8 etapes). Aucune integration AlphoGenAI (Vercel/Supabase/Studio).
Chemin upstream le plus direct : run_demo_avatar_single_audio_to_video.py
du depot officiel, lance tel quel via torchrun (1 GPU), sans ComfyUI.

Ressources propres au POC (rien de partage) :
  app      alphogenai-longcat-avatar-poc
  volume   alphogenai-longcat-avatar-poc-weights   (poids, ~50 Go)
  volume   alphogenai-longcat-avatar-poc-io        (entrees/sorties/metriques)

Commandes : voir README.md (meme dossier).
"""
from __future__ import annotations

import json
import re
import subprocess
import threading
import time
from pathlib import Path

import modal

# --------------------------------------------------------------------------
# Versions epinglees
# --------------------------------------------------------------------------
UPSTREAM_REPO = "https://github.com/meituan-longcat/LongCat-Video.git"
UPSTREAM_SHA = "58eb336edc5c8c63389838727e40b8c18434e54e"  # main au 2026-11-15 (add Avatar-1.6)
HF_AVATAR_REPO = "meituan-longcat/LongCat-Video-Avatar-1.6"
HF_AVATAR_REV = "acfc628244201fc53fb6fe8a8903c5bac9bdf68f"  # 2026-11-13
HF_BASE_REPO = "meituan-longcat/LongCat-Video"
HF_BASE_REV = "03b55529b1d1d4045f5fbe14d65c8c6e8116b278"  # 2025-10-29

APP_NAME = "alphogenai-longcat-avatar-poc"
WEIGHTS_VOL = "alphogenai-longcat-avatar-poc-weights"
IO_VOL = "alphogenai-longcat-avatar-poc-io"

GPU = "H100"  # 1x H100 80 Go ; 0,001097 $/s (grille Modal du 2026-11-23)
GPU_TIMEOUT_S = 1500  # plafond dur du premier rendu
GPU_PRICE_PER_S = 0.001097

W = "/weights"  # /weights/LongCat-Video et /weights/LongCat-Video-Avatar-1.6
IO = "/io"
REPO_DIR = "/opt/LongCat-Video"

FA_WHEEL = (
    "https://github.com/Dao-AILab/flash-attention/releases/download/v2.7.4.post1/"
    "flash_attn-2.7.4.post1+cu12torch2.6cxx11abiFALSE-cp310-cp310-linux_x86_64.whl"
)

image = (
    modal.Image.from_registry("nvidia/cuda:12.4.1-cudnn-devel-ubuntu22.04", add_python="3.10")
    .apt_install("git", "ffmpeg", "libsndfile1", "libgl1", "libglib2.0-0")
    .pip_install(
        "torch==2.6.0", "torchvision==0.21.0", "torchaudio==2.6.0",
        extra_index_url="https://download.pytorch.org/whl/cu124",
    )
    .pip_install(FA_WHEEL)
    .run_commands(
        f"git clone {UPSTREAM_REPO} {REPO_DIR}",
        f"git -C {REPO_DIR} checkout {UPSTREAM_SHA}",
        # Ecarts volontaires vs requirements upstream : torch/flash-attn deja
        # installes ci-dessus ; streamlit (UI) inutile ; libsndfile1==0.0.1 n'est
        # pas un paquet pip (apt libsndfile1 ci-dessus).
        f"cd {REPO_DIR} && grep -v -E '^(torch|flash-attn|streamlit)==' requirements.txt > /tmp/req.txt",
        f"cd {REPO_DIR} && grep -v -E '^libsndfile1==' requirements_avatar.txt > /tmp/req_avatar.txt",
        "pip install -r /tmp/req.txt -r /tmp/req_avatar.txt",
        "pip install 'huggingface_hub>=0.25,<1' hf_transfer",
    )
    .env({"HF_HUB_ENABLE_HF_TRANSFER": "1", "PYTHONUNBUFFERED": "1"})
)

app = modal.App(APP_NAME)
weights_vol = modal.Volume.from_name(WEIGHTS_VOL, create_if_missing=True)
io_vol = modal.Volume.from_name(IO_VOL, create_if_missing=True)

# Sous-ensemble minimal des poids (INT8 : ni base_model bf16, ni le DiT
# LongCat-Video de 54 Go, ni les .bin/.msgpack/fp32 de whisper).
AVATAR_PATTERNS = [
    "base_model_int8/*", "loraA/*", "loraB/*", "scheduler/*", "vocal_separator/*",
    "whisper-large-v3/model.safetensors", "whisper-large-v3/*.json",
    "whisper-large-v3/merges.txt", "config.json", "model_index.json",
]
BASE_PATTERNS = [
    "tokenizer/*", "text_encoder/*", "vae/*", "scheduler/*", "config.json", "model_index.json",
]


@app.function(image=image, volumes={W: weights_vol}, timeout=3 * 3600, cpu=4, memory=8192)
def download_weights() -> dict:
    """CPU uniquement : telecharge les poids epingles dans le volume. Idempotent."""
    from huggingface_hub import snapshot_download

    t0 = time.time()
    snapshot_download(HF_AVATAR_REPO, revision=HF_AVATAR_REV, allow_patterns=AVATAR_PATTERNS,
                      local_dir=f"{W}/LongCat-Video-Avatar-1.6")
    snapshot_download(HF_BASE_REPO, revision=HF_BASE_REV, allow_patterns=BASE_PATTERNS,
                      local_dir=f"{W}/LongCat-Video")
    weights_vol.commit()
    sizes = {}
    for d in ("LongCat-Video-Avatar-1.6", "LongCat-Video"):
        sizes[d] = sum(p.stat().st_size for p in Path(f"{W}/{d}").rglob("*") if p.is_file())
    return {"seconds": round(time.time() - t0, 1), "bytes": sizes}


DEMO_BASE = f"https://raw.githubusercontent.com/meituan-longcat/LongCat-Video/{UPSTREAM_SHA}"
DEMO_PROMPT = (  # prompt de l'exemple upstream assets/avatar/single_example_1.json
    "A western man stands on stage under dramatic lighting, holding a microphone close to "
    "their mouth. Wearing a vibrant red jacket with gold embroidery, the singer is speaking "
    "while smoke swirls around them, creating a dynamic and atmospheric scene."
)


@app.function(image=image, volumes={IO: io_vol}, timeout=600)
def prepare_demo_inputs() -> dict:
    """CPU uniquement : portrait + audio de demo upstream (MIT), audio -> WAV mono 16 kHz, 7 s."""
    import urllib.request

    d = Path(IO) / "inputs"
    d.mkdir(parents=True, exist_ok=True)
    urllib.request.urlretrieve(f"{DEMO_BASE}/assets/avatar/single/man.png", d / "man.png")
    urllib.request.urlretrieve(f"{DEMO_BASE}/assets/avatar/single/man.mp3", d / "man.mp3")
    # 93 images a 16 fps = 5,8 s ; le script upstream tronque a duree + 1 s.
    subprocess.run(["ffmpeg", "-y", "-i", str(d / "man.mp3"), "-t", "7", "-ac", "1",
                    "-ar", "16000", str(d / "man.wav")], check=True, capture_output=True)
    (d / "prompt.txt").write_text(DEMO_PROMPT, encoding="utf-8")
    io_vol.commit()
    return {"files": sorted(p.name for p in d.iterdir())}


def _probe(path: Path) -> dict:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
         "stream=width,height,r_frame_rate,nb_frames:format=duration,size",
         "-of", "json", str(path)], capture_output=True, text=True, check=True).stdout
    j = json.loads(out)
    s = j["streams"][0]
    return {"width": s["width"], "height": s["height"], "fps": s["r_frame_rate"],
            "frames": s.get("nb_frames"), "duration_s": float(j["format"]["duration"]),
            "size_bytes": int(j["format"]["size"])}


@app.function(image=image, gpu=GPU, timeout=GPU_TIMEOUT_S, cpu=8, memory=65536,
              volumes={W: weights_vol, IO: io_vol}, max_containers=1)
def generate(image_name: str = "man.png", wav_name: str = "man.wav", prompt: str = DEMO_PROMPT,
             run_tag: str = "demo") -> dict:
    """GPU : 1 portrait + 1 WAV -> MP4 480p (INT8, distille 8 etapes, 1 segment)."""
    t_enter = time.time()
    run_dir = Path(IO) / "outputs" / run_tag
    run_dir.mkdir(parents=True, exist_ok=True)
    cfg = {"prompt": prompt, "cond_image": f"{IO}/inputs/{image_name}",
           "cond_audio": {"person1": f"{IO}/inputs/{wav_name}"}}
    cfg_path = run_dir / "input.json"
    cfg_path.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")

    cmd = [
        "torchrun", "--nproc_per_node=1", "run_demo_avatar_single_audio_to_video.py",
        "--context_parallel_size=1", f"--checkpoint_dir={W}/LongCat-Video-Avatar-1.6",
        "--stage_1=ai2v", f"--input_json={cfg_path}", f"--output_dir={run_dir}",
        "--resolution=480p", "--use_int8", "--use_distill",
        "--lora_path", "loraB/lora.safetensors", "--model_type", "avatar-v1.6",
        "--mix_steps=4", "--mix_alpha=1.0",
    ]

    peak_mib = {"v": 0}
    stop = threading.Event()

    def poll_gpu():
        while not stop.is_set():
            try:
                o = subprocess.run(["nvidia-smi", "--query-gpu=memory.used",
                                    "--format=csv,noheader,nounits"],
                                   capture_output=True, text=True).stdout.split()
                peak_mib["v"] = max(peak_mib["v"], int(o[0]))
            except Exception:
                pass
            stop.wait(0.5)

    threading.Thread(target=poll_gpu, daemon=True).start()
    marks: dict[str, float] = {}
    t_proc = time.time()
    p = subprocess.Popen(cmd, cwd=REPO_DIR, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                         text=True, bufsize=1)
    tail: list[str] = []
    for line in p.stdout:  # type: ignore[union-attr]
        print(line, end="")
        tail = (tail + [line.rstrip()])[-40:]
        now = time.time()
        if "Loading INT8" in line:
            marks.setdefault("load_start", now)
        # barre tqdm du denoising : premiere apparition = fin du chargement
        if re.search(r"\d+/\d+ \[", line) and "load_start" in marks:
            marks.setdefault("denoise_start", now)
    rc = p.wait()
    t_end = time.time()
    stop.set()

    result = {
        "returncode": rc, "gpu": GPU, "run_tag": run_tag,
        "container_to_end_s": round(t_end - t_enter, 1),
        "subprocess_total_s": round(t_end - t_proc, 1),
        # Approximatif : le script upstream n'emet pas de timers.
        "approx_load_s": round(marks["denoise_start"] - t_proc, 1) if "denoise_start" in marks else None,
        "approx_inference_s": round(t_end - marks["denoise_start"], 1) if "denoise_start" in marks else None,
        "gpu_mem_peak_mib": peak_mib["v"],
        "est_gpu_cost_usd": round((t_end - t_enter) * GPU_PRICE_PER_S, 3),
        "outputs": [], "log_tail": tail[-15:] if rc else [],
    }
    for m in sorted(run_dir.glob("*.mp4")):
        result["outputs"].append({"file": f"outputs/{run_tag}/{m.name}", **_probe(m)})
    (run_dir / "metrics.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    io_vol.commit()
    return result


@app.local_entrypoint()
def main(step: str = "weights", run_tag: str = "demo"):
    """step = weights | inputs | run  (run = rendu GPU PAYANT, a lancer apres feu vert)."""
    if step == "weights":
        print(download_weights.remote())
    elif step == "inputs":
        print(prepare_demo_inputs.remote())
    elif step == "run":
        t0 = time.time()
        r = generate.remote(run_tag=run_tag)
        r["client_wall_s"] = round(time.time() - t0, 1)
        r["approx_cold_start_s"] = round(r["client_wall_s"] - r["container_to_end_s"], 1)
        print(json.dumps(r, indent=2))
    else:
        raise SystemExit("step inconnu : weights | inputs | run")
