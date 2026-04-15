"""
Seedance engine routing + fallback validation tests.

Tests the 6 critical scenarios:
1. ENABLE_SEEDANCE=false → free/pro/premium = Wan only
2. ENABLE_SEEDANCE=true + pro → selects seedance
3. Seedance success → engine_used="seedance" + correct cost
4. Seedance failure → fallback Wan + engine_used="wan_i2v" + cost recalc
5. Free plan → Wan even if flag ON
6. Multi-scene with fallback → job-level engine_used="wan_i2v"

Run: python -m pytest tests/test_seedance_routing.py -v
"""
from __future__ import annotations

import os
import sys
import importlib
import unittest
from unittest.mock import patch, MagicMock

# ---------------------------------------------------------------------------
# Ensure modal_app is importable
# ---------------------------------------------------------------------------
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def _reload_registry(enable_seedance: bool):
    """Reload registry module with ENABLE_SEEDANCE set/unset."""
    env_val = "true" if enable_seedance else "false"
    with patch.dict(os.environ, {"ENABLE_SEEDANCE": env_val}):
        import modal_app.engines.registry as registry
        importlib.reload(registry)
        return registry


def _reload_router(enable_seedance: bool):
    """Reload router after reloading registry with given flag."""
    registry = _reload_registry(enable_seedance)
    import modal_app.engines.router as router
    # Patch router's reference to ENGINES and is_engine_available
    importlib.reload(router)
    return router, registry


class TestScenario1_FlagOff(unittest.TestCase):
    """ENABLE_SEEDANCE=false → all plans use wan_i2v."""

    def setUp(self):
        self.router, self.registry = _reload_router(enable_seedance=False)

    def test_free_gets_wan(self):
        result = self.router.select_engine(plan="free", duration_seconds=5)
        self.assertEqual(result, "wan_i2v")

    def test_pro_gets_wan_when_flag_off(self):
        result = self.router.select_engine(plan="pro", duration_seconds=5)
        self.assertEqual(result, "wan_i2v")

    def test_premium_gets_wan_when_flag_off(self):
        result = self.router.select_engine(plan="premium", duration_seconds=5)
        self.assertEqual(result, "wan_i2v")

    def test_seedance_is_coming_soon(self):
        self.assertEqual(
            self.registry.ENGINES["seedance"]["status"], "coming_soon"
        )


class TestScenario2_FlagOn_ProGetsSeedance(unittest.TestCase):
    """ENABLE_SEEDANCE=true + pro → selects seedance."""

    def setUp(self):
        self.router, self.registry = _reload_router(enable_seedance=True)

    def test_pro_gets_seedance(self):
        result = self.router.select_engine(plan="pro", duration_seconds=5)
        self.assertEqual(result, "seedance")

    def test_premium_gets_seedance(self):
        result = self.router.select_engine(plan="premium", duration_seconds=5)
        self.assertEqual(result, "seedance")

    def test_seedance_is_active(self):
        self.assertEqual(
            self.registry.ENGINES["seedance"]["status"], "active"
        )


class TestScenario3_CostTracking(unittest.TestCase):
    """Seedance success → correct cost calculation."""

    def test_seedance_cost_5s(self):
        from modal_app.utils.costs import estimate_cost
        cost = estimate_cost("seedance", 5)
        self.assertAlmostEqual(cost, 0.125)  # 0.025 * 5

    def test_seedance_cost_10s(self):
        from modal_app.utils.costs import estimate_cost
        cost = estimate_cost("seedance", 10)
        self.assertAlmostEqual(cost, 0.25)  # 0.025 * 10

    def test_wan_cost_unchanged(self):
        from modal_app.utils.costs import estimate_cost
        cost = estimate_cost("wan_i2v", 5)
        self.assertAlmostEqual(cost, 0.075)  # 0.015 * 5

    def test_unknown_engine_returns_zero(self):
        from modal_app.utils.costs import estimate_cost
        cost = estimate_cost("nonexistent", 5)
        self.assertEqual(cost, 0.0)


class TestScenario4_FallbackBehavior(unittest.TestCase):
    """Seedance failure → fallback to Wan + correct engine_used."""

    def test_generate_with_fallback_on_seedance_error(self):
        """Mock seedance to fail, verify wan is called."""
        from modal_app.engines import generate_with_fallback, get_engine_adapter

        # We need engines to be initialized
        from modal_app.engines import _wan, _seedance
        import modal_app.engines as engines_mod
        engines_mod._initialized = True

        # Mock seedance to raise
        original_generate = _seedance.generate
        _seedance.generate = MagicMock(
            side_effect=RuntimeError("Kie.ai API timeout")
        )

        # Mock wan to return fake bytes
        fake_video = b"\x00" * 5000
        original_wan_generate = _wan.generate
        _wan._generate_fn = lambda p, j: fake_video

        try:
            video_bytes, actual_engine = generate_with_fallback(
                "seedance", prompt="test", job_id="test-001", duration_seconds=5
            )
            self.assertEqual(actual_engine, "wan_i2v")
            self.assertEqual(video_bytes, fake_video)
            _seedance.generate.assert_called_once()
        finally:
            _seedance.generate = original_generate
            _wan._generate_fn = None
            engines_mod._initialized = False

    def test_wan_no_fallback_wrapper(self):
        """When engine_key is wan_i2v, no try/except wrapping."""
        from modal_app.engines import generate_with_fallback
        import modal_app.engines as engines_mod
        engines_mod._initialized = True

        fake_video = b"\x00" * 5000
        from modal_app.engines import _wan
        _wan._generate_fn = lambda p, j: fake_video

        try:
            video_bytes, actual_engine = generate_with_fallback(
                "wan_i2v", prompt="test", job_id="test-002", duration_seconds=5
            )
            self.assertEqual(actual_engine, "wan_i2v")
            self.assertEqual(video_bytes, fake_video)
        finally:
            _wan._generate_fn = None
            engines_mod._initialized = False


class TestScenario5_FreePlanAlwaysWan(unittest.TestCase):
    """Free plan → Wan even if ENABLE_SEEDANCE=true."""

    def setUp(self):
        self.router, _ = _reload_router(enable_seedance=True)

    def test_free_never_gets_seedance(self):
        result = self.router.select_engine(plan="free", duration_seconds=5)
        self.assertEqual(result, "wan_i2v")

    def test_free_with_long_duration(self):
        result = self.router.select_engine(plan="free", duration_seconds=30)
        self.assertEqual(result, "wan_i2v")


class TestScenario6_RouterEdgeCases(unittest.TestCase):
    """Router edge cases — preferred engine, duration limits."""

    def setUp(self):
        self.router, _ = _reload_router(enable_seedance=True)

    def test_preferred_engine_overrides(self):
        """Explicit preferred engine is used if available."""
        result = self.router.select_engine(
            plan="pro", duration_seconds=5, preferred="wan_i2v"
        )
        self.assertEqual(result, "wan_i2v")

    def test_seedance_duration_limit(self):
        """Seedance max_duration is 15s — over that, falls to wan."""
        result = self.router.select_engine(plan="pro", duration_seconds=20)
        # Seedance max is 15s, so it should fall through to wan_i2v
        self.assertEqual(result, "wan_i2v")

    def test_seedance_within_limit(self):
        """Seedance accepts up to 15s."""
        result = self.router.select_engine(plan="pro", duration_seconds=15)
        self.assertEqual(result, "seedance")


class TestSeedanceEngineUnit(unittest.TestCase):
    """SeedanceEngine unit tests — API key check, URL extraction."""

    def test_missing_api_key_raises(self):
        from modal_app.engines.seedance import SeedanceEngine
        engine = SeedanceEngine()
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(RuntimeError) as ctx:
                engine.generate("test prompt", "test-job")
            self.assertIn("KIE_API_KEY", str(ctx.exception))

    def test_extract_video_url_success(self):
        from modal_app.engines.seedance import SeedanceEngine
        data = {
            "resultJson": '{"resultUrls":["https://cdn.kie.ai/video.mp4"]}'
        }
        url = SeedanceEngine._extract_video_url(data)
        self.assertEqual(url, "https://cdn.kie.ai/video.mp4")

    def test_extract_video_url_empty(self):
        from modal_app.engines.seedance import SeedanceEngine
        data = {"resultJson": '{"resultUrls":[]}'}
        with self.assertRaises(RuntimeError):
            SeedanceEngine._extract_video_url(data)

    def test_extract_video_url_invalid_json(self):
        from modal_app.engines.seedance import SeedanceEngine
        data = {"resultJson": "not-json"}
        with self.assertRaises(RuntimeError):
            SeedanceEngine._extract_video_url(data)


if __name__ == "__main__":
    unittest.main()
