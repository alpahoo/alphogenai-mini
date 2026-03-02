-- Ensure required extension for gen_random_uuid
create extension if not exists pgcrypto;

-- Create notes table
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now()
);

-- Enable Row Level Security
alter table public.notes enable row level security;

-- Policy: allow users to select their own notes
create policy if not exists "Users can select their own notes"
on public.notes for select
to authenticated
using (auth.uid() = user_id);

-- Policy: allow users to insert their own notes
create policy if not exists "Users can insert their own notes"
on public.notes for insert
to authenticated
with check (auth.uid() = user_id);

-- Policy: allow users to delete their own notes
create policy if not exists "Users can delete their own notes"
on public.notes for delete
to authenticated
using (auth.uid() = user_id);

