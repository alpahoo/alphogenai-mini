-- 
--


INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'videos',
    'videos', 
    true,
    104857600, -- 100 MB limit (important-comment)
    ARRAY['video/mp4', 'video/webm', 'video/quicktime']
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'assets',
    'assets',
    true,
    52428800, -- 50 MB limit (important-comment)
    ARRAY['audio/mpeg', 'audio/mp3', 'audio/wav']
)
ON CONFLICT (id) DO NOTHING;


CREATE POLICY "Public can view videos" ON storage.objects
FOR SELECT
USING (bucket_id = 'videos');

CREATE POLICY "Authenticated users can upload videos" ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'videos' AND auth.role() = 'authenticated');

CREATE POLICY "Public can view assets" ON storage.objects
FOR SELECT
USING (bucket_id = 'assets');

CREATE POLICY "Authenticated users can upload assets" ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'assets' AND auth.role() = 'authenticated');

-- VERIFICATION QUERIES (run after migration)
-- SELECT * FROM storage.buckets WHERE id IN ('videos', 'assets');
-- SELECT * FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage';
