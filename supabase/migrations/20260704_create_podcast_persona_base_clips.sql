-- T-1143a: Podcast persona base clip cache.
--
-- Goal:
--   Cache short HeyGen base clips per persona/aspect/mode so future talking
--   podcast render modes can lip-sync against a permanent R2 video URL instead
--   of regenerating or relying on expiring HeyGen URLs.
--
-- Strictly additive. No runtime wiring in this migration.

CREATE TABLE IF NOT EXISTS public.podcast_persona_base_clips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id UUID NOT NULL REFERENCES public.podcast_personas(id) ON DELETE CASCADE,

  provider TEXT NOT NULL DEFAULT 'heygen'
    CHECK (provider IN ('heygen')),
  provider_avatar_id TEXT
    CHECK (provider_avatar_id IS NULL OR char_length(provider_avatar_id) <= 200),
  provider_video_id TEXT
    CHECK (provider_video_id IS NULL OR char_length(provider_video_id) <= 200),

  -- Cache key dimensions. The prompt version lets us regenerate a better
  -- neutral base clip later without overwriting old clips in-place.
  aspect_ratio TEXT NOT NULL DEFAULT '16:9'
    CHECK (aspect_ratio IN ('16:9', '9:16', '1:1')),
  resolution TEXT NOT NULL DEFAULT '720p'
    CHECK (resolution IN ('720p', '1080p')),
  clip_kind TEXT NOT NULL DEFAULT 'talking_head'
    CHECK (clip_kind IN ('talking_head')),
  prompt_version TEXT NOT NULL DEFAULT 'base-v1'
    CHECK (char_length(prompt_version) BETWEEN 1 AND 80),

  -- Permanent copy of the base clip. Do not store HeyGen expiring URLs here.
  video_url TEXT
    CHECK (video_url IS NULL OR char_length(video_url) <= 1000),
  storage_key TEXT
    CHECK (storage_key IS NULL OR char_length(storage_key) <= 500),
  duration_seconds NUMERIC,

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'ready', 'failed', 'removed')),
  error_message TEXT
    CHECK (error_message IS NULL OR char_length(error_message) <= 1000),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT podcast_persona_base_clips_ready_requires_video
    CHECK (status <> 'ready' OR video_url IS NOT NULL),
  CONSTRAINT podcast_persona_base_clips_duration_nonnegative
    CHECK (duration_seconds IS NULL OR duration_seconds >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS podcast_persona_base_clips_unique_ready_key
  ON public.podcast_persona_base_clips (
    persona_id,
    provider,
    aspect_ratio,
    resolution,
    clip_kind,
    prompt_version
  )
  WHERE status <> 'removed';

CREATE INDEX IF NOT EXISTS podcast_persona_base_clips_persona_status
  ON public.podcast_persona_base_clips(persona_id, status, created_at DESC);

CREATE TRIGGER podcast_persona_base_clips_updated_at
  BEFORE UPDATE ON public.podcast_persona_base_clips
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.podcast_persona_base_clips ENABLE ROW LEVEL SECURITY;

-- Users can read base clips for their own personas and active catalog personas.
DROP POLICY IF EXISTS podcast_persona_base_clips_select ON public.podcast_persona_base_clips;
CREATE POLICY podcast_persona_base_clips_select ON public.podcast_persona_base_clips
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.podcast_personas p
      WHERE p.id = podcast_persona_base_clips.persona_id
        AND (
          p.user_id = auth.uid()
          OR (p.user_id IS NULL AND p.status = 'active')
        )
    )
  );

-- User-owned persona clips can be written by the owner. Catalog clip writes are
-- service-role/admin only because catalog personas have user_id NULL.
DROP POLICY IF EXISTS podcast_persona_base_clips_insert ON public.podcast_persona_base_clips;
CREATE POLICY podcast_persona_base_clips_insert ON public.podcast_persona_base_clips
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.podcast_personas p
      WHERE p.id = persona_id
        AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS podcast_persona_base_clips_update ON public.podcast_persona_base_clips;
CREATE POLICY podcast_persona_base_clips_update ON public.podcast_persona_base_clips
  FOR UPDATE USING (
    EXISTS (
      SELECT 1
      FROM public.podcast_personas p
      WHERE p.id = podcast_persona_base_clips.persona_id
        AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.podcast_personas p
      WHERE p.id = persona_id
        AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS podcast_persona_base_clips_delete ON public.podcast_persona_base_clips;
CREATE POLICY podcast_persona_base_clips_delete ON public.podcast_persona_base_clips
  FOR DELETE USING (
    EXISTS (
      SELECT 1
      FROM public.podcast_personas p
      WHERE p.id = podcast_persona_base_clips.persona_id
        AND p.user_id = auth.uid()
    )
  );

