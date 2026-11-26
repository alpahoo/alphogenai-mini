"""
LTX-2.5 ComfyUI graph builder (pure Python, no Modal, no GPU).

API-format translation of the official Comfy-Org templates
  video_ltx2_5_t2v.json (sha256 eb1a415a467a2ef1ea63cdb4e79a35315e29c971b1e4f7646ed149a2971fdbd7)
  video_ltx2_5_i2v.json (sha256 03b136ba0ad752c1e91e496a23fa4f4826ef881777d591dc9129c459922e7dac)
without the optional Gemma E2B prompt rewriter (off by default in both templates).

Two passes, as in the templates: 8 distilled steps at half size, x2 latent upscale,
then 3 refinement steps. One guidance pass per step (video/audio CFG = 1), native audio.

Measured 25 Nov 2026 on H100 (ComfyUI v0.46.3, image to video, 704x1280, 5 s, 24 fps):
69 s of generation on a cold container + 14 s ComfyUI start, audio AAC 48 kHz.
"""
from __future__ import annotations

FPS = 24

MODEL_FILES: list[tuple[str, str]] = [
    # (path in Lightricks/LTX-2.5, ComfyUI model folder)
    ("diffusion_models/ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors", "diffusion_models"),
    ("text_encoders/gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot.safetensors", "text_encoders"),
    ("vae/ltx-2.5-video-vae-bf16.safetensors", "vae"),
    ("vae/ltx-2.5-audio-vae-bf16.safetensors", "vae"),
    ("latent_upscale_models/ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors", "latent_upscale_models"),
]

# Output size per aspect. The first pass runs at half size and the latent grid
# needs multiples of 32 there, so every side is a multiple of 64. 704 is the
# closest to the pipeline's 720; the pipeline reframes to its delivery size.
DIMENSIONS: dict[str, tuple[int, int]] = {
    "9:16": (704, 1280),
    "16:9": (1280, 704),
    "1:1": (960, 960),
}

NEGATIVE_PROMPT = "pc game, console game, video game, cartoon, childish, ugly"
FIRST_PASS_SIGMAS = "1.0, 0.99375, 0.9875, 0.98125, 0.975, 0.909375, 0.725, 0.421875, 0.0"
REFINE_SIGMAS = "0.85, 0.7250, 0.4219, 0.0"
SAVE_NODE = "34"


def dimensions(aspect_ratio: str | None) -> tuple[int, int]:
    return DIMENSIONS.get(aspect_ratio or "16:9", DIMENSIONS["16:9"])


def frame_count(duration_seconds: float) -> int:
    """Templates use seconds * fps + 1 (LTX wants 8k + 1 frames: 5 s -> 121, 10 s -> 241)."""
    seconds = max(1, min(20, int(round(duration_seconds))))
    return seconds * FPS + 1


def build_graph(prompt: str, aspect_ratio: str | None = "16:9", duration_seconds: float = 5.0,
                seed: int = 42, image_name: str | None = None) -> dict:
    """ComfyUI /prompt graph. `image_name` (an uploaded image) switches to image to video."""
    width, height = dimensions(aspect_ratio)
    length = frame_count(duration_seconds)
    g: dict[str, dict] = {
        "1": {"class_type": "UNETLoader", "inputs": {
            "unet_name": "ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors",
            "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader", "inputs": {
            "clip_name": "gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot.safetensors",
            "type": "ltxv", "device": "default"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": "ltx-2.5-video-vae-bf16.safetensors"}},
        "4": {"class_type": "VAELoader", "inputs": {"vae_name": "ltx-2.5-audio-vae-bf16.safetensors"}},
        "5": {"class_type": "LatentUpscaleModelLoader", "inputs": {
            "model_name": "ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors"}},
        "6": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": prompt}},
        "7": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": NEGATIVE_PROMPT}},
        "8": {"class_type": "LTXVConditioning", "inputs": {
            "positive": ["6", 0], "negative": ["7", 0], "frame_rate": float(FPS)}},
        "12": {"class_type": "EmptyLTXVLatentVideo", "inputs": {
            "width": width // 2, "height": height // 2, "length": length, "batch_size": 1}},
        "14": {"class_type": "LTXVEmptyLatentAudio", "inputs": {
            "audio_vae": ["4", 0], "frames_number": length, "frame_rate": FPS, "batch_size": 1}},
        "15": {"class_type": "LTXVConcatAVLatent", "inputs": {"video_latent": ["12", 0], "audio_latent": ["14", 0]}},
        "16": {"class_type": "LTXVDualCFGGuider", "inputs": {
            "model": ["1", 0], "positive": ["8", 0], "negative": ["8", 1], "video_cfg": 1.0, "audio_cfg": 1.0}},
        "17": {"class_type": "RandomNoise", "inputs": {"noise_seed": int(seed)}},
        "18": {"class_type": "KSamplerSelect", "inputs": {"sampler_name": "euler_ancestral"}},
        "19": {"class_type": "ManualSigmas", "inputs": {"sigmas": FIRST_PASS_SIGMAS}},
        "20": {"class_type": "SamplerCustomAdvanced", "inputs": {
            "noise": ["17", 0], "guider": ["16", 0], "sampler": ["18", 0], "sigmas": ["19", 0],
            "latent_image": ["15", 0]}},
        "21": {"class_type": "LTXVSeparateAVLatent", "inputs": {"av_latent": ["20", 0]}},
        "22": {"class_type": "LTXVLatentUpsampler", "inputs": {
            "samples": ["21", 0], "upscale_model": ["5", 0], "vae": ["3", 0]}},
        "24": {"class_type": "LTXVConcatAVLatent", "inputs": {"video_latent": ["22", 0], "audio_latent": ["21", 1]}},
        "25": {"class_type": "LTXVDualCFGGuider", "inputs": {
            "model": ["1", 0], "positive": ["8", 0], "negative": ["8", 1], "video_cfg": 1.0, "audio_cfg": 1.0}},
        "26": {"class_type": "RandomNoise", "inputs": {"noise_seed": 42}},
        "27": {"class_type": "KSamplerSelect", "inputs": {"sampler_name": "euler_ancestral"}},
        "28": {"class_type": "ManualSigmas", "inputs": {"sigmas": REFINE_SIGMAS}},
        "29": {"class_type": "SamplerCustomAdvanced", "inputs": {
            "noise": ["26", 0], "guider": ["25", 0], "sampler": ["27", 0], "sigmas": ["28", 0],
            "latent_image": ["24", 0]}},
        "30": {"class_type": "LTXVSeparateAVLatent", "inputs": {"av_latent": ["29", 0]}},
        "31": {"class_type": "VAEDecodeTiled", "inputs": {
            "samples": ["30", 0], "vae": ["3", 0], "tile_size": 512, "overlap": 64,
            "temporal_size": 64, "temporal_overlap": 16}},
        "32": {"class_type": "LTXVAudioVAEDecode", "inputs": {"samples": ["30", 1], "audio_vae": ["4", 0]}},
        "33": {"class_type": "CreateVideo", "inputs": {"images": ["31", 0], "audio": ["32", 0], "fps": float(FPS)}},
        SAVE_NODE: {"class_type": "SaveVideo", "inputs": {
            "video": ["33", 0], "filename_prefix": "ltx25/clip", "format": "auto", "codec": "auto"}},
    }
    if image_name:
        # Image to video: the first frame is written into the latent before each pass
        # (strength 0.7 on the first pass, 1.0 after the upscale), as in the i2v template.
        g["10"] = {"class_type": "LoadImage", "inputs": {"image": image_name}}
        g["11"] = {"class_type": "LTXVPreprocess", "inputs": {"image": ["10", 0], "img_compression": 18}}
        g["13"] = {"class_type": "LTXVImgToVideoInplace", "inputs": {
            "vae": ["3", 0], "image": ["11", 0], "latent": ["12", 0], "strength": 0.7, "bypass": False}}
        g["23"] = {"class_type": "LTXVImgToVideoInplace", "inputs": {
            "vae": ["3", 0], "image": ["11", 0], "latent": ["22", 0], "strength": 1.0, "bypass": False}}
        g["15"]["inputs"]["video_latent"] = ["13", 0]
        g["24"]["inputs"]["video_latent"] = ["23", 0]
    return g
