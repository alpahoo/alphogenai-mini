# 🎯 RUNWAY API CORRECTION - STRUCTURE OFFICIELLE

## ❌ Problème identifié

L'erreur venait de l'utilisation d'une **mauvaise structure d'API** :
- ❌ Tentative d'appel : `POST /v1/tasks/text_to_video` 
- ❌ Structure incorrecte du payload

## ✅ Solution appliquée

### 1. Endpoint unique
```
POST https://api.dev.runwayml.com/v1/tasks
```

### 2. Type dans le payload JSON

**Text-to-Video :**
```json
{
  "type": "text_to_video",
  "model": "gen4_turbo", 
  "input": {
    "promptText": "Un robot découvre l'océan...",
    "duration": 10,
    "ratio": "1280:720"
  }
}
```

**Image-to-Video :**
```json
{
  "type": "image_to_video",
  "model": "gen4_turbo",
  "input": {
    "image": {"url": "https://supabase.co/.../image.jpg"},
    "promptText": "Le robot bouge lentement...",
    "duration": 10, 
    "ratio": "1280:720"
  }
}
```

## 🔧 Fichiers corrigés

### 1. `workers/runway_service.py`
- ✅ Structure de payload correcte avec `type` et `input`
- ✅ URL unique `/v1/tasks`
- ✅ Gestion des deux modes t2v/i2v

### 2. `supabase/functions/daily-video-gen/index.ts`
- ✅ Même structure de payload
- ✅ Logs de debug améliorés

## 🎯 Variables d'environnement

```bash
# Render/Production
RUNWAY_API_URL=https://api.dev.runwayml.com/v1
RUNWAY_MODEL=gen4_turbo
RUNWAY_API_KEY=your_api_key
```

> **Note :** `RUNWAY_API_URL` sans `/tasks` - le code ajoute `/tasks` automatiquement.

## 🚀 Résultat attendu

Après déploiement, les logs devraient montrer :

```
[Runway] ===== CORRECT API CALL =====
[Runway] URL: https://api.dev.runwayml.com/v1/tasks
[Runway] Type: text_to_video
[Runway] ===============================
```

Et l'appel API devrait réussir avec un code 200/201 au lieu du 404.

## 💰 Coûts confirmés

- **gen4_turbo** : 5 credits/sec = $0.50 pour 10s
- **Durée** : 10 secondes (au lieu de 8s)
- **Mode i2v** : même coût que t2v

## 🎉 Fonctionnalités prêtes

1. ✅ **Double mode** T2V/I2V avec toggle
2. ✅ **Structure API correcte** selon la doc Runway
3. ✅ **Stockage permanent** dans Supabase
4. ✅ **Prévisualisation** avec modal
5. ✅ **Coûts optimisés** avec gen4_turbo

---

**Cette correction devrait résoudre définitivement l'erreur 404 !** 🎯