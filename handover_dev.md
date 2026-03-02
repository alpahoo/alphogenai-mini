# Handover développeur — AlphoGenAI Mini (état actuel)

Ce document est la **source unique** pour reprendre le projet sans doublons.

## 1) Résumé produit

AlphoGenAI Mini est un **SaaS de génération vidéo** à partir d’un prompt utilisateur, avec:
- création et suivi de jobs,
- génération vidéo via backend unique **Modal** (prod),
- **MockBackend** par défaut en local/CI (mp4 dummy 1s + upload Supabase),
- stockage (Supabase Storage, bucket `generated` public read),
- cache par prompt (SHA-256) pour éviter de régénérer.

## 2) Sources de vérité (à lire en premier)

- `STATUS.txt` — **source de vérité** sur le pipeline actuel
- `README.md` — vue d’ensemble + quick start
- `QUICK_START.md` — démarrage local
- `MODEL_UPGRADES.md` — stratégie pour upgrader les modèles sans casser l’app

> Beaucoup de `.md` historiques (Qwen/WAN/Pika/ElevenLabs/Remotion/Replicate/Runway) sont **ARCHIVED / LEGACY**. Ils existent pour l’historique mais ne doivent pas guider les décisions.

## 3) Architecture (runtime)

### Composants
- **Frontend**: Next.js App Router
- **API Next.js**: création/lecture de jobs (auth Supabase)
- **DB**: Supabase Postgres (tables `jobs`, `video_cache`)
- **Storage**: Supabase Storage (bucket `generated` par défaut)
- **Worker**: Python (polling `jobs.status=pending`, orchestration)
- **Backends IA externes (HTTP)**:
  - **Vidéo**: Modal via `MODAL_VIDEO_ENDPOINT_URL`

### Schéma de flux (canonique)
1. UI: `GET /generate` → `POST /api/jobs` (auth requise) → retourne `jobId`
2. UI: `GET /jobs/[id]` → polling `GET /api/jobs/[id]`
3. Worker:
   - cache lookup (`video_cache` via hash stable prompt+params)
   - sinon: Modal (ou Mock) → update `jobs`

Routes legacy conservées:
- `GET /creator/generate` → redirection vers `/generate`
- `GET /v/[id]` → redirection vers `/jobs/[id]`

## 4) API applicative (Next.js)

### `POST /api/jobs`
- **Auth**: oui (Supabase)
- **Body**: `{ prompt, duration_sec?, resolution?, fps?, seed? }`
- **Effet**: insert job `pending` dans `jobs`, paramètres stockés dans `jobs.app_state`.

### `GET /api/jobs/[id]`
- **Auth**: oui (Supabase)
- **Retour**: job (status, current_stage, urls, erreurs, app_state…).

> Note: il existe aussi une ancienne route `app/api/generate-video/route.ts` (historique). Le flow canonique est `POST /api/jobs` + `GET /api/jobs/[id]`.

## 5) Worker Python (pipeline exécuté)

Fichier principal: `workers/worker.py`

### Pipeline
1. passe job en `in_progress` (`current_stage=starting`)
2. **cache**: `video_cache` (SHA-256 du prompt)
   - si HIT → job `done` immédiat (final = cached)
3. génération vidéo:
   - appel backend via `workers/video_backend` (Modal ou Mock) → retourne une URL mp4 publique
4. update Supabase:
   - `output_url_final`, `final_url`
5. sauvegarde cache:
   - `video_cache.video_url = output_url_final`

## 6) Backend vidéo (Modal)

Dossier: `services/video_modal/`

Endpoints importants:
- `GET /healthz`
- `POST /generate_film` → `{ "video_url": "https://.../file.mp4" }`

## 7) Base de données (Supabase)

Migrations à appliquer:
- `supabase/migrations/20251004_jobs_table.sql`
- `supabase/migrations/20260106_create_generated_bucket.sql`

### Table `jobs` (champs clés)
- `status`: `pending | in_progress | done | failed | cancelled`
- `current_stage`: ex `starting`, `video_generated`, `completed`
- `app_state`: paramètres & traces (JSONB)
- `video_url`: URL vidéo générée (source)
- `output_url_final`: URL finale mp4 (publique)
- `final_url`: alias historique (souvent = `output_url_final`)

### Table `video_cache`
- `prompt_hash`: SHA-256(JSON stable: prompt + duration_sec + fps + resolution + seed)
- `video_url`: URL finale mise en cache
- `metadata`: infos (durée, fps, etc.)

## 8) Variables d’environnement (minimum)

Voir `.env.example` pour la liste complète.

Minimum:
```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=... # ou SUPABASE_SERVICE_KEY

SUPABASE_BUCKET=generated
VIDEO_BACKEND=mock
# En prod:
# VIDEO_BACKEND=modal
# MODAL_VIDEO_ENDPOINT_URL=https://...
```

## 9) Déploiement (vision pratique)

- **Next.js**: Vercel (recommandé) ou autre hébergeur Node
- **Worker**: un service Python long-running (Render/Railway/VM/Docker) qui exécute `python -m workers.worker`
- **Backend vidéo**: Modal (serverless GPU) via `services/video_modal/`
- **Supabase**: DB + Storage

## 10) Stratégie “modèles plus récents” (important)

Objectif: upgrader les modèles sans casser l’app.
- Conserver **le contrat HTTP** du backend vidéo (Modal): `POST /generate_film` → `{ video_url }`
- Conserver **les champs DB** (notamment `output_url_final` + cache)

Détails: `MODEL_UPGRADES.md`.

---

## Plan de reprise (10 étapes, sans doublons)

1. **Lire `STATUS.txt` + `MODEL_UPGRADES.md`** pour comprendre le pipeline canonique et la stratégie d’upgrade.
2. **Vérifier Supabase**: migrations appliquées (jobs + generated bucket), bucket `generated` présent et public read, RLS OK.
3. **Vérifier env**: `.env.local` complet (notamment `VIDEO_BACKEND`, `MODAL_VIDEO_ENDPOINT_URL` si prod, service role key).
4. **Démarrer local**: `npm run dev` + worker (`python -m workers.worker`) et créer un job via `/generate`.
5. **Valider le job**: suivre `/jobs/[id]`, vérifier `jobs.output_url_final` rempli et jouable.
6. **Valider cache**: relancer le même prompt, vérifier que le job passe rapidement en `done` (HIT).
7. **Normaliser les “stages”**: définir une liste stable de `current_stage` (ex: `starting`, `video_generating`, `video_generated`, `completed`, `failed`) et l’appliquer UI + worker.
8. **Décider de la compat API**: soit déprécier/supprimer `/api/generate-video`, soit la faire pointer vers `/api/jobs` (compat).
9. **Observabilité**: logs structurés côté worker + timeouts; optionnel: Sentry/metrics; alerte budget si activée.
10. **Upgrade modèles**: remplacer le modèle **derrière Modal** en conservant le contrat `{ video_url }`; tester; ajuster cache (prompt+params) si nécessaire.

