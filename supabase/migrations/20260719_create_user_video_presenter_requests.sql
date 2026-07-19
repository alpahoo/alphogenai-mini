-- White-label queue for high-fidelity video presenters.
-- Source and consent footage stay private. A local Playwright worker submits
-- the request through the provider web app, then publishes only the completed
-- avatar into user_presenters.

CREATE TABLE IF NOT EXISTS public.user_video_presenter_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  provider_name TEXT NOT NULL CHECK (char_length(provider_name) BETWEEN 1 AND 160),
  source_video_path TEXT NOT NULL CHECK (char_length(source_video_path) BETWEEN 1 AND 500),
  consent_video_path TEXT NOT NULL CHECK (char_length(consent_video_path) BETWEEN 1 AND 500),
  source_mime TEXT NOT NULL CHECK (source_mime IN ('video/mp4', 'video/quicktime', 'video/webm')),
  consent_mime TEXT NOT NULL CHECK (consent_mime IN ('video/mp4', 'video/quicktime', 'video/webm')),
  source_size_bytes BIGINT NOT NULL CHECK (source_size_bytes BETWEEN 1 AND 209715200),
  consent_size_bytes BIGINT NOT NULL CHECK (consent_size_bytes BETWEEN 1 AND 104857600),
  status TEXT NOT NULL DEFAULT 'uploading' CHECK (
    status IN (
      'uploading', 'pending', 'claimed', 'submitted', 'processing',
      'ready', 'failed', 'needs_login', 'needs_review', 'removed'
    )
  ),
  external_avatar_id TEXT,
  presenter_id UUID REFERENCES public.user_presenters(id) ON DELETE SET NULL,
  error_code TEXT,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  claimed_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  ready_at TIMESTAMPTZ,
  consent_confirmed_at TIMESTAMPTZ NOT NULL,
  consent_statement_version TEXT NOT NULL CHECK (char_length(consent_statement_version) BETWEEN 1 AND 60),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_video_presenter_requests_user_created_at
  ON public.user_video_presenter_requests(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS user_video_presenter_requests_worker_queue
  ON public.user_video_presenter_requests(status, created_at)
  WHERE status IN ('pending', 'submitted', 'processing');

ALTER TABLE public.user_video_presenter_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_video_presenter_requests_select ON public.user_video_presenter_requests;
CREATE POLICY user_video_presenter_requests_select ON public.user_video_presenter_requests
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS user_video_presenter_requests_insert ON public.user_video_presenter_requests;
CREATE POLICY user_video_presenter_requests_insert ON public.user_video_presenter_requests
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS user_video_presenter_requests_update ON public.user_video_presenter_requests;
CREATE POLICY user_video_presenter_requests_update ON public.user_video_presenter_requests
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS user_video_presenter_requests_delete ON public.user_video_presenter_requests;
CREATE POLICY user_video_presenter_requests_delete ON public.user_video_presenter_requests
  FOR DELETE USING (user_id = auth.uid());

DROP TRIGGER IF EXISTS user_video_presenter_requests_updated_at
  ON public.user_video_presenter_requests;
CREATE TRIGGER user_video_presenter_requests_updated_at
  BEFORE UPDATE ON public.user_video_presenter_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'user-video-presenters',
  'user-video-presenters',
  false,
  209715200,
  ARRAY['video/mp4', 'video/quicktime', 'video/webm']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Users upload their own video presenter footage" ON storage.objects;
CREATE POLICY "Users upload their own video presenter footage" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'user-video-presenters'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users read their own video presenter footage" ON storage.objects;
CREATE POLICY "Users read their own video presenter footage" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'user-video-presenters'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users delete their own video presenter footage" ON storage.objects;
CREATE POLICY "Users delete their own video presenter footage" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'user-video-presenters'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
