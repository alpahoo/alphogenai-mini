# Premium UI Spec — Research / Explainer / Render Studio

**Ticket:** T-1120a · **Status:** docs-only (spec / for review) · **Owner:** claude
**Scope:** documentation only. **No runtime, no route, no component, no migration, no refactor.** First draft of a validated UX vision to align Paul + Claude Code + Codex **before any implementation**.

> Fidèle au mockup validé avec Codex : **4 zones claires**, expérience premium type Runway / Topview **adaptée à AlphoGenAI** (pas une copie). Review demandée à Paul avant toute implémentation UI.

---

## 1. Context & intent

AlphoGen possède déjà tout le moteur (Research → storyboard → génératif/explainer → overlays/voix → Library) mais l'UX est **fragmentée et sans contrôle** : Research Studio est surtout un formulaire, le plan se valide à peine, l'explainer est un bouton « boîte noire » (cf. `docs/product/explainer-pipeline-technical-report.md`), et la post-prod est invisible.

Objectif de la refonte : un **parcours premium unifié en 4 écrans**, où l'utilisateur **comprend, contrôle et prévisualise** à chaque étape, de l'idée à la vidéo publiable.

## 2. Design principles

1. **Clarté > marketing.** Chaque écran répond à « où suis-je, quoi faire ensuite ». Aides contextuelles courtes (tooltips), pas de pavés.
2. **Premium, pas chargé.** Densité maîtrisée, hiérarchie visuelle forte, prévisualisation au centre.
3. **Contrôle utilisateur.** Toujours une étape de revue/édition avant production. Rien d'irréversible sans confirmation.
4. **Consentement média.** Les médias tiers restent **suggestions-only** tant qu'ils ne sont pas confirmés ; **aucune injection automatique**.
5. **Texte à l'écran déterministe.** Les textes/captions/titres passent par des **overlays déterministes**, pas confiés au modèle vidéo.
6. **Branding explicite.** Logo **AlphoGen par défaut**, logo utilisateur plus tard (Brand Kit), **jamais de logo tiers sans confirmation**.
7. **Honnêteté technique.** Pas de promesse « exact try-on » / « exact lip-sync » sans contrat technique.

## 3. Information architecture & navigation

```
Research Home  →  Plan Review  →  Explainer Studio  →  Render / Post-production  →  Final Job / Social Pack
  (découvrir)      (valider)        (produire)            (finaliser)                  (publier)
```

- Barre d'étapes persistante (wizard) en bas ou en haut, reflétant l'avancement : `Source · Recherche · Script · Storyboard · Assets · Render · Publish`.
- Navigation **non-linéaire autorisée** : revenir à Plan Review depuis le Studio, etc. L'état est sauvegardé (autosave visible : « Dernière sauvegarde il y a 2 min »).
- Deux voies de production depuis Plan Review : **Explainer** (slides+voix, code) ou **Generative** (« Send to Director », inchangé). La spec se concentre sur la voie Explainer + la post-prod commune.

---

## 4. Écran 1 — Research Home (command center)

**But :** transformer le formulaire actuel en **centre de commande** : l'utilisateur arrive et sait immédiatement quoi lancer.

### Sections attendues
1. **Brief** — zone « Décris la vidéo que tu veux » (audience, structure) + mode (News/Tutorial/Product/Competitor) + durée cible + URL optionnelle. Tooltip court par champ.
2. **Source discovery** — état/déclenchement de la découverte de sources (SearXNG), avec compteur « N sources trouvées ».
3. **Watchlists** — pages surveillées (changedetection) ; un changement crée un **brouillon** Research (jamais de génération auto).
4. **Recent research** — liste des plans récents avec badge de statut (`draft / ready_for_angles / scripting / approved / sent_to_director / explainer_done`) + action « Open plan ».
5. **Templates / workflows** — points de départ : « URL produit → promo », « News → explainer 30s », « Docs → tutoriel »… (raccourcis qui pré-remplissent le brief + mode).

### Wireframe
```
┌─ RESEARCH STUDIO ─────────────────────────────┬─ NEW RESEARCH BRIEF ──────────┐
│ Turn a topic, URL or product into a video plan │ Brief: [____________________]  │
│ [Sources] [Angles] [Storyboard]   (stepper)    │ Mode ▾ News   Duration ▾ 30s  │
│                                                │ Optional URL [____________]   │
│                                                │ ⓘ tooltip court               │
│                                                │ [ + Start research ]          │
├─ TEMPLATES / WORKFLOWS ────────────────────────┴───────────────────────────────┤
│ [URL→Promo] [News→Explainer] [Docs→Tutorial] [Competitor→Compare]              │
├─ WATCHLISTS ───────────────────────────┬─ RECENT RESEARCH ──────────────────────┤
│ ai-search · active · changed Jun 11     │ ● Approved  NEWS  "Explain ..."  →open │
│ [+ Create watchlist]                    │ ● Angles    TUTO  "Créer un ..."  →open │
└────────────────────────────────────────┴────────────────────────────────────────┘
```

### Règles
- Ne pas surcharger de texte marketing ; aides = tooltips `ⓘ` courts.
- L'écran doit être lisible « au premier coup d'œil » : le CTA primaire (Start research) et « Recent research » dominent.

---

## 5. Écran 2 — Plan Review (validation avant production)

**But :** l'utilisateur **valide / modifie / rejette** le plan avant d'envoyer en production. Garde-fou anti-« vidéo générique ».

### À afficher
- **Sources** (extraites) avec statut, possibilité d'inclure/exclure.
- **Références média suggérées** — vignettes (og/screenshot/logo) **suggestions-only** ; sélection explicite requise (consentement), copie privée au moment du choix. Badge « Third-party — verify rights ».
- **Angles** éditoriaux (choisir l'angle).
- **Script** (éditable) + **Storyboard** (scènes : titre, durée, ligne de voix, intention visuelle).
- **Readiness** — checklist (sources ✓, angle ✓, script ✓, storyboard ✓, approuvé ✓).
- Actions : **Approve**, **Edit**, **Reject/Regenerate**, puis **→ Explainer Studio** ou **→ Send to Director**.

### Wireframe
```
┌─ PLAN: "Explain functionalities" ─────────────────────────┬─ READINESS ─────────┐
│ Sources (10)   [Find sources] [Extract]                   │ ✓ Sources           │
│  ☑ Hostinger – web apps vs websites                       │ ✓ Angle selected    │
│  ☑ What is a website? ...                                 │ ✓ Script            │
├─ SUGGESTED MEDIA (suggestions-only) ──────────────────────┤ ✓ Storyboard        │
│  [img][img][img]  "Use as reference" (consent)            │ ☐ Approved          │
├─ ANGLES ──────────────────────────────────────────────────┼─ NEXT ──────────────┤
│  ◉ The Interplay Between Websites and Web Apps            │ [ Approve ]         │
│  ○ Beyond Brochures ...                                   │ [ Edit ] [ Reject ] │
├─ SCRIPT + STORYBOARD (editable) ──────────────────────────┤ → Explainer Studio  │
│  1. Hook   2. Website  3. Web App  4. Use cases ...       │ → Send to Director  │
└───────────────────────────────────────────────────────────┴─────────────────────┘
```

### Règles
- **Aucune injection automatique** de média/référence sans consentement explicite.
- Rejeter = régénérer angle/script sans produire de vidéo.

---

## 6. Écran 3 — Explainer Studio (production premium)

**But :** l'écran « atelier » fidèle au mockup validé — **storyboard éditable + preview live + contrôle cinématique**, pour éviter les prompts plats/génériques.

### Disposition (3 colonnes)
- **Gauche — Source du contenu + Storyboard** : URL source, sources trouvées, résumé IA, puis la liste des **scènes éditables** (vignette, rôle, durée).
- **Centre — Preview** : canvas 16:9/9:16 avec lecture (0:02 / 1:04), bande de scènes (durées), play/pause, format & résolution.
- **Droite — Inspecteur** : onglets **SCÈNE / ÉLÉMENTS / ANIMATION** : titre, sous-titre, image/vidéo, logo ; **caméra (cadrage, mouvement), lumière, mood, rythme, intention visuelle** ; entrée/sortie/timing (Fade/Slide, easing).

### Bas de l'écran
- **Assets de la scène** : onglets Images / Vidéos / Icônes / Graphiques / Lottie + **Import**.
- **Audio** : voix-off (clip + durée + **sélecteur de voix** avec preview) **+ musique de fond** + volume/mix.
- **Génération** : Moteur (HyperFrames / génératif), Résolution, Qualité, [ Rendre la vidéo ].

### Wireframe
```
┌ SOURCE + STORYBOARD ┬─ PREVIEW (16:9 ▾ 1080p ▾) ───────────┬ INSPECTOR ───────────┐
│ url: wise.com       │   ┌───────────────────────────┐      │ [SCÈNE][ÉLÉM][ANIM]  │
│ Sources (12)        │   │  SENDING MONEY ABROAD?     │      │ Titre [__________]   │
│ Résumé IA           │   │  Do it for less with Wise  │      │ Sous-titre [______]  │
│                     │   └───────────────────────────┘      │ Image/vidéo [..mp4]  │
│ ▸ 1 Hero      8s    │   ▷ 0:02 / 1:04   [▮▮▯▯▯▯]            │ Logo [wise-logo.png] │
│   2 Problem   8s    │   [1][2][3][4][5][6]  (durées)        │ Caméra: push-in      │
│   3 Solution 12s    │                                       │ Lumière: studio key  │
│   4 Benefits 16s    │                                       │ Entrée: Fade / Sortie│
│   5 Proof    12s    │                                       │  Slide · Ease In Out │
│   6 CTA       8s    │                                       │ [Dupliquer][Suppr.]  │
├─ ASSETS DE LA SCÈNE ┴───────────────────────┬─ AUDIO ───────┴──────────────────────┤
│ [Images][Vidéos][Icônes][Graph.][Lottie] +  │ Voix-off ▷ voiceover (voice ▾ preview)│
│ [card][globe][transfer][flags][chart] +Imp. │ Musique de fond ▷ ───●── 30%          │
├─────────────────────────────────────────────┴─ GÉNÉRATION ──────────────────────────┤
│  Moteur ▾ HyperFrames   Résolution ▾ 1080p   Qualité ▾ Haute   [ ▶ Rendre la vidéo ] │
└──────────────────────────────────────────────────────────────────────────────────────┘
   Source · Recherche · Script · ●Storyboard · Assets · Render · Publish   (stepper)
```

### Séparation claire des « moteurs » (exigence)
Le Studio doit distinguer visuellement et fonctionnellement :
- **Vidéo générative** (Seedance/Wan/LTX) — clip par scène, payant.
- **Voix-off** (TTS : Kokoro gratuit / ElevenLabs premium) — piste audio, sélectionnable, **avec preview**.
- **Lip-sync** (HeyGen avatar) — personnage qui parle ; **distinct** de la voix-off ; pas de promesse « exact lip-sync » sans contrat.
- **Références média** (images sélectionnées en Plan Review) — assets, jamais injectés sans consentement.
- **Overlays / post-production** — textes déterministes, branding (écran 4).

### Détails cinématiques (anti-prompt-générique)
Chaque scène porte explicitement : **camera_shot, camera_motion, lighting, mood, rythme, intention visuelle** (déjà modélisés dans `lib/research/cinematic-planner.ts` → `CinematicScenePlan`). Le Studio les **expose et rend éditables** au lieu de les noyer dans un prompt plat.

---

## 7. Écran 4 — Render / Post-production

**But :** rendre la vidéo **professionnelle** et montrer clairement **brut vs finalisé**.

### À inclure
- **Voice-over mux** (incruster la voix), **captions** (sous-titres déterministes), **source cards**, **lower-thirds**, **logo / watermark**, **branding**.
- **Social exports** (9:16 / 1:1 / 16:9) → Social Pack.
- Comparaison **Raw vs Final** (avant/après overlays + voix + branding).

### Wireframe
```
┌─ RENDER / POST-PRODUCTION ─────────────────────────────────────────────────┐
│  RAW                          │  FINAL (overlays + voice + branding)         │
│  [▷ raw video]                │  [▷ finalized video]                         │
├────────────────────────────────────────────────────────────────────────────┤
│ Overlays:  ☑ Captions  ☑ Lower-third (angle)  ☑ Source cards               │
│ Branding:  Logo ◉ AlphoGen (default)  ○ My logo (Brand Kit)  ☐ none         │
│            Watermark ▾  Position ▾  Opacity ──●──                           │
│ Audio:     ☑ Voice-over mux   Music ──●── 30%                               │
│ Exports:   [16:9] [9:16] [1:1]  → Social Pack                               │
│                                              [ Finalize & Publish ]          │
└────────────────────────────────────────────────────────────────────────────┘
```

### Règles
- **Textes à l'écran déterministes** via overlays (`lib/overlay/overlay-plan.ts`), pas via le modèle vidéo.
- **Branding** : AlphoGen par défaut ; logo utilisateur via Brand Kit (futur) ; **jamais de logo tiers sans confirmation explicite**.
- La sortie alimente le **Job final + Social Pack** existants.

---

## 8. Ce qui existe déjà aujourd'hui

| Capacité | Où |
|---|---|
| Research Studio (brief, discover, extract) | `app/(workspace)/research/`, `app/api/research/jobs/[id]/{discover,extract,analyze,script,approve}` |
| Angles / script / storyboard | `lib/research/{script,cinematic-planner}.ts`, `research_*` tables |
| Send to Director (génératif) | `research/[id]/page.tsx` → `/create/story?research_handoff=1` |
| Source media suggestions (consent) | `lib/research/source-media.ts`, `research_source_media`, bloc « Suggested references » |
| Explainer (slides+voix) | `app/api/research/jobs/[id]/explainer/route.ts`, `modal_app/video_pipeline.py` (`render_explainer`), `infra/explainer-renderer/` |
| Overlays / post-prod | `lib/overlay/overlay-plan.ts`, `apply_overlays` |
| Voice-over mux | `lib/voiceover/`, `apply_research_voiceover` |
| Lip-sync (avatar) | `lib/heygen-client.ts` |
| Job page / Library / Social Pack | `app/jobs/`, `app/(workspace)/library/`, export social |

## 9. Ce qui manque encore

- **UX premium unifiée** (les 4 écraans de cette spec).
- **Vraie séparation des étapes** (Home → Review → Studio → Render) avec stepper + autosave.
- **Media picker plus propre** (réutiliser `research_source_media` comme assets par scène, recadrage, choix).
- **Voice / lip-sync routing plus clair** (sélecteur de voix + preview ; distinction nette voix-off vs lip-sync).
- **Post-production visible** (écran 4 ; aujourd'hui overlay/voix existent mais peu exposés).
- **Template hub** côté Research Home.
- **Preview live** dans l'Explainer Studio.

## 10. Non-goals (cette spec)

- Pas de redesign complet immédiat.
- Pas de migration dans cette spec.
- Pas de refactor backend.
- Pas de n8n.
- Pas de promesse « exact try-on » ni « exact lip-sync » sans contrat technique.

## 11. Découpage proposé

| Ticket | Portée |
|---|---|
| **T-1120a** | Spec UX premium (ce fichier) — docs-only |
| **T-1120b** | Research Home polish (command center + templates + tooltips) |
| **T-1120c** | Plan Review layout (validation, media suggestions-only) |
| **T-1120d** | Explainer Studio layout (storyboard éditable, inspecteur cinématique, preview) |
| **T-1120e** | Render / Post-production panel (overlays, branding, captions, exports, raw vs final) |
| **T-1120f** | Visual QA desktop / mobile |

Ordre conseillé : **b → c → e** (gains rapides : Home, Review, post-prod) puis **d** (Studio, plus lourd), puis **f**.

## 12. Open questions (pour Paul / Codex)

- Le Studio édite-t-il un **state persistant** (nouvelle table storyboard) ou continue-t-il à dériver de `research_storyboards` ? (impacte T-1120d)
- Preview live : **HyperFrames preview** vs **Remotion `<Player>`** ?
- Brand Kit (logo + palette) : périmètre V1 ?
- Voix premium (ElevenLabs) : activé V1 ou Kokoro-only d'abord ?

> **Review requise auprès de Paul avant toute implémentation UI.** Cette spec est un premier jet d'alignement ; aucun code runtime n'est touché.

---

## 13. Addendum — Implementation guardrails (retours produit/tech consolidés)

> Ajout **docs-only** avant toute implémentation T-1120. Intègre les retours consolidés. Aucun runtime/route/composant/migration ; ne modifie pas le pipeline.

### 13.1 Preview live = risque majeur → 2 niveaux explicites
La preview est le point le plus risqué (latence, coût, complexité). On distingue **explicitement** :
- **V1 — Low-fi browser preview** : aperçu **statique/léger** rendu **dans le navigateur** (HTML/CSS/GSAP du template à frame courante, ou vignette par scène), **sans appeler le moteur de rendu**. Sert à valider mise en page, textes, ordre des scènes, timing approximatif.
- **V2 — High-fi HyperFrames preview** : aperçu fidèle via le vrai moteur (HyperFrames `preview` / clip court), **explicitement déclenché** par l'utilisateur.
- **Règle dure : aucun rendu coûteux automatique.** Le rendu complet (Modal/VPS) n'est lancé **que** sur action explicite « Rendre la vidéo ». La preview ne consomme jamais de GPU/Modal sans clic.

### 13.2 Storyboard édité ≠ storyboard Research
- **Ne jamais écraser `research_storyboards`** (source de vérité du plan validé).
- À l'entrée dans l'Explainer Studio, **créer une copie éditable séparée** (« working storyboard » / draft d'édition), distincte de `research_storyboards.scenes_json`.
- Le plan Research reste réutilisable (re-générer un explainer, ou « Send to Director ») même après édition dans le Studio.
- *(Choix de stockage = décision d'implémentation T-1120d ; cette spec impose seulement la séparation.)*

### 13.3 Brand Kit minimal dès V1
- **V1 (minimal)** : `logo_url`, `brand_name`, `couleur principale`. Injectés dans le branding (remplace la dérivation actuelle nom-de-domaine + palette par défaut).
- **V2 (complet)** : palette secondaire, typographies, watermark presets, plusieurs marques, etc.
- Rappel : **logo AlphoGen par défaut** tant qu'aucun logo utilisateur ; **jamais de logo tiers sans confirmation**.

### 13.4 Voice-over vs Lip-sync — séparation UX + coût/routing explicites
Deux capacités **distinctes**, présentées séparément (jamais confondues) :
- **Voice-off (TTS)** : piste audio ajoutée à la vidéo. Providers : **Kokoro** (local, ~0 €) / **ElevenLabs** (premium, payant). Sélecteur + preview. Routing : pipeline explainer/overlay (mux).
- **Lip-sync (avatar)** : un personnage **parle** (HeyGen). Capacité et **coût** différents, parcours différent. **Pas de promesse « exact lip-sync » sans contrat technique.**
- L'UI doit afficher pour chaque option : **coût indicatif** + **ce que ça produit** (audio seul vs personnage parlant).

### 13.5 Captions déterministes — V1 vs V2
- **V1** : captions générées **depuis le `script` / `voiceover_text`** avec **timing par scène** (déterministe, via overlays — `lib/overlay/overlay-plan.ts`). Pas de dépendance au modèle vidéo.
- **V2** : **STT word-level** (alignement mot-à-mot sur l'audio TTS) + **édition fine** des captions.

### 13.6 Explainer Studio — Simple par défaut, Advanced replié
- **Mode Simple (défaut)** : texte à l'écran, voix, durée, image/asset par scène. Suffit à 80 % des cas.
- **Mode Advanced (replié)** : `camera_shot`, `camera_motion`, `lighting`, `mood`, `motion/rythme`, intention visuelle (les détails cinématiques de `CinematicScenePlan`). Accessible mais non imposé → évite de noyer l'utilisateur.

### 13.7 Mobile — desktop-first
- L'**Explainer Studio est desktop-first** (édition dense, inspecteur, preview).
- **Mobile = consultation / validation / déclenchement de rendu** (Research Home, Plan Review, état d'un job, lecture du résultat). Pas d'édition fine au doigt en V1.

### 13.8 Spike preview avant T-1120d
Avant de construire l'Explainer Studio, **valider techniquement la preview** (c'est le risque #1).

### 13.9 Découpage révisé (remplace §11 pour la priorité)

| Ticket | Portée | Notes |
|---|---|---|
| **T-1120b** | Research Home polish | gain rapide |
| **T-1120c** | Plan Review layout | gain rapide |
| **T-1120e** | Render / Post-production panel | gain rapide ; captions V1 déterministes |
| **T-1120-preview-spike** | **Spike** : valider preview **low-fi (browser)** vs **high-fi (HyperFrames)**, mesurer **latence + coût**, confirmer « aucun rendu coûteux auto » | **préalable bloquant** à T-1120d |
| **T-1120d** | Explainer Studio layout | dépend du spike ; working storyboard séparé ; Simple/Advanced |
| **T-1120f** | Visual QA desktop / mobile | desktop-first, mobile = consultation |

**Ordre recommandé :** `T-1120b → T-1120c → T-1120e → T-1120-preview-spike → T-1120d → T-1120f`.

> Tous ces points sont des **garde-fous d'implémentation** ; ils ne changent pas le pipeline et restent à valider par Paul avant tout code.
