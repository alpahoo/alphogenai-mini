-- Reusable account-owned presenters for Product Ad and future workflows.
-- Provider-neutral by design: public product APIs never expose vendor names.

CREATE TABLE IF NOT EXISTS public.user_presenters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  portrait_path TEXT NOT NULL CHECK (char_length(portrait_path) BETWEEN 1 AND 500),
  thumb_path TEXT CHECK (thumb_path IS NULL OR char_length(thumb_path) <= 500),
  image_sha256 TEXT NOT NULL CHECK (image_sha256 ~ '^[0-9a-f]{64}$'),
  external_avatar_id TEXT,
  external_task_id TEXT,
  status TEXT NOT NULL DEFAULT 'uploaded'
    CHECK (status IN ('uploaded', 'processing', 'ready', 'failed', 'removed')),
  error_message TEXT,
  consent_confirmed_at TIMESTAMPTZ NOT NULL,
  consent_statement_version TEXT NOT NULL
    CHECK (char_length(consent_statement_version) BETWEEN 1 AND 60),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_presenters_user_created_at
  ON public.user_presenters(user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS user_presenters_active_image
  ON public.user_presenters(user_id, image_sha256)
  WHERE status <> 'removed';

ALTER TABLE public.user_presenters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_presenters_select ON public.user_presenters;
CREATE POLICY user_presenters_select ON public.user_presenters
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS user_presenters_insert ON public.user_presenters;
CREATE POLICY user_presenters_insert ON public.user_presenters
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS user_presenters_update ON public.user_presenters;
CREATE POLICY user_presenters_update ON public.user_presenters
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS user_presenters_delete ON public.user_presenters;
CREATE POLICY user_presenters_delete ON public.user_presenters
  FOR DELETE USING (user_id = auth.uid());

DROP TRIGGER IF EXISTS user_presenters_updated_at ON public.user_presenters;
CREATE TRIGGER user_presenters_updated_at
  BEFORE UPDATE ON public.user_presenters
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Private normalized portraits. Files always live under {auth.uid()}/.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'user-presenters',
  'user-presenters',
  false,
  10485760,
  ARRAY['image/jpeg']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Users upload their own presenters" ON storage.objects;
CREATE POLICY "Users upload their own presenters" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'user-presenters'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users read their own presenters" ON storage.objects;
CREATE POLICY "Users read their own presenters" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'user-presenters'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users delete their own presenters" ON storage.objects;
CREATE POLICY "Users delete their own presenters" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'user-presenters'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
