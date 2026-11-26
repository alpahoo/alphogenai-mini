-- public.app_settings: key/value settings read and written ONLY through the service role
-- (`/api/admin/providers`, `/api/engines`, `/api/admin/modules`, `lib/parallax-modules.ts`, Modal `video_pipeline`).
--
-- Why this migration exists: the table was created by hand in production and never by a versioned migration
-- (`20260609_enable_rls_app_settings.sql` fails on a blank database with `relation "public.app_settings" does not exist`).
-- On a blank or staging database the Parallax module toggles (`parallax_modules`) therefore could not be saved.
--
-- Idempotent and safe on production, where the table already exists with RLS enabled: `create table if not exists` is a no-op,
-- enabling RLS again is a no-op, the revokes only close access that must not exist, and the grant matches how the service role is used.
-- Dated after the historical chain on purpose (no change in the order of the existing files or of the five documented replay failures).
--
-- Expected shape (from the code): `key` is the upsert conflict target; `value` is a JSON document; `updated_at` is set by the writer.
-- Rollback (blank/staging only, never on production): drop table public.app_settings;

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;
-- No policy on purpose (default deny): neither anon nor authenticated may read or write it, exactly like R-018 in production.
revoke all on public.app_settings from public, anon, authenticated;
grant select, insert, update, delete on public.app_settings to service_role;
