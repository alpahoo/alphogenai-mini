-- AI Video Storyteller core schema
-- Tables: projects, project_scenes, daily_themes, scheduled_posts, music_tracks, video_jobs_log
-- RLS enabled with owner policies; admin via app_metadata.role = 'admin'

-- Enable pgcrypto for gen_random_uuid if not already
create extension if not exists pgcrypto;

-- Helper: check if claim role is admin
create or replace function public.is_admin()
returns boolean language sql stable as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;

-- projects
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  tone text check (char_length(tone) > 0),
  plan_tier text not null default 'pro' check (plan_tier in ('pro','unlimited')),
  duration_limit_s integer not null default 120,
  total_duration_s integer not null default 0,
  music_file_path text,
  status text not null default 'draft' check (status in ('draft','generating','ready','failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.projects enable row level security;

-- Owner policies for projects
create policy if not exists projects_owner_select on public.projects
for select using (is_admin() or user_id = auth.uid());

create policy if not exists projects_owner_insert on public.projects
for insert with check (is_admin() or user_id = auth.uid());

create policy if not exists projects_owner_update on public.projects
for update using (is_admin() or user_id = auth.uid());

create policy if not exists projects_owner_delete on public.projects
for delete using (is_admin() or user_id = auth.uid());

-- project_scenes
create table if not exists public.project_scenes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  idx integer not null,
  title text,
  prompt text not null,
  duration_s integer not null check (duration_s between 6 and 10),
  runway_job_id text,
  status text not null default 'queued' check (status in ('queued','running','completed','failed','timeout')),
  scene_checksum text not null,
  video_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, idx)
);

alter table public.project_scenes enable row level security;

-- Policies for project_scenes based on parent project ownership
create policy if not exists project_scenes_owner_select on public.project_scenes
for select using (
  is_admin() or exists (
    select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()
  )
);

create policy if not exists project_scenes_owner_insert on public.project_scenes
for insert with check (
  is_admin() or exists (
    select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()
  )
);

create policy if not exists project_scenes_owner_update on public.project_scenes
for update using (
  is_admin() or exists (
    select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()
  )
);

create policy if not exists project_scenes_owner_delete on public.project_scenes
for delete using (
  is_admin() or exists (
    select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()
  )
);

-- daily_themes (admin-managed)
create table if not exists public.daily_themes (
  id uuid primary key default gen_random_uuid(),
  scheduled_for date not null,
  title text not null,
  prompt text not null,
  tone text not null,
  status text not null default 'pending' check (status in ('pending','queued','generated','failed','skipped')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(scheduled_for, title)
);

alter table public.daily_themes enable row level security;

-- Only admins can manage/read daily_themes
create policy if not exists daily_themes_admin_all on public.daily_themes
for all using (is_admin()) with check (is_admin());

-- scheduled_posts
create table if not exists public.scheduled_posts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  targets text[] not null default array[]::text[],
  status text not null default 'awaiting_approval' check (status in ('awaiting_approval','approved','rejected','published','failed')),
  scheduled_for timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  published_urls jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.scheduled_posts enable row level security;

-- Owner can read and manage own scheduled posts; admin full access
create policy if not exists scheduled_posts_owner_select on public.scheduled_posts
for select using (is_admin() or user_id = auth.uid());

create policy if not exists scheduled_posts_owner_insert on public.scheduled_posts
for insert with check (is_admin() or user_id = auth.uid());

create policy if not exists scheduled_posts_owner_update on public.scheduled_posts
for update using (is_admin() or user_id = auth.uid());

create policy if not exists scheduled_posts_owner_delete on public.scheduled_posts
for delete using (is_admin() or user_id = auth.uid());

-- music_tracks (public readable, admin managed)
create table if not exists public.music_tracks (
  id uuid primary key default gen_random_uuid(),
  tone text not null,
  file_path text not null unique,
  bpm integer,
  duration_s integer,
  created_at timestamptz not null default now()
);

alter table public.music_tracks enable row level security;

-- Anyone can select music tracks; only admin can insert/update/delete
create policy if not exists music_tracks_public_select on public.music_tracks
for select using (true);

create policy if not exists music_tracks_admin_ins on public.music_tracks
for insert with check (is_admin());

create policy if not exists music_tracks_admin_upd on public.music_tracks
for update using (is_admin());

create policy if not exists music_tracks_admin_del on public.music_tracks
for delete using (is_admin());

-- video_jobs_log (admin readable; owners can read their scene logs)
create table if not exists public.video_jobs_log (
  id bigserial primary key,
  scene_id uuid references public.project_scenes(id) on delete cascade,
  job_id text,
  status text not null,
  message text,
  payload jsonb,
  created_at timestamptz not null default now()
);

alter table public.video_jobs_log enable row level security;

create policy if not exists video_jobs_log_admin_select on public.video_jobs_log
for select using (is_admin());

create policy if not exists video_jobs_log_owner_select on public.video_jobs_log
for select using (
  exists (
    select 1 from public.project_scenes s
    join public.projects p on p.id = s.project_id
    where s.id = scene_id and p.user_id = auth.uid()
  )
);

-- Useful indexes
create index if not exists idx_project_scenes_project_id on public.project_scenes(project_id);
create index if not exists idx_project_scenes_checksum on public.project_scenes(scene_checksum);
create index if not exists idx_scheduled_posts_user on public.scheduled_posts(user_id);
create index if not exists idx_daily_themes_scheduled_for on public.daily_themes(scheduled_for);
