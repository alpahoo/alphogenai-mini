# ✅ Correction de l'URL API Runway

## 🔧 Variable corrigée

**Avant :** `RUNWAY_API_BASE=https://api.dev.runwayml.com/v1`
**Maintenant :** `RUNWAY_API_URL=https://api.dev.runwayml.com/v1/tasks`

## 📁 Fichiers corrigés

### 1. `workers/runway_service.py`
```python
# Avant
self.base_url = os.getenv("RUNWAY_API_BASE", "https://api.dev.runwayml.com/v1")

# Maintenant  
self.api_url = os.getenv("RUNWAY_API_URL", "https://api.dev.runwayml.com/v1/tasks")
```

### 2. `supabase/functions/daily-video-gen/index.ts`
```typescript
// Avant
const runwayApiBase = Deno.env.get('RUNWAY_API_BASE') || 'https://api.dev.runwayml.com/v1';

// Maintenant
const runwayApiUrl = Deno.env.get('RUNWAY_API_URL') || 'https://api.dev.runwayml.com/v1/tasks';
```

### 3. Documentation mise à jour
- `I2V_IMPLEMENTATION_SUMMARY.md`
- `FINAL_I2V_DELIVERY.md`

## 🎯 Comportement API

### Création de tâche (POST)
```
URL: https://api.dev.runwayml.com/v1/tasks
```

### Vérification du statut (GET)
```
URL: https://api.dev.runwayml.com/v1/tasks/{task_id}
```

Le code gère automatiquement la construction de l'URL de statut à partir de l'URL de base.

## ✅ Variables d'environnement finales

```bash
# Runway API
RUNWAY_API_KEY=your_runway_api_key
RUNWAY_API_URL=https://api.dev.runwayml.com/v1/tasks
RUNWAY_MODEL=gen4_turbo

# Supabase
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_key
```

## 🚀 Prêt pour le déploiement

La correction est maintenant appliquée dans tous les fichiers. L'API utilisera correctement :
- `RUNWAY_API_URL` au lieu de `RUNWAY_API_BASE`
- L'endpoint `/tasks` pour les créations et vérifications de statut