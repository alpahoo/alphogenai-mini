-- Add final_video_path to projects if missing
alter table public.projects
  add column if not exists final_video_path text;
