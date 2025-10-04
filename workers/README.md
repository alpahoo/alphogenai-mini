# AlphoGenAI Mini - Orchestrateur LangGraph

Orchestrateur Python basé sur LangGraph pour gérer le pipeline de génération vidéo AI.

## 🎬 Pipeline

L'orchestrateur gère le flux suivant:

1. **Qwen** - Génération du script (4 scènes exactement)
2. **WAN Image** - Création de l'image clé (1920x1080 cinématique)
3. **Pika** - Génération de 4 clips vidéo (4 secondes chacun, avec --image + seed)
4. **ElevenLabs** - Génération de la voix + sous-titres SRT
5. **Remotion** - Assemblage final de la vidéo
6. **Webhook** - Notification quand la vidéo est prête

## 🗄️ Structure de données

### Table `jobs`

```sql
CREATE TABLE jobs (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    prompt TEXT NOT NULL,
    status TEXT,  -- pending, in_progress, completed, failed
    app_state JSONB,  -- État complet du workflow LangGraph
    current_stage TEXT,  -- qwen, wan_image, pika, elevenlabs, remotion
    error_message TEXT,
    retry_count INTEGER,
    video_url TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
```

L'état complet du workflow est sauvegardé dans `app_state` à chaque étape.

## ⚙️ Installation

### 1. Installer les dépendances Python

```bash
cd workers
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configurer l'environnement

Créer `.env.local` à la racine du projet:

```bash
# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGc...

# Services AI
QWEN_API_KEY=sk-...
WAN_IMAGE_API_KEY=wan-...
PIKA_API_KEY=pika-...
ELEVENLABS_API_KEY=el-...

# Remotion (optionnel)
REMOTION_RENDERER_URL=http://localhost:3001

# Webhook (optionnel)
WEBHOOK_URL=https://votre-domaine.com/api/webhook
WEBHOOK_SECRET=secret

# Configuration
MAX_RETRIES=3
RETRY_DELAY=5
```

### 3. Exécuter la migration

Dans l'éditeur SQL Supabase:

```sql
-- Fichier: supabase/migrations/20251004_jobs_table.sql
```

### 4. Vérifier la configuration

```bash
python -m workers.test_setup
```

## 🚀 Utilisation

### Démarrer le worker

Le worker traite automatiquement les jobs avec `status='pending'`:

```bash
# Unix/Mac
./start_worker.sh

# Windows
start_worker.bat

# Ou manuellement
python -m workers.worker
```

Le worker vérifie la base de données toutes les 10 secondes par défaut.

### Créer un job manuellement

```bash
python -m workers.langgraph_orchestrator "Crée une vidéo sur l'IA en 2024"
```

### Créer un job via Python

```python
import asyncio
from workers.langgraph_orchestrator import create_and_run_job

async def main():
    result = await create_and_run_job(
        user_id="user_123",
        prompt="Crée une vidéo sur les innovations IA"
    )
    
    if result['status'] == 'success':
        print(f"Vidéo prête: {result['video_url']}")
    else:
        print(f"Erreur: {result['error']}")

asyncio.run(main())
```

### Créer un job depuis Next.js

Créer une route API (si nécessaire):

```typescript
// app/api/jobs/create/route.ts
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const { prompt } = await request.json();
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: job } = await supabase
    .from('jobs')
    .insert({
      user_id: user.id,
      prompt: prompt,
      status: 'pending'
    })
    .select()
    .single();

  return Response.json({ job_id: job.id });
}
```

## 🔄 Workflow LangGraph

Le workflow est un graphe d'états qui progresse linéairement:

```
┌─────────┐
│  START  │
└────┬────┘
     │
     ▼
┌──────────────┐
│ qwen_script  │ ← Génère 4 scènes
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  wan_image   │ ← Crée l'image clé
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ pika_clips   │ ← 4 clips de 4s (avec seed)
└──────┬───────┘
       │
       ▼
┌──────────────────┐
│ elevenlabs_audio │ ← Voix + SRT
└──────┬───────────┘
       │
       ▼
┌───────────────────┐
│ remotion_assembly │ ← Assemblage final
└──────┬────────────┘
       │
       ▼
┌────────────────┐
│ webhook_notify │ ← Notification
└──────┬─────────┘
       │
       ▼
┌─────────┐
│   END   │
└─────────┘
```

À chaque étape, l'état complet est sauvegardé dans `jobs.app_state`.

## 🎯 Détails du Pipeline

### 1. Qwen (Script)

- Génère exactement 4 scènes
- Chaque scène contient:
  - `description` - Description visuelle
  - `narration` - Texte à narrer
- Si moins de 4 scènes générées, duplique la dernière

### 2. WAN Image (Image clé)

- Utilise la description de la première scène
- Style cinématique
- Résolution: 1920x1080 (16:9)

### 3. Pika (Clips vidéo)

- **4 clips de 4 secondes exactement**
- Premier clip: utilise l'image clé (`--image`)
- **Seed cohérent**: `base_seed + index` pour chaque clip
- Génération en parallèle pour performance

Exemple:
```python
clip_0: image=key_visual, seed=1234
clip_1: seed=1235
clip_2: seed=1236
clip_3: seed=1237
```

### 4. ElevenLabs (Audio)

- Combine toutes les narrations
- Génère l'audio
- Génère les sous-titres SRT avec timing

### 5. Remotion (Assemblage)

- Combine les 4 clips
- Ajoute l'audio
- Ajoute les sous-titres
- Format final: MP4 (H.264)

### 6. Webhook (Notification)

- Envoyé uniquement si `WEBHOOK_URL` est configuré
- Payload:
```json
{
  "job_id": "uuid",
  "user_id": "uuid",
  "status": "completed",
  "video_url": "https://...",
  "timestamp": "2025-10-04T...",
  "prompt": "..."
}
```

## 🔁 Gestion des erreurs

### Retry automatique

Chaque service API utilise `tenacity` pour retry automatique:
- 3 tentatives maximum par défaut
- Backoff exponentiel (4s, 8s, 16s)
- Configuré via `MAX_RETRIES` et `RETRY_DELAY`

### Persistance de l'état

L'état est sauvegardé après chaque étape:
- En cas d'échec, l'état est disponible pour debug
- Le `retry_count` est incrémenté dans la DB
- L'erreur est stockée dans `error_message`

### Échec définitif

Si `retry_count >= MAX_RETRIES`:
- Status → `failed`
- `error_message` contient la dernière erreur
- Pas de nouvelle tentative automatique

## 📊 Monitoring

### Vérifier l'état d'un job

```sql
SELECT 
    id,
    status,
    current_stage,
    retry_count,
    error_message,
    created_at,
    updated_at
FROM jobs 
WHERE id = 'job-uuid';
```

### Voir l'état complet

```sql
SELECT app_state FROM jobs WHERE id = 'job-uuid';
```

### Statistiques

```sql
SELECT 
    status,
    COUNT(*) as count,
    AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) as avg_duration_seconds
FROM jobs
GROUP BY status;
```

## ⚡ Performance

Temps estimé par étape:

| Étape | Temps | Notes |
|-------|-------|-------|
| Qwen | 5-10s | Génération LLM |
| WAN Image | 10-20s | Image HD |
| Pika (×4) | 2-5min | Parallèle |
| ElevenLabs | 10-30s | TTS + SRT |
| Remotion | 1-3min | Rendu vidéo |
| **Total** | **4-9min** | Pipeline complet |

## 🐛 Dépannage

### Le worker ne traite pas les jobs

1. Vérifier que le worker tourne:
```bash
ps aux | grep "workers.worker"
```

2. Vérifier les logs du worker

3. Vérifier qu'il y a des jobs pending:
```sql
SELECT COUNT(*) FROM jobs WHERE status = 'pending';
```

### Erreur "Table does not exist"

Exécuter la migration:
```bash
# Dans Supabase SQL Editor
-- Fichier: supabase/migrations/20251004_jobs_table.sql
```

### Erreur API "Unauthorized"

Vérifier dans `.env.local`:
- `SUPABASE_SERVICE_KEY` (pas anon key!)
- Les clés API des services

### Job bloqué en "in_progress"

Le worker a peut-être crashé. Marquer comme failed:
```sql
UPDATE jobs 
SET status = 'failed', error_message = 'Worker timeout'
WHERE id = 'job-uuid';
```

## 🔒 Sécurité

- ✅ RLS activé sur la table `jobs`
- ✅ Les users voient seulement leurs jobs
- ✅ Service role a accès complet (pour le worker)
- ✅ `.env.local` dans `.gitignore`
- ✅ Webhook avec signature HMAC (optionnel)

## 📚 Architecture des fichiers

```
workers/
├── __init__.py
├── langgraph_orchestrator.py  # Workflow principal
├── api_services.py            # Wrappers API
├── supabase_client.py         # Client DB
├── config.py                  # Configuration
├── worker.py                  # Worker de fond
├── test_setup.py              # Tests de config
├── requirements.txt           # Dépendances
├── README.md                  # Cette doc
└── start_worker.sh/.bat       # Scripts de démarrage
```

## 🚀 Prochaines étapes

1. **Frontend** - Créer l'interface pour soumettre des prompts
2. **Stockage** - Uploader l'audio sur Supabase Storage
3. **Queue** - Remplacer le polling par Redis/RabbitMQ
4. **Monitoring** - Ajouter Sentry ou LogRocket
5. **Scaling** - Plusieurs workers en parallèle

## 📖 Ressources

- [LangGraph](https://langchain-ai.github.io/langgraph/)
- [Supabase](https://supabase.com/docs)
- [Tenacity](https://tenacity.readthedocs.io/) (retry logic)
- [Pydantic Settings](https://docs.pydantic.dev/latest/concepts/pydantic_settings/)
