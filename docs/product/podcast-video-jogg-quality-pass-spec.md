# Podcast Video Jogg-like Quality Pass (T-1134)

**Status:** Spec / product contract. **No runtime code in this ticket.**
**Date:** 2026-06-23
**Scope:** Move Podcast Video from a functional V1 backend demo to a guided, polished creator flow inspired by Jogg-style products, without cloning their brand or visual identity.

---

## 1. Product Truth

The current Podcast Video V1 proves the backend path:

- create a topic,
- generate a two-speaker dialogue,
- generate per-speaker TTS,
- edit/reorder/add/delete lines,
- render a two-shot MP4.

That is valuable, but it is **not yet the product experience Paul wants**. The target is not a raw technical editor. The target is a simple guided Podcast Video maker where the user feels:

1. I choose a podcast format visually.
2. I provide an idea, URL, script, or audio.
3. I choose/test voices before spending generation time.
4. I review a clean host/guest script.
5. I render a visually credible podcast video.

The benchmark is the **workflow clarity** of Jogg-like tools: visual choices, simple steps, previews, little explanatory text, few visible options. We do not copy their design; we adopt the same user journey discipline.

---

## 2. Current Gap

### What works today

- `/create/podcast` exists and is live.
- The hub card is live.
- Script generation works.
- Voice generation works.
- Voice Lab exists with preview and distinct voices.
- Volume normalization has been confirmed by render QA.
- Segment edit/add/delete/reorder works and has passed prod QA.
- Render produces a valid two-shot MP4.

### What feels too basic

- The rendered video still looks like an engineering proof: initials in boxes, flat stage, minimal visual identity.
- The dialogue can be too generic or too short on substance.
- Some voice combinations still feel robotic or uneven in character, even if loudness is normalized.
- The entry/editor exposes implementation concepts too early instead of guiding the user through a polished journey.
- There is no real visual choice of podcast style yet.
- Upload script/audio is still not functional.
- Voice testing exists, but the UX does not yet feel like a first-class voice marketplace.

---

## 3. Target User Journey

### Step 1 — Choose Podcast Format

First meaningful choice should be visual, not technical.

Options V1.1:

- **Talk Show** — warm studio, two speakers side-by-side.
- **Two-shot** — clean two-host frame, business/explainer style.
- **Split Screen** — remote interview / debate style.

Each card should show:

- a thumbnail/mock preview,
- a one-line description,
- a duration/use-case hint,
- disabled/soon state if the render mode is not ready.

For V1.1, only `two_shot` may render, but `talk_show` and `split_screen` can be visible if clearly marked **Soon** or **Preview style only**. No fake working option.

### Step 2 — Provide Source

A single centered input, like the Jogg references:

- Topic / idea textarea.
- Optional URL field.
- Duration selector.
- Language selector.
- Style selector.

Future tabs:

- **Generate Script** — current path.
- **Upload Script/Audio** — V1.1/V1.2, must not be fake.

### Step 3 — Choose Voices Before Generation

Voice selection should happen before full TTS, with real preview:

- Host voice card.
- Guest voice card.
- Play preview button.
- Provider shown as a small public tag, not internal infra.
- Prevent same voice for both speakers.
- Later: provider filter (ElevenLabs / OpenAI / Google / Kokoro / other).

Goal: user can compare voices before generating all segments.

### Step 4 — Review Dialogue

Dialogue editor should feel like a script review page, not a database table.

Needed refinements:

- Better host/guest names.
- Clear speaker chips.
- Inline edit remains.
- Add/delete/reorder remains.
- Per-line regenerate remains.
- Better script generation prompt for richer, less generic conversation.

### Step 5 — Render / Final Video

Render should produce a more credible podcast frame:

- visual stage/background,
- host/guest portraits or selected avatar thumbnails,
- proper lower-thirds,
- captions with better typography,
- progress steps while rendering,
- final video card with download.

The render should not feel like two initials in boxes unless no avatar data is available.

---

## 4. T-1134 Build Plan

### T-1134a — Quality Contract (this doc)

Docs-only alignment. Defines the target: Jogg-like workflow clarity and higher-quality podcast video output.

### T-1134b — Dialogue Quality Pass

Improve script quality without touching render:

- better prompt for natural host/guest conversation,
- duration-aware structure,
- fewer generic lines,
- stronger openings/endings,
- style-specific guidance (`explainer`, `debate`, `educational`, `news`, `casual`),
- tests for prompt contract and validation.

Acceptance:

- generated script feels like a real podcast segment,
- no provider/internal leakage,
- no fake facts when source is absent,
- host/guest both have distinct roles.

### T-1134c — Voice Lab UX Upgrade

Make voice choice feel like a real product surface:

- voice cards or modal grid,
- search/filter by tone/gender/provider/language,
- preview button prominent,
- selected host/guest voices clearly shown,
- optional default recommendations by style.

No new provider required in this slice.

### T-1134d — Render Visual Upgrade V1.1

Improve the final MP4 while keeping the same backend path:

- replace initials-only boxes with richer speaker cards,
- add podcast stage backgrounds,
- improve lower-thirds/captions typography,
- make active speaker state more cinematic,
- keep CPU/ffmpeg compositing for now.

Acceptance:

- MP4 looks like a basic real podcast layout, not a backend proof.
- Captions readable.
- Speaker identity clear.
- No regression in audio timing/loudness.

### T-1134e — Upload Script/Audio Spec or MVP

Define and/or implement one honest upload path:

- upload/paste script first,
- audio upload later if timing/parsing is clear,
- no fake button.

### T-1134f — Optional Provider Lab

Only after the UX is clean:

- evaluate Google Gemini TTS/API if available for production use,
- evaluate Kokoro/Kokoro-like local or hosted voices,
- keep ElevenLabs/OpenAI as baseline,
- expose provider choice only if previews prove quality difference.

---

## 5. Non-goals

- Do not clone Jogg visuals or brand.
- Do not fake upload audio/script.
- Do not promise lip-sync in Podcast V1.1.
- Do not add Google AI Pro consumer subscription hacks; production integrations must use official APIs.
- Do not rebuild the already working podcast backend unless a quality requirement needs it.
- Do not break Story/Cinematic, Avatar, Product/UGC, URL-to-Video, or Research.

---

## 6. Product Priority

Recommended order:

1. **T-1134b Dialogue Quality Pass** — fastest quality gain.
2. **T-1134c Voice Lab UX Upgrade** — user can test and choose better voices.
3. **T-1134d Render Visual Upgrade** — makes the final result visibly closer to the target.
4. **T-1134e Upload Script/Audio** — important, but only after the core path feels good.
5. **T-1134f Provider Lab** — compare new TTS providers after the product surface supports testing properly.

This keeps the roadmap aligned with the real goal: **a simple, guided Podcast Video maker like the best SaaS flows, not an engineering dashboard.**
