-- Add generation mode support for Image-to-Video (i2v) and Text-to-Video (t2v)
-- Migration: 20251019_add_generation_mode.sql

-- Add generation_mode and image_ref_url to jobs table
ALTER TABLE jobs 
ADD COLUMN IF NOT EXISTS generation_mode TEXT DEFAULT 't2v' CHECK (generation_mode IN ('t2v', 'i2v')),
ADD COLUMN IF NOT EXISTS image_ref_url TEXT;

-- Create projects table if it doesn't exist (for future use)
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    generation_mode TEXT DEFAULT 't2v' CHECK (generation_mode IN ('t2v', 'i2v')),
    image_ref_url TEXT,
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'generating', 'completed', 'failed')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create project_scenes table if it doesn't exist
CREATE TABLE IF NOT EXISTS project_scenes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    scene_number INTEGER NOT NULL,
    prompt TEXT NOT NULL,
    video_url TEXT,
    video_path TEXT, -- Path in Supabase Storage
    duration_seconds INTEGER DEFAULT 10,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'generating', 'completed', 'failed')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS jobs_generation_mode_idx ON jobs(generation_mode);
CREATE INDEX IF NOT EXISTS projects_user_id_idx ON projects(user_id);
CREATE INDEX IF NOT EXISTS projects_status_idx ON projects(status);
CREATE INDEX IF NOT EXISTS project_scenes_project_id_idx ON project_scenes(project_id);

-- Enable RLS (Row Level Security)
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_scenes ENABLE ROW LEVEL SECURITY;

-- RLS Policies for projects
CREATE POLICY "Users can view their own projects" ON projects
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own projects" ON projects
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own projects" ON projects
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own projects" ON projects
    FOR DELETE USING (auth.uid() = user_id);

-- Admin policy for projects
CREATE POLICY "Admins can view all projects" ON projects
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM auth.users 
            WHERE auth.users.id = auth.uid() 
            AND auth.users.raw_user_meta_data->>'role' = 'admin'
        )
    );

-- RLS Policies for project_scenes
CREATE POLICY "Users can view scenes of their projects" ON project_scenes
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM projects 
            WHERE projects.id = project_scenes.project_id 
            AND projects.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert scenes to their projects" ON project_scenes
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM projects 
            WHERE projects.id = project_scenes.project_id 
            AND projects.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update scenes of their projects" ON project_scenes
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM projects 
            WHERE projects.id = project_scenes.project_id 
            AND projects.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete scenes of their projects" ON project_scenes
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM projects 
            WHERE projects.id = project_scenes.project_id 
            AND projects.user_id = auth.uid()
        )
    );

-- Admin policy for project_scenes
CREATE POLICY "Admins can manage all project scenes" ON project_scenes
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM auth.users 
            WHERE auth.users.id = auth.uid() 
            AND auth.users.raw_user_meta_data->>'role' = 'admin'
        )
    );

-- Update trigger for updated_at columns
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers for updated_at
DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;
CREATE TRIGGER update_projects_updated_at 
    BEFORE UPDATE ON projects 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_project_scenes_updated_at ON project_scenes;
CREATE TRIGGER update_project_scenes_updated_at 
    BEFORE UPDATE ON project_scenes 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE projects IS 'User projects with generation mode (t2v/i2v) support';
COMMENT ON TABLE project_scenes IS 'Individual scenes within projects, each generating a video';
COMMENT ON COLUMN jobs.generation_mode IS 'Video generation mode: t2v (text-to-video) or i2v (image-to-video)';
COMMENT ON COLUMN jobs.image_ref_url IS 'Reference image URL for i2v mode (stored in Supabase Storage)';
COMMENT ON COLUMN projects.generation_mode IS 'Project generation mode: t2v or i2v';
COMMENT ON COLUMN projects.image_ref_url IS 'Reference image URL for i2v projects';
COMMENT ON COLUMN project_scenes.video_path IS 'Path to video file in Supabase Storage (e.g., videos/scene_123.mp4)';