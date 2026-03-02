-- Create a single public bucket for V1: "generated"
-- V1 rule: public read (no signed URLs).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'generated',
    'generated',
    true,
    104857600, -- 100 MB
    ARRAY['video/mp4']
)
ON CONFLICT (id) DO NOTHING;

-- Public read for objects in "generated"
DROP POLICY IF EXISTS "Public can view generated" ON storage.objects;
CREATE POLICY "Public can view generated" ON storage.objects
FOR SELECT
USING (bucket_id = 'generated');

-- Uploads should be done by service role (worker/backend), so we do not
-- open INSERT for authenticated users in V1.

