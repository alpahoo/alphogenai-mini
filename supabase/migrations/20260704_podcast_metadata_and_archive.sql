-- T-1141: podcast library actions + style persistence. Additive, safe.
--   1) metadata jsonb — holds metadata.podcast_style (and target_duration_seconds)
--      so studio settings survive a reopen without a per-field column each time.
--   2) status='archived' — enables soft-delete (archive) from the library; the
--      row + R2 assets stay, GET /api/podcasts filters archived out.
-- Applied to prod via MCP apply_migration (project qbrpzmuedfugbhoeytdj).

ALTER TABLE public.podcasts
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.podcasts DROP CONSTRAINT IF EXISTS podcasts_status_check;
ALTER TABLE public.podcasts ADD CONSTRAINT podcasts_status_check
  CHECK (status IN ('draft', 'scripting', 'ready', 'failed', 'archived'));
