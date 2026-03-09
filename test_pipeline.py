#!/usr/bin/env python3
"""
Test local du pipeline AlphoGenAI Mini
Valide la logique sans credentials externes (Supabase, Modal, etc.)
"""
import asyncio
import sys
import os
import logging
from datetime import datetime, timezone

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("test_pipeline")

PASS = 0
FAIL = 0


def result(name: str, ok: bool, detail: str = ""):
    global PASS, FAIL
    if ok:
        PASS += 1
        print(f"  OK  {name}" + (f" — {detail}" if detail else ""))
    else:
        FAIL += 1
        print(f"  ERR {name}" + (f" — {detail}" if detail else ""))


# ──────────────────────────────────────────────────────
# 1. Budget Guard
# ──────────────────────────────────────────────────────
def test_budget_guard():
    print("\n[1] Budget Guard")
    from workers.budget_guard import BudgetGuard, BudgetConfig

    config = BudgetConfig(
        max_concurrency=2,
        max_runtime_per_job=10,
        daily_budget_alert_eur=5.0,
        daily_budget_hardcap_eur=10.0,
    )
    guard = BudgetGuard(config)

    # Can start when empty
    can, reason = guard.can_start_job()
    result("can_start_job (empty)", can, reason or "")

    # Start job
    guard.start_job("job-1")
    result("start_job", "job-1" in guard.active_jobs)

    # Can start second (concurrency=2)
    can, _ = guard.can_start_job()
    result("can_start_second_job", can)

    guard.start_job("job-2")

    # Cannot start third (concurrency=2)
    can, reason = guard.can_start_job()
    result("block_third_job", not can, reason or "")

    # Finish job
    cost = guard.finish_job("job-1", duration_seconds=60)
    result("finish_job_cost", cost > 0, f"{cost:.4f} EUR")

    # Daily spending
    spending = guard.get_daily_spending()
    result("daily_spending", spending["spent_eur"] > 0, f"{spending['spent_eur']:.4f} EUR")

    # Timeout check
    guard.start_job("job-3")
    timed_out = guard.check_job_timeout("job-3")
    result("no_timeout_yet", not timed_out)

    # Cleanup
    guard.finish_job("job-2", duration_seconds=30)
    guard.finish_job("job-3", duration_seconds=5)

    # Hard cap test
    guard2 = BudgetGuard(BudgetConfig(daily_budget_hardcap_eur=0.001))
    guard2.start_job("cap-test")
    guard2.finish_job("cap-test", duration_seconds=3600)
    can, reason = guard2.can_start_job()
    result("hardcap_blocks", not can, reason or "")


# ──────────────────────────────────────────────────────
# 2. Budget Guard Middleware (async)
# ──────────────────────────────────────────────────────
async def test_budget_middleware():
    print("\n[2] Budget Guard Middleware")
    from workers.budget_guard import BudgetGuard, BudgetGuardMiddleware, BudgetConfig

    config = BudgetConfig(max_concurrency=1, daily_budget_hardcap_eur=50.0)
    guard = BudgetGuard(config)
    middleware = BudgetGuardMiddleware(guard)

    ok = await middleware.before_job("mw-job-1")
    result("before_job_allowed", ok)

    # Second job blocked (concurrency=1)
    ok2 = await middleware.before_job("mw-job-2")
    result("before_job_blocked", not ok2)

    # Timeout check
    timed = await middleware.check_timeout("mw-job-1")
    result("no_timeout", not timed)

    # After job
    await middleware.after_job("mw-job-1", success=True)
    result("after_job", len(guard.active_jobs) == 0)

    # Status
    status = middleware.get_status()
    result("get_status", "spending" in status and "active_jobs" in status)


# ──────────────────────────────────────────────────────
# 3. SVI Client (structure only, no network)
# ──────────────────────────────────────────────────────
def test_svi_client():
    print("\n[3] SVI Client")
    os.environ["SVI_ENDPOINT_URL"] = "http://localhost:9999"
    from workers.svi_client import SVIClient

    client = SVIClient()
    result("init_ok", client.endpoint_url == "http://localhost:9999")

    # Verify methods are async (coroutine functions)
    import inspect
    result("generate_video_is_async", inspect.iscoroutinefunction(client.generate_video))
    result("generate_from_keyword_is_async", inspect.iscoroutinefunction(client.generate_from_keyword))
    result("health_check_is_async", inspect.iscoroutinefunction(client.health_check))


# ──────────────────────────────────────────────────────
# 4. Audio Orchestrator (structure only)
# ──────────────────────────────────────────────────────
async def test_audio_orchestrator():
    print("\n[4] Audio Orchestrator")
    os.environ["AUDIO_BACKEND_URL"] = "http://localhost:9998"
    from workers.audio_orchestrator import AudioOrchestrator

    orch = AudioOrchestrator()
    result("init_ok", orch.audio_backend_url == "http://localhost:9998")

    # Test disabled mode
    orch_off = AudioOrchestrator()
    orch_off.audio_mode = "off"
    res = await orch_off.process_audio("test-job", "http://video.mp4", "test prompt")
    result("disabled_returns_video_url", res["output_url_final"] == "http://video.mp4")
    result("disabled_no_audio", res["audio_url"] is None)


# ──────────────────────────────────────────────────────
# 5. FFmpeg Assembler (structure only)
# ──────────────────────────────────────────────────────
def test_ffmpeg_assembler():
    print("\n[5] FFmpeg Assembler")
    from workers.ffmpeg_assembler import FFmpegAssembler

    assembler = FFmpegAssembler()
    result("init_ok", assembler.temp_dir.exists())
    result("unique_temp_dir", "video_assembly_" in str(assembler.temp_dir))

    # Second instance gets different dir
    assembler2 = FFmpegAssembler()
    result("unique_per_instance", str(assembler.temp_dir) != str(assembler2.temp_dir))

    # Cleanup
    assembler.cleanup(assembler.temp_dir)
    result("cleanup_works", not assembler.temp_dir.exists())
    assembler2.cleanup(assembler2.temp_dir)


# ──────────────────────────────────────────────────────
# 6. Config
# ──────────────────────────────────────────────────────
def test_config():
    print("\n[6] Config")
    os.environ["SUPABASE_URL"] = "https://test.supabase.co"
    os.environ["SUPABASE_SERVICE_ROLE_KEY"] = "test-key"

    from workers.config import get_settings
    settings = get_settings()

    result("supabase_url", settings.SUPABASE_URL == "https://test.supabase.co")
    result("service_key_fallback", settings.get_service_key() == "test-key")
    result("max_retries_default", settings.MAX_RETRIES == 3)
    result("audio_mode_default", settings.AUDIO_MODE == "auto")
    result("clip_duration_default", settings.CLIP_DURATION == 10)


# ──────────────────────────────────────────────────────
# 7. Supabase Client (structure only)
# ──────────────────────────────────────────────────────
def test_supabase_client_structure():
    print("\n[7] Supabase Client (structure via AST)")
    import ast

    with open("workers/supabase_client.py") as f:
        tree = ast.parse(f.read())

    # Find the SupabaseClient class
    cls = next(n for n in ast.walk(tree) if isinstance(n, ast.ClassDef) and n.name == "SupabaseClient")
    methods = {n.name: n for n in cls.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))}

    expected_sync = ["create_job", "update_job_state", "increment_retry", "get_job", "get_pending_jobs", "save_to_cache"]
    for name in expected_sync:
        if name in methods:
            is_sync = isinstance(methods[name], ast.FunctionDef)
            result(f"{name}_is_sync", is_sync)
        else:
            result(f"{name}_exists", False, "method not found")


# ──────────────────────────────────────────────────────
# 8. Music Selector
# ──────────────────────────────────────────────────────
def test_music_selector():
    print("\n[8] Music Selector")
    from workers.music_selector import pick_music_track, build_prompt_hash

    track = pick_music_track("inspirant")
    result("inspiring_returns_track", track is not None and track["url"].startswith("http"))

    track2 = pick_music_track("épique")
    result("epic_returns_track", track2 is not None and track2["url"].startswith("http"))

    # Unknown tone falls back to inspiring
    track3 = pick_music_track("nonexistent_tone")
    result("fallback_tone", track3 is not None)

    # Prompt hash
    h = build_prompt_hash("test prompt", "inspiring")
    result("prompt_hash_consistent", h == build_prompt_hash("test prompt", "inspiring"))
    result("prompt_hash_differs", h != build_prompt_hash("different prompt", "inspiring"))


# ──────────────────────────────────────────────────────
# 9. TypeScript types (parse check)
# ──────────────────────────────────────────────────────
def test_types_ts():
    print("\n[9] TypeScript types.ts")
    with open("lib/types.ts") as f:
        content = f.read()

    result("free_15s", 'free: 15' in content)
    result("pro_60s", 'pro: 60' in content)
    result("premium_120s", 'premium: 120' in content)
    result("no_inverted_90s", 'free: 90' not in content)


# ──────────────────────────────────────────────────────
# 10. Webhook security
# ──────────────────────────────────────────────────────
def test_webhook_security():
    print("\n[10] Webhook Security")
    with open("app/api/webhooks/modal/route.ts") as f:
        content = f.read()

    result("uses_timingSafeEqual", "timingSafeEqual" in content)
    result("has_allowed_fields", "ALLOWED_UPDATE_FIELDS" in content)
    result("no_direct_comparison", 'secret !== process.env' not in content)


# ──────────────────────────────────────────────────────
# Run all
# ──────────────────────────────────────────────────────
def main():
    print("=" * 60)
    print("TEST PIPELINE ALPHOGENAI MINI")
    print(f"Date: {datetime.now(timezone.utc).isoformat()}")
    print("=" * 60)

    # Add project root to path
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

    # Set minimal env vars for imports
    os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
    os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-key")

    # Sync tests
    test_budget_guard()
    test_svi_client()
    test_ffmpeg_assembler()
    test_config()
    test_supabase_client_structure()
    test_music_selector()
    test_types_ts()
    test_webhook_security()

    # Async tests
    asyncio.run(async_tests())

    # Summary
    total = PASS + FAIL
    print(f"\n{'=' * 60}")
    print(f"RESULTATS: {PASS}/{total} OK" + (f", {FAIL} ERREURS" if FAIL else ""))
    print(f"{'=' * 60}")

    sys.exit(1 if FAIL > 0 else 0)


async def async_tests():
    await test_budget_middleware()
    await test_audio_orchestrator()


if __name__ == "__main__":
    main()
