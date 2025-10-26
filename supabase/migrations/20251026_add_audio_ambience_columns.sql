
ALTER TABLE public.jobs 
ADD COLUMN IF NOT EXISTS audio_url TEXT;

ALTER TABLE public.jobs 
ADD COLUMN IF NOT EXISTS audio_score FLOAT8;

ALTER TABLE public.jobs 
ADD COLUMN IF NOT EXISTS output_url_final TEXT;

CREATE INDEX IF NOT EXISTS idx_jobs_audio_url ON public.jobs(audio_url) 
WHERE audio_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_output_url_final ON public.jobs(output_url_final) 
WHERE output_url_final IS NOT NULL;

COMMENT ON COLUMN public.jobs.audio_url IS 'URL of generated ambient audio (from AudioLDM2 or Diff-Foley)';
COMMENT ON COLUMN public.jobs.audio_score IS 'CLAP audio-text similarity score (0.0-1.0)';
COMMENT ON COLUMN public.jobs.output_url_final IS 'Final video URL with mixed audio (replaces final_url when audio is enabled)';
