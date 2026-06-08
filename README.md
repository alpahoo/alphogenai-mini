<h1 align="center">AlphoGen</h1>

<p align="center">
  AI video-generation SaaS — an <strong>AI director for consistent character & brand videos</strong>.
  <br/>Live at <a href="https://www.alphogen.com">alphogen.com</a>.
</p>

> 🟢 **Source of truth: [`HANDOVER.md`](./HANDOVER.md).** It is short, current, and
> actionable. Multi-agent coordination: [`AGENTS.md`](./AGENTS.md). Agent
> guide + history: [`CLAUDE.md`](./CLAUDE.md) · architecture guardrails:
> [`docs/architecture/future-proof-notes.md`](./docs/architecture/future-proof-notes.md).
>
> ℹ️ Older revisions of this README referenced a Runpod / SVI / AudioLDM2 /
> LangGraph pipeline. **That is historical and no longer the system.** See below
> for the real stack.

## What it is

Describe a scene with a multimodal prompt (free text + character/image
references), pick an outcome-oriented model, and AlphoGen generates a video
(single- or multi-scene with last-frame continuity), persists it, and lets you
export it for social platforms. Includes auth, plans/quotas, billing, admin,
scheduled posts, and a public gallery.

## Stack (current)

- **Next.js 15** (App Router, Turbopack), React, TypeScript, Tailwind.
- **Supabase** — Postgres + RLS, Auth, Storage (private `references` bucket).
- **Cloudflare R2** — durable storage for generated outputs / public assets.
- **Modal** — server-side ffmpeg (scene concat, audio mux), webhooks.
- **Stripe** (billing), **Sentry** (errors), **TipTap** (prompt composer), **Vitest** (tests).
- **Video providers** (routed behind product-level model names): BytePlus Seedance
  2.0 / 1.5 Pro (verified faces via `asset://`), AtlasCloud, EvoLink, HeyGen
  (avatars + cloned voice + lipsync), Wan (Modal GPU).

> Public UI shows **models & capabilities** (Seedance 2.0, Wan, Avatar, "Realistic
> character"…), never provider/aggregator names — those stay in admin/logs/code.

## Quick start

```bash
git clone https://github.com/alpahoo/alphogenai-mini.git
cd alphogenai-mini
npm install
npm run dev        # next dev --turbopack
```

Secrets live in **Vercel → Environment Variables** (never in the repo). The full
list of env var names + local setup is in [`HANDOVER.md`](./HANDOVER.md).

## Checks

```bash
npm test                            # Vitest (226 tests)
npx tsc --noEmit -p tsconfig.json   # typecheck
npm run build                       # passes without secrets (/gallery degrades gracefully)
npm run lint                        # next lint → no warnings or errors
```

## Coordinates

| | |
|---|---|
| Repo | https://github.com/alpahoo/alphogenai-mini (branch `main`) |
| Hosting | Vercel (auto-deploy on push to `main`) → alphogen.com |
| DB / Auth / Storage | Supabase (`qbrpzmuedfugbhoeytdj`) |
| Object storage | Cloudflare R2 |
| GPU / media jobs | Modal |

## License

MIT.
