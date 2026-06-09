# Saved Looks Supabase Audit

Date: 2026-06-09
Status: Live schema audit blocked by Supabase access

## Scope

Audit the live `cinematic_looks` table before any migration or extension.

This document is read-only. No database migration, DDL, data write, or production operation was performed.

## Result

The live Supabase audit could not be completed from this Codex session:

- `list_tables` via Supabase MCP returned an access-control error.
- `execute_sql` via Supabase MCP returned the same access-control error.
- Local `.env.local` contains only public Supabase keys plus R2 variables; it does not contain a service-role key or a Postgres connection URL.

Because of that, the exact live columns, indexes, triggers, grants, RLS state, and policies for `cinematic_looks` remain unverified.

## Local Evidence

Runtime code uses `cinematic_looks` in:

- `app/api/looks/route.ts`
- `app/api/jobs/route.ts`
- `app/(workspace)/create/avatar/page.tsx`
- `app/(workspace)/library/page.tsx`

No local migration currently creates `cinematic_looks`.

Observed fields from runtime code:

```text
id
user_id
name
video_url
thumbnail_url
duration_sec
source_job_id
created_at
```

`POST /api/jobs` uses `look_id` only in the avatar/cinematic path. A saved Look currently means: lip-sync a new script and voice onto a persisted cinematic clip.

## Required Read-Only Queries

Run these in Supabase SQL Editor or with a privileged read-only DB connection:

```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'cinematic_looks'
order by ordinal_position;
```

```sql
select
  i.relname as index_name,
  pg_get_indexdef(ix.indexrelid) as index_def
from pg_class t
join pg_index ix on t.oid = ix.indrelid
join pg_class i on i.oid = ix.indexrelid
join pg_namespace n on n.oid = t.relnamespace
where n.nspname = 'public'
  and t.relname = 'cinematic_looks'
order by i.relname;
```

```sql
select
  polname,
  polcmd,
  pg_get_expr(polqual, polrelid) as using_expr,
  pg_get_expr(polwithcheck, polrelid) as check_expr
from pg_policy
where polrelid = 'public.cinematic_looks'::regclass
order by polname;
```

```sql
select
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'cinematic_looks';
```

```sql
select trigger_name, event_manipulation, action_timing, action_statement
from information_schema.triggers
where event_object_schema = 'public'
  and event_object_table = 'cinematic_looks'
order by trigger_name;
```

## Migration Guidance

Do not create a replacement `saved_looks` table until the live table is verified.

The safest likely path is additive:

1. Keep `cinematic_looks` for existing avatar/cinematic clip reuse.
2. Add missing metadata columns only if the live table lacks them.
3. Add a general `saved_looks` table only if `cinematic_looks` is too narrow to evolve safely.
4. Never migrate or copy user data until a rollback plan and RLS policies are reviewed.

## Product Decision

Continue using the existing `cinematic_looks` contract for T-401 V1.

UGC Studio should use existing reference payloads first (`outfit_style`, product/style image references) and should not depend on a new Saved Looks migration for its first spec.

