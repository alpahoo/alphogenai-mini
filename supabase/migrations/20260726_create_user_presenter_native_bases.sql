-- Reusable private performance clips for the AlphoGen-native presenter track.
-- These assets require a retention consent distinct from the one-time
-- processing consent used by user_video_presenter_requests.

CREATE TABLE IF NOT EXISTS public.user_presenter_native_bases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id UUID REFERENCES public.user_video_presenter_requests(id) ON DELETE SET NULL,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  video_path TEXT NOT NULL CHECK (char_length(video_path) BETWEEN 1 AND 500),
  video_mime TEXT NOT NULL CHECK (
    video_mime IN ('video/mp4', 'video/quicktime', 'video/webm')
  ),
  video_size_bytes BIGINT NOT NULL CHECK (
    video_size_bytes BETWEEN 65536 AND 209715200
  ),
  status TEXT NOT NULL DEFAULT 'uploading' CHECK (
    status IN ('uploading', 'uploaded', 'normalizing', 'ready', 'failed', 'removed')
  ),
  error_code TEXT,
  consent_confirmed_at TIMESTAMPTZ NOT NULL,
  consent_statement_version TEXT NOT NULL CHECK (
    char_length(consent_statement_version) BETWEEN 1 AND 60
  ),
  retention_until TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '1 year'),
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS user_presenter_native_bases_active_request
  ON public.user_presenter_native_bases(request_id)
  WHERE request_id IS NOT NULL AND status <> 'removed';

CREATE INDEX IF NOT EXISTS user_presenter_native_bases_user_created_at
  ON public.user_presenter_native_bases(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS user_presenter_native_bases_retention
  ON public.user_presenter_native_bases(retention_until)
  WHERE status <> 'removed';

ALTER TABLE public.user_presenter_native_bases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_presenter_native_bases_select
  ON public.user_presenter_native_bases;
CREATE POLICY user_presenter_native_bases_select
  ON public.user_presenter_native_bases
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS user_presenter_native_bases_insert
  ON public.user_presenter_native_bases;
CREATE POLICY user_presenter_native_bases_insert
  ON public.user_presenter_native_bases
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS user_presenter_native_bases_update
  ON public.user_presenter_native_bases;
CREATE POLICY user_presenter_native_bases_update
  ON public.user_presenter_native_bases
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS user_presenter_native_bases_delete
  ON public.user_presenter_native_bases;
CREATE POLICY user_presenter_native_bases_delete
  ON public.user_presenter_native_bases
  FOR DELETE USING (user_id = auth.uid());

DROP TRIGGER IF EXISTS user_presenter_native_bases_updated_at
  ON public.user_presenter_native_bases;
CREATE TRIGGER user_presenter_native_bases_updated_at
  BEFORE UPDATE ON public.user_presenter_native_bases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'user-presenter-native-bases',
  'user-presenter-native-bases',
  false,
  209715200,
  ARRAY['video/mp4', 'video/quicktime', 'video/webm']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Users upload their own native presenter bases"
  ON storage.objects;
CREATE POLICY "Users upload their own native presenter bases"
  ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'user-presenter-native-bases'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users read their own native presenter bases"
  ON storage.objects;
CREATE POLICY "Users read their own native presenter bases"
  ON storage.objects
  FOR SELECT USING (
    bucket_id = 'user-presenter-native-bases'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users delete their own native presenter bases"
  ON storage.objects;
CREATE POLICY "Users delete their own native presenter bases"
  ON storage.objects
  FOR DELETE USING (
    bucket_id = 'user-presenter-native-bases'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
