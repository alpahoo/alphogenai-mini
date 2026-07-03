-- T-1138: private Supabase Storage bucket `podcast-personas` for user-uploaded
-- podcast persona portraits. Mirrors the `references` bucket (image-only, 10 MB,
-- per-user RLS via the first path segment = auth.uid()). STRICTLY ADDITIVE.
--
-- Path convention: podcast-personas/{user_id}/{uuid}.{ext}
-- The GET /api/podcast-personas route signs these paths on read (service role).

-- ============================================================================
-- 1. Bucket — private, image-only
-- ============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'podcast-personas',
  'podcast-personas',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 2. RLS policies — guarded via DO blocks (idempotent, no DROP)
-- ============================================================================

-- 2a. INSERT — user uploads into their own folder only
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Users upload their own podcast personas'
  ) THEN
    CREATE POLICY "Users upload their own podcast personas" ON storage.objects
      FOR INSERT
      WITH CHECK (
        bucket_id = 'podcast-personas'
        AND auth.role() = 'authenticated'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END $$;

-- 2b. SELECT — user reads/lists only their own files
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Users read their own podcast personas'
  ) THEN
    CREATE POLICY "Users read their own podcast personas" ON storage.objects
      FOR SELECT
      USING (
        bucket_id = 'podcast-personas'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END $$;

-- 2c. DELETE — user removes only their own files
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Users delete their own podcast personas'
  ) THEN
    CREATE POLICY "Users delete their own podcast personas" ON storage.objects
      FOR DELETE
      USING (
        bucket_id = 'podcast-personas'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END $$;
