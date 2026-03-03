# CLAUDE.md — AlphoGenAI Mini

Guide de développement pour les agents IA travaillant sur ce projet.

## Présentation

**AlphoGenAI Mini** est la version simplifiée et nettoyée de la plateforme SaaS de génération vidéo IA.
- **Repo :** `alpahoo/alphogenai-mini`
- **Branche active :** `claude/explain-codebase-mlo3psd6vkzqfy4g-qLLUZ`
- Ce repo contient le pipeline Modal intégré et le frontend simplifié.

---

## Stack technique

| Couche | Technologie |
|--------|-------------|
| Frontend | Next.js (App Router) + TypeScript |
| UI | Tailwind CSS + Radix UI + shadcn/ui + Framer Motion |
| Auth + DB | Supabase (Auth, PostgreSQL, Storage) |
| GPU Inference | Modal (`modal_app/video_pipeline.py`) |
| Workers Python | `workers/` — audio, ffmpeg, music, SVI client |
| Modèles vidéo | Long Video Infinity (LVI), Seedance 2.0 |
| Job Queue | Inngest |
| Stockage vidéo | Cloudflare R2 (S3-compatible) |
| Déploiement | Vercel (frontend) + Modal (GPU) |
| Monitoring | Sentry |
| Paiements | Stripe |

---

## Structure du projet

```
alphogenai-mini/
├── app/                        # Next.js App Router
│   ├── api/                    # API Routes Next.js
│   ├── features/               # Pages par feature
│   ├── generate/               # Page génération vidéo
│   ├── jobs/                   # Page suivi des jobs
│   ├── layout.tsx
│   └── page.tsx
├── components/                 # Composants UI réutilisables (shadcn/ui)
├── lib/
│   ├── supabase/               # Clients Supabase (client + server)
│   ├── types.ts                # Types TypeScript globaux
│   └── utils.ts                # Utilitaires
├── modal_app/
│   └── video_pipeline.py       # Pipeline GPU Modal (inférence vidéo)
├── workers/                    # Workers Python
│   ├── worker.py               # Worker principal
│   ├── audio_orchestrator.py   # Orchestration audio
│   ├── ffmpeg_assembler.py     # Assemblage vidéo final
│   ├── music_selector.py       # Sélection musicale
│   ├── svi_client.py           # Client SVI (Stable Video Infinity)
│   ├── supabase_client.py      # Client Supabase Python
│   ├── budget_guard.py         # Garde coût GPU
│   ├── config.py               # Configuration
│   └── requirements.txt        # Dépendances Python
├── supabase/
│   └── migrations/             # Migrations SQL Supabase
├── middleware.ts               # Auth middleware Next.js
├── .env.example                # Template variables d'environnement
└── Dockerfile.worker           # Docker pour le worker Python
```

---

## Variables d'environnement

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon_key>
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>      # server-side uniquement ⚠️

# Modal (GPU pipeline)
MODAL_TOKEN_ID=ak-<id>
MODAL_TOKEN_SECRET=as-<secret>
MODAL_WEBHOOK_SECRET=<webhook_secret>
MODAL_WEBHOOK_URL=https://<user>--alphogenai-v2-webhook.modal.run

# Cloudflare R2
CLOUDFLARE_ACCOUNT_ID=<account_id>
R2_ACCESS_KEY_ID=<access_key>
R2_SECRET_ACCESS_KEY=<secret_key>
R2_BUCKET_NAME=alphogenai-assets
R2_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
R2_PUBLIC_URL=<public_url>

# Inngest
INNGEST_EVENT_KEY=<event_key>
INNGEST_SIGNING_KEY=signkey-prod-<key>

# Stripe
STRIPE_SECRET_KEY=sk_live_<key>
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_<key>
STRIPE_WEBHOOK_SECRET=whsec_<key>

# Vidéo (optionnel)
VIDEO_DURATION_SEC=8
VIDEO_FPS=24
VIDEO_RESOLUTION=1280x720
```

---

## Commandes essentielles

```bash
# Dev
npm run dev

# Build & vérifs
npm run build
npm run lint

# Modal — déployer le pipeline GPU
modal deploy modal_app/video_pipeline.py

# Worker Python (local)
cd workers && pip install -r requirements.txt
python worker.py

# Worker Docker
docker build -f Dockerfile.worker -t alphogenai-worker .
docker run --env-file .env alphogenai-worker
```

---

## Architecture du pipeline vidéo

```
Utilisateur (frontend)
    │
    ▼
Next.js API Route  ──► Inngest event (job créé)
    │
    ▼
Inngest Function
    │
    ▼
Modal (video_pipeline.py)  ──► LVI / Seedance 2.0
    │
    ▼
workers/ (ffmpeg_assembler.py + audio_orchestrator.py)
    │
    ▼
Cloudflare R2  (stockage vidéo finale)
    │
    ▼
Supabase (update statut job + URL vidéo)
    │
    ▼
Frontend (polling ou realtime Supabase)
```

---

## Conventions de code

### TypeScript / Next.js
- TypeScript strict — pas de `any` implicite
- Composants fonctionnels uniquement
- Server Components par défaut, `"use client"` seulement si nécessaire
- Validation des inputs API avec zod
- Erreurs structurées : `{ error: string, code: string }`

### Python (workers + Modal)
- Python 3.10+
- Type hints obligatoires
- Gestion d'erreurs explicite avec logging (pas de `print` en prod)
- Variables d'environnement via `config.py`, jamais hardcodées

### Base de données
- Migrations dans `supabase/migrations/`
- RLS (Row Level Security) activé sur toutes les tables
- `SUPABASE_SERVICE_ROLE_KEY` côté serveur uniquement

---

## Règles importantes

### Sécurité
- `SUPABASE_SERVICE_ROLE_KEY` → **jamais côté client**
- `MODAL_WEBHOOK_SECRET` → valider la signature de chaque webhook Modal
- Ne jamais logger de secrets ou tokens

### Jobs GPU
- Les appels Modal se font **uniquement depuis le backend** (API Routes ou workers)
- Pas d'appels directs depuis le frontend
- `budget_guard.py` limite le coût GPU par job — ne pas contourner

### Cloudflare R2
- Utiliser le SDK AWS S3 avec l'endpoint R2 configuré
- Pre-signed URLs pour les accès en lecture publique
- Bucket : `alphogenai-assets`

### Commits
- Format : `feat:`, `fix:`, `chore:`, `docs:`
- Branche active : `claude/explain-codebase-mlo3psd6vkzqfy4g-qLLUZ`

---

## Modèles vidéo

### Long Video Infinity (LVI / SVI)
- Stable Video Infinity — génération de vidéos longues
- Client : `workers/svi_client.py`

### Seedance 2.0
- Inférence via Modal

> Toute nouvelle intégration de modèle se fait dans `modal_app/video_pipeline.py` ou un fichier Modal dédié.
