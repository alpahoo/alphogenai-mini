# Talking avatar (LongCat-Video-Avatar 1.6) in the admin Studio

Task T-1171, branch `claude/longcat-avatar-integration`. Admin only, behind its own closed gate. Nothing here is applied to
a cloud database, deployed or run on a GPU. It was rehearsed end to end on a **local** stack with a simulated GPU: see "Local
rehearsal" and "What was verified".

**Dependency on PR #124** (`claude/longcat-avatar-modal-poc`, T-1170): runtime data only. The executor mounts the weights
volume `alphogenai-longcat-avatar-poc-weights` that #124's `--step weights` fills (47.3 GB, pinned revisions), and the
validated configuration and measurements come from #124. No file overlaps (`poc/longcat_avatar_modal/` stays in #124).
Either PR can merge first; the volume must exist before the executor is deployed.

## What the admin gets

`/admin/studio/avatar` (new page, no edit of `studio.tsx`):
1. choose a private **portrait** (the existing image library, `<user>/library/…`);
2. choose a private **audio** (new audio library, `<user>/audio-library/…`, WAV or MP3, 1 to 10 s, listen before choosing);
3. **Render avatar**; the screen shows queued / generating with elapsed time, errors in plain words (and whether a GPU was used);
4. play the MP4 privately (signed link) and **download** it; the **Library** list shows every avatar render. (Deleting a finished
   render is not offered yet: see "Known defect" below.)

Video length follows the audio in whole segments: 3.72 s (≤ 3.72 s of speech), 6.92 s, 10.12 s (up to 10 s of speech).

## How it plugs into what exists (no parallel system)

| Need | Reused |
|---|---|
| Job + run + history | `jobs` row and `comfy_runs` (new runtime `longcat-avatar@1`), history/run/media/delete routes unchanged |
| Private storage in | `references` bucket (portrait already; audio folder added; MIME list widened to WAV/MP3) |
| Private storage out | `comfy-outputs` bucket, `comfy_assets` (one `final` MP4), signed 10-minute links |
| Authorization and money | `comfy_runtime_gates` row `longcat-avatar@1` (closed by default), own env flag `COMFY_LONGCAT_ENABLED` |
| Dispatch | `comfy_dispatch_outbox` → `dispatch` endpoint → CPU `broker` (same app `alphogenai-comfy`) |
| Cancellation, start window | `moss_queue.collect_moss` (same bounded wait, call id persisted before the GPU answers, confirmed cancel) |
| Audio/video finishing | `postprocess.shift_audio(…, 0.0)` (copy video, pad audio) |

Ownership is enforced on the server in three places: the template binder accepts only `<owner>/library/…` and
`<owner>/audio-library/…` paths (tests: other user, traversal, wrong folder); the SQL admission requires the portrait under
the caller's folder; the broker re-checks both paths and `own_path()` before downloading anything.

## Duplicate renders and retries

- Client: one idempotency key + one seed per attempt (`lib/avatar/attempt.ts`), kept when a response is lost, renewed after
  success or when inputs change; button disabled while sending or while any avatar render is queued/running; an active render
  is reopened after a page reload.
- SQL `admit_comfy_avatar_run`: same key → same run; **same resolved graph hash while queued/running → the existing run**
  (the double-click guard even with a new key); per-user lock; single active job; plan quota; reservation kept until
  reconciliation.
- Delivery retry (`Retry dispatch`) re-sends only the run id; the SQL claim (`queued`→`running`) means at most one GPU
  execution per run (tested: a second dispatch calls nothing).
- A failed or expired render is never retried automatically. "Render again" is an explicit click that creates a new run
  with a new reservation (the same inputs are allowed once the previous run is no longer queued/running).
- Executor: no `retries`, one container at most, confirmed cancellation on timeout, fixed error codes only.

## GPU worker (`modal_app/comfy/avatar.py`, `execute_avatar` in `app.py`)

Validated configuration from #124: 1× H100, INT8, distilled 8 steps (`--mix_steps=4 --mix_alpha=1.0`), 480p, upstream
`run_demo_avatar_single_audio_to_video.py` @ `58eb336`, `--num_segments=N` with `--ref_img_index=10 --mask_frame_range=0`.
One verified one-line patch makes the script's hard-coded seed readable from the environment (`AVATAR_SEED`, default 42).

- **Can stop between requests:** `min_containers=0`, `max_containers=1`, `scaledown_window=60` s. Nothing runs when idle.
  Deliberate difference from MOSS/H3: not single-use, so a warm container may serve the next request of the same private
  gate within 60 s; every run uses a fresh private directory that is wiped afterwards (tested). Model load (~170 s) is still
  paid per request: keeping the model resident in memory is a later optimisation (measured on #124: it saves ~169 s of ~550 s,
  not the render itself).
- Isolation unchanged: no secrets, no network, no Modal access, read-only weights volume, no retries.
- Cold request estimate (from #124): ~170 s load + ~184 s render (3 segments) + start ≈ 6 to 8 minutes; the SQL deadline is
  15 minutes, broker timeout 720 s, collection window 660 s, executor timeout 720 s, render subprocess limit 540 s.
- Inputs are checked on the **CPU broker before any GPU**: audio decodes, 1 to 10 s (else `AUDIO_TOO_SHORT/LONG`,
  `INVALID_AUDIO`), image magic bytes and size; the executor decodes and re-encodes the portrait (real image, no metadata).

## Audio/video gap (≈ 0.4 s) on the Luz test

Measured on the delivered Luz clip (253 frames, 10.12 s video, 9.68 s audio stream, both streams start at 0):
- the gap is at the **end**, not a drift: speech ends at ~9.7 s and the video continues ~0.4 s;
- frames at 9.3 s (speaking, smile), 9.7 s (blink, mouth closing), 10.08 s (closed mouth, eyes open, neutral): the model
  uses the tail for a natural resting pause; motion energy falls to ~0.7 (vs 2 to 5 while speaking), it is not frozen;
- therefore the tail is **kept** (cutting at the last word would cut mid-closure) and the audio stream is padded with
  silence to the video length (`shift_audio(…, 0.0)`), so both streams end together (tested on a synthetic 10.12 s / 9.68 s clip).
- Not measured automatically: lip-sync offset at the start (Paul judged the Luz clip good). A cross-correlation of mouth
  opening vs audio envelope would be the next check if a drift is suspected.

## Database (`supabase/migrations/20261123_comfy_longcat_avatar.sql`, NOT applied)

Additive: runtime CHECK widened; `references` bucket MIME list + WAV/MP3; closed gate row (reserve 0.75 USD, 1 output);
new function `admit_comfy_avatar_run`; inactive `comfy:longcat-avatar` engine row. H3/MOSS functions untouched. Rollback in
the file header. Grants: function execute for `service_role` only, like the other admission functions.

## Environment and activation (owner approval at every step)

New flags (nothing is set by this PR): `COMFY_LONGCAT_ENABLED` (web), reuse `COMFY_DISPATCH_URL/SECRET`.
Modal: `modal deploy -m modal_app.comfy.app --env <isolated-env>` also (re)deploys H3/MOSS functions with the shared code;
`AVATAR_WEIGHTS_VOLUME` defaults to the #124 volume, read from `H3_SOURCE_ENVIRONMENT`.

## Staging procedure (to run once the blockers below are lifted)

1. Apply the migration to the **staging** Supabase project only; check policies and `comfy_runtime_gates` has the closed row.
2. Deploy the Modal app to an isolated environment with the staging broker secret; weights volume present.
3. Web (Preview with staging variables): `COMFY_LONGCAT_ENABLED=true`, dispatch URL/secret of the isolated app.
4. **Simulated render first** (no GPU): point `COMFY_DISPATCH_URL` at a simulator that claims the run, stores a small
   MP4 as `final` and finishes it (same RPCs as the broker); check: choose portrait + audio → render → status → play →
   download → reload → delete; a second click returns the same run; a failed run shows its message; delete refused while running.
5. Open the gate for one run (`licence_confirmed_at`, allowed admin, short `expires_at`, `remaining_runs=1`, `budget_usd=0.75`),
   run **one** real render (Luz portrait + Luz FR audio, 9.72 s → 10.12 s): record load/render times, VRAM, cost, tail check; close the gate.

## Coordination with Codex (shared files)

| Shared file | Codex work | Here |
|---|---|---|
| `components/studio/studio.tsx` | #119 Cinema edits header and wrapper | **untouched** (separate page) |
| sidebars (`components/admin/admin-sidebar.tsx`, `workspace/sidebar.tsx`) | #123 Parallax | **untouched**; no nav link yet |
| `supabase/migrations/` | #119 `20261122_cinema_m1.sql` | new file, later date, no object in common |
| `lib/studio/catalog.ts` | none | one entry added (pending, history title only) |
| `lib/comfy/templates.ts`, `executor-info.ts`, `runs/route.ts` | none | small additive branches |
| `modal_app/comfy/app.py`, `broker.py` | MOSS repairs (merged earlier) | additive branches; MOSS/H3 paths unchanged |
| `agent/*.md`, `HANDOVER.md` | #119/#123 | appended in distinct places |

Proposed after #119 and #123 are merged: a "Talking avatar" link next to Cinema in the Studio header / admin sidebar
(one line each). Not done here to avoid conflicts.

## Local rehearsal (real routes, real database, real broker, simulated GPU)

`tools/avatar-local/` (nothing is committed that holds a secret; `.env.local`, `supabase/config.toml` and `tmp/` stay ignored):

```bash
npx supabase@3.2.0 init   # then in supabase/config.toml: [db.migrations] enabled=false, [db.seed] enabled=false
npx supabase@3.2.0 start -x edge-runtime,logflare,vector,imgproxy,studio,mailpit,supavisor,realtime
node tools/avatar-local/setup.mjs            # replays the migrations, accounts, .env.local, opens the LOCAL gate for account A
node tools/avatar-local/dev.mjs --simulated  # dev server + HTTPS dispatcher; set AVATAR_SIM_PYTHON to a venv with modal==1.6.3, supabase, av, pillow
node tools/avatar-local/recipe.mjs           # 51 checks, exits non-zero on failure
```

The simulator replaces **only the GPU**: on dispatch it runs `modal_app/comfy/broker.py::run` (claim RPC, hash and path checks,
audio check, payload shape, finalisation, upload, finish RPC) with a synthetic 25 fps MP4 whose audio is shorter than its video.
Result on 2026-11-23 (PostgreSQL 17, Supabase local): **51/51 checks passed**, including:
- migration applied (59 files, only the 5 known historical failures); gate owned by A: B is refused;
- audio library: 9.72 s accepted, 0.4 s and 10.6 s refused, duplicate name refused, B sees none of A's files;
- ownership: another admin's portrait, path traversal, locked parameters refused before any reservation; missing audio reserves nothing;
- **duplicates**: same inputs with a new key, same key twice, a re-sent and a retried dispatch → one run, **one reservation (10/0 → 9/0.75)
  and exactly one GPU execution** (4 dispatch deliveries received, 3 refused by the SQL claim);
- a second, different render while one is active is refused; audio and run deletion refused while active; B cannot read, list or sign A's run;
- done run: one `final` MP4, 25 fps, 10.12 s, audio stream present and padded to the video length, job row `done`;
- GPU failure → `failed`, fixed code, no provider text, no asset, nothing left in storage; dispatch outage → saved run, `Retry dispatch`
  completes it once; a second retry on a finished run is refused;
- a 12 s MP3 passes the upload but the broker refuses it **before any GPU** (`AUDIO_TOO_LONG`).
Browser (in-app, local): sign-in, choose portrait + audio, render, status, video playback, no console error, no horizontal overflow at 375 px.

## Known defect found (pre-existing, shared with H3/MOSS)

Deleting a **finished** run answers HTTP 503 ("Could not clear the prompt from the job record"): `lib/comfy/delete-run.ts` sets
`jobs.prompt = null` but the column is `NOT NULL` (reproduced locally on an avatar run, previously noted on the staging schema).
It is not touched here (shared code, Studio deletion semantics, outside this scope). The avatar screen therefore shows no Delete
button for renders. Fix options for the owner: store `''` instead of `null`, or relax the column in a migration.

## What was verified (and what was not)

- Vitest (full suite), `tsc`, `next build` (the first build failed because a client component imported `node:crypto`; fixed and
  guarded by a test), ESLint (no warning from the new files); Python `unittest` for `test_avatar.py` (23 tests, ffmpeg + PIL) and the
  existing comfy suites green locally with `modal==1.6.3`.
- The JS and Python graph hashes agree on a shared fixture (accented prompt included).
- **Not verified**: the migration on the staging/prod database, the Modal image build and deploy, the executor on a GPU, the page
  against staging, the CI workflow (its test list does not include `test_avatar` yet, see `agent/review.md`).

## Staging status (2026-11-23, authorised by the owner)

**Done**
- Migration `20261123_comfy_longcat_avatar.sql` applied to the staging Supabase project `hhearpympdflxyfmszap` and nothing else
  (read-only checks first: staging already had H3, MOSS and Cinema M1; no Parallax migration exists; the only Cinema link to the
  comfy tables is the FK `cinema_takes.run_id -> comfy_runs(id)`, untouched by a wider CHECK). Result: runtime CHECK now accepts
  `longcat-avatar@1`; gate row closed (0 runs, 0 USD, reserve 0.75); `admit_comfy_avatar_run` executable by `service_role` only;
  `references` bucket accepts WAV/MP3; inactive engine row; H3/MOSS gates, the 5 existing runs and the 2 existing accounts unchanged.
- Modal: isolated environment `comfy-staging` and an empty volume `alphogenai-comfy-staging-models` created (the live pilot app
  `alphogenai-comfy` in environment `comfy-admin` is NOT touched: it holds the production broker secret).
- Hosted no-GPU mode added: `AVATAR_SIMULATE=no-gpu-staging-only` + `AVATAR_SIMULATE_SUPABASE_REF=hhearpympdflxyfmszap`; fails closed
  on any other database (6 tests).

**Vercel findings (read-only)**
- The MCP 403 on the variable list is a connector permission, not your role: the signed-in account is the team OWNER and the
  Vercel CLI (own credentials) lists variables fine. Missing: the Vercel MCP connection does not have the environment-variables
  read scope (re-authorise the Vercel connector with env access, or keep using the CLI).
- Branch-scoped Preview variables exist for `codex/parallax-*` and `feat/cinema-m1-persistence` (staging) but **not for
  `claude/longcat-avatar-integration`**: its Preview currently falls back to the generic Preview variables, which are the
  **production** Supabase. Do not sign in to the current Preview of this branch.
- Previews are SSO-protected (`all_except_custom_domains`).

**Owner-run step (keys never pass through Claude):** `tools/avatar-staging/prepare-staging-secrets.ps1` copies the staging
settings from the cinema branch (refuses to continue unless the URL is the staging project), creates the Modal secret
`alphogenai-comfy-broker` in `comfy-staging`, and adds the Preview variables for this branch only.

**Still needed from the owner**: (1) run that script; (2) the privately approved Modal region (`H3_MODAL_REGION`); then Claude
deploys the Modal staging app in simulated mode, sets `COMFY_DISPATCH_URL` (not a secret), redeploys the Preview, opens the
staging gate for a few simulated runs, validates the hosted flow, and closes the gate again.
