# 🚀 Vercel Environment Setup

## 📋 Variables d'environnement à configurer sur Vercel

### 🔑 Supabase (OBLIGATOIRE)
```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 🎬 Runway (pour API directe si nécessaire)
```bash
RUNWAY_API_URL=https://api.dev.runwayml.com/v1
RUNWAY_API_KEY=your_runway_api_key
RUNWAY_MODEL=gen3
```

## 🔧 Configuration dans Vercel Dashboard

1. **Aller sur** : https://vercel.com/dashboard
2. **Sélectionner le projet** AlphoGenAI Mini
3. **Settings** → **Environment Variables**
4. **Ajouter chaque variable** avec les valeurs ci-dessus

## 🎯 Architecture de communication

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │    Supabase     │    │   Worker        │
│   (Vercel)      │    │   (Database)    │    │   (Render)      │
├─────────────────┤    ├─────────────────┤    ├─────────────────┤
│ • Interface UI  │◄──►│ • Jobs queue    │◄──►│ • Runway API    │
│ • Auth          │    │ • User data     │    │ • Video gen     │
│ • API Routes    │    │ • Video storage │    │ • File upload   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 📊 Flux de génération vidéo

1. **User** → Soumet prompt sur Vercel frontend
2. **Vercel API** → Crée job dans Supabase
3. **Render Worker** → Détecte nouveau job
4. **Worker** → Génère vidéo avec Runway
5. **Worker** → Upload vidéo vers Supabase Storage  
6. **Worker** → Met à jour job status
7. **Frontend** → Poll status et affiche résultat

## 🔍 URLs de test

### Frontend Vercel
```
https://your-app.vercel.app
```

### Worker Render  
```
https://your-worker.onrender.com
```

### Supabase
```
https://your-project.supabase.co
```

## ✅ Avantages de cette architecture

- **Scalabilité** : Vercel scale automatiquement le frontend
- **Performance** : CDN global pour l'interface
- **Coûts** : Render gratuit pour le worker, Vercel gratuit pour le frontend
- **Simplicité** : Pas de refactoring majeur du code existant
- **Fiabilité** : Séparation des responsabilités

## 🚀 Prochaines étapes

1. ✅ Configurer les variables Vercel
2. ✅ Redéployer sur Vercel  
3. ✅ Vérifier que le worker Render fonctionne
4. ✅ Tester la génération end-to-end