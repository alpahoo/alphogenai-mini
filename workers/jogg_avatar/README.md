# Jogg Custom Video Avatar worker (private beta)

White-label bridge for high-fidelity video presenters. AlphoGen owns the upload,
consent, queue and resulting presenter catalog. A private Playwright worker uses
the normal Jogg web interface with one persistent account session.

This worker deliberately does **not** use private provider APIs, bypass captcha,
rotate accounts, or expose provider details to users. UI drift stops a request in
`needs_review` and writes screenshots/HTML under `workers/jogg_avatar/shots/`.

## Setup

```powershell
pip install playwright requests pillow imageio-ffmpeg
python -m playwright install chrome
python workers/jogg_avatar/login.py
python workers/jogg_avatar/jogg_avatar_worker.py inspect
```

Environment is loaded from `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `JOGG_API_KEY` (read-only custom-avatar catalog polling)

The browser profile lives at `~/.jogg_avatar_worker_profile`. Override with
`JOGG_AVATAR_WORKER_PROFILE`.

## Run

```powershell
python workers/jogg_avatar/jogg_avatar_worker.py once
python workers/jogg_avatar/jogg_avatar_worker.py poll
python workers/jogg_avatar/jogg_avatar_worker.py loop
```

`once` first promotes completed provider jobs into `user_presenters`, then claims
at most one new request. Completion is detected through the documented custom
avatar catalog and matched by the unique `AG-<request>-<name>` provider name.

## First live calibration

Run `inspect` after the one-time login. Review the screenshot and HTML before the
first paid/user submission. If the normal Jogg Custom Avatar UI differs from the
semantic selectors, update only `submit_through_web`; queue/storage/publishing
remain unchanged.
