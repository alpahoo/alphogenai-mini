-- Create private Supabase Storage bucket `references` for Multi-Reference V1.
--
-- STRICTLY ADDITIVE.
-- No changes to existing buckets (`videos`, `assets` — public, untouched).
-- No changes to /api/upload or any runtime code in this migration.
-- The bucket created here is NOT yet wired into the upload flow; helpers
-- (TS + Python) will be added in the same PR but not integrated.
--
-- Bucket properties:
--   id/name           : 'references'
--   public            : false  (signed URLs only)
--   file_size_limit   : 10 MB  (10485760 bytes — TBD by CTO, V1 image-only)
--   allowed_mime_types: image/jpeg, image/png, image/webp (V1 image-only)
--
-- Path convention (enforced by RLS policies via storage.foldername):
--   references/{user_id}/{job_id}/{uuid}.{ext}
--
-- The user_id (= auth.uid()) is the FIRST folder segment after the bucket
-- root, so (storage.foldername(name))[1] = auth.uid()::text isolates users.
--
-- RLS policies (3 per-user + implicit service-role bypass):
--   INSERT : authenticated user can upload only under their own user_id folder
--   SELECT : authenticated user can read/list only their own files
--   DELETE : authenticated user can delete only their own files
--
-- Service-role bypasses RLS by default → backend can mint signed URLs and
-- enumerate any path (used by signReferenceUrl helpers).

-- ============================================================================
-- 1. Bucket — private, image-only V1
-- ============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'references',
  'references',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 2. RLS policies — guarded via DO blocks (no DROP, idempotent)
-- ============================================================================

-- 2a. INSERT — user uploads into their own folder only
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'Users upload their own references'
  ) THEN
    CREATE POLICY "Users upload their own references" ON storage.objects
      FOR INSERT
      WITH CHECK (
        bucket_id = 'references'
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
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'Users read their own references'
  ) THEN
    CREATE POLICY "Users read their own references" ON storage.objects
      FOR SELECT
      USING (
        bucket_id = 'references'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END $$;

-- 2c. DELETE — user removes only their own files (orphan cleanup future)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'Users delete their own references'
  ) THEN
    CREATE POLICY "Users delete their own references" ON storage.objects
      FOR DELETE
      USING (
        bucket_id = 'references'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END $$;

-- ============================================================================
-- VERIFICATION (run post-apply via SELECT) :
--   SELECT id, public, file_size_limit, allowed_mime_types
--     FROM storage.buckets WHERE id = 'references';
--   SELECT policyname, cmd FROM pg_policies
--     WHERE schemaname='storage' AND tablename='objects'
--       AND policyname LIKE '%references%' ORDER BY policyname;
-- ============================================================================
