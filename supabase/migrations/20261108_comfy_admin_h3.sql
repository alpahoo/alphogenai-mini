-- PREPARED ONLY. Do not apply without owner approval. Closed admin pilot, not public rollout.
create table public.comfy_admin_gate (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  rights_confirmed_at timestamptz,
  allowed_user_id uuid references auth.users(id),
  expires_at timestamptz,
  remaining_runs integer not null default 0 check (remaining_runs >= 0),
  budget_usd numeric not null default 0 check (budget_usd >= 0),
  committed_usd numeric not null default 0 check (committed_usd >= 0)
);
insert into public.comfy_admin_gate(id) values (true);

create table public.comfy_runs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.jobs(id),
  user_id uuid not null references auth.users(id),
  idempotency_key uuid not null,
  runtime text not null check (runtime = 'h3-video@1'),
  template_version text not null default 'minimax-h3@1',
  params_effective jsonb not null,
  resolved_graph_sha256 text not null,
  reference_path text,
  status text not null default 'queued' check (status in ('queued','running','done','failed','cancelled','expired')),
  reserved_cost_usd numeric not null default 0.75,
  error_code text,
  modal_call_id text,
  generation_seconds numeric,
  finance_status text not null default 'reserved' check (finance_status in ('reserved','awaiting_reconciliation','closed')),
  created_at timestamptz not null default now(),
  execution_deadline timestamptz not null default now() + interval '15 minutes',
  finished_at timestamptz,
  unique(user_id, idempotency_key)
);
create table public.comfy_run_graphs (
  run_id uuid primary key references public.comfy_runs(id),
  resolved_graph jsonb not null
);
create table public.comfy_assets (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.comfy_runs(id),
  owner_id uuid not null references auth.users(id),
  role text not null check (role in ('raw','final')),
  storage_key text not null unique,
  mime text not null default 'video/mp4',
  withdrawn_at timestamptz,
  -- Internal admin evaluation only; never represents public moderation approval.
  access_state text not null default 'admin_private' check (access_state = 'admin_private'),
  unique(run_id, role)
);
create table public.comfy_dispatch_outbox (
  run_id uuid primary key references public.comfy_runs(id),
  delivered_at timestamptz
);

alter table public.comfy_admin_gate enable row level security;
alter table public.comfy_runs enable row level security;
alter table public.comfy_run_graphs enable row level security;
alter table public.comfy_assets enable row level security;
alter table public.comfy_dispatch_outbox enable row level security;
revoke all on public.comfy_admin_gate, public.comfy_runs, public.comfy_run_graphs,
  public.comfy_assets, public.comfy_dispatch_outbox from public, anon, authenticated;
grant select, insert, update, delete on public.comfy_admin_gate, public.comfy_runs,
  public.comfy_run_graphs, public.comfy_assets, public.comfy_dispatch_outbox to service_role;

-- Dedicated private bucket: no browser policies; only the service role can read or sign.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('comfy-outputs', 'comfy-outputs', false, 104857600, array['video/mp4']);
-- Restrictive fence also defeats unrelated permissive storage policies.
create policy comfy_outputs_no_browser on storage.objects as restrictive
  for all to anon, authenticated
  using (bucket_id <> 'comfy-outputs') with check (bucket_id <> 'comfy-outputs');

create function public.admit_comfy_admin_run(
  p_user uuid, p_key uuid, p_prompt text, p_params jsonb, p_graph jsonb, p_hash text, p_reference text
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare existing uuid; new_job uuid; new_run uuid; user_plan text; daily_limit integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));
  select id into existing from comfy_runs where user_id=p_user and idempotency_key=p_key;
  if existing is not null then return existing; end if;
  -- Shared gate row is locked across ALL users, not only the caller.
  perform 1 from comfy_admin_gate where id for update;
  if not exists(select 1 from comfy_admin_gate where id and enabled and rights_confirmed_at is not null
      and allowed_user_id=p_user and expires_at>now() and remaining_runs>0
      and committed_usd+0.75<=budget_usd) then
    raise exception 'H3_NOT_AUTHORIZED';
  end if;
  if exists(select 1 from jobs where user_id=p_user and status in ('pending','in_progress')) then
    raise exception 'ACTIVE_JOB';
  end if;
  select coalesce(plan, 'free') into user_plan from profiles where id=p_user;
  user_plan := coalesce(user_plan, 'free');
  daily_limit := case user_plan when 'premium' then -1 when 'pro' then 50 else 1 end;
  if daily_limit<>-1 and (select count(*) from jobs where user_id=p_user and created_at>now()-interval '24 hours')>=daily_limit then
    raise exception 'DAILY_QUOTA';
  end if;
  insert into jobs(user_id,prompt,status,plan,current_stage,engine_used,target_duration_seconds,metadata)
    values(p_user,p_prompt,'pending',user_plan,'queued','comfy:minimax-h3',
      (p_params->>'seconds')::integer,jsonb_build_object('output_kind','video','template_slug','minimax-h3')) returning id into new_job;
  insert into comfy_runs(job_id,user_id,idempotency_key,runtime,params_effective,resolved_graph_sha256,reference_path)
    values(new_job,p_user,p_key,'h3-video@1',p_params,p_hash,p_reference) returning id into new_run;
  insert into comfy_run_graphs values(new_run,p_graph);
  insert into comfy_dispatch_outbox(run_id) values(new_run);
  update jobs set metadata=metadata||jsonb_build_object('comfy_run_id',new_run) where id=new_job;
  -- This reservation stays committed, even on failure, until manual invoice reconciliation.
  -- No automatic retry, refund or second GPU permit in this first single-test pilot.
  update comfy_admin_gate set remaining_runs=remaining_runs-1, committed_usd=committed_usd+0.75 where id;
  return new_run;
end $$;

create function public.claim_comfy_admin_run(p_run uuid) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare r comfy_runs;
begin
  select * into r from comfy_runs where id=p_run for update;
  if not found or r.status<>'queued' then return false; end if;
  if r.execution_deadline<=now() or not exists(select 1 from comfy_admin_gate where id and enabled
      and rights_confirmed_at is not null and allowed_user_id=r.user_id and expires_at>now()) then
    update comfy_runs set status='failed', error_code='AUTHORIZATION_EXPIRED', finished_at=now(),
      finance_status='awaiting_reconciliation' where id=p_run;
    update jobs set status='failed',error_message='H3 authorization expired' where id=r.job_id;
    return false;
  end if;
  update comfy_runs set status='running' where id=p_run;
  update jobs set status='in_progress',current_stage='generating_scene_1' where id=r.job_id;
  return true;
end $$;

create function public.finish_comfy_admin_run(p_run uuid, p_success boolean, p_error text, p_seconds numeric)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare r comfy_runs;
begin
  select * into r from comfy_runs where id=p_run for update;
  if not found or r.status<>'running' then return false; end if;
  -- Finishing late never resurrects an expired run or publishes its assets.
  if r.execution_deadline<=now() then p_success:=false; p_error:='TIMEOUT'; end if;
  if p_success and (select count(*) from comfy_assets where run_id=p_run and withdrawn_at is null)<>2 then
    raise exception 'MISSING_OUTPUTS';
  end if;
  update comfy_runs set status=case when p_success then 'done' else 'failed' end,
    error_code=p_error,generation_seconds=p_seconds,finished_at=now(),finance_status='awaiting_reconciliation'
    where id=p_run;
  update jobs set status=case when p_success then 'done' else 'failed' end,
    current_stage=case when p_success then 'completed' else 'failed' end,
    error_message=case when p_success then null else 'H3 generation failed' end where id=r.job_id;
  return true;
end $$;
revoke all on function public.admit_comfy_admin_run(uuid,uuid,text,jsonb,jsonb,text,text),
  public.claim_comfy_admin_run(uuid), public.finish_comfy_admin_run(uuid,boolean,text,numeric) from public,anon,authenticated;
grant execute on function public.admit_comfy_admin_run(uuid,uuid,text,jsonb,jsonb,text,text),
  public.claim_comfy_admin_run(uuid), public.finish_comfy_admin_run(uuid,boolean,text,numeric) to service_role;

create function public.expire_comfy_admin_run(p_run uuid, p_user uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare expired_job uuid;
begin
  update comfy_runs set status='expired',error_code='TIMEOUT',finished_at=now(),finance_status='awaiting_reconciliation'
    where id=p_run and user_id=p_user and status in ('queued','running') and execution_deadline<=now()
    returning job_id into expired_job;
  if expired_job is not null then
    update jobs set status='failed',current_stage='failed',error_message='H3 execution expired' where id=expired_job;
  end if;
end $$;
revoke all on function public.expire_comfy_admin_run(uuid,uuid) from public,anon,authenticated;
grant execute on function public.expire_comfy_admin_run(uuid,uuid) to service_role;

-- Registry entry is intentionally inactive and has no customer plan.
alter table public.engines drop constraint engines_type_check;
alter table public.engines add constraint engines_type_check check(type in ('api','modal_local','comfy_workflow'));
insert into public.engines(id,name,type,status,max_duration,gpu,priority)
values('comfy:minimax-h3','MiniMax H3','comfy_workflow','coming_soon',10,'H100',0);
