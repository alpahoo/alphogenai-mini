> ⚠️ **ARCHIVED / LEGACY (pipeline historique)**
>
> Ce document concerne une migration d’un ancien pipeline (DashScope/WANX Image).
> **Pipeline actuel**: SVI (vidéo) + Audio Ambience Service (audio + mix).
>
> Références à utiliser:
> - `STATUS.txt` (source de vérité)
> - `README.md`
> - `QUICK_START.md`
> - `AUDIO_AMBIENCE_README.md`
> - `MODEL_UPGRADES.md`

# ✅ Migration WAN Image → DashScope WANX Image

## 🎉 Changement effectué

`WANImageService` utilise maintenant **DashScope WANX Image** au lieu de WAN.ai.

---

## ✅ Avantages

✅ **Une seule clé API** : `DASHSCOPE_API_KEY` pour Qwen + WANX Image + WAN Video  
✅ **Pas de nouvelle inscription** nécessaire  
✅ **API cohérente** : même pattern que Qwen  
✅ **Plus simple** : moins de dépendances externes  

---

## 🔧 Changements techniques

### API utilisée

**Avant** :
```
Service: WAN.ai
Endpoint: https://api.wan.ai/v1/images/generate
Clé: WAN_IMAGE_API_KEY
```

**Après** :
```
Service: DashScope WANX Image
Endpoint: https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis
Clé: DASHSCOPE_API_KEY (même que Qwen)
Model: wanx-v1
```

### Variables d'environnement

**❌ Supprimée** : `WAN_IMAGE_API_KEY`  
**✅ Utilisée** : `DASHSCOPE_API_KEY`

**Dans Render** :
- Vous pouvez **supprimer** `WAN_IMAGE_API_KEY` si elle existe
- Assurez-vous que `DASHSCOPE_API_KEY` est définie (même valeur que `QWEN_API_KEY`)

---

## 📝 Configuration Render

### Variables requises maintenant :

| Variable | Valeur | Note |
|----------|--------|------|
| `QWEN_API_KEY` | `sk-519c95b9a8694a59b80aa9c9ef466e51` | ✅ Déjà configuré |
| `DASHSCOPE_API_KEY` | `sk-519c95b9a8694a59b80aa9c9ef466e51` | ⚠️ Même valeur que QWEN_API_KEY |
| `SUPABASE_URL` | Votre URL Supabase | Requis |
| `SUPABASE_SERVICE_ROLE_KEY` | Votre clé service | Requis |
| `ELEVENLABS_API_KEY` | Votre clé ElevenLabs | Requis |
| `REMOTION_RENDERER_URL` | URL Remotion | Requis |
| `VIDEO_ENGINE` | `wan` | Recommandé |

### ❌ Variables devenues optionnelles :

- `WAN_IMAGE_API_KEY` - N'est plus utilisée
- `WAN_IMAGE_API_BASE` - N'est plus utilisée

---

## 🚀 Ce qui va se passer maintenant

1. **Render redéploie** automatiquement (1-2 min)

2. **Le worker valide la config** :
   ```
   🎨 DashScope (WANX Image + WAN Video):
     ✅ DASHSCOPE_API_KEY: sk-519c95b9a869...
   ```

3. **Workflow complet** :
   ```
   [Qwen] ✓ Script généré: 4 scènes
   [WANX Image] Génération avec DashScope...
   [WANX Image] Task ID: xxx, attente génération...
   [WANX Image] ✓ Image générée: https://...
   [Video] ✓ 4 clips générés
   [ElevenLabs] ✓ Audio généré
   [Remotion] ✓ Vidéo finale
   ```

---

## ⚠️ ACTION REQUISE

**Dans Render Dashboard** → `alphogenai-worker` → **Environment** :

1. **Vérifier que `DASHSCOPE_API_KEY` existe**
   - Si NON → Ajouter avec la même valeur que `QWEN_API_KEY`
   - Si OUI → Vérifier qu'elle est identique à `QWEN_API_KEY`

2. **Optionnel** : Supprimer `WAN_IMAGE_API_KEY` (plus utilisée)

3. **Save** et attendre le redéploiement

---

## 🧪 Test

Une fois le worker redéployé :

1. **Créer un nouveau job** depuis le frontend
2. **Logs attendus** :
   ```
   [Qwen] ✓ Script généré: 4 scènes
   [WANX Image] Génération avec DashScope...
   [WANX Image] ✓ Image générée: https://dashscope-result-bj.oss...
   ```

3. **Pas d'erreur `ConnectError`** ! 🎉

---

## 🐛 Si problème

### Erreur : `DASHSCOPE_API_KEY manquante`

**Solution** :
1. Render → Environment
2. Ajouter `DASHSCOPE_API_KEY` = `sk-519c95b9a8694a59b80aa9c9ef466e51`
3. Save → Redéployer

### Erreur HTTP 401 sur WANX Image

**Cause** : Clé invalide  
**Solution** : Vérifier que `DASHSCOPE_API_KEY` = `QWEN_API_KEY`

### Image generation timeout

**Cause** : Génération prend > 2 minutes  
**Solution** : Normal, le système retry automatiquement

---

**Commits** :
- `0d28fae` - feat: Switch WAN Image to DashScope WANX Image
- `9fa139c` - fix: Replace remaining datetime.utcnow() in orchestrator
- `0b0f54c` - fix: Replace deprecated datetime.utcnow()

---

**Maintenant tout le pipeline utilise DashScope ! 🚀**
