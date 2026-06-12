# Research Cinematic Planner Spec (T-1109a)

**Status:** Spec-only (docs). No runtime code, no migration.
**Owner:** Research / AlphoResearch
**Scope:** Turn the current informational Research storyboard into a premium, Director-grade cinematic plan — without breaking the existing pipeline or the Director handoff.

---

## 1. Problem & audited contracts

Today the Research script route generates scenes via LiteLLM, then `normalizeScenes()` reduces each to:

```ts
// lib/research/script.ts (current scenes_json shape)
interface StoryboardScene { title: string; prompt: string; duration_sec: number }
```

The Director handoff (`research/[id]/page.tsx → sendToDirector`) serializes each scene to:

```ts
{ index, title, prompt, durationSec }   // sessionStorage "alphogen:research-handoff" → /create/story?research_handoff=1
```

The Create/[mode] AI Director panel consumes that, and `submitJob({ directorScenes })` forwards scenes to the backend `scenes[]` clientScenes path, **validated server-side: MAX_SCENES cap, duration clamp [3,10], prompt ≤ 2000 chars.**

### ⚠️ The load-bearing fact (drives the whole design)

The only per-scene field that reaches the **video generator** is **`prompt`** (plus `duration_sec`). `title` is display; structured cinematic fields would **not** reach the video unless composed into `prompt`.

→ **The planner's #1 job is to compose a bounded, cinematic `prompt` (≤ 2000 chars).** Structured fields (camera, lighting, mood…) are additive metadata for the Research UI / future Director surfaces, but the cinematic intent must be *baked into the prompt string* to actually change the output.

DB guardrails to respect: `research_storyboards.scenes_json` is a non-empty JSON array, `CHAR_LENGTH ≤ 102400` (100 KB). Enrichment adds fields → must stay under 100 KB (cap scene count / field lengths).

---

## 2. `CinematicScenePlan` (helper output, per scene)

```ts
export interface CinematicScenePlan {
  // --- Canonical Director-facing fields (EXISTING contract, never dropped) ---
  title: string;            // short scene title
  prompt: string;           // COMPOSED cinematic prompt, ≤ 2000 chars — the field that reaches video
  duration_sec: number;     // integer, clamped [3,10]

  // --- Additive cinematic metadata (UI / storage / future Director use) ---
  visual_intent: string;        // what the viewer should see, in plain language
  camera_shot: string;          // wide | medium | close_up | over_shoulder | screen_capture | split_screen | insert | establishing
  camera_motion: string;        // static | slow_push_in | pull_back | pan | tilt | handheld | dolly
  lighting: string;             // soft_daylight | studio_key | low_key | clean_ui | high_key | golden_hour
  mood: string;                 // neutral_analytical | authoritative | curious | energetic | trustworthy | tense
  onscreen_text: string | null; // lower-third / caption (≤ 120 chars), or null
  voiceover_line: string;       // 1 commentary sentence for this scene (the spoken line)
  reference_asset_hint: string | null; // describes WHEN source/official media *could* be used; never an invented asset id
  source_citation: string | null;      // source title or domain backing this scene, or null
  risk_note: string | null;             // e.g. "No 'exact face/try-on' claim — no asset provided", or null
}
```

The stored `scenes_json` becomes an array of `CinematicScenePlan`. Because `title`/`prompt`/`duration_sec` are preserved, **the handoff and Director panel keep working with zero changes**.

---

## 3. How enrichment works — recommended 2-layer contract (see §8)

1. **LLM layer (creative):** extend `buildScriptPrompt` so the model emits, per scene, best-effort cinematic hints (`visual_intent`, `camera_shot`, `camera_motion`, `lighting`, `mood`, `onscreen_text`, `voiceover_line`). The LLM is good at this; it's where the "premium" creativity comes from.
2. **Pure helper layer (deterministic, testable):** `lib/research/cinematic-planner.ts` takes the LLM scenes + job/angle/script/sources and:
   - validates & normalizes any LLM-provided cinematic fields;
   - **fills every gap with mode-specific deterministic defaults** (so output is good even if the LLM omitted fields — this is what makes it unit-testable);
   - applies the asset policy, citations and risk notes;
   - **composes the final `prompt`** = base visual_intent + camera + motion + lighting + mood (+ optional asset hint), trimmed to ≤ 2000 chars;
   - clamps `duration_sec` to [3,10]; enforces total `scenes_json` < 100 KB (drop trailing scenes / truncate fields if needed).

The helper is **pure**: given the same inputs (including "no LLM fields") it returns the same output. No network, no provider names.

---

## 4. Helper input / output

**Input:**
```ts
planCinematicScenes({
  topic: string,
  mode: 'news' | 'tutorial' | 'product' | 'competitor',
  language: string,
  targetDurationSeconds: number | null,
  angle: { title: string; hook: string; positioning: string | null },
  script: string,
  scenes: unknown[],                 // LLM/normalized scenes (title/prompt/duration_sec [+ optional cinematic hints])
  sources: Array<{ title: string; url: string; source_type: string; extracted_markdown?: string | null }>,
}): CinematicScenePlan[]
```

**Output:** `CinematicScenePlan[]` (non-empty; preserves order; ≤ existing scene count).

---

## 5. Mode-specific rules (deterministic defaults)

| Mode | Shot grammar | Motion | Lighting | Mood | On-screen | Notes |
|---|---|---|---|---|---|---|
| **news** | establishing → medium reportage → insert of source/headline | slow_push_in / static | soft_daylight / studio_key | neutral_analytical / authoritative | lower-third with **source citation** | sober captures; cite sources; no editorializing |
| **tutorial** | screen_capture → close_up insert → medium presenter | static / slow zoom on UI | clean_ui / high_key | trustworthy / curious | **step number + label** | step-by-step; zoom on the relevant UI; clear voice-over |
| **product** | establishing product shot → close_up detail → medium "benefit" → demo insert | slow_push_in / dolly | studio_key / golden_hour | energetic / trustworthy | benefit / proof caption | product shots + benefits + proof/demo |
| **competitor** | split_screen A/B → medium neutral → insert benchmark | static / measured pan | high_key neutral | neutral_analytical | benchmark labels (A vs B) | split-screen; factual benchmark; **neutral tone** |

Scene **position** also shapes defaults: first scene → `establishing` + hook energy; last scene → CTA/summary framing.

---

## 6. Asset policy (deterministic, conservative)

- If a source has `source_type` in {youtube, product, official, media} and a usable `url`, the helper MAY set `reference_asset_hint` describing *that real source's* media as a visual reference (e.g. "reference the official product page hero shot").
- **Never invent** asset IDs, `byteplus_asset_id`, face IDs, or local file refs. `reference_asset_hint` is descriptive text only.
- **No automatic media download** (V1). Only media already extracted/known is referenced as a hint.
- **No rights promise.** If a hint references third-party media, attach a `risk_note` ("verify usage rights before publishing").
- **No "exact face / exact try-on"** language unless the job actually provided such an asset → otherwise `risk_note` forbids it.

---

## 7. Voice-over / commentary

- Each scene gets exactly one `voiceover_line` (≤ ~240 chars), derived from the script + angle, coherent across scenes (hook → development → payoff/CTA), in the job `language`.
- The `voiceover_line` is metadata (for the future TTS/Director surface). It MAY also be appended to `prompt` only as on-screen narration intent if useful — but never bloats `prompt` past the cap.

---

## 8. My recommendation on the découpage (asked)

**I validate T-1109a/b/c, with three robustness refinements:**

1. **Prompt is the real channel.** The helper MUST compose the cinematic detail into `prompt` (≤ 2000), because structured fields don't reach the video backend. Without this, the DB looks rich but the video stays generic — which is exactly today's complaint. (Added as the core of §1/§3.)
2. **2-layer, not pure-only.** A *purely* deterministic helper can structure scenes but can't be genuinely "premium/varied" — the creativity should come from the LLM (extend `buildScriptPrompt`), while the **pure helper guarantees structure + fallbacks + safety + prompt composition**. The helper stays 100% unit-testable because its behavior is deterministic for any given input (LLM fields present *or* absent). This satisfies "pure helper testable" *and* the quality goal.
3. **Backward-compat is contractual.** Keep `title`/`prompt`/`duration_sec` as canonical; everything else additive. T-1109c enriches `scenes_json` in the **script route** after `normalizeScenes`, before insert — no route signature change, no handoff change, no Director-panel change. The handoff keeps reading `prompt`/`title`/`durationSec`.

If you'd prefer a *stricter* "pure-only, no LLM prompt change" V1, I can do that too — but expect more formulaic scenes. My recommendation is the 2-layer contract above.

---

## 9. Tests expected (T-1109b)

- `mode=news` → scenes carry reportage shots + `source_citation` populated when a source backs the scene.
- `mode=tutorial` → step framing (screen_capture / numbered on-screen text).
- `mode=product` → product/demo shots + proof framing.
- `mode=competitor` → split_screen + neutral mood.
- Missing LLM cinematic fields → deterministic mode defaults applied (no empty fields).
- `prompt` always ≤ 2000 chars and contains the cinematic descriptors.
- `duration_sec` clamped [3,10]; output non-empty; order preserved.
- Serialized output < 100 KB (drops/truncates gracefully).
- **No provider/model names** anywhere in the output.
- Output still shaped `{title, prompt, duration_sec, ...}` → Director-compatible.

---

## 10. Non-goals (V1)

- ❌ No automatic media download (only already-extracted/known media referenced as hints).
- ❌ No automatic video generation, no auto-publish.
- ❌ No new route, no DB migration, no handoff/Director-panel change.
- ❌ No rights acquisition / no "exact face/try-on" promises.
- ❌ No n8n, no Anthropic-direct; LLM stays via the LiteLLM gateway.

---

## 11. Files (planned, for T-1109b/c — not this spec)

- `lib/research/cinematic-planner.ts` (pure helper) + `__tests__`.
- `lib/research/script.ts` — extend `buildScriptPrompt` to request cinematic hints (creative layer).
- `app/api/research/jobs/[id]/script/route.ts` — call the planner after `normalizeScenes`, store enriched `scenes_json`. No signature/contract change.

---

## Version history

| Date | Status | Notes |
|------|--------|-------|
| 2026-06-12 | Spec draft | T-1109a cinematic planner, audited against current handoff/Director contract |
