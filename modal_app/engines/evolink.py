"""
EvoLink engine adapter — Seedance 2.0 via EvoLink unified API.

EvoLink provides access to ByteDance Seedance 2.0 with 99.9% SLA,
multi-reference support, and lower cost than direct fal.ai access.

API Reference: https://docs.evolink.ai
Pricing: $0.199/s at 720p (Seedance 2.0 Standard)

Env var: EVOLINK_API_KEY

On failure, exceptions propagate to the orchestrator which handles
fallback to WanEngine via generate_with_fallback().
"""
from __future__ import annotations

import logging
import os
import time

import httpx

from .base import BaseEngine

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# EvoLink API configuration
# ---------------------------------------------------------------------------
EVOLINK_API_BASE = "https://api.evolink.ai/v1"
EVOLINK_POLL_INTERVAL = 8         # seconds between status checks
EVOLINK_POLL_TIMEOUT = 600        # max 10 minutes (longer than Kie.ai, complex models)
EVOLINK_HTTP_TIMEOUT = 30         # timeout per HTTP request

# Model names (Seedance 2.0 via EvoLink unified API)
MODEL_T2V = "seedance-2.0-text-to-video"
MODEL_I2V = "seedance-2.0-image-to-video"


class EvoLinkEngine(BaseEngine):
    """Adapter for Seedance 2.0 via EvoLink unified API."""

    key = "evolink"

    def generate(
        self,
        prompt: str,
        job_id: str,
        duration_seconds: int = 5,
        **kwargs,
    ) -> bytes:
        api_key = os.environ.get("EVOLINK_API_KEY")
        if not api_key:
            raise RuntimeError("EvoLinkEngine: EVOLINK_API_KEY not set")
        api_key = api_key.strip()  # guard against trailing whitespace

        # Clamp duration to Seedance 2.0 limits (4–15 seconds)
        duration = max(4, min(15, duration_seconds))
        image_url = kwargs.get("image_url")

        logger.info(
            f"[evolink] job={job_id} submitting (dur={duration}s)"
            f"{f' | I2V: {image_url[:60]}' if image_url else ' | T2V'}"
        )

        # ----- 1. Create generation task -----
        task_id = self._create_task(api_key, prompt, duration, image_url=image_url)
        logger.info(f"[evolink] job={job_id} task_id={task_id}")

        # ----- 2. Poll until complete -----
        video_url = self._poll_until_done(api_key, task_id, job_id)
        logger.info(f"[evolink] job={job_id} video ready: {video_url[:80]}...")

        # ----- 3. Download MP4 bytes -----
        video_bytes = self._download_video(video_url, job_id)
        logger.info(f"[evolink] job={job_id} downloaded {len(video_bytes)} bytes")

        return video_bytes

    # -- internal helpers --------------------------------------------------

    def _create_task(
        self,
        api_key: str,
        prompt: str,
        duration: int,
        image_url: str | None = None,
    ) -> str:
        """Submit a generation task to EvoLink. Returns task id."""
        model = MODEL_I2V if image_url else MODEL_T2V

        body: dict = {
            "model": model,
            "prompt": prompt,
            "duration": duration,
            "quality": "720p",
            "aspect_ratio": "16:9",
            "generate_audio": True,
            "model_params": {"web_search": False},
        }
        if image_url:
            body["first_frame_url"] = image_url

        with httpx.Client(timeout=EVOLINK_HTTP_TIMEOUT) as client:
            resp = client.post(
                f"{EVOLINK_API_BASE}/videos/generations",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=body,
            )
            resp.raise_for_status()

        data = resp.json()
        logger.debug(f"[evolink] create response: {data}")

        # Unified API: {id: "task-unified-...", status: "pending", ...}
        # Older API: {task_id: "...", state: "pending", ...}
        task_id = data.get("id") or data.get("task_id")
        if not task_id:
            raise RuntimeError(
                f"EvoLink createTask returned no task ID. Response: {str(data)[:300]}"
            )
        return str(task_id)

    def _poll_until_done(
        self, api_key: str, task_id: str, job_id: str
    ) -> str:
        """Poll EvoLink until task succeeds or fails. Returns video URL."""
        deadline = time.time() + EVOLINK_POLL_TIMEOUT
        attempt = 0

        with httpx.Client(timeout=EVOLINK_HTTP_TIMEOUT) as client:
            while time.time() < deadline:
                attempt += 1

                resp = client.get(
                    f"{EVOLINK_API_BASE}/tasks/{task_id}",
                    headers={"Authorization": f"Bearer {api_key}"},
                )
                resp.raise_for_status()

                data = resp.json()

                # Support both unified API field names:
                #   status: "pending" | "processing" | "completed" | "failed"
                # and legacy field names:
                #   state: "pending" | "generating" | "success" | "fail"
                state = data.get("status") or data.get("state", "unknown")
                progress = data.get("progress", 0)

                logger.info(
                    f"[evolink] job={job_id} poll #{attempt}: "
                    f"state={state} progress={progress}%"
                )

                if state in ("completed", "success"):
                    return self._extract_video_url(data, task_id)

                if state in ("failed", "fail", "error", "cancelled", "canceled"):
                    err = (
                        (data.get("error") or {}).get("message")
                        or data.get("error_message")
                        or data.get("failMsg")
                        or "unknown error"
                    )
                    raise RuntimeError(f"EvoLink generation failed: {err}")

                time.sleep(EVOLINK_POLL_INTERVAL)

        raise TimeoutError(
            f"EvoLink task {task_id} did not complete within {EVOLINK_POLL_TIMEOUT}s"
        )

    @staticmethod
    def _extract_video_url(data: dict, task_id: str) -> str:
        """Extract video URL from completed task response.

        Tries multiple known field paths for forward compatibility:
        - output.video_url  (unified API, most likely)
        - result.video_url  (older EvoLink format)
        - video_url         (flat format)
        - output.videos[0]  (list format)
        """
        output = data.get("output") or {}
        result = data.get("result") or {}

        candidates = [
            output.get("video_url"),
            result.get("video_url"),
            data.get("video_url"),
            (output.get("videos") or [None])[0],
            (result.get("videos") or [None])[0],
        ]

        for url in candidates:
            if url and isinstance(url, str) and url.startswith("http"):
                return url

        raise RuntimeError(
            f"EvoLink task {task_id} succeeded but no video URL found. "
            f"Response keys: {list(data.keys())}. "
            f"output={output}, result={result}"
        )

    @staticmethod
    def _download_video(url: str, job_id: str) -> bytes:
        """Download the generated video. Note: EvoLink URLs expire after 24h."""
        with httpx.Client(timeout=120) as client:
            resp = client.get(url)
            resp.raise_for_status()

        if len(resp.content) < 1000:
            raise RuntimeError(
                f"EvoLink video download suspiciously small ({len(resp.content)} bytes)"
            )
        return resp.content
