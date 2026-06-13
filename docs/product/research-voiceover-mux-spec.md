# T-1113 — Research Story voice-over mux + routing honesty

Status: **implemented** (2026-06-13). Modal deploy required (command below).

## Goal

T-1112 fills `jobs.voiceover_text` from Research and the GET poller renders it to
`jobs.voiceover_url`. But that voice track was never burned into the MP4. T-1113
muxes the Research Story narration into the final video as a **voice-over** (an
audio track — not lip-sync), and clarifies the UI so we never promise lip-sync
where there is none.

## Audit of the real audio path (before)

Two distinct voice paths existed:

| Path | Voice source | Mux | Writes |
|---|---|---|---|
| Presenter/Avatar (HeyGen, "use my voice") | `avatar_final.audio_url` | `apply_voiceover_to_job` / `createLipsync` | overwrites `video_url` |
| Research Story (T-1112) | `voiceover_url` (TTS) | **none** | — |

Findings:
- `concat_and_finalize` muxes only background **music** (`mux_audio` vol 0.3),
  never the voice-over. Seedance clips carry native audio.
- `voiceover_url` is generated lazily in `GET /api/jobs/[id]`, *after* the video
  is `done` — so it does not exist at finalize time.
- The safest existing post-process pattern is the **overlay** route: synchronous,
  writes `output_url_final`, keeps `video_url` raw, non-fatal fallback.

### Routing honesty — verified, no copy change needed

The "Use my voice" panel offers **Lip-sync** even for Seedance. This was checked
against the backend: a Story job with `voice_mode=lipsync` stores `avatar_final`,
and the GET state machine calls `createLipsync(videoUrl, audioUrl)` — a **real
HeyGen lip-sync pass** on the Seedance clip ([route.ts:309](../../app/api/jobs/[id]/route.ts)).
So that option genuinely delivers lip-sync; its copy is accurate and is left
unchanged. The only no-lip-sync path is the auto Research Story voice-over, and
its button is explicitly labelled "audio track — not lip-sync".

## Implementation

Mirrors the overlay model exactly.

| Layer | File | Notes |
|---|---|---|
| Modal fn | `modal_app/video_pipeline.py` `apply_research_voiceover_to_video` | reads `video_url`+`voiceover_url` server-side; duck+mix; returns `_voiced` URL |
| Modal route | `/apply-research-voiceover` | synchronous, returns `output_url` |
| Client | `lib/modal-client.ts` `triggerApplyResearchVoiceover` | mirrors `triggerApplyOverlays` |
| Route | `app/api/jobs/[id]/voiceover/route.ts` | auth+ownership, `done` only, rejects HeyGen, ensures `voiceover_url`, writes `output_url_final`, non-fatal fallback |
| Overlay chain | `app/api/jobs/[id]/overlay/route.ts` | now brands `output_url_final \|\| video_url` so voice → overlay chain |
| UI | `app/jobs/[id]/page.tsx` | "Add voice-over" button (Story/research jobs), placed before "Apply branding" |

### Audio handling — duck + mix

Native clip audio is ducked to ~0.18 and the voice mixed at ~1.6 via ffmpeg
`amix` (`duration=first`, so the result follows the video length). If the clip
has no usable native audio, it falls back to replacing the track with the voice.

### Chaining with overlay

Voice writes `output_url_final` (voiced); the overlay route now reads
`output_url_final || video_url`, so applying voice then branding yields
voice + branding. `video_url` always stays the raw clip. Re-running overlay
re-brands the current `output_url_final` (known V1 idempotency edge — acceptable).

### Safety

- `voiceover_url` and `video_url` are read **server-side** in Modal; the client
  never supplies a URL.
- Auth + strict ownership in the route; `done` jobs only.
- Modal failure → route returns `{ fallback: true }`, `output_url_final`
  untouched, raw `video_url` always valid.

## Modal deploy command

```powershell
$env:PYTHONIOENCODING="utf-8"; $env:PYTHONUTF8="1"
python -m modal deploy modal_app/video_pipeline.py
```

## Out of scope

- Auto-mux during finalization (kept explicit/post-done for safety).
- Per-scene audio timing / forced alignment.
- Overlay idempotency hardening (double-brand on repeated clicks).
- Any change to the genuine "Use my voice" lip-sync path.

## No database change

Uses existing `jobs.video_url`, `voiceover_url`, `output_url_final`. No migration.
