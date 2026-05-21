-- Fix: watchdog_stuck_jobs() error message said "EvoLink job exceeded 2 hour
-- limit" even for Bailian jobs. Changed to generic "job exceeded 2 hour limit".

CREATE OR REPLACE FUNCTION watchdog_stuck_jobs()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  affected integer := 0;
  n integer;
BEGIN
  -- Modal/GPU jobs: kill after 30 min of no update (they webhook back quickly)
  UPDATE jobs
  SET
    status = 'failed',
    current_stage = 'failed',
    error_message = 'timeout: job exceeded 30 minute limit',
    updated_at = now()
  WHERE
    status IN ('pending', 'generating', 'in_progress', 'uploading')
    AND external_task_id IS NULL
    AND updated_at < now() - interval '30 minutes';

  GET DIAGNOSTICS n = ROW_COUNT;
  affected := affected + n;

  -- Provider jobs (EvoLink/Bailian): kill after 2h (video generation can take longer)
  UPDATE jobs
  SET
    status = 'failed',
    current_stage = 'failed',
    error_message = 'timeout: job exceeded 2 hour limit',
    updated_at = now()
  WHERE
    status IN ('pending', 'generating', 'in_progress', 'uploading')
    AND external_task_id IS NOT NULL
    AND updated_at < now() - interval '2 hours';

  GET DIAGNOSTICS n = ROW_COUNT;
  affected := affected + n;

  RETURN affected;
END;
$$;
