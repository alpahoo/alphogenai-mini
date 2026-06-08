# Scene Board (runtime) — spec (T-301)

> **Status: spec-only.** No code, no new endpoint, no DB migration is implemented
> from this document until validated. Source of truth: [`HANDOVER.md`](../../HANDOVER.md).
> Coordination: [`AGENTS.md`](../../AGENTS.md). Owner: Claude (impl) after sign-off.
> Date: 2026-06-08.

## 0. Goal & guardrails

On `/jobs/[id]`, surface a **Scene Board**: a horizontal strip of scene cards that
makes a multi-scene job legible — per-scene status, prompt, duration, a
provider-clean model name, a thumbnail/preview when available, and a retry action
for failed scenes.

Hard constraints (V1):
- **No change to the jobs/scenes state machine**, Modal pipeline, webhooks, Stripe,
  auth. The board reads existing data and calls existing endpoints.
- **No DB migration** (don't add columns without validation).
- **Provider confidentiality**: model names via `getEngineDisplayName` +
  `cleanModelName` only (guard test governs). Never show provider/aggregator names
  or raw engine keys.
- **R-009 stays separate** — do not resolve "Auto" here.

## 1. What already exists (reuse, don't rebuild)

Verified by inspection:

- **Data** — `job_scenes` rows are already fetched into `scenes: JobScene[]` on the
  job page and kept **live** (poll + per-row merge): `app/jobs/[id]/page.tsx`
  (`scenes` state, `data.scenes`, realtime merge). Derived: `failedScenes`,
  `doneScenes`, `hasRetryableScenes`, `sceneCount`.
- **Statuses** — `pending` → `generating`/`in_progress` → `done` | `failed`.
- **Per-scene fields** (from `job_scenes`): `scene_index`, `status`,
  `duration_sec`, `prompt`, `video_url`, `last_frame_url`, `error_message`.
- **Existing UI** — "X/Y scenes completed", which scenes failed, a **Retry failed
  scenes** button, and **click-to-seek** the final video per scene
  (`selectedSceneIndex`).

### Endpoints available (no new ones needed for V1)

| Endpoint | Effect | Constraints |
|---|---|---|
| `POST /api/jobs/[id]/retry-scenes` | Reset **all** failed scenes → `pending`, job → `in_progress`; poller resumes (completed scenes preserved). | **Job must be `failed`.** Owner-only. |
| `POST /api/jobs/[id]/scenes/[sceneIndex]` | Regenerate **one** scene; sets scene `generating`, job `in_progress`. | Job `done`/`failed`. **EvoLink / Bailian engines only** (see R-010). Owner-only. |
| `PATCH /api/jobs/[id]/scenes/[sceneIndex]` | Edit a scene's prompt (no regen). | Job `done`/`failed`. **V2** (not surfaced in V1). |

## 2. V1 scope (explicit)

1. **Read-only + live statuses** — render the board from `scenes`, update in place
   as the poll/realtime stream advances (no new fetching logic).
2. **Retry failed scene(s)** — reuse `POST /retry-scenes` (the existing
   "Retry failed scenes" action), presented per-board. Single-scene regenerate
   (`POST /scenes/[i]`) is **optional in V1** and only offered when the engine is
   supported (else hide the per-scene regen button) — see R-010.
3. **Provider-clean model display** — `cleanModelName(getEngineDisplayName(engine))`.
4. **No runtime scene editing in V1** — the `PATCH` prompt-edit endpoint exists but
   is **deferred to V2**; the board is read-only for prompts.

## 3. UX

```
Scene Board (horizontal, scrollable on overflow)

┌─ Scene 1 ─────┐ ┌─ Scene 2 ─────┐ ┌─ Scene 3 ─────┐
│ [thumb/play]  │ │ [thumb]       │ │ [spinner]     │
│ ● Done        │ │ ✕ Failed      │ │ ◷ Generating  │
│ "wide shot…"  │ │ "reaction…"   │ │ "close-up…"   │
│ 5s · Model    │ │ 5s · Model    │ │ 5s · Model    │
│ [▶ seek]      │ │ [↻ Retry]     │ │ …             │
└───────────────┘ └───────────────┘ └───────────────┘
```

Per scene card:
- **Thumbnail/preview**: `last_frame_url` (or the final video poster for that
  segment) when present; placeholder otherwise. Clicking a `done` scene **seeks**
  the existing video player to that scene (reuse `selectedSceneIndex`).
- **Status badge**: pending / generating (spinner) / done (green) / failed (red).
- **Prompt**: truncated, full text on hover/title.
- **Footer**: `Ns · <clean model name>`.
- **Failed scene**: short error + a retry affordance (see V1 scope #2). When the
  job is `failed`, the board's **Retry failed scenes** reuses `retry-scenes`.

Responsive: horizontal scroll on small screens; stacks/wraps gracefully. Dense,
premium, no marketing chrome. Single level of card nesting.

## 4. Components

| File | Action |
|---|---|
| `components/job/scene-board.tsx` | **New** — the strip; maps `scenes` → cards; emits `onSeek(sceneIndex)`, `onRetryFailed()`, optional `onRegenerate(sceneIndex)`. Pure presentational (data + handlers passed in). |
| `components/job/scene-card.tsx` | **New (or inline)** — one card (thumb, status, prompt, footer, action). |
| `lib/scene-status.ts` | **New (small, pure)** — `sceneStatusMeta(status) → { label, tone }` (provider-neutral), unit-testable. |
| `app/jobs/[id]/page.tsx` | **Modify** — render `<SceneBoard>` for multi-scene jobs; wire to existing `scenes`, `handleRetryScenes`, `selectedSceneIndex`. Keep the current single-video player + seek. Fold the existing ad-hoc failed-scenes notice into the board (or keep both, decide at impl). |

No new route, no migration. Model name display reuses `lib/types`
`getEngineDisplayName` + `lib/engine-intentions` `cleanModelName`.

## 5. Risks

- **R-010 (new)** — single-scene regenerate (`POST /scenes/[i]`) supports **EvoLink /
  Bailian only**; BytePlus/Atlas/HeyGen scenes can't be regenerated individually.
  V1: only show the per-scene regen button when supported; otherwise rely on
  `retry-scenes` (job-level, failed-job-only). Document; don't change the route.
- **Retry availability** — `retry-scenes` requires `job.status === "failed"`. A
  single failed scene inside a still-`in_progress` job can't be retried until the
  job settles. Reflect this in the button's enabled state.
- **Thumbnails** — `last_frame_url` may be absent for `pending` scenes → placeholder.
- **Don't regress** the existing live updates, retry button, and video seeking.

## 6. Tests

- `lib/__tests__/scene-status.test.ts` — `sceneStatusMeta` returns the right
  label/tone per status; labels are provider-neutral (no provider name).
- Extend the provider-leak guard if the board introduces any model-name formatting
  helper (it should just reuse `getEngineDisplayName`/`cleanModelName`, already
  guarded).
- (UI render tests optional; data flow already covered by the live job page.)

## 7. Implementation split

| Task | Scope | Risk |
|---|---|---|
| **T-301a** | This spec (docs-only). | none |
| **T-301b** | `lib/scene-status.ts` + `SceneBoard`/`SceneCard` (read-only, statuses, seek, clean model) wired into the page. | low–medium (UI on a live page) |
| **T-301c** | Retry affordances (job-level `retry-scenes`; per-scene regen only where supported). | low |
| **T-301d (V2)** | Inline per-scene prompt editing via `PATCH`. | deferred |

Validation gate per step: `npm test` · `npx tsc --noEmit -p tsconfig.json` ·
`npm run lint` · `npm run build`; provider-leak guard stays green.

## 8. Non-goals (V1)

- No state-machine / pipeline / webhook / Stripe / auth changes.
- No DB migration.
- No runtime prompt editing (V2).
- No resolution of "Auto" semantics (R-009).
- No new provider integration; no provider names in the UI.
