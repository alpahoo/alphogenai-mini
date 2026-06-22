# Podcast Video — Backend Spec (T-1131a)

**Status:** Spec-only (docs). **No runtime code, no migration, no UI change.**
**Owner:** Guided Creation Flows / Podcast (T-1131 series)
**Scope:** Define the real backend for Podcast Video — dialogue script, multi-speaker TTS, per-segment timing, layout/compositing, persistence, API, failure model, cost model — so implementation (T-1131b→f) is grounded. This document authorizes **no** code. `/create/podcast` is intentionally NOT created here. Story / URL / Avatar / Product / Research flows are untouched.

> Companion: [`podcast-video-guided-flow-spec.md`](./podcast-video-guided-flow-spec.md) (T-1130e) defines the **UX**. This doc defines the **backend** behind it.

---

## 1. Audit of the existing system (what we can/can't reuse)

| Brick | State | Reusable for podcast? |
|---|---|---|
| `lib/tts.ts` | Mono-text → mono-voice (ElevenLabs/OpenAI), `generateVoiceover(text, {voice})` | ✅ as the **per-segment** synth primitive, called N times with different `voice` — but it has **no** multi-speaker/timeline concept |
| `lib/research/script.ts` | Single-voice **narrative** script generator (LiteLLM) | ⚠️ pattern reusable, but it emits narration, not `{speaker,line}[]` turns → needs a new dialogue generator |
| `create/avatar` + `lib/heygen-client.ts` | HeyGen Avatar IV (talking head) + Avatar Shots + **lip-sync** per single speaker | ✅ per-speaker clip generation; ❌ no two-person framing |
| `lib/lipsync-cost.ts` | TTS + lip-sync cost heuristic (speed/precision) | ✅ basis for the podcast cost model |
| jobs pipeline (`app/api/jobs/route.ts`, `VALID_ENGINES`) | Single-output video jobs (wan/ltx/seedance/heygen/evolink/…) | ⚠️ job/status/credits machinery reusable; **no** podcast/two-person engine |
| `app/api/jobs/[id]/voiceover/route.ts` + `research-voiceover-mux-spec.md` | **Audio muxed into a rendered video** (ffmpeg) already exists | ✅ strong precedent for the final **audio mux** step |
| `lib/modal-client.ts`, `modal_app/video_pipeline.py` | Modal GPU/CPU pipeline + webhooks | ✅ likely host for the **compositing** worker (ffmpeg) |
| post-production: `post-production-overlay-spec.md` (overlays/captions/branding/exports on the Job page) | Exists, applied **after** a video is done | ✅ captions / logo / watermark can be **deferred** to existing post-prod, not re-built |
| DB | **No** `podcasts` / `podcast_speakers` / `podcast_segments` tables | ❌ must be created (T-1131b) |

**Net:** the *atoms* exist (per-segment TTS, per-speaker lip-sync, audio mux, Modal, cost machinery, post-prod). What's missing is the **dialogue generator**, the **timeline/orchestration**, the **two-person compositing**, and the **persistence + API** that tie them together.

---

## 2. Recommended V1 architecture (target pipeline)

```
Entry (topic | uploaded script | URL)
        │
        ▼
[1] Dialogue generator ───────────►  segments[] = {speaker, line, order}
        │                              (host/guest turns, bounded length)
        ▼
[2] Speaker assignment ───────────►  speaker → {avatar_id, voice_id, position}
        │
        ▼
[3] Per-segment TTS  (lib/tts.ts ×N) ─►  segment.audio_url + duration (probe)
        │
        ▼
[4] Timeline build ───────────────►  ordered segments with start/end ms
        │
        ▼
[5] Per-speaker visual generation ─►  HeyGen lip-sync clip per segment (V1: see §3)
        │                              OR static framed avatar (cheaper fallback)
        ▼
[6] Compositing (Modal + ffmpeg) ─►  layout (two-shot/split/talk-show) per timeline
        │
        ▼
[7] Audio mux (reuse voiceover mux) ─► full dialogue track over the composed video
        │
        ▼
[8] Upload final MP4 (R2) ────────►  podcast_render.output_url
        │
        ▼
[9] Job page  (existing) ──────────►  post-prod (captions/logo) reuse, Library
```

Each numbered stage maps to a T-1131 slice (§10). Stages [3], [7], [9] reuse existing bricks; [1], [4], [6] are new; [5] reuses HeyGen but needs per-segment orchestration.

---

## 3. Engine / strategy options (V1 decision)

**Option A — HeyGen lip-sync per speaker + ffmpeg compositing.**
Generate a lip-synced clip per speaker (reusing the avatar/lip-sync we already ship), then composite two speakers into the chosen layout and mux the dialogue.
- ✅ Real lip-sync, highest perceived quality; reuses proven HeyGen + voiceover-mux bricks.
- ❌ Most expensive (lip-sync per segment × 2 speakers), longest render, most orchestration.

**Option B — Voice-first podcast (no exact lip-sync).**
Generate the full multi-speaker **audio** (the real differentiator), and present speakers as **framed avatar cards / static or lightly-animated portraits** (talk-show style lower-thirds) over the layout — no per-word lip-sync.
- ✅ Much cheaper & faster; the dialogue audio is the product; layout still reads as a podcast.
- ✅ Reuses TTS + compositing + mux only (no per-segment lip-sync cost).
- ❌ Not lip-synced (acceptable for a "podcast clip", less so for a "talking video").

**Option C — Open-source / Modal native two-person model.**
A future model that natively renders two speakers.
- ❌ Not V1: no proven model, high R&D + GPU cost/risk.

### Recommendation — **V1 = Option B, with Option A as a premium toggle in V1.1**
Ship the **voice-first podcast** first: it delivers the genuinely new capability (multi-speaker dialogue + audio) at low cost/risk, reusing TTS + compositing + mux + existing post-prod. Lip-sync (Option A) is a **quality upgrade** layered on the *same* timeline/compositing contract once B is proven — so building B does not throw away work. Option C stays out of scope.

Rationale: cheapest path to a real, non-fake podcast; smallest new surface; the timeline/compositing contract is identical for B and A, so A is an additive `render_mode` later.

---

## 4. Proposed data model (NOT applied)

Per-user RLS mirroring `research_jobs`. Illustrative — final shapes are T-1131b's call.

```sql
-- podcasts: one row per podcast project
create table podcasts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  title text not null default 'Untitled podcast',
  status text not null default 'draft',        -- draft|scripting|tts|rendering|done|failed
  source_mode text not null,                   -- generate|upload
  source_topic text,                           -- when generate
  source_asset_url text,                       -- when upload (script/audio)
  layout text not null default 'two_shot',     -- two_shot|split_screen|talk_show
  aspect_ratio text not null default '16:9',   -- 16:9|9:16
  language text not null default 'en-US',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- speakers: 2 per podcast in V1 (host/guest)
create table podcast_speakers (
  id uuid primary key default gen_random_uuid(),
  podcast_id uuid not null references podcasts(id) on delete cascade,
  name text not null,                          -- "Host" | "Guest" | custom
  position smallint not null,                  -- 0 = left, 1 = right
  avatar_id text,                              -- HeyGen avatar (nullable for voice-only card)
  voice_id text not null                       -- TTS/HeyGen voice (distinct per speaker)
);

-- segments: ordered dialogue turns
create table podcast_segments (
  id uuid primary key default gen_random_uuid(),
  podcast_id uuid not null references podcasts(id) on delete cascade,
  speaker_id uuid not null references podcast_speakers(id) on delete cascade,
  order_index int not null,
  text text not null,
  audio_url text,                              -- filled by TTS
  start_ms int,                                -- filled by timeline build
  end_ms int,
  status text not null default 'pending'       -- pending|tts_done|failed
);

-- renders: each render attempt (or fold into jobs)
create table podcast_renders (
  id uuid primary key default gen_random_uuid(),
  podcast_id uuid not null references podcasts(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  render_mode text not null default 'voice_first', -- voice_first|lipsync
  status text not null default 'queued',       -- queued|rendering|done|failed
  output_url text,
  cost_credits int,
  error text,
  created_at timestamptz not null default now()
);
```

RLS: every table gated by `user_id = auth.uid()` (directly, or via `podcast_id`'s owner). **`podcast_renders` is the only row that ever spends credits.**

> Alternative: instead of `podcast_renders`, reuse the existing `jobs` table with a `kind='podcast'` discriminator + `metadata.podcast_id`. Decide in T-1131b; the spec keeps it separate for clarity.

---

## 5. Proposed API contract (future routes — not implemented)

All routes: `Authorization: Bearer <supabase access_token>`, ownership enforced (`podcast.user_id === user.id`), JSON errors `{ error }`. Mirrors `app/api/research/jobs` conventions.

| Route | Input | Output | Notes |
|---|---|---|---|
| `POST /api/podcasts` | `{ title?, source_mode, source_topic?, source_asset_url?, layout?, aspect_ratio?, language? }` | `201 { id, ...podcast }` | creates `draft`; validates source_mode ∈ {generate,upload}; no spend |
| `GET /api/podcasts` | — | `200 { podcasts: [...] }` | user's podcasts, newest first |
| `GET /api/podcasts/[id]` | — | `200 { podcast, speakers, segments, renders }` | 404 if not owner |
| `PATCH /api/podcasts/[id]` | `{ title?, layout?, aspect_ratio?, speakers?, segments? }` | `200 { ...podcast }` | edit cast/dialogue; server validates ≤2 speakers, segment caps |
| `POST /api/podcasts/[id]/script` | `{ topic?, regenerate? }` | `200 { segments }` | dialogue generator → writes `podcast_segments`; LLM cost only |
| `POST /api/podcasts/[id]/tts` | `{ preview?: segment_id }` | `200 { segments:[{id,audio_url,duration_ms}] }` | per-segment TTS; `preview` synth one segment only (cheap) |
| `POST /api/podcasts/[id]/render` | `{ render_mode?, confirm: true }` | `202 { render_id, status:'queued', cost_credits }` | **only spend point**; `confirm` required; returns estimated cost; async via Modal webhook → updates `podcast_renders` |

Validation guards (server-side, never trust client): speaker count = 2 (V1), segment count cap (e.g. ≤ 60), per-line length cap, layout/aspect enums, language regex (reuse research route's pattern), URL scheme check for `source_asset_url`.

---

## 6. Multi-speaker TTS

- **Voice per speaker:** each `podcast_speaker.voice_id` resolves to a TTS voice; the two speakers MUST be distinct (validate). Reuse `lib/tts.ts` provider selection (ElevenLabs → OpenAI fallback).
- **Per-segment synthesis:** call `generateVoiceover(segment.text, { voice: speaker.voice_id })` for each segment → upload to R2 → store `audio_url` + measured `duration_ms` (probe with ffprobe in the worker; never trust a client estimate).
- **Short preview:** `POST .../tts { preview: segment_id }` synthesizes a single segment so the user can audition a voice before paying for the full render.
- **Fallback if a voice fails:** retry once; on persistent failure, fall back to the provider's default voice for that speaker and **flag** the segment (`status='failed'`→surfaced) rather than aborting the whole podcast. Never silently swap a voice without surfacing it.
- **Concat / mix:** segments are **sequential** in V1 (no overlapping crosstalk). The timeline (§ stage 4) concatenates with a small inter-turn gap (e.g. 250–400 ms); the worker builds one continuous dialogue track for the mux.
- **Provider abstraction:** `lib/tts.ts` already abstracts ElevenLabs/OpenAI; a thin per-speaker wrapper is enough for V1. A full pluggable provider registry is **optional, not required** for V1.
- **Cost:** see §9.

---

## 7. Render / compositing

- **Layouts (V1):**
  - **two-shot** — both speakers in one frame side by side (or one framed, the other inset).
  - **split-screen** — hard 50/50 split, each speaker their half.
  - **talk-show** — a "set" background with framed speaker cards / lower-thirds (name tags); most forgiving for the voice-first (Option B) mode.
- **Format:** 16:9 and 9:16 (crop/letterbox rules per layout). No other ratios V1.
- **Active-speaker cue:** the composer highlights the speaker whose segment is playing (per the timeline) — a border/scale cue; cheap and reads as "podcast".
- **Captions (optional):** since per-segment text + timing exist, captions are essentially free to burn in — but defer to the **existing post-production** captions on the Job page rather than re-implementing. V1 ships without burned captions; post-prod covers it.
- **Logo / watermark:** reuse existing post-production overlay/branding (`post-production-overlay-spec.md`) on the Job page; not re-built in the podcast worker.
- **Tech:** a **Modal** worker (CPU is enough for ffmpeg compositing in Option B; GPU only if Option A lip-sync clips are generated) runs ffmpeg to (a) lay out the speaker visuals on the timeline and (b) mux the dialogue track — reusing the proven **voiceover-mux** approach (`app/api/jobs/[id]/voiceover/route.ts`).
- **V1 limits:** 2 speakers; sequential turns (no overlap); max total duration cap (e.g. 5 min) to bound cost/time; a fixed small set of background/templates per layout.

---

## 8. Failure model

| Stage | Failure | Behavior |
|---|---|---|
| Script | LLM error / empty | `status='failed'`, surface "Couldn't write the dialogue — retry"; **no spend** beyond LLM call |
| TTS | One/some segments fail | retry once → fallback default voice + flag segment; if >X% fail, stop before render and tell the user; partial audio never silently shipped |
| Avatar/lip-sync (Option A) | A speaker clip fails | retry once; on persistent failure, **degrade that speaker to the voice-first framed card** for this render (don't abort the whole podcast); flag it |
| Compositing | ffmpeg/Modal error | mark `podcast_render.status='failed'` + `error`; **credits not finalized** for a failed render (charge on success, or refund on failure) |
| Mux | audio/video mismatch | worker validates durations; on mismatch, fail the render with a clear error rather than ship a desynced file |

**Hard rule:** never render or debit credits without explicit user confirmation (`render.confirm=true`), and the estimated cost is shown **before** that click. Script/TTS-preview steps are cheap and non-committal; only `/render` spends meaningful credits.

---

## 9. Cost model (V1, estimates)

Grounded in `lib/lipsync-cost.ts` + the avatar page's existing estimates. Credits are display units; tune to real provider billing in T-1131b/d/e.

| Item | Basis | Rough V1 estimate |
|---|---|---|
| Dialogue script | 1 LLM call | ~negligible (folded into base) |
| TTS per segment | ~0.01 credits / 100 chars (per `lipsync-cost.ts`) | a 3-min podcast ≈ ~4500 chars ≈ ~5 credits total |
| **Voice-first (Option B)** compositing | ffmpeg on Modal CPU, ~minutes | low, ~flat per render (e.g. a few credits) |
| **Lip-sync (Option A, V1.1)** per speaker | speed ~2 cr/s, precision ~5 cr/s (per `lipsync-cost.ts`) × 2 speakers | dominant cost; only when user opts into lip-sync mode |
| Final mux + upload | reuse voiceover mux | negligible |

**Displayed before render:** `render.cost_credits` = TTS + compositing (+ lip-sync if mode=lipsync), shown in the confirm step. Option B keeps a 3-min podcast in the **single-digit-to-low-tens** credits range; Option A multiplies it by the lip-sync seconds.

---

## 10. Roadmap (T-1131 series)

| ID | Title | Deliverable | Depends on |
|---|---|---|---|
| **T-1131a** | Backend spec | *this document* | T-1130e |
| **T-1131b** | Schema | `podcasts`/`podcast_speakers`/`podcast_segments`/`podcast_renders` migration + RLS + types (or `jobs.kind='podcast'` decision) | a |
| **T-1131c** | Dialogue script generator | `{speaker,line}[]` generator (bounded, tested) + `POST /script` | b |
| **T-1131d** | Multi-speaker TTS | per-segment synth + timeline + preview + fallback + `POST /tts` | c |
| **T-1131e** | Render/compositing prototype | Modal+ffmpeg voice-first compositing (two_shot first) + mux + `POST /render` | b, d |
| **T-1131f** | UI `/create/podcast` | entry + editor wired to b–e; flip hub card "Soon"→live only when e2e works | b–e |

Each slice: own STOP-and-validate (b/d/e touch backend + cost), build→tsc, prod QA where a real route exists, dedicated commit, agent docs.

---

## 11. Non-goals (V1)

- No **live** / real-time podcast.
- No **3+ speakers** (exactly 2 host/guest in V1).
- No **auto-publication** to social/anywhere.
- No **UI route before the backend works** (hub card stays "Soon" until T-1131f is verified).
- **Voice cloning not required** — stock voices are enough; cloning is optional reuse of the existing avatar clone flow.
- No **fake lip-sync** — Option B is honestly presented as framed speakers + dialogue audio, not as lip-synced talking heads.
- No **overlapping crosstalk** / interruption modeling in V1 (sequential turns only).
