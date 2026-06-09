# UGC Payload Audit

Date: 2026-06-09
Status: T-802b complete

## Goal

Verify whether the shipped UGC Studio inputs survive the existing `POST /api/jobs`
contract without a dedicated UGC backend.

Audited path:

- `/create/product` and `/create/social`
- `lib/ugc-director.ts`
- `lib/ugc-social-pack.ts`
- `lib/validate-references.ts`
- `app/api/jobs/route.ts`
- `app/api/jobs/route.test.ts`

## Result

V1 UGC does **not** need a dedicated `/api/ugc/jobs` route right now.

The existing jobs payload preserves the important UGC fields:

- `references_payload`
- `byteplus_asset_ids`
- `aspect_ratio`
- `caption_mode`
- AI Director `scenes[]`

The route also forwards first-scene references/assets to the selected reference-capable
provider path and persists the full payload for later scene advancement.

## Field-by-field Audit

### Product and outfit references

Status: preserved.

`validateReferences()` accepts image roles:

- `character_face`
- `product_reference`
- `outfit_reference`
- `outfit_style` legacy

`POST /api/jobs` validates the references and persists them to `jobs.references_payload`
when valid. This preserves the semantic roles for future poller/provider logic.

### Verified face assets

Status: preserved with sanitization.

`byteplus_asset_ids` is accepted as an array, trimmed, filtered to IDs starting with
`asset-`, capped to 9, and persisted on `jobs.byteplus_asset_ids`.

The same sanitized list is forwarded as `assetIds` for the first generated scene on
the reference-capable direct model path.

### Director scenes

Status: preserved as storyboard and scene rows.

When `scenes[]` is provided, the server skips generated storyboard creation and maps
client scenes into `storyboard`:

- scene order is preserved,
- prompt is capped to 2000 characters,
- duration is clamped to `[3, 10]`,
- scene count is capped by plan,
- engine is preserved when provided.

The same sanitized storyboard is inserted into `job_scenes`.

### Social Pack aspect ratio

Status: preserved.

`aspect_ratio` accepts `16:9`, `9:16`, or `1:1`, then persists to `jobs.aspect_ratio`.
The same safe aspect ratio is forwarded to the first reference-capable provider task.

### Social Pack captions

Status: preserved.

`caption_mode` accepts `none`, `auto`, or `custom`, then persists to
`jobs.caption_mode`. UGC Social Pack currently sets `auto`, which survives the jobs
payload.

### Prompt

Status: preserved for display; enhanced copy is used internally where needed.

The original `prompt` is persisted on `jobs.prompt`. For client-provided Director
scenes, each scene prompt is taken from `scenes[]`, not re-split from the global prompt.

## Test Coverage Added

`app/api/jobs/route.test.ts` now includes:

- a successful UGC-style payload with:
  - `product_reference`,
  - `outfit_reference`,
  - `byteplus_asset_ids`,
  - `aspect_ratio: "9:16"`,
  - `caption_mode: "auto"`,
  - two Director scenes.
- assertions that:
  - `jobs.insert()` receives the preserved UGC payload,
  - `storyboard` has sanitized scene prompts and clamped durations,
  - `job_scenes.insert()` receives the same sanitized scenes,
  - the first provider call receives references, asset IDs, aspect ratio, prompt, and
    duration.

## Known Limits

This audit does not prove exact visual product grounding or exact outfit transfer. It
only proves payload preservation through the job creation contract.

The model still interprets:

- `product_reference` as a product grounding request,
- `outfit_reference` as a style/outfit direction,
- verified faces as the only supported real-person identity route.

This keeps R-017 open for future exact try-on/product-grounding work.

## Decision

Keep UGC V1 on the existing `POST /api/jobs` path.

Do not add `/api/ugc/jobs` unless a future requirement cannot be expressed by:

- `references_payload`,
- `byteplus_asset_ids`,
- `scenes[]`,
- `aspect_ratio`,
- `caption_mode`,
- existing creator identity fields.
