# ✅ LangGraph Orchestrator - AlphoGenAI Mini

Orchestrateur Python avec LangGraph pour la génération vidéo IA.

## 🎯 Résumé

Pipeline complet : **Qwen → WAN Image → Pika (4×4s) → ElevenLabs → Remotion**

État sauvegardé à chaque étape dans **`jobs.app_state`** (Supabase).

## 📁 Fichiers Créés

### Workers Python (`/workers/`)
✅ `langgraph_orchestrator.py` - Orchestrateur LangGraph (6 étapes)  
✅ `api_services.py` - Wrappers API pour tous les services IA  
✅ `supabase_client.py` - Client DB avec sauvegarde d'état  
✅ `worker.py` - Worker background qui poll les jobs  
✅ `config.py` - Configuration avec Pydantic  
✅ `test_setup.py` - Vérification du setup  
✅ `requirements.txt` - Dépendances Python  
✅ `README.md` - Documentation complète  
✅ `start_worker.sh` / `.bat` - Scripts de démarrage  

### API Next.js
✅ `app/api/generate-video/route.ts` - API endpoint (POST + GET)

### Database
✅ `supabase/migrations/20251004_alphogenai_jobs_table.sql` - Table `jobs` avec RLS

### Config
✅ `.env.local` - Variables d'environnement avec placeholders  
✅ `.env.example` - Template de configuration  

## 🎬 Pipeline Détaillé

```
┌─────────────────────────────────────────────────┐
│         Orchestrateur LangGraph                 │
├─────────────────────────────────────────────────┤
│                                                 │
│  Étape 1 : Qwen                                │
│  ├─ Input  : Prompt utilisateur                │
│  └─ Output : Script avec 4 scènes              │
│                                                 │
│  Étape 2 : WAN Image                           │
│  ├─ Input  : Description première scène        │
│  └─ Output : Image clé 1920×1080               │
│                                                 │
│  Étape 3 : Pika                                │
│  ├─ Input  : 4 descriptions + image clé        │
│  ├─ Params : --image + seed (cohérence)        │
│  └─ Output : 4 clips de 4 secondes             │
│                                                 │
│  Étape 4 : ElevenLabs                          │
│  ├─ Input  : Narration complète                │
│  └─ Output : Audio MP3 + fichier SRT           │
│                                                 │
│  Étape 5 : Remotion                            │
│  ├─ Input  : Clips + audio + SRT               │
│  └─ Output : Vidéo finale MP4                  │
│                                                 │
│  Étape 6 : Webhook                             │
│  └─ Notification de complétion                 │
│                                                 │
│  État sauvegardé à CHAQUE étape dans           │
│  jobs.app_state (permet reprise sur échec)     │
│                                                 │
└─────────────────────────────────────────────────┘
```

## 🗄️ Structure Base de Données

### Table `jobs`

```sql
CREATE TABLE jobs (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    prompt TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    app_state JSONB DEFAULT '{}',  -- ⭐ État complet du workflow
    result JSONB,
    error_message TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
```

### Contenu de `app_state`

```json
{
  "prompt": "Créer une vidéo sur l'IA",
  "script": {
    "script": "...",
    "scenes": [...]  // 4 scènes
  },
  "key_visual": {
    "image_url": "https://...",
    "image_id": "..."
  },
  "clips": [
    {
      "index": 0,
      "video_url": "https://...",
      "seed": 123456,
      "duration": 4
    },
    // 3 autres clips...
  ],
  "audio": {
    "audio_url": "https://...",
    "srt_content": "1\n00:00:00,000 --> ...",
    "duration": 16.0
  },
  "final_video": {
    "video_url": "https://...",
    "render_id": "..."
  }
}
```

## 🚀 Installation Rapide

### 1. Python

```bash
cd workers
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configuration

Éditer `.env.local` :

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJxxx...

QWEN_API_KEY=sk-xxx
WAN_IMAGE_API_KEY=wan-xxx
PIKA_API_KEY=pika-xxx
ELEVENLABS_API_KEY=el-xxx
```

### 3. Base de Données

Exécuter dans Supabase SQL Editor :
```sql
-- Fichier: supabase/migrations/20251004_alphogenai_jobs_table.sql
```

### 4. Démarrer

```bash
# Terminal 1 : Next.js
npm run dev

# Terminal 2 : Worker Python
cd workers
./start_worker.sh
```

### 5. Tester

```bash
curl -X POST http://localhost:3000/api/generate-video \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Test vidéo IA"}'
```

## 🎯 Spécifications Pika

Les clips sont générés avec des paramètres spécifiques :

- **Durée** : 4 secondes (pas 5)
- **Flag `--image`** : Activé pour tous les clips
- **Seed** : Incrémenté (`base_seed + index`)
- **Premier clip** : Utilise l'image clé WAN comme référence visuelle

Code :
```python
await self.pika.generate_clip(
    prompt=scene["description"],
    image_url=key_visual_url if i == 0 else None,
    seed=base_seed + i,
    duration=4
)
```

## 🔄 Retry Logic

- **3 tentatives** par étape (configurable)
- **Exponential backoff** avec `tenacity`
- **État persisté** : En cas d'échec, l'état est sauvegardé
- **Reprise possible** : Peut reprendre depuis la dernière étape réussie

## 🔔 Webhook

Envoyé automatiquement quand la vidéo est prête :

```json
POST ${WEBHOOK_URL}
Headers: {
  "Content-Type": "application/json",
  "X-Webhook-Secret": "${WEBHOOK_SECRET}"
}
Body: {
  "job_id": "uuid",
  "user_id": "uuid",
  "status": "completed",
  "video_url": "https://...",
  "timestamp": "2025-10-04T12:00:00Z"
}
```

## 📈 Performance

| Étape | Temps | Notes |
|-------|-------|-------|
| Qwen | 5-10s | Génération LLM |
| WAN Image | 10-20s | Image 1920×1080 |
| Pika (4 clips) | 2-5min | Génération parallèle |
| ElevenLabs | 10-30s | TTS + SRT |
| Remotion | 1-3min | Assemblage vidéo |
| **TOTAL** | **4-9min** | Pipeline complet |

## 🐛 Dépannage

### Job bloqué

```sql
SELECT id, status, app_state FROM jobs WHERE id = 'xxx';
UPDATE jobs SET status = 'pending' WHERE id = 'xxx';
```

### Worker ne traite pas

1. Vérifier que le worker tourne
2. Vérifier les logs du worker
3. Vérifier `.env.local`

### Erreur API

```bash
cd workers
python -m workers.test_setup
```

## 📝 Commandes Utiles

```bash
# Démarrer worker
./start_worker.sh

# Test direct
python -m workers.langgraph_orchestrator "Prompt de test"

# Vérifier setup
python -m workers.test_setup

# Voir les jobs
psql> SELECT id, status FROM jobs ORDER BY created_at DESC LIMIT 10;
```

## ✨ Avantages

✅ **État sauvegardé** : Pas de perte de progression  
✅ **Retry automatique** : Robuste face aux erreurs API  
✅ **Cache intégré** : Évite les doublons  
✅ **Pika optimisé** : 4s + seed pour cohérence visuelle  
✅ **Webhook** : Notifications en temps réel  
✅ **RLS** : Sécurité au niveau base de données  
✅ **Pas de frontend** : Focus sur l'orchestration  

## 🔒 Sécurité

- Row Level Security (RLS) sur table `jobs`
- Service role key côté worker uniquement
- API keys jamais exposées au frontend
- Webhook signature avec secret partagé

## ✅ Checklist Finale

- [ ] Python 3.9+ installé
- [ ] Dépendances installées
- [ ] `.env.local` configuré avec toutes les clés
- [ ] Migration Supabase exécutée
- [ ] Worker démarré et en attente
- [ ] Test réussi

---

**Status** : ✅ Production Ready  
**Version** : 1.0.0  
**Date** : 2025-10-04
