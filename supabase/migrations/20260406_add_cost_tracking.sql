-- Internal cost tracking columns on jobs table
ALTER TABLE public.jobs
ADD COLUMN IF NOT EXISTS engine_used TEXT,
ADD COLUMN IF NOT EXISTS estimated_cost_usd NUMERIC;
