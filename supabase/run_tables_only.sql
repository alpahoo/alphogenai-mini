-- =============================================================
-- AlphoGenAI Mini — TABLES ONLY (no storage buckets)
-- Paste this into Supabase Dashboard → SQL Editor → Run
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

ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS mood_override TEXT;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS script_tone TEXT;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS music_track_url TEXT;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS audio_url TEXT;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS audio_score FLOAT8;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS output_url_final TEXT;

CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON public.jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON public.jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON public.jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_audio_url ON public.jobs(audio_url) WHERE audio_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_output_url_final ON public.jobs(output_url_final) WHERE output_url_final IS NOT NULL;

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

COMMENT ON TABLE public.jobs IS 'Video generation jobs with LangGraph state';

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

-- ===================== VERIFICATION =====================
DO $$
DECLARE
    jobs_ok BOOLEAN;
    vc_ok BOOLEAN;
    mc_ok BOOLEAN;
BEGIN
    SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'jobs') INTO jobs_ok;
    SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'video_cache') INTO vc_ok;
    SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'music_cache') INTO mc_ok;

    RAISE NOTICE '================================================';
    RAISE NOTICE 'MIGRATION SUMMARY';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'jobs table:        %', CASE WHEN jobs_ok THEN 'OK' ELSE 'MISSING' END;
    RAISE NOTICE 'video_cache table: %', CASE WHEN vc_ok THEN 'OK' ELSE 'MISSING' END;
    RAISE NOTICE 'music_cache table: %', CASE WHEN mc_ok THEN 'OK' ELSE 'MISSING' END;
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Now create "videos" and "assets" buckets manually in the Dashboard → Storage tab.';
    RAISE NOTICE '================================================';
END $$;
