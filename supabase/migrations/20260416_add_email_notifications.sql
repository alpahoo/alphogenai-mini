-- Add email notifications preference column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email_notifications BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.profiles.email_notifications IS 'User preference for receiving email notifications when video generation completes';
