-- Add external video engines surfaced in /technology marketing:
--   wan_26           (EvoLink)   $0.071/s   pro+premium
--   wan_27           (Kie.ai)    $0.080/s   pro+premium
--   happy_horse_10   (EvoLink)   $0.179/s   premium
--   seedance_20      (EvoLink)   $0.199/s   premium
--   seedance_20_fast (Kie.ai)    $0.125/s   pro+premium
--
-- STRICTLY ADDITIVE — INSERT only, ON CONFLICT DO NOTHING everywhere.
-- No DELETE, no UPDATE on existing rows, no ALTER TABLE.
-- Legacy rows preserved as-is:
--   - wan_i2v (Wan 2.2, modal_local, free fallback)        — untouched
--   - seedance (Seedance via Kie.ai $0.025/s, legacy path) — untouched
--   - kling (coming_soon)                                  — untouched
--
-- Provider model IDs are sourced from official provider docs (verified
-- 2026-05-11) — DO NOT change without re-verifying.
--   wan2.6-text-to-video         → evolink.ai/blog/wan-2-6-api-guide
--   happyhorse-1.0-text-to-video → evolink.ai/happy-horse
--   seedance-2.0-text-to-video   → lib/engine-templates.ts (evolink_seedance_2)
--   wan/2-7-text-to-video        → docs.kie.ai/market/wan/2-7-text-to-video
--   bytedance/seedance-2-fast    → docs.kie.ai/market/bytedance/seedance-2-fast
--
-- api_config structures mirror existing templates in lib/engine-templates.ts:
--   - EvoLink engines  → mirror `evolink_seedance_2` (swap model)
--   - Kie.ai engines   → mirror `kie_seedance_2` (swap model)
--
-- Priorities chosen so that:
--   - wan_i2v (priority 100) stays the free-tier fallback (unchanged)
--   - wan_26 (95) becomes default for pro users when no preferred_engine
--   - happy_horse_10 (88) is low priority despite being highest quality →
--     avoids being auto-selected and burning $0.179/s without user intent
--   - CTO can tune via UI admin (UPDATE engines SET priority = ...)

-- ============================================================================
-- 1. engines — INSERT only, ON CONFLICT DO NOTHING
-- ============================================================================

INSERT INTO public.engines
  (id, name, type, status, max_duration, gpu, clip_duration, priority, api_config)
VALUES
  -- ── wan_26 (EvoLink, $0.071/s, pro+premium) ──────────────────────────────
  (
    'wan_26',
    'Wan 2.6',
    'api',
    'active',
    15,
    NULL,
    5.0,
    95,
    '{
      "_provider": "evolink.ai — Wan 2.6",
      "create_task": {
        "url": "https://api.evolink.ai/v1/videos/generations",
        "method": "POST",
        "headers": {
          "Authorization": "Bearer {{secrets.api_key}}",
          "Content-Type": "application/json"
        },
        "body": {
          "model": "wan2.6-text-to-video",
          "prompt": "{{prompt}}",
          "duration": "{{duration}}",
          "quality": "720p",
          "aspect_ratio": "16:9",
          "generate_audio": true,
          "first_frame_url": "{{image_url|optional}}"
        },
        "task_id_path": "id"
      },
      "poll_task": {
        "url": "https://api.evolink.ai/v1/tasks/{{task_id}}",
        "method": "GET",
        "headers": { "Authorization": "Bearer {{secrets.api_key}}" },
        "state_path": "status",
        "states": {
          "success": ["completed", "success"],
          "failed":  ["failed", "fail", "error", "cancelled"],
          "waiting": ["pending", "processing", "queued", "generating"]
        },
        "result_url_path": "output.video_url",
        "error_msg_path":  "error.message"
      },
      "polling": { "interval_seconds": 8, "timeout_seconds": 600 }
    }'::jsonb
  ),

  -- ── wan_27 (Kie.ai, $0.080/s, pro+premium) ───────────────────────────────
  -- Routed via Kie.ai because Wan 2.7 is NOT available on EvoLink as of
  -- 2026-05-11 (confirmed via evolink.ai/blog/wan-api-pricing-guide).
  (
    'wan_27',
    'Wan 2.7',
    'api',
    'active',
    10,
    NULL,
    5.0,
    89,
    '{
      "_provider": "kie.ai — Wan 2.7 Video",
      "create_task": {
        "url": "https://api.kie.ai/api/v1/jobs/createTask",
        "method": "POST",
        "headers": {
          "Authorization": "Bearer {{secrets.api_key}}",
          "Content-Type": "application/json"
        },
        "body": {
          "model": "wan/2-7-text-to-video",
          "input": {
            "prompt": "{{prompt}}",
            "duration": "{{duration}}",
            "resolution": "720p",
            "aspect_ratio": "16:9",
            "generate_audio": true,
            "first_frame_url": "{{image_url|optional}}"
          }
        },
        "success_code": 200,
        "success_code_path": "code",
        "task_id_path": "data.taskId"
      },
      "poll_task": {
        "url": "https://api.kie.ai/api/v1/jobs/recordInfo?taskId={{task_id}}",
        "method": "GET",
        "headers": { "Authorization": "Bearer {{secrets.api_key}}" },
        "state_path": "data.state",
        "states": {
          "success": ["success"],
          "failed":  ["fail"],
          "waiting": ["waiting", "queuing", "generating"]
        },
        "result_url_path": "data.resultJson::resultUrls.0",
        "error_msg_path":  "data.failMsg"
      },
      "polling": { "interval_seconds": 8, "timeout_seconds": 600 }
    }'::jsonb
  ),

  -- ── happy_horse_10 (EvoLink, $0.179/s, premium-only) ─────────────────────
  -- Top quality model. Priority 88 (low) so it is NEVER auto-selected for
  -- a generation without explicit user request → user must set
  -- preferred_engine='happy_horse_10' to opt into the $0.179/s cost.
  (
    'happy_horse_10',
    'Happy Horse 1.0',
    'api',
    'active',
    15,
    NULL,
    5.0,
    88,
    '{
      "_provider": "evolink.ai — Happy Horse 1.0",
      "create_task": {
        "url": "https://api.evolink.ai/v1/videos/generations",
        "method": "POST",
        "headers": {
          "Authorization": "Bearer {{secrets.api_key}}",
          "Content-Type": "application/json"
        },
        "body": {
          "model": "happyhorse-1.0-text-to-video",
          "prompt": "{{prompt}}",
          "duration": "{{duration}}",
          "quality": "720p",
          "aspect_ratio": "16:9",
          "generate_audio": true,
          "first_frame_url": "{{image_url|optional}}"
        },
        "task_id_path": "id"
      },
      "poll_task": {
        "url": "https://api.evolink.ai/v1/tasks/{{task_id}}",
        "method": "GET",
        "headers": { "Authorization": "Bearer {{secrets.api_key}}" },
        "state_path": "status",
        "states": {
          "success": ["completed", "success"],
          "failed":  ["failed", "fail", "error", "cancelled"],
          "waiting": ["pending", "processing", "queued", "generating"]
        },
        "result_url_path": "output.video_url",
        "error_msg_path":  "error.message"
      },
      "polling": { "interval_seconds": 8, "timeout_seconds": 600 }
    }'::jsonb
  ),

  -- ── seedance_20 (EvoLink, $0.199/s, premium-only) ────────────────────────
  -- EvoLink-routed Seedance 2.0 (distinct from legacy `seedance` row which
  -- routes via Kie.ai at $0.025/s). This row exists for V1 multi-reference.
  (
    'seedance_20',
    'Seedance 2.0',
    'api',
    'active',
    15,
    NULL,
    5.0,
    92,
    '{
      "_provider": "evolink.ai — Seedance 2.0",
      "create_task": {
        "url": "https://api.evolink.ai/v1/videos/generations",
        "method": "POST",
        "headers": {
          "Authorization": "Bearer {{secrets.api_key}}",
          "Content-Type": "application/json"
        },
        "body": {
          "model": "seedance-2.0-text-to-video",
          "prompt": "{{prompt}}",
          "duration": "{{duration}}",
          "quality": "720p",
          "aspect_ratio": "16:9",
          "generate_audio": true,
          "first_frame_url": "{{image_url|optional}}"
        },
        "task_id_path": "id"
      },
      "poll_task": {
        "url": "https://api.evolink.ai/v1/tasks/{{task_id}}",
        "method": "GET",
        "headers": { "Authorization": "Bearer {{secrets.api_key}}" },
        "state_path": "status",
        "states": {
          "success": ["completed", "success"],
          "failed":  ["failed", "fail", "error", "cancelled"],
          "waiting": ["pending", "processing", "queued", "generating"]
        },
        "result_url_path": "output.video_url",
        "error_msg_path":  "error.message"
      },
      "polling": { "interval_seconds": 8, "timeout_seconds": 600 }
    }'::jsonb
  ),

  -- ── seedance_20_fast (Kie.ai, $0.125/s, pro+premium) ─────────────────────
  -- Fast variant of Seedance 2.0 via Kie.ai. Per docs.kie.ai/market/bytedance/seedance-2-fast :
  -- max 15s, 480p/720p only (no 1080p), audio supported.
  (
    'seedance_20_fast',
    'Seedance 2.0 Fast',
    'api',
    'active',
    15,
    NULL,
    5.0,
    91,
    '{
      "_provider": "kie.ai — Seedance 2.0 Fast",
      "create_task": {
        "url": "https://api.kie.ai/api/v1/jobs/createTask",
        "method": "POST",
        "headers": {
          "Authorization": "Bearer {{secrets.api_key}}",
          "Content-Type": "application/json"
        },
        "body": {
          "model": "bytedance/seedance-2-fast",
          "input": {
            "prompt": "{{prompt}}",
            "duration": "{{duration}}",
            "resolution": "720p",
            "aspect_ratio": "16:9",
            "generate_audio": true,
            "web_search": false,
            "nsfw_checker": false,
            "first_frame_url": "{{image_url|optional}}"
          }
        },
        "success_code": 200,
        "success_code_path": "code",
        "task_id_path": "data.taskId"
      },
      "poll_task": {
        "url": "https://api.kie.ai/api/v1/jobs/recordInfo?taskId={{task_id}}",
        "method": "GET",
        "headers": { "Authorization": "Bearer {{secrets.api_key}}" },
        "state_path": "data.state",
        "states": {
          "success": ["success"],
          "failed":  ["fail"],
          "waiting": ["waiting", "queuing", "generating"]
        },
        "result_url_path": "data.resultJson::resultUrls.0",
        "error_msg_path":  "data.failMsg"
      },
      "polling": { "interval_seconds": 8, "timeout_seconds": 300 }
    }'::jsonb
  )
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 2. engine_plans — INSERT only, ON CONFLICT DO NOTHING
-- ============================================================================
INSERT INTO public.engine_plans (engine_id, plan) VALUES
  ('wan_26',           'pro'),
  ('wan_26',           'premium'),
  ('wan_27',           'pro'),
  ('wan_27',           'premium'),
  ('happy_horse_10',   'premium'),
  ('seedance_20',      'premium'),
  ('seedance_20_fast', 'pro'),
  ('seedance_20_fast', 'premium')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 3. engine_costs — INSERT only, ON CONFLICT DO NOTHING
-- All per_second billing, USD. Values per CTO brief 2026-05-11.
-- ============================================================================
INSERT INTO public.engine_costs (engine_id, billing_model, per_second_usd) VALUES
  ('wan_26',           'per_second', 0.071),
  ('wan_27',           'per_second', 0.080),
  ('happy_horse_10',   'per_second', 0.179),
  ('seedance_20',      'per_second', 0.199),
  ('seedance_20_fast', 'per_second', 0.125)
ON CONFLICT (engine_id) DO NOTHING;

-- ============================================================================
-- VERIFICATION (run post-apply via SELECT) :
--   SELECT id, name, status, priority FROM engines
--     WHERE id IN ('wan_26','wan_27','happy_horse_10','seedance_20','seedance_20_fast');
--   SELECT engine_id, plan FROM engine_plans
--     WHERE engine_id IN ('wan_26','wan_27','happy_horse_10','seedance_20','seedance_20_fast')
--     ORDER BY engine_id, plan;
--   SELECT engine_id, billing_model, per_second_usd FROM engine_costs
--     WHERE engine_id IN ('wan_26','wan_27','happy_horse_10','seedance_20','seedance_20_fast')
--     ORDER BY engine_id;
-- ============================================================================
