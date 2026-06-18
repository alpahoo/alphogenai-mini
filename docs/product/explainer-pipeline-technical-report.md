# Generate Explainer — Rapport technique complet

**But du document :** décrire, pour le CTO / Codex, **exactement** comment fonctionne aujourd'hui le bouton « Generate Explainer », ses limites, et le chemin pour passer du flux actuel (boîte noire, 1 clic) à la **vision éditeur Studio** (contrôle total : scènes, voix, assets, preview, rendu).

Statut actuel : **fonctionnel mais non-ergonomique et sans contrôle**. La vidéo est générée automatiquement, sans étape de revue ni d'édition.

---

## 1. Vue d'ensemble

L'explainer est une **2ᵉ voie de rendu** du Research Engine (à côté du génératif « Send to Director »). Il transforme un **storyboard de recherche** en vidéo « slides animées + voix » par **code** (pas d'IA générative vidéo) :

```
Research plan (storyboard approuvé)
   └─[bouton "Generate Explainer"]→ /api/research/jobs/[id]/explainer
        → crée un job (engine_used="explainer")
        → Modal webhook /render-explainer  (fire-and-forget)
             → render_explainer (Modal CPU)
                 1. screenshot du produit (chromium headless)
                 2. voix par scène (Kokoro TTS, local)
                 3. composition HTML (HyperFrames + GSAP)
                 4. rendu MP4 (headless Chrome + ffmpeg)
                 5. upload R2 + update_job(status=done)
        → la vidéo apparaît dans Library
```

**Deux backends de rendu** (même code de rendu) :
- **Modal CPU** — pour l'app (self-service), ~2-5 ¢/vidéo, auto-scale.
- **VPS Hostinger** — pour l'admin/batch, ~0 €, via script (`infra/explainer-renderer/render-from-research.mjs`).

**Aucun GPU, aucune API payante** (HyperFrames + Kokoro sont open-source/locaux). Rendu ≈ 4-5 min pour ~40 s de vidéo (CPU).

---

## 2. Flux de données détaillé (fichier par fichier)

### Étape 0 — Amont (Research Engine, pré-existant)
Produit en base (Supabase) :
- `research_jobs` : `topic`, `input_url`, `mode` (news/tutorial/product/competitor), `language`.
- `research_storyboards.scenes_json` : tableau de scènes. **Deux formats coexistent** :
  - récent (`CinematicScenePlan[]`, cf. `lib/research/cinematic-planner.ts`) : `title, prompt, duration_sec, onscreen_text, voiceover_line, camera_shot, camera_motion, source_citation, …`
  - ancien : `{title, prompt, duration_sec}` seulement (pas de `voiceover_line`).
- `research_scripts.script` : script complet.
- `research_source_media` : images candidates collectées (og/screenshot/logo) — **collectées mais NON utilisées par l'explainer aujourd'hui**.

### Étape 1 — Déclenchement (UI)
**`app/(workspace)/research/[id]/page.tsx`** — fonction `generateExplainer()` :
- `POST /api/research/jobs/[id]/explainer` (auth Bearer).
- Puis **polling** de la table `jobs` toutes les 5 s → affiche « Rendering… » / « Ready — view in Library » / « Render failed ».
- Le bouton est dans la colonne de droite, carte « Explainer video », actif si storyboard approuvé.

### Étape 2 — Route API
**`app/api/research/jobs/[id]/explainer/route.ts`** :
1. Auth + ownership.
2. Charge `research_jobs` + dernier `research_storyboards.scenes_json`.
3. `buildExplainerStoryboard(job, scenesJson)` (cf. `lib/explainer/storyboard.ts`) :
   - **`deriveBrand`** : `name` = domaine de `input_url` ; `product_url` = origin ; **palette par défaut figée** (`primary #10131a`, `accent #6ee7b7`, `font Inter`) ; **`logo_url` vide**.
   - **`mapScenes`** : assigne un template par scène **par heuristique de position** (scène 0 = `hero`, dernière = `cta`, `screen_capture` = `screenshot_zoom`, sinon cycle `bullets/stat/comparison`) ; `voiceover_line || prompt || onscreen_text || title`.
4. Insère un `jobs` row : `engine_used="explainer"`, `status="in_progress"`, `metadata.research_job_id` — **directement**, sans passer par le dispatch génératif.
5. `triggerRenderExplainer(...)` → webhook Modal.

### Étape 3 — Webhook Modal
**`modal_app/video_pipeline.py`** → endpoint `/render-explainer` (asgi) → `render_explainer.spawn(...)`.

### Étape 4 — Rendu (Modal CPU)
**`render_explainer(job_id, storyboard, brand, product_url, voice)`**, image `explainer_image` (Node 22 + chromium + ffmpeg + python + `kokoro-onnx` + modèle Kokoro baked) :
1. **Screenshot** : `chromium --headless --screenshot` de `product_url` → `assets/shot.png` (best-effort).
2. **Voix** : `python3 tts_kokoro.py` → un `.wav` par scène (Kokoro, voix `af_heart` par défaut) + `audio-manifest.json`. Langue déduite du préfixe de la voix.
3. **Composition** : `node build.js` → `index.html` (cf. ci-dessous).
4. **Rendu** : `npx hyperframes render` → MP4 1080p 30 fps (Chrome headless seek frame-par-frame + ffmpeg).
5. `upload_to_r2` → URL publique ; `update_job(status=done, output_url_final, video_url)`.

### Étape 5 — Affichage
**`app/(workspace)/library/page.tsx`** liste les `jobs` `status=done` + `output_url_final` non-null → la vidéo apparaît automatiquement.

### Le générateur de composition
**`infra/explainer-renderer/build.js`** — mappe chaque scène à **6 templates HTML figés** (`hero`, `screenshot_zoom`, `bullets`, `comparison`, `stat`, `cta`), animations **GSAP**, audio embarqué via `<audio data-start data-duration>`. La durée de scène est **étirée pour ne pas couper la voix** (`max(planned, audio_len + 0.7)`). **Le LLM ne touche jamais ce code** : il ne produit que les données du storyboard.

---

## 3. Composants & technologies

| Brique | Techno | Rôle |
|---|---|---|
| Rendu vidéo | **HyperFrames** (HeyGen, Apache 2.0) | HTML/CSS/GSAP → headless Chrome → ffmpeg → MP4 |
| Voix | **Kokoro** (`kokoro-onnx`, CPU) | TTS local, gratuit, sans clé, multi-langue |
| Screenshot | Chromium headless | capture de la page produit |
| Compute (app) | **Modal** CPU | `render_explainer`, auto-scale, ~¢/vidéo |
| Compute (admin) | **VPS Hostinger** | service Docker `/api/render`, ~0 € |
| Stockage vidéo | **R2** (Cloudflare) | sortie publique |
| Données | **Supabase** | research_*, jobs, Library |

---

## 4. Limites actuelles (= les points de friction identifiés)

> Le flux est **« fire-and-forget » sans aucune étape de contrôle**. C'est la cause racine de l'insatisfaction.

1. **Aucune revue / édition** : un seul bouton → vidéo finie. Pas d'aperçu, pas de correction possible avant rendu.
2. **Voix non contrôlable** : voix figée `af_heart` (anglais) côté app ; le français n'est possible que via le script admin. **Pas de sélecteur de voix, pas de preview audio, pas de réglage de vitesse/volume.**
3. **Désynchronisation voix ↔ visuel** :
   - Sur les **anciens storyboards**, il n'y a pas de `voiceover_line` → on narre le `prompt` (qui est une **description visuelle**, pas un texte parlé) → la voix ne colle pas à l'écran.
   - La durée de scène s'étire sur la voix, mais les **animations ne sont pas calées sur les temps forts** de la narration.
4. **Pas de contrôle des captures / miniatures** : une **seule** capture automatique de `product_url`, qui **échoue sur les sites anti-headless** (ex. openai.com → image vide). Les images `research_source_media` déjà collectées **ne sont pas utilisées**. Pas de cadrage/recadrage, pas de choix d'image par scène.
5. **Branding non-pro** : `brand` **dérivé** (nom = domaine, palette par défaut, **pas de logo**). Rendu générique, pas aux couleurs de la marque.
6. **Templates rigides** : 6 layouts figés, assignés par position ; sur données pauvres ils dégradent en « titre seul ». Pas de choix de template par scène.
7. **Pas de musique de fond**, pas de transitions configurables, pas de sous-titres éditables.
8. **Latence** : ~4-5 min, sans barre de progression fine (juste « Rendering… »).

---

## 5. Écart avec la vision « Studio » (la maquette)

La maquette montre un **éditeur vidéo complet** (type Canva Video / Pictory / HeyGen Studio) :

| Élément de la maquette | État actuel | À construire |
|---|---|---|
| Onglets **Research / Script / Scenes / Assets / Voice / Render** | ❌ (1 bouton) | Éditeur multi-onglets |
| **Storyboard éditable** (6 cartes scènes, réordonner, +/− scène) | ❌ (storyboard figé) | State éditable + persistance |
| **Preview live** (canvas central, lecture 0:02/1:04) | ❌ (aucun aperçu) | HyperFrames `preview` ou Remotion `<Player>` |
| Panneau **SCÈNE / ÉLÉMENTS / ANIMATION** (titre, sous-titre, image/vidéo, logo, entrée/sortie/timing) | ❌ | Édition par scène |
| **Assets de la scène** (Images/Vidéos/Icônes/Graphiques/Lottie) + Import | ⚠️ (assets collectés non exposés) | Bibliothèque + upload + drag&drop |
| **Audio** : voix-off + **musique de fond** + volume | ⚠️ (voix figée, pas de musique) | Sélecteur voix (preview), musique, mix |
| **Génération** : moteur / résolution / qualité | ⚠️ (figé 1080p) | Réglages exposés |
| **Wizard bas** : Source → Recherche → Script → Storyboard → Assets → Render → Publish | ⚠️ (étapes existent séparément) | Unifier en 1 parcours |

**En clair :** l'actuel rend une vidéo ; la vision est un **éditeur interactif** où l'utilisateur **contrôle chaque scène, la voix, les assets, et prévisualise** avant de rendre.

---

## 6. Chemin recommandé (du flux actuel → l'éditeur Studio)

La **bonne nouvelle** : le moteur de rendu (HyperFrames + Kokoro + templates) est **réutilisable tel quel**. Le chantier est surtout côté **UI/éditeur + state + preview**, pas le rendu.

**Phase 1 — Revue avant rendu (rapide, gros gain ergonomie)**
- Après « Generate Explainer », **ne pas rendre tout de suite** : afficher un **récap éditable** (scènes : texte à l'écran, ligne de voix, durée, template) + **sélecteur de voix** (Kokoro FR/EN + option ElevenLabs) avec **preview audio**.
- Utiliser les **images `research_source_media` déjà collectées** comme assets sélectionnables par scène (au lieu d'un seul screenshot).
- Bouton « Render » → pipeline existant.

**Phase 2 — Preview live**
- Intégrer **HyperFrames `preview`** (live reload navigateur) ou un **Remotion `<Player>`** pour un aperçu instantané dans le canvas, sans rendre la vidéo complète.
- La composition est générée depuis un **state éditable** (pas en dur).

**Phase 3 — Éditeur complet (la maquette)**
- State storyboard persistant (table dédiée), édition par scène (titre/sous-titre/image/animation/timing), drag&drop assets, musique de fond + mix, réglages de rendu, wizard unifié.
- Choix de template par scène + thèmes de marque (logo + couleurs réels via Brand Kit).

**Corrections transverses (à faire tôt) :**
- **Voix ↔ contenu** : n'utiliser comme narration que le `voiceover_line` (régénérer les vieux storyboards si besoin), jamais le `prompt` visuel. Caler les animations sur la durée de chaque ligne.
- **Screenshots robustes** : gérer les sites anti-headless (attente réseau, bannières cookies, fallback og-image), permettre le recadrage et le choix manuel.
- **Branding réel** : Brand Kit (logo + palette) injecté dans `deriveBrand`.

---

## 7. Fichiers de référence (pour Codex/CTO)

| Rôle | Fichier |
|---|---|
| Mapping storyboard → explainer (brand + scènes) | `lib/explainer/storyboard.ts` (+ tests `__tests__/storyboard.test.ts`) |
| Route déclencheur | `app/api/research/jobs/[id]/explainer/route.ts` |
| Trigger Modal | `lib/modal-client.ts` (`triggerRenderExplainer`) |
| UI bouton + polling | `app/(workspace)/research/[id]/page.tsx` |
| Rendu Modal + webhook | `modal_app/video_pipeline.py` (`explainer_image`, `render_explainer`, `/render-explainer`) |
| Générateur composition + 6 templates | `infra/explainer-renderer/build.js` |
| Voix Kokoro | `infra/explainer-renderer/tts_kokoro.py` |
| Service VPS (admin/batch) | `infra/explainer-renderer/{server.js,Dockerfile,docker-compose.yml,render-from-research.mjs,README.md}` |
| Affichage résultat | `app/(workspace)/library/page.tsx` |

**Coûts / perf :** Modal CPU ~2-5 ¢/vidéo (vs 0,20-1 €+ génératif) ; VPS ~0 € ; rendu ~4-5 min pour ~40 s ; aucun GPU, aucune API TTS payante.

---

## 8. Décision à prendre (CTO / Codex)

Le moteur est validé et économique. La question n'est **pas** « est-ce que ça marche » (oui) mais **« quel niveau d'éditeur on construit »** :
- **A. Revue + voix + assets (Phase 1)** — petit chantier, supprime 80 % de la frustration, garde l'auto-génération comme point de départ.
- **B. Éditeur live (Phases 1+2)** — preview instantané, édition par scène.
- **C. Studio complet (la maquette)** — vrai éditeur Canva-like ; chantier conséquent (UI/state/preview/assets/voix/musique).

Recommandation : viser **A maintenant** (débloque l'usage réel et le contrôle), puis itérer vers **C**.
