#!/usr/bin/env python3
"""One-time Jogg login for the persistent Custom Avatar worker profile."""

import os
import pathlib
import time

from playwright.sync_api import sync_playwright


PROFILE = pathlib.Path(os.environ.get(
    "JOGG_AVATAR_WORKER_PROFILE",
    pathlib.Path.home() / ".jogg_avatar_worker_profile",
))


def main() -> None:
    PROFILE.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as playwright:
        context = playwright.chromium.launch_persistent_context(
            str(PROFILE), headless=False, channel="chrome", no_viewport=True,
        )
        page = context.pages[0] if context.pages else context.new_page()
        page.goto("https://app.jogg.ai/", wait_until="domcontentloaded", timeout=60_000)
        print("Sign in to Jogg in the opened window. Waiting up to 10 minutes...", flush=True)
        ok = False
        for _ in range(200):
            time.sleep(3)
            if "/login" not in page.url and "/sign-in" not in page.url:
                ok = True
                break
        print("LOGIN OK - session saved." if ok else "LOGIN timeout.", flush=True)
        context.close()


if __name__ == "__main__":
    main()
