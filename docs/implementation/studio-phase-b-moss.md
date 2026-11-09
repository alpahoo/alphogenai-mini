# Creative Studio V1: phase B (MOSS-Image text to image, admin only)

Stacked on phase A (PR #94). Nothing here is applied, deployed, downloaded or run on a GPU.
MOSS stays unusable until the owner confirms the licence and opens its own server gate.

## Delivered

**Template**
- `workflows/comfy/templates/moss-image/graph.t2i.api.json`: core-node API graph derived from the official
  ComfyUI template (provenance, commit and SHA-256 in `SOURCE.md`). Defaults kept: 25 steps, CFG 2.5, er_sde,
  simple, 1 MP. No custom node.
- `manifest.json`: prompt and format in Simple; negative prompt, seed, steps (10–50), CFG (1–6), sampler
  (4 core samplers) and scheduler (4) in Advanced. Model files, denoise and batch size are locked.
- Deliberate differences from the official template (to confirm in the first authorized test): no LLM prompt
  enhancement; int8 text encoder instead of GPTQ w4a8; skip-layer guidance off (template default).

**Runtime `moss-image@1`** (`workflows/comfy/runtimes/moss-image@1.json`)
- Three files pinned to `Comfy-Org/MOSS-Image` revision `2929efe3…`, size + SHA-256, all Apache-2.0:
  SFT int8 (5.41 GB), Qwen3.5-9B int8 encoder (9.75 GB), FLUX.2 small decoder VAE (0.25 GB, identical to
  `black-forest-labs/FLUX.2-small-decoder`). Excluded with reasons: full VAE, control LoRA, edit LoRA,
  "abliterated" encoder.
- ComfyUI stays pinned at v0.42.0, which already ships every MOSS node used.

**Modal** (`modal_app/comfy/`)
- `execute_image_graph`: L40S, no secrets, `block_network`, restricted Modal access, single-use container,
  max one container, read-only verified volume, 300 s timeout, never receives an image input.
- Executor and stream are runtime-aware (output node, catalog, marker, PNG signature, per-runtime deadline).
  The H3 code path keeps the same values and its stream frames are byte-identical (tested).
- Broker: checks the stored runtime, refuses references for MOSS, validates the PNG signature and that its
  IHDR dimensions equal the frozen graph's latent size, stores `raw.png` privately (`image/png`).
- `prepare_moss_models` (CPU, explicit, owner-approved only): downloads each catalogued file from Hugging Face at
  the pinned revision into a `.partial` file, verifies size and SHA-256, then moves it into place; refuses
  non-Apache entries and custom nodes; writes the verification marker only when every file matches.

**Database** (`supabase/migrations/20261109_comfy_moss_image.sql`, not applied)
- `comfy_runtime_gates`: one closed row for `moss-image@1` (no user, no licence date, no runs, no budget,
  reserve $0.20, one expected output). Service-role only.
- `admit_comfy_runtime_run`: same guarantees as the H3 pilot (per-user lock, idempotency, shared gate row
  lock, licence + owner + expiry + budget checks, single active job, plan quota, reservation kept).
- `claim_comfy_admin_run` / `finish_comfy_admin_run` replaced with identical H3 branches (same messages);
  MOSS checks its own gate and expects one output. `comfy_runs.runtime` accepts the new value; the private
  bucket also accepts `image/png`; inactive `comfy:moss-image` registry entry.
- Rollback: delete MOSS rows, restore the two functions from `20261108_comfy_admin_h3.sql`, restore the
  runtime CHECK to `h3-video@1`, bucket MIME list to `video/mp4`, drop `admit_comfy_runtime_run` and
  `comfy_runtime_gates`, delete the `comfy:moss-image` engine row.

**API**
- `POST /api/admin/comfy/runs` takes an optional `template` (default `minimax-h3`, unchanged path). MOSS needs
  `COMFY_MOSS_ENABLED=true` (separate from `COMFY_ADMIN_ENABLED`) and goes through `admit_comfy_runtime_run`.
- `GET /api/admin/comfy/runs?template=moss-image` reads the MOSS gate (licence state included).
- Media route: PNG signed download with a server-built name; `?format=jpeg|webp` converts on the server with
  sharp (stored original never modified, 40 MB cap, no-store).

**Studio**
- MOSS selectable under Image with a "Validation pending" badge until the licence is confirmed in the gate.
- Aspect tiles with true proportions, image viewer, side-by-side comparison of two runs (with seed/steps/CFG),
  downloads PNG/JPEG/WebP + settings JSON, image thumbnails in history, model switches when opening a run.
- Text widgets (negative prompt) and long option lists render correctly in Advanced.

## Activation (owner approval at every step)

1. Confirm the MOSS licence position for ASTUCA OÜ (Apache-2.0 files listed above; exclusions unchanged).
2. Apply the migration. Check policies in the real project.
3. Approve the CPU preparation: `modal run -m modal_app.comfy.app::prepare_moss_models` in the isolated
   environment (≈15.4 GB download into `alphogenai-comfy-models`).
4. Redeploy `alphogenai-comfy` (CPU deploy; it also redeploys the H3 functions with the shared code above).
5. Deploy web with `COMFY_MOSS_ENABLED=false`, then open the gate for one image: `licence_confirmed_at`,
   allowed admin UUID, short `expires_at`, `remaining_runs=1`, `budget_usd=0.20`, and set the flag to true.
6. One 1:1 image with default settings. Record actual Modal usage, then close the gate.

## Costs (estimates, not authorizations)

- Preparation: CPU download, about $0.01–0.05. Volume storage 15.4 GB at $0.09/GB-month ≈ $1.39/month
  (Modal advertises a free allowance; not assumed).
- One image on L40S: GPU $0.000542/s + 2 cores + 32 GiB ≈ $0.00064/s. Cold start, ComfyUI start, model load
  (~15 GB) and 25 steps: about 60–120 s → **$0.04–0.08**. The $0.20 reserve covers the 300 s hard timeout.
- Not measured yet: L40S compatibility of the int8 checkpoints is expected (same loader as H3) but unverified;
  fallback is H100 at about twice the GPU price.

## Tests

- Vitest: MOSS binding (declared inputs only, defaults, bounds, unknown keys, references refused), routing,
  admission route (own flag, own gate, never the H3 function), readiness, media conversion, Studio helpers.
- `tools/test-comfy-moss-admission.mjs` (local PostgreSQL): closed gate, licence gate, owner only,
  template/runtime match, idempotency, active job, reserve, one-output finish, claim fencing, H3 unchanged,
  service-only grants.
- `modal_app/comfy/test_moss_runtime.py`: core-node graph = catalog files, pinned Apache catalog, PNG stream
  round trip with H3 header unchanged, dimension check, broker routing, download hash/partial/licence,
  executor isolation flags.
