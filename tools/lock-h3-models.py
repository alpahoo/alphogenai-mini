"""Metadata-only lock generation. Does not download weights or call Modal."""
import json
from pathlib import Path
import requests

root = Path(__file__).resolve().parents[1]
files = {
    "Comfy-Org/MiniMax-H3": [
        "diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors",
        "text_encoders/qwen3vl_32b_minimax_h3_int8_convrot.safetensors",
        "vae/minimax_h3_video_vae_int8_convrot.safetensors",
        "vae/minimax_h3_audio_vae_fp32.safetensors"],
    "drbaph/MiniMax-H3-Turbo-Lora-ComfyUI": ["minimax_h3_turbo_v4_step600_ema_pruned_comfyui.safetensors"],
}
locked = []
for repo, names in files.items():
    response = requests.get(f"https://huggingface.co/api/models/{repo}?blobs=true", timeout=30)
    response.raise_for_status()
    info = response.json()
    for name in names:
        item = next(x for x in info["siblings"] if x["rfilename"] == name)
        target = name if "/" in name else f"loras/{name}"
        locked.append({"repo": repo, "revision": info["sha"], "source": name, "path": target,
                       "sha256": item["lfs"]["sha256"], "bytes": item["lfs"]["size"],
                       "license": "minimax-h3-community" if repo.startswith("Comfy-Org") else "apache-2.0 + minimax-h3-community"})
out = root / "workflows/comfy/runtimes/h3-video@1.json"
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps({"runtime": "h3-video@1", "comfyui": "v0.42.0", "gpu": "H100", "custom_nodes": [], "models": locked}, indent=2) + "\n")
print(f"Locked metadata for {len(locked)} files; no weight download.")
