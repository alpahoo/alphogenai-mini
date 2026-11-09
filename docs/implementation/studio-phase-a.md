# Creative Studio V1: phase A (admin UX for H3)

Admin-only. No engine, graph, migration, deployment or GPU change. Built on the merged H3 pilot (PR #91, #92, #93).

## Delivered

- `/admin/studio`: one Create surface in three zones (create, result + history, contextual Advanced panel).
  Below `lg`, zones become tabs (Create / Result / History) and Advanced becomes a drawer.
- Video / Image switch and a model catalogue (`lib/studio/catalog.ts`). MOSS-Image is listed as
  **pending validation** and is never runnable from the UI.
- Simple / Advanced split is driven by the manifest (`tier` per param). Controls are rendered from the manifest
  widget type; unknown widget types render read-only instead of being silently ignored.
- Incompatible options are disabled from the manifest `variants` table (Image + Full quality stays refused).
  Attaching a first frame switches quality to the only validated I2V graph and says so.
- Locked values (sampler, scheduler, steps, turbo LoRA strength, fps, model files) are read from the exported
  graph of the selected variant and shown read-only. The Studio never writes them.
- Seed: random each run by default, dice to pick and lock, unlock to return to random.
- Real run states only (Queued, Generating, Completed, Failed, Expired, Cancelled) with elapsed wall time.
  No invented percentage. Polling only for the active run, only while the tab is visible, 3 s then 6 s.
- Result player with Corrected / Original / Compare (side by side, original muted, "play both from start").
  Separate downloads use a server-built attachment name; signed URLs (10 min) are refreshed on expiry.
- Reuse settings (same seed) and New seed load a past run's settings. Generating always stays an explicit click.
- History of the admin's own runs (`GET /api/admin/comfy/history`), scoped to the caller, no URLs or storage keys.
- Presets: settings only (not the prompt), stored in this browser (localStorage). Server presets come later.
- Cost line: SQL reservation per run ($0.75), remaining authorized runs and budget from the gate, and the
  estimate of the first pilot labelled as unreconciled.
- Keyboard: Ctrl/Cmd+Enter generates, Escape closes Advanced.
- Studio dark by default with a light toggle; the admin frame follows the Studio theme on Studio pages.
- Admin layout is now usable on mobile (menu drawer). Other admin pages keep their layout from `md` up.
- `/admin/workflows/minimax-h3?run=<id>` redirects to the same run in the Studio (existing links keep working).

## Review fixes (Codex review of 47ac9d2)

- **Server-side admin gate.** `/admin/studio` now calls `requireAdminPage()` (`lib/admin/require-admin-page.ts`)
  before rendering. It reuses the API guard `requireAdmin` (server-verified Supabase session + server-side
  admin allowlist). Anonymous → `/login`, authenticated non-admin → `/home`. The page is `force-dynamic`.
  The client layout check stays as a UX layer only; other admin pages are unchanged.
- **Stale network responses.** `lib/studio/run-selection.ts` ties every run fetch (open and polling) to the
  selected run. Responses and errors for a run that is no longer selected, or whose payload id differs, are
  dropped; the previous request is aborted, but the identity check is the guarantee. Selecting a run shows a
  neutral "Loading" placeholder, so media and download buttons of the previous run never remain on screen.

## Unchanged on purpose

- Admission, SQL gate, dispatch, executor, graphs, postprocess (0.4 s default), private bucket, retention.
- The gate still grants explicit, limited runs. Regular admin use with daily/monthly budgets is a later phase
  that needs a migration and owner approval.
- No "Loading" or "Post-processing" status: the run table does not record them, so they are not displayed.

## Tests

`lib/studio/*.test.ts` (manifest helpers mirror the server binding for every variant, locked values, statuses),
`app/api/admin/comfy/history/route.test.ts` (admin guard, owner scoping, no URLs, page cap),
download case in the media route test. Visual review used a local, uncommitted harness with mocked admin APIs.
