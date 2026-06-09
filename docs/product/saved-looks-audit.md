# Saved Looks Audit

Date: 2026-06-09
Status: T-401a audit complete

## Current Runtime Contract

The app already has a narrow Saved Looks implementation for cinematic avatar shots:

- `GET /api/looks` lists the authenticated user's rows from `cinematic_looks`.
- `POST /api/looks` saves a completed `heygen_avatar_shots` job as a reusable clip.
- `DELETE /api/looks?id=...` deletes the authenticated user's saved look.
- `POST /api/jobs` accepts `look_id` only in the avatar/cinematic path and lip-syncs a new script onto the saved clip.
- `/create/avatar` already supports selecting a saved look in cinematic mode.

## Table Shape Observed From Code

The route reads/writes these fields:

```text
cinematic_looks.id
cinematic_looks.user_id
cinematic_looks.name
cinematic_looks.video_url
cinematic_looks.thumbnail_url
cinematic_looks.duration_sec
cinematic_looks.source_job_id
cinematic_looks.created_at
```

## Migration Status

No local migration currently creates `cinematic_looks`.

That means the table is likely a production-era/manual table. Do not broaden or rename it until a Supabase schema audit confirms the live definition and policies.

## T-401b Safe Slice

Implemented without DB/API changes:

- Library surfaces Saved Looks as first-class reusable assets.
- Each Look links to `/create/avatar?look_id=<id>`.
- `/create/avatar` reads `look_id`, switches to cinematic mode, and selects the look once it is loaded.

## Deferred

- General-purpose `saved_looks` table.
- Save any completed standard video as a Look.
- Look capabilities metadata.
- Create-flow Saved Looks panel outside avatar/cinematic mode.
- Avatar/look duplicate enablement.

