-- Tier B: persist the Explainer Studio working copy (edited draft) separately from
-- the approved plan. research_storyboards (the approved source of truth) is never
-- modified. The existing per-user RLS on research_jobs (auth.uid() = user_id)
-- protects this column automatically. Stored shape: { scenes: [...], savedAt: ISO }.
ALTER TABLE public.research_jobs
  ADD COLUMN IF NOT EXISTS working_storyboard jsonb;
