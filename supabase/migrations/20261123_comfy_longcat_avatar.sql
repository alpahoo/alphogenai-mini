-- PREPARED ONLY. Do not apply to production without owner approval (staging only for the acceptance test).
-- Admin-only LongCat-Video-Avatar 1.6 runtime (talking avatar: one private portrait + one private audio -> one MP4).
-- Additive: one CHECK widened, one bucket MIME list widened, one gate row, one new admission function, one registry row.
-- Existing H3 / MOSS functions, gates and rows are NOT modified.
-- Rollback (in this order): delete the 'comfy:longcat-avatar' engines row; drop function admit_comfy_avatar_run;
--   delete the 'longcat-avatar@1' row of comfy_runtime_gates (only when no run references it);
--   restore the references bucket MIME list to jpeg/png/webp; restore the runtime CHECK to ('h3-video@1','moss-image@1').

-- 1. Accept the third runtime. Existing rows are unaffected.
alter table public.comfy_runs drop constraint if exists comfy_runs_runtime_check;
alter table public.comfy_runs add constraint comfy_runs_runtime_check
  check (runtime in ('h3-video@1','moss-image@1','longcat-avatar@1'));

-- 2. The private `references` bucket also accepts WAV and MP3 for the audio library
--    (`<user_id>/audio-library/...`). Bucket stays private; per-user folder policies are unchanged.
update storage.buckets
   set allowed_mime_types = array['image/jpeg','image/png','image/webp','audio/wav','audio/x-wav','audio/mpeg']
 where id = 'references';

-- 3. Gate row, closed by default: no user, no licence, no runs, no budget. 0.75 USD is an APPLICATION reservation
--    per run (one ~10 s clip on one H100 costs about 0.5-0.75 USD all-in), not a Modal billing cap.
insert into public.comfy_runtime_gates(runtime, reserve_usd, expected_outputs)
values ('longcat-avatar@1', 0.75, 1)
on conflict (runtime) do nothing;

-- 4. Admission. Same guarantees as admit_comfy_runtime_run (per-user lock, idempotency, shared gate row lock,
--    licence + owner + expiry + budget checks, single active job, plan quota, reservation kept until
--    reconciliation) plus:
--    - the portrait path is stored as the run reference (it must live in the caller's own folder);
--    - DUPLICATE GUARD: an identical request (same resolved graph hash) that is still queued or running returns the
--      existing run instead of admitting a second render, whatever the idempotency key.
create or replace function public.admit_comfy_avatar_run(
  p_user uuid, p_key uuid, p_prompt text, p_params jsonb, p_graph jsonb, p_hash text, p_image text
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare existing uuid; new_job uuid; new_run uuid; user_plan text; daily_limit integer; g comfy_runtime_gates;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));
  select id into existing from comfy_runs where user_id=p_user and idempotency_key=p_key;
  if existing is not null then return existing; end if;
  select id into existing from comfy_runs
    where user_id=p_user and runtime='longcat-avatar@1' and resolved_graph_sha256=p_hash and status in ('queued','running')
    order by created_at desc limit 1;
  if existing is not null then return existing; end if;
  if p_image is null or left(p_image, length(p_user::text)+1) <> p_user::text || '/' or position('..' in p_image) > 0 then
    raise exception 'INVALID_REFERENCE';
  end if;
  select * into g from comfy_runtime_gates where runtime='longcat-avatar@1' for update;
  if not found or not g.enabled or g.licence_confirmed_at is null or g.allowed_user_id is distinct from p_user
     or g.expires_at is null or g.expires_at<=now() or g.remaining_runs<=0 or g.committed_usd+g.reserve_usd>g.budget_usd then
    raise exception 'RUNTIME_NOT_AUTHORIZED';
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
    values(p_user,p_prompt,'pending',user_plan,'queued','comfy:longcat-avatar',
      jsonb_build_object('output_kind','video','template_slug','longcat-avatar')) returning id into new_job;
  insert into comfy_runs(job_id,user_id,idempotency_key,runtime,template_version,params_effective,resolved_graph_sha256,reference_path,reserved_cost_usd)
    values(new_job,p_user,p_key,'longcat-avatar@1','longcat-avatar@1',p_params,p_hash,p_image,g.reserve_usd) returning id into new_run;
  insert into comfy_run_graphs values(new_run,p_graph);
  insert into comfy_dispatch_outbox(run_id) values(new_run);
  update jobs set metadata=metadata||jsonb_build_object('comfy_run_id',new_run) where id=new_job;
  update comfy_runtime_gates set remaining_runs=remaining_runs-1, committed_usd=committed_usd+g.reserve_usd where runtime='longcat-avatar@1';
  return new_run;
end $$;

revoke all on function public.admit_comfy_avatar_run(uuid,uuid,text,jsonb,jsonb,text,text) from public, anon, authenticated;
grant execute on function public.admit_comfy_avatar_run(uuid,uuid,text,jsonb,jsonb,text,text) to service_role;

-- 5. Registry entry: inactive, no customer plan, never selected by the legacy router.
insert into public.engines(id,name,type,status,max_duration,gpu,priority)
values('comfy:longcat-avatar','LongCat Avatar','comfy_workflow','coming_soon',0,'H100',0)
on conflict (id) do nothing;
