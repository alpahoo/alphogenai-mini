# 🚀 AlphoGenAI Mini — Démarrage rapide (V1)

V1 = **un seul pipeline** + **un seul backend vidéo** (Modal en prod).  
En local/CI, on utilise **MockBackend** par défaut (mp4 dummy 1s + upload Supabase).

## Prérequis
- Node.js 18+
- Python 3.10+ (pour le worker)
- Un projet Supabase (DB + Storage)
- Un endpoint Modal (prod) OU MockBackend (local/CI)

## 1) Installation

```bash
npm install
```

## 2) Configuration

```bash
cp .env.example .env.local
```

Variables minimum (voir `.env.example` pour la liste complète) :
```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

SUPABASE_BUCKET=generated
VIDEO_BACKEND=mock
# En prod:
# VIDEO_BACKEND=modal
# MODAL_VIDEO_ENDPOINT_URL=https://...
```

## 3) Base de données

Dans Supabase SQL Editor, exécuter :
```sql
-- supabase/migrations/20251004_jobs_table.sql
-- supabase/migrations/20260106_create_generated_bucket.sql
```

## 4) Démarrer

```bash
# Terminal 1
npm run dev
```

```bash
# Terminal 2
cd workers
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
./start_worker.sh
```

## 5) Utiliser

1. Ouvrir `http://localhost:3000/generate`
2. Créer un job
3. Suivre le job sur `http://localhost:3000/jobs/<jobId>`

## Notes
- **Cache**: le worker déduplique via `video_cache` (hash stable sur prompt + params).
- **E2E sans GPU**: `python3 tools/e2e_test_v1.py` (MockBackend).
