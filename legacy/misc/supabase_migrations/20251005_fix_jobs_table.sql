-- Migration pour corriger la table jobs si les colonnes manquent
-- Cette migration est idempotente (peut être exécutée plusieurs fois sans erreur)

-- Ajouter la colonne error_message si elle n'existe pas
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'jobs' 
        AND column_name = 'error_message'
    ) THEN
        ALTER TABLE public.jobs ADD COLUMN error_message TEXT;
        COMMENT ON COLUMN public.jobs.error_message IS 'Error message if job failed';
    END IF;
END $$;

-- Ajouter la colonne updated_at si elle n'existe pas
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'jobs' 
        AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE public.jobs ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
        COMMENT ON COLUMN public.jobs.updated_at IS 'Timestamp of last update';
    END IF;
END $$;

-- Ajouter la colonne current_stage si elle n'existe pas
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'jobs' 
        AND column_name = 'current_stage'
    ) THEN
        ALTER TABLE public.jobs ADD COLUMN current_stage TEXT;
        COMMENT ON COLUMN public.jobs.current_stage IS 'Current pipeline stage: qwen, wan_image, pika, elevenlabs, remotion';
    END IF;
END $$;

-- Ajouter la colonne retry_count si elle n'existe pas
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'jobs' 
        AND column_name = 'retry_count'
    ) THEN
        ALTER TABLE public.jobs ADD COLUMN retry_count INTEGER DEFAULT 0;
        COMMENT ON COLUMN public.jobs.retry_count IS 'Number of retry attempts';
    END IF;
END $$;

-- Ajouter la colonne app_state si elle n'existe pas
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'jobs' 
        AND column_name = 'app_state'
    ) THEN
        ALTER TABLE public.jobs ADD COLUMN app_state JSONB NOT NULL DEFAULT '{}'::jsonb;
        COMMENT ON COLUMN public.jobs.app_state IS 'Complete LangGraph workflow state (JSON)';
    END IF;
END $$;

-- Créer ou remplacer la fonction de mise à jour automatique de updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Créer le trigger si il n'existe pas déjà
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'update_jobs_updated_at'
    ) THEN
        CREATE TRIGGER update_jobs_updated_at
            BEFORE UPDATE ON public.jobs
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- Mettre à jour updated_at pour tous les jobs existants
UPDATE public.jobs SET updated_at = created_at WHERE updated_at IS NULL;

-- Afficher un message de confirmation
DO $$
BEGIN
    RAISE NOTICE 'Migration 20251005_fix_jobs_table.sql completed successfully';
END $$;
