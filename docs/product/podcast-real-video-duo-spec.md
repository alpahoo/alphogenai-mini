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

## 3. Data model (future — needs a migration, NOT in this ticket)
Reuse `metadata jsonb` where possible; add explicit columns only if needed.
- `podcast_personas`: add `base_clip_path` (a short idle/talking base video for the
  face) and/or `heygen_avatar_id` (for photo-avatar reuse). Likely `metadata jsonb`
  on personas, OR dedicated columns.
- `podcast_speakers.avatar_id` already exists → can hold the resolved avatar/look id.
- A per-podcast toggle `metadata.render_mode = 'static' | 'talking'` (default static;
  talking is opt-in — cost).
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

## 10. Decision requested
1. Approve **approach A+D** (per-segment lip-sync, active speaker, our TTS, fallback
   static) as the target?
2. Approve the phased plan (T-1143→T-1146) starting with the base-clip pipeline?
3. Confirm talking mode is **opt-in + plan-gated + cost-disclosed** from day one?
4. Before T-1144, run a **1-clip cost/quality spike** against the live HeyGen plan
   (real credit cost + lip-sync quality on our TTS) — recommended gate.
