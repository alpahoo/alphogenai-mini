# AlphoGen — Handover (source of truth)

> Short, current, actionable onboarding doc. If anything here disagrees with
> `README.md`, **trust this file** (the README still contains historical
> Runpod/SVI/AudioLDM2/LangGraph notes that no longer reflect the system).
> Last updated: 2026-07-16 (voir l'addendum daté ci-dessous ; corps historique 2026-06-08).

## Update 2026-07-16 (Claude) — Decision Books + URL→Video V1 live

- **Méthode produit** : on avance **un workflow à la fois** via des **Capability Decision Books** dans `docs/decision-books/` (`README.md` = index des états). Un workflow est **gelé** avant d'ouvrir le suivant. Sources officielles uniquement ; noms providers **jamais** en UI publique (garde-fou `lib/__tests__/provider-leak-guard.test.ts`).
- **États des workflows** :
  - 🎙️ **Podcast Premium V1** → 🔒 GELÉ (VEED web worker — `podcast-premium-v1.md`).
  - 🛒 **URL → Video V1** → 🔒 **GELÉ, validé en prod le 2026-07-16** sur **Jogg** (provider interne) — `url-to-video-v1.md`.
  - ✂️ **Editing/Enhancement (V1.1)** → 🔬 **Descript audité** (GO pré-V1.1 ; P0 = coût crédits/action) — `editing-enhancement-descript-audit.md`. Pas démarré.
  - 📢 **Publication** → **Postiz** (à benchmarker — prochain candidat).
- **Nouveau provider** : **Jogg** — URL/produit → vidéo ad (admin-only) — `lib/jogg-client.ts`. Label public « URL to Video », « Jogg » interne only.
- **Nouvel env Vercel prod** : **`JOGG_API_KEY`** (ajouté le 2026-07-16). `CRON_SECRET` déjà présent (protège aussi `/api/cron/jogg-poll`).
- **Bilan CTO complet de la session (relais Codex)** : voir l'entrée `agent/log.md` du **2026-07-16**.

## What it is

AlphoGen (**alphogen.com**) is an AI video-generation SaaS. Core product:
**Story Video** — describe a scene (multimodal prompt with character/image
references), pick a model, and the platform generates a video (single- or
multi-scene with last-frame continuity), persists it, and lets the user
export it for social platforms. Includes auth, plans/quotas, billing,
admin, scheduled posts, and a gallery.

## Coordinates

| Thing | Value |
|---|---|
| Repo (public) | https://github.com/alpahoo/alphogenai-mini |
| Default branch | `main` |
| Hosting | Vercel project `nextjs-with-supabase-l5zv` (team `team_kq6TRybfPHjJYkfAlQXGDpI2`, project `prj_D2woxz7R5y0hBB1pd0WQGYmWGkDV`) |
| Prod domain | alphogen.com (auto-deploy on push to `main`) |
| DB / Auth / Storage | Supabase project ref `qbrpzmuedfugbhoeytdj` |
| Object storage | Cloudflare R2 (final videos + public assets) |
| GPU / media jobs | Modal (ffmpeg concat / mux, webhooks) |

## Stack

- **Next.js 15** (App Router, Turbopack), React, TypeScript, Tailwind.
- **Supabase**: Postgres + RLS, Auth, Storage (private bucket `references`).
- **Cloudflare R2**: durable storage for generated outputs and public assets.
- **Modal**: server-side ffmpeg (scene concat, audio mux), webhooks.
- **Stripe** (billing), **Sentry** (errors), **TipTap** (prompt composer), **Vitest** (tests).

## Video providers (multi-provider routing)

| Provider | Used for | Client |
|---|---|---|
| **BytePlus** (ModelArk Seedance 2.0 / 1.5 Pro) | Cheapest direct Seedance; verified real-face refs via `asset://` | `lib/byteplus-client.ts` |
| **AtlasCloud** | Seedance alt provider | `lib/atlascloud-client.ts` |
| **EvoLink** | Seedance (legacy/fallback) | `lib/evolink-*` |
| **Bailian** (Alibaba) | Wan/Qwen models | — |
| **HeyGen** | Avatars (cinematic_avatar), cloned voices, lipsync | `lib/heygen-client.ts` |
| **Wan** | GPU i2v via Modal | — |

Key rules learned (don't regress):
- BytePlus blocks **raw photos of real people** (`PrivacyInformation`). Real
  faces must be **verified in the BytePlus console** → referenced by `asset://`.
  Kling O3 / Atlas accept raw uploaded face photos directly.
- Seedance **1.5 Pro has no reference-to-video** (r2v is 2.0-only).
- BytePlus rejects mixing first/last frame with reference images.
- When verified `asset://` refs are present, raw refs are dropped (avoids the
  privacy block).

## Local development

```bash
git clone https://github.com/alpahoo/alphogenai-mini.git
cd alphogenai-mini
npm install
cp .env.local.example .env.local   # if present; otherwise create .env.local
npm run dev        # next dev --turbopack
npm run build      # production build (now passes without secrets)
npm run test       # vitest (226 tests)
npx tsc --noEmit   # typecheck
```

### Environment variables

Secrets live in **Vercel → Settings → Environment Variables** (never in the
repo). Names you need locally / in prod:

- **R2**: `R2_ACCESS_KEY_ID`, `R2_ACCOUNT_ID`, `R2_API_TOKEN`, `R2_BUCKET_NAME`, `R2_ENDPOINT`, `R2_PUBLIC_URL`, `R2_SECRET_ACCESS_KEY`
- **Supabase**: `NEXT_PUBLIC_SUPABASE_URL`, the anon/publishable key, `SUPABASE_SERVICE_ROLE_KEY`
- **Providers**: `ARK_API_KEY` (BytePlus), `ATLASCLOUD_API_KEY`, HeyGen / EvoLink keys, Modal token
- **Billing/obs**: Stripe keys, Sentry DSN

> Local `next build` no longer fails without `SUPABASE_SERVICE_ROLE_KEY`:
> `/gallery` now degrades gracefully (renders empty at build, fills at runtime).

## Where things live

```
app/(workspace)/create/[mode]/page.tsx   Story Video page (composer + controls + Assets panel)
components/create/prompt-composer.tsx     TipTap tokenized editor (@face/@image chips, @ autocomplete)
components/create/asset-panel.tsx         Right-rail Assets panel (My Faces / Uploads, search, tiles)
components/create/faces-manager.tsx       Self-service verified-face manager (photo tiles, CRUD)
app/api/byteplus-assets/route.ts          CRUD for verified faces (GET/POST/PATCH/DELETE, signed thumbs)
app/api/jobs/route.ts                     Job creation: routing, plan/quota, content policy, provider dispatch
app/api/jobs/[id]/route.ts                Poller / state machine (scene chaining, R2 persist, lipsync/voiceover)
app/api/upload/route.ts                   Uploads (R2 legacy + private `references` bucket)
lib/byteplus-client.ts                    BytePlus Seedance client (asset://, tokens, engines)
lib/byteplus-cost.ts                      Token/cost estimation
lib/content-policy.ts                     Prompt screening (IP/public-figure/age/narrative)
lib/storyboard.ts                         Multi-scene storyboard generation
```

## Data model (recent)

- `jobs` — generation jobs (status, engine_used, references_payload jsonb,
  byteplus_asset_ids jsonb, chain_strategy, scenes, output_url_final, …).
- `byteplus_assets` — per-user verified faces (RLS). Columns: `asset_id`,
  `group_id`, `name`, `thumb_path` (display photo, signed on read). Policies:
  select/insert/update/delete own.
- Storage bucket `references` (private) — uploaded reference images + face
  display thumbnails (signed URLs).

## Known gaps / TODO (CTO consolidation list)

1. ~~Fix local `/gallery` build without secrets~~ ✅ done.
2. ~~Refresh `README.md`~~ ✅ done — now a short README pointing here (no more Runpod/SVI/AudioLDM2/LangGraph).
3. ~~Refresh `CLAUDE.md` for the BytePlus/Atlas/HeyGen/composer pivot~~ ✅ done (dated 2026-06-08 addendum).
4. ~~Clean remaining lint warnings~~ ✅ done — `next lint` reports no warnings or errors.
5. Add **integration** tests for the jobs/assets API (the provider-leak guard test is done; unit suite is 226 tests).

## Build/health snapshot

- `npx tsc --noEmit` → clean.
- `npm run test` → **226** Vitest tests pass.
- `npm run lint` → no warnings or errors.
- `npm run build` → full build succeeds locally (without secrets; `/gallery` degrades gracefully).
