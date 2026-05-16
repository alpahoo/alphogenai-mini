# AlphoGenAI — Bilan technique CTO (deep dive)

**Date** : 11 mai 2026
**Auteur** : Paul (founder) — préparé pour appréciation CTO
**Statut produit** : Production live sur `https://www.alphogen.com`
**Dernier commit `main`** : `64eb2ee` (briefing CTO doc · précédent : `f37dd12` OG image)
**Doc complémentaire** : `docs/CTO_BRIEFING_2026-05-11.md` (version executive summary)

Ce document est la version technique détaillée. Il source chaque claim par un fichier réel du repo et indique les lignes de code par domaine. Aucune valeur d'env var ou de secret n'est exposée.

---

## 1. Vue d'ensemble

### Métriques de code
| Domaine | Lignes |
|---|---|
| TypeScript `app/` | 10 040 |
| TypeScript `lib/` | 2 171 |
| TypeScript `components/` | 1 885 |
| Python `modal_app/` | 2 874 |
| SQL `supabase/migrations/` | 988 |
| **Total source** | **17 958** |

### Surfaces fonctionnelles
- **21 pages** Next.js (5 admin · 5 workspace · 4 publiques marketing · 3 légal · 4 public-content)
- **31 routes API** Next.js (jobs, auth OAuth × 3 plateformes, stripe, cron, webhooks, admin)
- **14 fonctions Modal** (génération, audio, mux, frame extraction, export social, thumbnail, watermark, webhook entry, healthcheck)
- **24 migrations** Supabase appliquées (oct 2025 → avril 2026)

### Versions
- `next@^15.5.15` (App Router, RSC, Turbopack en dev)
- `react@^19.0.0`
- `typescript@^5.8.3`
- `stripe@^21.0.1`
- `@supabase/supabase-js@^2.49.1` + `@supabase/ssr@^0.6.1`
- `@sentry/nextjs@^10.49.0`
- `tailwindcss@^3.4.17` + shadcn-style components (Radix UI primitives)
- `framer-motion@^12.23.24`
- Modal Python : `torch==2.5.1` · `diffusers==0.37.1` · `transformers==4.51.3`

---

## 2. Stack technique couche par couche

### 2.1 Frontend — Next.js 15 App Router

**Structure de routes** (route groups pour séparation des layouts) :

```
app/
├── (workspace)/          # auth-gated, layout sidebar h-screen
│   ├── create/page.tsx
│   ├── create/[mode]/page.tsx
│   ├── home/page.tsx
│   ├── library/page.tsx
│   └── projects/page.tsx
├── (admin)/              # auth + admin email gate, layout dédié
│   └── admin/
│       ├── page.tsx
│       ├── engines/page.tsx
│       ├── engines/[id]/page.tsx
│       ├── jobs/page.tsx
│       └── users/page.tsx
├── jobs/[id]/page.tsx    # detail job, public si owner
├── login/page.tsx
├── about/                 # marketing
├── technology/
├── pricing/
├── privacy/
├── terms/
├── blog/                  # blog index + dynamic slugs
└── page.tsx               # homepage
```

**Pattern clé** : `components/site-shell.tsx` (allowlist client component) qui ne pose le header/footer marketing que sur les routes publiques explicites. Workspace et admin ont leur propre layout avec sidebar. Empêche la fuite du chrome marketing dans l'app.

**Bibliothèques composants** :
- `components/ui/` — primitives shadcn (Button, Card, Input, Badge, DropdownMenu, EmptyState) sur Radix
- `components/admin/` — sidebar admin, stat cards, plan badges
- `components/workspace/sidebar.tsx` — sidebar app authentifiée
- `components/create/` — UI génération : reference upload, segmented control, template picker, workflow card
- `components/job/social-export-panel.tsx` — 535 lignes, exporte multi-format + metadata + publish OAuth
- `components/site-{header,footer,shell}.tsx` — chrome marketing

**Animations** : `framer-motion` utilisé sur homepage hero et pricing cards (fade-in / slide-up).

**SEO** :
- Metadata API Next.js sur chaque page (title, description, OG, Twitter)
- OG image dynamique via `app/opengraph-image.tsx` (Satori-based, runtime edge)
- Robots `index: true, follow: true` au layout root

### 2.2 Backend Next.js — API routes

**Conventions** :
- Toutes les routes utilisent `createClient` (cookies session) pour l'auth user
- Les routes qui font du write privilégié utilisent `createServiceClient` (service-role key, bypass RLS)
- Toutes retournent `NextResponse.json()` avec status codes HTTP
- Pas de catch silencieux — les erreurs remontent en logs structurés JSON

**Domaines** :
| Domaine | Routes | Rôle |
|---|---|---|
| Jobs | `/api/jobs`, `/api/jobs/[id]`, `/api/jobs/[id]/export-social`, `/api/jobs/[id]/generate-metadata`, `/api/jobs/[id]/thumbnail` | CRUD jobs + post-traitements |
| Publishing | `/api/jobs/[id]/publish/{youtube,tiktok,instagram}` | Upload vers plateformes OAuth |
| Auth social | `/api/auth/{youtube,tiktok,instagram}/{connect,callback}`, `/api/auth/social/disconnect` | OAuth flows |
| Stripe | `/api/stripe/checkout`, `/api/stripe/webhook` | Subscription + webhook idempotent |
| Admin | `/api/admin/engines/*`, `/api/admin/jobs`, `/api/admin/stats`, `/api/admin/users` | Console admin engine registry et stats |
| Cron | `/api/cron/evolink-poll` | Safety net pour jobs orphelins EvoLink |
| Webhooks | `/api/webhooks/modal` | Callback Modal quand génération finit |
| Upload | `/api/upload` | Upload direct vers Supabase Storage / R2 |

### 2.3 Middleware Next.js

`middleware.ts` :
- Matcher exclut `monitoring`, `_next/static`, `_next/image`, assets statiques
- Refresh la session Supabase via `updateSession()` sur tous les paths workspace : `/home`, `/projects`, `/create`, `/library`, `/jobs`, `/admin`
- Le reste passe sans refresh (pages marketing, login, etc.)

### 2.4 Lib utilitaire (`lib/`)

| Fichier | Rôle |
|---|---|
| `supabase/{client,server,middleware,service}.ts` | 4 contextes Supabase (browser, edge middleware, server-side authentifié, service-role bypass-RLS) |
| `evolink-client.ts` | Client REST EvoLink (video gen + LLM OpenAI-compatible). 2 entrypoints : `createEvoLinkTask` (vidéo) + `callEvoLinkLLM` (DeepSeek/Gemini/Claude) |
| `modal-client.ts` | Trigger Modal functions depuis Next.js |
| `r2.ts` | S3-compatible client pour Cloudflare R2 (upload, download-and-upload) |
| `encryption.ts` | AES-256-GCM (Node `crypto`) pour secrets engine et OAuth tokens |
| `stripe.ts` + `stripe-app-context.ts` | SDK Stripe + couche d'isolation multi-SaaS (filtre les events par app_id) |
| `engine-templates.ts` | Templates pré-built pour pré-remplir `api_config` JSONB côté admin |
| `flags.ts` | Feature flags env-based : `SHOW_COST_TRACKING_UI`, `ADMIN_EMAILS` |
| `prompt-enhancer.ts` + `prompt-templates.ts` | Enrichissement prompt via LLM |
| `social-metadata.ts` | Génération titre/hashtags/descriptions per-platform (LLM + fallback template) |
| `storyboard.ts` | Découpage multi-scene |
| `types.ts` | Types TS partagés (Job, JobPlan, EngineKey, ReferenceItem, ReferencePayload, etc.) |
| `email.ts` | Envoi transactionnel via Resend (notif "job done") |
| `blog-posts.ts` | Registry des posts blog (data-driven, pas de CMS) |
| `utils.ts` | `cn()` Tailwind merge, helpers divers |

---

## 3. Données & schéma DB

### 3.1 Projet Supabase
- **ID** : `qbrpzmuedfugbhoeytdj`
- **Nom** : AlpoGenAI MINI
- **Région** : us-east-1
- **PostgreSQL** : 17.6.1.011
- **Status** : ACTIVE_HEALTHY

### 3.2 Migrations chronologiques (24)

| Date | Migration | Domaine |
|---|---|---|
| oct 2025 | `20251002_add_notes`, `20251004_jobs_table`, `20251005_*`, `20251006_audio_extras`, `20251015_apply_missing_schema` | Schéma initial jobs + extras audio |
| oct 2025 | `20251023_create_storage_buckets`, `20251024_fix_storage_rls_policies` | Buckets `videos` + `assets` (publics, RLS auth-only upload) |
| oct 2025 | `20251026_add_audio_ambience_columns` | Audio ambient |
| mars 2026 | `20260303_add_plan_to_jobs` | Tracking du plan utilisé par job (free/pro/premium) |
| mars 2026 | `20260309_add_output_columns` | Colonnes output URL, duration |
| mars 2026 | `20260331_phase1_scenes`, `20260331_simplify_v3` | Refonte multi-scenes (table `scenes`) |
| avr 2026 | `20260402_profiles_table` | Profils user (plan, email, stripe_customer_id) |
| avr 2026 | `20260406_add_cost_tracking` | Cost per job (engine_used, cost_usd) |
| avr 2026 | `20260408_stripe_events_idempotency` | Table `stripe_events` pour idempotency |
| avr 2026 | `20260416_add_email_notifications` | Notif user quand job done |
| avr 2026 | `20260416_add_image_url` | Image URL (I2V flow) |
| avr 2026 | `20260416_create_engines_tables` | **Engine Registry DB-driven** (engines, engine_plans, engine_costs, engine_secrets) |
| avr 2026 | `20260417_add_references_payload` | **JSONB `references_payload` sur jobs (V0 multi-reference)** |
| avr 2026 | `20260417_add_social_exports` | JSONB `social_exports` sur jobs |
| avr 2026 | `20260417_create_social_connections` | OAuth tokens chiffrés YT/TikTok/IG |
| avr 2026 | `20260419_phase2_scene_chaining` | Multi-scene chaining (last frame as seed) |
| ad hoc | `add_public_read_policy.sql` | Policy lecture publique buckets |

### 3.3 Tables principales

```
profiles                  user metadata + plan (free|pro|premium) + stripe_customer_id
jobs                      generation jobs, état, scenes, plan, output_url,
                          references_payload JSONB, social_exports JSONB, cost_usd
scenes                    sous-table multi-scenes (index, status, video_url,
                          last_frame_url pour chaining)
engines                   DB-driven engine registry (id, name, type, status,
                          max_duration, gpu, clip_duration, priority, api_config)
engine_plans              jointure engine ↔ plan autorisé (free/pro/premium)
engine_costs              billing_model + per_second_usd ou per_video_usd
engine_secrets            secrets chiffrés AES-256-GCM par engine (api keys)
stripe_events             idempotency log (event_id unique)
social_connections        OAuth tokens chiffrés (access, refresh, expires_at) par plateforme
```

### 3.4 RLS — Row-Level Security
- **Active sur toutes les tables user-scoped**
- `engines`, `engine_plans`, `engine_costs` : lecture publique (anyone can read), service-role only pour write
- `engine_secrets` : service-role exclusivement (les secrets ne fuitent jamais côté client)
- `profiles`, `jobs`, `scenes`, `social_connections` : user ne voit que ses lignes (auth.uid())

### 3.5 Storage buckets
- `videos` : public, 100 MB max, MIME : `video/mp4`, `video/webm`, `video/quicktime`
- `assets` : public, 50 MB max, MIME : `audio/mpeg`, `audio/mp3`, `audio/wav`
- Policies : anyone can read, authenticated can insert
- **⚠️ Buckets publics** — pertinent pour la suite (cf. recommandation §11.3)

---

## 4. Pipeline génération vidéo — Modal

### 4.1 App Modal
- Nom : `alphogenai-v2`
- Source : `modal_app/video_pipeline.py` (2 874 lignes au total avec engines/)
- Deploy automatique via GitHub Action `deploy-modal.yml` au push sur `main` ou `claude/**` quand `modal_app/**` change

### 4.2 Images Modal (Docker layers)
- **base_image** (génération) : Debian slim · Python 3.11 · `torch==2.5.1`, `diffusers==0.37.1`, `transformers==4.51.3`, ffmpeg, sentry-sdk, cryptography, supabase, boto3, httpx
- **webhook_image** : Debian slim · fastapi, pydantic (pour le endpoint webhook qui sert de callback)
- **audio_image** : pour la fonction `generate_audio` (modèle audio séparé)

### 4.3 Fonctions Modal

| Fonction | GPU | Timeout | Rôle |
|---|---|---|---|
| `generate_clip` | A100-80GB | — | Single-clip Wan I2V (5s) |
| `generate_multi_scene` | A100-80GB | — | Orchestration multi-scenes (chain last frame) |
| `generate_audio` | A10G | 300s | Audio generation (musicgen-like) |
| `extract_last_frame` | CPU | 180s | ffmpeg extract last frame from video |
| `assemble_scenes` | CPU | 600s | Concat scenes (ffmpeg) |
| `concat_and_finalize` | CPU | 900s | Final concat + post-traitement |
| `mux_audio` | CPU | 120s | Mux audio dans video (ffmpeg) |
| `export_social_formats` | CPU | 300s | Reformat 9:16 / 1:1 / 16:9, upload 3 variants R2 |
| `generate_thumbnail` | CPU | 120s | Extract frame + optional title overlay |
| `add_watermark` | CPU | 120s | Watermark sur free tier |
| `generate_video_complete` | A100-80GB | — | Pipeline complet bout-en-bout |
| `webhook` | CPU (FastAPI) | — | Endpoint callback Modal ↔ Next.js |
| `check_volume` | CPU | 60s | Healthcheck volume models |

**Pattern** : tous décorés `@app.function(secrets=[secrets], retries=0)`. Retries=0 délégué à notre state machine (claims atomiques en DB, re-trigger via cron poller).

### 4.4 Engine architecture (`modal_app/engines/`)

```
engines/
├── base.py             abstract BaseEngine class
├── registry.py         DB-driven engine lookup (cache en mémoire)
├── router.py           select_engine(plan, duration, preferred, references)
├── reference_mapper.py build_engine_references(refs, engine_key) → engine-specific dict
├── wan.py              Wan I2V Modal-local (volume models)
├── seedance.py         Kie.ai API client (legacy path)
└── generic_api.py      Generic REST API engine (utilisé pour EvoLink via api_config DB)
```

**Stratégie engines** (alignée avec décision CTO du 2026-05-11) :
- **EvoLink** (provider principal) : modèles fermés multi-reference / multi-scene (Wan 2.6, Wan 2.7, Happy Horse 1.0, etc.)
- **Modal/Wan local** : fallback stable, free tier
- **Kie.ai direct** : conservé (legacy path), pas la cible du nouveau V1

### 4.5 Volumes Modal
- `models_volume` mounté à `/models` : poids Wan I2V pré-téléchargés via `setup_models.py` (évite cold start massif)

### 4.6 Webhook Modal → Next.js
- Modal `webhook()` function (FastAPI) reçoit les callbacks
- Notifie Next.js `/api/webhooks/modal` qui update Supabase (job done/failed)
- En parallèle : cron `evolink-poll` toutes les 5 min comme safety net pour EvoLink (qui n'a pas de webhook fiable)

---

## 5. Intégrations tiers (services connectés)

| Service | Rôle | Connexion |
|---|---|---|
| **Vercel** | Hosting frontend + edge functions | Auto-deploy `main` → prod |
| **Supabase** (`qbrpzmuedfugbhoeytdj`) | Auth, Postgres, Storage, Realtime | SDK SSR + service-role |
| **Modal** | GPU serverless inference | Token id/secret stored in GitHub Actions secrets, deploys via CLI |
| **Cloudflare R2** | Asset storage (videos, images) | S3-compatible API via `@aws-sdk/client-s3` |
| **EvoLink** | Video gen + LLM gateway (DeepSeek, Gemini, Claude) | Bearer token, REST `https://api.evolink.ai/v1` |
| **Kie.ai** | Seedance direct (legacy) | Bearer token, REST |
| **Alibaba Cloud Bailian** | Frontier video models (Wan 2.6, 2.7, Happy Horse) — annoncé dans `/technology`, accès via EvoLink | Pending Catalyst Program approval |
| **Stripe** | Subscription billing + Checkout | SDK + webhook idempotent |
| **Resend** | Transactional email (notif job done) | SDK |
| **Sentry** | Error tracking + tunneling | `@sentry/nextjs` v10, tunnel `/monitoring` |
| **YouTube Data API v3** | Upload videos | OAuth 2.0, token chiffré AES-256-GCM |
| **TikTok Content Posting API** | Upload videos (FILE_UPLOAD method) | OAuth 2.0, token chiffré |
| **Instagram Graph API** | Publish Reels | OAuth 2.0 via Meta, token chiffré |
| **GitHub Actions** | CI/CD (Modal deploy + cron safety net) | Repo secrets : `MODAL_TOKEN_ID/SECRET`, `CRON_SECRET` |

---

## 6. CI/CD & déploiement

### 6.1 Workflows GitHub Actions
| Workflow | Trigger | Rôle |
|---|---|---|
| `deploy-modal.yml` | Push `main`/`claude/**` quand `modal_app/**` change | Deploy Modal pipeline |
| `evolink-cron.yml` | Cron `*/5 * * * *` + `workflow_dispatch` | Ping `/api/cron/evolink-poll` (safety net jobs orphelins) |

### 6.2 Vercel
- Connecté au repo GitHub (`alpahoo/alphogenai-mini`)
- Auto-deploy `main` → production (`www.alphogen.com`)
- Preview deploys sur branches feature
- Env vars gérées dans dashboard Vercel (Production / Preview / Development)
- Sentry intégré via `withSentryConfig` (`next.config.ts`)
- Concurrency safe : aucun deploy ne casse les jobs en cours (Vercel atomic deploys + stateless functions)

### 6.3 Configuration Next.js notable
`next.config.ts` :
- `images.formats: ["image/avif", "image/webp"]`
- `transpilePackages: ["lucide-react"]` (pour le tree-shaking icons)
- `eslint.ignoreDuringBuilds: true` — **⚠️ flag**
- `typescript.ignoreBuildErrors: true` — **⚠️ flag** (cf. §11.1)
- `withSentryConfig` : tunnelRoute `/monitoring`, source maps cachées, widenClientFileUpload activé

---

## 7. Sécurité

### 7.1 Auth
- Supabase Auth (email/password + magic link)
- Cookies HTTP-only managed par `@supabase/ssr`
- Middleware refresh la session sur paths workspace
- Admin gate : email allowlist via `ADMIN_EMAILS` env var → helper `isAdminEmail()` dans `lib/flags.ts`

### 7.2 RLS
- Active sur toutes les tables sensibles
- Service-role client utilisé uniquement côté server pour les writes privilégiés (admin, webhooks, cron, Modal callbacks)

### 7.3 Encryption
- `lib/encryption.ts` : AES-256-GCM (Node built-in `crypto`, pas de dep externe)
- Clé 256-bit lue de `ENGINE_SECRETS_KEY` env (64 hex chars)
- IV 12 bytes (standard GCM)
- Auth tag stocké séparément
- **Utilisé pour** :
  - `engine_secrets.secret_value_encrypted` (API keys de chaque engine)
  - `social_connections.access_token` + `refresh_token` (OAuth YT/TikTok/IG)

### 7.4 Stripe
- Webhook signature validée HMAC à l'arrivée
- Idempotency via table `stripe_events` (PK = event.id, vérif `maybeSingle()` avant traitement)
- Multi-SaaS isolation via `lib/stripe-app-context.ts` qui filtre les events par `app_id` (évite cross-contamination entre projets sur le même compte Stripe)
- Logs structurés JSON (`event.ignored`, `event.duplicate`, `event.processed`)

### 7.5 Plan gate engine (server-side)
- `POST /api/jobs` valide `preferred_engine` côté server après résolution du plan utilisateur (jamais trust client)
- Free user qui envoie `preferred_engine: "seedance"` → rejeté (engine non autorisé pour free plan)
- ✅ Confirmé dans le code : commentaire `engine plan gate (server-side)` + `Verify the requested engine is allowed for the user's plan`

### 7.6 Cron auth
- GitHub Actions ping `/api/cron/evolink-poll` avec `Authorization: Bearer $CRON_SECRET`
- Route valide le header contre `process.env.CRON_SECRET`
- **⚠️ Note défensive** : si `CRON_SECRET` env est unset côté Vercel, le check `if (secret && auth !== ...)` ne déclenche pas → la route est ouverte. À vérifier régulièrement que la variable est bien set en prod.

### 7.7 Audit récent
- Aucun PAT Supabase (`sbp_*`) consommé par AlphoGenAI MINI
- GitHub Actions n'utilise que `MODAL_TOKEN_ID/SECRET` + `CRON_SECRET`
- Token Vercel `claude-emergency-deploy` révoqué
- `CRON_SECRET` en sync entre Vercel env et GitHub Actions secret (workflow vert)

---

## 8. Observabilité

### 8.1 Sentry
- `@sentry/nextjs` v10
- Tunnel route `/monitoring` (bypass ad-blockers)
- Source maps cachées en prod
- Capture côté Next.js (client + server) + côté Modal (`sentry-sdk` dans base_image)

### 8.2 Logs structurés
- Format JSON sur les routes critiques (Stripe webhook : `event`, `event_id`, `event_type`, `action`, `reason`)
- Console logs Vercel persistés selon plan
- Pas de log aggregator externe (Datadog/Loki) à ce jour

### 8.3 Métriques
- Cost tracking en DB (`jobs.cost_usd`, `jobs.engine_used`)
- Admin dashboard `app/(admin)/admin/page.tsx` avec recharts (cost per day, top engines, etc.)
- Pas de Prometheus / Grafana

---

## 9. Travail terminé récemment (~2 dernières semaines)

### 9.1 Pipeline vidéo
- ✅ **Multi-scene chaining Option B** : extraction last-frame d'une scène comme `first_frame_url` de la suivante. State machine atomique avec claims race-safe. Retry per-scene sans perdre les scènes précédentes. Validé end-to-end (3 scènes Mars, 26m31s).
- ✅ **Fix Seedance I2V payload** : EvoLink Seedance attend `image_urls: [url]` (array), pas `first_frame_url: url`. Patch envoie les deux pour router correctement.

### 9.2 Surface marketing (pour candidature Alibaba Cloud Catalyst Program)
- ✅ `/about` refondu (hero pattern unifié + Wan 2.6/2.7/Happy Horse narrative)
- ✅ `/technology` créé (8 sections, ~370 lignes — pièce maîtresse de la candidature)
- ✅ `/privacy` + `/terms` réécrits (GDPR officiel, Alibaba Cloud Bailian mention, email `ai@alphogen.com`)
- ✅ `/blog` index + 2 articles engineering réels (multi-scene chaining, GPU pipeline) — gardés mais retirés de la nav
- ✅ Footer 3 colonnes + Made in France 🇫🇷
- ✅ Header nav : About / Technology / Pricing / Create
- ✅ **OG image dynamique** (`app/opengraph-image.tsx`) — remplace l'ancien template Supabase Starter Kit qui s'affichait par défaut quand on partageait `alphogen.com` (bug branding critique fixé avant la candidature)
- ✅ Metadata complète (titles, OG, Twitter cards) par page

### 9.3 Hygiène sécurité
- ✅ Audit Supabase PAT clean
- ✅ `CRON_SECRET` resync Vercel ↔ GitHub Actions, workflow vert
- ✅ Token Vercel `claude-emergency-deploy` révoqué

### 9.4 Candidature soumise
- ✅ Application Alibaba Cloud AI Catalyst Program envoyée (verdict en attente — reviewer Jade)

---

## 10. Travail en cours

### 10.1 Multi-Reference Generation V1 (priorité CTO #1)
- **Brief reçu** : 11 mai 2026
- **Statut** : audit + plan d'implémentation à produire
- **Décisions clés actées avec CTO** :
  - Cible prioritaire : **couche EvoLink** (pas Kie.ai direct)
  - **Migration additive V0 → V1**, pas remplacement
    - Garder JSONB `references_payload` sur `jobs` (backward compat)
    - Ajouter table relationnelle `job_references` (id, job_id, role, url, mime_type, weight, created_at)
    - Phase A : dual-read (table prioritaire, fallback JSONB)
    - Phase B : dual-write (nouveaux jobs)
    - Phase C : cutover read-only-table (session ultérieure)
  - **Signed URLs** : TTL 6h (pas 1h), storage path comme source de vérité, signed URL régénérée juste avant appel provider
  - **MIME validation** : lib éprouvée (`file-type`) plutôt que sniffing maison
  - **UX free-tier** : helper discret "References are best used with Pro engines", **server-side gate doit empêcher free user de forcer engine premium** (déjà en place, confirmé §7.5)
  - **Tests** : pas de Playwright maintenant, checklist manuelle + tests unitaires/API si présents
- **Nuances à intégrer dans l'audit** :
  - Role enum : superset additif (4 V0 + 2 nouveaux), pas de breaking change
  - Modal doit avoir un helper `sign_reference_url(storage_path, ttl=6h)` côté Python
  - Stratégie dual-write activée dès Phase A (sinon table décorative)

---

## 11. Travail restant & dette technique

### 11.1 Dette technique non-bloquante (à nettoyer)
**8 erreurs TypeScript préexistantes**, papered over par `typescript.ignoreBuildErrors: true` dans `next.config.ts` :
- `app/(admin)/admin/page.tsx` : 2 erreurs Recharts `Formatter` (type `ValueType | undefined` vs `number`)
- `app/(workspace)/home/page.tsx` : 1 erreur `Link.href` undefined possible
- `app/api/admin/engines/route.ts` : 1 erreur `[0]` sur `any[] | null`
- `app/jobs/[id]/page.tsx` : 1 erreur cast `Job` → `Record<string, unknown>`
- `lib/stripe-app-context.ts` + `lib/stripe.ts` : 2 erreurs version API Stripe (`2025-03-31.basil` vs SDK attendu `2026-03-25.dahlia`)
- `next.config.ts` : 1 erreur `hideSourceMaps` deprecated dans Sentry SDK v10

**Reco** : sprint dédié de ~2 h pour cleaner, et **retirer `ignoreBuildErrors: true`** une fois corrigé. Le flag actuel masque les futures régressions TS.

### 11.2 Schéma DB désaligné
- Table `engines` seed initial liste `("wan_i2v", "Wan 2.2 I2V", ...)` et `("seedance", "Seedance 2.0", ...)`
- Marketing narrative `/technology` annonce **Wan 2.6, Wan 2.7, Happy Horse 1.0**
- **Divergence** entre la DB et la communication publique
- **Reco** : migration `INSERT` pour ajouter les nouveaux engines (Wan 2.6, Wan 2.7, Happy Horse 1.0) avec leur `api_config` EvoLink, et `UPDATE` du label Wan 2.2 → Wan 2.6 OU déprécier l'ancien et créer un nouveau row

### 11.3 Storage buckets publics
- Buckets `videos` et `assets` sont `public: true`
- Toute URL R2/Supabase Storage est devinable / leak-able
- Pour les vidéos générées : pas dramatique (déjà publiées sur le profil user)
- Pour les **references uploadées** (V1) : **inacceptable** — données utilisateur sensibles potentielles
- **Reco** : créer un bucket privé `references` séparé avec signed URLs (TTL 6h per décision CTO). Aligné avec le brief V1.

### 11.4 Couverture de tests
- 1 test Python (`tests/test_seedance_routing.py`)
- **0 test TypeScript** (frontend + API routes non testés)
- **Reco moyen-terme** : framework de tests API minimaliste (vitest + supertest) sans aller jusqu'à Playwright. Cible prioritaire : `POST /api/jobs` (engine plan gate), `POST /api/stripe/webhook` (idempotency), `POST /api/jobs/[id]/export-social` (gate Pro/Premium).

### 11.5 Configuration Stripe API version
- `lib/stripe.ts` fixe version à `2025-03-31.basil`
- SDK actuel pointe `2026-03-25.dahlia`
- Pas d'incident à date mais drift à terme
- **Reco** : update version + relire les release notes Stripe pour breaking changes

### 11.6 Decisions ouvertes (à arbitrer)
1. **Routes `/blog`** : posts engineering réels mais retirés de la nav (anti-pattern listé pour candidature Alibaba). Garder en silencieux ou supprimer ?
2. **OG image per-page** : OG global identique partout. Vaut-il un OG dédié pour `/technology` (10 min de code) ?
3. **Workspace `/create`** : intentionnellement sans footer marketing (sidebar `h-screen`). Confirmer.

### 11.7 Backlog produit (post-Catalyst Program)
- Reference-driven multi-scene (pin character image au début, propager via chaining)
- Dashboard admin enrichi : cost per generation × engine, taux de succès × tier, latency P50/P95
- Rate limiting per-user en plus du plan-based
- Audit log RGPD : qui a accédé à quel job
- Suppression compte user en self-service (RGPD article 17)

---

## 12. Recommandations architecturales (le point précieux)

### 12.1 Priorité haute (sous 2 semaines)

**R1. Bucket `references` privé + signed URLs (sécurité + alignement V1)**
- Créer bucket Supabase Storage `references` avec `public: false`
- Policies : user authenticated peut INSERT, SELECT seulement sur ses propres files
- Helper TS `signReferenceUrl(path, ttl=6h)` dans `lib/supabase/storage.ts`
- Helper Python `sign_reference_url(path, ttl=6h)` dans `modal_app/utils/storage.py`
- Toutes les references existantes (V0) : migration one-shot pour les déplacer vers ce bucket (additif, gardé le JSONB intact)

**R2. Engine registry refresh (alignement DB ↔ marketing)**
- Migration `20260520_add_evolink_engines.sql` :
  - INSERT Wan 2.6, Wan 2.7, Happy Horse 1.0 avec leur `api_config` EvoLink
  - Définir leur `engine_plans` (Wan 2.6 = pro+premium, Happy Horse = premium-only)
  - Définir leur `engine_costs` (à confirmer avec EvoLink pricing)
- Garder Wan 2.2 actif comme fallback explicite
- Régler le routeur Modal pour préférer EvoLink quand applicable selon priority

**R3. Cleanup dette TypeScript + retirer `ignoreBuildErrors`**
- Sprint focus 2h pour corriger les 8 erreurs
- Retirer `typescript.ignoreBuildErrors: true` et `eslint.ignoreDuringBuilds: true` de `next.config.ts`
- Mettre `pre-push` hook (lint-staged ou husky) qui bloque les commits avec erreurs TS

### 12.2 Priorité moyenne (sous 1 mois)

**R4. Tests API minimalistes**
- Setup `vitest` + `supertest` (~20 LOC config)
- Premiers tests cibles :
  1. `POST /api/jobs` — engine plan gate (free user ne peut pas demander seedance)
  2. `POST /api/stripe/webhook` — idempotency (event_id dupliqué = ignored)
  3. `POST /api/jobs/[id]/export-social` — pro/premium gate
  4. `GET /api/cron/evolink-poll` — auth Bearer
- Pas de Playwright, pas de e2e — focus API uniquement

**R5. Observabilité enrichie**
- Ajouter logs structurés JSON sur toutes les routes critiques (pattern Stripe webhook déjà bon)
- Sentry breadcrumbs sur les transitions d'état job (`queued → in_progress → done/failed`)
- Métriques custom Vercel ou Sentry sur cost-per-job

**R6. Rate limiting**
- Aujourd'hui : seulement plan-based (free = 1 video/jour)
- Recommandé : rate limit per-IP en plus (anti-abuse), via Upstash Redis ou Cloudflare Rate Limiting (gratuit sur leur plan)

### 12.3 Priorité basse / opportunités

**R7. Provider abstraction layer (préparer multi-cloud futur)**
- Aujourd'hui : EvoLink est hardcoded dans `lib/evolink-client.ts`
- Si demain on veut tester Alibaba Bailian directement (sans passer par EvoLink), il faudrait un layer `lib/providers/{evolink,bailian,kie}.ts` avec interface commune
- Pas urgent mais conditionne la flexibilité de routing futur

**R8. Workspace UX : footer minimal sur `/create`**
- Aujourd'hui `/create` est full-screen workspace sans footer
- Reviewers / nouveaux users perdent le repère navigation
- Solution : footer micro (1 ligne, juste copyright + links) qui ne casse pas le sidebar `h-screen`

**R9. Branded favicon vérification**
- `app/favicon.ico` est multi-res 16+32 32-bit. Non inspecté visuellement (binaire).
- `public/app-icon.png` est brandé (étoile 4-points violet/indigo)
- À vérifier : l'onglet navigateur sur `alphogen.com` affiche-t-il bien le brand ? Sinon générer un favicon depuis `app-icon.png`.

**R10. Documentation engineering**
- Le repo n'a pas de `README.md` détaillé pour onboarder un nouveau dev
- Le pipeline Modal complet mériterait un `docs/PIPELINE.md` avec diagramme d'état
- Stratégie engine router mériterait un `docs/ENGINES.md`

### 12.4 Garde-fous à maintenir (ne PAS faire)

- ❌ Ne pas refactor le code stable (Wan I2V Modal, Stripe webhook, multi-scene chaining) tant qu'il marche
- ❌ Ne pas remplacer EvoLink par autre chose tant qu'il est en évaluation Catalyst
- ❌ Ne pas introduire d'ORM (Prisma, Drizzle) — `@supabase/supabase-js` couvre nos besoins, ajouter une couche serait du yak shaving
- ❌ Ne pas migrer vers Modal v2 si v1 fonctionne (rester sur l'app `alphogenai-v2` actuelle)
- ❌ Ne pas ajouter d'analytics tiers (PostHog, Mixpanel) tant que les events critiques ne sont pas définis — on accumulerait de la donnée sans question business derrière

---

## 13. Risques identifiés

| Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|
| EvoLink down ou tarif changeant | Moyen | Élevé (notre pipeline principal) | Fallback Wan Modal actif, surveillance manuelle. Mid-terme : provider abstraction R7 |
| Bailian Frankfurt approbation retardée | Moyen | Faible (on continue avec EvoLink) | Aucune dépendance bloquante à date |
| TS errors masquées (ignoreBuildErrors) deviennent bugs prod | Moyen | Moyen | R3 cleanup + remove flag |
| Storage public bucket = data leak | Faible | Élevé (refs V1) | R1 bucket privé + signed URLs |
| Stripe API version drift | Faible | Moyen | Update version + tests R4 |
| Cron `CRON_SECRET` env mal set → cron ouvert au public | Faible | Élevé | Monitoring workflow vert + alert si rouge 2x consécutif |
| GitHub Actions runner indisponible | Très faible | Faible (cron retardé max 10-30 min, déjà documenté) | RAS |
| Modal cold start sur new GPU type | Faible | Faible (warm pools déjà actifs) | RAS |

---

## 14. Métriques opérationnelles à suivre

À mettre en place dans le dashboard admin (priorité moyenne) :

- **Cost per generation × engine** (déjà tracké en DB, viz manquante par engine)
- **Taux de succès × engine** (jobs done / jobs total)
- **Latency P50/P95** par engine et par durée demandée
- **Conversion free → paid** (event `stripe.subscription.created` / signups)
- **Churn mensuel** (`stripe.subscription.deleted`)
- **Cron health** (last successful run, error rate)

---

## 15. Synthèse pour appréciation CTO

### Points forts du système actuel
1. Architecture **modulaire** : engines DB-driven, multi-providers, fallback policies claires
2. **Sécurité** : RLS partout, AES-256-GCM sur secrets, plan gate server-side, Stripe idempotency
3. **Modal** discipline : retries=0 délégué à state machine, claims atomiques, cron safety net
4. **Pas d'over-engineering** : pas d'ORM, pas de microservices, pas de event bus — juste ce qu'il faut
5. **Marketing surface crédible** : `/technology` aligne le code et la narrative, OG image brandée

### Points d'attention immédiate
1. **R1 (bucket privé refs)** + **R2 (engines DB refresh)** — alignement sécurité + narrative
2. **R3 (cleanup TS)** — discipline qualité, retire le filet de protection actuel
3. **Multi-Reference V1** brief CTO en cours → audit à produire selon décisions actées

### Discussion ouverte avec CTO
- Stratégie de tests : on accepte la dette zéro test TS jusqu'à quand ?
- Provider abstraction R7 : on attend la signature Catalyst pour décider, ou on prépare maintenant ?
- Engine registry : qui gère le pricing EvoLink/Bailian dans `engine_costs` ? Founder ? Workflow admin ?

---

## Annexes — Liens techniques

- **Production** : https://www.alphogen.com
- **Repo** : https://github.com/alpahoo/alphogenai-mini
- **Vercel** : https://vercel.com/team_kq6trybfphjjykfalqxgdpi2/alphogenai-mini
- **Supabase** : https://supabase.com/dashboard/project/qbrpzmuedfugbhoeytdj
- **Modal app** : `alphogenai-v2` (CLI : `python -m modal app logs alphogenai-v2`)
- **GitHub Actions** : https://github.com/alpahoo/alphogenai-mini/actions
- **Briefing exec summary** : `docs/CTO_BRIEFING_2026-05-11.md`
- **Contact** : ai@alphogen.com

---

*Document généré le 2026-05-11 — version technique deep dive. À actualiser après réponse Catalyst Program + après audit V1 multi-reference.*
