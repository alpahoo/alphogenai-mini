"""
AudioLDM2 audio generation on Modal GPU.

Generates ambient/scene audio from text prompts to accompany Wan videos.
Seedance handles its own audio via Kie.ai — this is only for Wan.

Usage:
    audio_bytes = generate_audio.remote("ocean waves crashing", 5)
"""
from __future__ import annotations

import io
import modal

from modal_app.video_pipeline import app, secrets

# ---------------------------------------------------------------------------
# Audio GPU image — lighter than video (A10G sufficient)
# ---------------------------------------------------------------------------
audio_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install(
        "torch==2.2.0",
        "torchaudio==2.2.0",
        "diffusers>=0.27.0",
        "transformers>=4.38.0",
        "scipy",
        "accelerate",
    )
)


@app.function(
    image=audio_image,
    gpu="A10G",
    secrets=[secrets],
    timeout=300,
    retries=0,
)
def generate_audio(prompt: str, duration_seconds: int = 5) -> bytes:
    """
    Generate audio from a text prompt using AudioLDM2.

    Args:
        prompt: Scene description for audio generation
        duration_seconds: Target audio duration (clamped to 2-30s)

    Returns:
        MP3 bytes of generated audio
    """
    import torch
    import torchaudio
    import subprocess
    import tempfile
    from pathlib import Path
    from diffusers import AudioLDM2Pipeline

    duration = max(2, min(30, duration_seconds))
    print(f"[audio] generating {duration}s audio for: {prompt[:60]}")

    # Load model (cached after first run via Modal image)
    pipe = AudioLDM2Pipeline.from_pretrained(
        "cvssp/audioldm2",
        torch_dtype=torch.float16,
    ).to("cuda")

    # Generate audio
    # AudioLDM2 uses audio_length_in_s parameter
    audio = pipe(
        prompt=prompt,
        audio_length_in_s=duration,
        num_inference_steps=50,
        guidance_scale=3.5,
    ).audios[0]

    sample_rate = 16000  # AudioLDM2 default

    print(f"[audio] generated {len(audio)} samples at {sample_rate}Hz")

    # Save as WAV first, then convert to MP3 via ffmpeg
    with tempfile.TemporaryDirectory() as tmpdir:
        wav_path = Path(tmpdir) / "audio.wav"
        mp3_path = Path(tmpdir) / "audio.mp3"

        # Save WAV
        audio_tensor = torch.tensor(audio).unsqueeze(0)
        torchaudio.save(str(wav_path), audio_tensor, sample_rate)

        # Convert to MP3
        subprocess.run(
            [
                "ffmpeg", "-y",
                "-i", str(wav_path),
                "-codec:a", "libmp3lame",
                "-b:a", "192k",
                str(mp3_path),
            ],
            capture_output=True,
            check=True,
        )

        mp3_bytes = mp3_path.read_bytes()

    print(f"[audio] encoded MP3: {len(mp3_bytes) / 1024:.1f} KB")
    return mp3_bytes
