-- Security hardening (R-018d #1) — applied to prod 2026-06-09 (Paul's go).
-- music_cache and video_cache had INSERT policies WITH CHECK (true) for the
-- authenticated role → any signed-in user could insert arbitrary cache rows via
-- PostgREST (cache-poisoning vector).
--
-- These global caches are written ONLY by the Python workers using the service
-- role (workers/music_selector.py inserts music_cache; workers/supabase_client.py
-- upserts video_cache), which bypass RLS. The Next.js app never touches these
-- tables (grep: no app/lib reference). So dropping the permissive authenticated
-- INSERT policies is safe.
--
-- Kept: SELECT policies (read-only prompt->asset cache) and
-- video_cache.admin_full_access. Service role keeps full access.
-- No user data changed. Idempotent. After this, the advisor's
-- rls_policy_always_true category is empty for public.*.
drop policy if exists "music_cache_insert" on public.music_cache;
drop policy if exists "video_cache_insert" on public.video_cache;
