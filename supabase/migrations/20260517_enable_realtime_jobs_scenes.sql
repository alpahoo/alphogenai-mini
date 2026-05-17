-- Enable Supabase Realtime for jobs and job_scenes tables.
-- This allows the frontend to receive instant updates via WebSocket
-- instead of relying solely on API polling.
ALTER PUBLICATION supabase_realtime ADD TABLE public.jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.job_scenes;
