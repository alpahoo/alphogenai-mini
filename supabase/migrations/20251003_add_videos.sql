-- Create required extension for uuid_generate_v4
create extension if not exists "uuid-ossp";

-- Create videos table
create table if not exists public.videos (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idea text not null,
  script text,
  hashtags text,
  description text,
  video_url text,
  status text not null default 'pending' check (status in ('pending','generating','ready','error')),
  created_at timestamptz not null default now()
);

-- Enable Row Level Security
alter table public.videos enable row level security;

-- Policies
create policy if not exists "Users can select their own videos"
on public.videos for select
to authenticated
using (auth.uid() = user_id);

create policy if not exists "Users can insert their own videos"
on public.videos for insert
to authenticated
with check (auth.uid() = user_id);

create policy if not exists "Users can update their own videos"
on public.videos for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy if not exists "Users can delete their own videos"
on public.videos for delete
to authenticated
using (auth.uid() = user_id);

