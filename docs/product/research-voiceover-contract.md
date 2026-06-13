# T-1112 — Research Voice-over Contract

Status: **implemented** (2026-06-13)

## Goal

A video job created from a Research plan should speak the research narration
automatically, with no manual transcription. This document defines the contract
that turns Research output into a job's spoken voice-over.

## Where this fits

```
Research plan ──► research_scripts.script  (full narration prose)
             └──► research_storyboards.scenes_json[].voiceover_line  (one line / scene)

POST /api/jobs (research_job_id present)
   └─ buildVoiceoverScript({ scenes, script })  ── pure, deterministic
        └─ jobs.voiceover_text  (≤ 2000 chars)

GET /api/jobs/[id]  (existing one-shot TTS, unchanged)
   └─ generateVoiceover(voiceover_text) ─► R2 ─► jobs.voiceover_url
```

The voice-over **rendering** path (TTS → `voiceover_url`) already existed before
T-1112 and is untouched. T-1112 only fills the gap that left
`jobs.voiceover_text` empty for Research-backed jobs.

## Contract

### Canonical source — per-scene lines

The spoken track is the concatenation of `scenes_json[].voiceover_line`, in
scene (display) order, joined by a single space. This is the **same text** the
post-production overlay uses for captions ([overlay-plan.ts](../../lib/overlay/overlay-plan.ts)),
so the audio narration and on-screen captions stay aligned.

- Each line is whitespace-normalized (internal runs collapsed, trimmed).
- Empty, whitespace-only, and non-string lines are dropped (order preserved).

### Fallback — full script

When no usable per-scene line exists (none present, all empty, or no scenes),
fall back to `research_scripts.script` (whitespace-normalized). If that is also
empty, the result is `""` and `voiceover_text` is simply not set — the job has
no voice-over, exactly as before.

### Length cap

Output is capped at **`VOICEOVER_MAX_CHARS = 2000`**, matching the existing
`jobs.voiceover_text` store slice in `POST /api/jobs`. Truncation prefers a word
boundary. This is a known V1 limit: a 120 s premium narration (~300 words ≈
~1800 chars) fits, but longer scripts are clipped. Raising the cap is deferred
(would require reconciling the store slice and the per-provider TTS input caps
in [lib/tts.ts](../../lib/tts.ts)) and is **out of scope** for T-1112.

### Trigger — automatic at job creation

`voiceover_text` is populated automatically when a job is created with a valid
`research_job_id`. The narration is the user's own research content (not
third-party media), so auto-population does not violate the
"no auto third-party media without selection" constraint.

### Precedence

An explicit caller-provided `voiceover_text` **always wins**. The Research
derivation only fills `voiceover_text` when the caller did not supply one. This
keeps manual override and job-duplication behavior intact.

### Resilience

Derivation is best-effort and **non-fatal**: any DB/read error is logged and
leaves `voiceover_text` unset rather than failing job creation. Mirrors the
overlay and TTS fallback discipline.

### Provider confidentiality

This contract is provider-agnostic. `buildVoiceoverScript` never names a TTS
provider; provider selection stays in `lib/tts.ts` (ElevenLabs → OpenAI). TTS
is audio synthesis and is intentionally **not** routed through LiteLLM — the
LiteLLM constraint covers Research **text** LLM calls only.

## Components

| Layer | File | Notes |
|---|---|---|
| Pure helper | `lib/voiceover/voiceover-script.ts` | `buildVoiceoverScript`, deterministic, tested |
| Tests | `lib/voiceover/__tests__/voiceover-script.test.ts` | sources, fallback, truncation, malformed input |
| Wiring | `app/api/jobs/route.ts` | derive on create, explicit caller wins, non-fatal |
| Render (existing) | `app/api/jobs/[id]/route.ts` | one-shot TTS → `voiceover_url` (unchanged) |

## Out of scope (V1)

- Raising the 2000-char cap / multi-chunk long-form narration.
- Per-scene audio timing / forced alignment to scene boundaries.
- Voice selection UI, voice cloning, language override controls.
- Routing TTS through the VPS gateway / Speaches.
- Story-vs-Presenter routing and lip-sync honesty (→ T-1113).

## No database change

`jobs.voiceover_text` and `jobs.voiceover_url` already exist
([20260520_add_audio_mode_columns.sql](../../supabase/migrations/20260520_add_audio_mode_columns.sql),
earlier jobs migrations). T-1112 adds **no** migration.
