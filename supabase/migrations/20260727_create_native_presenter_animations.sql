-- Private speech-animation jobs for the AlphoGen-native presenter track.
-- Audio inputs and animated outputs stay in an own-only Supabase bucket.

CREATE TABLE IF NOT EXISTS public.user_presenter_native_animations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  native_base_id UUID NOT NULL
    REFERENCES public.user_presenter_native_bases(id) ON DELETE CASCADE,
  audio_path TEXT NOT NULL CHECK (char_length(audio_path) BETWEEN 1 AND 500),
  audio_mime TEXT NOT NULL CHECK (
    audio_mime IN (
      'audio/mpeg',
      'audio/mp4',
      'audio/wav',
      'audio/x-wav',
      'audio/webm'
    )
  ),
  audio_size_bytes BIGINT NOT NULL CHECK (
    audio_size_bytes BETWEEN 1024 AND 26214400
  ),
  audio_sha256 TEXT NOT NULL CHECK (audio_sha256 ~ '^[a-f0-9]{64}$'),
  output_video_path TEXT CHECK (
    output_video_path IS NULL
    OR char_length(output_video_path) BETWEEN 1 AND 500
  ),
  output_duration_seconds NUMERIC(8,3) CHECK (
    output_duration_seconds IS NULL
    OR output_duration_seconds BETWEEN 0.5 AND 8.5
  ),
  status TEXT NOT NULL DEFAULT 'uploading' CHECK (
    status IN (
      'uploading',
      'uploaded',
      'processing',
      'ready',
      'failed',
      'needs_review',
      'removed'
    )
  ),
  provider_task_id TEXT,
  animation_version TEXT NOT NULL DEFAULT 'native-lipsync-v1',
  error_code TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS user_presenter_native_animations_cache
  ON public.user_presenter_native_animations(
    user_id,
    native_base_id,
    audio_sha256,
    animation_version
  )
  WHERE status <> 'removed';

CREATE INDEX IF NOT EXISTS user_presenter_native_animations_processing
  ON public.user_presenter_native_animations(status, updated_at)
  WHERE status IN ('uploaded', 'processing', 'failed', 'needs_review');

ALTER TABLE public.user_presenter_native_animations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_presenter_native_animations_select
  ON public.user_presenter_native_animations;
CREATE POLICY user_presenter_native_animations_select
  ON public.user_presenter_native_animations
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS user_presenter_native_animations_insert
  ON public.user_presenter_native_animations;
CREATE POLICY user_presenter_native_animations_insert
  ON public.user_presenter_native_animations
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS user_presenter_native_animations_update
  ON public.user_presenter_native_animations;
CREATE POLICY user_presenter_native_animations_update
  ON public.user_presenter_native_animations
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS user_presenter_native_animations_delete
  ON public.user_presenter_native_animations;
CREATE POLICY user_presenter_native_animations_delete
  ON public.user_presenter_native_animations
  FOR DELETE USING (user_id = auth.uid());

DROP TRIGGER IF EXISTS user_presenter_native_animations_updated_at
  ON public.user_presenter_native_animations;
CREATE TRIGGER user_presenter_native_animations_updated_at
  BEFORE UPDATE ON public.user_presenter_native_animations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'user-presenter-native-animations',
  'user-presenter-native-animations',
  false,
  26214400,
  ARRAY[
    'audio/mpeg',
    'audio/mp4',
    'audio/wav',
    'audio/x-wav',
    'audio/webm',
    'video/mp4'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Users upload their own native presenter animation media"
  ON storage.objects;
CREATE POLICY "Users upload their own native presenter animation media"
  ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'user-presenter-native-animations'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users read their own native presenter animation media"
  ON storage.objects;
CREATE POLICY "Users read their own native presenter animation media"
  ON storage.objects
  FOR SELECT USING (
    bucket_id = 'user-presenter-native-animations'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users delete their own native presenter animation media"
  ON storage.objects;
CREATE POLICY "Users delete their own native presenter animation media"
  ON storage.objects
  FOR DELETE USING (
    bucket_id = 'user-presenter-native-animations'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
