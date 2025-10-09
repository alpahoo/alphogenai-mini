# 🚀 DÉPLOIEMENT - FIX ELEVENLABS COMPLET

## ✅ Commit poussé : `b0b0ee2`

**Nouveau service ElevenLabs avec TOUTES les fonctionnalités demandées.**

---

## 📋 AVANT DE DÉPLOYER

### 1️⃣ Annuler le job actuel (éviter triple facturation)

```sql
-- Dans Supabase SQL Editor
UPDATE jobs 
SET status = 'cancelled', 
    error_message = 'Annulé - upgrade ElevenLabs en cours'
WHERE id = '49374191-693e-4fa7-80a8-4c5cab02404b';
```

**Pourquoi ?** Ce job a déjà consommé 2× les crédits Replicate (~$1.04). Un 3ème retry coûtera encore $0.52.

---

## 🔧 DÉPLOIEMENT SUR RENDER

### Option A : Déploiement Manuel (RECOMMANDÉ)

1. **Dashboard Render** → Service `alphogenai-mini-worker`
2. **Manual Deploy** → **"Clear build cache & deploy"**
3. Sélectionnez le commit **`b0b0ee2`** explicitement
4. Attendez 2-3 minutes

### Option B : Si ffmpeg manque (rare)

Si vous voyez cette erreur dans les logs :
```
ImportError: pydub requires ffmpeg
```

Alors dans **Render Settings** :

1. **Build & Deploy** → **Build Command**
2. Ajoutez AVANT `pip install -r ...` :
   ```bash
   bash render-install.sh && pip install -r workers/requirements.txt
   ```
3. Sauvegardez et redéployez

**Note** : Sur Render, ffmpeg est généralement disponible par défaut.

---

## 🧪 VÉRIFICATION POST-DÉPLOIEMENT

### Logs attendus

```
==> Deploying...
==> Build successful 🎉
==> Running 'python -m workers.worker'

✅ VALIDATION RÉUSSIE
🎬 AlphogenAI Mini Worker
Démarré: 2025-10-08T...
En attente de jobs...
```

**⚠️ PAS DE Signal 15 !** (le worker doit rester actif)

---

## 🎯 TEST COMPLET

### 1️⃣ Une fois le worker actif

Créez **UN NOUVEAU JOB** avec un prompt différent :

```
"Explique la photosynthèse en 30 secondes, ton pédagogique"
```

### 2️⃣ Workflow attendu (logs)

```
✅ [Qwen] ✓ Script généré: 4 scènes

✅ [Replicate Images] ✓ 4 images générées
   Image 1: https://replicate.delivery/...
   Image 2: https://replicate.delivery/...
   Image 3: https://replicate.delivery/...
   Image 4: https://replicate.delivery/...

✅ [Replicate Videos] ✓ 4 clips vidéo 720p générés
   Clip 1: https://replicate.delivery/...
   Clip 2: https://replicate.delivery/...
   Clip 3: https://replicate.delivery/...
   Clip 4: https://replicate.delivery/...

✅ [ElevenLabs] Génération audio...
   [ElevenLabs] Texte: 1850 caractères
   [ElevenLabs] Modèle: eleven_multilingual_v2
   [ElevenLabs] Voice ID: pNInz6obpgDQGcFmaJgB (ou auto)
   [ElevenLabs] 1 chunk(s) à générer
   [ElevenLabs] Chunk 1/1 (1850 chars)...
   [ElevenLabs] Audio généré: 28.5s
   [ElevenLabs] Upload vers Supabase Storage: audio/...
   [ElevenLabs] ✓ Audio uploadé: https://qbrpzmuedfugbhoeytdj.supabase.co/...

✅ [Remotion] Assemblage final...
   [Remotion] Rendu initié: render_abc123
   [Remotion] ✓ Vidéo finale: https://remotion.pro/renders/...

✅ [Webhook] Notification envoyée

✅ Workflow terminé
   Job 49374191-693e-4fa7-80a8-4c5cab02404b complété
```

### 3️⃣ Résultat attendu

**Sur le frontend** (`/v/[id]`) :
- ✅ Vidéo 720p visible
- ✅ Audio synchronisé
- ✅ Durée totale : ~16s (4 clips × 4s)
- ✅ Sous-titres SRT disponibles (si affichage activé)

---

## 💰 Coût du test

- SDXL (4 images) : ~$0.02
- WAN 720p (4 vidéos) : ~$0.50
- **ElevenLabs (30s audio) : ~$0.05** ← NOUVEAU SERVICE !
- Remotion : ~$0.05
- **Total : ~$0.62**

---

## 🐛 Si ça échoue encore

### Erreur : `voice_id` introuvable

```
[ElevenLabs] ⚠️ 404 Voice not found
```

**Solution** : Le service va automatiquement **fallback** sur la première voix disponible. Pas d'action requise.

### Erreur : `ffmpeg` manquant

```
ImportError: pydub requires ffmpeg
```

**Solution** : Utilisez l'Option B ci-dessus (render-install.sh).

### Signal 15 revient

```
Worker arrêté.
Signal 15 reçu
```

**Solution** : Le service Render est en mode "Web Service" au lieu de "Background Worker".

Je devrai ajouter un serveur HTTP factice qui répond à `/health` pour garder Render heureux.

---

## 📊 RÉCAPITULATIF DES CHANGEMENTS

| Avant | Après |
|-------|-------|
| ❌ Endpoint incorrect (`/text-to-speech/eleven_multilingual_v2`) | ✅ Endpoint correct (`/v1/text-to-speech/{voice_id}`) |
| ❌ TypeError voice_id | ✅ Paramètre `voice_id` supporté ET optionnel |
| ❌ Limite 2500 chars | ✅ Chunking automatique + concaténation |
| ❌ Pas de SRT | ✅ SRT généré par phrase avec timecodes précis |
| ❌ Pas de fallback | ✅ Fallback automatique si voice_id absent |
| ❌ data: URL | ✅ Upload Supabase Storage |

---

## 🎯 ACTIONS MAINTENANT

1. ⚠️ **Annulez le job actuel** (SQL ci-dessus)
2. 🚀 **Redéployez sur Render** (Manual Deploy)
3. ⏰ **Attendez 2-3 minutes** (logs : "En attente de jobs...")
4. 🧪 **Créez UN NOUVEAU job test** (~$0.62)
5. 📋 **Envoyez-moi les logs complets**

**Ne testez PAS tant que vous ne voyez pas "En attente de jobs..." sans Signal 15 !** 🎯

