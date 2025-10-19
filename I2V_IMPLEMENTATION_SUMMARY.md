# 🎨 AlphoGenAI Mini - Image-to-Video Implementation

## 📋 Résumé de l'implémentation

Cette implémentation ajoute le **mode Image → Vidéo (i2v)** à AlphoGenAI Mini, permettant aux utilisateurs de créer des vidéos à partir d'images de référence en plus du mode texte-vers-vidéo existant.

## 🎯 Fonctionnalités implémentées

### ✅ 1. Double mode de génération
- **T2V (Text-to-Video)** : Génération vidéo à partir d'un prompt texte
- **I2V (Image-to-Video)** : Animation d'une image de référence selon un prompt de mouvement

### ✅ 2. Interface utilisateur améliorée
- Toggle T2V/I2V dans l'interface de génération
- Upload d'image avec prévisualisation
- Validation des fichiers (type, taille max 10MB)
- Interface adaptative selon le mode sélectionné

### ✅ 3. Backend robuste
- Support des deux modes dans l'API Runway
- Stockage automatique des images dans Supabase Storage (bucket `casts/`)
- Copie automatique des vidéos vers Supabase Storage (bucket `videos/`)
- URLs signées pour un accès sécurisé et permanent

### ✅ 4. Prévisualisation vidéo améliorée
- Composant `VideoPreview` avec modal intégré
- Détection automatique des URLs temporaires vs permanentes
- Gestion des liens expirés avec fallback
- Bouton "œil" pour prévisualisation rapide

## 📁 Fichiers modifiés/créés

### 🗄️ Base de données
- `supabase/migrations/20251019_add_generation_mode.sql` - Migration pour les nouveaux champs

### 🔧 Backend
- `workers/runway_service.py` - Support i2v dans l'API Runway
- `workers/runway_orchestrator.py` - Orchestration des deux modes
- `workers/supabase_storage_service.py` - **NOUVEAU** Service de stockage Supabase
- `supabase/functions/daily-video-gen/index.ts` - **NOUVEAU** Edge Function

### 🎨 Frontend
- `app/creator/generate/ui/CreatorGenerateClient.tsx` - **NOUVEAU** Interface principale
- `app/creator/generate/page.tsx` - Mise à jour pour utiliser le nouveau composant
- `app/(components)/VideoPreview.tsx` - **NOUVEAU** Composant de prévisualisation
- `app/v/[id]/VideoPlayer.tsx` - Intégration du nouveau composant
- `app/api/generate-video/route.ts` - Support des nouveaux paramètres

### 🧪 Tests
- `test_i2v_implementation.py` - **NOUVEAU** Script de test complet

## 🔧 Configuration requise

### Variables d'environnement
```bash
# Runway API
RUNWAY_API_KEY=your_runway_api_key
RUNWAY_API_BASE=https://api.dev.runwayml.com/v1
RUNWAY_MODEL=gen4_turbo

# Supabase
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

### Buckets Supabase Storage
- `casts/` - Stockage des images de référence
- `videos/` - Stockage permanent des vidéos générées

## 📊 Exemples de payload

### Text-to-Video (T2V)
```json
{
  "prompt": "Un robot futuriste découvre un océan lumineux",
  "generation_mode": "t2v"
}
```

### Image-to-Video (I2V)
```json
{
  "prompt": "Le robot bouge lentement ses bras vers le haut",
  "generation_mode": "i2v",
  "image_ref_url": "https://supabase.co/.../robot.jpg"
}
```

## 🚀 Déploiement

### 1. Base de données
```bash
supabase db push
```

### 2. Edge Functions
```bash
supabase functions deploy daily-video-gen
```

### 3. Variables d'environnement
Mettre à jour sur votre plateforme de déploiement (Render, Vercel, etc.)

## 🎯 Coûts optimisés

### Modèle gen4_turbo
- **5 credits/sec** (vs 40 pour veo3)
- **87.5% moins cher** : $0.50 vs $3.20 par vidéo 10s
- **Durée** : 5s ou 10s
- **Qualité** : 720p HD

### Calcul des coûts
- Vidéo 10s = 10s × 5 credits × $0.01 = **$0.50**
- Mode i2v : même coût que t2v

## 🔍 Workflow complet

### Mode T2V
1. Utilisateur saisit un prompt
2. Génération script avec Qwen Mock
3. Génération vidéo avec Runway gen4_turbo
4. Copie vers Supabase Storage
5. Sélection musique (optionnel)
6. Finalisation avec URL signée

### Mode I2V
1. Utilisateur upload une image → Supabase Storage
2. Utilisateur saisit un prompt de mouvement
3. Génération vidéo avec Runway gen4_turbo + image
4. Copie vers Supabase Storage
5. Sélection musique (optionnel)
6. Finalisation avec URL signée

## 🛡️ Sécurité et RLS

### Row Level Security (RLS)
- Utilisateurs voient uniquement leurs propres projets
- Admins ont accès à tous les contenus
- URLs signées avec expiration (24h par défaut)

### Validation
- Types de fichiers image supportés
- Taille max 10MB pour les images
- Validation des modes de génération
- Sanitisation des inputs

## 📱 Interface utilisateur

### Fonctionnalités UX
- Toggle visuel T2V/I2V
- Drag & drop pour les images
- Prévisualisation temps réel
- Messages d'erreur contextuels
- Indicateurs de progression
- Mode sombre/clair

### Responsive Design
- Mobile-first approach
- Adaptation automatique des layouts
- Touch-friendly sur mobile

## 🧪 Tests et validation

### Script de test inclus
```bash
python test_i2v_implementation.py
```

### Tests couverts
1. ✅ Schema de base de données
2. ✅ Service Supabase Storage
3. ✅ Mode Text-to-Video
4. ✅ Mode Image-to-Video

## 🎉 Résultat final

L'implémentation fournit :
- **Double mode** T2V/I2V fonctionnel
- **Interface moderne** avec toggle intuitif
- **Coûts réduits** avec gen4_turbo
- **Stockage permanent** dans Supabase
- **Prévisualisation avancée** avec modal
- **Architecture scalable** et maintenable

Le système est maintenant prêt pour la production avec support complet du mode Image-to-Video ! 🚀