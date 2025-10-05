# Orchestrateur LangGraph AlphogenAI Mini

## 🎬 Architecture du Pipeline

Le workflow LangGraph exécute les étapes suivantes dans l'ordre :

```
┌─────────────────────────────────────────────────────────────┐
│                  Pipeline AlphogenAI Mini                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1️⃣  Qwen (Script)                                          │
│      └─ Génère un script avec exactement 4 scènes          │
│                                                              │
│  2️⃣  WAN Image (Image Clé)                                  │
│      └─ Crée une image 1920x1080 de la première scène      │
│                                                              │
│  3️⃣  Pika (4 Clips Vidéo)                                   │
│      └─ Génère 4 clips de 4s avec --image + seed           │
│         • Clip 1: utilise l'image clé + seed                │
│         • Clips 2-4: seed incrémenté pour cohérence         │
│                                                              │
│  4️⃣  ElevenLabs (Audio + SRT)                               │
│      └─ Génère voix-off + sous-titres synchronisés         │
│                                                              │
│  5️⃣  Remotion (Assemblage)                                  │
│      └─ Assemble clips + audio + SRT en vidéo finale       │
│                                                              │
│  6️⃣  Webhook (Notification)                                 │
│      └─ Envoie notification quand vidéo prête               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## 💾 Persistance de l'État

**Table Supabase : `jobs`**

L'état complet du workflow est sauvegardé après chaque étape dans `jobs.app_state` :

```typescript
{
  id: UUID,
  user_id: UUID,
  prompt: string,
  status: "pending" | "in_progress" | "completed" | "failed",
  
  // État LangGraph complet
  app_state: {
    prompt: string,
    script: {
      script: string,
      scenes: [
        {description: string, narration: string},
        {description: string, narration: string},
        {description: string, narration: string},
        {description: string, narration: string}
      ],
      metadata: {...}
    },
    key_visual: {
      image_url: string,
      image_id: string,
      metadata: {...}
    },
    clips: [
      {index: 0, video_url: string, duration: 4, seed: number, ...},
      {index: 1, video_url: string, duration: 4, seed: number, ...},
      {index: 2, video_url: string, duration: 4, seed: number, ...},
      {index: 3, video_url: string, duration: 4, seed: number, ...}
    ],
    audio: {
      audio_bytes: bytes,
      srt_content: string,
      duration: number
    },
    final_video: {
      video_url: string,
      render_id: string
    },
    retry_count: number,
    last_stage: string,
    timestamp: string
  },
  
  current_stage: string,
  error_message: string | null,
  video_url: string | null,
  retry_count: number,
  created_at: timestamp,
  updated_at: timestamp
}
```

## 🔄 Retry Logic

- **Max retries** : 3 (configurable via `MAX_RETRIES`)
- **Délai entre retries** : 5 secondes (configurable via `RETRY_DELAY`)
- **Comportement** :
  - En cas d'erreur, incrémente `retry_count`
  - Si `retry_count < MAX_RETRIES`, le worker retraite le job
  - Si `retry_count >= MAX_RETRIES`, marque le job comme `failed`

## 📡 Webhook

Quand la vidéo est prête, un webhook POST est envoyé :

```bash
POST <WEBHOOK_URL>
Headers:
  Content-Type: application/json
  X-Webhook-Secret: <WEBHOOK_SECRET>

Body:
{
  "job_id": "uuid",
  "user_id": "uuid",
  "status": "completed",
  "video_url": "https://...",
  "prompt": "...",
  "timestamp": "2025-10-04T..."
}
```

## 🚀 Utilisation

### 1. Installation

```bash
cd workers
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configuration

Créer `.env.local` avec :

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=your-service-key

# AI Services
QWEN_API_KEY=your-qwen-key
WAN_IMAGE_API_KEY=your-wan-key
PIKA_API_KEY=your-pika-key
ELEVENLABS_API_KEY=your-elevenlabs-key
REMOTION_RENDERER_URL=http://localhost:3001

# Webhook (optionnel)
WEBHOOK_URL=https://your-domain.com/api/webhook
WEBHOOK_SECRET=your-secret

# Retry
MAX_RETRIES=3
RETRY_DELAY=5
```

### 3. Migration Base de Données

Exécuter dans Supabase SQL Editor :

```sql
-- Fichier: supabase/migrations/20251004_jobs_table.sql
```

Ceci crée la table `jobs` avec :
- Colonne `app_state` JSONB pour l'état LangGraph
- RLS activé (users voient seulement leurs jobs)
- Indexes pour performance

### 4. Démarrer le Worker

```bash
# Option 1: Script automatique
./start_worker.sh  # Unix/Mac
start_worker.bat   # Windows

# Option 2: Manuel
python -m workers.worker
```

### 5. Créer un Job

**Via API :**

```bash
curl -X POST http://localhost:3000/api/generate-video \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"prompt": "Créer une vidéo sur l'\''IA en 2024"}'
```

**Via Python :**

```bash
python -m workers.langgraph_orchestrator "Vidéo sur l'IA"
```

### 6. Vérifier le Statut

```bash
curl http://localhost:3000/api/generate-video?job_id=<uuid> \
  -H "Authorization: Bearer <token>"
```

## 📊 Détails Techniques

### Paramètres Pika

- **Duration** : 4 secondes par clip
- **--image** : Le premier clip utilise l'image clé de WAN Image
- **seed** : Chaque clip a un seed (base_seed + index) pour cohérence visuelle

```python
# Exemple de génération
base_seed = random.randint(1000, 9999)

# Clip 1: avec image clé
await pika.generate_clip(
    prompt=scene1_description,
    image_url=key_visual_url,
    duration=4,
    seed=base_seed
)

# Clips 2-4: sans image, seed incrémenté
for i in range(1, 4):
    await pika.generate_clip(
        prompt=scene_description,
        image_url=None,
        duration=4,
        seed=base_seed + i
    )
```

### Parallélisation

Les 4 clips Pika sont générés **en parallèle** pour optimiser le temps :

```python
tasks = [
    pika.generate_clip(...),
    pika.generate_clip(...),
    pika.generate_clip(...),
    pika.generate_clip(...)
]
clips = await asyncio.gather(*tasks)
```

## 🏗️ Structure du Code

```
workers/
├── langgraph_orchestrator.py    # Orchestrateur principal
│   ├── AlphogenAIOrchestrator   # Classe principale
│   ├── _build_workflow()        # Construction du graph LangGraph
│   ├── _node_qwen_script()      # Nœud 1: Qwen
│   ├── _node_wan_image()        # Nœud 2: WAN Image
│   ├── _node_pika_clips()       # Nœud 3: Pika (4 clips)
│   ├── _node_elevenlabs_audio() # Nœud 4: ElevenLabs
│   ├── _node_remotion_assembly()# Nœud 5: Remotion
│   ├── _node_webhook_notify()   # Nœud 6: Webhook
│   └── _save_state()            # Sauvegarde jobs.app_state
│
├── api_services.py               # Wrappers API
│   ├── QwenService
│   ├── WANImageService
│   ├── PikaService              # Supporte --image + seed
│   ├── ElevenLabsService
│   └── RemotionService
│
├── supabase_client.py            # Client DB
│   ├── create_job()
│   ├── update_job_state()       # Sauvegarde app_state
│   ├── increment_retry()
│   └── get_pending_jobs()
│
├── worker.py                     # Worker background
└── config.py                     # Configuration
```

## ⏱️ Performance Attendue

| Étape | Temps | Notes |
|-------|-------|-------|
| Qwen (Script) | 5-10s | Génération LLM |
| WAN Image | 10-20s | 1 image 1920x1080 |
| Pika (4 clips) | 2-5min | Parallèle, 4s/clip |
| ElevenLabs | 10-30s | TTS + SRT |
| Remotion | 1-3min | Assemblage final |
| **Total** | **4-9min** | Pipeline complet |

## 🐛 Debugging

### Vérifier l'état d'un job

```sql
SELECT 
  id, 
  status, 
  current_stage, 
  app_state->>'last_stage' as last_stage,
  error_message,
  retry_count
FROM jobs 
WHERE id = 'your-job-id';
```

### Voir tous les jobs en cours

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

## ✅ Checklist de Setup

- [ ] Python 3.9+ installé
- [ ] Dependencies installées (`pip install -r requirements.txt`)
- [ ] `.env.local` configuré avec toutes les API keys
- [ ] Migration `20251004_jobs_table.sql` exécutée
- [ ] Test setup passé (`python -m workers.test_setup`)
- [ ] Worker démarré (`./start_worker.sh`)
- [ ] Job test créé et traité avec succès

## 📚 Ressources

- [LangGraph Docs](https://langchain-ai.github.io/langgraph/)
- [Supabase Docs](https://supabase.com/docs)
- [Pika API Docs](https://pika.art/docs)
- [ElevenLabs API Docs](https://elevenlabs.io/docs)

---

**Version** : 2.0  
**Dernière mise à jour** : 2025-10-04  
**Status** : ✅ Production Ready
