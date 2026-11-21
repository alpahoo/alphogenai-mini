# Studio: deleting generations and the reference library

No migration, no GPU run, no change to the H3 or MOSS gates, budgets, reservations, licences or workflows.

## 1. Deleting a generation (history)

A trash icon on every finished generation, with a confirmation. A queued or running generation cannot be deleted.

Removed for real: the video and image files in storage, the stored workflow graph (it holds the prompt), the dispatch records, the asset records, and the prompt copied into the job record. One-off uploads (not in the library) go with their last run.

Kept as a tombstone, because accounting, security and quotas need it:
- the run row: status, error code, finance status, reserved cost, timestamps, runtime, template version. Its `params_effective` is replaced by `{"deleted_at": ...}` and its reference link is cleared. This marker is how the history and the run route leave it out (no new column).
- the job row, with `prompt = null`. The daily quota counts jobs, so a deletion never gives a quota back.

Never touched: gates, budgets, reservations, `committed_usd`, finance status, any RPC. A run waiting for invoice reconciliation can be deleted: it keeps its accounting row. The confirmation says so.

The steps are not one transaction (Supabase client, no migration). Files go first; if that fails nothing else changes. If a later step fails, a message says so and the same delete can be run again.

## 2. Reference library

Independent from the history. Admin only.

Storage, no table: files in the existing private `references` bucket.
- image: `<user_id>/library/<hex(name)>_<uuid>.<png|jpg|webp>`
- thumbnail (256 px WebP, made on the server with sharp): `<user_id>/library/thumbs/<same>.webp`

The name is hex-encoded in the file name so the path matches the run API's existing path check unchanged and the bucket's folder isolation (first folder = owner) still applies. Limits: 60 images, names of 1 to 40 characters, unique case-insensitively, 10 MB, magic-byte validation (PNG, JPEG, WebP).

API (`/api/admin/studio/references`): `GET` list with signed thumbnail links (1 h), `POST` add with a name, `DELETE ?id=` remove. The folder always comes from the session. Deletion is refused while a queued or running generation uses the image (the executor downloads it at start), and library files are never removed by run deletion.

Reuse: the same file can feed any number of generations. Deleting a generation never deletes it (tested). Deleting a library image does not affect finished generations.

## 3. In Create

Shown only when the model's manifest declares a reference (today: H3, "First frame"). MOSS declares none, so it shows no library and the form never submits a reference for it (tested).
- Upload one-off: unchanged ("Add first frame").
- Library: choose a saved image, add one with a name, delete one with confirmation.
- Remove from the current generation: the existing "Remove" button. The library keeps the image.
- Choosing an image only fills the form. With Full quality selected, it switches to Turbo, the only image-to-video workflow, and says so.

## Roles of a reference

Today a reference is the first frame of an H3 video. A character reference (a future model that conditions on identity) or another mode would be a new capability in that model's manifest with its own label; the library itself does not need to change. Nothing is sent to a model whose manifest does not declare it.

## If the library grows

A table (id, name, role, tags, created_at) with row-level security would replace the file-name encoding and allow renaming, roles and several images per character. It is not needed for one recurring character and was left out to avoid a migration.

## Checks

Vitest 1509, `tsc`, ESLint (0 errors), `next build`. Chromium with mocked APIs at 375, 768 and 1440 px: library usable with Full quality selected, save with a name, choose, remove from the generation (image stays), delete with cancel then confirm, no horizontal overflow, MOSS shows no library, only the expected API calls (no generation request).
