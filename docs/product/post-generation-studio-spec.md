# T-501 — Post-generation Studio spec

Date: 2026-06-08
Owner: Codex while Claude Code is unavailable
Status: spec-only, no runtime change

## Goal

Turn the completed job page into a premium post-generation studio: after a video is done, the user should immediately see the next best actions instead of hunting through scattered buttons and collapsible panels.

This is mostly a consolidation/polish task. Many routes and UI pieces already exist; do not rebuild them from scratch.

## Existing pieces discovered

### Job page actions already visible

File: `app/jobs/[id]/page.tsx`

- Download final video.
- Share public link (`/v/[id]`).
- Copy video URL.
- Copy prompt.
- Duplicate job via `POST /api/jobs/[id]/duplicate`.
- Save as Look for `heygen_avatar_shots` jobs via `POST /api/looks`.
- Retry failed job / retry failed scenes.
- Scene timeline + scene panel from `components/editor/*`.
- Social Media Pack rendered through `components/job/social-export-panel.tsx` when the job is done.

### Social Media Pack already exists

File: `components/job/social-export-panel.tsx`

It already includes:

- Export formats: TikTok/Reels `9:16`, Instagram `1:1`, YouTube `16:9` via `/api/jobs/[id]/export-social`.
- Thumbnail picker via `components/job/thumbnail-picker.tsx` and `/api/jobs/[id]/thumbnail`.
- AI copy generation via `/api/jobs/[id]/generate-metadata`.
- Direct publish controls for YouTube, TikTok, Instagram.
- Schedule controls via `/api/scheduled-posts`.
- Link to `/schedule`.

### Routes already available

- `POST /api/jobs/[id]/duplicate`
  - Duplicates prompt, plan, duration, engine, image URL, references.
  - Current limitation: does not appear to copy every advanced generation option (aspect ratio, caption/audio modes, selected verified face IDs, edited scenes/storyboard). Treat as "duplicate basic setup" unless improved in a separate backend task.
- `POST /api/jobs/[id]/export-social` and `GET /api/jobs/[id]/export-social`
  - Creates/polls social format exports; has fallback to original URL.
- `GET /api/jobs/[id]/social-pack`
  - Returns video URLs, thumbnail candidates, AI metadata, ready flag.
  - Not obviously used by the current page because `SocialExportPanel` calls the underlying routes directly.
- `POST /api/jobs/[id]/thumbnail`
  - Uses cached thumbnail, scene last frame, job image, R2 frame fallback, then Modal fallback if configured.
- `POST /api/jobs/[id]/generate-metadata`
  - Generates platform copy; Pro/Premium gate.
- `GET/POST/DELETE /api/looks`
  - Saves cinematic/avatar-shot clips as reusable Looks. Currently limited to `heygen_avatar_shots` jobs.
- `GET/POST /api/scheduled-posts`, `PATCH/DELETE /api/scheduled-posts/[id]`, `POST /api/scheduled-posts/[id]/publish-now`
  - Scheduling is already functional and plan/social-connection gated.
- `POST /api/jobs/[id]/upscale`
  - Stub only, returns 501 coming soon. Do not surface as a primary action yet.

## UX direction

Create a clear post-generation action hierarchy on the job page:

1. Primary outcome actions
   - Download
   - Share
   - Copy link
   - Duplicate / Create variation

2. Creative reuse actions
   - Create variation
   - Use as reference
   - Save as Look when supported

3. Repair / scene actions
   - Retry failed scenes when available
   - Scene timeline and scene panel remain the runtime surface

4. Social studio actions
   - Export formats
   - Pick thumbnail
   - Generate caption pack
   - Schedule post
   - Publish to connected platforms

The user should perceive this as a studio, not a pile of secondary buttons.

## Proposed implementation slices

### T-501a — Spec/audit

Status: done when this document is merged.

Deliverables:

- This spec.
- Backlog updated to reflect that much of the studio already exists.
- Clear handoff note for Claude Code.

### T-501b — Job action bar polish (UI-only)

Goal: make the completed job actions read as a premium action bar.

Scope:

- Keep current handlers and routes.
- Group the existing buttons into a stable action surface:
  - Download (primary)
  - Share
  - Copy link
  - Copy prompt
  - Duplicate / Create variation
  - Save as Look when supported
- Rename/position "Duplicate" carefully:
  - If it immediately creates a new job, keep label `Duplicate` or `Duplicate job`.
  - If product wants "Create variation", route should preferably open create flow prefilled before generating. Do not relabel a direct generation as a variation editor.
- Add concise disabled/help text where an action is not available.

No route/API/DB changes.

### T-501c — Social Pack consolidation (UI-only)

Goal: make `SocialExportPanel` feel like a polished studio module rather than a long utility accordion.

Scope:

- Keep existing routes and state.
- Improve section order and visibility:
  - Formats/export status first.
  - Thumbnail picker second.
  - AI copy/caption pack third.
  - Schedule/publish after copy exists.
- Consider a compact summary row at the top:
  - `3 formats`, `Thumbnail set`, `Copy ready`, `Scheduled/Not scheduled`.
- Keep plan gates intact.
- Do not use provider names.

No route/API/DB changes.

### T-501d — Use as reference (decision/spec before code)

Goal: let a completed video become input for the next creation.

Open decision:

- Option A: `Use as reference` opens `/create/story` with a query param containing the job ID. The create page then loads the job media and inserts it as a reference chip.
- Option B: create a lightweight server-side reference asset from the job output, then open create with a stable asset ID.
- Option C: first version simply copies the video URL / prompt and opens create. Lower value, but no backend.

Recommendation:

- Do not implement blindly. The create composer expects structured references, and video/audio reference support is partly marked coming soon in `components/create/reference-upload.tsx`.
- Write a short decision note before coding.

### T-501e — Duplicate fidelity audit (backend, later)

Goal: make `Duplicate with same assets` actually preserve the full job setup.

Current route copies:

- prompt
- plan
- target duration
- engine
- image URL
- references payload

Potential missing fields to verify before changing:

- aspect ratio
- caption mode
- audio mode / voiceover fields
- verified face asset IDs
- edited Director scenes / storyboard
- multi-scene chain settings

This is not UI-only. Treat as a separate backend task with tests.

## Non-goals for V1

- Do not surface `upscale` as a primary button while it returns 501.
- Do not build a second SocialExportPanel.
- Do not create a new scheduling system; use the existing `/scheduled-posts` routes.
- Do not add migrations for T-501b/T-501c.
- Do not expose providers/aggregators in public UI.

## Validation checklist for implementation

For T-501b/T-501c:

- `npm test`
- `npx tsc --noEmit -p tsconfig.json`
- `npm run lint`
- `npm run build`
- Visual pass on a completed job page:
  - completed single-scene job
  - completed multi-scene job
  - failed job with retryable scenes
  - free plan and premium plan if possible

## Prompt for Claude Code when back

Claude, during your absence Codex audited T-501 and found that the post-generation studio is already mostly implemented. Do not create a duplicate studio component. Reuse:

- `app/jobs/[id]/page.tsx` for the main action bar.
- `components/job/social-export-panel.tsx` for formats, thumbnail, AI copy, publish and schedule.
- `components/job/thumbnail-picker.tsx` for thumbnails.
- existing routes under `app/api/jobs/[id]/*`, `app/api/looks`, and `app/api/scheduled-posts`.

Recommended next implementation is T-501b UI-only: polish/group the completed job action bar and keep existing handlers. Then T-501c UI-only: polish `SocialExportPanel` layout. Do not implement `Use as reference` or high-fidelity duplicate until the product decision/backend scope is written.
