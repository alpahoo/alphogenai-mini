"""Free CPU verification of the ComfyUI result polling: a slow or failed poll must not end a run."""
import unittest
from types import SimpleNamespace

import requests

from modal_app.comfy.executor import HISTORY_POLL_TIMEOUT_S, wait_for_history

ENTRY = {"status": {"status_str": "success"}, "outputs": {"15": {}}}


class Clock:
    def __init__(self):
        self.t = 0.0

    def now(self):
        return self.t

    def sleep(self, seconds):
        self.t += seconds


def reply(body=None, status=200):
    def raise_for_status():
        if status >= 400:
            raise requests.HTTPError(f"{status}")
    def json():
        if body is None:
            raise ValueError("not json")
        return body
    return SimpleNamespace(raise_for_status=raise_for_status, json=json)


def running():
    return SimpleNamespace(poll=lambda: None)


class HistoryPollTests(unittest.TestCase):
    def poll(self, replies, deadline=60.0, process=None):
        clock, calls = Clock(), []
        replies = iter(replies)

        def get(url, timeout):
            calls.append((url, timeout))
            item = next(replies)
            if isinstance(item, Exception):
                clock.t += timeout  # a timed-out request spends its whole timeout
                raise item
            return item
        entry = wait_for_history("http://127.0.0.1:8188", "p1", deadline, process or running(),
                                 get=get, sleep=clock.sleep, now=clock.now)
        return entry, calls, clock

    def test_read_timeouts_while_models_load_do_not_end_the_run(self):
        timeout = requests.exceptions.ReadTimeout("Read timed out. (read timeout=5)")
        entry, calls, _ = self.poll([reply({}), timeout, timeout, reply({}), reply({"p1": ENTRY})])
        self.assertEqual(entry, ENTRY)
        self.assertEqual(len(calls), 5)
        self.assertTrue(all(url.endswith("/history/p1") and t == HISTORY_POLL_TIMEOUT_S for url, t in calls))

    def test_connection_errors_server_errors_and_bad_json_are_retried(self):
        entry, _, _ = self.poll([requests.exceptions.ConnectionError("refused"), reply({}, status=500),
                                 reply(None), reply({"p1": ENTRY})])
        self.assertEqual(entry, ENTRY)

    def test_gives_up_only_at_the_deadline(self):
        timeout = requests.exceptions.ReadTimeout("slow")
        entry, calls, clock = self.poll([timeout] * 100, deadline=60.0)
        self.assertIsNone(entry)
        self.assertGreaterEqual(clock.t, 60.0)
        self.assertLess(len(calls), 10)

    def test_stops_at_once_when_comfyui_has_exited(self):
        with self.assertRaisesRegex(RuntimeError, "COMFY_EXITED"):
            self.poll([reply({})], process=SimpleNamespace(poll=lambda: 1))

    def test_poll_limit_leaves_room_inside_the_standard_deadline(self):
        from modal_app.comfy.executor import RUNTIMES
        self.assertLess(HISTORY_POLL_TIMEOUT_S * 4, RUNTIMES["h3-video@1"]["deadline_s"])


if __name__ == "__main__":
    unittest.main()
