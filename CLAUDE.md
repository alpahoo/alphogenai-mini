# CLAUDE.md — AlphoGenAI

Guide de développement pour les agents IA (Claude Code, etc.) travaillant sur ce repo.
Document à jour le **2026-05-11**. Toute info ici doit refléter l'état réel du repo — si tu remarques une divergence, **arrête et signale-la** plutôt que de coder par-dessus.

> 📌 **Pour les décisions architecturales et les garde-fous "NE PAS faire", lire `docs/architecture/future-proof-notes.md`.**

---

## Présentation

**AlphoGen** (anciennement AlphoGenAI Mini) est une plateforme SaaS de génération vidéo IA en production sur `https://www.alphogen.com`.

- **Repo** : `alpahoo/alphogenai-mini`
- **Branche prod** : `main`
- **Statut** : Production live · Stripe billing actif · candidature Alibaba Cloud Catalyst Program soumise
- **Hosting** : Vercel (Next.js) + Modal (GPU pipeline)

---

## Stack technique réelle

| Couche | Technologie | Version |
|---|---|---|
| Frontend | Next.js App Router + RSC | `^15.5.15` |
| React | React | `^19.0.0` |
| TypeScript | TypeScript strict | `^5.8.3` |
| UI | Tailwind CSS + Radix UI primitives + shadcn-style + Framer Motion | TW `^3.4.17` |
| Auth + DB | Supabase (Auth, PostgreSQL 17, Storage) | `@supabase/ssr@^0.6.1` |
| GPU inference | Modal serverless GPU (app `alphogenai-v2`) | `modal` CLI (Python 3.11) |
| Workers Python | `workers/` (audio orchestration, budget guard, env check) | Python 3.10+ |
| Provider vidéo principal | **EvoLink** (unified gateway → Wan 2.6/2.7/Happy Horse 1.0) | REST |
| Provider vidéo legacy | Kie.ai / Seedance (engine `seedance`, dans le registry DB, activable mais pas prioritaire) | REST |
| Engine Modal local | Wan I2V (volume models pré-téléchargés) | torch 2.5.1, diffusers 0.37.1 |
| Storage | Cloudflare R2 (S3-compatible) | `@aws-sdk/client-s3@^3` |
| Email | Resend | `resend@^6.12.0` |
| Billing | Stripe (multi-SaaS isolation via `lib/stripe-app-context.ts`) | `stripe@^21.0.1` |
| OAuth social | YouTube + TikTok + Instagram (tokens AES-256-GCM en DB) | natif Node `crypto` |
| Monitoring | Sentry (tunnel `/monitoring`) | `@sentry/nextjs@^10.49.0` |
| Cron safety net | GitHub Actions toutes les 5 min → `/api/cron/evolink-poll` | `evolink-cron.yml` |

> ⚠️ **CE QUI N'EST PAS DANS LA STACK** (clarification pour éviter les confusions) : pas d'Inngest, pas de Long Video Infinity / SVI / AudioLDM2 (anciennes mentions historiques), pas d'ORM (Prisma/Drizzle), pas de Playwright/Cypress, pas d'analytics tiers (PostHog/Mixpanel).

---

## Structure réelle du projet

```
alphogenai-mini/
├── app/                          # Next.js App Router
│   ├── (workspace)/              # auth-gated, sidebar h-screen
│   │   ├── home/page.tsx
│   │   ├── create/page.tsx + [mode]/page.tsx
│   │   ├── library/page.tsx
│   │   ├── projects/page.tsx
│   │   └── layout.tsx
│   ├── (admin)/                  # auth + admin email gate
│   │   └── admin/
│   │       ├── page.tsx                (dashboard, recharts)
│   │       ├── engines/page.tsx + [id]/page.tsx
│   │       ├── jobs/page.tsx
│   │       ├── users/page.tsx
│   │       └── layout.tsx
│   ├── api/                      # 31 routes API (cf §API)
│   ├── jobs/[id]/page.tsx        # détail job (owner-only)
│   ├── about, technology, pricing, privacy, terms/
│   ├── blog/page.tsx + [slug]/page.tsx
│   ├── login/page.tsx
│   ├── page.tsx                  # homepage
│   ├── layout.tsx                # root layout + metadata + SiteShell
│   └── opengraph-image.tsx       # OG dynamique (Satori)
├── components/
│   ├── ui/                       # primitives shadcn (Button, Card, Input, ...)
│   ├── admin/                    # sidebar admin, stat cards
│   ├── workspace/sidebar.tsx
│   ├── create/                   # UI génération (reference-upload, ...)
│   ├── job/                      # JobCostBadge, social-export-panel (535L)
│   └── site-{header,footer,shell}.tsx
├── lib/
│   ├── supabase/{client,server,middleware,service}.ts  # 4 contextes
│   ├── evolink-client.ts         # client EvoLink (video + LLM)
│   ├── modal-client.ts           # trigger Modal functions
│   ├── r2.ts                     # Cloudflare R2 SDK
│   ├── encryption.ts             # AES-256-GCM (secrets, OAuth)
│   ├── stripe.ts + stripe-app-context.ts  # multi-SaaS isolation
│   ├── engine-templates.ts       # admin templates engines
│   ├── flags.ts                  # feature flags + admin allowlist
│   ├── prompt-enhancer.ts + prompt-templates.ts + storyboard.ts
│   ├── social-metadata.ts        # LLM + fallback templates
│   ├── email.ts                  # Resend
│   ├── blog-posts.ts             # registry posts (data-driven)
│   ├── types.ts                  # types TS partagés
│   └── utils.ts
├── modal_app/                    # Python pipeline GPU
│   ├── video_pipeline.py         # 14 functions (~900 LOC pipeline)
│   ├── setup_models.py
│   ├── engines/
│   │   ├── base.py registry.py router.py
│   │   ├── reference_mapper.py
│   │   ├── wan.py seedance.py generic_api.py
│   │   └── __init__.py
│   └── utils/{costs,encryption}.py
├── workers/                      # Python utils (audio orchestration, budget guard)
│   ├── app.py audio_orchestrator.py budget_guard.py check_env.py
│   └── __init__.py
├── supabase/migrations/          # 24 migrations SQL chronologiques
├── tests/                        # 1 test Python (test_seedance_routing.py)
├── docs/
│   ├── architecture/             # ← future-proof-notes.md (à lire avant tout refactor)
│   ├── CTO_BRIEFING_2026-05-11.md
│   └── CTO_TECHNICAL_DEEP_DIVE_2026-05-11.md
├── public/                       # assets (app-icon, tiktok-domain-verification)
├── .github/workflows/
│   ├── deploy-modal.yml          # auto-deploy Modal sur push main
│   └── evolink-cron.yml          # cron safety net 5 min
├── middleware.ts                 # auth refresh (workspace paths only)
├── next.config.ts                # withSentryConfig, Sentry tunnel
├── package.json
└── CLAUDE.md                     # ce fichier
```

---

## Variables d'environnement (Vercel)

> **Ne JAMAIS commit de valeurs réelles.** Liste descriptive uniquement.

### Supabase
- `NEXT_PUBLIC_SUPABASE_URL` — URL projet Supabase
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — clé publique anon
- `SUPABASE_SERVICE_ROLE_KEY` — **server-side uniquement** ⚠️, bypass RLS

### Modal (GPU pipeline)
- `MODAL_WEBHOOK_SECRET` — valider signature webhook Modal → Next.js
- `MODAL_WEBHOOK_URL` — endpoint Modal exposé pour callbacks
- `MODAL_FLUSH_CACHE_URL` — endpoint admin pour invalider le cache engines

### EvoLink (provider vidéo principal)
- `EVOLINK_API_KEY` — bearer token pour `api.evolink.ai/v1` (vidéo + LLM)

### Cloudflare R2
- `R2_ENDPOINT` — endpoint S3-compatible
- `R2_ACCESS_KEY_ID` + `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME` (défaut `alphogenai-assets`)
- `R2_PUBLIC_URL` — base CDN publique pour assets servis

### Stripe
- `STRIPE_SECRET_KEY` — secret key (live ou test selon `STRIPE_ENV`)
- `STRIPE_WEBHOOK_SECRET` — `whsec_*` pour valider la signature HMAC
- `STRIPE_PRICE_ID` — Pro plan price ID
- `STRIPE_ENV` — `live` ou `test`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — publishable key client

### OAuth social
- `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` — YouTube Data API v3
- `TIKTOK_CLIENT_KEY` + `TIKTOK_CLIENT_SECRET` — TikTok Content Posting API
- `INSTAGRAM_APP_ID` + `INSTAGRAM_APP_SECRET` — Instagram Graph API (via Meta)

### Email
- `RESEND_API_KEY` + `RESEND_FROM_EMAIL`

### Sécurité interne
- `ENGINE_SECRETS_KEY` — 64 hex chars (32 bytes), AES-256-GCM master key pour chiffrement secrets engines + OAuth tokens. Generate : `openssl rand -hex 32`. **Ne JAMAIS roter sans re-chiffrer toute la DB.**
- `CRON_SECRET` — bearer token pour `/api/cron/evolink-poll`. Doit être en sync entre Vercel env et GitHub Actions repo secret. Generate : `openssl rand -hex 32`.

### Sentry
- `SENTRY_ORG` + `SENTRY_PROJECT` + `SENTRY_AUTH_TOKEN` (upload source maps)

### Flags
- `NEXT_PUBLIC_ADMIN_EMAILS` — CSV emails admin, lu par `lib/flags.ts:isAdminEmail()`
- `NEXT_PUBLIC_SHOW_COST_TRACKING_UI` — `"true"` pour exposer cost UI

### Site
- `NEXT_PUBLIC_SITE_URL` — `https://www.alphogen.com` en prod (utilisé pour OG metadataBase + OAuth redirect URIs)
- `VERCEL_URL` — auto-injecté par Vercel

---

## Commandes essentielles

```bash
# Dev local
npm install
npm run dev              # turbopack

# Build & vérifs
npm run build            # vérifie production build
npm run lint             # next lint

# TypeScript check (manuel, n'échoue pas le build à cause de ignoreBuildErrors)
npx tsc --noEmit -p tsconfig.json

# Modal — déployer le pipeline GPU
# (le push sur main avec changements modal_app/* le fait automatiquement via GH Actions)
python -m modal deploy modal_app/video_pipeline.py

# Workers Python (local, optionnel)
cd workers && pip install -r requirements.txt
python app.py
```

---

## Architecture du pipeline vidéo (réelle)

```
Utilisateur
   │
   ▼
POST /api/jobs ─────── (1) plan gate (server-side, never trust client)
   │                   (2) validate prompt, image_url, references
   │                   (3) insert jobs row (status='queued')
   ▼
Modal generate_multi_scene  ──► EvoLink API (Wan 2.6 / 2.7 / Happy Horse)
   │                        OR  Wan local sur Modal volume (free tier)
   │                        OR  Kie.ai / Seedance (legacy, via DB registry)
   │
   ▼
Per-scene state machine (atomic claims, race-safe)
   │   ├─ extract_last_frame  ─► feeds next scene first_frame_url
   │   └─ retry per scene without losing earlier scenes
   ▼
Modal concat_and_finalize  ──► R2 upload
   │
   ▼
Modal webhook  ──► POST /api/webhooks/modal
                   │
                   ▼
                   Supabase update_job (status='done', output_url=...)
                   │
                   ▼
                   Resend email "Your video is ready"

Safety net : GitHub Actions cron /5min ─► /api/cron/evolink-poll
             (rattrape les jobs EvoLink orphelins si webhook raté)
```

---

## Conventions de code

### TypeScript / Next.js
- TypeScript strict — pas de `any` implicite
- Composants fonctionnels uniquement
- Server Components par défaut, `"use client"` UNIQUEMENT si nécessaire (state, effects, listeners)
- Validation des inputs API server-side, jamais trust the client
- Erreurs structurées : `NextResponse.json({ error: string }, { status: 4xx })`
- Logs structurés JSON pour routes critiques (cf pattern dans `app/api/stripe/webhook/route.ts`)

### Python (Modal + workers)
- Python 3.10+
- Type hints obligatoires sur les fonctions publiques
- Gestion d'erreurs explicite avec `logging` (pas de `print` en prod)
- Variables d'environnement via `os.environ`, jamais hardcodées
- Modal functions : `retries=0` (state machine + cron gère les retries)

### Base de données
- Migrations dans `supabase/migrations/`, format `YYYYMMDD_description.sql`
- **Toujours additif** — pas de `DROP COLUMN` / `DROP TABLE` sans plan de rollback
- RLS activé sur toutes les tables user-scoped (`auth.uid()`)
- `SUPABASE_SERVICE_ROLE_KEY` côté serveur uniquement

### Git
- Branche prod : `main`
- Format commit : `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`
- Co-author tag pour les commits assistés par IA :
  ```
  Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
  ```
- HEREDOC pour les messages multi-lignes

---

## Règles importantes (résumé — détails dans future-proof-notes.md)

### Sécurité
- `SUPABASE_SERVICE_ROLE_KEY` → **jamais côté client**
- `ENGINE_SECRETS_KEY` → master key AES, **jamais loggée, jamais commitée**
- `MODAL_WEBHOOK_SECRET` → valider la signature de chaque webhook
- `CRON_SECRET` → si unset côté Vercel, le check ne déclenche pas → route ouverte
- OAuth tokens (YouTube/TikTok/Instagram) → chiffrés AES-256-GCM avant insertion DB

### Engines
- **EvoLink = provider principal** (modèles fermés Wan 2.6/2.7/Happy Horse, multi-scene, multi-reference)
- **Wan local Modal = fallback stable** (free tier, reference-agnostic)
- **Kie.ai / Seedance = legacy** (en code mais pas la cible des nouvelles features)
- Engine registry **DB-driven** (`engines` table) — ne pas hardcoder dans le code, utiliser `select_engine()` du router

### Plan gate
- Server-side **obligatoire** sur `POST /api/jobs` : verify `preferred_engine` allowed for user plan
- Free user → engine premium = **rejet 403**. Jamais trust the client.

### Stripe
- Webhook idempotency via table `stripe_events` (PK = event.id)
- Multi-SaaS isolation via `lib/stripe-app-context.ts` (filtre par `app_id`)
- Logs structurés JSON sur chaque event traité

### Modal
- Pas d'appels Modal depuis le frontend (toujours via API Routes server-side)
- `budget_guard.py` (workers) limite le coût GPU par job
- `retries=0` sur les Modal functions — la state machine fait le retry

---

## Comment ajouter…

### Une nouvelle migration DB
```bash
# Format : YYYYMMDD_short_description.sql
# Exemple : 20260520_add_job_references_table.sql
# Toujours additif (ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS)
# Pour appliquer en prod : via Supabase MCP apply_migration ou dashboard SQL
```

### Un nouvel engine
1. Insert row dans `engines` (id, name, type, status, priority, api_config JSONB)
2. Insert dans `engine_plans` (lien engine ↔ plans autorisés)
3. Insert dans `engine_costs` (billing_model, per_second_usd ou per_video_usd)
4. Si secret API : insert dans `engine_secrets` (encrypted via `lib/encryption.ts`)
5. Si engine "Modal local" : ajouter le fichier `modal_app/engines/<name>.py` héritant de `BaseEngine`
6. Si engine "API externe" : utiliser `GenericApiEngine` avec `api_config` complet
7. Tester via `/admin/engines/[id]/test` UI

### Une route API
- Path : `app/api/<resource>/route.ts` ou `[id]/route.ts`
- Toujours `createClient` pour auth user, `createServiceClient` pour writes privilégiés
- Toujours validate inputs (types + bounds + plan gate si applicable)
- Toujours retourner `NextResponse.json()` avec status code HTTP
- Toujours logger en JSON structuré sur les routes critiques

### Debug d'un job en prod
1. Récupérer le `job_id` via UI ou Supabase dashboard
2. Vérifier `jobs` row (status, error_message, engine_used, scenes JSON)
3. Vérifier `scenes` table si multi-scene
4. Sentry pour les stack traces côté Next.js + Modal
5. Vercel logs pour les routes API
6. Modal logs : `python -m modal app logs alphogenai-v2`
7. Cron health : workflow `evolink-cron.yml` → Actions tab

---

## Documents companions

- **`docs/architecture/future-proof-notes.md`** — décisions architecturales historiques + garde-fous "NE PAS faire" + recettes étendues. **À lire avant tout refactor ou nouvelle feature majeure.**
- **`docs/CTO_BRIEFING_2026-05-11.md`** — exec summary pour reporting CTO/management
- **`docs/CTO_TECHNICAL_DEEP_DIVE_2026-05-11.md`** — audit technique complet (615 lignes)

---

## Note pour les agents IA

Si tu détectes une divergence entre **ce document** et **l'état réel du code** (versions, fichiers, env vars, structures), **STOP et signale-le au user** avant de coder. Mieux vaut une question que de coder sur une base périmée.

Lecture obligatoire avant toute session : ce fichier + `docs/architecture/future-proof-notes.md`.

---

*Document maintenu à la main. Refresh recommandé après chaque shift architectural majeur (nouveau provider, nouveau pattern de routes, refonte schéma DB).*
