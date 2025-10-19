# 🔧 Debug Runway API URL Issue

## ❌ Problème identifié

Le worker utilise encore l'URL incorrecte :
```
https://api.dev.runwayml.com/v1/tasks/text_to_video  ❌
```

Au lieu de :
```
https://api.dev.runwayml.com/v1/tasks  ✅
```

## 🔍 Analyse

Le code local est correct, mais le déploiement utilise encore l'ancienne version.

## ✅ Solution immédiate

Forcer un redéploiement complet avec les bonnes variables :

### 1. Variables d'environnement sur Render
```bash
RUNWAY_API_URL=https://api.dev.runwayml.com/v1/tasks
RUNWAY_MODEL=gen4_turbo
```

### 2. Vérification du code déployé
Le worker doit utiliser exactement cette URL sans ajout de suffixe.

### 3. Test de l'API
```bash
curl -X POST https://api.dev.runwayml.com/v1/tasks \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -H "X-Runway-Version: 2024-11-06" \
  -d '{
    "model": "gen4_turbo",
    "promptText": "A robot discovers the ocean",
    "duration": 10,
    "ratio": "1280:720"
  }'
```

## 🚀 Actions requises

1. **Redéployer** le worker avec le code corrigé
2. **Vérifier** que `RUNWAY_API_URL` est bien définie
3. **Tester** une génération simple