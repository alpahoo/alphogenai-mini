# 🎨 Intégration Pages UI - AlphoGenAI Mini

## ✅ Pages Créées

### 1. Page de Génération (`/app/generate/page.tsx`)

**Route:** `http://localhost:3000/generate`

#### Fonctionnalités

✅ **Formulaire de saisie**
- Textarea pour décrire la vidéo
- Placeholder en français avec exemple
- Validation minimum 5 caractères
- Disabled pendant génération

✅ **Gestion des états**
- Loading state avec spinner animé
- Message d'erreur affiché si échec
- Désactivation bouton si prompt vide

✅ **Interaction API**
- POST `/api/generate-video` avec `{ prompt }`
- Récupère `{ jobId, cached, final_url }`
- Redirection automatique vers `/v/[jobId]`
- Gère cache HIT et MISS

✅ **Design moderne**
- Gradient background
- Card avec shadow
- Bouton gradient animé
- Responsive Tailwind CSS
- Mode sombre supporté

#### Code Structure

```tsx
"use client";

export default function GeneratePage() {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const handleGenerate = async () => {
    // Validation
    // POST /api/generate-video
    // Redirection vers /v/[jobId]
  }
  
  return (
    <main>
      <textarea placeholder="Décris ta vidéo..." />
      <button onClick={handleGenerate}>Générer</button>
    </main>
  );
}
```

---

### 2. Page de Visualisation (`/app/v/[id]/page.tsx` + `VideoPlayer.tsx`)

**Route:** `http://localhost:3000/v/[jobId]`

#### Architecture

**Server Component** (`page.tsx`)
- Récupère le job initial depuis Supabase
- Gestion erreur 404
- Passe les données au composant client

**Client Component** (`VideoPlayer.tsx`)
- Polling automatique toutes les 8s
- Affichage dynamique selon status
- Interactions utilisateur

#### Fonctionnalités

✅ **Affichage vidéo** (status: done)
- Player vidéo HTML5 natif
- Controls complets
- Aspect ratio 16:9
- Bouton télécharger
- Bouton copier lien

✅ **Polling automatique** (status: pending/in_progress)
- Check toutes les 8 secondes
- Arrêt automatique quand done/failed
- Barre de progression estimée
- Affichage du current_stage
- Message informatif

✅ **Gestion des états**
- `done` → Affiche vidéo
- `pending/in_progress` → Polling avec loader
- `failed` → Message d'erreur
- `done` sans final_url → "Rendu en cours..."

✅ **UI/UX**
- Barre de progression visuelle
- Indicateur de polling actif
- Messages contextuels
- Boutons d'action clairs
- Design cohérent

#### États du Job

| Status | Affichage |
|--------|-----------|
| `pending` | ⏳ Génération en cours... |
| `in_progress` | ⏳ Étape actuelle: {stage} |
| `done` + final_url | 🎥 Player vidéo + actions |
| `done` sans final_url | ⏳ Rendu final en cours... |
| `failed` | ❌ Erreur + message |
| `cancelled` | ⚠️ Annulé |

---

## 🎨 Design UI

### Palette de Couleurs

```css
/* Gradients */
--gradient-primary: from-blue-600 to-purple-600
--gradient-bg: from-slate-50 to-slate-100
--gradient-dark: from-slate-900 to-slate-800

/* Colors */
--primary: blue-600
--secondary: purple-600
--error: red-600
--success: green-600
--muted: slate-500
```

### Composants

**Card principale:**
```tsx
<div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8">
  {/* Contenu */}
</div>
```

**Bouton primaire:**
```tsx
<button className="bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold py-4 px-6 rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all shadow-lg">
  Générer ma vidéo
</button>
```

**Spinner:**
```tsx
<svg className="animate-spin h-5 w-5">
  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0..." />
</svg>
```

---

## 🔄 Flux Utilisateur

### Génération d'une nouvelle vidéo

```
1. User → /generate
2. Saisit → "Un robot explique la lune..."
3. Clique → "Générer ma vidéo"
4. API → POST /api/generate-video
   └─ Check cache
      ├─ HIT: {jobId, final_url, cached: true}
      └─ MISS: {jobId, cached: false}
5. Redirect → /v/[jobId]
```

### Sur la page vidéo

**Si cache HIT (cached: true):**
```
1. Load /v/[jobId]
2. Fetch job → status: "done", final_url: "..."
3. Display → Video player immédiatement
4. No polling
```

**Si cache MISS (cached: false):**
```
1. Load /v/[jobId]
2. Fetch job → status: "pending"
3. Display → Loader + "Génération en cours..."
4. Start → Polling toutes les 8s
5. Worker → Process job (4-9 minutes)
6. Polling → Détecte status: "done"
7. Display → Video player
8. Stop → Polling
```

---

## 🔧 Fonctionnalités Techniques

### Polling Intelligent

```typescript
useEffect(() => {
  const isDone = job.status === "done" || job.status === "completed";
  
  if (isDone || job.status === "failed") {
    return; // Pas de polling
  }

  const interval = setInterval(async () => {
    const res = await fetch(`/api/generate-video?id=${job.id}`);
    const data = await res.json();
    setJob(data);
    
    if (data.status === "done") {
      clearInterval(interval);
      router.refresh(); // Recharger la page
    }
  }, 8000);

  return () => clearInterval(interval);
}, [job.status]);
```

### Barre de Progression

```typescript
function getProgressWidth(stage: string | null): string {
  const stageProgress: Record<string, string> = {
    "qwen_script": "20%",
    "wan_image": "35%",
    "video_clips": "50%",
    "elevenlabs_audio": "70%",
    "remotion_assembly": "85%",
    "completed": "100%",
  };
  return stageProgress[stage] || "50%";
}
```

### Copy to Clipboard

```typescript
const handleCopyLink = () => {
  const url = window.location.href;
  navigator.clipboard.writeText(url);
  setCopied(true);
  setTimeout(() => setCopied(false), 2000);
};
```

---

## 📱 Responsive Design

**Breakpoints:**
- Mobile: `max-w-2xl mx-auto p-6`
- Tablet: Idem (Tailwind adapte automatiquement)
- Desktop: Idem

**Adaptations:**
- Textarea: 100% width sur mobile
- Boutons: Stack vertical sur mobile (`flex-wrap`)
- Video: Aspect ratio préservé

---

## 🎯 Validation

### Checklist Page /generate

- ✅ Composant client ("use client")
- ✅ Textarea avec placeholder FR
- ✅ Validation minimum 5 caractères
- ✅ POST /api/generate-video
- ✅ Gestion loading state
- ✅ Gestion erreur
- ✅ Redirection vers /v/[jobId]
- ✅ Design Tailwind moderne
- ✅ Support mode sombre
- ✅ Aucune dépendance externe

### Checklist Page /v/[id]

- ✅ Server component pour SEO
- ✅ Client component pour polling
- ✅ Lecture de params.id (async)
- ✅ Fetch job depuis Supabase
- ✅ Gestion 404 (job introuvable)
- ✅ Player vidéo (status: done)
- ✅ Polling toutes les 8s
- ✅ Arrêt polling quand done
- ✅ Barre de progression
- ✅ Affichage current_stage
- ✅ Bouton copier lien
- ✅ Bouton télécharger
- ✅ Lien "Créer une autre vidéo"
- ✅ Support done + completed
- ✅ Gestion erreurs
- ✅ Design responsive

---

## 📊 Structure des Fichiers

```
app/
├── generate/
│   └── page.tsx              (Formulaire client)
└── v/
    └── [id]/
        ├── page.tsx          (Server component)
        └── VideoPlayer.tsx   (Client component avec polling)
```

---

## 🚀 Test du Flux Complet

### Scénario 1: Nouvelle vidéo

```bash
1. Ouvrir http://localhost:3000/generate
2. Saisir: "Un robot explique la lune à un enfant"
3. Cliquer "Générer ma vidéo"
4. Attendre redirection → /v/[jobId]
5. Voir loader avec polling
6. Attendre 4-9 minutes
7. Vidéo s'affiche automatiquement
8. Cliquer "Télécharger" ou "Copier le lien"
```

### Scénario 2: Vidéo en cache

```bash
1. Ouvrir http://localhost:3000/generate
2. Saisir le MÊME prompt qu'avant
3. Cliquer "Générer ma vidéo"
4. Redirection → /v/[newJobId]
5. Vidéo affichée immédiatement (< 1s)
6. Aucun polling nécessaire
```

### Scénario 3: Erreur de génération

```bash
1. Job échoue (API error, timeout, etc.)
2. Page /v/[id] affiche message d'erreur
3. Bouton "Réessayer" → retour à /generate
```

---

## 📐 Spécifications UI

### Formulaire

```
┌─────────────────────────────────────────┐
│  🎬 Génère ta Vidéo IA                 │
│  Décris ton idée...                     │
│                                         │
│  ┌───────────────────────────────────┐ │
│  │ Textarea (h-40)                   │ │
│  │ Placeholder: Décris ta vidéo...   │ │
│  │                                   │ │
│  └───────────────────────────────────┘ │
│                                         │
│  ┌───────────────────────────────────┐ │
│  │  🎬 Générer ma vidéo              │ │
│  └───────────────────────────────────┘ │
│                                         │
│  Temps estimé: 4-9 minutes              │
└─────────────────────────────────────────┘
```

### Page Vidéo (En cours)

```
┌─────────────────────────────────────────┐
│  🎥 Votre Vidéo                         │
│  Un robot explique la lune...           │
│                                         │
│  ┌───────────────────────────────────┐ │
│  │  ⏳ Génération en cours...        │ │
│  │  Étape: video_clips               │ │
│  │                                   │ │
│  │  [████████░░░░░░░░] 50%          │ │
│  │                                   │ │
│  │  🔄 Actualisation auto 8s         │ │
│  │                                   │ │
│  │  💡 Vous pouvez fermer cette page │ │
│  └───────────────────────────────────┘ │
│                                         │
│  ← Retour au formulaire                │
└─────────────────────────────────────────┘
```

### Page Vidéo (Terminée)

```
┌─────────────────────────────────────────┐
│  🎥 Votre Vidéo                         │
│  Un robot explique la lune...           │
│                                         │
│  ┌───────────────────────────────────┐ │
│  │                                   │ │
│  │      VIDEO PLAYER                 │ │
│  │      [▶] ━━━━━━━━━━ 00:24        │ │
│  │                                   │ │
│  └───────────────────────────────────┘ │
│                                         │
│  ┌──────────────┐  ┌────────────────┐ │
│  │ 📋 Copier    │  │ 💾 Télécharger │ │
│  └──────────────┘  └────────────────┘ │
│                                         │
│  ┌───────────────────────────────────┐ │
│  │ ✨ Créer une autre vidéo          │ │
│  └───────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

---

## 🎨 Classes Tailwind Utilisées

### Layout
```css
min-h-screen                 - Hauteur minimum viewport
flex items-center            - Centrage vertical
justify-center               - Centrage horizontal
p-6                          - Padding 1.5rem
max-w-2xl mx-auto            - Container centré
```

### Gradients
```css
bg-gradient-to-r from-blue-600 to-purple-600  - Bouton
bg-gradient-to-br from-slate-50 to-slate-100  - Background
bg-clip-text text-transparent                 - Titre gradient
```

### States
```css
hover:bg-blue-700           - Hover bouton
disabled:bg-slate-400       - Disabled state
disabled:cursor-not-allowed - Cursor disabled
transition-all              - Animations smooth
```

### Dark Mode
```css
dark:bg-slate-800          - Background sombre
dark:text-slate-100        - Texte sombre
dark:border-slate-600      - Bordure sombre
```

---

## 🔄 Polling Mechanism

### Intervalle

- **Fréquence:** 8 secondes
- **Arrêt:** Quand status = done/failed/cancelled
- **Timeout:** Aucun (continue jusqu'à completion)

### Optimisations

```typescript
// Cleanup au démontage
return () => clearInterval(interval);

// Arrêt conditionnel
if (isDone || isFailed) {
  clearInterval(interval);
  setPolling(false);
}

// Refresh après completion
if (data.status === "done") {
  router.refresh(); // Re-render server component
}
```

---

## 📱 Messages Utilisateur

### Français

```
✅ Générés:
- "Décris ta vidéo en quelques phrases..."
- "Génération en cours..."
- "Étape actuelle : {stage}"
- "Actualisation automatique toutes les 8 secondes"
- "Vous pouvez fermer cette page"
- "Temps estimé : 4 à 9 minutes"
- "Rendu final en cours..."
- "Erreur de génération"
- "Vidéo introuvable"
- "Créer une autre vidéo"
- "Copier le lien"
- "Télécharger"
```

### Emojis Utilisés

```
🎬 - Génération / Titre
🎥 - Vidéo
⏳ - En cours
✅ - Succès
❌ - Erreur
📋 - Copier
💾 - Télécharger
✨ - Nouvelle vidéo
💡 - Info
🔄 - Actualisation
```

---

## 🎯 Tests à Effectuer

### Test 1: Génération nouvelle vidéo

1. Ouvrir `/generate`
2. Saisir prompt
3. Vérifier redirection
4. Vérifier polling démarre
5. Vérifier barre de progression
6. Attendre completion
7. Vérifier vidéo s'affiche

### Test 2: Vidéo en cache

1. Saisir même prompt
2. Vérifier redirection rapide
3. Vérifier vidéo immédiate
4. Vérifier aucun polling

### Test 3: Copier lien

1. Sur page vidéo terminée
2. Cliquer "Copier le lien"
3. Vérifier clipboard
4. Vérifier feedback "✅ Copié!"

### Test 4: Télécharger

1. Cliquer "Télécharger"
2. Vérifier download démarre
3. Vérifier fichier MP4

### Test 5: Erreur 404

1. Accéder `/v/fake-uuid`
2. Vérifier message "Vidéo introuvable"
3. Vérifier bouton retour

---

## 🐛 Gestion des Erreurs

### Page /generate

```typescript
try {
  const res = await fetch("/api/generate-video", {...});
  if (!res.ok) throw new Error(...);
  const data = await res.json();
  router.push(`/v/${data.jobId}`);
} catch (err) {
  setError(err.message);
  setLoading(false);
}
```

### Page /v/[id]

```typescript
// Server side
if (error || !job) {
  return <div>❌ Vidéo introuvable</div>;
}

// Client side polling
try {
  const res = await fetch(`/api/generate-video?id=${job.id}`);
  if (res.ok) {
    const data = await res.json();
    setJob(data);
  }
} catch (err) {
  console.error("Polling error:", err);
  // Continue polling (non-bloquant)
}
```

---

## 📊 Métriques UI

### Page /generate

- **Lignes de code:** ~140
- **Components:** 1
- **States:** 3 (prompt, loading, error)
- **API calls:** 1 (POST)
- **Redirections:** 1

### Page /v/[id]

- **Fichiers:** 2 (page.tsx + VideoPlayer.tsx)
- **Lignes de code:** ~230
- **Components:** 2
- **States:** 3 (job, polling, copied)
- **API calls:** N (polling)
- **Intervals:** 1

---

## ✅ Résumé

**Fonctionnalités complètes:**
- ✅ Formulaire de génération
- ✅ Validation du prompt
- ✅ Gestion des états (loading, error)
- ✅ Redirection automatique
- ✅ Player vidéo
- ✅ Polling automatique
- ✅ Barre de progression
- ✅ Copier lien
- ✅ Télécharger vidéo
- ✅ Messages en français
- ✅ Design moderne
- ✅ Mode sombre
- ✅ Responsive
- ✅ Gestion erreurs

**Aucune dépendance supplémentaire nécessaire !**

Tout est construit avec:
- React hooks (useState, useEffect)
- Next.js App Router
- Tailwind CSS (déjà installé)
- Fetch API native

---

**Version:** 1.0.0  
**Date:** 2025-10-04  
**Statut:** ✅ Production Ready  
**Pages:** 2 (generate + v/[id])  
**Components:** 3 (GeneratePage + VideoPage + VideoPlayer)
