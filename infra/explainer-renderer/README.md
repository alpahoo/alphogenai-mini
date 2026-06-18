# Explainer renderer (POC)

Code-based explainer videos for the AlphoGen Research Engine: a storyboard
(`research_storyboards.scenes_json` = `CinematicScenePlan[]`) is rendered to MP4
by **HyperFrames** (HTML/CSS/GSAP → headless Chrome → ffmpeg) with **Kokoro**
voice-over. **CPU-only, ~$0 marginal** on the existing Hostinger VPS.

## Pieces

| File | Role |
|---|---|
| `build.js` | storyboard JSON → HyperFrames composition `index.html` (6 Product templates + GSAP + `<audio>`) |
| `tts_kokoro.py` | per-scene voice-over via Kokoro (CPU, no API key) → `assets/vo-*.wav` + `audio-manifest.json` |
| `server.js` | render service: `POST /api/render` → MP4 (screenshot → TTS → build → render), queue concurrency 1 |
| `Dockerfile` / `docker-compose.yml` | service image (node+chromium+ffmpeg+kokoro+model) → `127.0.0.1:9100` |
| `render-from-research.mjs` | **B4 admin script**: research job → service → R2 (runs outside Vercel) |
| `sample-product-storyboard.json` | offline test data |

## Service (deployed on VPS at `/opt/explainer-renderer/`)

```bash
docker compose build && docker compose up -d   # listens on 127.0.0.1:9100
# .env holds EXPLAINER_RENDER_TOKEN (bearer) + EXPLAINER_VOICE
```

The service binds `127.0.0.1` only (not publicly exposed). Reach it via an SSH
tunnel for the admin flow below.

## B4 — render a real research job → R2

1. Open a tunnel to the private service (keeps it off the public internet):
   ```bash
   ssh -i ~/.ssh/hostinger_vps -N -L 9100:127.0.0.1:9100 root@46.202.171.222
   ```
2. In `.env.local` (the script reads secrets from env — never hard-code keys):
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   SUPABASE_SERVICE_ROLE_KEY=...
   EXPLAINER_RENDER_GATEWAY_URL=http://127.0.0.1:9100
   EXPLAINER_RENDER_TOKEN=<value from the VPS /opt/explainer-renderer/.env>
   R2_ENDPOINT=...  R2_ACCESS_KEY_ID=...  R2_SECRET_ACCESS_KEY=...
   R2_BUCKET_NAME=...  R2_PUBLIC_URL=...
   ```
3. Run:
   ```bash
   node --env-file=.env.local infra/explainer-renderer/render-from-research.mjs <research_job_id> [brand.json]
   ```
   → prints the R2 public URL of the rendered explainer (~4-5 min, CPU).

`brand.json` (optional) overrides derived branding, e.g.
`{"name":"Wise","primary":"#163300","accent":"#9fe870","logo_url":"https://.../logo.svg"}`.

## Optional: public ingress (not required for the admin flow)

To call the service from Vercel instead of via SSH tunnel, add a location to the
existing nginx `research-gw` vhost (shared infra — apply manually with care):
`nginx-render-location.conf` proxies `/api/render` → `127.0.0.1:9100` with a
600s read timeout. Then `EXPLAINER_RENDER_GATEWAY_URL=https://research-gw.alphogen.com`.
Note: a single render is ~4-5 min, so any Vercel-triggered call must be async
(fire-and-forget + poller), not a synchronous request (60s limit).

## Cost / limits

- Render ≈ 4-5 min for a ~40s video on the VPS (2 vCPU). Concurrency = 1.
- No GPU, no API fees (HyperFrames + Kokoro are local/open-source).
- TTS provider is isolated in `tts_kokoro.py` → swap to ElevenLabs/OpenAI later
  without touching the rest.
