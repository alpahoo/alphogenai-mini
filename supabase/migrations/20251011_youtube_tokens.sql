-- YouTube OAuth tokens storage
create table if not exists public.youtube_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  access_token text,
  refresh_token text,
  expiry_date timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.youtube_tokens enable row level security;

-- Users can read their own tokens; admin can read all; only service role should write
create policy if not exists yt_tokens_owner_select on public.youtube_tokens
for select using (auth.uid() = user_id or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy if not exists yt_tokens_owner_update on public.youtube_tokens
for update using (auth.uid() = user_id or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy if not exists yt_tokens_owner_insert on public.youtube_tokens
for insert with check (auth.uid() = user_id or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
