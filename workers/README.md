# AlphoGenAI Mini — Worker (pipeline actuel)

> Note: ce dépôt a évolué. Ce `README` décrit le **pipeline actuel SVI + Audio**.
> Pour la stratégie “modèles plus récents”, voir `MODEL_UPGRADES.md`.

Le worker Python poll la table `jobs` et exécute le pipeline:

1. **Cache** (table `video_cache`, SHA-256(prompt)) — si HIT: job `done` immédiat
2. **SVI** — génération vidéo via `SVI_ENDPOINT_URL`
3. **Audio service** — génération audio + sélection CLAP via `AUDIO_BACKEND_URL`
4. **Mix** — intégration audio dans la vidéo via `POST /video/mix`
5. **Update Supabase** — mise à jour `jobs.video_url`, `jobs.audio_url`, `jobs.output_url_final`, `jobs.final_url`

## 🗄️ Structure de données

### Table `jobs`

```sql
CREATE TABLE jobs (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    prompt TEXT NOT NULL,
    status TEXT,  -- pending, in_progress, done, failed, cancelled
    app_state JSONB,  -- État complet du workflow LangGraph
    current_stage TEXT,  -- e.g. starting, video_generated, completed
    error_message TEXT,
    retry_count INTEGER,
    video_url TEXT,
    audio_url TEXT,
    output_url_final TEXT,
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
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configurer `.env.local`

Créer `.env.local` à la racine du projet (ou remplir depuis `.env.example`):

```bash
# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Runpod
RUNPOD_API_KEY=your-runpod-api-key
SVI_ENDPOINT_URL=https://api.runpod.ai/v2/YOUR_SVI_ENDPOINT_ID
AUDIO_BACKEND_URL=https://api.runpod.ai/v2/YOUR_AUDIO_ENDPOINT_ID

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

### Via l'API Next.js (auth requise)

**Créer un job:**

```bash
curl -X POST http://localhost:3000/api/jobs \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Créer une vidéo sur l’IA en 2026","duration_sec":60,"resolution":"1920x1080","fps":24}'
```

**Vérifier le statut:**

```bash
curl http://localhost:3000/api/jobs/<uuid>
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

## 📊 Performance

| Étape | Temps | Notes |
|-------|-------|-------|
| Cache HIT | < 1s | `video_cache` |
| SVI | 2-8 min | selon durée/résolution |
| Audio + CLAP | 1-3 min | selon backend |
| Mix + upload | 1-2 min | dépend du stockage |
| **Total (MISS)** | **~4-12 min** | pipeline complet |

## 🏗️ Architecture (workers/)

```
workers/
├── worker.py              # boucle de polling + orchestration
├── svi_client.py          # client HTTP SVI (generate_film / generate_shot)
├── audio_orchestrator.py  # audio + CLAP + appel /video/mix
├── supabase_client.py     # jobs + video_cache
└── config.py              # variables d’env (pydantic)
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
