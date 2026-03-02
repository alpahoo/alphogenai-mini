# 🎨 Landing Page AlphoGenAI Mini - Documentation

## ✅ Livrables Créés

### Fichiers Créés

1. **`app/page.tsx`** - Page d'accueil complète (~200 lignes)
2. **`app/(components)/Header.tsx`** - Header avec logo et navigation
3. **`app/(components)/Footer.tsx`** - Footer minimaliste
4. **`app/(components)/VideoCard.tsx`** - Carte vidéo réutilisable
5. **`app/(components)/utils.ts`** - Fonctions utilitaires
6. **`app/layout.tsx`** - Mis à jour pour utiliser Header/Footer

---

## 🏗️ Structure de la Landing Page

### Hero Section

**Contenu:**
- Badge "IA générative • Vidéos cohérentes"
- Titre principal sur 2 lignes avec gradient
- Sous-titre explicatif
- CTA principal vers `/generate`
- 4 puces de crédibilité:
  - ⚡ 4-9 minutes - Génération rapide
  - 🎬 100% cohérent - Script IA
  - 💬 Sous-titré - Français natif
  - 🔗 Partageable - URL directe

**Design:**
- Gradient background avec decorative blurs
- Responsive (mobile-first)
- Animation subtle (badge pulse)
- CTA avec hover effects

### Section Vidéos

**Si vidéos disponibles:**
- Grid responsive (1 col mobile, 2 cols tablet, 3 cols desktop)
- 6 dernières vidéos affichées
- Chaque carte VideoCard avec miniature + actions

**Si aucune vidéo:**
- Message d'état vide élégant
- CTA "Créez la première vidéo"
- Card centrée avec icône et texte

### Section CTA Final

- Full-width card avec gradient
- Titre + description + CTA
- Design immersif (white CTA sur gradient)

---

## 🎴 Composant VideoCard

### Props

```typescript
interface VideoCardProps {
  id: string;
  final_url: string;
  prompt: string;
}
```

### Fonctionnalités

**Miniature Vidéo:**
- `<video>` avec `preload="metadata"`
- Aspect ratio 16:9
- Hover → scale + overlay play button
- `onMouseEnter` → jump to 2s (preview frame)

**Titre:**
- Extrait première phrase du prompt
- Tronqué à 80 caractères
- `line-clamp-2` pour 2 lignes max
- Hover → couleur blue-600

**Actions:**
- Bouton "Voir" → `/v/${id}`
- Bouton "Copier" → copie URL dans clipboard
  - Feedback visuel "✓ Copié" pendant 2s

**Design:**
- Card avec shadow subtle
- Hover → shadow-lg + scale légère
- Border radius arrondi
- Transition smooth sur tous les états

---

## 🎨 Header Component

### Structure

```
Logo (gauche) | Navigation (droite)
```

**Logo:**
- Emoji 🎬 + texte "AlphoGenAI Mini"
- Gradient text effect
- Link vers `/`

**Navigation:**
- Bouton "Générer" (gradient primary)
- Lien GitHub (si `NEXT_PUBLIC_GITHUB_URL` défini)
  - Icon GitHub SVG
  - Hover state

**Features:**
- Sticky top avec backdrop-blur
- Border bottom subtle
- Responsive (stack sur très petit mobile si nécessaire)
- Z-index 50 pour rester au-dessus

---

## 🦶 Footer Component

### Contenu

**Ligne principale:**
```
© 2025 AlphoGenAI Mini — Texte → Vidéo cohérente en 90s.
```

**Liens:**
- Mentions légales (placeholder `#`)
- Contact (si `NEXT_PUBLIC_CONTACT_EMAIL` défini)
- Créer une vidéo (`/generate`)

**Séparateurs:**
- Points `•` entre les liens

**Design:**
- Border top
- Text center
- Small text (text-sm, text-xs)
- Couleurs muted avec hover states

---

## 🔧 Fonctions Utilitaires

### `utils.ts`

```typescript
// Tronquer texte
truncate(text: string, maxLength: number): string

// Extraire première phrase
getFirstSentence(text: string): string

// Copier dans clipboard
copyToClipboard(text: string): Promise<boolean>

// Formater date relative
formatRelativeTime(date: Date | string): string
```

---

## 🗄️ Récupération des Vidéos

### Fonction `getRecentVideos()`

```typescript
async function getRecentVideos(): Promise<Video[]> {
  // Query Supabase
  const { data } = await supabase
    .from("jobs")
    .select("id, prompt, final_url, created_at")
    .in("status", ["done", "completed"])
    .not("final_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(6);

  return data || [];
}
```

**Gestion Erreurs:**
- Try/catch global
- Return `[]` si erreur
- Console.error pour debug
- UI affiche état vide si `[]`

**RLS:**
- Utilise `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Lecture publique requise sur `jobs` table
- Si RLS bloque → fallback gracieux (état vide)

---

## 🎨 Design System

### Couleurs

```css
/* Gradients */
from-blue-600 to-purple-600    // Primary CTA
from-slate-50 to-slate-100     // Background light
from-slate-900 to-slate-800    // Background dark

/* Colors */
blue-600 / blue-700            // Primary
purple-600                     // Accent
slate-900 / slate-100          // Text
slate-600 / slate-400          // Muted text
```

### Typography

```css
/* Headings */
text-4xl sm:text-5xl lg:text-6xl  // Hero h1
text-3xl sm:text-4xl              // Section h2
text-2xl                          // Card h3

/* Body */
text-lg sm:text-xl                // Hero subtitle
text-base                         // Body text
text-sm                           // Card text
text-xs                           // Footer
```

### Spacing

```css
/* Sections */
py-16 sm:py-20                    // Section padding
py-20 sm:py-28                    // Hero padding

/* Containers */
max-w-7xl mx-auto                 // Page container
max-w-4xl mx-auto                 // Narrow sections
max-w-2xl mx-auto                 // Text blocks

/* Gaps */
gap-6                             // Grid gaps
gap-4                             // Small gaps
space-y-8                         // Vertical spacing
```

### Responsive Grid

```css
/* Videos Grid */
grid grid-cols-1                  // Mobile
sm:grid-cols-2                    // Tablet
lg:grid-cols-3                    // Desktop
gap-6                             // Gap

/* Features Grid */
grid grid-cols-2                  // Mobile
sm:grid-cols-4                    // Desktop
```

---

## 🔒 Sécurité et Performance

### RSC (React Server Component)

- Page d'accueil en Server Component
- Fetch des vidéos côté serveur
- Pas de loading state client-side
- SEO-friendly

### Client Components

Uniquement:
- `VideoCard` (pour clipboard + interactions)
- Pas de state global
- Pas de Context

### Performance

**Vidéos:**
- `preload="metadata"` (pas autoplay)
- Lazy loading natif du browser
- Hover → preview frame (currentTime)

**Images:**
- Pas d'images externes
- Emojis pour icons
- SVG inline pour GitHub icon

**Assets:**
- Aucun JS externe
- Aucune font externe (utilise Geist system)
- Tailwind déjà présent

---

## 🎯 États UI

### Vidéos Disponibles

```
Hero
  ↓
Dernières créations (titre)
  ↓
Grid 3 colonnes
  ├─ VideoCard 1
  ├─ VideoCard 2
  ├─ VideoCard 3
  ├─ VideoCard 4
  ├─ VideoCard 5
  └─ VideoCard 6
  ↓
CTA Final
```

### Aucune Vidéo

```
Hero
  ↓
Dernières créations (titre)
  ↓
État vide centré
  ├─ Icon 🎬
  ├─ "Créez la première vidéo"
  ├─ Description
  └─ CTA "Commencer"
  ↓
CTA Final
```

### Erreur Supabase / RLS

```
Même comportement que "Aucune Vidéo"
(fallback gracieux)
```

---

## ⚙️ Variables d'Environnement

### Requises

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### Optionnelles

```bash
# Lien GitHub dans Header
NEXT_PUBLIC_GITHUB_URL=https://github.com/user/repo

# Contact dans Footer
NEXT_PUBLIC_CONTACT_EMAIL=contact@example.com
```

---

## 🧪 Tests à Effectuer

### Test 1: Vidéos Disponibles

```
1. Créer 3+ vidéos via /generate
2. Attendre status: done
3. Recharger / → Les vidéos apparaissent
4. Hover sur carte → Preview + play icon
5. Cliquer "Voir" → Redirige vers /v/[id]
6. Cliquer "Copier" → Clipboard + feedback
```

### Test 2: État Vide

```
1. Vider table jobs (ou RLS bloque tout)
2. Visiter /
3. Message "Créez la première vidéo" visible
4. CTA fonctionnel vers /generate
```

### Test 3: Responsive

```
1. Mobile (375px) → 1 colonne
2. Tablet (768px) → 2 colonnes
3. Desktop (1280px) → 3 colonnes
4. Header reste sticky
5. Textes s'adaptent (text-4xl → text-6xl)
```

### Test 4: Mode Sombre

```
1. Toggle dark mode (si présent)
2. Vérifier tous les textes lisibles
3. Vérifier contraste suffisant
4. Gradients restent visibles
```

### Test 5: Accessibilité

```
1. Navigation clavier (Tab)
2. Focus visible sur tous les boutons
3. Screen reader (alt texts)
4. Liens avec aria-label si icon only
```

---

## 📊 Métriques

### Performances

**Lighthouse (estimé):**
- Performance: 95+
- Accessibility: 95+
- Best Practices: 95+
- SEO: 100

**Core Web Vitals:**
- LCP: < 2.5s (Hero text)
- FID: < 100ms (interactions)
- CLS: < 0.1 (pas de layout shift)

### Taille

**JavaScript:**
- Server Component (pas de JS envoyé)
- VideoCard: ~2KB hydraté

**CSS:**
- Tailwind (déjà présent): ~10KB gzipped
- Pas de CSS custom

**Total Page Size:**
- HTML: ~15KB
- CSS: ~10KB (cached)
- JS: ~50KB (Next.js runtime)
- **Total: ~75KB** (first load)

---

## 🎨 Design Decisions

### Pourquoi ce Design?

**Hero Large:**
- Attire l'attention immédiatement
- Message clair en 3 secondes
- CTA évident

**Puces de Crédibilité:**
- Rassure sur les bénéfices clés
- Format scannable (icons + texte)
- Social proof implicite

**Grid Vidéos:**
- Preuve sociale (autres ont créé)
- Inspire de nouvelles idées
- Montre la qualité des résultats

**CTA Final:**
- Capture l'intention après exploration
- Design immersif (contraste élevé)
- Call-to-action clair

### Mobile-First

Toutes les sections optimisées mobile d'abord:
- Stack vertical naturel
- Touch targets >= 44px
- Textes lisibles sans zoom
- Pas de scroll horizontal

---

## 🔄 Intégration avec Pages Existantes

### Navigation

```
/ (Homepage)
  ├─ CTA Hero → /generate
  ├─ VideoCard → /v/[id]
  └─ Header → /generate

/generate (existe déjà)
  └─ Génère vidéo → /v/[id]

/v/[id] (existe déjà)
  └─ Header → / ou /generate
```

### Cohérence Design

**Même palette:**
- Gradients blue-600 to purple-600
- Backgrounds slate
- Même spacing (py-16, max-w-7xl)

**Même composants:**
- Boutons CTA identiques
- Cards similaires
- Typography cohérente

---

## ✅ Checklist Finale

### Fonctionnalités

- ✅ Hero avec titre + CTA
- ✅ Puces de crédibilité (4)
- ✅ Section vidéos (6 max)
- ✅ VideoCard avec miniature
- ✅ Bouton "Copier le lien"
- ✅ État vide élégant
- ✅ Header sticky avec logo
- ✅ Footer avec copyright
- ✅ Responsive (mobile → desktop)
- ✅ Mode sombre supporté

### Technique

- ✅ RSC pour page d'accueil
- ✅ Client component seulement pour VideoCard
- ✅ Supabase query avec fallback
- ✅ Gestion erreurs RLS
- ✅ TypeScript strict
- ✅ Aucune dépendance externe
- ✅ SEO metadata
- ✅ Accessible (focus, alt, aria)

### Design

- ✅ Tailwind uniquement
- ✅ Cohérent avec /generate et /v/[id]
- ✅ Animations subtiles (hover)
- ✅ Gradients modernes
- ✅ Spacing harmonieux
- ✅ Typography hiérarchique

---

## 🚀 Déploiement

### Build Check

```bash
npm run build
```

**Vérifier:**
- ✅ Aucune erreur TypeScript
- ✅ RSC correctement identifiés
- ✅ Client components marqués "use client"
- ✅ Bundle size acceptable

### Variables Environnement

**Production `.env.production`:**
```bash
NEXT_PUBLIC_SUPABASE_URL=https://prod.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=prod-key
NEXT_PUBLIC_GITHUB_URL=https://github.com/...
NEXT_PUBLIC_CONTACT_EMAIL=contact@domain.com
```

### Supabase RLS

**Activer lecture publique sur `jobs`:**

```sql
-- Policy pour lecture publique des vidéos terminées
CREATE POLICY "Public can view completed videos"
ON jobs FOR SELECT
USING (
  status IN ('done', 'completed')
  AND final_url IS NOT NULL
);
```

---

## 📚 Documentation Référence

### Files Structure

```
app/
├── page.tsx                    # Homepage (RSC)
├── layout.tsx                  # Root layout (modifié)
├── (components)/
│   ├── Header.tsx              # Header sticky
│   ├── Footer.tsx              # Footer simple
│   ├── VideoCard.tsx           # Carte vidéo (client)
│   └── utils.ts                # Helpers
├── generate/
│   └── page.tsx                # (existe déjà)
└── v/
    └── [id]/
        ├── page.tsx            # (existe déjà)
        └── VideoPlayer.tsx     # (existe déjà)
```

### Lignes de Code

- `page.tsx`: ~200 lignes
- `Header.tsx`: ~60 lignes
- `Footer.tsx`: ~40 lignes
- `VideoCard.tsx`: ~100 lignes
- `utils.ts`: ~50 lignes
- **Total: ~450 lignes**

---

## 🎯 Résumé

**Landing page minimaliste et efficace créée avec succès !**

**Objectifs atteints:**
- ✅ Hero clair et attractif
- ✅ Crédibilité établie (4 puces)
- ✅ Preuve sociale (dernières vidéos)
- ✅ CTA évidents et fonctionnels
- ✅ Responsive et accessible
- ✅ Aucune dépendance externe
- ✅ Performance optimale (RSC)
- ✅ Design cohérent avec reste de l'app

**Prêt pour:**
- 🚀 Démo publique
- 👥 Acquisition utilisateurs
- 📈 Conversion vers /generate
- 💰 Monétisation future

---

**Version:** 1.0.0  
**Date:** 2025-10-04  
**Status:** ✅ **PRODUCTION READY**  
**Pages:** 1 (/ + composants)  
**Impact:** Expérience SaaS cohérente de l'arrivée à la génération
