# AlphoGen MCP — spec (T-901a)

> **Status: spec-only.** No runtime code, no route/API, no DB/migration, no secret
> touched by this document. It defines what an AlphoGen MCP server is, how it stays
> safe, and a phased tool plan. Source of truth: [`HANDOVER.md`](../../HANDOVER.md).
> Coordination: [`AGENTS.md`](../../AGENTS.md). Date: 2026-06-09.

## 1. Goal

Expose AlphoGen as a small, secured **MCP tool server** so agents (Claude Code,
Codex, ChatGPT) can **prepare, preview, launch, monitor and audit** video
generations cleanly — instead of bricolage via browser, copy-pasted prompts, or
direct DB pokes.

Hard principle (non-negotiable): the MCP is a **thin client over AlphoGen's internal
HTTP API**. It NEVER talks to Supabase, R2, Modal, or providers directly. All
auth/plan/quota/content-policy/ownership/provider-confidentiality already live in
`POST /api/jobs` and friends — the MCP must reuse them, not re-implement them.

```
Agent (Claude Code / Codex / ChatGPT)
        │  MCP tool call
        ▼
mcp-alphogen (separate server)
        │  HTTPS + scoped key
        ▼
AlphoGen internal API  (/api/...  + future /api/mcp/*)
        │
        ▼
Supabase / R2 / Modal / providers   ← only the API touches these
```

## 2. Use cases

- **Dev QA (Claude Code / Codex)** — the highest-value, lowest-risk first use.
  Solves a gap we actually hit: authenticated functional QA is currently hard
  (browser plugin KO, Playwright blocked at login). With a **test-account key** an
  agent can: smoke-test a real route after a change, compare "what the UI sends" vs
  "what the API receives", read a job's payload/scenes/errors without exposing
  secrets.
- **ChatGPT "director agent"** — the premium product angle: ChatGPT builds a
  concept, previews the payload, launches on the user's account, watches the job,
  proposes a variation. Higher stakes (real account, real spend) → needs the robust
  auth model below.
- **Preview a payload before generating** — "here is exactly what would go to
  `/api/jobs`" (reuses `validateReferences` + the documented job/UGC contracts).
- **Generate a Director plan** — pure, no side effect (reuses `buildUGCDirectorPlan`
  / `computeDirectorQuality`).
- **Track jobs** — status, scenes, errors, costs, exports (read-only).

## 3. Architecture

- **Separate MCP server** (`mcp-alphogen/`), decoupled from the Next.js app:
  ```
  mcp-alphogen/
    server.ts
    tools/{get_job,list_recent_jobs,validate_job_payload,create_director_plan,create_ugc_plan,...}.ts
  ```
- **`/api/mcp/*` namespace on AlphoGen (added later, its own task).** A dedicated
  surface with its own auth + rate limiting that then **reuses** the existing routes
  / handlers internally. Keeps the public session-based API and the machine API
  cleanly separated.
- **Auth = scoped per-user key (PAT), never the service role.** Today the API
  authenticates via the Supabase **session JWT** (`auth.getUser()` from cookies). A
  machine-to-machine MCP needs a header key that **resolves to a single user** and
  acts strictly as that user (same plan/quota/ownership). Recommended: per-user
  **Personal Access Tokens** (hashed at rest, revocable, scoped to a permission set),
  resolved by `/api/mcp/*` to the owning `user_id`. **The service-role key is never
  given to the MCP.**
- **Config (no secrets in repo):**
  ```
  ALPHOGEN_BASE_URL=https://alphogen.com
  ALPHOGEN_MCP_API_KEY=<per-user PAT, provided at MCP runtime>
  ```

## 4. V1 tools — read-only / no-cost (safe first)

These never spend money and never mutate generation state. They are the right
place to prove the auth + confidentiality boundary.

| Tool | Reuses | Notes |
|---|---|---|
| `get_job(job_id)` | `GET /api/jobs/[id]` (owner-scoped) | status, scenes, errors, exports — provider-clean. |
| `list_recent_jobs({limit})` | jobs read (own, capped) | dashboard-style listing for the calling user. |
| `validate_job_payload(payload)` | `lib/validate-references` + job/UGC contracts | "what would be sent / accepted", **no insert**. Pure. |
| `create_director_plan({prompt,duration,scenes,...})` | `lib/director-quality` (+ storyboard helpers) | returns editable scenes + quality read-out. Pure. |
| `create_ugc_plan({product,outfit,creator,platform,angle})` | `lib/ugc-director.buildUGCDirectorPlan` + `lib/ugc-social-pack` | returns global prompt, scenes, aspect ratio, Social Pack. Pure. |

## 5. V2 tools — side-effect (gated, after V1 proven)

| Tool | Reuses | Consequence | Guard |
|---|---|---|---|
| `create_video(payload)` | `POST /api/jobs` | **spends provider tokens / quota** | plan/quota gate + **preview-first** (must pass `validate_job_payload`) + explicit confirmation/intent. Sequenced LAST. |
| `use_as_reference(job_id)` | `POST /api/jobs/[id]/reference-image` | copies a still into the private `references` bucket | owner-only; image-only per existing contract. |
| `duplicate_job(job_id)` | `POST /api/jobs/[id]/duplicate` | creates a new job (spends) | reuses `lib/job-duplicate-payload`; avatar/look stays 409. |
| `export_social_pack(job_id)` | export-social / thumbnail / metadata routes | publishes/exports | plan + social-connection gates; publish is a confirmed action. |

> Cost-incurring tools (`create_video`, `duplicate_job`) are treated like
> destructive actions: never fire silently, always quota-checked, always after a
> preview/confirmation.

## 6. Security rules

- **Provider/aggregator names NEVER exposed.** MCP responses use model/capability
  names only (`cleanModelName` / `getEngineDisplayName`), never raw engine keys
  (`*_byteplus`) or provider names. The existing provider-leak guard culture extends
  to the MCP output layer.
- **Reuse, don't re-implement, the gates.** Plan gate, daily quota, content-policy
  pre-screen, references ownership, active-generation limit — all already enforced in
  `POST /api/jobs`. The MCP must go through these, not around them.
- **Ownership scoping.** Every tool acts as the PAT's user; no cross-user reads
  (RLS + code checks; we just hardened jobs RLS to owner-scoped in R-018b/c).
- **Audit + logs.** Structured JSON logs on every `/api/mcp/*` call (tool, user,
  outcome) — no secrets, no decrypted tokens, no provider names.
- **Rate limit** on `/api/mcp/*` (per PAT) to prevent abuse / runaway spend.
- **Cost-incurring & destructive actions** are preview-first and/or confirmed; no
  silent spend, no hard deletes via MCP in V1/V2.
- **No secrets to the MCP.** It holds only `ALPHOGEN_BASE_URL` + a per-user PAT.
  Provider keys, service-role key, Stripe, Modal secrets stay server-side.

## 7. Recommended phasing

| Task | Scope | Risk |
|---|---|---|
| **T-901a** | This spec (docs-only). | none |
| **T-901b** | `/api/mcp` **auth design** (PAT issuance/hashing/revocation/scoping, rate limit, audit) — design doc + decision, then implementation behind review. | medium (new auth surface) |
| **T-901c** | Read-only tools (`get_job`, `list_recent_jobs`) on a **test account**; proves the boundary. | low |
| **T-901d** | Pure plan/validate tools (`validate_job_payload`, `create_director_plan`, `create_ugc_plan`). | low (reuse pure helpers) |
| **T-901e** | `create_video` **behind explicit confirmation** + quota + preview-first; then `use_as_reference`/`duplicate_job`/`export_social_pack`. | medium (spends money) |

Start with the **dev-tooling MCP** (test account, read-only + preview) before the
product-facing "director agent" path.

## 8. Non-goals

- **No direct Supabase access** from the MCP (no SQL, no service-role, no RLS bypass).
- **No secrets** in the MCP beyond a per-user PAT (no provider/Stripe/Modal/service keys).
- **No new generation pipeline / state machine.** The MCP only calls existing routes.
- **No provider/aggregator names** in any MCP output.
- **No over-promising** — same V1 honesty as `ugc-generation-contract.md` (no
  guaranteed exact try-on, product geometry, or native imported-voice lip-sync).
- **No silent spend** — cost-incurring tools are preview-first/confirmed.

## Acceptance criteria

- A future agent can implement the MCP without ever touching Supabase or secrets.
- Every tool maps to an existing (or clearly-scoped future) AlphoGen route.
- The auth model (PAT → user) is specified before any `/api/mcp/*` code (T-901b).
- Read-only/preview tools ship and are proven before any cost-incurring tool.
- Public wording / outputs stay provider-neutral and honest.
