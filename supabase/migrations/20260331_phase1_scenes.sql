-- Phase 1: Multi-scene foundations — job_scenes table
-- Safe to run multiple times (IF NOT EXISTS / DO $$ checks)
-- Does NOT break the existing single-clip pipeline

-- ============================================================
-- A. job_scenes table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.job_scenes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
    scene_index SMALLINT NOT NULL,              -- 0-based order
    prompt TEXT NOT NULL,                        -- scene-level prompt
    engine TEXT NOT NULL DEFAULT 'wan_i2v',      -- engine key (wan_i2v, seedance, etc.)
    duration_sec NUMERIC(5,1) NOT NULL DEFAULT 5.0,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','generating','encoding','uploading','done','failed','skipped')),
    clip_url TEXT,                               -- R2 URL once done
    error_message TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb, -- engine params, seed, etc.
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint: one scene_index per job
CREATE UNIQUE INDEX IF NOT EXISTS idx_job_scenes_job_index
    ON public.job_scenes (job_id, scene_index);

-- Fast lookup by job
CREATE INDEX IF NOT EXISTS idx_job_scenes_job_id
    ON public.job_scenes (job_id);

-- Auto-update updated_at (reuse existing function)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'update_job_scenes_updated_at'
    ) THEN
        CREATE TRIGGER update_job_scenes_updated_at
            BEFORE UPDATE ON public.job_scenes
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- ============================================================
-- B. RLS for job_scenes
-- ============================================================
ALTER TABLE public.job_scenes ENABLE ROW LEVEL SECURITY;

-- Users can view scenes of their own jobs (or anonymous jobs)
DO $$ BEGIN
CREATE POLICY "Users can view own scenes"
    ON public.job_scenes FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.jobs
            WHERE jobs.id = job_scenes.job_id
              AND (jobs.user_id = auth.uid() OR jobs.user_id IS NULL)
        )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Service role full access
DO $$ BEGIN
CREATE POLICY "Service role full access to scenes"
    ON public.job_scenes FOR ALL
    USING (auth.jwt()->>'role' = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Insert: only backend (service_role) creates scenes
DO $$ BEGIN
CREATE POLICY "Service role can insert scenes"
    ON public.job_scenes FOR INSERT
    WITH CHECK (auth.jwt()->>'role' = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- C. Minimal extension of jobs table
-- ============================================================
DO $$
BEGIN
    -- storyboard: JSON array produced by the storyboard generator
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'jobs' AND column_name = 'storyboard'
    ) THEN
        ALTER TABLE jobs ADD COLUMN storyboard JSONB;
    END IF;

    -- target duration requested by user (seconds)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'jobs' AND column_name = 'target_duration_seconds'
    ) THEN
        ALTER TABLE jobs ADD COLUMN target_duration_seconds INTEGER DEFAULT 5;
    END IF;
END $$;

-- ============================================================
-- D. Watchdog for stuck scenes (> 30 min)
-- ============================================================
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
        status IN ('pending', 'generating', 'encoding', 'uploading')
        AND updated_at < now() - interval '30 minutes';

    GET DIAGNOSTICS affected = ROW_COUNT;
    RETURN affected;
END;
$$;
