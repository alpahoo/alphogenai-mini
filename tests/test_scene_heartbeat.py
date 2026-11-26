"""
Heartbeat that keeps the DB watchdogs (30 min without update) away from a
scene that is still being generated (~28 min for one Wan scene).

Run: python -m pytest tests/test_scene_heartbeat.py -v
"""
from __future__ import annotations

import os
import sys
import threading
import time
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import modal_app.video_pipeline as vp  # noqa: E402


class TestHeartbeat(unittest.TestCase):
    def test_beats_while_running_and_stops_after(self):
        calls = []
        with patch.object(vp, "_touch_rows", side_effect=lambda j, s=None: calls.append((j, s))):
            with vp._Heartbeat("job-1", 2, interval=0.05):
                time.sleep(0.28)
            n = len(calls)
            time.sleep(0.15)
        self.assertGreaterEqual(n, 3)
        self.assertEqual(len(calls), n, "heartbeat kept running after the block")
        self.assertTrue(all(c == ("job-1", 2) for c in calls))

    def test_stops_when_block_raises(self):
        with patch.object(vp, "_touch_rows"):
            hb = vp._Heartbeat("job-1", interval=0.05)
            with self.assertRaises(RuntimeError):
                with hb:
                    raise RuntimeError("scene failed")
        hb._thread.join(timeout=1)
        self.assertFalse(hb._thread.is_alive())

    def test_interval_is_well_below_watchdog_limit(self):
        # watchdogs fail rows not updated for 30 min and run every 5 min
        self.assertLessEqual(vp.HEARTBEAT_SECONDS, 5 * 60)


class TestTouchRows(unittest.TestCase):
    def _client(self):
        sb = MagicMock()
        tables = {}

        def table(name):
            tables.setdefault(name, MagicMock())
            return tables[name]

        sb.table.side_effect = table
        return sb, tables

    def test_touches_only_active_job_and_generating_scene(self):
        sb, tables = self._client()
        with patch.object(vp, "get_supabase_client", return_value=sb):
            vp._touch_rows("job-1", 3)

        job_q = tables["jobs"].update.return_value
        self.assertIn("updated_at", tables["jobs"].update.call_args.args[0])
        job_q.eq.assert_called_once_with("id", "job-1")
        job_q.eq.return_value.in_.assert_called_once_with("status", vp._ACTIVE_JOB_STATUSES)
        self.assertNotIn("failed", vp._ACTIVE_JOB_STATUSES)
        self.assertNotIn("done", vp._ACTIVE_JOB_STATUSES)

        scene_update = tables["job_scenes"].update
        self.assertEqual(list(scene_update.call_args.args[0]), ["updated_at"])
        q = scene_update.return_value
        q.eq.assert_called_once_with("job_id", "job-1")
        q.eq.return_value.eq.assert_called_once_with("scene_index", 3)
        q.eq.return_value.eq.return_value.eq.assert_called_once_with("status", "generating")

    def test_job_only_when_no_scene(self):
        sb, tables = self._client()
        with patch.object(vp, "get_supabase_client", return_value=sb):
            vp._touch_rows("job-1")
        self.assertNotIn("job_scenes", tables)

    def test_db_error_is_swallowed(self):
        with patch.object(vp, "get_supabase_client", side_effect=ValueError("no creds")):
            vp._touch_rows("job-1", 0)  # must not raise


class TestModalLimits(unittest.TestCase):
    def test_generate_clip_timeout_has_headroom(self):
        src = open(vp.__file__, encoding="utf-8-sig").read()
        block = src[src.index("def generate_clip(") - 600: src.index("def generate_clip(")]
        self.assertIn("timeout=2700", block)


if __name__ == "__main__":
    unittest.main()
