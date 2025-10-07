# 🔧 FIX RENDER - Signal 15 en boucle

## Problème
Render redémarre le worker en boucle → Signal 15 immédiat

## Solution

### 1️⃣ Sur le Dashboard Render

1. Allez sur **alphogenai-mini-worker**
2. Onglet **Settings**
3. Section **Build & Deploy**
4. **Désactivez "Auto-Deploy"** temporairement
5. **Cliquez "Deploy latest commit"** MANUELLEMENT

### 2️⃣ Vérifiez les logs

Après le déploiement manuel, vous devriez voir :

```
✅ Configuration valide - Démarrage du worker...
🎬 AlphogenAI Mini Worker
Démarré: 2025-10-07T23:XX:XX
En attente de jobs...
```

**SANS Signal 15 !**

### 3️⃣ Si Signal 15 persiste

Le problème est un **health check Render**. Dans ce cas :

1. Settings → Health & Alerts
2. Désactivez "Health Check Path" temporairement
3. Redéployez

---

## Pourquoi ça arrive ?

Render pense que le worker est "unhealthy" car :
- Il n'expose pas de port HTTP (c'est un worker, pas une API)
- Ou les health checks échouent

**Solution** : Désactiver health checks pour les workers Python.

