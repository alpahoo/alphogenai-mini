"""
Seedance 2.0 engine adapter via Kie.ai API.

Calls the Kie.ai REST API to generate video clips using the
ByteDance Seedance 2.0 model. Async API with polling.

On failure, exceptions propagate to the orchestrator which handles
fallback to WanEngine via generate_with_fallback().
"""
from __future__ import annotations

import json
import logging
import os
import time

import httpx

from .base import BaseEngine

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Kie.ai API configuration
# ---------------------------------------------------------------------------
KIE_API_BASE = "https://api.kie.ai/api/v1"
KIE_MODEL_SEEDANCE = "bytedance/seedance-2"
KIE_POLL_INTERVAL = 5        # seconds between status checks
KIE_POLL_TIMEOUT = 120       # max seconds to wait for completion
KIE_HTTP_TIMEOUT = 30        # timeout per HTTP request


class SeedanceEngine(BaseEngine):
    """Adapter for Seedance 2.0 via Kie.ai REST API."""

    key = "seedance"

    def generate(
        self,
        prompt: str,
        job_id: str,
        duration_seconds: int = 5,
        **kwargs,
    ) -> bytes:
        api_key = os.environ.get("KIE_API_KEY")
        if not api_key:
            raise RuntimeError("SeedanceEngine: KIE_API_KEY not set")

        # Clamp duration to Kie.ai limits (4-15 seconds)
        duration = max(4, min(15, duration_seconds))

        logger.info(f"[seedance] job={job_id} submitting to Kie.ai (dur={duration}s)")

        # ----- 1. Create generation task -----
        task_id = self._create_task(api_key, prompt, duration)
        logger.info(f"[seedance] job={job_id} taskId={task_id}")

        # ----- 2. Poll until complete -----
        video_url = self._poll_until_done(api_key, task_id, job_id)
        logger.info(f"[seedance] job={job_id} video ready: {video_url[:80]}...")

        # ----- 3. Download MP4 bytes -----
        video_bytes = self._download_video(video_url, job_id)
        logger.info(f"[seedance] job={job_id} downloaded {len(video_bytes)} bytes")

        return video_bytes

    # -- internal helpers --------------------------------------------------

    def _create_task(self, api_key: str, prompt: str, duration: int) -> str:
        """Submit a generation task to Kie.ai. Returns taskId."""
        payload = {
            "model": KIE_MODEL_SEEDANCE,
            "input": {
                "prompt": prompt,
                "duration": duration,
                "resolution": "720p",
                "aspect_ratio": "16:9",
                "generate_audio": False,
                "web_search": False,
                "nsfw_checker": False,
            },
        }

        with httpx.Client(timeout=KIE_HTTP_TIMEOUT) as client:
            resp = client.post(
                f"{KIE_API_BASE}/jobs/createTask",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            resp.raise_for_status()

        data = resp.json()
        if data.get("code") != 200:
            raise RuntimeError(f"Kie.ai createTask failed: {data.get('msg', 'unknown')}")

        task_id = data.get("data", {}).get("taskId")
        if not task_id:
            raise RuntimeError("Kie.ai createTask returned no taskId")

        return task_id

    def _poll_until_done(self, api_key: str, task_id: str, job_id: str) -> str:
        """Poll Kie.ai until task succeeds or fails. Returns video URL."""
        deadline = time.time() + KIE_POLL_TIMEOUT
        attempt = 0

        with httpx.Client(timeout=KIE_HTTP_TIMEOUT) as client:
            while time.time() < deadline:
                attempt += 1
                resp = client.get(
                    f"{KIE_API_BASE}/jobs/recordInfo",
                    params={"taskId": task_id},
                    headers={"Authorization": f"Bearer {api_key}"},
                )
                resp.raise_for_status()

                data = resp.json().get("data", {})
                state = data.get("state", "unknown")
                progress = data.get("progress", 0)

                logger.info(
                    f"[seedance] job={job_id} poll #{attempt}: "
                    f"state={state} progress={progress}%"
                )

                if state == "success":
                    return self._extract_video_url(data)

                if state == "fail":
                    fail_msg = data.get("failMsg", "unknown error")
                    raise RuntimeError(f"Kie.ai generation failed: {fail_msg}")

                time.sleep(KIE_POLL_INTERVAL)

        raise TimeoutError(
            f"Kie.ai task {task_id} did not complete within {KIE_POLL_TIMEOUT}s"
        )

    @staticmethod
    def _extract_video_url(data: dict) -> str:
        """Parse resultJson to get the video URL."""
        result_json_str = data.get("resultJson", "")
        if not result_json_str:
            raise RuntimeError("Kie.ai task succeeded but resultJson is empty")

        try:
            result = json.loads(result_json_str)
        except json.JSONDecodeError as e:
            raise RuntimeError(f"Kie.ai resultJson is not valid JSON: {e}")

        urls = result.get("resultUrls", [])
        if not urls:
            raise RuntimeError("Kie.ai resultJson has no resultUrls")

        return urls[0]

    @staticmethod
    def _download_video(url: str, job_id: str) -> bytes:
        """Download the generated video from Kie.ai CDN."""
        with httpx.Client(timeout=60) as client:
            resp = client.get(url)
            resp.raise_for_status()

        if len(resp.content) < 1000:
            raise RuntimeError(
                f"Kie.ai video download suspiciously small ({len(resp.content)} bytes)"
            )

        return resp.content
