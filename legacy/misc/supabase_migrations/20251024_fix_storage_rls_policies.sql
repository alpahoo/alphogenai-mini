
DROP POLICY IF EXISTS "Authenticated users can upload videos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload assets" ON storage.objects;

CREATE POLICY "Authenticated users can upload videos" ON storage.objects
FOR INSERT
WITH CHECK (
    bucket_id = 'videos' AND 
    auth.uid() IS NOT NULL
);

CREATE POLICY "Authenticated users can update videos" ON storage.objects
FOR UPDATE
USING (
    bucket_id = 'videos' AND 
    auth.uid() IS NOT NULL
);

CREATE POLICY "Authenticated users can delete videos" ON storage.objects
FOR DELETE
USING (
    bucket_id = 'videos' AND 
    auth.uid() IS NOT NULL
);

CREATE POLICY "Authenticated users can upload assets" ON storage.objects
FOR INSERT
WITH CHECK (
    bucket_id = 'assets' AND 
    auth.uid() IS NOT NULL
);

CREATE POLICY "Authenticated users can update assets" ON storage.objects
FOR UPDATE
USING (
    bucket_id = 'assets' AND 
    auth.uid() IS NOT NULL
);

CREATE POLICY "Authenticated users can delete assets" ON storage.objects
FOR DELETE
USING (
    bucket_id = 'assets' AND 
    auth.uid() IS NOT NULL
);

-- VERIFICATION QUERIES (run after migration to verify)
