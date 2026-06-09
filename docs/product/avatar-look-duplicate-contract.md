# Avatar / Look Duplicate Contract

Date: 2026-06-09  
Status: Product decision, no runtime change

## Current State

Classic video jobs can now be duplicated faithfully through `POST /api/jobs/[id]/duplicate`.

The duplicate helper copies:

- prompt,
- aspect ratio,
- captions/audio,
- chain settings,
- verified face ids,
- references,
- image URL,
- engine,
- persisted storyboard converted to `scenes[]`.

Avatar/look jobs remain blocked with HTTP 409 and a provider-neutral message.

## Why Avatar / Look Duplicate Stays Blocked

Avatar and saved-look jobs can contain reconstruction-critical data that is not guaranteed to be represented in the generic `jobs` row:

- selected avatar identity,
- voice/lipsync configuration,
- source look id,
- look reference payload,
- avatar post-processing state,
- generated intermediate clips,
- provider-side reusable assets.

A "duplicate" button that loses any of those fields would feel broken, even if the new job starts successfully.

## V1 Decision

Keep avatar/look duplicate blocked until there is a dedicated reconstruction contract.

User-facing fallback:

- **Use as reference** for visual continuity;
- **Save as Look / Create from Look** once T-401 is implemented;
- manual create flow for new scripts.

## Required Contract Before Enabling

An avatar/look duplicate helper must be able to build a complete `POST /api/jobs` payload from a source job without reading provider-only task state.

Required fields:

- base prompt or script;
- mode: `avatar`, `look`, or `standard`;
- source look id or embedded look payload;
- avatar id where applicable;
- voice id / script / voice mode where applicable;
- aspect ratio;
- caption/audio settings;
- references and verified face ids;
- storyboard scenes if present;
- chain settings if present.

## Acceptance Tests

- Avatar job duplicate preserves avatar id, voice id, script, aspect ratio, and prompt.
- Look job duplicate preserves look id or full look reference payload.
- Unsupported legacy avatar/look rows still return 409 with a helpful provider-neutral message.
- No output URLs, status, cost, external task IDs, or provider task metadata are copied.
- All new duplicate paths still forward to `POST /api/jobs` so quota, policy, and routing stay centralized.

## Implementation Slices

1. Audit avatar/look job rows currently stored in production.
2. Extend `DuplicateJobSource` only with durable source fields.
3. Add helper tests before touching the route.
4. Enable avatar duplicate only when tests prove fidelity.
5. Enable look duplicate after T-401 defines the saved-look payload contract.
