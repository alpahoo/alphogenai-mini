# Cinema M1 — local recipe (local Supabase, no cloud, no GPU)

Reproducible acceptance run of the issue #117 scenario against a **local** Supabase stack and the local dev server. Nothing here touches a cloud project, Vercel, production data, a paid GPU, or any H3/MOSS licence. Every script refuses a Supabase URL that is not `127.0.0.1`/`localhost`.

What it covers and what it does not is stated at the end. Test media, `.env.local` and `supabase/config.toml` stay out of Git (`tmp/` and `.env*.local` are ignored; `supabase/config.toml` is yours to create).

## Prerequisites

Docker Desktop (running), Node 20+, `npm ci`, and `openssl` on the PATH (only for the simulated dispatcher's self-signed certificate). The Supabase CLI is used through `npx supabase@3.2.0`.

## Procedure

```bash
# 1. Local Supabase config (untracked). Then set, in supabase/config.toml:
#      [db.migrations]  enabled = false      # the historical chain does not replay (see below)
#      [db.seed]        enabled = false
npx supabase@3.2.0 init
npx supabase@3.2.0 start -x edge-runtime,logflare,vector,imgproxy,studio,mailpit,supavisor,realtime

# 2. Prepare the test database: replay supabase/migrations one file per transaction.
#    Asserts that exactly the five documented historical files fail, with the documented errors,
#    and that the H3, MOSS and Cinema M1 migrations apply.
node tools/cinema-local/replay-migrations.mjs

# 3. Accounts, .env.local (keys from `supabase status`, never printed) and fixtures. Idempotent.
node tools/cinema-local/seed.mjs                      # synthetic H3-shaped clips
node tools/cinema-local/seed.mjs --media-dir <dir>    # optional: plan1.mp4 plan2.mp4 plan2_old.mp4 plan3.mp4 (Corrected audio)

# 4a. Generation locked (no COMFY_* variable): the routes answer 503.
node tools/cinema-local/dev.mjs                       # leave running
node tools/cinema-local/recipe.mjs --generation locked

# 4b. Simulated dispatcher: stop 4a first (same port), then
node tools/cinema-local/dev.mjs --simulated           # leave running
node tools/cinema-local/recipe.mjs --generation simulated

# 5. Stop. The volumes and fixtures are kept.
npx supabase@3.2.0 stop
```

The recipe exits non-zero if any check fails. It creates a few projects and one montage per run (it removes the montages of its own earlier runs).

## Why the migration chain is replayed by hand

`supabase start` / `db reset` apply `supabase/migrations` in order and stop at the first error. On a blank database the chain stops at its first file, and four more files fail later for reasons that predate Cinema M1. None of them touches Cinema M1, H3 or MOSS. Exact errors from PostgreSQL 17 (`psql -v ON_ERROR_STOP=1 -1`), in file-name order:

| # | File | Exact error | Cause |
|---|---|---|---|
| 1 | `20251002_add_notes.sql` | `ERROR:  syntax error at or near "not"` — `LINE 1: create policy if not exists "Users can select their own note...` | `CREATE POLICY IF NOT EXISTS` is not valid PostgreSQL. |
| 2 | `20260608_byteplus_assets_thumb_and_update_policy.sql` | `ERROR:  relation "public.byteplus_assets" does not exist` | Alters a table that no migration of the repository creates. |
| 3 | `20260609_enable_rls_app_settings.sql` | `ERROR:  relation "public.app_settings" does not exist` | Same: the table is created outside the chain. |
| 4 | `20260609_harden_function_search_path.sql` | `ERROR:  function public.set_timestamp() does not exist` | Alters a function that no migration creates. |
| 5 | `20260622_add_podcast_render_columns.sql` | `ERROR:  relation "public.podcasts" does not exist` | Ordering: `…_add_podcast_render_columns` sorts before `20260622_create_podcast_schema.sql`, which creates `podcasts`. |

`add_public_read_policy.sql` has no timestamp prefix; the CLI skips it and so does the replay script. The other 59 files apply, including `20261108_comfy_admin_h3.sql`, `20261109_comfy_moss_image.sql` and `20261122_cinema_m1.sql`. `replay-migrations.mjs` keeps the list of five (`KNOWN_FAILURES`) and fails if the outcome differs, so a change in the chain is noticed instead of silently ignored.

Reworking the historical migrations is **out of scope** of this PR. Production already has these objects, so this only affects building a database from scratch.

## What the recipe checks (issue #117 scenario)

| #117 step | Checks |
|---|---|
| 1 Create/reopen Luz, attach the three renders in order, fourth as plan-2 alternative | S1, S2 |
| 2 Reload: project, scenes, plans, takes and the plan-2 selection survive | S3, S5 (new session each time) |
| 3 Swap a1bc89fe ⇄ 731316da, plans 1 and 3 unchanged | S4, S5 |
| 4 Relaunch of plan 2 with an idempotency key, zero GPU, no double debit | simulated: G2–G9, G13–G14, G18 |
| 5 Corrected-audio montage from the three selected runs, private, playable, downloadable, two joins, about 15.5 s | M1–M7 (frames, duration, audio correlation per clip against its Corrected source) |
| 6 Reload: montage and sources exist, quotas and gates unchanged | M9, M10, G3 (locked), G6/G17 (simulated: only what the run itself consumed) |
| 7 Cross-account access: 403/404 for project, take, file | I1–I17 |
| 8 Retries, concurrent selection conflicts, partial failures | S6, S7, S9, G10–G16, G19 |
| Persistence contract: owner on shot, take and run enforced by the database, tombstoned run keeps its take, project deletion keeps runs | D1–D9 and `tools/test-cinema-migration.mjs` (also in CI) |

The montage check compares, for each of the three clips, a loud 0.25 s window of the montage with the same window of the clip's **Corrected** file (and with its **Original** file, which must not match). The fixtures give the two audio variants different content, so a montage built from the wrong one is detected. With real Luz clips, the Original is a synthetic tone derived from the Corrected file; only the Corrected audio is real.

## The simulated dispatcher

`dev.mjs --simulated` starts a local HTTPS server on `127.0.0.1:8443` and the Next.js dev server with `COMFY_ADMIN_ENABLED=true`, `COMFY_DISPATCH_URL` pointing to it, a random `COMFY_DISPATCH_SECRET` and `NODE_EXTRA_CA_CERTS` set to its self-signed certificate. The real routes, admission RPC, gate, outbox and `dispatchRun` run unchanged. The simulator stands in for Modal and only for Modal: it checks the secret header, then claims the run with `claim_comfy_admin_run`, uploads a raw and a final MP4 to the local `comfy-outputs` bucket, inserts the two `comfy_assets` rows and calls `finish_comfy_admin_run`. It can be switched between `accept`, `hold` (accept but render later), `reject` (outage) and `release`. It never contacts Modal or any other host.

The recipe sets the H3 gate **in the local database only** (4 permits, 3.00 USD of budget, account A). The "committed" amounts it leaves behind are reservations in a throwaway database, not charges. To rerun the simulated phase, reset the gate by rerunning the recipe (it rewrites the row); it refuses to start while account A has an active job.

## Findings from the recipe that are not part of this PR

* **Deletion redacts rather than nulls the job prompt.** The repository declares `jobs.prompt TEXT NOT NULL`, so `lib/comfy/delete-run.ts` writes the fixed marker `[deleted]` before the run tombstone. This keeps the job row for accounting without retaining the private prompt and avoids the former 503. The production column and hosted deletion path still require the separate staging/production validation; no production migration is implied.
* **Montage: a clip whose audio is shorter than its video shifts the next clips earlier** by the shortfall. `lib/montage/build.ts` trims each audio to the video length (`atrim`) but never pads (`apad`). Real H3 clips are padded (5.184 s of audio for 5.167 s of video), so the Luz montage is exact; the case appeared with a fixture cut by hand. The seed script now pads such fixtures.
* **The framing caution is not reachable in Cinema M1.** `refFraming` (PR #114) is filled only in tests: the first frame of a plan is a library image path and no framing is stored for it. It is not an acceptance criterion of #117 (nor part of the #118 inventory); wiring it needs a stored framing per first frame (schema and UI) and belongs to a follow-up.

## Scope: validated here, simulated, and still to verify

Validated against a real local PostgreSQL 17 / GoTrue / Storage stack and the real Next.js routes and UI: the scenario above, migration application, ownership constraints, isolation between two accounts, signed links, ffmpeg montage with the Corrected audio, reload, selection conflicts.

Simulated: the GPU render and the Modal dispatcher (the simulator above), the H3 gate and budget (local rows), the Luz clips when `--media-dir` is not given (synthetic H3-shaped clips).

**Not verified, requires a hosted environment or a real render:** the migration on the hosted Supabase project (and the order in which it is approved and applied), Vercel build/auth cookies/admin allow-list on the real domain, ffmpeg and its 60 s limit on Vercel, signed URLs against the hosted Storage, mobile rendering, concurrent use from two browsers, a real GPU render of a plan and its real cost, and the production `jobs.prompt` question above.

