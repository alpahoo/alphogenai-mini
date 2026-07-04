# T-1142 — Real Video Duo / Talking Avatars — Spec + Mini-Audit

Status: **spec/audit only — no prod code in this ticket.**
Author: Claude · Date: 2026-07-04 · Scope: Podcast only.

Goal: move the podcast from **static two-shot portraits** (T-1136e: persona image
composited into a card + waveform) toward a **Jogg-style talking duo** where each
speaker is a face that lip-syncs to their own TTS line.

---

## 1. Mini-audit — what already exists

### 1.1 Podcast render (today)
- Modal `modal_app/video_pipeline.py :: render_podcast` composites a **two-shot card**
  per speaker: circular persona portrait (or placeholder) + animated waveform +
  captions, muxed with the concatenated per-segment TTS audio. **No motion, no
  lip-sync** — it's an image + audio slideshow.
- Audio: per-segment TTS (batched 6/req, T-1135b), RMS-normalized (T-1137a).
- Personas: `podcast_personas` (catalog / uploaded+consent / generated) → resolved
  to a portrait at render (T-1136e), assignable per speaker via the Duo picker
  (T-1136d). `podcast_speakers.persona_id` FK; `podcast_speakers.avatar_id` column
  **already exists** (legacy/free-form, currently unused by the render).

### 1.2 HeyGen client — already in stack (`lib/heygen-client.ts`)
Talking-avatar + lip-sync are **already implemented and used by the general video
pipeline** (`/create/avatar`, jobs, `/api/heygen`). Reusable primitives:
- `createPhotoAvatar(photo)` → photo → avatar look; `listAvatars` / `listOwnedAvatars`.
- `createAvatarVideo({avatarId, scriptText, voiceId})` → **text → talking avatar**
  (v3, engine `avatar_iv`, 1080p, 16:9/9:16). Poll via `getHeyGenTask`.
- `createAvatarShotsVideo` + `splitScriptIntoChunks` (multi-clip long scripts).
- `createLipsync(videoUrl, audioUrl, mode)` + `getLipsyncTask` → **lip-sync an
  existing clip to a given audio track** (dynamic duration, trims to audio ±15%).
- `cloneVoice`, `listVoices`, `generateSpeech`.
- Cost heuristics: `lib/lipsync-cost.ts` (TTS ~0.01 cr/100 char; lipsync speed
  ~2 cr/s, precision ~5 cr/s; full Avatar Shots ~50–100 cr — **rough, plan-dependent**).

### 1.3 Confidentiality guardrail (reminder)
Public UI must show **capabilities**, never provider names (BytePlus/HeyGen/EvoLink…)
— `lib/__tests__/provider-leak-guard.test.ts` fails the build otherwise. Any new
podcast UI copy says "Talking avatar" / "Realistic presenter", not "HeyGen".

### 1.4 Key architectural fact
Podcast rendering lives on **Modal** (ffmpeg compositing). Talking avatars come from
**HeyGen** (REST, async jobs polled from Next). A talking duo therefore **shifts the
podcast render** from "Modal composites static cards" to "generate per-speaker
talking clips (HeyGen) → composite/stitch". This is the central design decision.

---

## 2. Approaches considered

### A. Per-segment lip-sync on a persona clip (`createLipsync`)
For each segment: take the speaker's persona (a short base video/looping portrait)
+ that segment's TTS audio → `createLipsync` → a talking clip. Composite clips into
the two-shot timeline (Modal keeps doing layout; only the avatar tiles become video).
- ✅ Reuses existing TTS (already normalized), keeps our voices, keeps layout.
- ✅ Works for uploaded/catalog **portraits** (needs a base clip per persona).
- ⚠️ Many HeyGen jobs (1 per segment × 2 speakers) → cost + latency + polling.
- ⚠️ Needs a base **video** per persona (portrait → short idle clip), not just an image.

### B. Text → talking avatar per segment (`createAvatarVideo`)
Skip our TTS; HeyGen generates voice + avatar from the script text per segment.
- ✅ Simplest call; native lip-sync quality.
- ❌ Abandons our TTS pipeline (voices, RMS leveling, batching) and our per-segment
  audio; ties voice to HeyGen voices. Big regression on control. **Rejected** as default.

### C. Full-scene single avatar (one speaker) / Avatar Shots
Not a duo. Out of scope for "duo".

### D. Hybrid two-shot with only the **active** speaker animated
At any moment only one speaker talks. Generate a talking clip **only for the active
speaker's segments**; the listener shows the static portrait (as today). Halves the
avatar-clip count vs. animating both continuously.
- ✅ Cost/latency ~halved, natural (listener isn't lip-moving anyway).
- ✅ Degrades gracefully to today's static tile if a clip fails.

### Recommendation
**A + D**: per-segment `createLipsync` for the **active speaker only**, using a base
clip derived from the persona; the inactive tile stays the static portrait. Keep our
TTS + normalization. Modal still owns final layout/captions/concat. Fallback-safe:
any failed avatar clip → static portrait tile (never break the render).

---

## 2b. Product strategy — render_mode tiers (user decision, 2026-07-04)
"Jogg-level" ≠ animated portraits. Real duos come from **people in a setting** (mic,
posture, framing) → needs real **base clips** per persona, not just portraits.
Static-portrait lip-sync is the tech foundation, not the end product. Cost/time
explode on long formats (10–45 min), so talking is offered in **tiers**, not all-or-nothing:

- **`static`** — current mode. Fast, cheap, reliable. Default, and the always-available
  fallback. Works for any length.
- **`talking_highlights`** — animate only intro / transitions / key moments; the rest
  stays static. Best cost/impact compromise, viable for long podcasts.
- **`talking_active_speaker`** — approach A+D: lip-sync the active speaker each segment.
  Good for short/medium formats.
- **`full_talking_duo`** — premium, both speakers animated. Opt-in, cost-disclosed,
  likely gated to short formats and/or paid plans.

Rules baked in from day one:
- **Cost estimator before render**: show "Estimated: X credits / ~Y min" per mode
  before the user commits.
- **Per-segment cache**: key = (persona + text + audio hash). Same inputs → reuse the
  clip, never re-bill on re-render.
- **Real base clips per persona** (not portraits): a person in a setting (mic, framing).
  This is what makes it look Jogg-level; portrait lip-sync is only the MVP rung.
- **Long formats**: do NOT target full lip-sync first — aim "long podcast + smart
  animated clips" (`talking_highlights`) rather than 45 min of full lip-sync.

## 3. Data model (future — needs a migration, NOT in this ticket)
Reuse `metadata jsonb` where possible; add explicit columns only if needed.
- `podcast_personas`: add `base_clip_path` (a short idle/talking base video for the
  face) and/or `heygen_avatar_id` (for photo-avatar reuse). Likely `metadata jsonb`
  on personas, OR dedicated columns.
- `podcast_speakers.avatar_id` already exists → can hold the resolved avatar/look id.
- A per-podcast `metadata.render_mode` ∈ `static | talking_highlights |
  talking_active_speaker | full_talking_duo` (default `static`; anything else opt-in).
- Persist generated talking-clip URLs per segment for reuse (avoid re-billing on
  re-render when text/audio unchanged) — e.g. `podcast_segments.metadata.talking_clip_url`.

## 4. Consent / policy (hard requirement)
- **Real people**: a talking avatar of a real person needs the same (or stronger)
  consent as uploaded personas — `consent_confirmed_at` already enforced for
  `uploaded`. Talking mode on an `uploaded` persona MUST require a **likeness/animation
  consent** (new consent_statement_version), not just image-use consent.
- No public figures / celebrities (reuse `screenPersonaName` + content policy).
- Catalog/generated (non-real) faces: safe to animate.
- Clear cost disclosure before generating (credits) — no hidden spend.

## 5. Invariants to preserve
- Editing text/persona still **invalidates the render** (video_url cleared) — and
  must also invalidate cached talking-clip URLs for changed segments.
- Fallback-safe: any HeyGen failure → static portrait tile; never a broken render.
- Never "new content + old MP4"; never bill silently on unchanged re-render (reuse
  cached clips keyed by (segment text + audio + persona)).
- No provider name leaks in public UI.

## 6. Phased plan (proposed follow-up tickets)
- **T-1143** — persona base-clip pipeline: turn a persona portrait into a reusable
  short idle/base clip (photo-avatar or a still-to-video), stored + consent-gated.
- **T-1144** — talking render mode (opt-in): per-segment lip-sync of the active
  speaker; cache clip URLs; Modal composites talking tiles; fallback to static.
- **T-1145** — cost UI + guardrails: credit estimate before generating, plan gate,
  disclosure; content/consent checks for animating real faces.
- **T-1146** — QA + polish: latency (parallel HeyGen jobs + polling), quality modes.

## 7. Cost & latency (order of magnitude, verify against live plan)
- A 60 s podcast ≈ 8–12 segments; talking active-speaker only ≈ 8–12 lipsync jobs.
- Precision ~5 cr/s → a ~5 s clip ≈ 25 cr; 10 clips ≈ **~250 credits / podcast**
  (speed mode roughly half). **Must be confirmed against the real HeyGen plan
  before enabling** — `lib/lipsync-cost.ts` is heuristic only.
- Latency: HeyGen jobs are async (poll); 10 parallel clips → minutes. Needs a
  progress UX (the guided-loading pattern from T-1139 extends naturally).

## 8. Risks / open questions
- **Cost is the #1 risk** — talking mode could be 100×+ the static render cost. Must
  be opt-in + plan-gated + estimated up front.
- Base-clip source: HeyGen photo-avatar quality on arbitrary uploads varies; may need
  a "generate base clip" step + preview before committing to a full render.
- Voice: keep our TTS (approach A) → lip-sync must accept our audio (it does), but
  sync quality on non-HeyGen audio should be validated on a sample first.
- Re-render economics: caching keyed correctly is essential to avoid re-billing.
- Modal ↔ HeyGen orchestration: who stitches? Recommend Modal fetches the finished
  HeyGen clips and composites (keeps one final-assembly path).

## 9. Non-goals (this spec)
- No implementation, no migration, no Modal change in T-1142.
- Not replacing the static mode — talking is an **added opt-in mode**.
- No real-time/streaming avatars; no multi-party (>2) duo.

## 10. Decisions (2026-07-04)
- ✅ **A+D validated as the technical direction** (per-segment lip-sync, active
  speaker, keep our TTS, fallback static) — but wrapped in the **tiered strategy**
  (§2b): static / talking_highlights / talking_active_speaker / full_talking_duo.
- ✅ Talking is **opt-in, cost-disclosed** (estimator before render), **cached**
  per segment; long formats favor `talking_highlights`, not full lip-sync.
- ✅ **GO for a 1-clip spike BEFORE any heavy code** (gate for T-1143+).
- 🎯 Jogg-level requires **real base clips** (person in a setting), not portrait
  animation — the MVP rung is portrait lip-sync, the product bar is base clips.

### Spike — must answer 4 questions (gate)
1. **Lip-sync quality** with **our TTS** audio (not HeyGen voice).
2. **Real HeyGen credit cost** per clip (verify `lipsync-cost.ts` heuristics).
3. **Real generation time** (async job latency).
4. **Visual fit** inside our Modal two-shot layout.
→ If convincing: start **T-1143** (base-clip pipeline). If not: adjust before
burning time/credits.

### Spike execution note
HeyGen API key is **server-side only** (Vercel env) — a spike cannot run from a
local shell. It needs a tiny **admin-gated** internal route that calls
`createLipsync(baseClipUrl, ourTtsAudioUrl)` + polls, returning result URL + timing;
credit cost read from the HeyGen dashboard. Base clip: a HeyGen stock avatar clip or
one `createAvatarVideo` output; our TTS audio: an existing R2 segment URL. Scope,
inputs and expected credit spend to be confirmed before running.

### Spike RESULT (2026-07-05, mini-gate — 1 clip, precision)
Ran via the admin route (`podcast-lipsync-spike`). Inputs: Maya's ready 1:1/720p
base clip (4.28 s) + our real TTS segment audio (podcast e531f932, order_index 0,
4.49 s). Base clip reused → the only paid call was **one** `createLipsync`.
- **Q1 Quality (our TTS): ✅ convincing.** Photoreal, stable identity, mouth
  articulates and clearly varies frame-to-frame in sync with our TTS (open at
  t≈2.0 s, closed/rounded at t≈3.6 s). No obvious mouth artifacts at 720p.
- **Q2 Credit cost: heuristic only, dashboard read pending.** HeyGen's lipsync
  task payload does NOT expose per-task credits — must be read from the HeyGen
  billing dashboard. Heuristic (precision ~5 cr/s × ~4.5 s) ≈ **~16–23 cr** for
  this clip. **First attempt failed on a validation error (audio/video duration
  mismatch >15%) → 0 credits** (no processing). ACTION: confirm exact credits on
  the dashboard before enabling.
- **Q3 Generation time: ~90–100 s wall-clock** for one 4.5 s precision clip
  (async: processing at 28 s & 64 s, completed by ~100 s). Implies a full podcast
  (8–12 active-speaker clips) is minutes even with parallel polling → needs the
  guided-loading progress UX + per-segment cache.
- **Q4 Visual fit: ✅ by construction.** Output is **720×720 (1:1)** — exactly the
  square format the T-1144a base-clip pipeline already composites into the speaker
  cards. Drop-in for the same frame path (no letterboxing).
- **Key learning:** `createLipsync` must receive audio within **±15%** of the base
  clip duration (or a correct trim). `end_time` alone did NOT trim when
  `enable_dynamic_duration:true` — pick/trim audio to match the base clip length.
→ **Verdict: GO for T-1143/T-1144b** (base-clip + per-segment lip-sync pipeline),
  gated on confirming real credit cost from the dashboard and building the cost
  estimator + opt-in (T-1145) first. Compare speed-vs-precision only if precision
  cost proves too high.
