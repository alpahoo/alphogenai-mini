# Podcast Base Clip Cache Contract

Date: 2026-07-04

Ticket: T-1143a

Status: schema/contract, no runtime wiring.

## Why This Exists

The T-1142 spike proved that a photorealistic persona portrait can become a short HeyGen talking clip and then be lip-synced with AlphoGen podcast TTS.

However, HeyGen base clip URLs are temporary. A production talking-podcast pipeline must not depend on expiring provider URLs or regenerate the same base clip for every segment.

The base clip cache is the bridge between:

- `podcast_personas`: who the presenter is.
- HeyGen: provider that creates a reusable talking-head source clip.
- R2: permanent storage for the base clip.
- future render modes: `talking_highlights`, `talking_active_speaker`, `full_talking_duo`.

## Data Model

Table: `podcast_persona_base_clips`

One row represents a reusable source video for one persona under a specific render shape:

- `persona_id`
- `provider` (`heygen` in V1)
- `aspect_ratio`
- `resolution`
- `clip_kind`
- `prompt_version`

The cache stores:

- `provider_avatar_id`: HeyGen photo-avatar id, if known.
- `provider_video_id`: HeyGen base video task id, if known.
- `video_url`: permanent R2 URL, never the expiring HeyGen URL.
- `storage_key`: R2 object key.
- `duration_seconds`
- `status`: `pending | ready | failed | removed`
- `metadata`: provider details / QA flags / future fields.

Unique active cache key:

```text
persona_id + provider + aspect_ratio + resolution + clip_kind + prompt_version
```

## Invariants

- `status='ready'` requires `video_url`.
- `video_url` must be a permanent URL controlled by AlphoGen, usually R2.
- Catalog persona clips are service-role/admin managed.
- User persona clips can be read/written only by the owner.
- Removing a cache row should use `status='removed'` unless hard deletion is explicitly needed.

## Production Flow Later

Future T-1143b/T-1144 flow:

1. User selects talking render mode.
2. Backend resolves each speaker's `persona_id`.
3. Backend looks for a ready base clip row.
4. If missing, create one:
   - sign or fetch portrait
   - `createPhotoAvatar`
   - `createAvatarVideo`
   - download expiring HeyGen URL
   - upload MP4 to R2
   - mark row `ready`
5. Render mode lip-syncs selected segments against `video_url`.

## Why Not Store On `podcast_personas`

A persona can need multiple base clips:

- 16:9 vs 9:16.
- 720p vs 1080p.
- better future prompt versions.
- possible provider or style changes.

A separate table avoids repeatedly adding nullable columns to `podcast_personas` and gives us retry/error state per cache artifact.

## Current Non-Goals

- No production route yet.
- No UI yet.
- No credit spend from this ticket.
- No talking render mode yet.
- No migration application implied by the file alone; apply to production only with explicit GO.

## Next Tickets

1. T-1143b: admin/service route to create or reuse a base clip.
2. T-1143c: cost estimator and guardrail before generation.
3. T-1144a: `talking_highlights` render mode using cached clips.
4. T-1144b: fallback-safe Modal composition with static portraits when a clip is missing or fails.

