-- PREPARED ONLY. Do not apply without owner approval. Admin-only MOSS-Image runtime (text to image).
-- Additive except two CHECK constraints widened and three pilot functions replaced with identical H3 branches.
-- Rollback: see docs/implementation/studio-phase-b-moss.md.

-- 1. Accept the second runtime. H3 rows are unaffected.
alter table public.comfy_runs drop constraint if exists comfy_runs_runtime_check;
alter table public.comfy_runs add constraint comfy_runs_runtime_check check (runtime in ('h3-video@1','moss-image@1'));

-- 2. Private bucket also accepts PNG originals. Bucket stays non-public, browser policies stay denied.
update storage.buckets set allowed_mime_types = array['video/mp4','image/png'] where id = 'comfy-outputs';

-- 3. One gate row per runtime (H3 keeps comfy_admin_gate). Starts closed: no user, no licence, no runs, no budget.
create table public.comfy_runtime_gates (
  runtime text primary key check (runtime <> 'h3-video@1'),
  enabled boolean not null default false,
  licence_confirmed_at timestamptz,
  allowed_user_id uuid references auth.users(id),
  expires_at timestamptz,
  remaining_runs integer not null default 0 check (remaining_runs >= 0),
  budget_usd numeric not null default 0 check (budget_usd >= 0),
  committed_usd numeric not null default 0 check (committed_usd >= 0),
  reserve_usd numeric not null check (reserve_usd > 0),
  expected_outputs integer not null check (expected_outputs > 0)
);
insert into public.comfy_runtime_gates(runtime, reserve_usd, expected_outputs) values ('moss-image@1', 0.20, 1);
alter table public.comfy_runtime_gates enable row level security;
revoke all on public.comfy_runtime_gates from public, anon, authenticated;
grant select, insert, update, delete on public.comfy_runtime_gates to service_role;

-- 4. Admission for gated runtimes. Same guarantees as the H3 pilot: per-user lock, idempotency, shared gate lock,
--    single active job, plan quota, reservation kept until manual invoice reconciliation.
create function public.admit_comfy_runtime_run(
  p_runtime text, p_template text, p_user uuid, p_key uuid, p_prompt text, p_params jsonb, p_graph jsonb, p_hash text
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare existing uuid; new_job uuid; new_run uuid; user_plan text; daily_limit integer; g comfy_runtime_gates;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));
  select id into existing from comfy_runs where user_id=p_user and idempotency_key=p_key;
  if existing is not null then return existing; end if;
  select * into g from comfy_runtime_gates where runtime=p_runtime for update;
  if not found or not g.enabled or g.licence_confirmed_at is null or g.allowed_user_id is distinct from p_user
     or g.expires_at is null or g.expires_at<=now() or g.remaining_runs<=0 or g.committed_usd+g.reserve_usd>g.budget_usd then
    raise exception 'RUNTIME_NOT_AUTHORIZED';
  end if;
  if p_template is null or split_part(p_template,'@',1) <> split_part(p_runtime,'@',1) then
    raise exception 'TEMPLATE_RUNTIME_MISMATCH';
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
  insert into jobs(user_id,prompt,status,plan,current_stage,engine_used,metadata)
    values(p_user,p_prompt,'pending',user_plan,'queued','comfy:'||split_part(p_template,'@',1),
      jsonb_build_object('output_kind','image','template_slug',split_part(p_template,'@',1))) returning id into new_job;
  insert into comfy_runs(job_id,user_id,idempotency_key,runtime,template_version,params_effective,resolved_graph_sha256,reference_path,reserved_cost_usd)
    values(new_job,p_user,p_key,p_runtime,p_template,p_params,p_hash,null,g.reserve_usd) returning id into new_run;
  insert into comfy_run_graphs values(new_run,p_graph);
  insert into comfy_dispatch_outbox(run_id) values(new_run);
  update jobs set metadata=metadata||jsonb_build_object('comfy_run_id',new_run) where id=new_job;
  update comfy_runtime_gates set remaining_runs=remaining_runs-1, committed_usd=committed_usd+g.reserve_usd where runtime=p_runtime;
  return new_run;
end $$;

-- 5. Claim: H3 branch identical to 20261108; other runtimes check their own gate.
create or replace function public.claim_comfy_admin_run(p_run uuid) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare r comfy_runs; authorized boolean;
begin
  select * into r from comfy_runs where id=p_run for update;
  if not found or r.status<>'queued' then return false; end if;
  if r.runtime='h3-video@1' then
    authorized := exists(select 1 from comfy_admin_gate where id and enabled
      and rights_confirmed_at is not null and allowed_user_id=r.user_id and expires_at>now());
  else
    authorized := exists(select 1 from comfy_runtime_gates where runtime=r.runtime and enabled
      and licence_confirmed_at is not null and allowed_user_id=r.user_id and expires_at>now());
  end if;
  if r.execution_deadline<=now() or not authorized then
    update comfy_runs set status='failed', error_code='AUTHORIZATION_EXPIRED', finished_at=now(),
      finance_status='awaiting_reconciliation' where id=p_run;
    update jobs set status='failed',error_message=case when r.runtime='h3-video@1' then 'H3 authorization expired' else 'Authorization expired' end where id=r.job_id;
    return false;
  end if;
  update comfy_runs set status='running' where id=p_run;
  update jobs set status='in_progress',current_stage='generating_scene_1' where id=r.job_id;
  return true;
end $$;

-- 6. Finish: expected output count per runtime (H3: raw + final; MOSS: one original PNG).
create or replace function public.finish_comfy_admin_run(p_run uuid, p_success boolean, p_error text, p_seconds numeric)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare r comfy_runs; expected integer;
begin
  select * into r from comfy_runs where id=p_run for update;
  if not found or r.status<>'running' then return false; end if;
  if r.execution_deadline<=now() then p_success:=false; p_error:='TIMEOUT'; end if;
  expected := case when r.runtime='h3-video@1' then 2
    else coalesce((select expected_outputs from comfy_runtime_gates where runtime=r.runtime), 1) end;
  if p_success and (select count(*) from comfy_assets where run_id=p_run and withdrawn_at is null)<>expected then
    raise exception 'MISSING_OUTPUTS';
  end if;
  update comfy_runs set status=case when p_success then 'done' else 'failed' end,
    error_code=p_error,generation_seconds=p_seconds,finished_at=now(),finance_status='awaiting_reconciliation'
    where id=p_run;
  update jobs set status=case when p_success then 'done' else 'failed' end,
    current_stage=case when p_success then 'completed' else 'failed' end,
    error_message=case when p_success then null when r.runtime='h3-video@1' then 'H3 generation failed' else 'Generation failed' end where id=r.job_id;
  return true;
end $$;

revoke all on function public.admit_comfy_runtime_run(text,text,uuid,uuid,text,jsonb,jsonb,text),
  public.claim_comfy_admin_run(uuid), public.finish_comfy_admin_run(uuid,boolean,text,numeric) from public,anon,authenticated;
grant execute on function public.admit_comfy_runtime_run(text,text,uuid,uuid,text,jsonb,jsonb,text),
  public.claim_comfy_admin_run(uuid), public.finish_comfy_admin_run(uuid,boolean,text,numeric) to service_role;

-- 7. Registry entry: inactive, no customer plan, never selected by the legacy router.
insert into public.engines(id,name,type,status,max_duration,gpu,priority)
values('comfy:moss-image','MOSS-Image','comfy_workflow','coming_soon',0,'L40S',0)
on conflict (id) do nothing;
