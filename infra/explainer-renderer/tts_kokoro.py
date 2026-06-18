#!/usr/bin/env python3
"""
Per-scene voice-over generation for the explainer POC — Kokoro (local, CPU, free).

Reads a storyboard JSON, synthesizes each scene's `voiceover_line` with Kokoro,
writes <out_assets>/vo-<i>.wav, and an audio-manifest.json that build.js
auto-detects to embed <audio> tracks and stretch scene durations to fit.

No API key, no per-character fees — aligned with the "zero server cost" model.
TTS is intentionally isolated here so a provider switch (ElevenLabs/OpenAI) is a
drop-in replacement of this one step later.

Usage:
  python tts_kokoro.py <storyboard.json> <out_assets_dir> [voice]
Requires: kokoro-onnx, soundfile, espeak-ng, and the model files
  kokoro-v1.0.onnx + voices-v1.0.bin in the working dir (or KOKORO_MODEL_DIR).
"""
import json
import os
import sys

import soundfile as sf
from kokoro_onnx import Kokoro

MODEL_DIR = os.environ.get("KOKORO_MODEL_DIR", ".")
DEFAULT_VOICE = "af_heart"  # warm female; product-promo friendly


def main():
    if len(sys.argv) < 3:
        print("usage: python tts_kokoro.py <storyboard.json> <out_assets_dir> [voice]")
        sys.exit(1)
    storyboard_path, out_dir = sys.argv[1], sys.argv[2]
    voice = sys.argv[3] if len(sys.argv) > 3 else DEFAULT_VOICE

    os.makedirs(out_dir, exist_ok=True)
    with open(storyboard_path, encoding="utf-8") as f:
        storyboard = json.load(f)
    scenes = storyboard.get("scenes", [])

    kokoro = Kokoro(
        os.path.join(MODEL_DIR, "kokoro-v1.0.onnx"),
        os.path.join(MODEL_DIR, "voices-v1.0.bin"),
    )

    manifest = []
    for i, scene in enumerate(scenes):
        line = (scene.get("voiceover_line") or "").strip()
        if not line:
            continue
        samples, sr = kokoro.create(line, voice=voice, speed=1.0, lang="en-us")
        rel = f"assets/vo-{i}.wav"
        path = os.path.join(out_dir, f"vo-{i}.wav")
        sf.write(path, samples, sr)
        dur = round(len(samples) / sr, 3)
        manifest.append({"scene_index": i, "url": rel, "duration_sec": dur})
        print(f"[tts] scene {i}: {dur}s -> {rel}  ({line[:50]})")

    with open(os.path.join(out_dir, "audio-manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    print(f"[tts] wrote {len(manifest)} voice-overs + audio-manifest.json")


if __name__ == "__main__":
    main()
