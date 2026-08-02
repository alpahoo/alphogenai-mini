-- Clipping packs: one private long-form source transformed into ranked Shorts.
CREATE TABLE IF NOT EXISTS public.clipping_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  source_path TEXT NOT NULL,
  source_mime TEXT NOT NULL CHECK (source_mime IN ('video/mp4','video/quicktime','video/webm')),
  source_size_bytes BIGINT NOT NULL CHECK (source_size_bytes > 0),
  clip_count INT NOT NULL DEFAULT 3 CHECK (clip_count BETWEEN 1 AND 8),
  status TEXT NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading','queued','processing','ready','partial','failed','archived')),
  error_message TEXT CHECK (error_message IS NULL OR char_length(error_message) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS clipping_packs_user_created ON public.clipping_packs(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.clipping_pack_clips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id UUID NOT NULL REFERENCES public.clipping_packs(id) ON DELETE CASCADE,
  rank INT NOT NULL CHECK (rank BETWEEN 1 AND 8),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  transcript TEXT NOT NULL DEFAULT '',
  start_seconds DOUBLE PRECISION NOT NULL CHECK (start_seconds >= 0),
  end_seconds DOUBLE PRECISION NOT NULL CHECK (end_seconds > start_seconds),
  score DOUBLE PRECISION NOT NULL DEFAULT 0,
  video_url TEXT CHECK (video_url IS NULL OR video_url ~ '^https?://'),
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','ready','failed')),
  error_message TEXT CHECK (error_message IS NULL OR char_length(error_message) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(pack_id, rank)
);
CREATE INDEX IF NOT EXISTS clipping_pack_clips_pack_rank ON public.clipping_pack_clips(pack_id, rank);

DROP TRIGGER IF EXISTS clipping_packs_updated_at ON public.clipping_packs;
CREATE TRIGGER clipping_packs_updated_at BEFORE UPDATE ON public.clipping_packs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS clipping_pack_clips_updated_at ON public.clipping_pack_clips;
CREATE TRIGGER clipping_pack_clips_updated_at BEFORE UPDATE ON public.clipping_pack_clips FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.clipping_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clipping_pack_clips ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS clipping_packs_owner_all ON public.clipping_packs;
CREATE POLICY clipping_packs_owner_all ON public.clipping_packs FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS clipping_pack_clips_owner_all ON public.clipping_pack_clips;
CREATE POLICY clipping_pack_clips_owner_all ON public.clipping_pack_clips FOR ALL USING (
  EXISTS (SELECT 1 FROM public.clipping_packs p WHERE p.id = pack_id AND p.user_id = auth.uid())
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.clipping_packs p WHERE p.id = pack_id AND p.user_id = auth.uid())
);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('clipping-sources', 'clipping-sources', false, 1073741824, ARRAY['video/mp4','video/quicktime','video/webm'])
ON CONFLICT (id) DO UPDATE SET
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

DROP POLICY IF EXISTS clipping_sources_owner_all ON storage.objects;
CREATE POLICY clipping_sources_owner_all ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'clipping-sources' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'clipping-sources' AND (storage.foldername(name))[1] = auth.uid()::text);
