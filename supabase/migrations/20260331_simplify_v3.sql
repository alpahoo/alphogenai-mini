-- AlphoGenAI v3 — Defensive migration
-- Safe to run multiple times (IF NOT EXISTS / IF EXISTS checks)

-- Ensure error_message column exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'error_message'
  ) THEN
    ALTER TABLE jobs ADD COLUMN error_message text;
  END IF;
END $$;

-- Watchdog: mark stuck jobs as failed
-- Run this periodically (cron, pg_cron, or manual)
-- Jobs stuck in active state for > 30 min are considered dead
CREATE OR REPLACE FUNCTION watchdog_stuck_jobs()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  affected integer;
BEGIN
  UPDATE jobs
  SET
    status = 'failed',
    current_stage = 'failed',
    error_message = 'timeout: job exceeded 30 minute limit',
    updated_at = now()
  WHERE
    status IN ('pending', 'generating', 'in_progress', 'uploading')
    AND updated_at < now() - interval '30 minutes';

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

-- Index for quota queries (user_id + created_at)
CREATE INDEX IF NOT EXISTS idx_jobs_user_created
  ON jobs (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

-- Index for active job check
CREATE INDEX IF NOT EXISTS idx_jobs_user_active
  ON jobs (user_id, status)
  WHERE status IN ('pending', 'generating', 'in_progress', 'uploading');
