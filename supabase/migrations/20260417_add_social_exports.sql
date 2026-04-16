ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS social_exports JSONB DEFAULT '{}'::jsonb;
COMMENT ON COLUMN public.jobs.social_exports IS 'Social media export URLs: { tiktok: url, instagram: url, youtube: url }';
