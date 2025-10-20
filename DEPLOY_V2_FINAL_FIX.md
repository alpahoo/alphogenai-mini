# 🚀 DEPLOY V2 - FINAL FIX

## 🔧 Version 2 complètement réécrite

### ✅ Corrections appliquées

1. **URL CORRECTE enfin** :
   ```
   ❌ https://api.dev.runwayml.com/v1/text_to_video
   ✅ https://api.dev.runwayml.com/v1/tasks
   ```

2. **Modèle simplifié** :
   ```
   ❌ gen4_turbo, gen3a_turbo (non disponibles)
   ✅ gen3 (plus simple)
   ✅ Fallback sans modèle si échec
   ```

3. **Payload correct** :
   ```json
   {
     "type": "text_to_video",
     "model": "gen3",
     "input": {
       "promptText": "...",
       "duration": 5,
       "ratio": "1280:720"
     }
   }
   ```

4. **Retry automatique** :
   - Si modèle non disponible → Retry sans modèle
   - Utilise le modèle par défaut de Runway

### 🎯 Logs attendus

```
[Runway V2] Initialized:
[Runway V2]   Tasks URL: https://api.dev.runwayml.com/v1/tasks
[Runway V2]   Model: gen3
[Runway V2] === CORRECT API CALL ===
[Runway V2] URL: https://api.dev.runwayml.com/v1/tasks
[Runway V2] Type: text_to_video
[Runway V2] Response status: 200
[Runway V2] ✓ Task created: task_123
```

### 🔧 Variables d'environnement

```bash
RUNWAY_API_URL=https://api.dev.runwayml.com/v1
RUNWAY_MODEL=gen3
RUNWAY_API_KEY=your_api_key
```

### 💡 Stratégie de fallback

1. **Essaie avec modèle `gen3`**
2. **Si échec 403** → Retry sans modèle
3. **Utilise le modèle par défaut** de Runway

### 🎯 Résultat attendu

- ✅ Plus d'erreur 404 sur `/text_to_video`
- ✅ Plus d'erreur 403 "Model not available"
- ✅ Génération vidéo réussie
- ✅ Coût réduit avec 5 secondes

---
**Cette version V2 devrait ENFIN fonctionner !** 🎯

Timestamp: 2025-10-20T17:00:00Z