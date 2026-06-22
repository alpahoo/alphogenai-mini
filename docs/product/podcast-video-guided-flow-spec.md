# Podcast Video — Guided Flow Spec (T-1130e)

**Status:** Spec-only (docs). **No runtime code, no route, no migration, no backend.**
**Owner:** Guided Creation Flows (T-1130 series)
**Scope:** Define the real Podcast Video guided flow (entry + editor) inspired by the validated Jogg/Topview-style references, *without* cloning their visual identity, and **honestly enumerate the backend that does not yet exist** so the build can be sequenced (T-1131a→f). This document does **not** authorize any implementation — `/create/podcast` is intentionally NOT created.

---

## 0. Why this is docs-only (audit result, 2026-06-22)

A read-only mini-audit of `alphogenai-mini` (main) found that **none of the primitives a Podcast Video needs exist today**:

| Capability needed | Exists today? | Evidence |
|---|---|---|
| `/create/podcast` route | ❌ No | `app/(workspace)/create/` = `[mode]`, `avatar`, `url`, `product`, `composer-demo`, `editor`, `page.tsx` |
| Hub card | ⚠️ "Soon" only | `app/(workspace)/create/page.tsx` — `id: "podcast"`, `status: "soon"`, **no `href`**, rendered as a non-clickable `<div>` (`cursor-not-allowed opacity-60`) |
| Multi-speaker dialogue script generation | ❌ No | `lib/research/script.ts` generates a **single-voice narrative** script; no host/guest turns |
| Multi-speaker TTS | ❌ No | `lib/tts.ts` = one text → **one** voice (ElevenLabs/OpenAI); no per-speaker tracks/mixing |
| Per-speaker timing | ❌ No | No segment/turn timing model anywhere |
| Two-shot / split-screen / talk-show layout | ❌ No | `VALID_ENGINES` (`app/api/jobs/route.ts`) = `wan_i2v, ltx_2_3, seedance, heygen_avatar_iv, heygen_avatar_shots` + evolink/bailian/byteplus/atlas — **all single-output**; no two-person engine |
| Podcast render / compositing | ❌ No | No pipeline assembling two avatars + multi-voice audio |
| DB persistence (podcasts/speakers/segments) | ❌ No | No `podcasts` table/columns |

> The "dialogue" in `/create/avatar` is **single-voice lip-sync** over one cinematic shot — not a two-speaker conversation. It is not reusable as a podcast brick.

**Conclusion:** building anything "functional" requires new backend (script, TTS, render, DB). Per the T-1130 protocol, that needs an explicit STOP + validation. This spec is the cadre for that future work.

---

## 1. Target UX (from the validated references)

Two surfaces, mirroring the existing guided entries (`/create/url`, `/create/avatar`): a clean **entry** that hides complexity, then an **editor** for the actual composition.

### 1.1 Entry page — "Turn your ideas into podcasts"

A centered, uncluttered screen (same family as `/create/url`):

- **Title:** "Turn your ideas into podcasts" · short subtitle (1 line).
- **Primary mode choice** (two tabs / segmented control):
  1. **Generate script** — from an idea/topic.
  2. **Upload script or audio** — bring your own dialogue (text) or audio file/link.
- **Central input**, adapts to the mode:
  - Generate script → a topic/idea textarea ("What should the hosts talk about?").
  - Upload → a file/link field (script `.txt`/`.md`/`.docx`, or audio `.mp3`/`.wav`, or a URL).
- **Weekly trending / examples**: a small row of visual example chips (prefill the idea + a suggested 2-speaker setup). Static, curated — not a live feed at MVP.
- **My recent podcasts**: a compact list of the user's recent podcast projects (empty-state until persistence exists).
- **One primary action**: "Create podcast" → routes to the editor with the seed (idea or uploaded asset).

What it must NOT show on the first screen: long option panels, engine pickers, per-scene controls.

### 1.2 Editor — speakers/layout left, dialogue right

A two-pane workspace (left config, right content), same ergonomic as `/create/avatar`:

- **Left pane — cast & stage**
  - **Speakers** (2 by default, host + guest): pick an avatar per speaker (reuse the HeyGen avatar picker UX), name each speaker.
  - **Voice per speaker**: a voice picker per speaker (distinct voices), with preview.
  - **Layout**: visual thumbnails — **two-shot**, **split-screen**, **talk-show** (selectable, with a short label each).
  - **Format**: 16:9 / 9:16.
- **Right pane — dialogue**
  - A **turn-based dialogue editor**: ordered list of turns, each `{ speaker, line }`, add/reorder/delete turn.
  - When "Generate script" was chosen: the dialogue is pre-filled by the generator and remains fully editable.
  - When "Upload script" was chosen: the uploaded text is parsed into turns (best-effort) and editable.
  - Per-turn duration estimate; total runtime estimate.
- **Render**: a single explicit "Render podcast" action (paid, like the Avatar/Explainer renders) → job → job page. No auto-render.

This is a **target**; none of the wiring exists yet.

---

## 2. Data model (proposed, NOT applied)

Illustrative only — final shape is T-1131b's job. Shown so the UX above is grounded.

```ts
// PROPOSED — not created. RLS per user like research_jobs.
interface Podcast {
  id: string;
  user_id: string;
  title: string;
  status: "draft" | "scripting" | "rendering" | "done" | "failed";
  layout: "two_shot" | "split_screen" | "talk_show";
  aspect_ratio: "16:9" | "9:16";
  source: { mode: "generate" | "upload"; topic?: string; asset_url?: string };
  created_at: string;
}

interface PodcastSpeaker {
  id: string;
  podcast_id: string;
  name: string;          // "Host", "Guest", or custom
  avatar_id: string;     // HeyGen avatar id
  voice_id: string;      // TTS/HeyGen voice id (distinct per speaker)
  position: 0 | 1;       // left/right (or more, future)
}

interface PodcastSegment {
  id: string;
  podcast_id: string;
  speaker_id: string;
  order_index: number;
  text: string;
  // populated by render: per-segment audio + timing
  audio_url?: string;
  start_ms?: number;
  end_ms?: number;
}
```

---

## 3. Backend gaps (what must be built — explicit)

In dependency order. Each is a **new** capability (new code/pipeline/DB), out of scope without STOP + validation.

1. **Multi-speaker dialogue script generation** — generate `{ speaker, line }[]` with natural turn-taking from a topic, bounded length, language-aware. Distinct from `lib/research/script.ts` (mono-voice narrative).
2. **Multi-speaker TTS** — synthesize each segment with the speaker's assigned voice; produce **per-segment audio** (≥2 distinct voices). `lib/tts.ts` today is one text → one voice; needs a per-speaker, per-segment driver.
3. **Per-speaker timing** — concatenate/sequence segments with accurate start/end timing, gaps/overlaps policy, total-duration computation (drives the editor estimate and the render timeline).
4. **Layout (two-shot / split-screen / talk-show)** — a rendering capability that places two avatars in one frame per the chosen layout. No current engine does two-person framing; this is a **new compositing layout**, not a `VALID_ENGINES` entry.
5. **Render / compositing podcast** — orchestrate: per-speaker avatar clips (lip-synced to their segments) + layout composition + multi-voice audio mux → single MP4. New pipeline (likely Modal + ffmpeg compositing), with cost model.
6. **Persistence (DB)** — `podcasts` / `podcast_speakers` / `podcast_segments` (§2) with per-user RLS, plus the API routes the entry/editor call.

Until 1–6 exist, a `/create/podcast` page could only fake it (or degrade to a single avatar), which the T-1130 rules forbid.

---

## 4. Proposed future breakdown (T-1131 series)

Sequenced so each slice is independently shippable and reviewable. **Spec-only here — none of these are started.**

| ID | Title | Deliverable | Depends on |
|---|---|---|---|
| **T-1131a** | Spec backend | Technical spec: contracts for script/TTS/timing/layout/render, cost model, engine decision (HeyGen multi vs compositing). Docs-only. | this doc |
| **T-1131b** | Schema | `podcasts` / `podcast_speakers` / `podcast_segments` migration + RLS + types. | T-1131a |
| **T-1131c** | Dialogue script | Multi-speaker dialogue generator (`{speaker,line}[]`), bounded, tested. | T-1131a/b |
| **T-1131d** | Multi-speaker TTS | Per-speaker, per-segment synthesis + timing; ≥2 distinct voices. | T-1131c |
| **T-1131e** | Render / compositing | Two-avatar layout composition + audio mux → MP4; job + cost. | T-1131b/d |
| **T-1131f** | UI | Entry ("Turn your ideas into podcasts") + editor, wired to T-1131b–e. Flip the hub card from "Soon" to "live" only when this lands. | T-1131b–e |

Guardrail: the hub "Podcast Video" card stays **"Soon" (non-clickable, no `href`)** until **T-1131f** is live and verified. No interim placeholder route.

---

## 5. Non-goals / constraints

- **Do not** create `/create/podcast` (or any podcast route) in this ticket.
- **Do not** touch the validated flows: Story (`/create/story`), URL (`/create/url`), Avatar (`/create/avatar`), Product/UGC (`/create/product`).
- **Do not** rework `/research`.
- **No** new backend/API/DB/migration without an explicit STOP + validation (that's T-1131a+).
- **No misleading cosmetics**: the card must keep honestly signaling "Soon" until the real flow ships.

---

## 6. Optional hub microcopy (docs note only — not implemented here)

The current card description ("Two speakers, podcast layout, per-speaker dialogue, separate voices.") already describes the *target* and the "Soon" badge is honest. If a future cosmetic-only tweak is wanted, the only safe change is wording clarity (e.g. "Coming soon") on the **still non-clickable** card — it must not gain an `href` or imply it works. Tracked here so it isn't done ad hoc.
