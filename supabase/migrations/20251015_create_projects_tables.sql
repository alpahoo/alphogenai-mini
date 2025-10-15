-- Create projects table for improved video generation pipeline
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT,
    prompt TEXT NOT NULL,
    model TEXT DEFAULT 'gen4_turbo',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'generating', 'ready', 'failed', 'cancelled')),
    
    -- Cost tracking
    cost_credits INTEGER DEFAULT 0,
    
    -- Final outputs
    final_video_path TEXT,
    thumbnail_path TEXT,
    
    -- YouTube integration
    youtube_token TEXT,
    youtube_video_id TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create project_scenes table for individual scene generation
CREATE TABLE IF NOT EXISTS public.project_scenes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    scene_number INTEGER NOT NULL,
    prompt TEXT NOT NULL,
    
    -- Runway generation
    runway_task_id TEXT,
    output_url TEXT,
    duration INTEGER DEFAULT 8,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'generating', 'completed', 'failed')),
    
    -- Music selection
    music_url TEXT,
    music_name TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON public.projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON public.projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON public.projects(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_scenes_project_id ON public.project_scenes(project_id);
CREATE INDEX IF NOT EXISTS idx_project_scenes_status ON public.project_scenes(status);

-- Enable Row Level Security
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_scenes ENABLE ROW LEVEL SECURITY;

-- RLS Policies for projects
CREATE POLICY "Users can view own projects"
    ON public.projects
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create projects"
    ON public.projects
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own projects"
    ON public.projects
    FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Service role has full access to projects"
    ON public.projects
    FOR ALL
    USING (auth.jwt()->>'role' = 'service_role');

-- RLS Policies for project_scenes
CREATE POLICY "Users can view scenes of own projects"
    ON public.project_scenes
    FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM public.projects 
        WHERE projects.id = project_scenes.project_id 
        AND projects.user_id = auth.uid()
    ));

CREATE POLICY "Users can create scenes for own projects"
    ON public.project_scenes
    FOR INSERT
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.projects 
        WHERE projects.id = project_scenes.project_id 
        AND projects.user_id = auth.uid()
    ));

CREATE POLICY "Users can update scenes of own projects"
    ON public.project_scenes
    FOR UPDATE
    USING (EXISTS (
        SELECT 1 FROM public.projects 
        WHERE projects.id = project_scenes.project_id 
        AND projects.user_id = auth.uid()
    ));

CREATE POLICY "Service role has full access to project_scenes"
    ON public.project_scenes
    FOR ALL
    USING (auth.jwt()->>'role' = 'service_role');

-- Auto-update updated_at triggers
CREATE TRIGGER update_projects_updated_at
    BEFORE UPDATE ON public.projects
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_project_scenes_updated_at
    BEFORE UPDATE ON public.project_scenes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE public.projects IS 'Video generation projects with multiple scenes';
COMMENT ON COLUMN public.projects.model IS 'AI model used: gen4_turbo, veo3, etc.';
COMMENT ON COLUMN public.projects.cost_credits IS 'Total credits consumed for this project';
COMMENT ON COLUMN public.projects.final_video_path IS 'Path to final assembled video with music';
COMMENT ON COLUMN public.projects.thumbnail_path IS 'Path to video thumbnail image';
COMMENT ON COLUMN public.projects.youtube_token IS 'OAuth token for YouTube publishing';

COMMENT ON TABLE public.project_scenes IS 'Individual scenes within a project';
COMMENT ON COLUMN public.project_scenes.runway_task_id IS 'Runway API task ID for tracking';
COMMENT ON COLUMN public.project_scenes.output_url IS 'Generated video URL from Runway';
COMMENT ON COLUMN public.project_scenes.duration IS 'Scene duration in seconds';
COMMENT ON COLUMN public.project_scenes.music_url IS 'Selected background music URL';