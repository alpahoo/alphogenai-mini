-- Migration: add plan column to jobs table
-- Date: 2026-03-03
-- Plans: free | pro | premium

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free'
    CHECK (plan IN ('free', 'pro', 'premium'));

-- Index for filtering by plan
CREATE INDEX IF NOT EXISTS idx_jobs_plan ON jobs(plan);

-- Comment
COMMENT ON COLUMN jobs.plan IS 'User plan at time of job creation: free | pro | premium';
