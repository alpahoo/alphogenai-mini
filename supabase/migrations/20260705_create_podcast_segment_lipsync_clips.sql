-- T-1144b Phase 1: Podcast per-segment lip-sync clip cache.
--
-- Next.js orchestrates paid HeyGen lip-sync calls and writes durable R2 URLs here.
-- Modal only reads READY rows while composing the final podcast. The cache key
-- captures segment audio + base clip + mode so re-renders do not spend again.

CREATE TABLE IF NOT EXISTS public.podcast_segment_lipsync_clips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  podcast_id UUID NOT NULL REFERENCES public.podcasts(id) ON DELETE CASCADE,
  segment_id UUID NOT NULL REFERENCES public.podcast_segments(id) ON DELETE CASCADE,
  speaker_id UUID NOT NULL REFERENCES public.podcast_speakers(id) ON DELETE CASCADE,
  persona_id UUID REFERENCES public.podcast_personas(id) ON DELETE SET NULL,
  base_clip_id UUID REFERENCES public.podcast_persona_base_clips(id) ON DELETE SET NULL,

  audio_url TEXT NOT NULL CHECK (char_length(audio_url) <= 1000),
  cache_key TEXT NOT NULL CHECK (char_length(cache_key) BETWEEN 1 AND 120),

  mode TEXT NOT NULL DEFAULT 'precision'
    CHECK (mode IN ('speed', 'precision')),
  provider TEXT NOT NULL DEFAULT 'heygen'
    CHECK (provider IN ('heygen')),
  provider_task_id TEXT
    CHECK (provider_task_id IS NULL OR char_length(provider_task_id) <= 200),

  video_url TEXT
    CHECK (video_url IS NULL OR char_length(video_url) <= 1000),
  storage_key TEXT
    CHECK (storage_key IS NULL OR char_length(storage_key) <= 500),
  duration_seconds NUMERIC,
  credits_usd NUMERIC,

  status TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'ready', 'failed', 'removed')),
  error_message TEXT
    CHECK (error_message IS NULL OR char_length(error_message) <= 1000),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT podcast_segment_lipsync_ready_requires_video
    CHECK (status <> 'ready' OR video_url IS NOT NULL),
  CONSTRAINT podcast_segment_lipsync_duration_nonnegative
    CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  CONSTRAINT podcast_segment_lipsync_cost_nonnegative
    CHECK (credits_usd IS NULL OR credits_usd >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS podcast_segment_lipsync_unique_cache
  ON public.podcast_segment_lipsync_clips(segment_id, cache_key)
  WHERE status <> 'removed';

CREATE INDEX IF NOT EXISTS podcast_segment_lipsync_podcast_status
  ON public.podcast_segment_lipsync_clips(podcast_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS podcast_segment_lipsync_segment
  ON public.podcast_segment_lipsync_clips(segment_id);

DROP TRIGGER IF EXISTS podcast_segment_lipsync_clips_updated_at
  ON public.podcast_segment_lipsync_clips;
CREATE TRIGGER podcast_segment_lipsync_clips_updated_at
  BEFORE UPDATE ON public.podcast_segment_lipsync_clips
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.podcast_segment_lipsync_clips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS podcast_segment_lipsync_select ON public.podcast_segment_lipsync_clips;
CREATE POLICY podcast_segment_lipsync_select ON public.podcast_segment_lipsync_clips
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.podcasts p
      WHERE p.id = podcast_segment_lipsync_clips.podcast_id
        AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS podcast_segment_lipsync_insert ON public.podcast_segment_lipsync_clips;
CREATE POLICY podcast_segment_lipsync_insert ON public.podcast_segment_lipsync_clips
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.podcasts p
      WHERE p.id = podcast_id
        AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS podcast_segment_lipsync_update ON public.podcast_segment_lipsync_clips;
CREATE POLICY podcast_segment_lipsync_update ON public.podcast_segment_lipsync_clips
  FOR UPDATE USING (
    EXISTS (
      SELECT 1
      FROM public.podcasts p
      WHERE p.id = podcast_segment_lipsync_clips.podcast_id
        AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.podcasts p
      WHERE p.id = podcast_id
        AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS podcast_segment_lipsync_delete ON public.podcast_segment_lipsync_clips;
CREATE POLICY podcast_segment_lipsync_delete ON public.podcast_segment_lipsync_clips
  FOR DELETE USING (
    EXISTS (
      SELECT 1
      FROM public.podcasts p
      WHERE p.id = podcast_segment_lipsync_clips.podcast_id
        AND p.user_id = auth.uid()
    )
  );
