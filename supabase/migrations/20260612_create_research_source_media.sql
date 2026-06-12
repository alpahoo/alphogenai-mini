-- T-1110c: research_source_media — collected source media candidates (metadata
-- only; no download at collection). Ownership via research_jobs join (no
-- user_id column), RLS enforced, dedupe per (research_job_id, source_url).

CREATE TABLE public.research_source_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  research_job_id UUID NOT NULL REFERENCES public.research_jobs(id) ON DELETE CASCADE,
  research_source_id UUID REFERENCES public.research_sources(id) ON DELETE CASCADE,

  kind TEXT NOT NULL CHECK (kind IN (
    'og_image', 'twitter_image', 'inline_image', 'page_screenshot',
    'video_thumbnail', 'logo', 'doc_capture'
  )),
  source_url TEXT NOT NULL,            -- original public media URL discovered on the page
  storage_path TEXT,                   -- set only after user selects + copy into `references` bucket

  width INT,
  height INT,
  mime TEXT,

  selected BOOLEAN NOT NULL DEFAULT FALSE,
  rights_status TEXT NOT NULL DEFAULT 'unverified' CHECK (rights_status IN (
    'unverified', 'user_confirmed'
  )),
  risk_note TEXT,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT source_url_format CHECK (source_url ~ '^https?://')
);

-- Dedupe candidates per job (idempotent re-collection)
CREATE UNIQUE INDEX research_source_media_job_url_unique
  ON public.research_source_media(research_job_id, source_url);
CREATE INDEX research_source_media_job_id ON public.research_source_media(research_job_id);
CREATE INDEX research_source_media_job_selected ON public.research_source_media(research_job_id, selected);

-- RLS: ownership via the parent research_jobs row (no user_id column here)
ALTER TABLE public.research_source_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY research_source_media_user_select ON public.research_source_media
  FOR SELECT USING (
    EXISTS(SELECT 1 FROM public.research_jobs WHERE public.research_jobs.id = public.research_source_media.research_job_id AND public.research_jobs.user_id = auth.uid())
  );

CREATE POLICY research_source_media_user_insert ON public.research_source_media
  FOR INSERT WITH CHECK (
    EXISTS(SELECT 1 FROM public.research_jobs WHERE public.research_jobs.id = public.research_source_media.research_job_id AND public.research_jobs.user_id = auth.uid())
  );

CREATE POLICY research_source_media_user_update ON public.research_source_media
  FOR UPDATE USING (
    EXISTS(SELECT 1 FROM public.research_jobs WHERE public.research_jobs.id = public.research_source_media.research_job_id AND public.research_jobs.user_id = auth.uid())
  )
  WITH CHECK (
    research_job_id IS NOT NULL
    AND EXISTS(SELECT 1 FROM public.research_jobs WHERE public.research_jobs.id = public.research_source_media.research_job_id AND public.research_jobs.user_id = auth.uid())
  );

CREATE POLICY research_source_media_user_delete ON public.research_source_media
  FOR DELETE USING (
    EXISTS(SELECT 1 FROM public.research_jobs WHERE public.research_jobs.id = public.research_source_media.research_job_id AND public.research_jobs.user_id = auth.uid())
  );
