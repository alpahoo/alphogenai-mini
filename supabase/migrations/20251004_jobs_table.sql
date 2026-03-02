-- Create jobs table with app_state for LangGraph orchestrator
CREATE TABLE IF NOT EXISTS public.jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    prompt TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'done', 'failed', 'cancelled')),
    
    -- LangGraph state storage
    app_state JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    -- Tracking
    current_stage TEXT,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    
    -- Final result
    final_url TEXT,
    video_url TEXT, -- Alias pour compatibilité
    
    -- Webhook
    webhook_url TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create video_cache table for prompt-based caching
CREATE TABLE IF NOT EXISTS public.video_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prompt TEXT NOT NULL,
    prompt_hash TEXT NOT NULL UNIQUE,
    video_url TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON public.jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON public.jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON public.jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_video_cache_prompt_hash ON public.video_cache(prompt_hash);

-- Enable Row Level Security
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_cache ENABLE ROW LEVEL SECURITY;

-- RLS Policies for jobs
CREATE POLICY "Users can view own jobs"
    ON public.jobs
    FOR SELECT
    USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Anyone can create jobs"
    ON public.jobs
    FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Users can update own jobs"
    ON public.jobs
    FOR UPDATE
    USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Service role has full access to jobs"
    ON public.jobs
    FOR ALL
    USING (auth.jwt()->>'role' = 'service_role');

-- RLS Policies for video_cache
CREATE POLICY "Anyone can read video cache"
    ON public.video_cache
    FOR SELECT
    USING (true);

CREATE POLICY "Service role can manage video cache"
    ON public.video_cache
    FOR ALL
    USING (auth.jwt()->>'role' = 'service_role');

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_jobs_updated_at
    BEFORE UPDATE ON public.jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE public.jobs IS 'Video generation jobs with LangGraph state';
COMMENT ON COLUMN public.jobs.app_state IS 'Complete LangGraph workflow state (JSON)';
COMMENT ON COLUMN public.jobs.status IS 'Job status: pending, in_progress, done, failed, cancelled';
COMMENT ON COLUMN public.jobs.current_stage IS 'Current pipeline stage (implementation-defined): e.g. starting, video_generated, completed, failed';
COMMENT ON COLUMN public.jobs.final_url IS 'Final video URL when completed';
COMMENT ON COLUMN public.jobs.webhook_url IS 'Optional webhook URL for completion notification';

COMMENT ON TABLE public.video_cache IS 'Cache of generated videos by prompt hash';
COMMENT ON COLUMN public.video_cache.prompt_hash IS 'SHA-256 hash of the prompt for deduplication';
COMMENT ON COLUMN public.video_cache.video_url IS 'URL of the cached video';