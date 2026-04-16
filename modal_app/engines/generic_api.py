"""
Generic REST API engine adapter.

Configurable video generation engine that works with ANY REST API
following the create-poll pattern (Kie.ai, EvoLink, Runway, Luma, etc.).

Configuration is stored in engines.api_config (JSONB column).
Secrets are loaded from engine_secrets table (encrypted).

Config schema example (Kie.ai Seedance):
{
  "create_task": {
    "url": "https://api.kie.ai/api/v1/jobs/createTask",
    "method": "POST",
    "headers": {
      "Authorization": "Bearer {{secrets.api_key}}",
      "Content-Type": "application/json"
    },
    "body": {
      "model": "bytedance/seedance-2",
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
    "headers": {"Authorization": "Bearer {{secrets.api_key}}"},
    "state_path": "data.state",
    "states": {
      "success": ["success"],
      "failed": ["fail"],
      "waiting": ["waiting", "queuing", "generating"]
    },
    "result_url_path": "data.resultJson::resultUrls.0",
    "error_msg_path": "data.failMsg"
  },
  "polling": {
    "interval_seconds": 8,
    "timeout_seconds": 300
  }
}

Template variables available:
- {{prompt}}           - user prompt
- {{duration}}         - target duration (seconds)
- {{image_url}}        - optional first-frame image URL (I2V)
- {{image_url|optional}} - same but key is omitted from body if empty
- {{task_id}}          - task ID returned by create_task (poll phase only)
- {{secrets.X}}        - encrypted secret by name
"""
from __future__ import annotations

import json
import logging
import re
import time
from typing import Any

import httpx

from .base import BaseEngine

logger = logging.getLogger(__name__)

TEMPLATE_RE = re.compile(r"\{\{\s*([^}]+?)\s*\}\}")


class GenericApiEngine(BaseEngine):
    """Configurable API engine — reads config from DB instead of code."""

    def __init__(self, engine_id: str, config: dict, secrets: dict[str, str]):
        self.key = engine_id
        self._config = config
        self._secrets = secrets

    def generate(
        self,
        prompt: str,
        job_id: str,
        duration_seconds: int = 5,
        **kwargs,
    ) -> bytes:
        image_url = kwargs.get("image_url")

        logger.info(
            f"[generic:{self.key}] job={job_id} start "
            f"(dur={duration_seconds}s{' | I2V' if image_url else ''})"
        )

        # Template context
        ctx: dict[str, Any] = {
            "prompt": prompt,
            "duration": duration_seconds,
            "image_url": image_url or "",
            "secrets": self._secrets,
        }

        # 1. Create task
        task_id = self._create_task(ctx, job_id)
        logger.info(f"[generic:{self.key}] job={job_id} taskId={task_id}")
        ctx["task_id"] = task_id

        # 2. Poll until done
        video_url = self._poll_task(ctx, job_id)
        logger.info(f"[generic:{self.key}] job={job_id} ready: {video_url[:80]}...")

        # 3. Download bytes
        video_bytes = self._download(video_url, job_id)
        logger.info(f"[generic:{self.key}] job={job_id} downloaded {len(video_bytes)} bytes")
        return video_bytes

    # ----- Internal helpers -----------------------------------------------

    def _create_task(self, ctx: dict, job_id: str) -> str:
        cfg = self._config.get("create_task") or {}
        url = self._render(cfg.get("url", ""), ctx)
        method = cfg.get("method", "POST").upper()
        headers = self._render_dict(cfg.get("headers", {}), ctx)
        body = self._render_body(cfg.get("body", {}), ctx)

        with httpx.Client(timeout=30) as client:
            resp = client.request(method, url, headers=headers, json=body)
            resp.raise_for_status()

        data = resp.json()

        # Verify success code if configured
        success_code = cfg.get("success_code")
        success_code_path = cfg.get("success_code_path")
        if success_code is not None and success_code_path:
            actual = self._json_path(data, success_code_path)
            if actual != success_code:
                msg = data.get("msg") or data.get("message") or str(data)[:200]
                raise RuntimeError(
                    f"createTask failed: code={actual} expected={success_code} msg={msg}"
                )

        task_id_path = cfg.get("task_id_path") or "data.taskId"
        task_id = self._json_path(data, task_id_path)
        if not task_id:
            raise RuntimeError(
                f"createTask succeeded but no task_id at path '{task_id_path}'"
            )
        return str(task_id)

    def _poll_task(self, ctx: dict, job_id: str) -> str:
        cfg = self._config.get("poll_task") or {}
        polling = self._config.get("polling", {})
        interval = int(polling.get("interval_seconds", 8))
        timeout = int(polling.get("timeout_seconds", 300))

        url_template = cfg.get("url", "")
        method = cfg.get("method", "GET").upper()
        headers = self._render_dict(cfg.get("headers", {}), ctx)
        states = cfg.get("states", {})
        success_states = self._as_list(states.get("success", ["success"]))
        failed_states = self._as_list(states.get("failed", ["fail", "failed"]))
        state_path = cfg.get("state_path", "data.state")
        result_url_path = cfg.get("result_url_path", "data.resultJson::resultUrls.0")
        error_msg_path = cfg.get("error_msg_path", "data.failMsg")

        deadline = time.time() + timeout
        attempt = 0

        with httpx.Client(timeout=30) as client:
            while time.time() < deadline:
                attempt += 1
                url = self._render(url_template, ctx)
                resp = client.request(method, url, headers=headers)
                resp.raise_for_status()
                data = resp.json()

                state = self._json_path(data, state_path)
                logger.info(
                    f"[generic:{self.key}] job={job_id} poll #{attempt}: state={state}"
                )

                if state in success_states:
                    url = self._json_path(data, result_url_path)
                    if not url:
                        raise RuntimeError(
                            f"Task succeeded but no URL at path '{result_url_path}'"
                        )
                    return str(url)

                if state in failed_states:
                    err = self._json_path(data, error_msg_path) or "unknown error"
                    raise RuntimeError(f"API reported failure: {err}")

                time.sleep(interval)

        raise TimeoutError(
            f"Task did not complete within {timeout}s (last state: {state})"
        )

    @staticmethod
    def _download(url: str, job_id: str) -> bytes:
        with httpx.Client(timeout=60) as client:
            resp = client.get(url)
            resp.raise_for_status()
        if len(resp.content) < 1000:
            raise RuntimeError(f"Download too small: {len(resp.content)} bytes")
        return resp.content

    # ----- Template rendering ---------------------------------------------

    def _render(self, template: str, ctx: dict) -> str:
        """Replace {{path}} placeholders with values from ctx."""
        if not isinstance(template, str):
            return template

        def replace(m: re.Match) -> str:
            expr = m.group(1).strip()
            optional = False
            if "|optional" in expr:
                expr = expr.replace("|optional", "").strip()
                optional = True
            value = self._ctx_path(ctx, expr)
            if value is None or value == "":
                return "" if optional else ""
            return str(value)

        return TEMPLATE_RE.sub(replace, template)

    def _render_dict(self, d: dict, ctx: dict) -> dict:
        return {k: self._render(v, ctx) if isinstance(v, str) else v for k, v in d.items()}

    def _render_body(self, body: Any, ctx: dict) -> Any:
        """Recursively render templates. Drop keys with |optional if empty."""
        if isinstance(body, str):
            # Check for |optional — if value empty, signal drop (return sentinel)
            if "|optional" in body:
                rendered = self._render(body, ctx)
                if rendered == "":
                    return _DROP
                return rendered
            return self._render(body, ctx)
        if isinstance(body, dict):
            out: dict = {}
            for k, v in body.items():
                rendered = self._render_body(v, ctx)
                if rendered is _DROP:
                    continue
                out[k] = rendered
            return out
        if isinstance(body, list):
            return [self._render_body(v, ctx) for v in body]
        return body

    @staticmethod
    def _ctx_path(ctx: dict, path: str) -> Any:
        """Walk dotted path in ctx dict."""
        cur: Any = ctx
        for part in path.split("."):
            if isinstance(cur, dict):
                cur = cur.get(part)
            else:
                return None
            if cur is None:
                return None
        return cur

    @staticmethod
    def _json_path(data: Any, path: str) -> Any:
        """Walk dotted path in response data.

        Supports '::' to parse a string as JSON before diving deeper:
          data.resultJson::resultUrls.0
          → parse data.resultJson as JSON, then look up resultUrls[0]
        """
        # Split at '::' for JSON-string parsing
        if "::" in path:
            left, right = path.split("::", 1)
            value = GenericApiEngine._json_path(data, left)
            if isinstance(value, str):
                try:
                    value = json.loads(value)
                except json.JSONDecodeError:
                    return None
            return GenericApiEngine._json_path(value, right)

        cur: Any = data
        for part in path.split("."):
            if part.isdigit() and isinstance(cur, list):
                idx = int(part)
                cur = cur[idx] if 0 <= idx < len(cur) else None
            elif isinstance(cur, dict):
                cur = cur.get(part)
            else:
                return None
            if cur is None:
                return None
        return cur

    @staticmethod
    def _as_list(v: Any) -> list:
        if v is None:
            return []
        if isinstance(v, list):
            return v
        return [v]


# Sentinel for _render_body to signal "drop this key"
class _DropSentinel:
    pass


_DROP = _DropSentinel()
