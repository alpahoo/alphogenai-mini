-- Security hardening (R-018d #3) — applied to prod 2026-06-09 (Paul's go).
-- Advisor function_search_path_mutable: 14 functions had a role-mutable
-- search_path. Each body was reviewed: the only UNQUALIFIED object references
-- are to public tables (jobs, job_scenes in the watchdog functions); everything
-- else is schema-qualified (auth.*, realtime.*, information_schema.*, public.*)
-- and built-ins resolve from pg_catalog (always implicit). So pinning
-- search_path to 'public, pg_temp' is safe and non-breaking, while making the
-- path immutable (pg_temp kept last to avoid temp-schema shadowing).
--
-- Verified after apply: all 14 functions have proconfig set; a smoke test of
-- is_admin()/current_user_id() ran without error; the advisor lint cleared.
alter function public.handle_new_user() set search_path = public, pg_temp;
alter function public.set_timestamp() set search_path = public, pg_temp;
alter function public.watchdog_stuck_scenes() set search_path = public, pg_temp;
alter function public.watchdog_stuck_jobs() set search_path = public, pg_temp;
alter function public.update_updated_at_column() set search_path = public, pg_temp;
alter function public.update_scheduled_posts_updated_at() set search_path = public, pg_temp;
alter function public.current_user_id() set search_path = public, pg_temp;
alter function public.generic_broadcast_trigger() set search_path = public, pg_temp;
alter function public.ingest_provider_webhook() set search_path = public, pg_temp;
alter function public.is_admin() set search_path = public, pg_temp;
alter function public.admin_read_user(uuid) set search_path = public, pg_temp;
alter function public.admin_delete_user(uuid) set search_path = public, pg_temp;
alter function public.poll_runway_jobs_handler() set search_path = public, pg_temp;
alter function cron_job_invoker.run_poll_runway_jobs() set search_path = public, pg_temp;
