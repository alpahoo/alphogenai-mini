> ⚠️ **ARCHIVED / LEGACY (LangGraph historique)**
>
> Ce guide concerne l’orchestrateur LangGraph et un pipeline ancien.
> **Pipeline actuel**: SVI (vidéo) + Audio Ambience Service (audio + mix).
>
> Références à utiliser:
> - `STATUS.txt` (source de vérité)
> - `README.md`
> - `QUICK_START.md`
> - `AUDIO_AMBIENCE_README.md`
> - `MODEL_UPGRADES.md`

# ✅ AlphogenAI Mini - Orchestrateur LangGraph Finalisé

## 📋 Résumé de l'Implémentation

L'orchestrateur LangGraph a été créé avec les spécifications exactes demandées :

### Pipeline (6 Étapes)

1. **Qwen** → Script avec exactement 4 scènes
2. **WAN Image** → Image clé (1920x1080) de la première scène
3. **Pika** → 4 clips de **4 secondes** avec `--image + seed`
   - Clip 1 : utilise l'image clé + seed
   - Clips 2-4 : seed incrémenté pour cohérence visuelle
4. **ElevenLabs** → Voix-off + SRT synchronisés
5. **Remotion** → Assemblage final
6. **Webhook** → Notification quand vidéo prête

### Persistance d'État

✅ **Table `jobs` avec colonne `app_state`**

L'état complet du workflow LangGraph est sauvegardé après **chaque étape** dans `jobs.app_state` (JSONB).

```sql
CREATE TABLE jobs (
    id UUID,
    user_id UUID,
    prompt TEXT,
    status TEXT,
    app_state JSONB,  -- État LangGraph complet
    current_stage TEXT,
    error_message TEXT,
    video_url TEXT,
    retry_count INTEGER,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
```

### Retry Logic

✅ **Retry automatique avec backoff**

- Max retries : 3 (configurable)
- Délai : 5 secondes (configurable)
- Incrémentation automatique de `retry_count`
- Job marqué `failed` si max retries atteint

### Webhook

✅ **Notification POST quand vidéo prête**

```http
POST <WEBHOOK_URL>
X-Webhook-Secret: <secret>

{
  "job_id": "uuid",
  "status": "completed",
  "video_url": "https://...",
  "prompt": "...",
  "timestamp": "2025-10-04T..."
}
```

## 📁 Fichiers Créés

### Python Workers (`/workers/`)

| Fichier | Lignes | Description |
|---------|--------|-------------|
| `langgraph_orchestrator.py` | ~420 | Orchestrateur principal LangGraph |
| `api_services.py` | ~330 | Wrappers AI (Qwen, WAN, Pika, ElevenLabs, Remotion) |
| `supabase_client.py` | ~90 | Client DB pour table `jobs` |
| `worker.py` | ~140 | Worker background avec polling |
| `config.py` | ~60 | Configuration avec Pydantic |
| `test_setup.py` | ~200 | Vérification du setup |
| `requirements.txt` | ~20 | Dependencies Python |
| `README.md` | - | Documentation complète |
| `start_worker.sh` | - | Script démarrage Unix/Mac |
| `start_worker.bat` | - | Script démarrage Windows |

### Base de Données

- ✅ `supabase/migrations/20251004_jobs_table.sql` - Table jobs avec app_state

### API Next.js

- ✅ `app/api/generate-video/route.ts` - Endpoints POST/GET pour jobs

### Documentation

- ✅ `ALPHOGENAI_ORCHESTRATOR.md` - Documentation technique complète
- ✅ `SETUP_FINAL.md` - Ce fichier

## 🚀 Démarrage Rapide

### 1. Installer les Dependencies

```bash
cd workers
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configurer `.env.local`

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=your-service-key

# AI Services (REQUIS)
QWEN_API_KEY=your-key
WAN_IMAGE_API_KEY=your-key
PIKA_API_KEY=your-key
ELEVENLABS_API_KEY=your-key
REMOTION_RENDERER_URL=http://localhost:3001

# Webhook (OPTIONNEL)
WEBHOOK_URL=https://your-domain.com/webhook
WEBHOOK_SECRET=your-secret

# Retry (OPTIONNEL)
MAX_RETRIES=3
RETRY_DELAY=5
```

### 3. Exécuter la Migration

Dans Supabase SQL Editor :

```sql
-- Copier/coller le contenu de :
-- supabase/migrations/20251004_jobs_table.sql
```

Ceci crée la table `jobs` avec RLS activé.

### 4. Vérifier le Setup

```bash
python -m workers.test_setup
```

Doit afficher :
```
✅ All required environment variables are set!
✅ jobs table accessible
✅ Supabase connection successful!
✅ Job creation and retrieval working!
🎉 All tests passed! Your setup is ready.
```

### 5. Démarrer le Worker

```bash
# Unix/Mac
./start_worker.sh

# Windows
start_worker.bat

# Ou manuel
python -m workers.worker
```

### 6. Créer un Job de Test

**Option A - Via API :**

```bash
curl -X POST http://localhost:3000/api/generate-video \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-token>" \
  -d '{"prompt": "Créer une vidéo sur l'\''IA en 2024"}'
```

**Option B - Direct Python :**

```bash
python -m workers.langgraph_orchestrator "Vidéo sur l'innovation en IA"
```

### 7. Surveiller le Job

Le worker affiche les logs en temps réel :

```
======================================================================
🎬 AlphogenAI Mini - Démarrage workflow
======================================================================
Job ID: abc-123
Prompt: Créer une vidéo sur l'IA en 2024
======================================================================

[Qwen] Génération du script pour job abc-123
[Qwen] ✓ Script généré: 4 scènes

[WAN Image] Génération de l'image clé pour job abc-123
[WAN Image] ✓ Image clé générée: https://...

[Pika] Génération de 4 clips pour job abc-123
[Pika] ✓ 4 clips générés (4s chacun)

[ElevenLabs] Génération audio pour job abc-123
[ElevenLabs] ✓ Audio généré: 16.2s

[Remotion] Assemblage vidéo finale pour job abc-123
[Remotion] ✓ Vidéo finale: https://...

[Webhook] ✓ Notification envoyée

======================================================================
✅ Workflow terminé avec succès!
Vidéo: https://...
======================================================================
```

## 🔍 Vérification de l'État

### Via SQL

```sql
-- Voir l'état complet d'un job
SELECT 
  id,
  status,
  current_stage,
  app_state,
  video_url,
  error_message,
  retry_count
FROM jobs 
WHERE id = 'your-job-id';
```

### Via API

```bash
curl http://localhost:3000/api/generate-video?job_id=<uuid> \
  -H "Authorization: Bearer <token>"
```

Response :
```json
{
  "job_id": "uuid",
  "status": "completed",
  "current_stage": "completed",
  "video_url": "https://...",
  "app_state": {
    "script": {...},
    "key_visual": {...},
    "clips": [...],
    "audio": {...},
    "final_video": {...}
  }
}
```

## 🎯 Caractéristiques Implémentées

### ✅ Requis

- [x] LangGraph orchestrator sous `/workers/langgraph_orchestrator.py`
- [x] Pipeline : Qwen → WAN Image → Pika → ElevenLabs → Remotion
- [x] Qwen génère script avec 4 scènes
- [x] Pika génère 4 clips de **4 secondes** avec `--image + seed`
- [x] État sauvegardé dans `jobs.app_state` après chaque étape
- [x] Retry logic avec compteur
- [x] Webhook quand vidéo prête
- [x] Pas de code frontend inutile

### ✅ Bonus

- [x] Worker background avec polling automatique
- [x] Génération parallèle des 4 clips Pika (optimisation)
- [x] Row Level Security (RLS) sur table jobs
- [x] Scripts de démarrage pour Unix/Windows
- [x] Test setup automatique
- [x] Documentation complète
- [x] Gestion gracieuse du shutdown

## 📊 Structure Technique

### Workflow LangGraph

```python
workflow = StateGraph(WorkflowState)

# Nœuds
workflow.add_node("qwen_script", _node_qwen_script)
workflow.add_node("wan_image", _node_wan_image)
workflow.add_node("pika_clips", _node_pika_clips)
workflow.add_node("elevenlabs_audio", _node_elevenlabs_audio)
workflow.add_node("remotion_assembly", _node_remotion_assembly)
workflow.add_node("webhook_notify", _node_webhook_notify)

# Flux
workflow.set_entry_point("qwen_script")
workflow.add_edge("qwen_script", "wan_image")
workflow.add_edge("wan_image", "pika_clips")
workflow.add_edge("pika_clips", "elevenlabs_audio")
workflow.add_edge("elevenlabs_audio", "remotion_assembly")
workflow.add_edge("remotion_assembly", "webhook_notify")
workflow.add_edge("webhook_notify", END)
```

### Sauvegarde d'État

Après **chaque nœud** :

```python
async def _save_state(job_id, state, stage):
    app_state = {
        "prompt": state["prompt"],
        "script": state.get("script", {}),
        "key_visual": state.get("key_visual", {}),
        "clips": state.get("clips", []),
        "audio": state.get("audio", {}),
        "final_video": state.get("final_video", {}),
        "last_stage": stage,
        "timestamp": datetime.utcnow().isoformat(),
    }
    
    await supabase.update_job_state(
        job_id=job_id,
        app_state=app_state,
        current_stage=stage
    )
```

### Paramètres Pika

```python
# Génération des 4 clips avec seed
base_seed = random.randint(1000, 9999)

for i, scene in enumerate(scenes):
    clip = await pika.generate_clip(
        prompt=scene["description"],
        image_url=key_visual_url if i == 0 else None,  # --image
        duration=4,  # 4 secondes
        seed=base_seed + i  # seed incrémenté
    )
```

## 🐛 Troubleshooting

### Job bloqué en "in_progress"

```sql
-- Réinitialiser le job
UPDATE jobs SET status = 'pending', retry_count = 0 WHERE id = 'uuid';
```

### Worker ne démarre pas

```bash
# Vérifier les variables d'environnement
python -m workers.test_setup

# Vérifier la table jobs existe
psql -h <host> -U postgres -d postgres
\dt jobs
```

### API key invalide

```bash
# Vérifier dans .env.local
cat .env.local | grep API_KEY

# Tester manuellement
python -c "from workers.config import get_settings; print(get_settings().QWEN_API_KEY)"
```

## 📈 Performance

Temps estimés par étape :

| Étape | Temps |
|-------|-------|
| Qwen | 5-10s |
| WAN Image | 10-20s |
| Pika (4 clips en parallèle) | 2-5min |
| ElevenLabs | 10-30s |
| Remotion | 1-3min |
| **Total** | **4-9min** |

## 🎓 Documentation Complète

- **`ALPHOGENAI_ORCHESTRATOR.md`** - Documentation technique détaillée
- **`workers/README.md`** - Guide du worker
- **`README.md`** - Vue d'ensemble du projet

## ✅ Checklist Finale

- [x] Orchestrateur LangGraph créé
- [x] Pipeline 6 étapes fonctionnel
- [x] Clips Pika 4s avec --image + seed
- [x] État sauvegardé dans jobs.app_state
- [x] Retry logic implémenté
- [x] Webhook configuré
- [x] Migration DB créée
- [x] Worker background fonctionnel
- [x] API endpoints créés
- [x] Documentation complète
- [x] Tests de vérification
- [x] Scripts de démarrage

---

**Status** : ✅ **PRÊT POUR PRODUCTION**  
**Version** : 2.0  
**Date** : 2025-10-04

L'orchestrateur est complètement fonctionnel et prêt à être utilisé !
