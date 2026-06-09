# AlphoGen MCP — `/api/mcp` auth design (T-901b)

> **Status: design doc, docs-only.** No runtime code, no route, no DB/migration, no
> secret. Specifies the machine-to-machine auth for the MCP surface so it can be
> implemented later behind review (the DB table is a future migration → Paul's go,
> R-003 process). Parent spec: [`alphogen-mcp-spec.md`](./alphogen-mcp-spec.md).
> Date: 2026-06-09.

## 0. Problem

Today AlphoGen authenticates via the **Supabase session JWT** (`createClient()` →
`auth.getUser()` from cookies). An MCP server has no cookie/session — it needs a
**header credential that resolves to exactly one user** and acts strictly as that
user (same plan/quota/ownership). We must add this **without** exposing the
service-role key or bypassing the gates we just hardened (R-018).

Decision: **per-user Personal Access Tokens (PATs)**, custom table, hashed at rest,
resolved by a dedicated `/api/mcp/*` layer that then reuses the existing gates.

## 1. Token model

**Format (shown once, never stored in clear):**
```
agk_<token_id>_<secret>
        │          └ 32+ bytes random (base62) — the only secret part
        └ short public id (e.g. 12 base62 chars) — indexed, NOT secret
```
- `token_id` enables O(1) lookup without scanning.
- `secret` is verified against a stored **hash** (one-way). PATs are NOT encrypted
  with `lib/encryption.ts` (that's for secrets we must *decrypt*, e.g. OAuth tokens);
  a PAT only needs verification → store a hash.

**Hashing:** `secret_hash = HMAC_SHA256(server_pepper, secret)` where `server_pepper`
is a new server-only env (`MCP_TOKEN_PEPPER`, never in repo). HMAC+pepper means a DB
dump alone can't brute-force tokens. (SHA-256 alone is acceptable given 32 bytes of
entropy, but pepper is cheap defence-in-depth.)

## 2. Storage (future migration — NOT created here)

Proposed table `public.mcp_tokens` (RLS **enabled**; only the owner via
`auth.uid()=user_id`, service-role for the resolver):
```
id            uuid pk default gen_random_uuid()
user_id       uuid not null references auth.users(id) on delete cascade
token_id      text not null unique          -- public lookup id
secret_hash   text not null                 -- HMAC-SHA256(pepper, secret)
name          text                          -- user label ("Claude Code dev")
scopes        text[] not null default '{read}'  -- see §4
created_at    timestamptz not null default now()
last_used_at  timestamptz
expires_at    timestamptz                   -- optional TTL
revoked_at    timestamptz                   -- soft revoke
```
- RLS: `select/insert/delete` own (so a user manages their own tokens from the app);
  the resolver uses the service role server-side only.
- This migration follows the R-003 process (additive, idempotent, Paul's go) when
  T-901c/d need it. Not part of this doc.

## 3. Request → user resolution flow (`/api/mcp/*`)

```
1. Read header: Authorization: Bearer agk_<token_id>_<secret>
   (reject if missing/malformed → 401)
2. Split → token_id, secret.
3. Service-role lookup mcp_tokens by token_id (indexed).
4. Reject if: not found · revoked_at set · expires_at past
   · HMAC(pepper, secret) !== secret_hash   → 401 (generic, no detail).
5. Resolve user_id. Best-effort update last_used_at (async, non-blocking).
6. Enforce the token's scopes for the requested tool (§4) → 403 if not allowed.
7. Build a per-request "actor" = { userId, scopes }. Every downstream query is
   scoped to userId (ownership), exactly like a logged-in user.
```
- The resolver is the **only** place the service role appears, and only to read
  `mcp_tokens` + act on the resolved user's own rows. **The service-role key is never
  handed to the MCP server itself.**

## 4. Scopes (least privilege)

| Scope | Grants | Tools |
|---|---|---|
| `read` | read own jobs/scenes/exports | `get_job`, `list_recent_jobs` |
| `plan` | run pure planners/validators (no side effect) | `validate_job_payload`, `create_director_plan`, `create_ugc_plan` |
| `generate` | **create jobs (spends quota/money)** | `create_video`, `duplicate_job` |
| `export` | publish/export to social | `export_social_pack` |
| `assets` | turn a job into a reference | `use_as_reference` |

- Default new token = `{read, plan}` (no spend). `generate`/`export` are opt-in,
  shown clearly when minting.

## 5. Reusing the existing gates (do NOT re-implement)

`/api/mcp/*` must funnel through the same enforcement as the session API:
- **Plan gate + daily quota + active-generation limit** — same checks as
  `POST /api/jobs` (resolve plan from `profiles`, never trust input).
- **Content policy** — `lib/content-policy.screenPrompt` pre-screen.
- **References validation** — `lib/validate-references.validateReferences`.
- **Provider confidentiality** — responses via `cleanModelName` /
  `getEngineDisplayName`; never raw engine keys or provider names.

Implementation guidance: extract the `POST /api/jobs` gate sequence into a shared,
user-parameterized helper (e.g. `lib/jobs/guard.ts: assertCanCreateJob(userId, payload)`)
that both the session route and the MCP route call — so there's exactly one source of
truth and no drift. (That refactor is its own small task, with tests.)

## 6. Rate limiting & abuse control

- Per-token rate limit on `/api/mcp/*` (e.g. token bucket; stricter on `generate`).
- `generate` additionally bounded by the existing **daily quota** per plan (already
  enforced) — the rate limit is a second line, not the primary spend control.
- Optional per-token monthly spend cap (future).

## 7. Audit logging

Structured JSON per call (reuse the existing logging pattern):
```jsonc
{ "level":"info", "service":"mcp", "event":"tool.call",
  "tool":"create_video", "token_id":"...", "user_id":"...",
  "outcome":"ok|denied|error", "ts":"..." }
```
- **Never** log: the secret, provider keys, decrypted tokens, provider names.
- Denials (bad token, scope, quota) are logged with a reason code.

## 8. Cost-incurring & destructive actions

- `generate` tools are **preview-first**: a client should call `validate_job_payload`
  (scope `plan`) before `create_video` (scope `generate`); the tool description makes
  this explicit and the MCP server can enforce "confirm" semantics.
- No hard deletes via MCP in V1/V2. `duplicate_job` keeps the avatar/look 409.
- All spend is quota-gated and audited; no silent spend.

## 9. Token lifecycle (UI, later)

- Mint in the app (Settings → API tokens): name + scopes → **secret shown once**.
- List tokens (id, name, scopes, last used) — never the secret.
- Revoke (sets `revoked_at`); optional `expires_at`.
- All via owner-scoped RLS on `mcp_tokens`.

## 10. Security checklist (acceptance for T-901b → implementation)

- [ ] Service-role used ONLY inside the resolver; never exposed to the MCP server.
- [ ] PAT hashed (HMAC+pepper) at rest; plaintext shown once; revocable; optional TTL.
- [ ] `mcp_tokens` has RLS (owner-scoped) + a future additive migration (Paul's go).
- [ ] Every tool path enforces ownership + the shared gate helper (plan/quota/policy).
- [ ] Provider names never appear in MCP output (guard-test extended).
- [ ] Rate limit + audit logs on `/api/mcp/*`; no secret/provider in logs.
- [ ] `generate`/`export`/`assets` are opt-in scopes; default token is read+plan.

## 11. Non-goals (this doc)

- No implementation, no route, no migration, no secret created here.
- No new provider integration; no RLS bypass; no service-role to the MCP server.
- No bespoke crypto — HMAC-SHA256 (Node `crypto`) only; no external lib.
