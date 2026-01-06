> ⚠️ **ARCHIVED / LEGACY (pipeline historique)**
>
> Ce guide de déploiement mentionne des clés et services d’un pipeline plus ancien.
> **Pipeline actuel**: SVI (vidéo) + Audio Ambience Service (audio + mix).
>
> Références à utiliser:
> - `STATUS.txt` (source de vérité)
> - `README.md`
> - `QUICK_START.md`
> - `AUDIO_AMBIENCE_README.md`
> - `MODEL_UPGRADES.md`

# 🚀 Déploiement Rapide du Worker (5 min)

## Option Railway (Recommandée - Plus Simple)

### 1. Créer un compte Railway
👉 https://railway.app (connexion avec GitHub)

### 2. Nouveau projet depuis GitHub
- Cliquer **"New Project"**
- Sélectionner **"Deploy from GitHub repo"**
- Choisir **`alphogenai-mini`**
- Railway détectera automatiquement `railway.toml`

### 3. Configurer les variables d'environnement
Aller dans **"Variables"** et ajouter :

```bash
# Supabase (requis)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...

# Alibaba Cloud / Qwen (requis)
QWEN_API_KEY=sk-xxx
DASHSCOPE_API_KEY=sk-xxx

# ElevenLabs (requis)
ELEVENLABS_API_KEY=xxx

# Remotion (requis)
REMOTION_SITE_ID=xxx
REMOTION_SECRET_KEY=xxx

# Optionnel
VIDEO_ENGINE=wan
WAN_IMAGE_API_KEY=xxx
PIKA_API_KEY=xxx
```

### 4. Déployer
- Cliquer sur **"Deploy"**
- Attendre 2-3 minutes
- Vérifier les logs : vous devriez voir **"🎬 AlphogenAI Mini Worker"**

### 5. Tester
- Créer une vidéo depuis votre frontend
- Le job devrait être traité en 4-9 minutes

---

## Option Render

### 1. Créer un compte Render
👉 https://render.com (connexion avec GitHub)

### 2. Nouveau Worker
- Cliquer **"New +"** → **"Worker"**
- Connecter votre repo GitHub
- Branche : `main`
- Render détectera `render.yaml` automatiquement

### 3. Ajouter les variables (même liste que Railway)

### 4. Créer le Worker
- Les logs s'afficheront automatiquement
- Le worker démarrera en quelques minutes

---

## 🐛 Dépannage

### Le worker ne démarre pas
```bash
# Vérifier les variables d'env
# Toutes les variables REQUISES doivent être définies
```

### Les jobs restent en "pending"
- Vérifier que le worker tourne (logs)
- Vérifier `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY`

### Les jobs échouent
- Regarder le champ `error_message` dans la table `jobs` de Supabase
- Vérifier les clés API (Qwen, DashScope, ElevenLabs, Remotion)

---

## 📊 Vérifier que ça marche

1. **Logs Railway/Render** : Chercher "🎬 AlphogenAI Mini Worker"
2. **Créer un job** depuis votre frontend
3. **Supabase** : Le statut devrait passer `pending` → `in_progress` → `done`
4. **Logs du worker** : Vous verrez le traitement étape par étape

---

## 💰 Coûts

- **Railway** : ~$5/mois (gratuit au début avec crédits)
- **Render** : Gratuit avec limitations, puis ~$7/mois

---

## 📚 Documentation complète

Voir **DEPLOY_WORKER.md** pour:
- Options supplémentaires (Docker, VPS, AWS)
- Configuration avancée
- Monitoring
- Troubleshooting détaillé
