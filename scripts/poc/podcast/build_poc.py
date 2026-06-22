#!/usr/bin/env python3
"""
T-1131-poc — Podcast compositing prototype (THROWAWAY, off-prod).

Builds a short two-shot "podcast video" MP4 from a fixed segments.json to judge
the VISUAL concept: layout, rhythm/timing, active-speaker cue, lower-thirds, and
deterministic captions. Voice-first (placeholder tones, no TTS provider) — the
point here is compositing + timeline, not the voice quality.

Self-contained: PIL (frames) + numpy (placeholder audio) + the ffmpeg binary that
ships with the `imageio_ffmpeg` pip package. No system ffmpeg, no network, no API
keys, no cost, no prod touch.

EXTENSIBILITY TOWARD LIP-SYNC (deliberate):
The timeline is a list of independent per-segment "clips". Today each clip is
rendered statically by `render_frame()` for its [start,end] window. In the future
premium lip-sync mode, the SAME timeline would instead place a pre-rendered
lip-synced video clip per segment — the contract (segment -> {speaker, audio,
start_ms, end_ms, text}) does not change. See `Segment`/`build_timeline()`.

Usage:  python scripts/poc/podcast/build_poc.py
Output: tmp/podcast-poc/output.mp4  (+ intermediate assets in tmp/podcast-poc/)
"""

from __future__ import annotations
import json, math, os, subprocess, sys, wave
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

# ---------------------------------------------------------------------------
# Paths & constants
# ---------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
SEG_JSON = HERE / "segments.json"
OUT_DIR = ROOT / "tmp" / "podcast-poc"
OUT_DIR.mkdir(parents=True, exist_ok=True)

W, H, FPS = 1280, 720, 24
SR = 44100  # audio sample rate

try:
    import imageio_ffmpeg
    FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
except Exception as e:  # pragma: no cover
    print("imageio_ffmpeg not available:", e); sys.exit(1)

FONT_DIR = Path("C:/Windows/Fonts")
def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    for cand in (name, "arial.ttf"):
        p = FONT_DIR / cand
        if p.exists():
            return ImageFont.truetype(str(p), size)
    return ImageFont.load_default()

F_TITLE = font("arialbd.ttf", 30)
F_NAME  = font("arialbd.ttf", 26)
F_CAP   = font("arialbd.ttf", 34)
F_SMALL = font("arial.ttf", 20)


def hex2rgb(h: str):
    h = h.lstrip("#")
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))


# ---------------------------------------------------------------------------
# Timeline model  (the lip-sync-ready contract)
# ---------------------------------------------------------------------------
@dataclass
class Segment:
    order: int
    speaker_id: str
    text: str
    start_ms: int
    end_ms: int
    @property
    def dur(self) -> float:
        return (self.end_ms - self.start_ms) / 1000.0


def estimate_duration(text: str) -> float:
    words = max(1, len(text.split()))
    # snappy POC pacing; clamp so the whole clip lands in the 20-40s target
    return min(4.5, max(2.0, words / 3.0 + 0.4))


def build_timeline(raw_segments, speakers):
    segs, t = [], 0.0
    for s in sorted(raw_segments, key=lambda x: x["order"]):
        d = estimate_duration(s["text"])
        segs.append(Segment(s["order"], s["speaker"], s["text"],
                            int(t * 1000), int((t + d) * 1000)))
        t += d
    return segs, t


# ---------------------------------------------------------------------------
# Placeholder audio  (one mono track; per-speaker tone with a speech-like envelope)
# ---------------------------------------------------------------------------
def build_audio(segs, speakers, path: Path):
    rng = np.random.default_rng(7)
    track = np.zeros(int(math.ceil(segs[-1].end_ms / 1000.0 * SR)) + SR // 2, dtype=np.float32)
    for seg in segs:
        sp = speakers[seg.speaker_id]
        n = int(seg.dur * SR)
        tt = np.arange(n) / SR
        # carrier tone per speaker
        carrier = np.sin(2 * np.pi * sp["tone_hz"] * tt)
        # speech-like envelope: random syllable gates smoothed
        gate = rng.random(int(seg.dur * 6) + 1)  # ~6 syllables/sec
        gate = np.repeat(gate, int(np.ceil(n / len(gate))))[:n]
        # smooth
        k = max(1, SR // 80)
        gate = np.convolve(gate, np.ones(k) / k, mode="same")
        env = 0.15 + 0.85 * (gate ** 1.5)
        fade = np.minimum(1.0, np.minimum(tt / 0.05, (seg.dur - tt) / 0.08))
        sig = 0.16 * carrier * env * np.clip(fade, 0, 1)
        start = int(seg.start_ms / 1000.0 * SR)
        track[start:start + n] += sig.astype(np.float32)
    track = np.clip(track, -1, 1)
    pcm = (track * 32767).astype(np.int16)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    # also keep the abs-envelope (per-sample) so the waveform UI is faithful
    return np.abs(track)


# ---------------------------------------------------------------------------
# Avatar placeholders  (generated; no external assets)
# ---------------------------------------------------------------------------
def make_avatar(speaker, size=240) -> Image.Image:
    img = Image.new("RGB", (size, size), (18, 22, 32))
    d = ImageDraw.Draw(img)
    col = hex2rgb(speaker["color"])
    d.ellipse([10, 10, size - 10, size - 10], fill=tuple(int(c * 0.35) for c in col),
              outline=col, width=6)
    # initials
    initials = "".join(p[0] for p in speaker["name"].split()[:1]).upper()
    f = font("arialbd.ttf", int(size * 0.42))
    bb = d.textbbox((0, 0), initials, font=f)
    d.text(((size - (bb[2] - bb[0])) / 2, (size - (bb[3] - bb[1])) / 2 - bb[1]),
           initials, font=f, fill=(240, 244, 250))
    return img


def wrap(draw, text, fnt, max_w):
    words, lines, cur = text.split(), [], ""
    for w_ in words:
        t = (cur + " " + w_).strip()
        if draw.textlength(t, font=fnt) <= max_w:
            cur = t
        else:
            if cur:
                lines.append(cur)
            cur = w_
    if cur:
        lines.append(cur)
    return lines


# ---------------------------------------------------------------------------
# Frame rendering  (per-segment; lip-sync would swap this for a real clip)
# ---------------------------------------------------------------------------
def rounded(draw, box, r, **kw):
    draw.rounded_rectangle(box, radius=r, **kw)


def render_frame(t, segs, speakers, avatars, env):
    img = Image.new("RGB", (W, H), (12, 14, 20))
    d = ImageDraw.Draw(img)
    # subtle backdrop bands
    d.rectangle([0, 0, W, 70], fill=(16, 19, 28))
    d.rectangle([0, H - 120, W, H], fill=(16, 19, 28))

    active = next((s for s in segs if s.start_ms / 1000.0 <= t < s.end_ms / 1000.0), segs[-1])

    # header
    d.text((40, 22), "AlphoGen Weekly — PODCAST POC", font=F_TITLE, fill=(220, 226, 236))
    d.text((W - 230, 28), "two-shot · 16:9", font=F_SMALL, fill=(120, 130, 150))

    order = ["host", "guest"]
    panel_w, panel_h = 540, 380
    gap = 40
    total = panel_w * 2 + gap
    x0 = (W - total) // 2
    y0 = 120

    for i, sid in enumerate(order):
        sp = speakers[sid]
        col = hex2rgb(sp["color"])
        is_active = (active.speaker_id == sid)
        px = x0 + i * (panel_w + gap)
        box = [px, y0, px + panel_w, y0 + panel_h]
        if is_active:
            rounded(d, [box[0] - 6, box[1] - 6, box[2] + 6, box[3] + 6], 26,
                    outline=col, width=6)
            rounded(d, box, 22, fill=(26, 31, 44))
        else:
            rounded(d, box, 22, fill=(20, 23, 32))
        # avatar
        av = avatars[sid]
        if not is_active:
            av = Image.eval(av, lambda v: int(v * 0.55))
        aw = 200
        av = av.resize((aw, aw))
        img.paste(av, (px + (panel_w - aw) // 2, y0 + 46))
        # waveform bars under avatar (active speaker only)
        if is_active:
            cx = px + panel_w // 2
            base_y = y0 + 300
            si = int(t * SR)
            for b in range(-9, 10):
                idx = min(len(env) - 1, max(0, si + b * (SR // 40)))
                amp = float(env[idx])
                bh = int(8 + amp * 150)
                bx = cx + b * 16
                d.rounded_rectangle([bx - 5, base_y - bh, bx + 5, base_y + bh], radius=4,
                                    fill=col)
        # lower-third name
        lt = [px + 24, y0 + panel_h - 52, px + 24 + d.textlength(sp["name"], font=F_NAME) + 36,
              y0 + panel_h - 12]
        rounded(d, lt, 18, fill=col if is_active else (40, 46, 60))
        d.text((px + 42, y0 + panel_h - 46), sp["name"], font=F_NAME,
               fill=(8, 12, 18) if is_active else (170, 178, 195))

    # caption (deterministic, straight from the active segment)
    cap_lines = wrap(d, active.text, F_CAP, W - 240)[:3]
    cy = H - 110
    acol = hex2rgb(speakers[active.speaker_id]["color"])
    for ln in cap_lines:
        tw = d.textlength(ln, font=F_CAP)
        d.text(((W - tw) / 2, cy), ln, font=F_CAP, fill=(238, 242, 248))
        cy += 40
    # speaker dot before caption block
    d.ellipse([60, H - 104, 84, H - 80], fill=acol)

    # progress bar
    total_dur = segs[-1].end_ms / 1000.0
    pw = int(W * min(1.0, t / total_dur))
    d.rectangle([0, H - 6, pw, H], fill=acol)
    return img


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    data = json.loads(SEG_JSON.read_text(encoding="utf-8"))
    speakers = {s["id"]: s for s in data["speakers"]}
    segs, total_dur = build_timeline(data["segments"], speakers)
    print(f"[poc] {len(segs)} segments, total {total_dur:.1f}s, {int(total_dur*FPS)} frames")

    audio_path = OUT_DIR / "dialogue.wav"
    env = build_audio(segs, speakers, audio_path)
    print(f"[poc] audio -> {audio_path}")

    avatars = {sid: make_avatar(sp) for sid, sp in speakers.items()}
    for sid, av in avatars.items():
        av.save(OUT_DIR / f"avatar_{sid}.png")

    out_path = OUT_DIR / "output.mp4"
    cmd = [FFMPEG, "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
           "-r", str(FPS), "-i", "-", "-i", str(audio_path),
           "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-preset", "veryfast",
           "-c:a", "aac", "-b:a", "128k", "-shortest", str(out_path)]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.DEVNULL)

    n_frames = int(math.ceil(total_dur * FPS))
    for fidx in range(n_frames):
        t = fidx / FPS
        frame = render_frame(t, segs, speakers, avatars, env)
        proc.stdin.write(frame.tobytes())
        if fidx % 48 == 0:
            print(f"[poc] frame {fidx}/{n_frames}")
    proc.stdin.close()
    rc = proc.wait()
    if rc != 0:
        print("[poc] ffmpeg failed", rc); sys.exit(1)
    size_kb = out_path.stat().st_size / 1024
    print(f"[poc] DONE -> {out_path} ({size_kb:.0f} KB, {total_dur:.1f}s)")


if __name__ == "__main__":
    main()
