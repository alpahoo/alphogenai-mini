-- Security fix (R-018b) — applied to prod 2026-06-09 (Paul's go for the
-- jobs-policies cleanup slice). Supabase advisor `rls_policy_always_true`:
-- public.jobs had 3 permissive/duplicate INSERT policies with WITH CHECK (true).
--
-- Why safe: the app inserts jobs ONLY via the service role
-- (app/api/jobs/route.ts uses createServiceClient(), which bypasses RLS and is
-- also covered by the service_role_all_jobs policy). No client/anon code inserts
-- into jobs. These permissive policies let any authenticated user — and via
-- "Allow insert on jobs" (role public) even anon — INSERT arbitrary job rows
-- directly through PostgREST with WITH CHECK (true), bypassing the app's
-- quota / plan / content-policy gates and binding to any user_id.
--
-- Kept after this migration:
--   * users_insert_own_jobs  — INSERT WITH CHECK (auth.uid() = user_id)
--   * service_role_all_jobs  — ALL for the service role (app path)
-- No user data changed. Idempotent (DROP ... IF EXISTS).
drop policy if exists "All users can create jobs" on public.jobs;
drop policy if exists "Allow authenticated to create jobs" on public.jobs;
drop policy if exists "Allow insert on jobs" on public.jobs;
