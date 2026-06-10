-- T-1101: AlphoResearch Schema Migration
-- Creates 5 core tables with RLS, indexes, and constraints
-- Aligns with alphoresearch-schema-review.md (T-1101a spec)

-- ========================================
-- 1. research_jobs (root entity)
-- ========================================
CREATE TABLE public.research_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Input
  topic TEXT NOT NULL,
  input_url TEXT,

  -- Mode selection
  mode TEXT NOT NULL CHECK (mode IN ('news', 'tutorial', 'product', 'competitor')),

  -- Metadata
  language TEXT NOT NULL DEFAULT 'en-US' CHECK (language ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  target_duration_seconds INT CHECK (target_duration_seconds >= 3 AND target_duration_seconds <= 600),

  -- Lifecycle (aligns with research-studio-ux-spec.md)
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft',
    'discovering',
    'extracting',
    'ready_for_angles',
    'scripting',
    'approved',
    'sent_to_director',
    'failed'
  )),

  -- Error tracking
  error_message TEXT,
  error_step TEXT,

  -- Audit
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT user_topic_length CHECK (CHAR_LENGTH(topic) >= 3 AND CHAR_LENGTH(topic) <= 500),
  CONSTRAINT user_url_format CHECK (input_url IS NULL OR input_url ~ '^https?://'),
  CONSTRAINT target_duration_limits CHECK (target_duration_seconds IS NULL OR (target_duration_seconds >= 3 AND target_duration_seconds <= 600))
);

-- Indexes for research_jobs
CREATE INDEX research_jobs_user_id_created_at ON public.research_jobs(user_id, created_at DESC);
CREATE INDEX research_jobs_status ON public.research_jobs(status);
CREATE INDEX research_jobs_mode ON public.research_jobs(mode);

-- RLS for research_jobs
ALTER TABLE public.research_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY research_jobs_user_select ON public.research_jobs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY research_jobs_user_insert ON public.research_jobs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY research_jobs_user_update ON public.research_jobs
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND status = 'draft'
  );

CREATE POLICY research_jobs_user_delete ON public.research_jobs
  FOR DELETE USING (auth.uid() = user_id);

-- ========================================
-- 2. research_sources (discovered sources)
-- ========================================
CREATE TABLE public.research_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  research_job_id UUID NOT NULL REFERENCES public.research_jobs(id) ON DELETE CASCADE,

  -- Source identification
  url TEXT NOT NULL,
  title TEXT NOT NULL,

  -- Source classification
  source_type TEXT NOT NULL DEFAULT 'unknown' CHECK (source_type IN (
    'official',
    'media',
    'forum',
    'youtube',
    'github',
    'docs',
    'product',
    'unknown'
  )),

  -- Quality & relevance
  credibility_score DECIMAL(3, 2) CHECK (credibility_score >= 0 AND credibility_score <= 1.0),

  -- Extracted content (size-limited)
  extracted_markdown TEXT CHECK (CHAR_LENGTH(extracted_markdown) <= 51200),

  -- Metadata
  published_at TIMESTAMP WITH TIME ZONE,
  author TEXT,

  -- User selection flag
  selected BOOLEAN NOT NULL DEFAULT FALSE,

  -- Extraction status
  extraction_status TEXT NOT NULL DEFAULT 'pending' CHECK (extraction_status IN (
    'pending',
    'success',
    'failed',
    'blocked',
    'timeout'
  )),
  extraction_error TEXT,
  extraction_time_ms INT,

  -- Audit
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT url_format CHECK (url ~ '^https?://'),
  CONSTRAINT title_length CHECK (CHAR_LENGTH(title) >= 1 AND CHAR_LENGTH(title) <= 500)
);

-- Indexes for research_sources
CREATE INDEX research_sources_job_id_selected ON public.research_sources(research_job_id, selected);
CREATE INDEX research_sources_job_id_status ON public.research_sources(research_job_id, extraction_status);
CREATE INDEX research_sources_url ON public.research_sources(url);
CREATE INDEX research_sources_source_type ON public.research_sources(source_type);

-- URL dedup (unique per job)
CREATE UNIQUE INDEX research_sources_job_url_unique ON public.research_sources(research_job_id, url);

-- RLS for research_sources
ALTER TABLE public.research_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY research_sources_user_select ON public.research_sources
  FOR SELECT USING (
    EXISTS(SELECT 1 FROM public.research_jobs WHERE public.research_jobs.id = public.research_sources.research_job_id AND public.research_jobs.user_id = auth.uid())
  );

CREATE POLICY research_sources_user_insert ON public.research_sources
  FOR INSERT WITH CHECK (
    EXISTS(SELECT 1 FROM public.research_jobs WHERE public.research_jobs.id = public.research_sources.research_job_id AND public.research_jobs.user_id = auth.uid())
  );

CREATE POLICY research_sources_user_update ON public.research_sources
  FOR UPDATE USING (
    EXISTS(SELECT 1 FROM public.research_jobs WHERE public.research_jobs.id = public.research_sources.research_job_id AND public.research_jobs.user_id = auth.uid())
  )
  WITH CHECK (
    research_job_id IS NOT NULL
    AND EXISTS(SELECT 1 FROM public.research_jobs WHERE public.research_jobs.id = public.research_sources.research_job_id AND public.research_jobs.user_id = auth.uid())
  );

CREATE POLICY research_sources_user_delete ON public.research_sources
  FOR DELETE USING (
    EXISTS(SELECT 1 FROM public.research_jobs WHERE public.research_jobs.id = public.research_sources.research_job_id AND public.research_jobs.user_id = auth.uid())
  );

-- ========================================
-- 3. research_angles (proposed angles)
-- ========================================
CREATE TABLE public.research_angles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  research_job_id UUID NOT NULL REFERENCES public.research_jobs(id) ON DELETE CASCADE,

  -- Angle content
  title TEXT NOT NULL CHECK (CHAR_LENGTH(title) >= 5 AND CHAR_LENGTH(title) <= 200),
  hook TEXT NOT NULL CHECK (CHAR_LENGTH(hook) >= 10 AND CHAR_LENGTH(hook) <= 500),
  positioning TEXT CHECK (positioning IS NULL OR CHAR_LENGTH(positioning) <= 1000),

  -- LLM quality scoring
  score DECIMAL(3, 2) CHECK (score >= 0 AND score <= 1.0),

  -- User selection (only one per job via unique partial index)
  selected BOOLEAN NOT NULL DEFAULT FALSE,

  -- Audit
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for research_angles
-- Partial unique index: ensures max one angle selected=true per job
CREATE UNIQUE INDEX research_angles_job_id_selected_partial
  ON public.research_angles(research_job_id)
  WHERE selected = TRUE;

CREATE INDEX research_angles_job_id_score ON public.research_angles(research_job_id, score DESC);
CREATE INDEX research_angles_job_id_selected ON public.research_angles(research_job_id, selected);

-- RLS for research_angles
ALTER TABLE public.research_angles ENABLE ROW LEVEL SECURITY;

CREATE POLICY research_angles_user_select ON public.research_angles
  FOR SELECT USING (
    EXISTS(SELECT 1 FROM public.research_jobs WHERE public.research_jobs.id = public.research_angles.research_job_id AND public.research_jobs.user_id = auth.uid())
  );

CREATE POLICY research_angles_user_insert ON public.research_angles
  FOR INSERT WITH CHECK (
    EXISTS(SELECT 1 FROM public.research_jobs WHERE public.research_jobs.id = public.research_angles.research_job_id AND public.research_jobs.user_id = auth.uid())
  );

CREATE POLICY research_angles_user_update ON public.research_angles
  FOR UPDATE USING (
    EXISTS(SELECT 1 FROM public.research_jobs WHERE public.research_jobs.id = public.research_angles.research_job_id AND public.research_jobs.user_id = auth.uid())
  )
  WITH CHECK (
    research_job_id IS NOT NULL
    AND EXISTS(SELECT 1 FROM public.research_jobs WHERE public.research_jobs.id = public.research_angles.research_job_id AND public.research_jobs.user_id = auth.uid())
  );

CREATE POLICY research_angles_user_delete ON public.research_angles
  FOR DELETE USING (
    EXISTS(SELECT 1 FROM public.research_jobs WHERE public.research_jobs.id = public.research_angles.research_job_id AND public.research_jobs.user_id = auth.uid())
  );

-- ========================================
-- 4. research_scripts (generated scripts)
-- ========================================
CREATE TABLE public.research_scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  research_job_id UUID NOT NULL REFERENCES public.research_jobs(id) ON DELETE CASCADE,
  angle_id UUID NOT NULL REFERENCES public.research_angles(id) ON DELETE CASCADE,

  -- Script content (size-limited)
  script TEXT NOT NULL CHECK (CHAR_LENGTH(script) >= 50 AND CHAR_LENGTH(script) <= 10240),

  -- Structured breakdown (for Director compatibility)
  sections_json JSONB,

  -- Quality metrics
  quality_score DECIMAL(3, 2) CHECK (quality_score >= 0 AND quality_score <= 1.0),
  hook_strength DECIMAL(3, 2),
  source_coverage DECIMAL(3, 2),
  clarity DECIMAL(3, 2),
  originality DECIMAL(3, 2),
  risk_disclosure DECIMAL(3, 2),
  rhythm_fit DECIMAL(3, 2),
  duration_fit DECIMAL(3, 2),

  -- User approval
  approved BOOLEAN NOT NULL DEFAULT FALSE,
  approval_notes TEXT,

  -- Generation metadata
  model_used TEXT,
  tokens_used INT,

  -- Audit
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT hook_strength_range CHECK (hook_strength IS NULL OR (hook_strength >= 0 AND hook_strength <= 1.0)),
  CONSTRAINT source_coverage_range CHECK (source_coverage IS NULL OR (source_coverage >= 0 AND source_coverage <= 1.0)),
  CONSTRAINT clarity_range CHECK (clarity IS NULL OR (clarity >= 0 AND clarity <= 1.0)),
  CONSTRAINT originality_range CHECK (originality IS NULL OR (originality >= 0 AND originality <= 1.0)),
  CONSTRAINT risk_disclosure_range CHECK (risk_disclosure IS NULL OR (risk_disclosure >= 0 AND risk_disclosure <= 1.0)),
  CONSTRAINT rhythm_fit_range CHECK (rhythm_fit IS NULL OR (rhythm_fit >= 0 AND rhythm_fit <= 1.0)),
  CONSTRAINT duration_fit_range CHECK (duration_fit IS NULL OR (duration_fit >= 0 AND duration_fit <= 1.0)),
  CONSTRAINT sections_json_valid CHECK (sections_json IS NULL OR jsonb_typeof(sections_json) = 'array'),
  CONSTRAINT sections_json_size CHECK (sections_json IS NULL OR CHAR_LENGTH(sections_json::TEXT) <= 5120)
);

-- Indexes for research_scripts
CREATE INDEX research_scripts_job_id_approved ON public.research_scripts(research_job_id, approved);
CREATE INDEX research_scripts_quality_score ON public.research_scripts(quality_score DESC);
CREATE INDEX research_scripts_angle_id ON public.research_scripts(angle_id);

-- RLS for research_scripts
ALTER TABLE public.research_scripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY research_scripts_user_select ON public.research_scripts
  FOR SELECT USING (
    EXISTS(SELECT 1 FROM public.research_jobs WHERE public.research_jobs.id = public.research_scripts.research_job_id AND public.research_jobs.user_id = auth.uid())
  );

CREATE POLICY research_scripts_user_insert ON public.research_scripts
  FOR INSERT WITH CHECK (
    EXISTS(SELECT 1 FROM public.research_jobs WHERE public.research_jobs.id = public.research_scripts.research_job_id AND public.research_jobs.user_id = auth.uid())
  );

CREATE POLICY research_scripts_user_update ON public.research_scripts
  FOR UPDATE USING (
    EXISTS(SELECT 1 FROM public.research_jobs WHERE public.research_jobs.id = public.research_scripts.research_job_id AND public.research_jobs.user_id = auth.uid())
  )
  WITH CHECK (
    research_job_id IS NOT NULL
    AND EXISTS(SELECT 1 FROM public.research_jobs WHERE public.research_jobs.id = public.research_scripts.research_job_id AND public.research_jobs.user_id = auth.uid())
  );

CREATE POLICY research_scripts_user_delete ON public.research_scripts
  FOR DELETE USING (
    EXISTS(SELECT 1 FROM public.research_jobs WHERE public.research_jobs.id = public.research_scripts.research_job_id AND public.research_jobs.user_id = auth.uid())
  );

-- ========================================
-- 5. research_storyboards (scene breakdown)
-- ========================================
CREATE TABLE public.research_storyboards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  research_job_id UUID NOT NULL REFERENCES public.research_jobs(id) ON DELETE CASCADE,
  script_id UUID NOT NULL REFERENCES public.research_scripts(id) ON DELETE CASCADE,

  -- Scenes compatible with Director shape
  scenes_json JSONB NOT NULL,

  -- Audit
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT scenes_json_valid CHECK (
    CASE
      WHEN jsonb_typeof(scenes_json) = 'array'
      THEN jsonb_array_length(scenes_json) > 0
      ELSE FALSE
    END
  ),
  CONSTRAINT scenes_json_size CHECK (CHAR_LENGTH(scenes_json::TEXT) <= 102400)
);

-- Indexes for research_storyboards
CREATE INDEX research_storyboards_job_id ON public.research_storyboards(research_job_id);
CREATE INDEX research_storyboards_script_id ON public.research_storyboards(script_id);

-- RLS for research_storyboards
ALTER TABLE public.research_storyboards ENABLE ROW LEVEL SECURITY;

CREATE POLICY research_storyboards_user_select ON public.research_storyboards
  FOR SELECT USING (
    EXISTS(SELECT 1 FROM public.research_jobs WHERE public.research_jobs.id = public.research_storyboards.research_job_id AND public.research_jobs.user_id = auth.uid())
  );

CREATE POLICY research_storyboards_user_insert ON public.research_storyboards
  FOR INSERT WITH CHECK (
    EXISTS(SELECT 1 FROM public.research_jobs WHERE public.research_jobs.id = public.research_storyboards.research_job_id AND public.research_jobs.user_id = auth.uid())
  );

CREATE POLICY research_storyboards_user_update ON public.research_storyboards
  FOR UPDATE USING (
    EXISTS(SELECT 1 FROM public.research_jobs WHERE public.research_jobs.id = public.research_storyboards.research_job_id AND public.research_jobs.user_id = auth.uid())
  )
  WITH CHECK (
    research_job_id IS NOT NULL
    AND EXISTS(SELECT 1 FROM public.research_jobs WHERE public.research_jobs.id = public.research_storyboards.research_job_id AND public.research_jobs.user_id = auth.uid())
  );

CREATE POLICY research_storyboards_user_delete ON public.research_storyboards
  FOR DELETE USING (
    EXISTS(SELECT 1 FROM public.research_jobs WHERE public.research_jobs.id = public.research_storyboards.research_job_id AND public.research_jobs.user_id = auth.uid())
  );

-- ========================================
-- 6. updated_at maintenance
-- ========================================
-- Reuse the existing project helper created by earlier migrations.
DROP TRIGGER IF EXISTS trg_research_jobs_updated_at ON public.research_jobs;
CREATE TRIGGER trg_research_jobs_updated_at
  BEFORE UPDATE ON public.research_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_research_sources_updated_at ON public.research_sources;
CREATE TRIGGER trg_research_sources_updated_at
  BEFORE UPDATE ON public.research_sources
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_research_scripts_updated_at ON public.research_scripts;
CREATE TRIGGER trg_research_scripts_updated_at
  BEFORE UPDATE ON public.research_scripts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
