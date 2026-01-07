-- Migration: Ajout support musique de fond et détection de ton
-- Date: 2025-10-06

-- Ajouter mood_override pour forcer le ton de la musique
alter table public.jobs
  add column if not exists mood_override text;

comment on column public.jobs.mood_override is 'Ton musical forcé par l''utilisateur (inspirant, science, léger, dramatique, épique)';

-- Ajouter script_tone pour stocker le ton détecté par Qwen
alter table public.jobs
  add column if not exists script_tone text;

comment on column public.jobs.script_tone is 'Ton détecté automatiquement par Qwen lors de la génération du script';

-- Ajouter music_track_url pour stocker l'URL de la musique sélectionnée
alter table public.jobs
  add column if not exists music_track_url text;

comment on column public.jobs.music_track_url is 'URL publique de la piste musicale sélectionnée (si audio_mode=music)';

-- Table de cache pour éviter de re-sélectionner la même musique
create table if not exists public.music_cache (
  prompt_hash text primary key,
  audio_mode text not null check (audio_mode in ('voice','music','none')),
  music_track_url text not null,
  tone text,
  created_at timestamp with time zone default now()
);

comment on table public.music_cache is 'Cache des sélections musicales pour éviter la re-sélection aléatoire';

create index if not exists idx_music_cache_mode on public.music_cache (audio_mode);
create index if not exists idx_music_cache_tone on public.music_cache (tone);
