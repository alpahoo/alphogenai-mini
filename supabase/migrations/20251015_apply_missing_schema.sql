

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'jobs' 
        AND column_name = 'video_url'
    ) THEN
        ALTER TABLE public.jobs ADD COLUMN video_url TEXT;
        COMMENT ON COLUMN public.jobs.video_url IS 'URL de la vidéo générée (alias pour compatibilité)';
        RAISE NOTICE 'Colonne video_url ajoutée à jobs';
    ELSE
        RAISE NOTICE 'Colonne video_url existe déjà';
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'jobs' 
        AND column_name = 'final_url'
    ) THEN
        ALTER TABLE public.jobs ADD COLUMN final_url TEXT;
        COMMENT ON COLUMN public.jobs.final_url IS 'URL finale de la vidéo complétée';
        RAISE NOTICE 'Colonne final_url ajoutée à jobs';
    ELSE
        RAISE NOTICE 'Colonne final_url existe déjà';
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'jobs' 
        AND column_name = 'mood_override'
    ) THEN
        ALTER TABLE public.jobs ADD COLUMN mood_override TEXT;
        COMMENT ON COLUMN public.jobs.mood_override IS 'Ton musical forcé par l''utilisateur (inspirant, science, léger, dramatique, épique)';
        RAISE NOTICE 'Colonne mood_override ajoutée à jobs';
    ELSE
        RAISE NOTICE 'Colonne mood_override existe déjà';
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'jobs' 
        AND column_name = 'script_tone'
    ) THEN
        ALTER TABLE public.jobs ADD COLUMN script_tone TEXT;
        COMMENT ON COLUMN public.jobs.script_tone IS 'Ton détecté automatiquement par Qwen lors de la génération du script';
        RAISE NOTICE 'Colonne script_tone ajoutée à jobs';
    ELSE
        RAISE NOTICE 'Colonne script_tone existe déjà';
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'jobs' 
        AND column_name = 'music_track_url'
    ) THEN
        ALTER TABLE public.jobs ADD COLUMN music_track_url TEXT;
        COMMENT ON COLUMN public.jobs.music_track_url IS 'URL publique de la piste musicale sélectionnée (si audio_mode=music)';
        RAISE NOTICE 'Colonne music_track_url ajoutée à jobs';
    ELSE
        RAISE NOTICE 'Colonne music_track_url existe déjà';
    END IF;
END $$;


CREATE TABLE IF NOT EXISTS public.music_cache (
    prompt_hash TEXT PRIMARY KEY,
    audio_mode TEXT NOT NULL CHECK (audio_mode IN ('voice','music','none')),
    music_track_url TEXT NOT NULL,
    tone TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.music_cache IS 'Cache des sélections musicales pour éviter la re-sélection aléatoire';

CREATE INDEX IF NOT EXISTS idx_music_cache_mode ON public.music_cache (audio_mode);
CREATE INDEX IF NOT EXISTS idx_music_cache_tone ON public.music_cache (tone);


ALTER TABLE public.music_cache ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'music_cache' 
        AND policyname = 'Anyone can read music cache'
    ) THEN
        CREATE POLICY "Anyone can read music cache"
            ON public.music_cache
            FOR SELECT
            USING (true);
        RAISE NOTICE 'Policy "Anyone can read music cache" créée';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'music_cache' 
        AND policyname = 'Service role can manage music cache'
    ) THEN
        CREATE POLICY "Service role can manage music cache"
            ON public.music_cache
            FOR ALL
            USING (auth.jwt()->>'role' = 'service_role');
        RAISE NOTICE 'Policy "Service role can manage music cache" créée';
    END IF;
END $$;


DO $$
DECLARE
    video_url_exists BOOLEAN;
    final_url_exists BOOLEAN;
    music_cache_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'jobs' AND column_name = 'video_url'
    ) INTO video_url_exists;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'jobs' AND column_name = 'final_url'
    ) INTO final_url_exists;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'music_cache'
    ) INTO music_cache_exists;
    
    RAISE NOTICE '================================================';
    RAISE NOTICE 'RÉSUMÉ DE LA MIGRATION';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'jobs.video_url: %', CASE WHEN video_url_exists THEN '✓ OK' ELSE '✗ MANQUANT' END;
    RAISE NOTICE 'jobs.final_url: %', CASE WHEN final_url_exists THEN '✓ OK' ELSE '✗ MANQUANT' END;
    RAISE NOTICE 'music_cache table: %', CASE WHEN music_cache_exists THEN '✓ OK' ELSE '✗ MANQUANT' END;
    RAISE NOTICE '================================================';
    
    IF video_url_exists AND final_url_exists AND music_cache_exists THEN
        RAISE NOTICE '✅ Migration complétée avec succès!';
    ELSE
        RAISE WARNING '⚠️  Certains éléments sont toujours manquants';
    END IF;
END $$;
