-- T-1111c: add a generic jsonb metadata column to jobs.
-- Used to link a video job back to its Research plan
-- (jobs.metadata.research_job_id) so POST /api/jobs/[id]/overlay can rebuild
-- the OverlayPlan from research_storyboards. Nullable, additive, no backfill,
-- no RLS change (row-level policies already cover the jobs table).
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS metadata jsonb;
