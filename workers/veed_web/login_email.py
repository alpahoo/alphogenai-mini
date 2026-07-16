#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Login one-time via EMAIL CODE (Courriel Professionnel).
Le script fait UNIQUEMENT l'étape non-sensible : ouvrir le login, choisir l'email,
saisir l'ADRESSE email (pas un secret), demander l'envoi du code.
Puis il ATTEND que l'utilisateur tape le CODE lui-même dans la fenêtre visible.
(Claude ne saisit jamais le code d'authentification.)
Usage: python login_email.py <email>
"""
import os, sys, time, pathlib
from playwright.sync_api import sync_playwright

PROFILE = pathlib.Path(os.environ.get("VEED_WORKER_PROFILE", str(pathlib.Path.home()/".veed_worker_profile")))
SHOTS = pathlib.Path(__file__).resolve().parent/"shots"; SHOTS.mkdir(exist_ok=True)
EMAIL = sys.argv[1] if len(sys.argv) > 1 else ""

def shot(page, n):
    try: page.screenshot(path=str(SHOTS/f"{n}.png"))
    except Exception: pass

def main():
    PROFILE.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            str(PROFILE), headless=False, channel="chrome", accept_downloads=True, no_viewport=True)
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        page.goto("https://www.veed.io/login", wait_until="domcontentloaded")
        page.wait_for_timeout(9000)
        # refuser le consentement non-essentiel
        for lbl in ["Reject all", "Tout refuser"]:
            try: page.get_by_role("button", name=lbl).first.click(timeout=2000); break
            except Exception: pass
        # choisir l'option email
        for lbl in ["Courriel Professionnel", "Continue with email", "Work Email", "Email"]:
            try: page.get_by_text(lbl, exact=False).first.click(timeout=4000); print("clicked:", lbl); break
            except Exception: continue
        page.wait_for_timeout(2500)
        # saisir l'adresse email (non secret)
        filled = False
        for strat in [
            lambda: page.get_by_placeholder(__import__("re").compile("email", 2)).first.fill(EMAIL),
            lambda: page.locator("input[type=email]").first.fill(EMAIL),
            lambda: page.locator("input").first.fill(EMAIL),
        ]:
            try: strat(); filled = True; break
            except Exception: continue
        print("email filled:", filled)
        page.wait_for_timeout(500)
        # continuer / envoyer le code
        for lbl in ["Continue", "Send code", "Continuer", "Next", "Log in", "Sign in"]:
            try: page.get_by_role("button", name=lbl).first.click(timeout=2500); print("submit:", lbl); break
            except Exception: continue
        page.wait_for_timeout(4000)
        shot(page, "email_code_screen")
        print(">>> CODE ENVOYÉ. Tape le code reçu par email DIRECTEMENT dans la fenêtre. J'attends la connexion (max 12 min)...", flush=True)
        ok = False
        for _ in range(240):
            time.sleep(3)
            u = page.url
            if "/login" not in u and any(s in u for s in ["/workspaces","/home","/ai-studio","/dashboard"]):
                ok = True; break
        print("LOGIN OK — session persistée." if ok else "LOGIN timeout.", flush=True)
        page.wait_for_timeout(1500); ctx.close()

if __name__ == "__main__":
    main()
