-- Migration: add missing output columns used by Modal pipeline and frontend
-- Date: 2026-03-09

-- audio_url: stores the generated audio URL
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS audio_url TEXT;

-- output_url_final: stores the final combined video+audio URL
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS output_url_final TEXT;

COMMENT ON COLUMN public.jobs.audio_url IS 'Generated audio track URL';
COMMENT ON COLUMN public.jobs.output_url_final IS 'Final output URL (video + audio combined)';
