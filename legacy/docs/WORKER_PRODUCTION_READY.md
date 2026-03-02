> ⚠️ **ARCHIVED / LEGACY (pipeline historique)**
>
> Ce document décrit un ancien pipeline (Qwen/WAN/Pika/ElevenLabs/Remotion, etc.).
> **Pipeline actuel**: SVI (vidéo) + Audio Ambience Service (audio + mix).
>
> Références à utiliser:
> - `STATUS.txt` (source de vérité)
> - `README.md`
> - `QUICK_START.md`
> - `AUDIO_AMBIENCE_README.md`
> - `MODEL_UPGRADES.md`

# 🚀 AlphogenAI Worker - Production Ready

## ✅ Améliorations apportées

### 1. **Récupération automatique des jobs bloqués**
- ✅ Détecte les jobs `in_progress` bloqués depuis > 5 minutes
- ✅ Les remet automatiquement en `pending` pour retry
- ✅ Marque comme `failed` après MAX_RETRIES dépassé
- ✅ S'exécute à chaque cycle de polling (toutes les 10s)

```python
# workers/worker.py
async def _recover_stuck_jobs(self):
    """Récupère les jobs bloqués en in_progress depuis > 5 minutes"""
    # Cherche jobs in_progress avec updated_at < now() - 5min
    # Si retry_count < MAX_RETRIES → remet en pending
    # Sinon → marque comme failed
```

### 2. **Gestion robuste des erreurs**
- ✅ Tous les appels API ont des timeouts explicites
- ✅ Erreurs HTTP détaillées avec code et message
- ✅ Logging amélioré avec type d'exception
- ✅ Retry automatique avec exponential backoff (tenacity)

**Services API couverts** :
- `QwenService` - Timeout 60s
- `WANImageService` - Timeout 120s
- `PikaService` - Timeout 300s + polling 5min
- `WANVideoService` - Timeout 600s + polling 10min
- `ElevenLabsService` - Timeout 120s
- `RemotionService` - Timeout variable selon durée

### 3. **Logging détaillé**
- ✅ Affichage de la progression pour les opérations longues (Pika/WAN polling)
- ✅ Logs structurés avec émojis pour faciliter le debugging
- ✅ Erreurs avec type d'exception explicite (`HTTPStatusError`, `TimeoutException`, etc.)

```
[Qwen] Génération du script pour job abc-123
[Qwen] API Base: https://dashscope-intl.aliyuncs.com/api/v1
[Qwen] API Key configured: True
[Qwen] ✓ Script généré: 4 scènes

[Pika] Attente génération vidéo xyz-456...
[Pika] Toujours en attente... (10/60)
[Pika] ✓ Vidéo xyz-456 prête (23 tentatives)
```

### 4. **Validation des variables d'environnement**
- ✅ Script `workers/validate_env.py` pour vérifier la config avant démarrage
- ✅ Détection automatique des clés manquantes
- ✅ Warnings pour les configurations optionnelles
- ✅ Intégré au démarrage du worker

```bash
python -m workers.validate_env
# ou
python -m workers.worker  # Valide automatiquement au démarrage
```

### 5. **État et retry améliorés**
- ✅ `retry_count` incrémenté à chaque erreur
- ✅ État sauvegardé à chaque étape du workflow
- ✅ `current_stage` indique exactement où le workflow est bloqué
- ✅ `updated_at` mis à jour automatiquement (trigger Supabase)

---

## 🔧 Configuration requise

### Variables d'environnement critiques

```bash
# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJxxx...

# Qwen (API native DashScope)
QWEN_API_KEY=sk-xxx...

# WAN Image
WAN_IMAGE_API_KEY=xxx...

# WAN Video (DashScope)
DASHSCOPE_API_KEY=sk-xxx...

# ElevenLabs
ELEVENLABS_API_KEY=xxx...

# Remotion (optionnel)
REMOTION_RENDERER_URL=https://your-remotion.com
REMOTION_SITE_ID=xxx...
REMOTION_SECRET_KEY=xxx...

# Configuration
VIDEO_ENGINE=wan  # ou pika
MAX_RETRIES=3
POLL_INTERVAL=10  # secondes
JOB_TIMEOUT=3600  # 1 heure
```

### Vérifier la configuration

```bash
# Dans le container ou en local
python -m workers.validate_env
```

**Sortie attendue** :
```
==================================================
🔍 VALIDATION DES VARIABLES D'ENVIRONNEMENT
==================================================

📦 Supabase:
  ✅ SUPABASE_URL: https://xxx.supabase.co
  ✅ SUPABASE_SERVICE_ROLE_KEY: eyJxxx...

🤖 Qwen LLM:
  ✅ QWEN_API_KEY: sk-519c95b9a869...

...

✅ VALIDATION RÉUSSIE - Toutes les variables sont présentes!
```

---

## 🚀 Déploiement sur Render

### 1. Vérifier les variables d'environnement

Dans **Render Dashboard** → `alphogenai-worker` → **Environment** :

| Variable | Valeur | Note |
|----------|--------|------|
| `QWEN_API_KEY` | `sk-519c95b9a8694a59b80aa9c9ef466e51` | ✅ Testé |
| `SUPABASE_URL` | Votre URL Supabase | Requis |
| `SUPABASE_SERVICE_ROLE_KEY` | Votre clé service | Requis |
| `WAN_IMAGE_API_KEY` | Votre clé WAN | Requis |
| `DASHSCOPE_API_KEY` | Même que QWEN_API_KEY | Requis si VIDEO_ENGINE=wan |
| `ELEVENLABS_API_KEY` | Votre clé ElevenLabs | Requis |
| `REMOTION_RENDERER_URL` | URL de votre service Remotion | Requis pour assemblage |
| `VIDEO_ENGINE` | `wan` | wan ou pika |
| `MAX_RETRIES` | `3` | Optionnel (défaut: 3) |
| `POLL_INTERVAL` | `10` | Optionnel (défaut: 10s) |

### 2. Pousser le code

```bash
git add -A
git commit -m "feat: Production-ready worker with auto-recovery and validation"
git push origin main
```

### 3. Vérifier le déploiement

1. **Render Dashboard** → `alphogenai-worker` → **Logs**
2. Chercher :
   ```
   🔍 Validation de l'environnement...
   ✅ Configuration valide - Démarrage du worker...
   ============================================================
   🎬 AlphogenAI Mini Worker
   ============================================================
   ```

3. Si validation échoue :
   ```
   ❌ VALIDATION ÉCHOUÉE
   Erreurs critiques:
     ❌ QWEN_API_KEY manquante
   ```
   → Corriger les variables d'environnement et redémarrer

---

## 🧪 Test du workflow

### 1. Créer un nouveau job depuis le frontend

```
Prompt : "Explique comment fonctionne l'IA en 30 secondes"
```

### 2. Vérifier les logs Render

Vous devriez voir :

```
============================================================
🎬 Traitement du job: abc-123-def-456
Utilisateur: None
Prompt: Explique comment fonctionne l'IA en 30 secondes
============================================================

======================================================================
🎬 AlphogenAI Mini - Démarrage workflow
======================================================================
Job ID: abc-123-def-456
Prompt: Explique comment fonctionne l'IA en 30 secondes
======================================================================

[Qwen] Génération du script pour job abc-123-def-456
[Qwen] API Base: https://dashscope-intl.aliyuncs.com/api/v1
[Qwen] API Key configured: True
[Qwen] ✓ Script généré: 4 scènes

[WAN Image] Génération de l'image clé pour job abc-123-def-456
[WAN Image] ✓ Image clé générée: https://...

[Video] Génération de 4 clips avec moteur: WAN
[Video] Job: abc-123-def-456
[Video] ✓ 4 clips générés avec WAN

[ElevenLabs] Génération audio pour job abc-123-def-456
[ElevenLabs] Texte: 387 caractères
[ElevenLabs] ✓ Audio généré: 24.5s
[ElevenLabs] ✓ URL: https://...

[Remotion] Assemblage vidéo finale pour job abc-123-def-456
[Remotion] ✓ Vidéo finale: https://...

======================================================================
✅ Workflow terminé avec succès!
Vidéo: https://...
======================================================================
```

### 3. Si erreur

Le worker va automatiquement :
1. Incrémenter `retry_count`
2. Sauvegarder l'erreur dans `error_message`
3. Retenter jusqu'à `MAX_RETRIES`
4. Si échec persistant → marquer comme `failed`

---

## 🔄 Récupération automatique des jobs bloqués

Le worker vérifie **toutes les 10 secondes** :

1. **Jobs in_progress depuis > 5 minutes** ?
2. **Retry count < MAX_RETRIES** ?
   - ✅ OUI → Remet en `pending` pour retry automatique
   - ❌ NON → Marque comme `failed`

**Exemple de logs** :
```
⚠️  Job bloqué détecté: abc-123-def-456
    Stage: qwen_script
    Retry: 1/3
    → Remis en PENDING pour retry

⚠️  Job bloqué détecté: xyz-789-ghi-012
    Stage: wan_image
    Retry: 3/3
    → Marqué comme FAILED (max retries atteint)
```

Cela signifie que **plus aucun job ne restera bloqué indéfiniment** ! 🎉

---

## 📊 Architecture du workflow

```
Frontend (Next.js)
  ↓
  POST /api/generate-video
  ↓
  Crée job dans Supabase (status: pending)
  ↓
Worker (Render)
  ↓
  Poll jobs table (toutes les 10s)
  ↓
  1. Récupère jobs bloqués (in_progress > 5min)
  2. Cherche nouveau job (status: pending)
  ↓
  Exécute workflow LangGraph:
    - Qwen Script (4 scènes)
    - WAN Image (image clé)
    - WAN/Pika Video (4 clips)
    - ElevenLabs Audio + SRT
    - Remotion Assembly
    - Webhook notification
  ↓
  Met à jour Supabase (status: done, final_url)
  ↓
Frontend affiche la vidéo
```

---

## 🐛 Debugging

### Logs worker ne montrent rien après "En attente de jobs..."

**Cause** : Aucun job avec `status = pending` dans la DB

**Solution** :
1. Créer un nouveau job depuis le frontend
2. Vérifier dans Supabase que le job existe avec `status = "pending"`
3. Attendre max 10s pour que le worker le détecte

### Worker détecte le job mais bloque sans logs

**Cause** : Erreur silencieuse ou timeout

**Solution** :
1. Vérifier les logs Render (scroll jusqu'au bout)
2. Chercher `[Qwen] ✗ Erreur:` ou `HTTP Error`
3. Vérifier que toutes les clés API sont valides

### Job reste en "in_progress" indéfiniment

**Cause** : Worker a planté pendant le traitement

**Solution** :
- ✅ **Automatique** : Le système détecte et récupère automatiquement les jobs bloqués après 5 minutes
- Si urgent : Changer manuellement le statut à `pending` dans Supabase

---

## ✅ Checklist de production

- [x] Récupération automatique des jobs bloqués
- [x] Timeouts sur tous les appels API
- [x] Gestion robuste des erreurs
- [x] Logging détaillé
- [x] Validation des variables d'environnement au démarrage
- [x] Retry automatique avec exponential backoff
- [x] État sauvegardé à chaque étape
- [x] API native DashScope pour Qwen
- [x] Documentation complète

---

## 📚 Fichiers modifiés

- `workers/worker.py` - Ajout récupération jobs bloqués + validation env
- `workers/api_services.py` - Gestion erreurs + timeouts + logging
- `workers/langgraph_orchestrator.py` - Logging détaillé + retry_count
- `workers/validate_env.py` - **NOUVEAU** Script validation config
- `WORKER_PRODUCTION_READY.md` - **NOUVEAU** Documentation complète

---

## 🚀 Prochaines étapes

1. **Push le code sur main**
   ```bash
   git push origin main
   ```

2. **Attendre le redéploiement Render** (1-2 minutes)

3. **Créer un nouveau job** depuis le frontend

4. **Vérifier les logs** :
   - Validation de l'environnement ✅
   - Traitement du job ✅
   - Workflow complet ✅
   - Vidéo générée ✅

---

**Maintenant le worker est production-ready et résilient ! 🎉**
