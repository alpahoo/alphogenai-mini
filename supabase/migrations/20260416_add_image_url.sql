-- Add image_url column to jobs table for Image-to-Video (I2V) feature
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS image_url TEXT;

COMMENT ON COLUMN public.jobs.image_url IS 'User-uploaded first frame image URL for I2V mode';
