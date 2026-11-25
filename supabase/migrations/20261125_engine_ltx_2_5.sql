-- LTX-2.5 (Lightricks, Modal H100, official ComfyUI templates): Modal-local engine
-- used by Parallax Shorts by default. Same plans as LTX-2.3 (Pro, Premium).
-- Without these rows the Modal router ignores preferred_engine=ltx_2_5 and falls
-- back to its default engine. Idempotent.

insert into engines (id, name, type, status, priority, gpu, max_duration, clip_duration, api_config)
values ('ltx_2_5', 'LTX-2.5', 'modal_local', 'active', 74, 'H100', 10, 10, '{}'::jsonb)
on conflict (id) do update set
  name = excluded.name, type = excluded.type, status = excluded.status, priority = excluded.priority,
  gpu = excluded.gpu, max_duration = excluded.max_duration, clip_duration = excluded.clip_duration,
  updated_at = now();

insert into engine_plans (engine_id, plan)
values ('ltx_2_5', 'pro'), ('ltx_2_5', 'premium')
on conflict do nothing;

-- Internal cost tracking only (not billing). Measured 25 Nov 2026: ~0.09 $ of H100
-- for a 5 s clip, ComfyUI start included; rounded up for cold starts.
insert into engine_costs (engine_id, billing_model, per_second_usd, per_video_usd)
values ('ltx_2_5', 'per_second', 0.025, null)
on conflict (engine_id) do update set
  billing_model = excluded.billing_model, per_second_usd = excluded.per_second_usd,
  per_video_usd = excluded.per_video_usd, updated_at = now();
