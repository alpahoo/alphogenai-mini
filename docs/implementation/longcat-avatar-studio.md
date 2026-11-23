# Talking avatar (LongCat-Video-Avatar 1.6) in the admin Studio

Task T-1171, branch `claude/longcat-avatar-integration`. Admin only, behind its own closed gate. Nothing here is applied,
deployed or run on a GPU: see "What was verified" and "Blockers".

**Dependency on PR #124** (`claude/longcat-avatar-modal-poc`, T-1170): runtime data only. The executor mounts the weights
volume `alphogenai-longcat-avatar-poc-weights` that #124's `--step weights` fills (47.3 GB, pinned revisions), and the
validated configuration and measurements come from #124. No file overlaps (`poc/longcat_avatar_modal/` stays in #124).
Either PR can merge first; the volume must exist before the executor is deployed.

## What the admin gets

`/admin/studio/avatar` (new page, no edit of `studio.tsx`):
1. choose a private **portrait** (the existing image library, `<user>/library/…`);
2. choose a private **audio** (new audio library, `<user>/audio-library/…`, WAV or MP3, 1 to 10 s, listen before choosing);
3. **Render avatar**; the screen shows queued / generating with elapsed time, errors in plain words (and whether a GPU was used);
4. play the MP4 privately (signed link), **download** it, delete it; the **Library** list shows every avatar render.

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

## What was verified (and what was not)

- Vitest (full suite) and `tsc`, `eslint` on the new code: see the PR; Python `unittest` for `test_avatar.py` (23 tests,
  with ffmpeg and PIL) and the existing comfy suites (36 tests) green locally with `modal==1.6.3`.
- The JS and Python graph hashes agree on a shared fixture (accented prompt included).
- **Not verified**: the migration on a real database, the Modal image build and deploy, the executor on a GPU, the page in a
  browser against real APIs, the CI workflow (its test list does not include `test_avatar` yet, see `agent/review.md`).
