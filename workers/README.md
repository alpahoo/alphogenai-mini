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

**L'état complet est sauvegardé dans `app_state` après chaque étape:**

```json
{
  "prompt": "...",
  "script": {...},
  "key_visual": {...},
  "clips": [{}, {}, {}, {}],
  "audio": {...},
  "final_video": {...},
  "retry_count": 0,
  "last_stage": "pika_clips",
  "timestamp": "2025-10-04T..."
}
```

## 🚀 Installation

### 1. Installer les dépendances Python

```bash
cd workers
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configurer `.env.local`

Créer `.env.local` à la racine du projet:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=your-service-key

# AI Services
QWEN_API_KEY=your-qwen-key
QWEN_API_BASE=https://dashscope.aliyuncs.com/compatible-mode/v1

WAN_IMAGE_API_KEY=your-wan-key
WAN_IMAGE_API_BASE=https://api.wan.ai/v1

PIKA_API_KEY=your-pika-key
PIKA_API_BASE=https://api.pika.art/v1

ELEVENLABS_API_KEY=your-elevenlabs-key
ELEVENLABS_API_BASE=https://api.elevenlabs.io/v1

REMOTION_RENDERER_URL=http://localhost:3001

# Webhook (optionnel)
WEBHOOK_URL=https://your-domain.com/api/webhook
WEBHOOK_SECRET=your-secret

# Retry config
MAX_RETRIES=3
RETRY_DELAY=5
JOB_TIMEOUT=3600
```

### 3. Exécuter la migration

Ouvrir le SQL Editor de Supabase et exécuter:

```sql
-- File: supabase/migrations/20251004_jobs_table.sql
```

### 4. Tester la configuration

```bash
python -m workers.test_setup
```

Si tout est OK, vous verrez:

```
✅ All required environment variables are set!
✅ Supabase connection successful!
✅ Job creation and retrieval working!
🎉 All tests passed! Your setup is ready.
```

### 5. Démarrer le worker

```bash
# Unix/Mac
./start_worker.sh

# Windows
start_worker.bat

# Ou manuellement
python -m workers.worker
```

## 📡 Utilisation

### Via l'API Next.js

**Créer un job:**

```bash
curl -X POST http://localhost:3000/api/generate-video \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"prompt": "Créer une vidéo sur l'\''IA en 2024"}'
```

**Vérifier le statut:**

```bash
curl http://localhost:3000/api/generate-video?job_id=<uuid> \
  -H "Authorization: Bearer <token>"
```

### Directement en Python

```bash
python -m workers.langgraph_orchestrator "Créer une vidéo sur l'IA"
```

### Depuis le code Python

```python
from workers.langgraph_orchestrator import create_and_run_job

result = await create_and_run_job(
    user_id="user_123",
    prompt="Créer une vidéo sur l'IA en 2024"
)

print(f"Video URL: {result['video_url']}")
```

## 🔄 Retry Logic

- **Tentatives max:** 3 (configurable)
- **Délai entre tentatives:** 5 secondes (configurable)
- **Comportement:**
  - En cas d'erreur, `retry_count` est incrémenté
  - Si `retry_count < MAX_RETRIES`, le job est retraité
  - Si `retry_count >= MAX_RETRIES`, le job est marqué `failed`

## 📡 Webhook

Quand la vidéo est prête, un POST est envoyé au webhook:

```json
{
  "job_id": "uuid",
  "user_id": "uuid",
  "status": "completed",
  "video_url": "https://...",
  "prompt": "...",
  "timestamp": "2025-10-04T..."
}
```

Headers:
- `Content-Type: application/json`
- `X-Webhook-Secret: <WEBHOOK_SECRET>` (si configuré)

## 🎥 Détails Pika

Les 4 clips sont générés avec ces paramètres:

- **Duration:** 4 secondes par clip
- **--image:** Le premier clip utilise l'image clé de WAN Image
- **seed:** Chaque clip a un seed unique (base_seed + index) pour cohérence visuelle

```python
base_seed = random.randint(1000, 9999)

# Clip 1: avec image clé
pika.generate_clip(
    prompt=scene1,
    image_url=key_visual_url,
    duration=4,
    seed=base_seed
)

# Clips 2-4: seed incrémenté
for i in range(1, 4):
    pika.generate_clip(
        prompt=scene,
        image_url=None,
        duration=4,
        seed=base_seed + i
    )
```

Les 4 clips sont générés **en parallèle** avec `asyncio.gather()`.

## 📊 Performance

| Étape | Temps | Notes |
|-------|-------|-------|
| Qwen | 5-10s | LLM generation |
| WAN Image | 10-20s | 1 image 1920x1080 |
| Pika | 2-5min | 4 clips en parallèle |
| ElevenLabs | 10-30s | TTS + SRT |
| Remotion | 1-3min | Assemblage final |
| **Total** | **4-9min** | Pipeline complet |

## 🏗️ Architecture

```
workers/
├── langgraph_orchestrator.py
│   └── AlphogenAIOrchestrator
│       ├── _build_workflow()        # Construit le graph LangGraph
│       ├── _node_qwen_script()      # Étape 1
│       ├── _node_wan_image()        # Étape 2
│       ├── _node_pika_clips()       # Étape 3 (4 clips 4s)
│       ├── _node_elevenlabs_audio() # Étape 4
│       ├── _node_remotion_assembly()# Étape 5
│       ├── _node_webhook_notify()   # Étape 6
│       └── _save_state()            # Sauvegarde app_state
│
├── api_services.py
│   ├── QwenService
│   ├── WANImageService
│   ├── PikaService               # Supporte --image + seed
│   ├── ElevenLabsService
│   └── RemotionService
│
├── supabase_client.py
│   ├── create_job()
│   ├── update_job_state()        # Sauvegarde dans app_state
│   ├── increment_retry()
│   └── get_pending_jobs()
│
├── worker.py                     # Worker background
├── config.py                     # Configuration
└── test_setup.py                 # Tests de setup
```

## 🐛 Debugging

### Voir l'état d'un job

```sql
SELECT 
  id,
  status,
  current_stage,
  app_state->>'last_stage' as last_stage,
  error_message,
  retry_count,
  video_url
FROM jobs
WHERE id = 'your-job-id';
```

### Tous les jobs en cours

```sql
SELECT id, status, current_stage, created_at
FROM jobs
WHERE status = 'in_progress'
ORDER BY created_at DESC;
```

### Réinitialiser un job bloqué

```sql
UPDATE jobs
SET status = 'pending', retry_count = 0
WHERE id = 'your-job-id';
```

### Logs du worker

Le worker affiche des logs détaillés:

```
🎬 AlphogenAI Mini - Video Worker
======================================================================
Démarré à: 2025-10-04T...
======================================================================

📋 Nouveau Job: abc-123
👤 User: user-456
💬 Prompt: Créer une vidéo...

[Qwen] Génération du script pour job abc-123
[Qwen] ✓ Script généré: 4 scènes

[WAN Image] Génération de l'image clé pour job abc-123
[WAN Image] ✓ Image clé générée: https://...

[Pika] Génération de 4 clips pour job abc-123
[Pika] ✓ 4 clips générés (4s chacun)

[ElevenLabs] Génération audio pour job abc-123
[ElevenLabs] ✓ Audio généré: 16.5s

[Remotion] Assemblage vidéo finale pour job abc-123
[Remotion] ✓ Vidéo finale: https://...

[Webhook] Envoi notification pour job abc-123
[Webhook] ✓ Notification envoyée

✅ Job abc-123 terminé avec succès!
🎥 Vidéo: https://...
```

## 🔧 Troubleshooting

**Problème:** "API key invalid"
- Vérifier les clés dans `.env.local`
- S'assurer qu'elles n'ont pas de guillemets

**Problème:** "Supabase connection failed"
- Vérifier `SUPABASE_URL` et `SUPABASE_SERVICE_KEY`
- Tester avec `python -m workers.test_setup`

**Problème:** "Table 'jobs' does not exist"
- Exécuter la migration `20251004_jobs_table.sql` dans Supabase

**Problème:** "Worker ne traite pas les jobs"
- Vérifier que le worker est lancé: `python -m workers.worker`
- Regarder les logs du worker
- Vérifier qu'il y a des jobs `pending` dans la DB

**Problème:** "Job bloqué en 'in_progress'"
- Le worker a peut-être crashé
- Réinitialiser le job avec la commande SQL ci-dessus
- Redémarrer le worker

## 📚 Ressources

- [LangGraph Documentation](https://langchain-ai.github.io/langgraph/)
- [Supabase Documentation](https://supabase.com/docs)
- [Documentation complète](../ALPHOGENAI_ORCHESTRATOR.md)

## ✅ Checklist

- [ ] Python 3.9+ installé
- [ ] Dépendances installées
- [ ] `.env.local` configuré avec toutes les clés
- [ ] Migration `20251004_jobs_table.sql` exécutée
- [ ] Test setup réussi
- [ ] Worker démarré
- [ ] Job test créé et complété

---

**Version:** 2.0  
**Dernière mise à jour:** 2025-10-04
