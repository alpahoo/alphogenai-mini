# Duplicate Fidelity Audit

Date: 2026-06-08  
Status: audit-only  
Scope: `POST /api/jobs/[id]/duplicate` versus the current `POST /api/jobs` contract.

## Executive Summary

The current duplicate route creates a fresh job through `POST /api/jobs`, which is the right architectural choice because quota, policy, plan checks, and provider routing stay centralized.

However, the payload it forwards is too small for the current product surface. It copies only:

- `prompt`
- `target_duration_seconds`
- `engine_used` as `preferred_engine`
- `image_url`
- `references_payload` as `references`

That was acceptable for earlier single-prompt jobs, but it is no longer faithful for Director Console, verified faces, social formats, audio/captions, and chain settings. The UI label `Duplicate job` is therefore intentionally conservative. Do not rename it to `Create variation` until T-501e1 closes the backend fidelity gaps.

## Current Backend Contract

`app/api/jobs/route.ts` currently accepts these relevant create fields:

| Field | Purpose | Duplicate today |
| --- | --- | --- |
| `prompt` | Original user prompt | copied |
| `target_duration_seconds` | Duration target | copied |
| `preferred_engine` | Requested model key | copied from `engine_used` |
| `image_url` | Main image input | copied |
| `references` | Structured references payload | copied from `references_payload` |
| `byteplus_asset_ids` | Verified face asset IDs | missing |
| `scenes[]` | Edited Director/client scenes | missing |
| `multi_scene_chain` | Chain on/off | missing |
| `chain_strategy` | Continuity/anchor strategy | missing |
| `aspect_ratio` | 16:9 / 9:16 / 1:1 | missing |
| `caption_mode` | none/auto/custom | missing |
| `caption_style` | custom caption styling | missing |
| `audio_mode` | none/auto/custom | missing |
| `audio_prompt` | custom audio direction | missing |
| `voiceover_text` | voiceover text | missing |
| Avatar fields | `avatar_id`, `voice_id`, `script_text`, `look_id`, etc. | not safely reconstructable today |

## Fidelity Gaps

### P1 - Aspect Ratio Is Lost

A 9:16 or 1:1 job duplicated today falls back to the create route default, usually 16:9. This is highly visible and breaks the Social Pack promise.

Recommendation: select and forward `aspect_ratio` when it is one of `16:9`, `9:16`, `1:1`.

### P1 - Verified Face Assets Are Lost

Seedance verified-face jobs rely on `byteplus_asset_ids`. The duplicate route does not select or forward them, so a duplicated character job can silently lose the verified face constraint even if the prompt text still looks similar.

Recommendation: select and forward `byteplus_asset_ids` when it is a non-empty array.

### P1 - Edited Director Scenes Are Not Preserved

T-201c made edited Director plans real by sending `scenes[]` to `POST /api/jobs`. The persisted job has a `storyboard`, but duplicate does not select it and therefore triggers server-side storyboard generation again.

Recommendation: select `storyboard` and convert valid entries to `scenes:[{ prompt, duration_sec, engine? }]`. This preserves edited scene prompts and durations while still reusing the centralized create route. Clamp/validation remains server-side in `POST /api/jobs`.

### P2 - Chain Settings Are Lost

`multi_scene_chain` and `chain_strategy` influence continuity behavior. The duplicate route omits both, so a job created with chain disabled or anchor strategy can duplicate with different runtime behavior.

Recommendation: select and forward `multi_scene_chain` and `chain_strategy`.

### P2 - Audio and Caption Settings Are Lost

`audio_mode`, `audio_prompt`, `voiceover_text`, `caption_mode`, and `caption_style` are persisted on jobs but not duplicated. This makes a duplicated social/story job less faithful than users expect.

Recommendation: select and forward all persisted audio/caption fields that map directly to `POST /api/jobs`.

### P2 - Avatar / Look Jobs Need A Separate Decision

The create route has special branches for avatar/look reuse that require request-time fields such as `avatar_id`, `voice_id`, `script_text`, `look_id`, `lipsync_mode`, and `voice_mode`. Not all of these are stored in a shape that can be safely reconstructed from the generic `jobs` row.

Recommendation for V1: detect avatar/look engines and return a friendly unsupported response or keep Duplicate hidden for those jobs until a dedicated avatar duplicate contract exists. Do not fake fidelity by sending only `prompt` + `preferred_engine`.

### P3 - Plan Should Stay Current

The duplicate route currently selects `plan`, but does not forward it. This is probably correct: `POST /api/jobs` should enforce the user's current plan/quota rather than replaying an old plan value.

Recommendation: do not forward `plan`.

## Recommended T-501e1 Implementation

1. Keep the architectural pattern: duplicate forwards to `POST /api/jobs`.
2. Expand the Supabase select to include:
   - `storyboard`
   - `byteplus_asset_ids`
   - `multi_scene_chain`
   - `chain_strategy`
   - `audio_mode`
   - `audio_prompt`
   - `voiceover_text`
   - `aspect_ratio`
   - `caption_mode`
   - `caption_style`
   - `avatar_final` or engine metadata only if needed for unsupported detection
3. Add payload fields only when valid/non-empty.
4. Convert persisted storyboard to `scenes[]` for non-avatar jobs:
   - `prompt`: non-empty string, sliced by the create route later
   - `duration_sec`: numeric, let create route clamp
   - `engine`: optional internal key when present and not `auto`
5. Treat avatar/look jobs explicitly:
   - either hide/disable duplicate in the UI for unsupported engines;
   - or return a 409/400 JSON error such as `{ error: "Duplicate is not available for avatar jobs yet." }`;
   - implement exact avatar duplication only after the required source fields are persisted and tested.
6. Do not copy outputs or execution state:
   - video URLs, thumbnails, social exports, costs, status, error messages, provider task IDs, timestamps.

## Test Plan

Add tests around a pure payload builder if possible, for example `lib/job-duplicate-payload.ts`, so the route stays thin:

- copies aspect ratio, captions, audio, chain strategy;
- copies verified face asset IDs;
- converts storyboard to `scenes[]` preserving prompt/duration/engine;
- omits invalid/empty optional fields;
- does not forward `plan`;
- blocks or flags avatar/look jobs consistently;
- no provider names in user-facing error strings.

## Product Copy Guidance

Until T-501e1 is implemented and tested, keep the UI label conservative:

- Good now: `Duplicate job`
- Avoid now: `Create variation`, `Duplicate with same assets`, `Remix with same setup`

After T-501e1, the safer upgrade path is:

- `Duplicate setup` if it copies inputs/settings exactly and starts immediately;
- `Create variation` only if the flow opens the create page/editor before generating.
