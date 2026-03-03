-- =============================================================
-- AlphoGenAI Mini — ALL MIGRATIONS IN ONE SCRIPT
-- Paste this entire file into Supabase Dashboard → SQL Editor → Run
-- =============================================================

-- ===================== 1. Extensions =====================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ===================== 2. Notes table =====================
CREATE TABLE IF NOT EXISTS public.notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='notes' AND policyname='Users can select their own notes') THEN
    CREATE POLICY "Users can select their own notes" ON public.notes FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='notes' AND policyname='Users can insert their own notes') THEN
    CREATE POLICY "Users can insert their own notes" ON public.notes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='notes' AND policyname='Users can delete their own notes') THEN
    CREATE POLICY "Users can delete their own notes" ON public.notes FOR DELETE TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

-- ===================== 3. Jobs table =====================
CREATE TABLE IF NOT EXISTS public.jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    prompt TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'done', 'failed', 'cancelled')),
    app_state JSONB NOT NULL DEFAULT '{}'::jsonb,
    current_stage TEXT,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    final_url TEXT,
    video_url TEXT,
    webhook_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Extra columns (idempotent)
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS mood_override TEXT;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS script_tone TEXT;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS music_track_url TEXT;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS audio_url TEXT;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS audio_score FLOAT8;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS output_url_final TEXT;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON public.jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON public.jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON public.jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_audio_url ON public.jobs(audio_url) WHERE audio_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_output_url_final ON public.jobs(output_url_final) WHERE output_url_final IS NOT NULL;

-- RLS
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='jobs' AND policyname='Users can view own jobs') THEN
    CREATE POLICY "Users can view own jobs" ON public.jobs FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='jobs' AND policyname='Anyone can create jobs') THEN
    CREATE POLICY "Anyone can create jobs" ON public.jobs FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='jobs' AND policyname='Users can update own jobs') THEN
    CREATE POLICY "Users can update own jobs" ON public.jobs FOR UPDATE USING (auth.uid() = user_id OR user_id IS NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='jobs' AND policyname='Service role has full access to jobs') THEN
    CREATE POLICY "Service role has full access to jobs" ON public.jobs FOR ALL USING (auth.jwt()->>'role' = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='jobs' AND policyname='Public can view completed videos') THEN
    CREATE POLICY "Public can view completed videos" ON public.jobs FOR SELECT USING (status IN ('done', 'completed') AND final_url IS NOT NULL);
  END IF;
END $$;

-- Auto-update trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_jobs_updated_at') THEN
    CREATE TRIGGER update_jobs_updated_at BEFORE UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

UPDATE public.jobs SET updated_at = created_at WHERE updated_at IS NULL;

-- Comments
COMMENT ON TABLE public.jobs IS 'Video generation jobs with LangGraph state';
COMMENT ON COLUMN public.jobs.app_state IS 'Complete LangGraph workflow state (JSON)';
COMMENT ON COLUMN public.jobs.status IS 'Job status: pending, in_progress, done, failed, cancelled';
COMMENT ON COLUMN public.jobs.current_stage IS 'Current pipeline stage';
COMMENT ON COLUMN public.jobs.audio_url IS 'URL of generated ambient audio';
COMMENT ON COLUMN public.jobs.audio_score IS 'CLAP audio-text similarity score (0.0-1.0)';
COMMENT ON COLUMN public.jobs.output_url_final IS 'Final video URL with mixed audio';

-- ===================== 4. Video cache table =====================
CREATE TABLE IF NOT EXISTS public.video_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prompt TEXT NOT NULL,
    prompt_hash TEXT NOT NULL UNIQUE,
    video_url TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_video_cache_prompt_hash ON public.video_cache(prompt_hash);

ALTER TABLE public.video_cache ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='video_cache' AND policyname='Anyone can read video cache') THEN
    CREATE POLICY "Anyone can read video cache" ON public.video_cache FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='video_cache' AND policyname='Service role can manage video cache') THEN
    CREATE POLICY "Service role can manage video cache" ON public.video_cache FOR ALL USING (auth.jwt()->>'role' = 'service_role');
  END IF;
END $$;

-- ===================== 5. Music cache table =====================
CREATE TABLE IF NOT EXISTS public.music_cache (
    prompt_hash TEXT PRIMARY KEY,
    audio_mode TEXT NOT NULL CHECK (audio_mode IN ('voice','music','none')),
    music_track_url TEXT NOT NULL,
    tone TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_music_cache_mode ON public.music_cache(audio_mode);
CREATE INDEX IF NOT EXISTS idx_music_cache_tone ON public.music_cache(tone);

ALTER TABLE public.music_cache ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='music_cache' AND policyname='Anyone can read music cache') THEN
    CREATE POLICY "Anyone can read music cache" ON public.music_cache FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='music_cache' AND policyname='Service role can manage music cache') THEN
    CREATE POLICY "Service role can manage music cache" ON public.music_cache FOR ALL USING (auth.jwt()->>'role' = 'service_role');
  END IF;
END $$;

-- ===================== 6. Storage buckets =====================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('videos', 'videos', true, 104857600, ARRAY['video/mp4', 'video/webm', 'video/quicktime'])
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('assets', 'assets', true, 52428800, ARRAY['audio/mpeg', 'audio/mp3', 'audio/wav'])
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='objects' AND schemaname='storage' AND policyname='Public can view videos') THEN
    CREATE POLICY "Public can view videos" ON storage.objects FOR SELECT USING (bucket_id = 'videos');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='objects' AND schemaname='storage' AND policyname='Public can view assets') THEN
    CREATE POLICY "Public can view assets" ON storage.objects FOR SELECT USING (bucket_id = 'assets');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='objects' AND schemaname='storage' AND policyname='Authenticated users can upload videos') THEN
    CREATE POLICY "Authenticated users can upload videos" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'videos' AND auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='objects' AND schemaname='storage' AND policyname='Authenticated users can update videos') THEN
    CREATE POLICY "Authenticated users can update videos" ON storage.objects FOR UPDATE USING (bucket_id = 'videos' AND auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='objects' AND schemaname='storage' AND policyname='Authenticated users can delete videos') THEN
    CREATE POLICY "Authenticated users can delete videos" ON storage.objects FOR DELETE USING (bucket_id = 'videos' AND auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='objects' AND schemaname='storage' AND policyname='Authenticated users can upload assets') THEN
    CREATE POLICY "Authenticated users can upload assets" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'assets' AND auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='objects' AND schemaname='storage' AND policyname='Authenticated users can update assets') THEN
    CREATE POLICY "Authenticated users can update assets" ON storage.objects FOR UPDATE USING (bucket_id = 'assets' AND auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='objects' AND schemaname='storage' AND policyname='Authenticated users can delete assets') THEN
    CREATE POLICY "Authenticated users can delete assets" ON storage.objects FOR DELETE USING (bucket_id = 'assets' AND auth.uid() IS NOT NULL);
  END IF;
END $$;

-- ===================== VERIFICATION =====================
DO $$
DECLARE
    jobs_exists BOOLEAN;
    video_cache_exists BOOLEAN;
    music_cache_exists BOOLEAN;
    videos_bucket BOOLEAN;
    assets_bucket BOOLEAN;
BEGIN
    SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'jobs') INTO jobs_exists;
    SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'video_cache') INTO video_cache_exists;
    SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'music_cache') INTO music_cache_exists;
    SELECT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'videos') INTO videos_bucket;
    SELECT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'assets') INTO assets_bucket;

    RAISE NOTICE '================================================';
    RAISE NOTICE 'MIGRATION SUMMARY';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'jobs table:        %', CASE WHEN jobs_exists THEN 'OK' ELSE 'MISSING' END;
    RAISE NOTICE 'video_cache table: %', CASE WHEN video_cache_exists THEN 'OK' ELSE 'MISSING' END;
    RAISE NOTICE 'music_cache table: %', CASE WHEN music_cache_exists THEN 'OK' ELSE 'MISSING' END;
    RAISE NOTICE 'videos bucket:     %', CASE WHEN videos_bucket THEN 'OK' ELSE 'MISSING' END;
    RAISE NOTICE 'assets bucket:     %', CASE WHEN assets_bucket THEN 'OK' ELSE 'MISSING' END;
    RAISE NOTICE '================================================';
END $$;
