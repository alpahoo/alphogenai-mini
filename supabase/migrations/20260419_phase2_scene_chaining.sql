-- Phase 2: Multi-scene EvoLink chaining (first_frame continuity)
-- ============================================================
-- Adds per-scene external task tracking and last-frame URL so we can
-- chain scene N+1 with first_frame = last frame of scene N.
--
-- Also adds a per-job opt-out flag `multi_scene_chain` (default TRUE).
-- When set to FALSE, scenes are rendered independently (no chaining).
-- ============================================================

-- A. job_scenes: per-scene EvoLink task + extracted last-frame URL
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'job_scenes' AND column_name = 'external_task_id'
    ) THEN
        ALTER TABLE public.job_scenes ADD COLUMN external_task_id TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'job_scenes' AND column_name = 'last_frame_url'
    ) THEN
        ALTER TABLE public.job_scenes ADD COLUMN last_frame_url TEXT;
    END IF;
END $$;

-- Index for fast lookup by external_task_id (poll reverse-map, sparse)
CREATE INDEX IF NOT EXISTS idx_job_scenes_external_task_id
    ON public.job_scenes (external_task_id)
    WHERE external_task_id IS NOT NULL;

-- B. jobs: opt-out toggle for multi-scene chaining (default TRUE = chain ON)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'jobs' AND column_name = 'multi_scene_chain'
    ) THEN
        ALTER TABLE public.jobs ADD COLUMN multi_scene_chain BOOLEAN DEFAULT TRUE;
    END IF;
END $$;
