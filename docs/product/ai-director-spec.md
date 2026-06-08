# AI Director — pre-generation flow (SPEC, T-201a)

> **Status: spec-only.** No code, no API, no DB migration is implemented from this
> document until validated. It proposes UX, data shapes, and an implementation
> split. Source-of-truth doc: [`HANDOVER.md`](../../HANDOVER.md). Coordination:
> [`AGENTS.md`](../../AGENTS.md). Owner: Claude (impl) after ChatGPT/CTO sign-off.
> Date: 2026-06-08.

## 0. Goal & guardrails

Turn the create flow into an **AI director** moment: before spending a generation,
the user sees a **readable, editable plan** and a **confidence read-out**, so it
feels like directing a video, not configuring an API.

Hard constraints (this phase):
- **Do NOT modify the jobs/scenes state machine** (`app/api/jobs/*`, Modal pipeline,
  webhooks). The Director is a layer *before* `POST /api/jobs`.
- **Reuse existing bricks**: `lib/storyboard.ts` (scene splitting), `lib/prompt-enhancer.ts`
  (prompt enrichment), `lib/content-policy.ts` (screening), `lib/byteplus-cost.ts`
  (token/cost estimate), `lib/engine-intentions.ts` (model intentions + compat).
- **Provider confidentiality**: UI shows models/capabilities (Seedance 2.0, Wan,
  Avatar, "Realistic character"…), never providers/aggregators. The provider-leak
  guard test (`lib/__tests__/provider-leak-guard.test.ts`) still governs all labels.
- **No DB migration** in the spec phase. Persisting an edited plan (if needed later)
  is called out as an open question, not decided here.

## 1. UX flow

```
┌──────────────────────────── Story Video ────────────────────────────┐
│ [ Prompt composer (TipTap) ]        [ Assets panel: Faces/Uploads ]  │
│  • free text + @face / @image chips                                  │
│                                                                       │
│  Controls row: Model · Duration · Format · Scenes · Advanced          │
│                                                                       │
│   ┌──────────────┐   ┌───────────────────┐                            │
│   │ Plan with AI │   │ Generate now (skip)│                           │
│   │  Director ▸  │   └───────────────────┘                            │
│   └──────────────┘                                                    │
└───────────────────────────────────────────────────────────────────────┘
        │ click "Plan with AI Director" (or auto when scenes > 1)
        ▼
┌──────────────────── AI Director — review your plan ──────────────────┐
│ Quality read-out:  Character ●High · Prompt ●Good · Model ●OK ·        │
│                    Social ●9:16 OK · ~$0.18 · ~2–4 min                 │
│                                                                       │
│  Scene board (editable):                                              │
│   [Scene 1] establishing · slow dolly-in · @Paul · cinematic · 5s      │
│   [Scene 2] reaction shot · handheld · @Paul · cinematic · 5s          │
│   …                                                                    │
│                                                                       │
│  Direction actions:                                                    │
│   [Generate now] [Improve direction] [More cinematic] [More realistic] │
│   [Shorter for TikTok] [Keep same character]                           │
└───────────────────────────────────────────────────────────────────────┘
        │ "Generate now"
        ▼
   existing POST /api/jobs  (unchanged contract — see §4)
```

Flow notes:
- **Entry**: a `Plan with AI Director` button next to `Generate`. The plan can also
  be generated **automatically** when the user picks `Scenes > 1` (configurable).
- **Editable before generation**: the storyboard is shown as cards the user can edit
  (prompt text, duration) and reorder; chips reflect the assets used.
- **Skip path preserved**: `Generate now` from the composer still works exactly as
  today (no Director step) — the Director is additive, never mandatory.
- **Direction actions** rewrite the plan (not the final video): they call the
  enhancer/storyboard with a modifier and re-render the cards (see §4).

## 2. Per-scene data (display + edit)

Proposed view-model (display-only; not a DB schema):

```ts
interface DirectorScene {
  index: number;
  title: string;            // "Establishing shot", "Reaction" (from storyboard)
  role?: string;            // narrative role / beat
  prompt: string;           // EDITABLE
  camera?: string;          // "slow dolly-in", "handheld" (suggested)
  motion?: string;          // optional motion hint
  assets: Array<{ kind: "face" | "image" | "style"; label: string; thumb?: string | null }>;
  style?: string;           // "cinematic product launch"
  durationSec: number;      // EDITABLE (bounded by plan)
  recommendedModel: { intent: string; modelName: string }; // via engine-intentions (no provider)
  notes?: string[];         // risk/compat notes, e.g. "face consistency: medium"
}
```

Editable fields in v1: `prompt`, `durationSec`. Everything else is suggested and
read-only until a later phase (keep scope tight).

## 3. Quality score (pre-generation read-out)

A small, friendly diagnostic — not a technical panel. Each item is a tone
(`good` / `medium` / `risky`) + one line. Derived from existing helpers:

| Item | Source (reuse) | Example |
|---|---|---|
| Character consistency | presence of a verified `@face` + scene count + chaining | High / Medium / Risky |
| Prompt clarity | `lib/content-policy.ts` findings + length/structure heuristics | Good |
| Model compatibility | `lib/engine-intentions.ts` (faceCompat/uploadCompat vs selected model) | OK / "use a verified face" |
| Social fit | aspect ratio vs target (9:16 → TikTok/Reels) | TikTok 9:16 OK |
| Estimated cost | `lib/byteplus-cost.ts` (token estimate) — shown as a model-cost range | ~$0.18 |
| Expected duration | scene count × per-scene render heuristic | ~2–4 min |

Confidentiality: the cost line shows a **model/product** framing (no provider, no
aggregator). Admin-only deep cost stays where it is today (gated).

## 4. Proposed API / design (NOT implemented before validation)

No new persisted state. The Director is a **stateless planning endpoint** that wraps
existing pure helpers:

```
POST /api/director/plan   (proposed)
  body: { prompt, references[], durationSec, numScenes, modelKey, aspectRatio,
          modifier?: "cinematic" | "realistic" | "tiktok" | "keep-character" | "improve" }
  → { scenes: DirectorScene[], quality: QualityReadout }
  (pure: storyboard + enhancer + content-policy + cost; no DB write, no provider call)
```

- `Generate now` then calls the **existing** `POST /api/jobs` with the (possibly
  edited) prompt + references + controls — **unchanged contract**. The edited
  storyboard maps to the current job inputs (prompt text + scene count + references);
  no change to the jobs/scenes schema.
- Direction actions = re-call `/api/director/plan` with a `modifier`. Pure recompute.

Open questions (defer, do not decide here):
- Persisting an edited plan across reloads (would need a table → migration → R-003 process).
- Per-scene distinct prompts vs one enriched prompt (current pipeline uses storyboard
  splitting; respect that).

## 5. Implementation split (each = its own task + review)

| Task | Scope | Risk |
|---|---|---|
| **T-201a** | This spec (docs-only). | none |
| **T-201b** | Director UI with **static/mock state** (cards + quality read-out, no backend). Validates UX. | low (UI-only) |
| **T-201c** | Connect storyboard generation: wire `/api/director/plan` to `storyboard.ts` + `prompt-enhancer.ts` + `content-policy.ts`. Read-only plan. | medium (new route, pure) |
| **T-202** | Quality/cost score wired to `byteplus-cost.ts` + `engine-intentions.ts`. | low |
| **T-301** | Scene board **runtime** integration (live status per scene) — only here do we touch scene rendering UI; still NOT the state machine. | medium |

Validation gate for every step: `npm test` · `npx tsc --noEmit -p tsconfig.json` ·
`npm run lint` · `npm run build`, plus the provider-leak guard test must stay green.

## 6. Non-goals (this phase)

- No change to jobs/scenes state machine, Modal pipeline, webhooks, Stripe, auth, DB.
- No new provider integration.
- No persistence of plans.
- No auto-generation of final video from the Director without the explicit
  `Generate now` action.
