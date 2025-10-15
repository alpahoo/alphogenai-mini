-- Correction des colonnes manquantes dans les tables de cache
-- À exécuter UNE SEULE FOIS dans l'éditeur SQL de Supabase

-- music_cache
ALTER TABLE public.music_cache 
  ADD COLUMN IF NOT EXISTS music_track_url TEXT,
  ADD COLUMN IF NOT EXISTS audio_mode TEXT;

-- video_cache  
ALTER TABLE public.video_cache 
  ADD COLUMN IF NOT EXISTS prompt TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;