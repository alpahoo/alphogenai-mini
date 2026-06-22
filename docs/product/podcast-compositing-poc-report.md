# Podcast Compositing — POC Report (T-1131-poc)

**Status:** Throwaway prototype, **off-prod**. No API, no DB, no migration, no `/create/podcast`, no prod runtime change.
**Goal:** Validate the *visual concept* of a two-shot podcast video (layout, rhythm/timing, active-speaker cue, lower-thirds, deterministic captions, audio mux) before committing to schema/API/render work. Voice-first only — lip-sync stays the eventual premium target.

## What was built

- **Fixed input:** [`scripts/poc/podcast/segments.json`](../../scripts/poc/podcast/segments.json) — 2 speakers (Host/Guest), 8 alternating segments, short lines, per-speaker color/voice label/tone.
- **Builder (self-contained):** [`scripts/poc/podcast/build_poc.py`](../../scripts/poc/podcast/build_poc.py) — PIL frames + numpy placeholder audio + the ffmpeg that ships with the `imageio_ffmpeg` pip package. **No system ffmpeg, no network, no API keys, no cost.**
- **Output (local, git-ignored):** `tmp/podcast-poc/output.mp4` — 1280×720, 16:9, 24 fps, H.264 + AAC, **34.5 s**, ~1.07 MB. Built in **~13 s** on CPU.

## How it ran (validation)

| Acceptance criterion | Result |
|---|---|
| MP4 opens locally | ✅ valid H.264/yuv420p + AAC mono (ffprobe clean) |
| Timeline alternates Host/Guest | ✅ clear (verified frames at 6 s = Guest active, 9 s = Host active) |
| Captions legible & exact | ✅ burned from `segments.json` verbatim, wrapped, centered |
| Active speaker identifiable | ✅ colored border + brighter panel + waveform + highlighted lower-third; the other speaker dimmed |
| Duration in 20–40 s | ✅ 34.5 s |
| No prod change | ✅ off-prod scripts + docs only; `tmp/` git-ignored |

## What works

- **Two-shot layout reads instantly** as a podcast: two framed speakers, names as lower-thirds, active one emphasized.
- **Active-speaker cue is unambiguous** — border color + panel brightness + a live waveform under the talking speaker.
- **Deterministic captions** straight from the segment text are accurate and well-placed (we already have the text + timing, so captions are essentially free).
- **Audio mux** of the dialogue track is trivial and reuses the same approach as the existing voiceover-mux brick.
- **Cheap & fast:** ~13 s CPU render for 34.5 s of 720p — the voice-first path has no GPU dependency.
- **Lip-sync-ready structure:** the timeline is a list of independent per-segment "clips" (`Segment{speaker,text,start_ms,end_ms}`). Today `render_frame()` draws each segment's window statically; in premium lip-sync mode the *same* timeline would place a pre-rendered lip-synced clip per segment instead — the contract doesn't change.

## What does NOT work / limitations of the POC

- **No real voices.** Audio is a per-speaker placeholder tone with a speech-like envelope (drives the waveform). TTS was intentionally skipped — the POC targets compositing/timing, not voice quality.
- **No lip-sync.** Speakers are static framed avatars (generated initials placeholders), not talking heads.
- **Avatars are placeholders** (colored circle + initial), not real portraits.
- **Sequential turns only** — no overlap/crosstalk, no interruptions.
- **One layout implemented** (two-shot). Split-screen / talk-show are described in the backend spec but not built here.
- **Timing is estimated** from word count, not from actual audio length (in prod, probe the synthesized audio for true per-segment duration).
- **Captions burned in** here; in prod they should defer to the existing post-production captions on the Job page (no need to bake them).

## Visual quality assessment

For a voice-first product, **the quality is convincing**: the layout, active-speaker emphasis, lower-thirds, and synchronized captions already look like a shareable podcast clip — at near-zero cost and no GPU. With real TTS voices swapped in (a one-line change to the audio step), this is shippable as a "voice-first podcast". It clearly is *not* a lip-synced talking-head video, and shouldn't be sold as one.

## Cost / time estimate (extrapolated)

- **Voice-first (this POC path):** CPU-only ffmpeg compositing, ~13 s for 34 s of video → a ~3 min podcast ≈ well under a minute of CPU render. Marginal cost ≈ TTS only (~a few credits per podcast, per `lib/lipsync-cost.ts`). **Cheap.**
- **Lip-sync premium (future):** dominated by HeyGen lip-sync per speaker per segment (speed ~2 cr/s, precision ~5 cr/s × 2 speakers) → multiples more expensive and slower, GPU-bound. Justifies a premium tier.

## Recommendation

**Hybrid, voice-first first.** Ship the voice-first path as V1 (this POC proves it's cheap, fast, and visually credible), and keep **lip-sync as a premium `render_mode`** layered on the *same* timeline/compositing contract — exactly the A-vs-B framing in [`podcast-video-backend-spec.md`](./podcast-video-backend-spec.md). Concretely:

1. Proceed to **T-1131b (schema)** — the POC validates that the segment/timeline model in the spec is the right shape.
2. Swap the placeholder tones for **real multi-speaker TTS** (T-1131d) — drop-in at the audio step.
3. Promote this builder to a **Modal worker** for the render step (T-1131e); CPU is enough for voice-first.
4. Add **split-screen / talk-show** layouts and the **lip-sync render_mode** as follow-ups.

Do **not** present voice-first as the final destination: it's the cheap tier. The product target keeps both — voice-first (cheap) and lip-sync (premium).

## Reproduce

```bash
python scripts/poc/podcast/build_poc.py
# -> tmp/podcast-poc/output.mp4   (local only; tmp/ is git-ignored)
```
