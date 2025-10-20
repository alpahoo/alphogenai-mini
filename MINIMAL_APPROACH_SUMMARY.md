# 🎯 MINIMAL APPROACH - Dernière tentative

## 📊 Problèmes persistants identifiés

1. **URL ENCORE incorrecte** malgré tous les déploiements
2. **TOUS les modèles sont "not available"** :
   - ❌ `gen4_turbo`
   - ❌ `gen3a_turbo` 
   - ❌ `gen3`

## 🔧 Solution MINIMALE

### ✅ Changements radicaux

1. **AUCUN modèle spécifié** → Utilise le défaut Runway
2. **URL construite explicitement** → Garantit `/v1/tasks`
3. **Payload minimal** → Seulement les champs requis
4. **Logs détaillés** → Pour voir exactement ce qui se passe

### 📋 Payload minimal

```json
{
  "type": "text_to_video",
  "input": {
    "promptText": "...",
    "duration": 5,
    "ratio": "1280:720"
  }
}
```

**PAS de champ `model`** → Runway utilise son modèle par défaut

### 🎯 Variables d'environnement simplifiées

```bash
RUNWAY_API_URL=https://api.dev.runwayml.com/v1
RUNWAY_API_KEY=your_api_key
```

**PAS de `RUNWAY_MODEL`** → Évite les erreurs de modèle

### 📊 Logs attendus

```
[Runway MINIMAL] URL: https://api.dev.runwayml.com/v1/tasks
[Runway MINIMAL] No model specified - using Runway default
[Runway MINIMAL] === MINIMAL API CALL ===
[Runway MINIMAL] Type: text_to_video
[Runway MINIMAL] Response: 200
[Runway MINIMAL] ✓ Task created: task_xxx
```

## 🎯 Diagnostic

Si cette version minimale échoue encore :

### ❌ Si URL encore incorrecte
→ **Problème de cache Render** - Le code n'est pas déployé

### ❌ Si erreur d'authentification
→ **Problème de clé API** - Vérifier `RUNWAY_API_KEY`

### ❌ Si erreur de quota/crédits
→ **Problème de compte** - Vérifier les crédits Runway

### ✅ Si ça marche
→ **Problème était les modèles** - Utiliser le défaut

## 💡 Prochaines étapes

1. **Si ça marche** → Garder cette approche simple
2. **Optimiser ensuite** → Tester d'autres modèles si nécessaire
3. **Augmenter durée** → Passer à 8-10s une fois stable

---

**Cette version DOIT marcher ou révéler le vrai problème !** 🎯