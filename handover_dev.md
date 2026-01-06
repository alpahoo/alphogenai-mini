# Handover développeur — AlphoGenAI Mini (état actuel)

Ce document est la **source unique** pour reprendre le projet sans doublons.

## 1) Résumé produit

AlphoGenAI Mini est un **SaaS de génération vidéo** à partir d’un prompt utilisateur, avec:
- création et suivi de jobs,
- génération vidéo via backend GPU (SVI),
- génération audio (AudioLDM2 + CLAP, Diff-Foley optionnel),
- **mix audio/vidéo** avec normalisation (-16 LUFS),
- stockage (Supabase Storage, R2 optionnel côté service audio),
- cache par prompt (SHA-256) pour éviter de régénérer.

## 2) Sources de vérité (à lire en premier)

- `STATUS.txt` — **source de vérité** sur le pipeline actuel
- `README.md` — vue d’ensemble + quick start
- `QUICK_START.md` — démarrage local
- `AUDIO_AMBIENCE_README.md` — détails module audio
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
  - **Vidéo**: SVI via `SVI_ENDPOINT_URL`
  - **Audio + mix**: audio-service via `AUDIO_BACKEND_URL`

### Schéma de flux (canonique)
1. UI: `GET /generate` → `POST /api/jobs` (auth requise) → retourne `jobId`
2. UI: `GET /jobs/[id]` → polling `GET /api/jobs/[id]`
3. Worker:
   - cache lookup (`video_cache` via SHA-256(prompt))
   - sinon: SVI → audio → `/video/mix` → upload → update `jobs`

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
   - appel SVI via `workers/svi_client.py` (`/generate_film` ou `/generate_shot`)
4. génération audio:
   - `workers/audio_orchestrator.py` appelle le service audio:
     - `/audio/audioldm2` (et Diff-Foley optionnel)
     - `/audio/clap/select`
     - `/video/mix` → obtient `output_url_final`
5. update Supabase:
   - `video_url`, `audio_url`, `audio_score`, `output_url_final`, `final_url`
6. sauvegarde cache:
   - `video_cache.video_url = output_url_final`

## 6) Service audio (FastAPI)

Dossier: `services/audio-service/`

Endpoints importants:
- `GET /healthz`
- `POST /audio/audioldm2`
- `POST /audio/difffoley` (optionnel)
- `POST /audio/clap/select`
- `POST /video/mix` (**obligatoire pour produire la vidéo finale avec audio**)

Le endpoint `/video/mix`:
- télécharge vidéo+audio,
- normalise à `target_lufs`,
- remplace (ou mixe) l’audio,
- upload mp4 final,
- renvoie `output_url_final`.

## 7) Base de données (Supabase)

Migrations à appliquer:
- `supabase/migrations/20251004_jobs_table.sql`
- `supabase/migrations/20251026_add_audio_ambience_columns.sql`

### Table `jobs` (champs clés)
- `status`: `pending | in_progress | done | failed | cancelled`
- `current_stage`: ex `starting`, `video_generated`, `completed`
- `app_state`: paramètres & traces (JSONB)
- `video_url`: URL vidéo générée (source)
- `audio_url`: URL audio généré (optionnel)
- `output_url_final`: URL finale (audio intégré si activé)
- `final_url`: alias historique (souvent = `output_url_final`)

### Table `video_cache`
- `prompt_hash`: SHA-256(prompt)
- `video_url`: URL finale mise en cache
- `metadata`: infos (durée, fps, etc.)

## 8) Variables d’environnement (minimum)

Voir `.env.example` pour la liste complète.

Minimum:
```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=... # ou SUPABASE_SERVICE_KEY

RUNPOD_API_KEY=...
SVI_ENDPOINT_URL=https://api.runpod.ai/v2/...
AUDIO_BACKEND_URL=https://api.runpod.ai/v2/...
```

Audio (optionnel):
```bash
AUDIO_MODE=auto # ou off
AUDIO_MOCK=false
CLAP_ENABLE=true
```

## 9) Déploiement (vision pratique)

- **Next.js**: Vercel (recommandé) ou autre hébergeur Node
- **Worker**: un service Python long-running (Render/Railway/VM/Docker) qui exécute `python -m workers.worker`
- **SVI backend**: endpoint Runpod Serverless (GPU)
- **Audio backend**: endpoint Runpod Serverless (GPU) ou service dédié
- **Supabase**: DB + Storage

## 10) Stratégie “modèles plus récents” (important)

Objectif: upgrader les modèles sans casser l’app.
- Conserver **les contrats HTTP** (retour `video_url`, endpoint `/video/mix` → `output_url_final`)
- Conserver **les champs DB** (notamment `output_url_final` + cache)

Détails: `MODEL_UPGRADES.md`.

---

## Plan de reprise (10 étapes, sans doublons)

1. **Lire `STATUS.txt` + `MODEL_UPGRADES.md`** pour comprendre le pipeline canonique et la stratégie d’upgrade.
2. **Vérifier Supabase**: migrations appliquées (jobs + audio columns), bucket `generated` présent, RLS OK.
3. **Vérifier env**: `.env.local` complet (notamment `SVI_ENDPOINT_URL`, `AUDIO_BACKEND_URL`, service role key).
4. **Démarrer local**: `npm run dev` + worker (`python -m workers.worker`) et créer un job via `/generate`.
5. **Valider le job**: suivre `/jobs/[id]`, vérifier `jobs.output_url_final` rempli et jouable.
6. **Valider cache**: relancer le même prompt, vérifier que le job passe rapidement en `done` (HIT).
7. **Normaliser les “stages”**: définir une liste stable de `current_stage` (ex: `starting`, `video_generating`, `video_generated`, `audio_generating`, `mixing`, `completed`, `failed`) et l’appliquer UI + worker.
8. **Décider de la compat API**: soit déprécier/supprimer `/api/generate-video`, soit la faire pointer vers `/api/jobs` (compat).
9. **Observabilité**: logs structurés côté worker + timeouts; optionnel: Sentry/metrics; alerte budget si activée.
10. **Upgrade modèles**: remplacer les modèles **derrière les endpoints** (SVI/audio) en conservant les contrats; tester; ajuster cache (prompt seul vs prompt+params) si nécessaire.

