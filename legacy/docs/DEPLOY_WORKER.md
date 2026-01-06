> ⚠️ **ARCHIVED / LEGACY (déploiement historique)**
>
> Ce document contient des instructions de déploiement liées à des pipelines anciens.
> **Pipeline actuel**: SVI (vidéo) + Audio Ambience Service (audio + mix).
>
> Références à utiliser:
> - `STATUS.txt` (source de vérité)
> - `README.md`
> - `QUICK_START.md`
> - `AUDIO_AMBIENCE_README.md`
> - `MODEL_UPGRADES.md`

# 🚀 Déploiement du Worker AlphogenAI Mini

Le worker Python doit tourner en permanence pour traiter les jobs de génération vidéo.

## 📋 Prérequis

Le worker a besoin des variables d'environnement suivantes :

### Variables Supabase
- `SUPABASE_URL` - URL de votre projet Supabase
- `SUPABASE_SERVICE_ROLE_KEY` - Clé service role de Supabase

### Variables API Services
- `QWEN_API_KEY` - Clé API Qwen (Alibaba Cloud)
- `DASHSCOPE_API_KEY` - Clé API DashScope (pour WAN Video)
- `WAN_IMAGE_API_KEY` - Clé API WAN Image
- `PIKA_API_KEY` - Clé API Pika (si VIDEO_ENGINE=pika)
- `ELEVENLABS_API_KEY` - Clé API ElevenLabs
- `REMOTION_SITE_ID` - ID du site Remotion
- `REMOTION_SECRET_KEY` - Clé secrète Remotion

### Variables de configuration (optionnelles)
- `VIDEO_ENGINE` - Moteur vidéo à utiliser (`wan`, `pika`, ou `stills`) - défaut: `wan`
- `QWEN_API_BASE` - Base URL Qwen - défaut: `https://dashscope.aliyuncs.com/compatible-mode/v1`
- `MAX_RETRIES` - Nombre de tentatives max - défaut: `3`
- `POLL_INTERVAL` - Intervalle de polling en secondes - défaut: `10`

---

## Option 1: Déployer sur Railway.app (Recommandé) ✨

Railway offre un plan gratuit et est très simple à utiliser.

### Étapes:

1. **Créer un compte sur Railway**
   - Aller sur https://railway.app
   - Se connecter avec GitHub

2. **Créer un nouveau projet**
   - Cliquer sur "New Project"
   - Sélectionner "Deploy from GitHub repo"
   - Choisir votre repository `alphogenai-mini`

3. **Configurer le service**
   - Railway détectera automatiquement le `railway.toml`
   - Le Dockerfile sera utilisé automatiquement

4. **Ajouter les variables d'environnement**
   - Aller dans l'onglet "Variables"
   - Ajouter toutes les variables listées ci-dessus
   - Cliquer sur "Deploy"

5. **Vérifier le déploiement**
   - Aller dans l'onglet "Deployments"
   - Vérifier les logs pour confirmer que le worker démarre
   - Vous devriez voir: "🎬 AlphogenAI Mini Worker" dans les logs

### Commandes Railway CLI (optionnel):

```bash
# Installer Railway CLI
npm i -g @railway/cli

# Login
railway login

# Déployer
railway up

# Voir les logs
railway logs
```

---

## Option 2: Déployer sur Render.com

Render offre également un plan gratuit avec des workers.

### Étapes:

1. **Créer un compte sur Render**
   - Aller sur https://render.com
   - Se connecter avec GitHub

2. **Créer un nouveau Worker**
   - Cliquer sur "New +" → "Worker"
   - Connecter votre repository GitHub
   - Sélectionner la branche `main`

3. **Configurer le service**
   - Render détectera le `render.yaml` automatiquement
   - Ou configurer manuellement:
     - **Dockerfile Path**: `./Dockerfile.worker`
     - **Docker Command**: `python -m workers.worker`

4. **Ajouter les variables d'environnement**
   - Dans la section "Environment"
   - Ajouter toutes les variables listées ci-dessus
   - Cliquer sur "Create Worker"

5. **Vérifier le déploiement**
   - Les logs s'afficheront automatiquement
   - Vous devriez voir le worker démarrer et commencer à poller

---

## Option 3: Docker local (pour développement/test)

### Construire l'image:

```bash
docker build -f Dockerfile.worker -t alphogenai-worker .
```

### Lancer le container:

```bash
docker run -d \
  --name alphogenai-worker \
  -e SUPABASE_URL="your_url" \
  -e SUPABASE_SERVICE_ROLE_KEY="your_key" \
  -e QWEN_API_KEY="your_key" \
  -e DASHSCOPE_API_KEY="your_key" \
  -e WAN_IMAGE_API_KEY="your_key" \
  -e ELEVENLABS_API_KEY="your_key" \
  -e REMOTION_SITE_ID="your_id" \
  -e REMOTION_SECRET_KEY="your_key" \
  -e VIDEO_ENGINE="wan" \
  alphogenai-worker
```

### Voir les logs:

```bash
docker logs -f alphogenai-worker
```

### Arrêter le container:

```bash
docker stop alphogenai-worker
docker rm alphogenai-worker
```

---

## Option 4: AWS EC2 / VPS

### Prérequis:
- Un serveur Linux (Ubuntu 22.04 recommandé)
- Python 3.11+ installé
- Git installé

### Installation:

```bash
# Cloner le repo
git clone https://github.com/alpahoo/alphogenai-mini.git
cd alphogenai-mini

# Installer les dépendances
cd workers
pip install -r requirements.txt

# Créer un fichier .env
cat > .env.local << EOF
SUPABASE_URL=your_url
SUPABASE_SERVICE_ROLE_KEY=your_key
QWEN_API_KEY=your_key
DASHSCOPE_API_KEY=your_key
WAN_IMAGE_API_KEY=your_key
ELEVENLABS_API_KEY=your_key
REMOTION_SITE_ID=your_id
REMOTION_SECRET_KEY=your_key
VIDEO_ENGINE=wan
EOF

# Lancer le worker
python -m workers.worker
```

### Utiliser systemd pour démarrage automatique:

```bash
# Créer un service systemd
sudo nano /etc/systemd/system/alphogenai-worker.service
```

Contenu du fichier:

```ini
[Unit]
Description=AlphogenAI Mini Worker
After=network.target

[Service]
Type=simple
User=your_user
WorkingDirectory=/path/to/alphogenai-mini
Environment="PATH=/usr/bin:/usr/local/bin"
ExecStart=/usr/bin/python3 -m workers.worker
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Puis activer le service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable alphogenai-worker
sudo systemctl start alphogenai-worker
sudo systemctl status alphogenai-worker

# Voir les logs
sudo journalctl -u alphogenai-worker -f
```

---

## 🔍 Vérifier que le worker fonctionne

1. **Logs du worker**: Vous devriez voir :
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

2. **Créer un job de test**: Allez sur votre frontend et créez une vidéo

3. **Vérifier dans Supabase**: Le statut du job devrait passer de `pending` à `in_progress` puis `done`

4. **Logs de traitement**: Vous devriez voir dans les logs du worker :
   ```
   ============================================================
   🎬 Traitement du job: 02cb19e3-9a17-468f-8697-8f168de93e54
   Utilisateur: user_id
   Prompt: Un robot explique la lune...
   ============================================================
   ```

---

## 🐛 Dépannage

### Le worker ne démarre pas
- Vérifier que toutes les variables d'environnement sont définies
- Vérifier les logs pour voir l'erreur exacte

### Le worker démarre mais ne traite pas les jobs
- Vérifier que `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont correctes
- Vérifier que la table `jobs` existe dans Supabase
- Vérifier qu'il y a des jobs avec `status = 'pending'` dans la DB

### Les jobs échouent
- Vérifier les clés API (Qwen, DashScope, ElevenLabs, Remotion)
- Vérifier les logs du worker pour voir l'erreur spécifique
- Vérifier le champ `error_message` dans la table `jobs` de Supabase

---

## 📊 Surveillance

### Métriques importantes à surveiller:
- Nombre de jobs traités par heure
- Taux de succès/échec
- Temps moyen de traitement
- Utilisation CPU/RAM

### Outils recommandés:
- Railway/Render: Dashboards intégrés
- Supabase: Monitoring de la DB
- Sentry: Suivi des erreurs (optionnel)

---

## 🔄 Mise à jour du worker

### Sur Railway/Render:
Le worker se met à jour automatiquement à chaque push sur la branche `main`.

### Sur Docker:
```bash
docker pull your-registry/alphogenai-worker:latest
docker stop alphogenai-worker
docker rm alphogenai-worker
docker run -d ... alphogenai-worker:latest
```

### Sur VPS:
```bash
cd alphogenai-mini
git pull origin main
sudo systemctl restart alphogenai-worker
```

---

## 💡 Recommandation

Pour un démarrage rapide, je recommande **Railway.app** :
- ✅ Gratuit pour commencer
- ✅ Configuration automatique avec `railway.toml`
- ✅ Intégration GitHub native
- ✅ Logs en temps réel
- ✅ Scaling facile si besoin

**Temps estimé de déploiement: 5-10 minutes** 🚀
