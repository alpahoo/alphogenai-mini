#!/usr/bin/env python3
"""Private, one-at-a-time Custom Video Avatar worker for AlphoGenAI.

This automates only the normal Jogg web flow with a persistent, user-owned
browser session. It does not call private endpoints, bypass captchas, rotate
accounts, or hide automation. Provider UI changes stop the request in
``needs_review`` with diagnostics instead of retrying blindly.
"""

from __future__ import annotations

import hashlib
import io
import json
import os
import pathlib
import re
import subprocess
import sys
import tempfile
import time
import uuid
from datetime import datetime, timezone

import requests
from PIL import Image
from playwright.sync_api import Page, TimeoutError as PlaywrightTimeout, sync_playwright


ROOT = pathlib.Path(__file__).resolve().parents[2]
PROFILE = pathlib.Path(os.environ.get("JOGG_AVATAR_WORKER_PROFILE", pathlib.Path.home() / ".jogg_avatar_worker_profile"))
SHOTS = pathlib.Path(__file__).resolve().parent / "shots"
BUCKET = "user-video-presenters"
PORTRAIT_BUCKET = "user-presenters"
TABLE = "user_video_presenter_requests"


def load_env() -> None:
    for path in (ROOT / ".env.local", ROOT / ".env"):
        if not path.exists():
            continue
        for raw in path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_env()
SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
JOGG_KEY = os.environ.get("JOGG_API_KEY", "")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def log(message: str) -> None:
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {message}", flush=True)


def require_env() -> None:
    missing = [name for name, value in (
        ("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL),
        ("SUPABASE_SERVICE_ROLE_KEY", SERVICE_KEY),
        ("JOGG_API_KEY", JOGG_KEY),
    ) if not value]
    if missing:
        raise RuntimeError("Missing environment: " + ", ".join(missing))


def rest_headers(prefer: str | None = None) -> dict[str, str]:
    headers = {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    return headers


def sb_get(params: dict[str, str]) -> list[dict]:
    response = requests.get(
        f"{SUPABASE_URL}/rest/v1/{TABLE}",
        headers=rest_headers(),
        params=params,
        timeout=20,
    )
    response.raise_for_status()
    return response.json()


def sb_patch(request_id: str, values: dict, expected_status: str | None = None) -> dict | None:
    params = {"id": f"eq.{request_id}", "select": "*"}
    if expected_status:
        params["status"] = f"eq.{expected_status}"
    response = requests.patch(
        f"{SUPABASE_URL}/rest/v1/{TABLE}",
        headers=rest_headers("return=representation"),
        params=params,
        data=json.dumps(values),
        timeout=20,
    )
    response.raise_for_status()
    rows = response.json()
    return rows[0] if rows else None


def storage_download(bucket: str, path: str) -> bytes:
    response = requests.get(
        f"{SUPABASE_URL}/storage/v1/object/{bucket}/{path}",
        headers=rest_headers(),
        timeout=120,
    )
    response.raise_for_status()
    return response.content


def storage_upload(bucket: str, path: str, body: bytes, content_type: str) -> None:
    headers = rest_headers()
    headers.update({"Content-Type": content_type, "x-upsert": "false"})
    response = requests.post(
        f"{SUPABASE_URL}/storage/v1/object/{bucket}/{path}",
        headers=headers,
        data=body,
        timeout=120,
    )
    response.raise_for_status()


def storage_delete(bucket: str, paths: list[str]) -> None:
    response = requests.delete(
        f"{SUPABASE_URL}/storage/v1/object/{bucket}",
        headers=rest_headers(),
        data=json.dumps({"prefixes": paths}),
        timeout=30,
    )
    response.raise_for_status()


def parse_avatar_rows(payload: object) -> list[dict]:
    data = payload.get("data", payload) if isinstance(payload, dict) else payload
    if isinstance(data, list):
        return [item for item in data if isinstance(item, dict)]
    if isinstance(data, dict):
        for key in ("avatars", "list", "items", "records"):
            value = data.get(key)
            if isinstance(value, list):
                return [item for item in value if isinstance(item, dict)]
    return []


def list_custom_avatars() -> list[dict]:
    response = requests.get(
        "https://api.jogg.ai/v2/avatars/custom",
        headers={"x-api-key": JOGG_KEY},
        params={"page": "1", "page_size": "100"},
        timeout=30,
    )
    response.raise_for_status()
    payload = response.json()
    if isinstance(payload, dict) and payload.get("code") not in (None, 0):
        raise RuntimeError(f"Avatar catalog rejected: {payload.get('msg', payload.get('code'))}")
    return parse_avatar_rows(payload)


def avatar_status(avatar: dict) -> str:
    value = str(avatar.get("avatar_status", avatar.get("status", ""))).lower()
    if value in ("1", "success", "completed", "ready", "done"):
        return "ready"
    if value in ("-1", "failed", "error", "rejected"):
        return "failed"
    return "processing"


def find_provider_avatar(provider_name: str) -> dict | None:
    expected = provider_name.casefold()
    for avatar in list_custom_avatars():
        if str(avatar.get("name", "")).strip().casefold() == expected:
            return avatar
    return None


def claim_one() -> dict | None:
    rows = sb_get({
        "select": "*",
        "status": "eq.pending",
        "order": "created_at.asc",
        "limit": "1",
    })
    if not rows:
        return None
    row = rows[0]
    return sb_patch(
        row["id"],
        {
            "status": "claimed",
            "claimed_at": now_iso(),
            "attempts": int(row.get("attempts") or 0) + 1,
            "error_code": None,
        },
        expected_status="pending",
    )


def pending_provider_jobs() -> list[dict]:
    return sb_get({
        "select": "*",
        "status": "in.(submitted,processing)",
        "order": "created_at.asc",
        "limit": "10",
    })


def normalize_cover(raw: bytes) -> bytes:
    with Image.open(io.BytesIO(raw)) as image:
        image = image.convert("RGB")
        width, height = image.size
        side = min(width, height)
        left = (width - side) // 2
        top = (height - side) // 2
        image = image.crop((left, top, left + side, top + side)).resize((1024, 1024), Image.Resampling.LANCZOS)
        output = io.BytesIO()
        image.save(output, format="JPEG", quality=92, optimize=True)
        return output.getvalue()


def extract_cover_from_video(video_path: pathlib.Path) -> bytes:
    try:
        import imageio_ffmpeg
        ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    except Exception as error:
        raise RuntimeError("No ffmpeg available for presenter cover extraction") from error
    output = video_path.with_suffix(".cover.jpg")
    subprocess.run(
        [ffmpeg, "-y", "-ss", "1", "-i", str(video_path), "-frames:v", "1", "-q:v", "2", str(output)],
        check=True,
        capture_output=True,
        timeout=60,
    )
    return normalize_cover(output.read_bytes())


def publish_presenter(row: dict, avatar: dict, source_path: pathlib.Path | None = None) -> None:
    avatar_id = str(avatar.get("id", avatar.get("avatar_id", ""))).strip()
    if not avatar_id:
        raise RuntimeError("Completed custom avatar has no id")
    cover_url = str(avatar.get("cover_url", avatar.get("image_url", ""))).strip()
    if cover_url:
        response = requests.get(cover_url, timeout=60)
        response.raise_for_status()
        cover = normalize_cover(response.content)
    elif source_path:
        cover = extract_cover_from_video(source_path)
    else:
        source_bytes = storage_download(BUCKET, row["source_video_path"])
        with tempfile.TemporaryDirectory(prefix="ag-avatar-cover-") as tmp:
            video = pathlib.Path(tmp) / pathlib.Path(row["source_video_path"]).name
            video.write_bytes(source_bytes)
            cover = extract_cover_from_video(video)

    digest = hashlib.sha256(cover).hexdigest()
    portrait_path = f"{row['user_id']}/{uuid.uuid4()}.jpg"
    storage_upload(PORTRAIT_BUCKET, portrait_path, cover, "image/jpeg")
    presenter_values = {
        "user_id": row["user_id"],
        "name": row["name"],
        "portrait_path": portrait_path,
        "image_sha256": digest,
        "external_avatar_id": avatar_id,
        "external_task_id": f"video-request:{row['id']}",
        "status": "ready",
        "consent_confirmed_at": row["consent_confirmed_at"],
        "consent_statement_version": row["consent_statement_version"],
    }
    response = requests.post(
        f"{SUPABASE_URL}/rest/v1/user_presenters",
        headers=rest_headers("return=representation"),
        data=json.dumps(presenter_values),
        timeout=20,
    )
    response.raise_for_status()
    presenter = response.json()[0]
    saved = sb_patch(row["id"], {
        "status": "ready",
        "external_avatar_id": avatar_id,
        "presenter_id": presenter["id"],
        "ready_at": now_iso(),
        "error_code": None,
    })
    if not saved:
        raise RuntimeError("Could not persist completed video presenter request")
    try:
        storage_delete(BUCKET, [row["source_video_path"], row["consent_video_path"]])
    except Exception as error:
        # The completed presenter is already durable. Retention cleanup can be
        # retried operationally without changing the public ready state.
        log(f"warning: private footage cleanup failed for {row['id']}: {error}")
    log(f"request {row['id']} ready as avatar {avatar_id}")


def poll_provider_jobs() -> int:
    completed = 0
    for row in pending_provider_jobs():
        avatar = find_provider_avatar(row["provider_name"])
        if not avatar:
            if row["status"] == "submitted":
                sb_patch(row["id"], {"status": "processing"})
            continue
        state = avatar_status(avatar)
        if state == "failed":
            sb_patch(row["id"], {"status": "failed", "error_code": "provider_rejected"})
        elif state == "ready":
            publish_presenter(row, avatar)
            completed += 1
    return completed


def capture(page: Page, request_id: str, label: str) -> None:
    SHOTS.mkdir(parents=True, exist_ok=True)
    stamp = int(time.time())
    page.screenshot(path=str(SHOTS / f"{request_id}_{label}_{stamp}.png"), full_page=True)
    (SHOTS / f"{request_id}_{label}_{stamp}.html").write_text(page.content(), encoding="utf-8")


def ensure_logged_in(page: Page) -> None:
    page.goto("https://app.jogg.ai/", wait_until="domcontentloaded", timeout=60_000)
    page.wait_for_timeout(2500)
    if re.search(r"/login|/sign-in", page.url, re.I):
        raise RuntimeError("NEEDS_LOGIN")


def click_text(page: Page, patterns: list[str], timeout: int = 15_000) -> None:
    for pattern in patterns:
        regex = re.compile(pattern, re.I)
        for locator in (page.get_by_role("button", name=regex), page.get_by_role("link", name=regex), page.get_by_text(regex, exact=False)):
            try:
                if locator.first.is_visible(timeout=1200):
                    locator.first.click(timeout=timeout)
                    return
            except Exception:
                continue
    raise PlaywrightTimeout("Could not find: " + " | ".join(patterns))


def submit_through_web(page: Page, row: dict, source: pathlib.Path, consent: pathlib.Path) -> None:
    ensure_logged_in(page)
    existing = find_provider_avatar(row["provider_name"])
    if existing:
        sb_patch(row["id"], {"status": "submitted", "submitted_at": now_iso()})
        return

    click_text(page, [r"custom avatar", r"avatar"])
    page.wait_for_timeout(1500)
    try:
        click_text(page, [r"create.*avatar", r"create your own", r"new avatar"])
    except PlaywrightTimeout:
        pass
    page.wait_for_timeout(1500)

    name_input = page.locator('input[placeholder*="name" i], input[name*="name" i]').first
    if not name_input.count() or not name_input.is_visible():
        raise PlaywrightTimeout("Custom avatar name input was not found")
    name_input.fill(row["provider_name"])

    file_inputs = page.locator('input[type="file"]')
    if file_inputs.count() < 1:
        raise PlaywrightTimeout("Custom avatar source upload input was not found")
    file_inputs.first.set_input_files(str(source))
    page.wait_for_timeout(1500)
    click_text(page, [r"continue", r"next", r"submit footage", r"upload"], timeout=30_000)
    page.wait_for_timeout(1500)

    file_inputs = page.locator('input[type="file"]')
    target = file_inputs.last
    if file_inputs.count() < 1 or not target.is_visible():
        raise PlaywrightTimeout("Consent video upload input was not found")
    target.set_input_files(str(consent))
    page.wait_for_timeout(1000)
    for checkbox in page.locator('input[type="checkbox"]').all():
        try:
            if checkbox.is_visible() and not checkbox.is_checked():
                checkbox.check()
        except Exception:
            pass
    click_text(page, [r"submit", r"create avatar", r"start creating", r"save.*create"], timeout=30_000)
    page.wait_for_timeout(3000)
    capture(page, row["id"], "submitted")
    saved = sb_patch(row["id"], {"status": "submitted", "submitted_at": now_iso(), "error_code": None})
    if not saved:
        raise RuntimeError("SUBMITTED_BUT_NOT_PERSISTED")


def process_one(page: Page) -> str:
    row = claim_one()
    if not row:
        return "IDLE"
    request_id = row["id"]
    log(f"claimed request {request_id}")
    try:
        with tempfile.TemporaryDirectory(prefix=f"ag-avatar-{request_id[:8]}-") as tmp:
            folder = pathlib.Path(tmp)
            source = folder / pathlib.Path(row["source_video_path"]).name
            consent = folder / pathlib.Path(row["consent_video_path"]).name
            source.write_bytes(storage_download(BUCKET, row["source_video_path"]))
            consent.write_bytes(storage_download(BUCKET, row["consent_video_path"]))
            submit_through_web(page, row, source, consent)
        return "SUBMITTED"
    except RuntimeError as error:
        if str(error) == "NEEDS_LOGIN":
            sb_patch(request_id, {"status": "needs_login", "error_code": "needs_login"})
            return "NEEDS_LOGIN"
        capture(page, request_id, "runtime_error")
        sb_patch(request_id, {"status": "needs_review", "error_code": "provider_ui_changed"})
        log(f"request {request_id} needs review: {error}")
        return "NEEDS_REVIEW"
    except Exception as error:
        capture(page, request_id, "ui_changed")
        sb_patch(request_id, {"status": "needs_review", "error_code": "provider_ui_changed"})
        log(f"request {request_id} needs review: {error}")
        return "NEEDS_REVIEW"


def run_browser(callback):
    PROFILE.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as playwright:
        context = playwright.chromium.launch_persistent_context(
            str(PROFILE),
            headless=os.environ.get("JOGG_AVATAR_HEADLESS", "0") == "1",
            channel="chrome",
            no_viewport=True,
            accept_downloads=False,
        )
        page = context.pages[0] if context.pages else context.new_page()
        try:
            return callback(page)
        finally:
            context.close()


def inspect_ui(page: Page) -> str:
    ensure_logged_in(page)
    capture(page, "inspect", "home")
    print("Current URL:", page.url)
    print("Visible text sample:", page.locator("body").inner_text()[:4000])
    return "INSPECTED"


def main() -> None:
    require_env()
    mode = sys.argv[1] if len(sys.argv) > 1 else "once"
    if mode == "login":
        from login import main as login_main
        login_main()
        return
    if mode == "inspect":
        print("RESULT:", run_browser(inspect_ui))
        return
    if mode == "poll":
        print(json.dumps({"completed": poll_provider_jobs()}))
        return
    if mode == "once":
        completed = poll_provider_jobs()
        result = run_browser(process_one)
        print(json.dumps({"completed": completed, "result": result}))
        return
    if mode == "loop":
        while True:
            completed = poll_provider_jobs()
            result = run_browser(process_one)
            log(f"poll completed={completed}; worker={result}")
            if result == "NEEDS_LOGIN":
                break
            time.sleep(60 if result == "IDLE" else 15)
        return
    raise SystemExit("usage: jogg_avatar_worker.py [login|inspect|poll|once|loop]")


if __name__ == "__main__":
    main()
