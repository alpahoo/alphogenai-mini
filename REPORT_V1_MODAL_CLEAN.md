# REPORT — V1 Modal-only clean baseline

## Objectif (non négociable)
V1 = **happy path only**:

UI → `POST /api/jobs` → worker → `VideoBackend` unique (mock|modal) → Supabase Storage → player.

**Aucun audio. Aucun Runpod/SVI/Runway. Aucune musique. Pas de multi-backends.**

---

## Arborescence top-level (finale)

- `app/` (Next.js V1)
- `workers/` (worker V1 + video_backend)
- `services/video_modal/` (backend vidéo Modal)
- `supabase/migrations/` (V1 uniquement)
- `tools/` (tests V1 uniquement)
- `legacy/` (tout le non-V1 archivé, hors exécution)

---

## Surface ACTIVE (source de vérité V1)

### Pages / routes Next.js
- `/` (`app/page.tsx`)
- `/generate` (`app/generate/page.tsx`)
- `/jobs/[id]` (`app/jobs/[id]/page.tsx`)
- Redirections legacy:
  - `/creator/generate` → `/generate`
  - `/v/[id]` → `/jobs/[id]`
  - `/dashboard` → `/generate`

### API (Next.js)
- `POST /api/jobs` (`app/api/jobs/route.ts`) → crée un job (pas d’auth V1, `user_id = NULL`)
- `GET /api/jobs/[id]` (`app/api/jobs/[id]/route.ts`) → lit un job
- `POST/GET /api/generate-video` (`app/api/generate-video/route.ts`) → **wrapper strict** vers jobs (pas de logique parallèle)

### Worker (Python)
- `workers/worker.py`
- `workers/config.py`
- `workers/supabase_client.py`

### VideoBackend (contractuel)
- `workers/video_backend/base.py` (interface)
- `workers/video_backend/factory.py`
- `workers/video_backend/mock_backend.py` (défaut local/CI)
- `workers/video_backend/modal_backend.py` (prod)

### Tests/outil V1
- `tools/e2e_test_v1.py`
- `tools/verify_storage_public.py`

---

## LEGACY (archivé, non exécuté)

Tout ce qui n’est pas V1 est **déplacé** sous:

```
legacy/
  backends/          # SVI/Runpod/etc
  services/          # audio-service, holocine-service, etc
  scripts/           # deploy_svi, runpod scripts, e2e_audio, etc
  docs/              # docs historiques
  migrations_audio/  # migrations audio
  misc/              # anciennes routes/pages/components/etc
```

ESLint ignore `legacy/**` (pour ne pas impacter lint/build).

---

## Variables d’environnement (V1)

Voir `.env.example`. Minimum:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_BUCKET=generated

VIDEO_BACKEND=mock
# en prod:
# VIDEO_BACKEND=modal
# MODAL_VIDEO_ENDPOINT_URL=https://...

JOB_TIMEOUT=3600
POLL_INTERVAL=10
```

---

## Storage: bucket `generated` public read (V1)

Migrations V1 (seules conservées dans `supabase/migrations/`):
- `20251004_jobs_table.sql`
- `20260106_create_generated_bucket.sql`

Vérification:

```bash
python3 tools/verify_storage_public.py
```

Si `403`:
- vérifier que le bucket `generated` existe et est `public=true`
- vérifier la policy `storage.objects` SELECT pour `bucket_id='generated'`

---

## Commandes exactes (local)

### 1) Front
```bash
npm install
npm run dev
```

### 2) Worker
```bash
cd workers
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python -m workers.worker
```

---

## Tests & validation

```bash
npm run lint
npm run build
python3 tools/e2e_test_v1.py
python3 tools/verify_storage_public.py
```

`tools/e2e_test_v1.py` doit passer **sans GPU** (MockBackend).

---

## V2 (explicitement hors scope V1)

Audio, SVI/Runpod, musique, multi-backends: **archivés** dans `legacy/`.

