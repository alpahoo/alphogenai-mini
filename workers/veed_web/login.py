#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Login one-time du worker VEED Web.

Ouvre le profil Chrome PERSISTANT du worker (le même que veed_web_worker.py) et
attend que TU te connectes manuellement à VEED (mot de passe + captcha éventuel).
La session est ensuite persistée dans le profil et réutilisée par le worker.

Pré-requis : la mesure de sécurité navigateur qui lie l'auth VEED à ta session
Chrome normale doit être LEVÉE pour ce profil (sinon le login échoue — c'est une
contrainte auto-imposée, pas une limite VEED).

  python login.py         # ouvre la fenêtre, attend le login (≤10 min), persiste
"""
import os, time, pathlib
from playwright.sync_api import sync_playwright

PROFILE = pathlib.Path(os.environ.get("VEED_WORKER_PROFILE",
            str(pathlib.Path.home() / ".veed_worker_profile")))

def main():
    PROFILE.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            str(PROFILE), headless=False, channel="chrome",
            accept_downloads=True, no_viewport=True)
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        page.goto("https://www.veed.io/login", wait_until="domcontentloaded")
        print(">>> Connecte-toi à VEED dans la fenêtre. J'attends (max 10 min)...", flush=True)
        ok = False
        for _ in range(200):
            time.sleep(3)
            u = page.url
            if "/login" not in u and any(s in u for s in ["/workspaces", "/home", "/ai-studio", "/dashboard"]):
                ok = True; break
        print("LOGIN OK — session persistée." if ok else "LOGIN timeout.", flush=True)
        page.wait_for_timeout(2000)
        ctx.close()

if __name__ == "__main__":
    main()
