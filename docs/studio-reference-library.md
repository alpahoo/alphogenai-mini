# Studio: deleting generations and the reference library

No migration, no GPU run, no change to the H3 or MOSS gates, budgets, reservations, licences or workflows.

## 1. Deleting a generation (history)

A trash icon on every finished generation, with a confirmation. A queued or running generation cannot be deleted.

Removed for real: the video and image files in storage, the stored workflow graph (it holds the prompt), the dispatch records, the asset records, and the prompt copied into the job record. One-off uploads (not in the library) go with their last run.

Kept as a tombstone, because accounting, security and quotas need it:
- the run row: status, error code, finance status, reserved cost, timestamps, runtime, template version. Its `params_effective` is replaced by `{"deleted_at": ...}` and its reference link is cleared. This marker is how the history and the run route leave it out (no new column).
- the job row, with `prompt = null`. The daily quota counts jobs, so a deletion never gives a quota back.

Never touched: gates, budgets, reservations, `committed_usd`, finance status, any RPC. A run waiting for invoice reconciliation can be deleted: it keeps its accounting row. The confirmation says so.

Recoverable, not transactional (Supabase client, no migration). Order: media files, one-off reference, content records, job prompt, then the tombstone. The tombstone is the single commit point: until it is written the generation is still listed and can be deleted again, and every step is safe to repeat. Any failed step returns an error ("not fully deleted: delete it again to finish") and the interface never says "Generation deleted" in that case. Tested with a failure injected at each of the nine steps, then a retry that reaches the same final state.

One-off reference of a deleted generation: the server reports which upload it removed, and the Create form detaches it if it is still attached. A library reference is never reported as removed and stays attached. Independently, the admission route checks that the attached image still exists before reserving anything: a missing file returns an "Invalid reference" error, nothing is reserved, no GPU call can start, and the form detaches the image.

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

## Use an image result as a reference

A finished image result (for example from MOSS) can be copied into the library, then chosen as the first frame of a video model (H3 image-to-video). In the result screen of an image run: "Use as reference", a name, Save. Endpoint: `POST /api/admin/studio/references/promote { asset_id, name }`.

Acceptance criteria and how each is met:
- *Owner, format, size are checked.* The asset and its run must both belong to the signed-in administrator, the run must be finished and not deleted, the asset must not be withdrawn; anything else answers "Image not found" exactly like a missing one and no file is read. Only PNG, JPEG and WebP results are accepted (a video is refused before it is read). The file is capped at 10 MB and its magic bytes are checked again before it is stored.
- *Stored under the administrator's own folder.* The path is built by the server (`<user>/library/<name hex>_<uuid>.<ext>`), never from the request.
- *H3 accepts it.* The copy is an ordinary library image: the unchanged server validation accepts its path as `first_frame_path` and resolves the image-to-video workflow (tested).
- *No gate, budget, reservation or generation.* The route reads one output file and writes one library image and its thumbnail. It calls no RPC, touches no gate table, starts nothing (guarded by a test). MOSS stays unchanged.
- *Another administrator's result is refused.* Tested.
- *Same deletion rules as library images.* It is a library image: unique name, 60 maximum, deleted only from the library with a confirmation, refused while a queued or running generation uses it, and never removed when its source run is deleted (it is an independent copy; the source file is only read).

Shared code: listing and saving (magic bytes, name and count rules, thumbnail, no half-saved copy) moved to `lib/studio/reference-library-store.ts`, used by both the upload route and this one. Upload behaviour is unchanged (same tests).

## Remaining limits

- A failed deletion leaves the generation listed (without its files) until the delete is repeated.
- The existence check uses a signed-link probe, so a missing file is detected at generation time, not while browsing.
- Names live in file names; a table would allow renaming, roles and several images per character.

## Checks

Vitest (full suite), `tsc`, ESLint (0 errors), `next build`. Chromium with mocked APIs at 375, 768 and 1440 px: library usable with Full quality selected, save with a name, choose, remove from the generation (image stays), delete with cancel then confirm, no horizontal overflow, MOSS shows no library, only the expected API calls (no generation request).
