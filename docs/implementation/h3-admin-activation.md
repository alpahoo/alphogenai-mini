# MiniMax H3: first private admin generation

Implementation slice based on PR #89 (`86780d5`), stacked on the API privacy fix PR #90.
No deployment, migration application, model preparation, authorization or GPU execution is performed by this PR.

## Delivered path

Sign in as an existing administrator → Admin → MiniMax H3 (`/admin/workflows/minimax-h3`).
Enter prompt, duration, aspect, optional seed, turbo/full quality and audio advance (default 0.4 seconds).
An optional first frame uses the existing private `references` upload. Image + full is explicitly unsupported.
The form is manifest-driven; the server selects one of three complete lab API graphs and binds values only.
ComfyUI does all semantic graph validation and execution. No node engine is implemented here.

The admin page polls a durable run, survives reload via `?run=<id>`, and offers separate private links for the
untouched original MP4 and audio-corrected MP4. No intermediate visual previews. No public publication.
The original is always preserved; audio correction remuxes the original video packets without re-encoding video.

The existing `jobs` table remains the parent, with plan/quota checks. Media URLs are **never** written into
legacy `jobs.video_url` or `output_url_final`. Private evaluation media is accessible only to its owning admin.
The normal library/result UI, Studio, public moderation, e-mails, MOSS and customer routing are later slices.
This is not a claim that the complete architecture in PR #89 has already been implemented.

## Security and deployment boundaries

- PR #90 fixes GET job API access; it does not fix historical public R2 URLs or `/v` publication.
- H3 adds a separate private output bucket with a restrictive browser-deny policy, even in the presence of
  unrelated permissive storage policies. Run graphs, keys, assets and execution permits are service-only.
- The media route requires both admin identity and ownership, a completed run and no withdrawal; it issues a
  ten-minute signed URL. Copying or downloading that URL remains possible until expiry.
- `/v` explicitly refuses `comfy:*` jobs. H3 has no publishing endpoint; customer engines are unchanged.
- Executor: no secrets, network blocked, restricted Modal access, read-only verified model volume, one-use
  container, one concurrent container, no retries. The CPU broker owns Supabase/storage credentials.
- The SQL gate starts disabled, without an allowed user, rights confirmation, budget or execution permits.
- An atomic shared gate lock consumes one permit and reserves $0.75, including on failure. Never automatically
  refund or re-arm it. The reserve remains committed pending invoice reconciliation; generation time is not an
  asserted total billed cost. A duplicate dispatch cannot claim a run twice.
- The single active-job check is atomic between H3 admissions. Historical creators do not take this new lock;
  cross-family simultaneous submission is still the Q7 limitation from PR #89. Do not impose a new global
  index on existing pipelines in this admin slice.
- Lost executions expire when their status is next read after fifteen minutes. Executor time is independently
  bounded by startup/execution timeouts; there is no recurring paid scheduler added by this PR.
- The new branch is `codex/h3-admin`, outside the existing Modal deployment branches. The legacy Modal workflow
  excludes `modal_app/comfy/**`; Vercel auto-deployment is disabled for this exact review branch only.

## Activation sequence — owner approval required

1. Review and approve PR #90, then this code PR. They are not merged by the agent.
2. Confirm H3 rights privately for ASTUCA OÜ, the intended admin use, users' territories and the exact compute
   region. Do not put the authorization document or its terms in GitHub. Keep public access disabled.
3. Approve applying `supabase/migrations/20261108_comfy_admin_h3.sql`. It creates only additive pilot tables,
   functions and a private bucket, plus the additive engine type/coming-soon registry entry. Check policies in
   the actual project. The legacy historical media exposure remains a separate security task.
4. Prepare an isolated Modal environment with sufficient remaining workspace budget (or separate workspace if
   needed); never lower the production workspace limit. Install `modal==1.6.3` in an isolated local Python env.
   Set local deployment variables `H3_MODAL_REGION` to the approved region and `H3_SOURCE_ENVIRONMENT` to the
   environment containing `h3-lab-models`. Create the dedicated `alphogenai-comfy-models` volume in the target env.
   Cross-workspace source volumes need a separately approved transfer; the copy helper supports environments
   within one workspace. Nothing modifies the lab volume.
5. Create a dedicated Modal secret `alphogenai-comfy-broker` with `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and
   `COMFY_DISPATCH_SECRET`. Do not attach it to the GPU function. No existing production secret is reused.
6. Approve the **CPU-only** image build/deployment and model preparation. From repo root, with the target env
   selected in the Modal profile, deploy `modal deploy -m modal_app.comfy.app`. Explicitly run
   `modal run -m modal_app.comfy.app::prepare_models` once. This hashes the five lab files against the pinned
   catalog and copies them to the new volume. Missing/mismatched files fail closed; nothing downloads on GPU.
7. Deploy the web code only after approval, initially with `COMFY_ADMIN_ENABLED=false`. Set server-only
   `COMFY_DISPATCH_URL` to the new dispatch endpoint and matching `COMFY_DISPATCH_SECRET`. Existing
   `NEXT_PUBLIC_ADMIN_EMAILS` must include the owner's verified account. Keep existing provider settings intact.
8. After explicit approval of **one GPU test**, enable the pilot for that exact admin UUID, set
   `rights_confirmed_at`, a short `expires_at`, `remaining_runs=1`, `budget_usd=0.75`, `committed_usd=0` in the
   service-only gate. Enable `COMFY_ADMIN_ENABLED=true` in the approved web environment. No browser/API creates
   or replenishes these permits. Do not reset the budget counter to repeat a failed test without fresh approval.
9. Use the real UI for exactly one 5-second, 480×832, turbo-v4 generation. Confirm audio/video playback, the two
   private files and the audio advance. Record actual Modal billed usage. No exploratory GPU batches.
10. Disable the gate after the test, reconcile the reserve, and retain the original for comparison. Public release
    requires the later moderation, reporting, terms and publication gates from PR #89.

## Cost estimate and acceptance

At published rates: H100 $0.001097/s, 2 physical CPU cores $0.0000262/s, 64 GiB $0.00014208/s.
For a 5s clip, lab generation ≈50s + ComfyUI startup ≈13s + unmeasured container setup allowance ≈20s:
about **$0.105** for the GPU container before broker/build/storage/egress. It is single-use, with no deliberate
60s warm window. Budget **$0.15–$0.30 expected per single test**, reserve **$0.75** for failure/timeout margin.
CPU build + hash/copy is separate, estimated **$0.05–$0.25**, depending on throughput. Storage and egress depend
on the actual account allowance; do not assume zero. These are estimates, not measurements or an invoice cap.
The GPU timeout limits compute, but provider overhead/other workspace activity needs the independent Modal
budget guard. The combined proposed $1 allowance stays inside the previously discussed $3 overall test budget.

Free acceptance checks: full Vitest suite; TypeScript; production build; local embedded PostgreSQL migration,
permit/idempotency/claim/terminal/RLS checks; real synthetic ffmpeg audio shift and unchanged video packets;
local Modal definition import without authentication, deployment or invocation. Native ComfyUI with these models,
Modal argument transfer under blocked networking, actual region capacity and storage on the target account are
not certified until the approved deployment and single end-to-end run.

## Authorized activation — 8 November 2026

- PRs #90 and #91 were merged with owner approval; the web deployment is ready.
- Migration applied to the existing AlphoGenAI project. The private output bucket and anonymous access denials
  were verified online. This still does not resolve historical R2/public-page exposure.
- Dedicated Modal environment `comfy-admin`, app `alphogenai-comfy`, region `eu`. Five lab model files were
  hashed and copied; the verification marker matches the pinned catalog. No source model was modified.
- One UI request was admitted: five seconds, 480×832, turbo, seed 42, audio advance 0.4 seconds.
  It failed during result delivery: the restricted executor could not call Modal's BlobCreate API for a large
  serialized return value (`AuthError`, HTTP 401). No usable output was delivered or retained in the app.
- The permit is consumed, the gate is disabled, and no H3 containers remain active. The $0.75 reservation remains
  committed pending billing reconciliation. Do not re-arm automatically or infer invoice cost from runtime.
- PR #92 preserves the deployment environment during container import and replaces the large return value with
  bounded native Modal generator frames. Hash, byte-count and size checks reject incomplete or corrupt streams;
  the broker retains a cancellation handle and explicitly terminates the executor. Network blocking, no secrets,
  restricted Modal access, read-only models and single-use containers remain enabled.
- Six local CPU tests pass, including the actual Modal SDK streaming output path with Blob access forbidden,
  a >3 MiB round-trip, corrupt/truncated output rejection, and real audio/video packet preservation. This is a
  free local transport check, not proof of a successful remote GPU generation. A second GPU attempt requires
  fresh explicit owner approval; expected test cost remains $0.15–$0.30, with a $0.75 reservation.

## Second authorized test — 9 November 2026 (Europe/Paris)

- Owner approved merging PR #92 and exactly one additional GPU test. PR #92 merged at `97aa16f`.
- The existing $0.75 commitment was preserved; the total pilot budget was raised to $1.50 and one permit added.
- The second UI request used the same five-second vertical turbo configuration, seed 42 and 0.4-second audio
  advance. Run `fefcfbb0-3bb0-4d58-9d7d-db221b6a69fc` failed before its executor ID could be stored; no media
  was delivered. The pilot was closed immediately; no third GPU invocation was authorized or launched.
- Root cause reproduced locally with Modal 1.6.3: `FunctionCall.from_id(...)` returns an unhydrated handle;
  reading its `object_id` raises `AttributeError`. The broker now stores the ID from the executor's header
  directly, retaining the lazy handle for explicit cancellation.
- Seven free CPU tests pass. The added regression exercises the complete broker callback with a real lazy SDK
  handle, synthetic >3 MiB output and explicit container termination, without remote invocation. It catches the
  second failure that the previous stream serialization tests did not cover.
- Both $0.75 reservations remain committed pending actual billing reconciliation. A third GPU test requires
  fresh approval. Successful remote transfer, private downloads and playback are still unverified.
