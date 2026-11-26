-- PREPARED ONLY: Cinema M1. Do not apply to production without owner approval.
-- Adds admin-private project metadata; H3 and MOSS budgets, jobs and media are untouched.
-- The only change to an existing table: a UNIQUE (id,user_id) on public.comfy_runs, a superset of its primary
-- key, so cinema_takes can reference the run together with its owner. Additive, no data or gate change.
alter table public.comfy_runs add constraint comfy_runs_id_user_key unique (id,user_id);
create table public.cinema_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  title text not null check (char_length(title) between 1 and 120),
  logline text not null default '' check (char_length(logline) <= 600),
  aspect text not null default '9:16' check (aspect in ('9:16','16:9','1:1')),
  look jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,user_id)
);
create table public.cinema_scenes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  project_id uuid not null,
  position integer not null check (position >= 0),
  title text not null default 'Scene' check (char_length(title) between 1 and 120),
  notes text not null default '' check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  foreign key(project_id,user_id) references public.cinema_projects(id,user_id) on delete cascade,
  unique(id,project_id,user_id),
  unique(project_id,position)
);
create table public.cinema_elements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  project_id uuid not null,
  kind text not null check (kind in ('character','location','prop')),
  name text not null check (char_length(name) between 1 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  reference_path text,
  created_at timestamptz not null default now(),
  foreign key(project_id,user_id) references public.cinema_projects(id,user_id) on delete cascade,
  unique(id,project_id,user_id)
);
create table public.cinema_shots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  project_id uuid not null,
  scene_id uuid not null,
  position integer not null check (position >= 0),
  action text not null default '' check (char_length(action) <= 2000),
  size text not null default '',
  angle text not null default '',
  movement text not null default '',
  lens text not null default '',
  focus text not null default '',
  lighting text not null default '',
  mood text not null default '',
  duration integer not null default 5 check (duration between 1 and 60),
  sound text not null default '' check (char_length(sound) <= 1000),
  first_frame_path text,
  selected_take_id uuid,
  version integer not null default 0 check (version >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(project_id,user_id) references public.cinema_projects(id,user_id) on delete cascade,
  foreign key(scene_id,project_id,user_id) references public.cinema_scenes(id,project_id,user_id) on delete cascade,
  unique(id,project_id,user_id),
  unique(scene_id,position)
);
create table public.cinema_takes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  project_id uuid not null,
  shot_id uuid not null,
  run_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key(project_id,user_id) references public.cinema_projects(id,user_id) on delete cascade,
  foreign key(shot_id,project_id,user_id) references public.cinema_shots(id,project_id,user_id) on delete cascade,
  -- The run must belong to the same owner as the take, enforced by the database (also for the service role).
  -- RESTRICT: a run referenced by a take is never hard-deleted (the Studio deletion keeps a tombstone row,
  -- so the take stays visible as "unavailable"); deleting a project removes its takes and keeps every run.
  foreign key(run_id,user_id) references public.comfy_runs(id,user_id) on delete restrict,
  unique(shot_id,run_id),
  unique(shot_id,id)
);
-- Selected take must belong to this exact shot; no cross-shot selections at DB level.
alter table public.cinema_shots add constraint cinema_shots_selected_take_fk
  foreign key(id,selected_take_id) references public.cinema_takes(shot_id,id)
  deferrable initially immediate;

create index cinema_projects_owner_updated on public.cinema_projects(user_id,updated_at desc);
create index cinema_scenes_order on public.cinema_scenes(project_id,position);
create index cinema_shots_order on public.cinema_shots(scene_id,position);
create index cinema_takes_order on public.cinema_takes(shot_id,created_at);

-- Private administrative API only. Service-role routes also check admin and user_id.
alter table public.cinema_projects enable row level security;
alter table public.cinema_scenes enable row level security;
alter table public.cinema_elements enable row level security;
alter table public.cinema_shots enable row level security;
alter table public.cinema_takes enable row level security;
revoke all on public.cinema_projects,public.cinema_scenes,public.cinema_elements,
  public.cinema_shots,public.cinema_takes from public,anon,authenticated;
grant select,insert,update,delete on public.cinema_projects,public.cinema_scenes,public.cinema_elements,
  public.cinema_shots,public.cinema_takes to service_role;
-- These policies are defense in depth for any future authenticated grants.
create policy cinema_projects_own on public.cinema_projects for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy cinema_scenes_own on public.cinema_scenes for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy cinema_elements_own on public.cinema_elements for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy cinema_shots_own on public.cinema_shots for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy cinema_takes_own on public.cinema_takes for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
