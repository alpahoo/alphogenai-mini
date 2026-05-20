-- Fix: watchdog_stuck_scenes was killing pending scenes that hadn't been
-- launched yet. In long multi-scene chains (12 scenes, ~5min each),
-- scenes 8+ would be pending for 40+ minutes while waiting their turn,
-- triggering the 30-minute timeout prematurely.
--
-- Solution: remove 'pending' from the timeout targets. Pending scenes
-- should only be failed by the state machine when their predecessor fails.

CREATE OR REPLACE FUNCTION watchdog_stuck_scenes()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
    affected integer;
BEGIN
    UPDATE job_scenes
    SET
        status = 'failed',
        error_message = 'timeout: scene exceeded 30 minute limit',
        updated_at = now()
    WHERE
        status IN ('generating', 'encoding', 'uploading')
        AND updated_at < now() - interval '30 minutes';

    GET DIAGNOSTICS affected = ROW_COUNT;
    RETURN affected;
END;
$$;
