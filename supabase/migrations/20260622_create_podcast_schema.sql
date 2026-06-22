-- T-1131b+c: Podcast Video backend base — podcasts / podcast_speakers / podcast_segments.
-- No render, no TTS yet. No seeded data. Per-user RLS (children via podcast ownership join).
-- Service role bypasses RLS implicitly — no redundant service-role policies.

-- ─────────────────────────────────────────────────────────────────────────
-- podcasts
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.podcasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Untitled podcast'
    CHECK (char_length(title) BETWEEN 1 AND 200),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scripting', 'ready', 'failed')),
  source_mode TEXT NOT NULL
    CHECK (source_mode IN ('generate', 'upload')),
  source_topic TEXT CHECK (source_topic IS NULL OR char_length(source_topic) <= 2000),
  source_asset_url TEXT CHECK (source_asset_url IS NULL OR source_asset_url ~ '^https?://'),
  layout TEXT NOT NULL DEFAULT 'two_shot'
    CHECK (layout IN ('two_shot', 'split_screen', 'talk_show')),
  aspect_ratio TEXT NOT NULL DEFAULT '16:9'
    CHECK (aspect_ratio IN ('16:9', '9:16')),
  language TEXT NOT NULL DEFAULT 'en-US'
    CHECK (language ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  error_message TEXT CHECK (error_message IS NULL OR char_length(error_message) <= 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS podcasts_user_id_created_at
  ON public.podcasts(user_id, created_at DESC);

ALTER TABLE public.podcasts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS podcasts_user_select ON public.podcasts;
CREATE POLICY podcasts_user_select ON public.podcasts
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS podcasts_user_insert ON public.podcasts;
CREATE POLICY podcasts_user_insert ON public.podcasts
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS podcasts_user_update ON public.podcasts;
CREATE POLICY podcasts_user_update ON public.podcasts
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS podcasts_user_delete ON public.podcasts;
CREATE POLICY podcasts_user_delete ON public.podcasts
  FOR DELETE USING (user_id = auth.uid());

DROP TRIGGER IF EXISTS trg_podcasts_updated_at ON public.podcasts;
CREATE TRIGGER trg_podcasts_updated_at
  BEFORE UPDATE ON public.podcasts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ─────────────────────────────────────────────────────────────────────────
-- podcast_speakers
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.podcast_speakers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  podcast_id UUID NOT NULL REFERENCES public.podcasts(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  role TEXT NOT NULL CHECK (role IN ('host', 'guest')),
  position SMALLINT NOT NULL,
  avatar_id TEXT CHECK (avatar_id IS NULL OR char_length(avatar_id) <= 200),
  voice_id TEXT CHECK (voice_id IS NULL OR char_length(voice_id) <= 200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS podcast_speakers_podcast_id_position
  ON public.podcast_speakers(podcast_id, position);
CREATE UNIQUE INDEX IF NOT EXISTS podcast_speakers_podcast_id_role_unique
  ON public.podcast_speakers(podcast_id, role);

ALTER TABLE public.podcast_speakers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS podcast_speakers_user_select ON public.podcast_speakers;
CREATE POLICY podcast_speakers_user_select ON public.podcast_speakers
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.podcasts p WHERE p.id = podcast_id AND p.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS podcast_speakers_user_insert ON public.podcast_speakers;
CREATE POLICY podcast_speakers_user_insert ON public.podcast_speakers
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM public.podcasts p WHERE p.id = podcast_id AND p.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS podcast_speakers_user_update ON public.podcast_speakers;
CREATE POLICY podcast_speakers_user_update ON public.podcast_speakers
  FOR UPDATE USING (EXISTS (
    SELECT 1 FROM public.podcasts p WHERE p.id = podcast_id AND p.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.podcasts p WHERE p.id = podcast_id AND p.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS podcast_speakers_user_delete ON public.podcast_speakers;
CREATE POLICY podcast_speakers_user_delete ON public.podcast_speakers
  FOR DELETE USING (EXISTS (
    SELECT 1 FROM public.podcasts p WHERE p.id = podcast_id AND p.user_id = auth.uid()
  ));

-- ─────────────────────────────────────────────────────────────────────────
-- podcast_segments
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.podcast_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  podcast_id UUID NOT NULL REFERENCES public.podcasts(id) ON DELETE CASCADE,
  speaker_id UUID NOT NULL REFERENCES public.podcast_speakers(id) ON DELETE CASCADE,
  order_index INT NOT NULL,
  text TEXT NOT NULL CHECK (char_length(text) BETWEEN 1 AND 600),
  audio_url TEXT CHECK (audio_url IS NULL OR audio_url ~ '^https?://'),
  start_ms INT CHECK (start_ms IS NULL OR start_ms >= 0),
  end_ms INT CHECK (end_ms IS NULL OR end_ms >= 0),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'ready', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS podcast_segments_podcast_id_order
  ON public.podcast_segments(podcast_id, order_index);
CREATE UNIQUE INDEX IF NOT EXISTS podcast_segments_podcast_id_order_unique
  ON public.podcast_segments(podcast_id, order_index);

ALTER TABLE public.podcast_segments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS podcast_segments_user_select ON public.podcast_segments;
CREATE POLICY podcast_segments_user_select ON public.podcast_segments
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.podcasts p WHERE p.id = podcast_id AND p.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS podcast_segments_user_insert ON public.podcast_segments;
CREATE POLICY podcast_segments_user_insert ON public.podcast_segments
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM public.podcasts p WHERE p.id = podcast_id AND p.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS podcast_segments_user_update ON public.podcast_segments;
CREATE POLICY podcast_segments_user_update ON public.podcast_segments
  FOR UPDATE USING (EXISTS (
    SELECT 1 FROM public.podcasts p WHERE p.id = podcast_id AND p.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.podcasts p WHERE p.id = podcast_id AND p.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS podcast_segments_user_delete ON public.podcast_segments;
CREATE POLICY podcast_segments_user_delete ON public.podcast_segments
  FOR DELETE USING (EXISTS (
    SELECT 1 FROM public.podcasts p WHERE p.id = podcast_id AND p.user_id = auth.uid()
  ));
