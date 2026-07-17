#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
VEED WEB MVP — worker minimal (bêta fermée AlphoGenAI).

Capability testée = **VEED AI Studio → Generate Talking Head Videos (AI Avatars)**.
  (Workspace switcher: "Gen-AI Studio", carte "Generate Talking Head Videos",
   URL /ai-studio, avatars stock nommés (Marcus/Mira), bandeau "Lip sync will be
   applied in final video". CE N'EST PAS l'API Fabric 1.0 — c'est le parcours
   AI Studio talking-head avec avatars pré-construits + voix TTS + lip-sync.)

Ce worker REJOUE le parcours navigateur DÉJÀ VALIDÉ (test fiabilité 3/3) :
  ouvrir le studio -> saisir le script -> Generate -> attendre /view ->
  Download (UI) via expect_download -> upload R2 -> écrire les métriques.

Déterministe (Playwright pur). Si un élément attendu est introuvable, le worker
capture un diagnostic puis s'arrête. Aucune API interne VEED, aucun cookie hors
navigateur, aucun fal.ai, concurrence 1, plafond 3 vidéos/jour.

Modes :
  python veed_web_worker.py once       # traite 1 job pending (respecte le plafond)
  python veed_web_worker.py loop       # boucle (concurrence 1) jusqu'au plafond/jour
  python veed_web_worker.py selftest "<script>" portrait  # job local sans Supabase
"""
import os, re, sys, json, time, subprocess, datetime, pathlib
import requests

ROOT = pathlib.Path(__file__).resolve().parents[2]           # alphogenai-mini/
ENV_PATH = ROOT / ".env.local"
SHOTS = pathlib.Path(__file__).resolve().parent / "shots"; SHOTS.mkdir(exist_ok=True)
DL = pathlib.Path(__file__).resolve().parent / "downloads"; DL.mkdir(exist_ok=True)
# Profil Chrome persistant authentifié — HORS repo (contient la session VEED).
PROFILE = pathlib.Path(os.environ.get("VEED_WORKER_PROFILE",
            str(pathlib.Path.home() / ".veed_worker_profile")))

CAPABILITY = "veed_ai_studio_talking_head"    # PAS "fabric"
ENGINE_TAG = "veed_web"                         # app_state.engine filtre nos jobs
DAILY_CAP = int(os.environ.get("VEED_DAILY_CAP", "3"))
STUDIO = "https://www.veed.io/ai-studio?source=Dashboard"

def log(*a): print("[veed-worker]", *a, flush=True)

def load_env():
    env = {}
    if not ENV_PATH.exists():
        return env
    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line: continue
        k, v = line.split("=", 1); env[k.strip()] = v.strip().strip('"').strip("'")
    return env
ENV = load_env()

# ----------------------------- Supabase REST (PostgREST) -----------------------------
SB_URL = ENV.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
SB_KEY = ENV.get("SUPABASE_SERVICE_ROLE_KEY", "")
SB_HEADERS = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}", "Content-Type": "application/json"}

def sb_get(query):
    r = requests.get(f"{SB_URL}/rest/v1/jobs?{query}", headers=SB_HEADERS, timeout=30)
    r.raise_for_status(); return r.json()

def sb_patch(job_id, patch, expected_status=None):
    now = datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z")
    patch = {**patch, "updated_at": now}
    query = f"id=eq.{job_id}"
    if expected_status:
        query += f"&status=eq.{expected_status}"
    r = requests.patch(f"{SB_URL}/rest/v1/jobs?{query}",
                       headers={**SB_HEADERS, "Prefer": "return=representation"},
                       data=json.dumps(patch), timeout=30)
    r.raise_for_status(); return r.json()

def daily_done_count():
    today = datetime.date.today().isoformat()
    rows = sb_get(f"select=id,updated_at&status=eq.done&app_state->>engine=eq.{ENGINE_TAG}"
                  f"&updated_at=gte.{today}T00:00:00Z")
    return len(rows)

def claim_next_job():
    """Renvoie le job pending veed_web le plus ancien, y compris après un NEEDS_LOGIN."""
    rows = sb_get(f"select=*&status=eq.pending&app_state->>engine=eq.{ENGINE_TAG}"
                  f"&order=created_at.asc&limit=1")
    return rows[0] if rows else None

def find_output_ready_job():
    """Return an uploaded output that only needs its final DB promotion retried."""
    rows = sb_get(
        f"select=*&status=eq.in_progress&current_stage=eq.veed_output_ready"
        f"&app_state->>engine=eq.{ENGINE_TAG}&order=updated_at.asc&limit=1"
    )
    return rows[0] if rows else None

def find_local_output_ready():
    """Return the oldest valid local recovery manifest, if any."""
    for path in sorted(SHOTS.glob("*_OUTPUT_READY.json"), key=lambda item: item.stat().st_mtime):
        try:
            record = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            log(f"ignoring invalid recovery manifest {path.name}: {exc}")
            continue
        if record.get("job_id") and record.get("r2_url"):
            return path, record
    return None

# ----------------------------- media helpers -----------------------------
def ffprobe(path):
    import imageio_ffmpeg
    ff = imageio_ffmpeg.get_ffmpeg_exe()
    err = subprocess.run([ff, "-i", str(path), "-hide_banner"], capture_output=True, text=True).stderr
    out = {"size_bytes": os.path.getsize(path)}
    m = re.search(r"Duration: (\d+):(\d+):([\d.]+)", err)
    if m: out["duration_s"] = round(int(m.group(1))*3600+int(m.group(2))*60+float(m.group(3)), 2)
    m = re.search(r"Video: ([^,]+).*?, (\d+)x(\d+)", err, re.S)
    if m: out["video_codec"]=m.group(1).strip(); out["width"]=int(m.group(2)); out["height"]=int(m.group(3))
    m = re.search(r"(\d+(?:\.\d+)?) fps", err)
    if m: out["fps"] = float(m.group(1))
    m = re.search(r"Audio: ([^,]+), (\d+) Hz, (\w+)", err)
    out["audio"] = f"{m.group(1).strip()} {m.group(2)}Hz {m.group(3)}" if m else None
    required = (out.get("size_bytes", 0) > 0, out.get("duration_s", 0) > 0,
                out.get("width", 0) > 0, out.get("height", 0) > 0,
                bool(out.get("video_codec")), bool(out.get("audio")))
    if not all(required):
        raise RuntimeError(f"MP4 invalide ou incomplet: {out}")
    return out

def r2_upload(path, key):
    import boto3
    from botocore.config import Config
    s3 = boto3.client("s3", endpoint_url=ENV["R2_ENDPOINT"],
        aws_access_key_id=ENV["R2_ACCESS_KEY_ID"], aws_secret_access_key=ENV["R2_SECRET_ACCESS_KEY"],
        config=Config(signature_version="s3v4"), region_name="auto")
    s3.upload_file(str(path), ENV["R2_BUCKET_NAME"], key, ExtraArgs={"ContentType": "video/mp4"})
    remote = s3.head_object(Bucket=ENV["R2_BUCKET_NAME"], Key=key)
    if int(remote.get("ContentLength", 0)) != os.path.getsize(path):
        raise RuntimeError("upload R2 incomplet: taille distante différente")
    base = ENV.get("R2_PUBLIC_URL", "").rstrip("/")
    return f"{base}/{key}" if base else f"r2://{ENV['R2_BUCKET_NAME']}/{key}"

# ----------------------------- browser helpers -----------------------------
class NeedsLogin(Exception): pass
class ElementMissing(Exception): pass
class FinalPersistenceError(Exception): pass

def shot(page, name):
    try: page.screenshot(path=str(SHOTS / f"{name}.png"))
    except Exception: pass

def capture_diagnostic(page, name, error=None):
    """Conserve URL et contrôles pertinents sans exporter cookies ni stockage navigateur."""
    data = {"url": page.url, "title": page.title(), "error": error}
    try:
        data["controls"] = page.locator("button, a, input, textarea, [role=button], [contenteditable=true]").evaluate_all(
            """els => els.slice(0, 200).map(e => ({
                tag: e.tagName,
                text: (e.innerText || e.value || '').trim().slice(0, 160),
                role: e.getAttribute('role'),
                ariaLabel: e.getAttribute('aria-label'),
                placeholder: e.getAttribute('placeholder'),
                disabled: !!e.disabled,
                ariaDisabled: e.getAttribute('aria-disabled'),
                visible: !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length)
            })).filter(x => x.text || x.ariaLabel || x.placeholder)"""
        )
    except Exception as exc:
        data["dom_error"] = str(exc)
    (SHOTS / f"{name}.json").write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    shot(page, name)
    return data

def read_first_text(page, pattern, timeout=4000):
    try:
        el = page.get_by_text(re.compile(pattern, re.I)).first
        el.wait_for(timeout=timeout); return el.inner_text().strip()
    except Exception: return None

def fail_missing_element(page, goal, tag):
    """Capture le diagnostic puis arrête le job si l'UI attendue a changé."""
    capture_diagnostic(page, f"{tag}_MISSING", f"élément introuvable pour: {goal}")
    raise ElementMissing(f"élément introuvable pour: {goal}")

def open_download_panel(page):
    """Ouvre le panneau Download (le contrôle est un toggle: on vise ?panel=download)."""
    for _ in range(4):
        if "panel=download" in page.url:
            return
        clicked = False
        for strat in [
            lambda: page.get_by_role("button", name=re.compile("download|télécharger", re.I)).first.click(timeout=3000),
            lambda: page.locator('[aria-label*="Download" i], [aria-label*="Télécharger" i]').first.click(timeout=2500),
        ]:
            try: strat(); clicked = True; break
            except Exception: continue
        if not clicked:
            page.goto(page.url.split("?")[0] + "?panel=download&source=Dashboard",
                      wait_until="domcontentloaded")
        page.wait_for_timeout(1200)
    if "panel=download" not in page.url:
        fail_missing_element(page, "panneau Download resté fermé", "dlpanel2")

def ensure_logged_in(page):
    page.goto("https://www.veed.io/workspaces", wait_until="domcontentloaded")
    page.wait_for_timeout(5000)
    # bannière consentement -> refuser le non-essentiel
    for label in ["Reject all", "Tout refuser"]:
        try: page.get_by_role("button", name=re.compile(rf"^{label}$", re.I)).first.click(timeout=2000); break
        except Exception: pass
    if "/login" in page.url:
        shot(page, "NEEDS_LOGIN")
        raise NeedsLogin("session VEED expirée — login manuel requis (voir login.py)")

# ----------------------------- coeur : traiter un job -----------------------------
def process_job(page, job_id, script, fmt):
    m = {"capability": CAPABILITY, "requested_format": fmt}
    t0 = time.time()
    # 1) studio + saisie
    page.goto(STUDIO, wait_until="domcontentloaded"); page.wait_for_timeout(4500)
    try: page.get_by_text("Start with a script", exact=True).first.click(timeout=8000)
    except Exception: fail_missing_element(page, "onglet 'Start with a script'", "startscript")
    page.wait_for_timeout(500)
    filled = False
    for strat in [
        lambda: page.get_by_placeholder(re.compile("paste your script", re.I)).first.fill(script),
        lambda: page.get_by_placeholder(re.compile("your idea", re.I)).first.fill(script),
        lambda: page.locator("textarea").first.fill(script),
        lambda: page.locator("[contenteditable=true]").first.fill(script),
    ]:
        try: strat(); filled = True; break
        except Exception: continue
    if not filled: fail_missing_element(page, "champ script", "scriptfield")
    page.wait_for_timeout(1000)
    # 2) generate -> storyboard
    clicked = False
    for strat in [
        lambda: page.get_by_role("button", name=re.compile(r"^submit$", re.I)).first.click(timeout=12000),
        lambda: page.get_by_role("button", name=re.compile(r"^(Generate|Générer)$", re.I)).first.click(timeout=12000),
        lambda: page.locator("button").filter(has_text=re.compile(r"^\s*Generate\s*$", re.I)).last.click(timeout=8000),
        lambda: page.get_by_text("Generate", exact=True).last.click(timeout=8000),
    ]:
        try: strat(); clicked = True; break
        except Exception: continue
    if not clicked: fail_missing_element(page, "bouton Generate", "generate")
    page.wait_for_url(re.compile(r"/ai-studio/[0-9a-f-]{8,}"), timeout=90000)
    page.wait_for_timeout(6000)
    m["veed_project_id"] = page.url.rstrip("/").split("/")[-1].split("?")[0]
    # 3) relevés AVANT rendu
    m["plan_before"] = read_first_text(page, r"plan|pro|free|team")
    m["credits_before"] = read_first_text(page, r"Cr[ée]dits?")
    m["mode_or_model"] = "AI Studio talking-head (AI Avatar) + lip-sync"
    m["avatar"] = read_first_text(page, r"^(Marcus|Mira|[A-Z][a-z]+)$") or None
    m["format_hint"] = read_first_text(page, r"Portrait|Landscape|Square|9:16|16:9|1:1")
    # 4) RENDU (Done/Terminé) — chronométré. Le libellé peut inclure le coût crédits (ex "Terminé ✦11").
    t_render0 = time.time()
    done_clicked = False
    for strat in [
        lambda: page.get_by_role("button", name=re.compile(r"(Terminé|Terminer|Done)", re.I)).first.click(timeout=8000),
        lambda: page.get_by_text(re.compile(r"^\s*(Terminé|Done)", re.I)).last.click(timeout=6000),
    ]:
        try: strat(); done_clicked = True; break
        except Exception: continue
    if not done_clicked: fail_missing_element(page, "bouton Done/Terminé", "done")
    page.wait_for_url(re.compile(r"/view/"), timeout=300000)   # gère le préfixe de locale (/view/fr-FR/…)
    m["render_seconds"] = round(time.time() - t_render0, 1)
    page.wait_for_timeout(4000)
    body = page.content().lower()
    m["captcha_or_quota"] = any(s in body for s in ["recaptcha", "quota", "limit reached", "upgrade to"])
    # 5) TÉLÉCHARGEMENT via expect_download
    open_download_panel(page)
    with page.expect_download(timeout=120000) as di:
        clicked = False
        for strat in [
            lambda: page.get_by_text("MP4", exact=True).first.click(timeout=5000),
            lambda: page.get_by_role("button", name=re.compile(r"^MP4$", re.I)).first.click(timeout=5000),
        ]:
            try: strat(); clicked = True; break
            except Exception: continue
        if not clicked: fail_missing_element(page, "bouton MP4", "mp4")
    dest = DL / f"{job_id}.mp4"
    di.value.save_as(str(dest))
    # 6) ffprobe + R2
    m["ffprobe"] = ffprobe(dest)
    m["credits_after"] = read_first_text(page, r"Cr[ée]dits?")   # /view n'affiche pas toujours -> souvent None
    r2 = r2_upload(dest, f"veed-web-mvp/{job_id}.mp4")
    m["total_seconds"] = round(time.time() - t0, 1)
    return r2, m

# ----------------------------- orchestration -----------------------------
def run_browser(fn):
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            str(PROFILE), headless=False, channel="chrome",
            accept_downloads=True, no_viewport=True,
        )
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            return fn(page)
        finally:
            try: page.wait_for_timeout(800); ctx.close()
            except Exception: pass

# app_state keys that only make sense while a job is in recovery — they must be
# cleared when the job is finally promoted to `done` so a successful job never
# still surfaces a stale FINAL_DB_WRITE_FAILED diagnostic in the admin API.
RECOVERY_STATE_KEYS = ("status_detail", "recovery_r2_url", "persistence_errors", "error")

def clean_done_state(app_state):
    """Return app_state without recovery/diagnostic keys, with a durable r2_url."""
    clean = {k: v for k, v in (app_state or {}).items() if k not in RECOVERY_STATE_KEYS}
    clean["r2_url"] = clean.get("r2_url") or None
    return clean

def persist_completed_job(job_id, r2_url, app_state, attempts=3, sleep_fn=None):
    """Persist a completed output without ever triggering a paid regeneration."""
    sleep_fn = sleep_fn or time.sleep
    done_state = clean_done_state(app_state)
    done_state["r2_url"] = r2_url
    done_patch = {
        "status": "done",
        "current_stage": "veed_done",
        "final_url": r2_url,
        "video_url": r2_url,
        "error_message": None,
        "app_state": done_state,
    }
    errors = []

    for attempt in range(1, attempts + 1):
        try:
            updated = sb_patch(job_id, done_patch)
            if not updated:
                raise RuntimeError("final update returned no row")
            return updated[0]
        except Exception as exc:
            errors.append(str(exc))
            if attempt < attempts:
                sleep_fn(min(2 ** (attempt - 1), 4))

    recovery_state = {
        **app_state,
        "status_detail": "FINAL_DB_WRITE_FAILED",
        "recovery_r2_url": r2_url,
        "persistence_errors": errors[-3:],
    }
    recovery_patch = {
        "status": "in_progress",
        "current_stage": "veed_output_ready",
        "final_url": r2_url,
        "video_url": r2_url,
        "error_message": "FINAL_DB_WRITE_FAILED",
        "app_state": recovery_state,
    }

    try:
        recovered = sb_patch(job_id, recovery_patch)
        if not recovered:
            raise RuntimeError("recovery update returned no row")
    except Exception as recovery_exc:
        record = {
            "job_id": job_id,
            "r2_url": r2_url,
            "app_state": recovery_state,
            "recovery_error": str(recovery_exc),
        }
        (SHOTS / f"{job_id}_OUTPUT_READY.json").write_text(
            json.dumps(record, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        raise FinalPersistenceError(
            f"output ready at {r2_url}; DB recovery write also failed: {recovery_exc}"
        ) from recovery_exc

    raise FinalPersistenceError(
        f"output ready at {r2_url}; completion write failed and recovery state was saved"
    )

def recover_output_ready():
    local = find_local_output_ready()
    local_path = None
    if local:
        local_path, record = local
        jid = record["job_id"]
        state = record.get("app_state") or {}
        r2 = record["r2_url"]
    else:
        recovery = find_output_ready_job()
        if not recovery:
            return None
        jid = recovery["id"]
        state = recovery.get("app_state") or {}
        r2 = recovery.get("final_url") or recovery.get("video_url") or state.get("recovery_r2_url")
    if not r2:
        raise RuntimeError(f"job {jid} is veed_output_ready but has no R2 URL")
    try:
        persist_completed_job(jid, r2, state)
        if local_path:
            local_path.unlink(missing_ok=True)
        log(f"job {jid} RECOVERED -> {r2}")
        return "RECOVERED"
    except FinalPersistenceError as exc:
        log(f"job {jid} recovery still pending: {exc}")
        return "PERSISTENCE_FAILED"

def handle_one(page):

    done_today = daily_done_count()
    if done_today >= DAILY_CAP:
        log(f"plafond atteint ({done_today}/{DAILY_CAP}) — rien à faire"); return "CAP_REACHED"
    job = claim_next_job()
    if not job:
        log("aucun job pending"); return "IDLE"
    jid = job["id"]; script = job["prompt"]; fmt = (job.get("app_state") or {}).get("format", "portrait")
    log(f"job {jid} — claim ({done_today}/{DAILY_CAP} aujourd'hui)")
    claimed = sb_patch(jid, {"status": "in_progress", "current_stage": "veed_generate",
                             "error_message": None}, expected_status="pending")
    if not claimed:
        log(f"job {jid} déjà claim par un autre worker")
        return "CLAIM_LOST"
    job = claimed[0]
    try:
        ensure_logged_in(page)
        r2, metrics = process_job(page, jid, script, fmt)
        newstate = {**(job.get("app_state") or {}), **metrics, "r2_url": r2}
        newstate.pop("status_detail", None)
        newstate.pop("error", None)
        persist_completed_job(jid, r2, newstate)
        log(f"job {jid} DONE -> {r2}")
        return "DONE"
    except FinalPersistenceError as e:
        # The paid generation and R2 upload succeeded. Keep the job recoverable
        # and never route this through the generic failure path.
        log(f"job {jid} OUTPUT_READY, persistence pending: {e}")
        return "PERSISTENCE_FAILED"
    except NeedsLogin as e:
        st = {**(job.get("app_state") or {}), "status_detail": "NEEDS_LOGIN"}
        sb_patch(jid, {"status": "pending", "current_stage": "veed_needs_login",
                       "error_message": "NEEDS_LOGIN", "app_state": st})
        log(f"job {jid} NEEDS_LOGIN — intervention manuelle"); return "NEEDS_LOGIN"
    except Exception as e:
        diag = capture_diagnostic(page, "FAILED", str(e))
        st = {**(job.get("app_state") or {}), "error": str(e)[:500]}
        st["failure_diagnostic"] = {"url": diag.get("url"), "title": diag.get("title")}
        sb_patch(jid, {"status": "failed", "current_stage": "veed_failed",
                       "error_message": str(e)[:500], "app_state": st})
        log(f"job {jid} FAILED: {e}"); return "FAILED"

def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "once"
    if mode == "selftest":
        script = sys.argv[2] if len(sys.argv) > 2 else "Hello, this is a self test of the VEED web worker."
        fmt = sys.argv[3] if len(sys.argv) > 3 else "portrait"
        def _run(page):
            ensure_logged_in(page)
            r2, m = process_job(page, f"selftest-{int(time.time())}", script, fmt)
            print(json.dumps({"r2_url": r2, "metrics": m}, ensure_ascii=False, indent=2)); return "OK"
        print("RESULT:", run_browser(_run)); return
    if mode == "once":
        recovery = recover_output_ready()
        print("RESULT:", recovery or run_browser(handle_one)); return
    if mode == "loop":
        while True:
            res = recover_output_ready() or run_browser(handle_one)
            if res in ("CAP_REACHED", "NEEDS_LOGIN"):
                log(f"arrêt boucle ({res})"); break
            if res in ("IDLE", "PERSISTENCE_FAILED"):
                time.sleep(60)
        return
    print("usage: veed_web_worker.py [once|loop|selftest]")

if __name__ == "__main__":
    main()
