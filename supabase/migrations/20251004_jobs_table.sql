-- Create jobs table with app_state for LangGraph orchestrator
CREATE TABLE IF NOT EXISTS public.jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    prompt TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'cancelled')),
    
    -- LangGraph state storage
    app_state JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    -- Tracking
    current_stage TEXT,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    
    -- Final result
    video_url TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON public.jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON public.jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON public.jobs(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own jobs"
    ON public.jobs
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create own jobs"
    ON public.jobs
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own jobs"
    ON public.jobs
    FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Service role has full access"
    ON public.jobs
    FOR ALL
    USING (auth.jwt()->>'role' = 'service_role');

-- Auto-update updated_at
CREATE TRIGGER update_jobs_updated_at
    BEFORE UPDATE ON public.jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE public.jobs IS 'Video generation jobs with LangGraph state';
COMMENT ON COLUMN public.jobs.app_state IS 'Complete LangGraph workflow state (JSON)';
COMMENT ON COLUMN public.jobs.status IS 'Job status: pending, in_progress, completed, failed, cancelled';
COMMENT ON COLUMN public.jobs.current_stage IS 'Current pipeline stage: qwen, wan_image, pika, elevenlabs, remotion';
