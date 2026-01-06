> ⚠️ **ARCHIVED / LEGACY (LangGraph v2)**
>
> Ce document décrit l’orchestrateur LangGraph historique (Qwen/WAN/Pika/ElevenLabs/Remotion).
> Le projet a depuis convergé vers un pipeline **SVI + Audio**.
>
> Références à utiliser:
> - `STATUS.txt` (source de vérité)
> - `README.md`
> - `QUICK_START.md`
> - `AUDIO_AMBIENCE_README.md`
> - `MODEL_UPGRADES.md`

# Orchestrateur LangGraph v2 - Résumé des modifications ✅

## 📋 Ce qui a été fait

Orchestrateur Python LangGraph **corrigé** selon les spécifications demandées:

### ✅ Modifications principales

1. **Table `jobs` avec `app_state`** au lieu de `video_cache`
2. **4 clips de 4 secondes** (au lieu de 5s)
3. **Pika avec `--image` + `seed`** pour cohérence visuelle
4. **Sauvegarde de l'état à chaque étape** dans `jobs.app_state` (JSONB)
5. **Pas de code frontend inutile** - Uniquement l'orchestrateur Python

## 📁 Fichiers modifiés/créés

### Python Workers (`/workers/`)
- ✅ **`langgraph_orchestrator.py`** (480 lignes) - Workflow LangGraph complet
  - 6 nœuds: Qwen → WAN Image → Pika → ElevenLabs → Remotion → Webhook
  - Sauvegarde `app_state` après chaque étape
  - Retry logic intégré
  
- ✅ **`api_services.py`** (350 lignes) - Wrappers API
  - `PikaService.generate_clip()` - Ajout paramètres `duration=4` et `seed`
  - Retry automatique avec `tenacity`
  
- ✅ **`supabase_client.py`** (90 lignes) - Client DB pour table `jobs`
  - `create_job()` - Crée un job avec `app_state`
  - `update_job_state()` - Sauvegarde l'état complet
  - `increment_retry()` - Gère les tentatives
  
- ✅ **`worker.py`** (150 lignes) - Worker de fond
  - Polling sur `jobs` avec `status='pending'`
  - Traite les jobs automatiquement
  
- ✅ **`test_setup.py`** (140 lignes) - Vérification config
- ✅ **`README.md`** - Documentation complète en français

### Database (`/supabase/migrations/`)
- ✅ **`20251004_jobs_table.sql`** - Table `jobs` avec:
  - `app_state JSONB` - État complet LangGraph
  - `status`, `current_stage`, `error_message`, `retry_count`
  - `video_url` - URL finale
  - RLS pour sécurité

### Frontend
- ❌ **Supprimé** `/app/api/generate-video/route.ts` - Pas de code frontend inutile

### Documentation
- ✅ **`LANGGRAPH_SETUP.md`** - Guide complet
- ✅ **`README.md`** - Mis à jour avec nouvelles infos
- ✅ **Ce fichier** - Résumé des modifications

## 🎬 Pipeline détaillé

```
┌────────────────────────────────────────────────────┐
│            Workflow LangGraph                      │
│     (État sauvegardé à chaque étape)               │
├────────────────────────────────────────────────────┤
│                                                    │
│  1️⃣ Qwen Script                                    │
│     ├─ Génère 4 scènes                            │
│     └─ Sauvegarde: app_state.script               │
│                                                    │
│  2️⃣ WAN Image                                      │
│     ├─ Crée image clé (1920x1080)                │
│     └─ Sauvegarde: app_state.key_visual           │
│                                                    │
│  3️⃣ Pika Clips ⚡ NOUVEAU                          │
│     ├─ 4 clips de 4 secondes                      │
│     ├─ Clip 0: --image key_visual, seed=1234     │
│     ├─ Clip 1: seed=1235                          │
│     ├─ Clip 2: seed=1236                          │
│     ├─ Clip 3: seed=1237                          │
│     └─ Sauvegarde: app_state.clips[]              │
│                                                    │
│  4️⃣ ElevenLabs Audio                               │
│     ├─ Génère voix + SRT                          │
│     └─ Sauvegarde: app_state.audio                │
│                                                    │
│  5️⃣ Remotion Assembly                              │
│     ├─ Assemble clips + audio + SRT               │
│     └─ Sauvegarde: app_state.final_video          │
│                                                    │
│  6️⃣ Webhook Notify                                 │
│     └─ Envoie notification (si configuré)         │
│                                                    │
└────────────────────────────────────────────────────┘
         ▲                              │
         │    Sauvegarde complète       │
         │         à chaque             │
         │          étape               │
         │                              ▼
    ┌────────────────────────────────────────┐
    │          Supabase - Table jobs         │
    │                                        │
    │  app_state: {                          │
    │    job_id: "...",                      │
    │    prompt: "...",                      │
    │    script: { scenes: [...] },          │
    │    key_visual: { image_url: "..." },   │
    │    clips: [                            │
    │      { video_url, seed, index },       │
    │      ...                               │
    │    ],                                  │
    │    audio: { audio_url, srt },          │
    │    final_video: { video_url }          │
    │  }                                     │
    │                                        │
    └────────────────────────────────────────┘
```

## 🔑 Changements techniques clés

### 1. Pika avec seed pour cohérence

```python
# Code dans langgraph_orchestrator.py

base_seed = random.randint(1000, 9999)

for i, scene in enumerate(scenes):
    image_url = key_visual["image_url"] if i == 0 else None
    seed = base_seed + i
    
    clip = await pika.generate_clip(
        prompt=scene["description"],
        image_url=image_url,  # --image pour premier clip
        duration=4,           # 4 secondes exactement
        seed=seed            # seed incrémental
    )
```

**Pourquoi?**
- Premier clip utilise l'image clé comme base
- Seed incrémental assure cohérence visuelle entre clips
- 4 secondes par clip = 16 secondes total de vidéo

### 2. Sauvegarde de l'état complet

```python
# Après chaque étape
await supabase.update_job_state(
    job_id=state["job_id"],
    app_state=dict(state),  # État COMPLET du workflow
    status="in_progress",
    current_stage="pika"
)
```

**Avantages:**
- Reprise possible après crash
- Debug facile avec état complet
- Traçabilité totale du pipeline

### 3. Table jobs simplifiée

```sql
CREATE TABLE jobs (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    prompt TEXT NOT NULL,
    status TEXT NOT NULL,
    
    -- État complet LangGraph
    app_state JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    -- Métadonnées
    current_stage TEXT,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    video_url TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Différence avec video_cache:**
- Une seule table au lieu de deux
- `app_state` contient tout l'état du workflow
- Plus simple à maintenir

## 🚀 Utilisation

### Démarrer le worker

```bash
cd workers
./start_worker.sh  # Unix/Mac
# ou
start_worker.bat   # Windows
```

### Créer un job

```bash
python -m workers.langgraph_orchestrator "Crée une vidéo sur l'IA"
```

### Vérifier l'état

```sql
-- État actuel
SELECT id, status, current_stage, retry_count
FROM jobs 
ORDER BY created_at DESC 
LIMIT 5;

-- État complet (JSON)
SELECT app_state FROM jobs WHERE id = 'job-uuid';
```

### Depuis Python

```python
import asyncio
from workers.langgraph_orchestrator import create_and_run_job

result = await create_and_run_job(
    user_id="user_123",
    prompt="Crée une vidéo sur l'IA en 2024"
)

print(result['video_url'])
```

## 📊 Statistiques

- **Fichiers créés/modifiés:** 10
- **Lignes de Python:** ~1,289
- **Table Supabase:** 1 (`jobs`)
- **Étapes du pipeline:** 6
- **Durée clips Pika:** 4 secondes (nouveau!)
- **Code frontend supprimé:** 1 fichier

## ✅ Checklist finale

- [x] Table `jobs` avec `app_state`
- [x] Sauvegarde état à chaque étape
- [x] Pika: 4 clips de 4s avec `--image` + `seed`
- [x] Retry logic avec `tenacity`
- [x] Webhook notification
- [x] Worker de fond avec polling
- [x] Script de vérification config
- [x] Documentation complète
- [x] Pas de code frontend inutile

## 🔄 Migration depuis version 1

Si vous avez utilisé la version précédente:

```sql
-- Supprimer anciennes tables (si elles existent)
DROP TABLE IF EXISTS video_artifacts;
DROP TABLE IF EXISTS video_cache;

-- Créer nouvelle table
-- Fichier: supabase/migrations/20251004_jobs_table.sql
```

## 📚 Documentation

1. **`workers/README.md`** - Guide complet du worker (en français)
2. **`LANGGRAPH_SETUP.md`** - Guide de setup détaillé
3. **Ce fichier** - Résumé des modifications

## 🎯 Prochaines étapes recommandées

1. **Frontend** - Créer UI pour soumettre des prompts
2. **Stockage** - Uploader audio sur Supabase Storage
3. **Queue** - Remplacer polling par Redis/RabbitMQ
4. **API REST** - Créer endpoints Next.js pour jobs (si besoin)
5. **Monitoring** - Ajouter Sentry pour tracking d'erreurs

## 💡 Points importants

### ⚠️ Pas de code frontend

Comme demandé, **aucun code frontend** n'a été ajouté:
- ❌ Pas de composant React
- ❌ Pas de page Next.js
- ❌ Pas d'API route (supprimée)
- ✅ Uniquement l'orchestrateur Python

### ✨ Avantages de cette architecture

1. **Séparation claire** - Frontend et backend découplés
2. **Scalable** - Workers peuvent tourner sur machines séparées
3. **Resilient** - État sauvegardé, retry automatique
4. **Debuggable** - État complet accessible dans DB
5. **Flexible** - Facile d'ajouter nouvelles étapes

### 🔧 Configuration minimale

```bash
# .env.local (minimum requis)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGc...
QWEN_API_KEY=sk-...
WAN_IMAGE_API_KEY=wan-...
PIKA_API_KEY=pika-...
ELEVENLABS_API_KEY=el-...
```

## 🎬 Conclusion

L'orchestrateur LangGraph v2 est:
- ✅ **Conforme** aux spécifications demandées
- ✅ **Simplifié** avec table unique `jobs`
- ✅ **Robuste** avec retry et sauvegarde d'état
- ✅ **Documenté** avec guides complets
- ✅ **Prêt** pour production

**Date:** 2025-10-04  
**Version:** 2.0.0  
**Status:** ✅ Production-ready
