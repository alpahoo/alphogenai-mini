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

## Hostinger VPS runbook

The worker requires a persistent Chrome profile and a visible browser session.
On a Linux VPS, run Chrome inside a dedicated Xvfb display. Use a temporary
VNC/noVNC session only for the first interactive sign-in or later maintenance.
Do not expose the browser or VNC port publicly.

1. Create a dedicated unprivileged user and clone the repository.
2. Install Python, Google Chrome, Xvfb and the worker dependencies.
3. Put secrets in `/etc/alphogen/jogg-avatar.env`, owned by root with mode `600`.
4. Keep the profile in `/var/lib/alphogen-jogg-avatar/profile`.
5. Complete one interactive login through an SSH-tunnelled VNC session.
6. Start exactly one worker service.

Required environment:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
JOGG_API_KEY=...
JOGG_AVATAR_WORKER_PROFILE=/var/lib/alphogen-jogg-avatar/profile
JOGG_AVATAR_HEADLESS=0
DISPLAY=:99
```

Example systemd unit:

```ini
[Unit]
Description=AlphoGen Video Presenter worker
After=network-online.target xvfb.service
Wants=network-online.target

[Service]
Type=simple
User=alphogen-worker
WorkingDirectory=/opt/alphogenai-mini
EnvironmentFile=/etc/alphogen/jogg-avatar.env
ExecStart=/opt/alphogenai-mini/.venv/bin/python workers/jogg_avatar/jogg_avatar_worker.py loop
Restart=always
RestartSec=20
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
```

Operational checks:

```bash
systemctl status alphogen-jogg-avatar
journalctl -u alphogen-jogg-avatar -f
```

Stop the service before opening the profile interactively. Never run two workers
against the same profile or queue. Diagnostics under `shots/` may contain
sensitive provider UI state; rotate them locally and never commit them.
