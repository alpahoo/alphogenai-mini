-- Admin settings table and RLS
create table if not exists admin_settings (
  id smallint primary key default 1,
  enable_elevenlabs boolean not null default false,
  default_audio_mode text not null default 'music' check (default_audio_mode in ('voice','music','none')),
  music_source text not null default 'youtube' check (music_source in ('youtube','freepd','pixabay')),
  default_voice_id text,
  music_volume numeric not null default 0.7,
  updated_at timestamp with time zone not null default now()
);

-- Ensure single row exists
insert into admin_settings (id) values (1)
on conflict (id) do nothing;

-- RLS and policies
alter table admin_settings enable row level security;

-- Public read policy (safe fields)
create policy admin_settings_read_public on admin_settings
for select using (true);

-- Service-role write policy
create policy admin_settings_write_service on admin_settings
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');
