# 🔍 Runway Model Research

## 📊 Modèles testés et résultats

### ❌ Modèles non disponibles
- `gen4_turbo` → "Model variant gen4_turbo is not available"
- `gen3a_turbo` → "Model variant gen3a_turbo is not available"

## 🎯 Modèles à tester ensuite

Selon la documentation Runway, essayons ces variantes :

### 1. Modèles Gen-3 probables
- `gen3`
- `runway-gen3`
- `runwayml/gen3`

### 2. Modèles standards
- `runway` (modèle par défaut)
- `default`

### 3. Anciens modèles stables
- `gen2`
- `gen1`

## 🔧 Structure API correcte

D'après les logs, l'URL est encore incorrecte. Il faut absolument :

1. **URL unique** : `POST /v1/tasks`
2. **Type dans payload** : `"type": "text_to_video"`
3. **Modèle valide** : à déterminer

## 💡 Plan d'action

1. **Forcer le bon code** avec l'URL correcte
2. **Tester le modèle `gen3`** (plus simple)
3. **Vérifier la documentation** Runway pour les modèles exacts
4. **Tester sans modèle** (utiliser le défaut)

## 🎯 Payload de test minimal

```json
{
  "type": "text_to_video",
  "input": {
    "promptText": "A simple test video",
    "duration": 5,
    "ratio": "1280:720"
  }
}
```

Sans spécifier de modèle, l'API devrait utiliser le modèle par défaut.