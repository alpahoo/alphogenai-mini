# 🚀 AlphoGenAI Mini - Guide de Déploiement du Worker Python

## 📋 Problème Actuel

Le frontend Next.js est déployé sur Vercel et fonctionne parfaitement. Les jobs sont créés avec succès dans Supabase. **MAIS** les jobs restent en statut "pending" car **le worker Python n'est pas déployé**.

## 🏗️ Architecture

```
┌─────────────────┐      ┌──────────────┐      ┌─────────────────┐
│  Frontend       │      │  Supabase    │      │  Python Worker  │
│  (Vercel)       │─────▶│  (Jobs DB)   │◀────▶│  (Render.com)   │
│  Crée les jobs  │      │              │      │  Traite les jobs│
└─────────────────┘      └──────────────┘      └─────────────────┘
                                                         │
                                                         ▼
                                                ┌─────────────────┐
                                                │  Runway Gen-4   │
                                                │  Turbo API      │
                                                └─────────────────┘
```

**Workflow Complet :**
1. 👤 Utilisateur crée un job via l'interface Video
2. 💾 Job inséré dans Supabase avec `status: "pending"`
3. 🔄 Worker Python poll Supabase toutes les 10 secondes
4. 🎬 Worker traite le job avec Runway Gen-4 API
5. ✅ Worker met à jour le job `status: "done"` + `video_url`
6. 🎥 Frontend affiche la vidéo dans la section Preview
7. 💾 Utilisateur peut télécharger la vidéo

## 🚀 Solution : Déployer le Worker sur Render.com

### Prérequis

- ✅ Compte Render.com (vous avez déjà)
- ✅ RUNWAY_API_KEY active (vous avez déjà)
- ✅ Accès au repo GitHub `alpahoo/alphogenai-mini`

### Étape 1 : Obtenir vos Variables d'Environnement Supabase

1. **Allez sur votre Dashboard Supabase**
   - URL : https://supabase.com/dashboard
   - Sélectionnez votre projet AlphoGenAI

2. **Récupérez les informations API**
   - Allez dans **Settings** → **API**
   - Copiez les valeurs suivantes :

   ```
   Project URL → SUPABASE_URL
   Exemple : https://xyzabc123.supabase.co
   
   service_role (secret) → SUPABASE_SERVICE_ROLE_KEY
   ⚠️ IMPORTANT : Utilisez la service_role KEY, PAS la anon key !
   Elle commence par : eyJ...
   ```

### Étape 2 : Créer le Background Worker sur Render.com

1. **Connectez-vous sur Render.com**
   - URL : https://render.com
   - Cliquez sur **"Log In"**

2. **Créer un nouveau Background Worker**
   - Cliquez sur **"New +"** → **"Background Worker"**
   - Sélectionnez **"Connect a repository"**
   
3. **Connecter votre repo GitHub**
   - Si c'est la première fois :
     - Cliquez sur **"Connect GitHub"**
     - Autorisez Render à accéder à vos repos
   - Cherchez et sélectionnez : **`alpahoo/alphogenai-mini`**
   - Cliquez sur **"Connect"**

4. **Configuration Auto-Détectée**
   
   Render devrait auto-détecter le fichier `render.yaml`. Vérifiez que :
   
   - **Name:** `alphogenai-worker`
   - **Environment:** `Python`
   - **Region:** `Oregon (US West)`
   - **Branch:** `main`
   - **Build Command:** `pip install -r workers/requirements.txt`
   - **Start Command:** `python start_render_worker.py`
   - **Instance Type:** `Free` (750 heures/mois gratuites)

### Étape 3 : Configurer les Variables d'Environnement ⚠️ CRITIQUE

**Dans la section "Environment" du worker :**

Cliquez sur **"Add Environment Variable"** pour chaque variable ci-dessous :

#### Variables REQUISES (obligatoires)

| Key | Value | Description |
|-----|-------|-------------|
| `SUPABASE_URL` | `https://votre-projet.supabase.co` | URL de votre projet Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` | Service role key (PAS anon key !) |
| `RUNWAY_API_KEY` | `rw_...` | Votre clé API Runway ML |

#### Variables OPTIONNELLES (avec valeurs par défaut)

| Key | Value | Description |
|-----|-------|-------------|
| `RUNWAY_API_BASE` | `https://api.dev.runwayml.com/v1` | URL de l'API Runway |
| `QWEN_MOCK_ENABLED` | `true` | Mode mock pour génération de scripts |
| `MAX_RETRIES` | `3` | Nombre de tentatives en cas d'erreur |
| `RETRY_DELAY` | `5` | Délai entre tentatives (secondes) |
| `JOB_TIMEOUT` | `3600` | Timeout max par job (secondes) |
| `POLL_INTERVAL` | `10` | Intervalle de polling (secondes) |

⚠️ **IMPORTANT :**
- La `SUPABASE_SERVICE_ROLE_KEY` doit être la **service_role key**, pas l'anon key
- La `RUNWAY_API_KEY` doit être valide et active
- Ne partagez jamais ces clés publiquement ou dans le code

### Étape 4 : Déployer le Worker

1. **Vérifiez la configuration**
   - Toutes les variables requises sont définies
   - Le nom du worker est `alphogenai-worker`
   - La branche est `main`

2. **Lancez le déploiement**
   - Cliquez sur **"Create Background Worker"**
   - Render va commencer le build (⏱️ 2-3 minutes)

3. **Surveillez le build**
   - Allez dans l'onglet **"Logs"**
   - Le build doit se terminer avec succès

### Étape 5 : Vérifier le Démarrage du Worker

**Logs attendus au démarrage (onglet "Logs" sur Render) :**

```
==> Starting service with 'python start_render_worker.py'

🔍 Validation de l'environnement...

======================================================================
✅ Configuration valide - Démarrage du worker...
======================================================================

============================================================
🎬 AlphogenAI Mini Worker
============================================================
Démarré: 2025-10-14T21:45:00
Intervalle de poll: 10s
Retries max: 3
============================================================

En attente de jobs...
```

**Statut attendu :**
- ✅ Build : **Success**
- ✅ Service : **Live** (pastille verte)
- ✅ Logs : Affiche "En attente de jobs..."

**Si vous voyez des erreurs :**
- ❌ "RUNWAY_API_KEY environment variable is required" → Variable manquante
- ❌ "Missing Supabase environment variables" → Variables Supabase incorrectes
- 👉 Consultez la section **Dépannage** ci-dessous

### Étape 6 : Tester avec un Job Réel 🎬

1. **Allez sur votre site de production**
   - URL : https://nextjs-with-supabase-l5zv.vercel.app

2. **Connectez-vous**
   - Email : `paulhonla@gmail.com`
   - Mot de passe : `wubkex-2Gucfi-xinbeh`

3. **Allez sur la page Video**
   - Cliquez sur **"Video"** dans la sidebar

4. **Créez un job de test**
   - **Prompt :** "a cat walking in the rain, cinematic lighting, slow motion"
   - **Duration :** 10 secondes
   - **Resolution :** 720p
   - Cliquez sur **"Create"**

5. **Observez le statut**
   - Le badge devrait passer de **"pending"** (jaune) à **"in_progress"** (bleu)
   - Puis à **"done"** (vert) après 1-2 minutes

### Étape 7 : Surveiller le Traitement dans les Logs Render

**Pendant le traitement, vous devriez voir dans les logs Render :**

```
============================================================
🎬 Traitement du job: abc-123-def-456
Utilisateur: f5f40f91-89cc-4d94-8adc-d6dd3796306a
Prompt: a cat walking in the rain, cinematic lighting...
============================================================

======================================================================
🎬 Runway Orchestrator - Starting workflow
======================================================================
Job ID: abc-123-def-456
Prompt: a cat walking in the rain, cinematic lighting, slow motion
======================================================================

[Orchestrator] Stage: script_generation (in_progress)
[Qwen Mock] Generating script structure for prompt...
[Qwen Mock] ✅ Script generated with 4 scenes

[Orchestrator] Stage: video_generation (in_progress)
[Runway] Sending request to Runway Gen-4 Turbo API...
[Runway] Request parameters:
  - Prompt: A curious cat walks through heavy rain...
  - Duration: 10s
  - Aspect Ratio: 16:9
[Runway] Request ID: req_xyz123abc
[Runway] Video task created: task_abc456def
[Runway] Polling for completion (max 10 minutes)...
[Runway] Status: pending (0%)
[Runway] Status: processing (25%)
[Runway] Status: processing (50%)
[Runway] Status: processing (75%)
[Runway] Status: succeeded (100%)
[Runway] ✅ Video ready!
[Runway] Video URL: https://storage.googleapis.com/runway-...

[Orchestrator] Stage: music_selection (in_progress)
[Music] Selecting music for tone: inspiring
[Music] Found 12 tracks in Supabase Storage
[Music] ✅ Selected: Ambient_Uplifting_01.mp3

======================================================================
✅ Workflow completed successfully!
Video: https://storage.googleapis.com/runway-...
Music: https://xyz.supabase.co/storage/v1/object/public/music/...
======================================================================

✅ Job terminé avec succès!
```

**Durée totale attendue :** 1-2 minutes par vidéo de 10 secondes

### Étape 8 : Vérifier le Résultat dans l'Interface

1. **Page History**
   - Allez sur **"History"** dans la sidebar
   - Le job devrait apparaître avec le statut **"done"** (badge vert)
   - L'URL de la vidéo devrait être visible

2. **Section Preview**
   - Sur la page Video, descendez à la section **"Preview"**
   - La vidéo générée devrait s'afficher
   - Le lecteur vidéo devrait être fonctionnel

3. **Téléchargement**
   - Cliquez sur le bouton **"Download"**
   - La vidéo devrait se télécharger (format MP4)

**✅ Si tout fonctionne → Déploiement réussi !**

---

## 🔧 Dépannage

### ❌ "RUNWAY_API_KEY environment variable is required"

**Cause :** La variable `RUNWAY_API_KEY` n'est pas configurée ou est vide.

**Solution :**
1. Retournez dans Render Dashboard → `alphogenai-worker` → **Environment**
2. Vérifiez que la variable `RUNWAY_API_KEY` existe
3. Si elle manque, ajoutez-la :
   - Key : `RUNWAY_API_KEY`
   - Value : Votre clé Runway (commence par `rw_`)
4. Cliquez sur **"Save Changes"**
5. Le worker redémarrera automatiquement

### ❌ "Missing Supabase environment variables"

**Cause :** `SUPABASE_URL` ou `SUPABASE_SERVICE_ROLE_KEY` manquante ou incorrecte.

**Solution :**
1. Vérifiez dans Render → Environment que les deux variables existent
2. Vérifiez que `SUPABASE_URL` est au format : `https://xxx.supabase.co`
3. Vérifiez que vous utilisez la **service_role KEY** (commence par `eyJ...`)
   - ⚠️ PAS la anon key !
   - La service_role key est très longue (~500 caractères)
4. Si incorrecte, corrigez et sauvegardez

### ❌ Worker démarre mais jobs restent "pending"

**Causes possibles :**

**1. Worker ne peut pas accéder à Supabase**
```
Solution :
- Vérifiez que SUPABASE_URL est correcte
- Vérifiez que SUPABASE_SERVICE_ROLE_KEY est la bonne clé
- Vérifiez les logs pour des erreurs de connexion
```

**2. Worker ne trouve pas de jobs**
```
Solution :
- Vérifiez dans Supabase → SQL Editor :
  SELECT * FROM jobs WHERE status = 'pending' ORDER BY created_at;
- Si aucun job n'apparaît, le problème est côté frontend
- Si des jobs apparaissent, le worker a un problème de requête
```

**3. Worker crash au démarrage**
```
Solution :
- Consultez les logs complets dans Render
- Cherchez les stack traces Python
- Vérifiez que workers/requirements.txt est à jour
```

### ❌ "401 Unauthorized" ou "403 Forbidden" dans les logs Runway

**Cause :** `RUNWAY_API_KEY` invalide, expirée, ou sans crédits.

**Solution :**
1. Allez sur https://runwayml.com
2. Connectez-vous à votre compte
3. Allez dans **Settings** → **API Keys**
4. Vérifiez que votre clé est **Active**
5. Si expirée, créez une nouvelle clé
6. Mettez à jour dans Render → Environment

### ❌ "Video generation failed: insufficient credits"

**Cause :** Votre compte Runway n'a plus de crédits.

**Solution :**
1. Allez sur https://runwayml.com → **Billing**
2. Vérifiez votre solde de crédits
3. Ajoutez des crédits si nécessaire
4. Relancez le job (ou créez-en un nouveau)

**Estimation des coûts :**
- ~$0.05 par seconde de vidéo
- Vidéo de 10s ≈ $0.50
- 100 vidéos ≈ $50

### ❌ Worker s'endort après 15 minutes d'inactivité

**Cause :** Render.com Free Plan met les workers en hibernation après inactivité.

**Comportement normal :**
- Le worker s'endort après 15 minutes sans jobs
- Il redémarre automatiquement quand un nouveau job arrive
- Le premier job après hibernation peut prendre 30-60 secondes de plus

**Pour éviter l'hibernation :**
- Passez au plan payant Render ($7/mois)
- Ou acceptez le délai au premier job après inactivité

### ❌ Jobs passent en "failed" sans raison

**Causes possibles :**

**1. Timeout dépassé**
```
Solution :
- Augmentez JOB_TIMEOUT dans Environment (défaut : 3600s = 1h)
- Vérifiez que Runway répond dans les temps
```

**2. Erreur réseau intermittente**
```
Solution :
- Le worker réessaiera automatiquement (MAX_RETRIES = 3)
- Vérifiez les logs pour voir l'erreur exacte
```

**3. Prompt invalide**
```
Solution :
- Runway refuse certains prompts (contenu sensible, etc.)
- Testez avec un prompt simple : "a beautiful sunset"
```

### ❌ "Error: Cannot find module 'X'" dans les logs

**Cause :** Dépendance Python manquante.

**Solution :**
1. Vérifiez que `workers/requirements.txt` liste toutes les dépendances
2. Dans Render → Settings
3. Cliquez sur **"Manual Deploy"** → **"Clear build cache & deploy"**
4. Le build devrait réinstaller toutes les dépendances

---

## 📊 Monitoring et Maintenance

### Voir les Logs en Temps Réel

**Via Render Dashboard :**
1. Render.com → `alphogenai-worker`
2. Onglet **"Logs"**
3. Les logs s'affichent en temps réel

**Via Render CLI (optionnel) :**
```bash
# Installer Render CLI
npm install -g @render-web/cli

# Se connecter
render login

# Voir les logs
render logs -s alphogenai-worker --tail
```

### Vérifier l'État des Jobs dans Supabase

**Requêtes SQL utiles :**

```sql
-- Jobs récents
SELECT 
  id, 
  status, 
  current_stage, 
  prompt, 
  created_at, 
  updated_at
FROM jobs
ORDER BY created_at DESC
LIMIT 10;

-- Jobs bloqués (in_progress depuis > 10 minutes)
SELECT 
  id, 
  status, 
  current_stage, 
  prompt, 
  updated_at,
  EXTRACT(EPOCH FROM (NOW() - updated_at)) / 60 AS minutes_stuck
FROM jobs
WHERE status = 'in_progress'
  AND updated_at < NOW() - INTERVAL '10 minutes';

-- Statistiques globales
SELECT 
  status, 
  COUNT(*) as count
FROM jobs
GROUP BY status;
```

### Redémarrer le Worker Manuellement

**Si le worker semble bloqué :**
1. Render Dashboard → `alphogenai-worker`
2. Settings → Cliquez sur **"Suspend"**
3. Attendez 10 secondes
4. Cliquez sur **"Resume"**

**Ou forcer un redéploiement :**
1. Render Dashboard → `alphogenai-worker`
2. Manual Deploy → **"Clear build cache & deploy"**

### Mettre à Jour le Worker

**Quand vous faites des modifications au code :**
1. Commitez et pushez sur la branche `main`
2. Render auto-déploie automatiquement (Auto-Deploy: true)
3. Surveillez les logs pendant le redéploiement
4. Vérifiez que le worker redémarre correctement

---

## 💰 Coûts et Limites

### Render.com

**Plan Free :**
- ✅ 750 heures/mois gratuites
- ✅ Suffisant pour un worker 24/7 (720 heures/mois)
- ⚠️ Peut hiberner après 15 minutes d'inactivité
- ⚠️ Redémarre automatiquement au prochain job

**Plan Paid ($7/mois) :**
- ✅ Pas d'hibernation
- ✅ Worker toujours actif
- ✅ Meilleure performance

### Runway Gen-4 Turbo API

**Tarification :**
- **~$0.05 par seconde de vidéo générée**
- Vidéo de 5s : ~$0.25
- Vidéo de 10s : ~$0.50
- Vidéo de 15s : ~$0.75

**Exemples de budget :**
- 10 vidéos/jour (10s chacune) = $5/jour = $150/mois
- 100 vidéos/mois (10s chacune) = $50/mois
- 1000 vidéos/mois (10s chacune) = $500/mois

**💡 Optimisation des coûts :**
- Le cache est activé → prompts identiques ne sont pas régénérés
- Utilisez des durées plus courtes si possible (5s vs 10s)
- Surveillez votre utilisation sur https://runwayml.com/usage

---

## 🧪 Tests Avancés

### Tester la RUNWAY_API_KEY Directement

**En local (optionnel) :**

```bash
# Dans le dossier du repo
cd workers

# Installer les dépendances
pip install -r requirements.txt

# Tester
python -m workers.test_runway
```

**Sortie attendue :**
```
🧪 Testing Runway Gen-4 Turbo integration...

✅ RUNWAY_API_KEY is set
✅ Runway client initialized
📤 Sending test request to Runway API...
✅ Video generation started: task_xyz123
✅ Video ready: https://storage.googleapis.com/...

✅ All tests passed!
```

### Tester le Worker en Local (Avant Déploiement)

```bash
# Créer .env.local à la racine du projet
cat > .env.local << 'EOF'
SUPABASE_URL=https://votre-projet.supabase.co
SUPABASE_SERVICE_ROLE_KEY=votre-service-key
RUNWAY_API_KEY=votre-runway-key
RUNWAY_API_BASE=https://api.runwayml.com/v1
QWEN_MOCK_ENABLED=true
MAX_RETRIES=3
RETRY_DELAY=5
JOB_TIMEOUT=3600
POLL_INTERVAL=10
EOF

# Démarrer le worker
cd workers
chmod +x start_worker.sh
./start_worker.sh
```

**Le worker devrait se connecter à Supabase et traiter les jobs en local.**

---

## ❓ Questions Fréquentes

**Q: Le worker peut-il être déployé sur Vercel avec le frontend ?**

R: Non, Vercel ne supporte pas les processus Python long-running (comme le polling). Il faut un service séparé comme Render.com, Railway, ou Heroku.

---

**Q: Puis-je utiliser un autre service que Render.com ?**

R: Oui ! Alternatives :
- **Railway** ($5 crédit gratuit/mois) : https://railway.app
- **Heroku** (payant) : https://heroku.com
- **AWS EC2** / **VPS** : Vous gérez vous-même
- **Fly.io** : https://fly.io

Le fichier `render.yaml` devra être adapté pour ces plateformes.

---

**Q: Combien de workers dois-je déployer ?**

R: **Un seul worker suffit** pour commencer. Il traite les jobs séquentiellement. Si vous avez beaucoup de trafic, vous pourrez déployer plusieurs workers plus tard.

---

**Q: Que se passe-t-il si le worker crash pendant un job ?**

R: Le worker marque automatiquement les jobs "stuck" (bloqués > 5 minutes) comme `failed`. Ces jobs peuvent être relancés manuellement via l'interface Admin.

---

**Q: Comment voir combien de vidéos ont été générées ?**

R: Dans Supabase → SQL Editor :
```sql
SELECT COUNT(*) as total_videos 
FROM jobs 
WHERE status = 'done';
```

---

**Q: Puis-je désactiver le mode mock pour utiliser le vrai Qwen ?**

R: Oui, dans Render → Environment :
- Changez `QWEN_MOCK_ENABLED` de `true` à `false`
- Ajoutez `QWEN_API_KEY` avec votre clé DashScope

Mais le mock suffit pour générer des scripts simples.

---

**Q: Le worker consomme-t-il des crédits Runway quand il n'y a pas de jobs ?**

R: Non, le worker ne fait que "écouter" (poll) Supabase. Il consomme des crédits Runway uniquement quand il génère une vidéo.

---

## 📚 Ressources

- **Documentation Runway ML :** https://docs.runwayml.com
- **Documentation Render.com :** https://render.com/docs
- **Supabase Dashboard :** https://supabase.com/dashboard
- **Code source du worker :** `/workers/worker.py` et `/workers/runway_orchestrator.py`
- **Requirements Python :** `/workers/requirements.txt`

---

## 🎯 Checklist de Déploiement

Utilisez cette checklist pour valider votre déploiement :

- [ ] ✅ Compte Render.com créé
- [ ] ✅ Repo GitHub `alpahoo/alphogenai-mini` connecté à Render
- [ ] ✅ Background Worker créé : `alphogenai-worker`
- [ ] ✅ Variable `SUPABASE_URL` configurée
- [ ] ✅ Variable `SUPABASE_SERVICE_ROLE_KEY` configurée (service_role, pas anon)
- [ ] ✅ Variable `RUNWAY_API_KEY` configurée
- [ ] ✅ Build réussi (status : Success)
- [ ] ✅ Worker démarré (status : Live, pastille verte)
- [ ] ✅ Logs affichent "🎬 AlphogenAI Mini Worker" et "En attente de jobs..."
- [ ] ✅ Job de test créé via l'interface Video
- [ ] ✅ Job traité avec succès (status : pending → in_progress → done)
- [ ] ✅ Vidéo visible dans la section Preview
- [ ] ✅ Bouton Download fonctionne
- [ ] ✅ Job visible dans l'historique

**Si tous les items sont cochés → Déploiement 100% fonctionnel ! 🎉**

---

## 🆘 Support

Si vous rencontrez des problèmes malgré ce guide :

1. ✅ Vérifiez les logs Render du worker
2. ✅ Vérifiez la table `jobs` dans Supabase
3. ✅ Vérifiez que toutes les variables d'environnement sont correctes
4. ✅ Testez votre RUNWAY_API_KEY via les tests unitaires
5. ✅ Ouvrez une issue sur GitHub avec :
   - Les logs Render (anonymisez les clés API)
   - La requête SQL `SELECT * FROM jobs WHERE id = 'job_id'`
   - Les étapes que vous avez suivies

---

**Bonne chance avec le déploiement ! 🚀**
