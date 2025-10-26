create extension if not exists pgcrypto;

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('queued','running','done','error')),
  progress float8 default 0,
  video_url text,
  error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists jobs_created_at_idx on jobs(created_at desc);
create index if not exists jobs_status_idx on jobs(status);
