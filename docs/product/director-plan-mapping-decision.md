# Director plan → generation mapping — decision note (pre-T-201c)

> **Docs-only.** No code is changed by this note. It records the decision for how
> the AI Director's edited plan reaches generation, after inspecting the backend.
> Spec: [`ai-director-spec.md`](./ai-director-spec.md). Date: 2026-06-08.

## Question

When the user edits the Director plan (per-scene prompt + duration) and clicks
*Generate now*, how do those edits reach the pipeline **without touching the
jobs/scenes state machine**?

- **Option A** — concatenate the edited scenes into a single enriched prompt and
  let the server re-split it (`generateStoryboard`).
- **Option B** — send the edited scenes as an array and let the server use them
  verbatim.

## Backend inspection (read-only)

`app/api/jobs/route.ts` **already supports Option B** — it was built for "the
editor (Phase C)":

- Request body already destructures `scenes` (aliased `clientScenes`) with a typed
  shape: `scenes?: Array<{ prompt: string; engine?: string; duration_sec: number }>`
  (`app/api/jobs/route.ts:101`, `:129-130`).
- When `clientScenes` is a non-empty array, the server **skips server-side
  storyboard generation** and builds the storyboard from the client scenes
  (`app/api/jobs/route.ts:681-692`):
  - caps to the plan limit: `clientScenes.slice(0, MAX_SCENES[plan])`;
  - per scene → `{ scene_index, prompt: (s.prompt || enhancedPrompt).slice(0,2000),
    engine: s.engine || preferred || "wan_i2v", duration_sec: clamp(3,10) }`.
- That `storyboard` then flows into the **same** job + `job_scenes` insertion and
  the **same** state machine as the server-generated path (`:714+`, `:749+`).
  → The state machine consumes `storyboard` regardless of its source; **no change
  needed there.**

Server-side guarantees we can rely on (so the client stays simple):
- scene count capped to `MAX_SCENES[plan]`;
- `duration_sec` clamped to **[3, 10]** per scene;
- `prompt` truncated to **2000** chars;
- `engine` optional (falls back to the preferred engine).

## Decision — **Option B** (send edited `scenes[]`)

Rationale:
1. **Zero backend / state-machine change** — the path exists and is validated.
   Lowest risk, matches the constraint exactly.
2. **Faithful to the editable plan** — per-scene prompts/durations are honored,
   which is the entire point of the Director. Option A would discard the edits and
   re-split, defeating the feature (and double work: client merges, server re-splits).
3. **Already sanitized server-side** — caps/clamps/truncation protect the pipeline
   from bad client input.

Option A is rejected for the edited-plan case. (A single-prompt path still exists
implicitly: if the user never opens the Director, the current flow is unchanged.)

## Mapping for T-201c (implementation contract)

When *Generate now* is pressed **from the Director**, POST `/api/jobs` with:

```jsonc
{
  "prompt": "<original composer prompt>",      // still shown to the user
  "scenes": [
    { "prompt": "<edited scene prompt>", "duration_sec": <3..10>, "engine": "<engineKey>" }
    // …one per Director scene, in order
  ],
  // existing fields unchanged: references, byteplus_asset_ids, aspect_ratio, etc.
}
```

Client-side mapping rules (UI work, no backend change):
- Build `scenes[]` from `directorScenes` (prompt + durationSec, in order).
- **Clamp duration in the Director UI to [3, 10]** so the UI matches what the server
  enforces (today the mock allows min 1 — tighten in T-201c).
- `engine`: send the selected engine **key** (internal id). This is request-body
  data, not UI — provider confidentiality is unaffected (the UI still shows only
  model/capability names via `cleanModelName`).
- Keep sending `references` / `byteplus_asset_ids` exactly as today.
- The composer `prompt` stays the human-readable original; per-scene prompts ride in
  `scenes[]`.

## Out of scope (still deferred)

- Persisting an edited plan across reloads (would need a table → migration → R-003).
- Per-scene **distinct engines/assets** (v1: same engine + same refs for all scenes;
  the body already allows per-scene `engine` for a later iteration).
- Auto-running the Director without an explicit *Generate now*.

## Resolves

- **R-008** (Director edits were preview-only): the path to wire them is decided
  (Option B). Implementation = **T-201c**.
