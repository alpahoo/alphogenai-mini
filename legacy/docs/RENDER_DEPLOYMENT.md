> ⚠️ **ARCHIVED / LEGACY (déploiement historique)**
>
> Ce document peut contenir des variables/étapes liées à un pipeline ancien.
> **Pipeline actuel**: SVI (vidéo) + Audio Ambience Service (audio + mix).
>
> Références à utiliser:
> - `README.md`
> - `QUICK_START.md`
> - `.env.example`
> - `MODEL_UPGRADES.md`

# Déploiement du Worker Python sur Render

## Configuration

Le worker Python doit être déployé comme un **Background Worker** sur Render.

### Option 1: Utiliser render.yaml (recommandé)

Le fichier `render.yaml` à la racine du projet configure automatiquement le worker.

**Commande de démarrage:**
```bash
python start_render_worker.py
```

### Option 2: Configuration manuelle

Si vous préférez configurer manuellement dans le dashboard Render:

1. **Type de service:** Background Worker
2. **Runtime:** Python 3.11
3. **Build Command:**
   ```bash
   pip install -r workers/requirements.txt
   ```
4. **Start Command:**
   ```bash
   python start_render_worker.py
   ```

### Variables d'environnement requises

Configurez ces variables dans le dashboard Render:

#### Supabase
- `NEXT_PUBLIC_SUPABASE_URL` - URL de votre projet Supabase
- `SUPABASE_SERVICE_ROLE_KEY` - Clé service role de Supabase

#### Services AI
- `QWEN_API_KEY` - Clé API Qwen
- `WAN_IMAGE_API_KEY` - Clé API WAN Image
- `WAN_VIDEO_API_KEY` - Clé API WAN Video
- `ELEVENLABS_API_KEY` - Clé API ElevenLabs

#### Configuration
- `VIDEO_ENGINE` - Moteur vidéo à utiliser (`wan` ou `pika`, défaut: `wan`)
- `REMOTION_RENDERER_URL` - URL du renderer Remotion (optionnel)
- `MAX_RETRIES` - Nombre max de tentatives (défaut: `3`)
- `RETRY_DELAY` - Délai entre tentatives en secondes (défaut: `5`)
- `JOB_TIMEOUT` - Timeout des jobs en secondes (défaut: `3600`)

#### Webhook (optionnel)
- `WEBHOOK_URL` - URL de webhook pour notifications
- `WEBHOOK_SECRET` - Secret pour sécuriser le webhook

## Vérification

Une fois déployé, vous devriez voir dans les logs Render:

```
============================================================
🎬 AlphogenAI Mini Worker
============================================================
Démarré: 2025-10-05T...
Intervalle de poll: 10s
Retries max: 3
============================================================

En attente de jobs...
```

## Dépannage

### Erreur: "can't open file workers/workers/worker.py" ou "No module named 'workers'"

❌ **Commandes incorrectes:**
```bash
python workers/worker.py
python -m workers.worker
```

✅ **Commande correcte:**
```bash
python start_render_worker.py
```

Ce script configure correctement le PYTHONPATH pour les imports relatifs.

### Le worker ne traite pas les jobs

1. Vérifiez que le worker est en cours d'exécution dans Render
2. Vérifiez les logs Render pour voir les erreurs
3. Vérifiez que toutes les variables d'environnement sont configurées
4. Testez la connexion Supabase avec `python -m workers.test_setup`

### Jobs bloqués en "pending"

Si vous avez des jobs bloqués, vous pouvez les réinitialiser dans Supabase:

```sql
UPDATE jobs
SET status = 'pending', retry_count = 0
WHERE status = 'in_progress' AND id = 'your-job-id';
```

## Architecture

```
┌─────────────────┐
│  Vercel (Next.js)│
│   Frontend       │
└────────┬─────────┘
         │ Crée job
         ▼
┌─────────────────┐
│    Supabase     │
│   (Database)    │
└────────┬─────────┘
         │ Poll jobs
         ▼
┌─────────────────┐
│  Render Worker  │
│  Python Worker  │
└─────────────────┘
         │
         ▼
    Traite jobs
```

## Monitoring

Pour surveiller le worker:

1. **Logs Render:** Dashboard Render → Logs
2. **Base de données:** Supabase → Table Editor → jobs
3. **Métriques:** Nombre de jobs pending/in_progress/completed/failed

## Ressources

- [Documentation Render - Background Workers](https://render.com/docs/background-workers)
- [Documentation Worker](workers/README.md)
