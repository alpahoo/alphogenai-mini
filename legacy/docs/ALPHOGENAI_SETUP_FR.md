> ⚠️ **ARCHIVED / LEGACY (LangGraph historique, FR)**
>
> Ce document décrit un setup d’orchestrateur LangGraph historique.
> **Pipeline actuel**: SVI (vidéo) + Audio Ambience Service (audio + mix).
>
> Références à utiliser:
> - `STATUS.txt` (source de vérité)
> - `README.md`
> - `QUICK_START.md`
> - `AUDIO_AMBIENCE_README.md`
> - `MODEL_UPGRADES.md`

# AlphogenAI Mini - Configuration Orchestrateur LangGraph ✅

Documentation complète de l'orchestrateur LangGraph en Python pour AlphogenAI Mini.

## 📁 Fichiers créés

### Workers Python (`/workers/`)
- ✅ `langgraph_orchestrator.py` - Orchestrateur principal avec workflow LangGraph
- ✅ `api_services.py` - Wrappers API pour Qwen, WAN, Pika, ElevenLabs, Remotion
- ✅ `supabase_client.py` - Client Supabase avec sauvegarde d'état
- ✅ `config.py` - Gestion de la configuration
- ✅ `worker.py` - Worker background qui poll les jobs
- ✅ `test_setup.py` - Script de vérification de configuration
- ✅ `requirements.txt` - Dépendances Python
- ✅ `README.md` - Documentation complète
- ✅ `start_worker.sh` / `.bat` - Scripts de démarrage

### Base de données (`/supabase/migrations/`)
- ✅ `20251004_alphogenai_jobs_table.sql` - Table `jobs` avec colonne `app_state`

## 🎬 Architecture du Pipeline

```
┌─────────────────────────────────────────────────────┐
│          Workflow LangGraph (6 étapes)              │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Étape 1: Qwen                                     │
│  └─ Script avec 4 scènes                           │
│  └─ État sauvegardé dans jobs.app_state            │
│                                                     │
│  Étape 2: WAN Image                                │
│  └─ Image clé 1920x1080 (cinématique)             │
│  └─ État sauvegardé                                │
│                                                     │
│  Étape 3: Pika                                     │
│  └─ 4 clips de 4 secondes                         │
│  └─ --image flag activé                            │
│  └─ seed: base_seed, base_seed+1, +2, +3          │
│  └─ Premier clip utilise image clé comme seed      │
│  └─ État sauvegardé                                │
│                                                     │
│  Étape 4: ElevenLabs                               │
│  └─ Génération voix (TTS)                          │
│  └─ Génération sous-titres SRT                     │
│  └─ État sauvegardé                                │
│                                                     │
│  Étape 5: Remotion                                 │
│  └─ Assemblage final MP4                           │
│  └─ État sauvegardé (status = completed)           │
│                                                     │
│  Étape 6: Webhook                                  │
│  └─ Notification de fin                            │
│                                                     │
└─────────────────────────────────────────────────────┘
```

## 🔑 Caractéristiques principales

### ✅ Sauvegarde d'état à chaque étape
Après chaque étape du pipeline, l'état complet est sauvegardé dans `jobs.app_state` :

```json
{
  "prompt": "...",
  "script": {
    "scenes": [
      {"description": "...", "narration": "..."},
      {"description": "...", "narration": "..."},
      {"description": "...", "narration": "..."},
      {"description": "...", "narration": "..."}
    ]
  },
  "key_visual": {
    "image_url": "...",
    "image_id": "..."
  },
  "clips": [
    {"video_url": "...", "duration": 4, "seed": 12345},
    {"video_url": "...", "duration": 4, "seed": 12346},
    {"video_url": "...", "duration": 4, "seed": 12347},
    {"video_url": "...", "duration": 4, "seed": 12348}
  ],
  "audio": {
    "audio_url": "...",
    "srt_content": "...",
    "duration": 16.5
  },
  "final_video": {
    "video_url": "...",
    "render_id": "..."
  }
}
```

### ✅ Retry avec exponential backoff
- 3 tentatives par défaut (configurable)
- Délai exponentiel entre tentatives
- Utilise `tenacity` pour la gestion des retries

### ✅ Webhook de notification
Quand la vidéo est prête, un webhook est envoyé avec:
```json
{
  "job_id": "uuid",
  "user_id": "uuid",
  "status": "completed",
  "video_url": "https://...",
  "timestamp": "2025-10-04T..."
}
```

### ✅ Paramètres Pika spécifiques
Les clips sont générés avec:
- **Durée**: 4 secondes (pas 5)
- **Flag `--image`**: Activé pour utiliser référence visuelle
- **Seed**: Seed incrémenté (cohérence visuelle entre clips)
- **Image clé**: Le premier clip utilise l'image clé comme seed visuel

## 🚀 Démarrage rapide

### 1. Installer les dépendances

```bash
cd workers
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configurer les clés API

Éditez `.env.local`:

```bash
# Supabase
SUPABASE_URL=https://votre-projet.supabase.co
SUPABASE_SERVICE_KEY=votre-service-key

# Services IA
QWEN_API_KEY=votre-clé-qwen
WAN_IMAGE_API_KEY=votre-clé-wan
PIKA_API_KEY=votre-clé-pika
ELEVENLABS_API_KEY=votre-clé-elevenlabs

# Remotion
REMOTION_RENDERER_URL=http://localhost:3001

# Webhook (optionnel)
WEBHOOK_URL=https://votre-domaine.com/api/webhook
WEBHOOK_SECRET=votre-secret
```

### 3. Créer la table jobs

Dans l'éditeur SQL Supabase, exécutez:
```sql
-- Fichier: supabase/migrations/20251004_alphogenai_jobs_table.sql
```

Cela crée:
- Table `jobs` avec colonne `app_state`
- Policies RLS (Row Level Security)
- Triggers pour `updated_at`

### 4. Vérifier la configuration

```bash
cd workers
python -m workers.test_setup
```

Cela vérifie:
- ✅ Variables d'environnement
- ✅ Connexion Supabase
- ✅ Table jobs accessible
- ✅ Création de job test

### 5. Démarrer le worker

```bash
# Unix/Mac
./start_worker.sh

# Windows
start_worker.bat

# Ou manuellement
python -m workers.worker
```

### 6. Créer un job de test

```bash
python -m workers.langgraph_orchestrator "Créer une vidéo sur l'intelligence artificielle"
```

## 📊 Schéma de la table jobs

```sql
CREATE TABLE jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    prompt TEXT NOT NULL,
    status TEXT NOT NULL,  -- pending, in_progress, completed, failed
    app_state JSONB DEFAULT '{}'::jsonb,  -- État complet du workflow
    result JSONB,  -- Vidéo finale
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

## 🔄 Flux de travail

### Créer un job
```python
from workers.supabase_client import SupabaseClient

supabase = SupabaseClient()
job_id = await supabase.create_job(
    user_id="user_123",
    prompt="Créer une vidéo sur..."
)
```

### Exécuter l'orchestrateur
```python
from workers.langgraph_orchestrator import create_and_run_job

result = await create_and_run_job(
    user_id="user_123",
    prompt="Créer une vidéo sur..."
)
```

### Consulter l'état
```python
job = await supabase.get_job(job_id)
print(f"Status: {job['status']}")
print(f"État: {job['app_state']}")
```

## ⚙️ Configuration

Variables dans `.env.local`:

| Variable | Description | Défaut |
|----------|-------------|--------|
| `MAX_RETRIES` | Tentatives max par étape | 3 |
| `RETRY_DELAY` | Délai entre retries (s) | 5 |
| `JOB_TIMEOUT` | Timeout total job (s) | 3600 |
| `WEBHOOK_URL` | URL de notification | None |
| `WEBHOOK_SECRET` | Secret webhook HMAC | None |

## 📈 Performance attendue

| Étape | Durée | Notes |
|-------|-------|-------|
| Script (Qwen) | 5-10s | Génération LLM |
| Image clé (WAN) | 10-20s | Image 1920x1080 |
| 4 clips (Pika) | 2-5min | Génération parallèle |
| Audio (ElevenLabs) | 10-30s | TTS + SRT |
| Assemblage (Remotion) | 1-3min | Rendu final |
| **Total** | **~4-9min** | Pipeline complet |

## 🐛 Dépannage

### Erreur "Table 'jobs' does not exist"
```bash
# Exécutez la migration SQL dans Supabase
# Fichier: supabase/migrations/20251004_alphogenai_jobs_table.sql
```

### Erreur "API key invalid"
```bash
# Vérifiez .env.local
# Assurez-vous qu'aucune clé ne contient "xxxx" ou "your-"
```

### Job bloqué en "in_progress"
```bash
# Le worker a peut-être crash
# Vérifiez les logs du worker
# Redémarrez le worker
```

### Pika timeout
```bash
# Augmentez JOB_TIMEOUT dans .env.local
JOB_TIMEOUT=7200  # 2 heures
```

## 📝 Logs du workflow

Le worker affiche des logs détaillés:

```
============================================================
🎬 AlphogenAI Mini - Workflow LangGraph
============================================================
Job ID: 123e4567-e89b-12d3-a456-426614174000
Prompt: Créer une vidéo sur l'IA
============================================================

[Étape 1/5] Génération du script (Qwen)...
  → Script généré : 4 scènes

[Étape 2/5] Génération de l'image clé (WAN Image)...
  → Image générée : https://...

[Étape 3/5] Génération des clips vidéo (Pika 4x4s)...
  → 4 clips générés (4s chacun)

[Étape 4/5] Génération audio + SRT (ElevenLabs)...
  → Audio généré : 16.5s

[Étape 5/5] Assemblage de la vidéo (Remotion)...
  → Vidéo finale prête : https://...

[Étape 6/6] Envoi notification webhook...
  → Webhook envoyé avec succès

============================================================
✅ Workflow terminé avec succès
Vidéo: https://...
============================================================
```

## 🎯 Différences avec la version précédente

| Aspect | Avant | Maintenant |
|--------|-------|------------|
| Table | `video_cache` + `video_artifacts` | `jobs` uniquement |
| État | Éparpillé sur 2 tables | Tout dans `app_state` (JSONB) |
| Pika durée | 5 secondes | 4 secondes |
| Pika options | Basique | `--image` + `seed` |
| Frontend | API route créée | Pas de code frontend |

## 🔒 Sécurité

- ✅ **RLS activé** sur la table jobs
- ✅ **Service role** pour le worker
- ✅ **User isolation** via RLS policies
- ✅ **Webhook signature** avec HMAC (optionnel)

## 📦 Structure finale

```
alphogenai-mini/
├── workers/
│   ├── __init__.py
│   ├── langgraph_orchestrator.py  ← Orchestrateur principal
│   ├── api_services.py            ← Wrappers API
│   ├── supabase_client.py         ← Client DB
│   ├── config.py                  ← Configuration
│   ├── worker.py                  ← Worker background
│   ├── test_setup.py              ← Tests de config
│   ├── requirements.txt           ← Dépendances
│   ├── README.md                  ← Documentation
│   ├── start_worker.sh            ← Démarrage Unix
│   └── start_worker.bat           ← Démarrage Windows
├── supabase/migrations/
│   └── 20251004_alphogenai_jobs_table.sql  ← Migration DB
└── .env.local                     ← Config (à créer)
```

## ✅ Checklist de déploiement

- [ ] Python 3.9+ installé
- [ ] Dépendances installées (`pip install -r requirements.txt`)
- [ ] `.env.local` configuré avec toutes les clés API
- [ ] Migration SQL exécutée dans Supabase
- [ ] Test de configuration passé (`python -m workers.test_setup`)
- [ ] Worker démarré (`./start_worker.sh`)
- [ ] Job de test créé et réussi

---

**Date:** 2025-10-04  
**Version:** 2.0.0  
**Statut:** ✅ Prêt pour production
