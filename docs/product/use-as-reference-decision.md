# T-501d - Use as reference decision

Date: 2026-06-08
Owner: Codex while Claude Code is unavailable
Status: decision-only, no runtime change

## Goal

Add a safe "Use as reference" path from a completed job to the create flow, without breaking the existing structured reference pipeline.

## Current facts

### Create flow references are structured

The create page does not just accept arbitrary media URLs. It builds a structured payload:

- `ReferenceItem` in `lib/types.ts`
- `ReferencePayload` grouped into `images`, `videos`, `audio`
- `buildReferencePayload()` in `components/create/reference-upload.tsx`
- server validation in `lib/validate-references.ts`

The canonical source for references is `storage_path` inside the private `references` bucket. The `url` field is mainly preview / signed-url compatibility.

### The references bucket is image-only today

`POST /api/upload?bucket=references` accepts only:

- JPG
- PNG
- WEBP

It returns:

- `url` signed for preview
- `storage_path` canonical path owned by the user

Video/audio uploads exist in the legacy R2 upload path, but the structured multi-reference flow marks video/audio reference slots as coming soon (`camera_motion`, `mood`).

### Completed jobs expose media, but not as reusable structured refs yet

A job page can see:

- `output_url_final` / `video_url`
- `image_url`
- scene `last_frame_url`
- thumbnail candidates via social pack / thumbnail route

But there is no existing route that turns a completed job output into a private `references` bucket `storage_path`.

## Decision

For V1, implement **Use as image reference**, not full video reference.

The action should use the best available still image from the completed job and open the create flow with that image already registered as a structured image reference.

Priority order for the still image:

1. selected thumbnail from `social_exports.thumbnail`, if present
2. first scene `last_frame_url`
3. job `image_url`
4. generated thumbnail route fallback if needed

The reference role should be `outfit_style` by default, because it is a generic visual style / composition reference and does not imply identity consent.

Do **not** use `character_face` automatically. A completed video frame can contain a real person, and the face consent / verified-face rules should stay explicit.

## Rejected options

### Option A - pass raw video URL into `/create/story`

Rejected for V1.

Reason: video reference slots are still marked coming soon, and provider support is inconsistent. A raw public URL would also bypass the ownership and storage_path model used by structured references.

### Option B - query param with only the job output URL

Rejected as the primary V1.

Reason: easy to build but weak technically. It would create a preview-only reference without canonical `storage_path`, and it could break when signed/provider URLs expire.

### Option C - save completed video as a reusable video reference

Deferred.

Reason: valuable later, but it needs a real video reference pipeline: storage, validation, UI slot enablement, provider compatibility, and tests.

## Recommended implementation

### T-501d1 - Backend helper route

Create a small authenticated route, for example:

`POST /api/jobs/[id]/reference-image`

Responsibilities:

1. Verify job ownership.
2. Verify job is complete enough to have a usable image source.
3. Choose the best still image using the priority order above.
4. Download that image server-side.
5. Validate it is JPG/PNG/WEBP or convert if needed.
6. Store it in the private `references` bucket under `{user_id}/job-refs/{job_id}-{uuid}.jpg` or similar.
7. Return a `ReferenceItem`-compatible object:

```json
{
  "reference": {
    "role": "outfit_style",
    "url": "<signed preview url>",
    "storage_path": "<user_id>/job-refs/<job_id>-<uuid>.jpg",
    "mime_type": "image/jpeg",
    "filename": "job-reference.jpg",
    "weight": 0.7
  }
}
```

This route should not modify jobs or create a DB row unless later needed. The storage object itself is enough for the current reference pipeline.

### T-501d2 - Create page prefill

Add a create flow query param, for example:

`/create/story?reference_job_id=<job_id>`

On load:

1. call `POST /api/jobs/[id]/reference-image`
2. insert the returned reference into `references` state under a stable key like `job_reference`
3. optionally insert an `@image` chip into the composer with label `reference`
4. open the references/assets area enough that the user sees it is attached

### T-501d3 - Job page action

Add `Use as reference` to the completed job action surface.

Preferred behavior:

- button links to `/create/story?reference_job_id=<job_id>`
- no direct generation
- no provider names
- disabled/help state if no usable still image is available

## Validation

Implementation should include:

- unit test for source-selection helper if extracted
- route test with mocked Supabase/storage if feasible
- create page smoke test by code review or browser pass
- guard that the returned reference has `role: "outfit_style"`, never `character_face`
- existing checks: `npm test`, `npx tsc --noEmit -p tsconfig.json`, `npm run lint`, `npm run build`

## Product copy

Recommended public labels:

- Button: `Use as reference`
- Loading: `Preparing reference...`
- Success toast: `Reference added to a new project`
- Error: `Could not prepare a reference from this video yet`

Avoid:

- `Use face`
- `Clone character`
- provider/aggregator names
- promises that the whole video motion will be reused

## Coordination note

This decision deliberately keeps V1 image-based. Full video reference reuse should be a separate V2 after the `camera_motion` reference slot is truly supported end-to-end.
