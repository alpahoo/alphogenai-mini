-- Create video_cache table for job persistence and caching
CREATE TABLE IF NOT EXISTS public.video_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    prompt TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'cancelled')),
    current_stage TEXT,
    error_message TEXT,
    result JSONB,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create video_artifacts table for storing intermediate pipeline artifacts
CREATE TABLE IF NOT EXISTS public.video_artifacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES public.video_cache(id) ON DELETE CASCADE,
    stage TEXT NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_video_cache_user_id ON public.video_cache(user_id);
CREATE INDEX IF NOT EXISTS idx_video_cache_status ON public.video_cache(status);
CREATE INDEX IF NOT EXISTS idx_video_cache_prompt ON public.video_cache(prompt);
CREATE INDEX IF NOT EXISTS idx_video_cache_created_at ON public.video_cache(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_video_artifacts_job_id ON public.video_artifacts(job_id);
CREATE INDEX IF NOT EXISTS idx_video_artifacts_stage ON public.video_artifacts(stage);

-- Enable Row Level Security
ALTER TABLE public.video_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_artifacts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for video_cache
-- Users can only see their own jobs
CREATE POLICY "Users can view own video jobs"
    ON public.video_cache
    FOR SELECT
    USING (auth.uid() = user_id);

-- Users can insert their own jobs
CREATE POLICY "Users can create own video jobs"
    ON public.video_cache
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can update their own jobs
CREATE POLICY "Users can update own video jobs"
    ON public.video_cache
    FOR UPDATE
    USING (auth.uid() = user_id);

-- Users can delete their own jobs
CREATE POLICY "Users can delete own video jobs"
    ON public.video_cache
    FOR DELETE
    USING (auth.uid() = user_id);

-- Service role can do everything (for worker processes)
CREATE POLICY "Service role has full access to video_cache"
    ON public.video_cache
    FOR ALL
    USING (auth.jwt()->>'role' = 'service_role');

-- RLS Policies for video_artifacts
-- Users can view artifacts for their own jobs
CREATE POLICY "Users can view own video artifacts"
    ON public.video_artifacts
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.video_cache
            WHERE video_cache.id = video_artifacts.job_id
            AND video_cache.user_id = auth.uid()
        )
    );

-- Service role can do everything (for worker processes)
CREATE POLICY "Service role has full access to video_artifacts"
    ON public.video_artifacts
    FOR ALL
    USING (auth.jwt()->>'role' = 'service_role');

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at on video_cache
CREATE TRIGGER update_video_cache_updated_at
    BEFORE UPDATE ON public.video_cache
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create a view for job statistics (optional, useful for dashboards)
CREATE OR REPLACE VIEW public.video_generation_stats AS
SELECT
    user_id,
    COUNT(*) as total_jobs,
    COUNT(*) FILTER (WHERE status = 'completed') as completed_jobs,
    COUNT(*) FILTER (WHERE status = 'failed') as failed_jobs,
    COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_jobs,
    COUNT(*) FILTER (WHERE status = 'pending') as pending_jobs,
    MAX(created_at) as last_job_created,
    AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) FILTER (WHERE status = 'completed') as avg_completion_time_seconds
FROM public.video_cache
GROUP BY user_id;

-- Grant access to authenticated users
GRANT SELECT ON public.video_generation_stats TO authenticated;

-- Add helpful comments
COMMENT ON TABLE public.video_cache IS 'Stores video generation jobs with caching support';
COMMENT ON TABLE public.video_artifacts IS 'Stores intermediate artifacts from video generation pipeline stages';
COMMENT ON COLUMN public.video_cache.status IS 'Job status: pending, in_progress, completed, failed, cancelled';
COMMENT ON COLUMN public.video_cache.current_stage IS 'Current pipeline stage: generate_script, generate_key_visual, generate_clips, generate_audio, assemble_video';
COMMENT ON COLUMN public.video_cache.result IS 'Final video URL and metadata when completed';
COMMENT ON COLUMN public.video_artifacts.stage IS 'Pipeline stage: script, key_visual, clips, audio';
COMMENT ON COLUMN public.video_artifacts.data IS 'Stage-specific output data';
