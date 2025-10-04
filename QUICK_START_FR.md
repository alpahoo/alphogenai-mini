# 🚀 Démarrage Rapide - AlphoGenAI Mini

## ✅ Ce qui est prêt

Orchestrateur LangGraph Python pour génération vidéo:
- **Qwen** → Script (4 scènes)
- **WAN Image** → Image clé
- **Pika** → 4 clips de 4s (avec --image + seed)
- **ElevenLabs** → Voix + SRT
- **Remotion** → Assemblage final
- **Webhook** → Notification

**État sauvegardé** dans `jobs.app_state` à chaque étape.

## 📦 Installation (5 min)

```bash
# 1. Installer dépendances Python
cd workers
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# 2. Configurer .env.local (à la racine du projet)
# Ajouter vos clés API:
# - SUPABASE_URL et SUPABASE_SERVICE_KEY
# - QWEN_API_KEY, WAN_IMAGE_API_KEY, PIKA_API_KEY, ELEVENLABS_API_KEY

# 3. Exécuter migration SQL dans Supabase
# Fichier: supabase/migrations/20251004_jobs_table.sql

# 4. Vérifier la config
python -m workers.test_setup
```

## 🎬 Utilisation

### Démarrer le worker

```bash
cd workers
./start_worker.sh  # Unix/Mac
# ou
start_worker.bat   # Windows
```

Le worker traite automatiquement les jobs `pending` dans la table `jobs`.

### Créer un job (CLI)

```bash
python -m workers.langgraph_orchestrator "Crée une vidéo sur l'IA en 2024"
```

### Créer un job (Python)

```python
import asyncio
from workers.langgraph_orchestrator import create_and_run_job

result = await create_and_run_job(
    user_id="user_123",
    prompt="Crée une vidéo sur les innovations IA"
)

print(result['video_url'] if result['status'] == 'success' else result['error'])
```

### Créer un job (SQL - pour tests)

```sql
INSERT INTO jobs (user_id, prompt, status)
VALUES ('test-user-id', 'Crée une vidéo sur l''espace', 'pending');

-- Le worker va automatiquement traiter ce job
```

## 📊 Vérifier l'état

```sql
-- Jobs récents
SELECT id, status, current_stage, created_at 
FROM jobs 
ORDER BY created_at DESC 
LIMIT 10;

-- État complet d'un job
SELECT app_state FROM jobs WHERE id = 'job-uuid';

-- Jobs en erreur
SELECT id, prompt, error_message, retry_count
FROM jobs 
WHERE status = 'failed';
```

## 🗄️ Structure de la table `jobs`

```sql
jobs
├─ id              UUID (PK)
├─ user_id         UUID (FK → auth.users)
├─ prompt          TEXT
├─ status          TEXT (pending/in_progress/completed/failed)
├─ app_state       JSONB ← État complet LangGraph
├─ current_stage   TEXT (qwen/wan_image/pika/elevenlabs/remotion)
├─ error_message   TEXT
├─ retry_count     INTEGER
├─ video_url       TEXT
├─ created_at      TIMESTAMPTZ
└─ updated_at      TIMESTAMPTZ
```

## 🎯 Exemple d'état sauvegardé

```json
{
  "job_id": "uuid",
  "prompt": "Crée une vidéo sur l'IA",
  "script": {
    "scenes": [
      { "description": "...", "narration": "..." },
      { "description": "...", "narration": "..." },
      { "description": "...", "narration": "..." },
      { "description": "...", "narration": "..." }
    ]
  },
  "key_visual": {
    "image_url": "https://..."
  },
  "clips": [
    { "video_url": "https://...", "seed": 1234, "index": 0, "duration": 4 },
    { "video_url": "https://...", "seed": 1235, "index": 1, "duration": 4 },
    { "video_url": "https://...", "seed": 1236, "index": 2, "duration": 4 },
    { "video_url": "https://...", "seed": 1237, "index": 3, "duration": 4 }
  ],
  "audio": {
    "srt_content": "1\n00:00:00,000 --> ...",
    "duration": 16.5
  },
  "final_video": {
    "video_url": "https://..."
  }
}
```

## 📁 Fichiers créés

```
workers/
├── langgraph_orchestrator.py  (484 lignes) ← Workflow principal
├── api_services.py            (360 lignes) ← Wrappers AI
├── supabase_client.py         (90 lignes)  ← Client DB
├── worker.py                  (147 lignes) ← Worker de fond
├── test_setup.py              (168 lignes) ← Tests config
├── config.py                  ← Configuration
├── requirements.txt           ← Dépendances
├── README.md                  ← Doc complète
└── start_worker.sh/.bat       ← Scripts démarrage

supabase/migrations/
└── 20251004_jobs_table.sql    ← Table jobs avec app_state
```

## ⚡ Performance

| Étape | Temps |
|-------|-------|
| Qwen | 5-10s |
| WAN Image | 10-20s |
| Pika (4 clips) | 2-5min |
| ElevenLabs | 10-30s |
| Remotion | 1-3min |
| **Total** | **4-9min** |

## 🔧 Configuration minimale (.env.local)

```bash
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGc...
QWEN_API_KEY=sk-...
WAN_IMAGE_API_KEY=wan-...
PIKA_API_KEY=pika-...
ELEVENLABS_API_KEY=el-...
```

## 🐛 Problèmes courants

### "Table 'jobs' does not exist"
→ Exécuter la migration SQL dans Supabase

### "API key invalid"
→ Vérifier les clés dans .env.local

### Worker ne traite pas les jobs
→ Vérifier que le worker tourne: `ps aux | grep worker`

### Job bloqué en "in_progress"
```sql
UPDATE jobs SET status = 'failed' WHERE id = 'job-uuid';
```

## 📚 Documentation complète

- **`workers/README.md`** - Guide complet en français
- **`LANGGRAPH_SETUP.md`** - Setup détaillé
- **`ORCHESTRATOR_V2.md`** - Résumé des modifications

## 🎯 Points clés

✅ **Pika:** 4 clips de 4 secondes avec seed pour cohérence  
✅ **État:** Sauvegardé dans `jobs.app_state` à chaque étape  
✅ **Retry:** Automatique avec tenacity + compteur dans DB  
✅ **Webhook:** Notification optionnelle quand vidéo prête  
✅ **Pas de frontend:** Code backend uniquement  

## 🚀 Prêt!

L'orchestrateur est **production-ready**. Il suffit de:
1. Configurer les clés API
2. Exécuter la migration
3. Démarrer le worker

**Durée totale:** ~5 minutes ⚡
