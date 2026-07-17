import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

try:
    import requests  # noqa: F401
except ModuleNotFoundError:
    sys.modules["requests"] = MagicMock()

from workers.veed_web import veed_web_worker as worker


class PersistCompletedJobTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.shots_patch = patch.object(worker, "SHOTS", Path(self.temp_dir.name))
        self.shots_patch.start()
        self.addCleanup(self.shots_patch.stop)

    def test_persists_done_on_first_attempt(self):
        with patch.object(worker, "sb_patch", return_value=[{"id": "job-1"}]) as update:
            result = worker.persist_completed_job(
                "job-1",
                "https://r2/video.mp4",
                {"engine": "veed_web"},
                sleep_fn=lambda _: None,
            )

        self.assertEqual(result, {"id": "job-1"})
        self.assertEqual(update.call_count, 1)
        self.assertEqual(update.call_args.args[1]["status"], "done")

    def test_preserves_output_in_recovery_state_after_retries(self):
        calls = [RuntimeError("db down"), [], [{"id": "job-1"}]]
        with patch.object(worker, "sb_patch", side_effect=calls) as update:
            with self.assertRaises(worker.FinalPersistenceError):
                worker.persist_completed_job(
                    "job-1",
                    "https://r2/video.mp4",
                    {"engine": "veed_web"},
                    attempts=2,
                    sleep_fn=lambda _: None,
                )

        self.assertEqual(update.call_count, 3)
        recovery = update.call_args_list[-1].args[1]
        self.assertEqual(recovery["status"], "in_progress")
        self.assertEqual(recovery["current_stage"], "veed_output_ready")
        self.assertEqual(recovery["final_url"], "https://r2/video.mp4")
        self.assertEqual(recovery["video_url"], "https://r2/video.mp4")
        self.assertEqual(
            recovery["app_state"]["status_detail"],
            "FINAL_DB_WRITE_FAILED",
        )

    def test_writes_local_recovery_record_if_database_stays_unavailable(self):
        with patch.object(worker, "sb_patch", side_effect=RuntimeError("db down")):
            with self.assertRaises(worker.FinalPersistenceError):
                worker.persist_completed_job(
                    "job-1",
                    "https://r2/video.mp4",
                    {"engine": "veed_web"},
                    attempts=1,
                    sleep_fn=lambda _: None,
                )

        record_path = Path(self.temp_dir.name) / "job-1_OUTPUT_READY.json"
        record = json.loads(record_path.read_text(encoding="utf-8"))
        self.assertEqual(record["job_id"], "job-1")
        self.assertEqual(record["r2_url"], "https://r2/video.mp4")
        self.assertEqual(
            record["app_state"]["status_detail"],
            "FINAL_DB_WRITE_FAILED",
        )

    def test_recover_output_ready_promotes_without_opening_browser(self):
        recovery = {
            "id": "job-1",
            "status": "in_progress",
            "current_stage": "veed_output_ready",
            "final_url": "https://r2/video.mp4",
            "app_state": {"engine": "veed_web", "status_detail": "FINAL_DB_WRITE_FAILED"},
        }
        with (
            patch.object(worker, "find_output_ready_job", return_value=recovery),
            patch.object(worker, "persist_completed_job", return_value={"id": "job-1"}) as persist,
        ):
            result = worker.recover_output_ready()

        self.assertEqual(result, "RECOVERED")
        persist.assert_called_once_with(
            "job-1",
            "https://r2/video.mp4",
            recovery["app_state"],
        )

    def test_recover_output_ready_returns_none_when_queue_is_empty(self):
        with patch.object(worker, "find_local_output_ready", return_value=None), \
             patch.object(worker, "find_output_ready_job", return_value=None):
            self.assertIsNone(worker.recover_output_ready())

    def test_recover_output_ready_promotes_and_removes_local_manifest(self):
        manifest = Path(self.temp_dir.name) / "job-local_OUTPUT_READY.json"
        manifest.write_text(
            json.dumps({
                "job_id": "job-local",
                "r2_url": "https://r2/video-local.mp4",
                "app_state": {"engine": "veed_web"},
            }),
            encoding="utf-8",
        )
        with patch.object(worker, "persist_completed_job") as persist, \
             patch.object(worker, "find_output_ready_job") as db_recovery:
            result = worker.recover_output_ready()

        self.assertEqual(result, "RECOVERED")
        persist.assert_called_once_with(
            "job-local",
            "https://r2/video-local.mp4",
            {"engine": "veed_web"},
        )
        db_recovery.assert_not_called()
        self.assertFalse(manifest.exists())


if __name__ == "__main__":
    unittest.main()
