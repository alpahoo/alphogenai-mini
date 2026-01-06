# 🚀 AlphoGenAI Mini — Démarrage rapide

Ce dépôt est désormais **SVI (vidéo)** + **Audio Ambience Service (audio + mix)**.

## Prérequis
- Node.js 18+
- Python 3.10+ (pour le worker)
- Un projet Supabase (DB + Storage)
- 2 endpoints Runpod: **SVI** + **Audio Service**

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

RUNPOD_API_KEY=...
SVI_ENDPOINT_URL=https://api.runpod.ai/v2/...
AUDIO_BACKEND_URL=https://api.runpod.ai/v2/...
```

## 3) Base de données

Dans Supabase SQL Editor, exécuter :
```sql
-- supabase/migrations/20251004_jobs_table.sql
-- supabase/migrations/20251026_add_audio_ambience_columns.sql
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
- **Cache**: le worker déduplique via `video_cache` (SHA-256 du prompt).
- **Audio**: activer/désactiver via `AUDIO_MODE=auto|off` (et `AUDIO_MOCK=true` en dev).
