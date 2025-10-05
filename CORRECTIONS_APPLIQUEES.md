# Corrections Appliquées - AlphoGenAI Mini

**Date**: 2025-10-05  
**Commit**: 786083d

## 🔧 Problème Résolu

### Erreur: "Missing Supabase environment variables"

**Symptôme**: L'interface `/generate` affichait un message d'erreur "Missing Supabase environment variables" malgré que les variables soient configurées dans Vercel.

**Cause Racine**: Incohérence entre les noms de variables utilisés dans le code et ceux configurés dans Vercel.

- **Code attendait**: `SUPABASE_SERVICE_ROLE`
- **Vercel contenait**: `SUPABASE_SERVICE_ROLE_KEY`

### ✅ Corrections Apportées

#### 1. API Route `/api/generate-video/route.ts`
```typescript
// AVANT
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE;

// APRÈS
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
```

**Résultat**: L'API accepte maintenant les deux noms de variables avec un fallback.

#### 2. Workers Config `/workers/config.py`
```python
# AVANT
SUPABASE_SERVICE_KEY: str

# APRÈS  
SUPABASE_SERVICE_KEY: Optional[str] = None
SUPABASE_SERVICE_ROLE_KEY: Optional[str] = None

def get_service_key(self) -> str:
    return self.SUPABASE_SERVICE_ROLE_KEY or self.SUPABASE_SERVICE_KEY or ""
```

**Résultat**: Les workers backend supportent maintenant les deux conventions de nommage.

## 🎬 Workflow de Génération Vidéo

### Architecture Confirmée - WAN Video (PAS Pika)

Le système AlphoGenAI Mini utilise **WAN Video** comme moteur principal de génération vidéo. Voici le pipeline complet:

```
1. SCRIPT → Qwen LLM (4 scènes avec description + narration)
2. VIDEO → WAN Video via DashScope (clips de 4-8s)
3. AUDIO → ElevenLabs (narration + sous-titres SRT)
4. FINAL → Remotion (assemblage MP4)
```

### Variables d'Environnement Requises

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Qwen (Script)
QWEN_API_KEY=sk-...
QWEN_API_BASE=https://dashscope.aliyuncs.com/compatible-mode/v1

# DashScope WAN Video (Génération vidéo)
DASHSCOPE_API_KEY=sk-...
DASHSCOPE_API_BASE=https://dashscope-intl.aliyuncs.com/api/v1

# ElevenLabs (Audio)
ELEVENLABS_API_KEY=...

# Remotion (Assemblage)
REMOTION_RENDERER_URL=http://localhost:3001

# Configuration
VIDEO_ENGINE=wan
```

## 🧪 Comment Tester

1. Accéder à: `https://nextjs-with-supabase-l5zv-paul-alains-projects.vercel.app/generate`
2. Entrer un prompt: "Explique la photosynthèse comme si j'ai 10 ans, ton positif et inspirant"
3. Cliquer sur "Générer ma vidéo"

**✅ Plus d'erreur "Missing Supabase environment variables" !**

## 📊 Déploiement

- Commit: `786083d`
- Branch: `main`
- Statut: ✅ Déployé sur Vercel Production
- Workflow: WAN Video confirmé

---
*Documentation générée - Session Devin*
