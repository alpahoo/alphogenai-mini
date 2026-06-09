# Saved Looks Spec

Date: 2026-06-09  
Status: Product spec, no runtime change

## Goal

Saved Looks should let a user turn a successful generation into a reusable visual identity:

- same person or avatar,
- same framing / lighting / wardrobe / background language,
- new script or prompt,
- fast reuse from Create, Library, and Job pages.

The user-facing promise is: **create the look once, direct new videos with it later**.

## Existing Building Blocks

- `app/api/looks/route.ts` already exposes basic look list/create behavior.
- Job page already has a guarded **Save as Look** action where supported.
- Create flow already accepts structured references and `look_id`-style reuse paths in `POST /api/jobs`.
- Library now exposes assets that can be used as references.

## V1 UX

### Save

Entry points:

- completed job action bar: `Save as Look`;
- Library asset card: future `Save Look` action;
- Avatar/look job pages only where reconstruction is supported.

Save modal fields:

- look name,
- optional description,
- thumbnail preview,
- source job,
- public model name, provider-neutral,
- capabilities: `image reference`, `avatar`, `voice`, `social-ready`.

### Reuse

Entry points:

- Create flow: `Saved Looks` section near Assets;
- Library: `Looks` tab once the collection exists;
- Job page: `Create from this look`.

Reuse behavior:

- choose a look;
- write a new prompt/script;
- preserve the look's reusable ingredients;
- generate through the same central `POST /api/jobs` path.

## Data Contract

The existing `looks` API should be audited before migration work. If a new schema is needed, use an additive migration only.

Candidate table shape:

```sql
saved_looks (
  id uuid primary key,
  user_id uuid not null,
  source_job_id uuid,
  name text not null,
  description text,
  thumbnail_url text,
  video_url text,
  reference_payload jsonb,
  avatar_payload jsonb,
  voice_payload jsonb,
  engine_key text,
  capabilities text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
)
```

RLS:

- users can select/insert/update/delete only their own looks;
- service role can manage all for server-side jobs.

## Non-Goals V1

- No public marketplace of looks.
- No cross-user sharing.
- No automatic training.
- No provider names in public UI.
- No migration until the existing `looks` route/table has been audited.

## Risks

- Avatar/look duplicate is currently blocked for a reason: source jobs do not yet guarantee a faithful generic reconstruction contract.
- Looks that rely on provider-specific IDs must stay hidden behind provider-neutral labels.
- Voice reuse must not silently attach a cloned voice without explicit user intent.

## Implementation Slices

1. **T-401a Audit existing looks route/schema**: read-only, document exact current DB/API contract.
2. **T-401b UI surface**: Saved Looks panel in Create, read-only list from existing API if safe.
3. **T-401c Save/reuse contract**: helper to build `POST /api/jobs` payload from a saved look.
4. **T-401d Migration**: only if audit proves current schema is insufficient.
5. **T-401e Tests**: helper tests + route tests with Supabase mocked.
