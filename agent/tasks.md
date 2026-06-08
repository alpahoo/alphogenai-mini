# agent/tasks.md — Backlog partagé

Format d'une tâche :
- **[ID] Titre** — `status: todo|in_progress|blocked|done` · `owner: claude|codex|chatgpt|—`
  - Objectif :
  - Fichiers probables :
  - Risques :
  - Critères de validation :

> Règles : créer la tâche **avant** de coder (AGENTS.md #1) ; une tâche
> `in_progress` n'a **qu'un seul owner** ; `git pull` avant de prendre une tâche.

---

# Backlog — Roadmap Director Console (6 axes)

## Axe 1 — Polish du create flow  `status: in_progress`

### [T-101] Rangée de contrôles unifiée + références repliées — `status: done` · `owner: claude`
- Livré : Model·Duration·Format·Scenes en une rangée (dropdowns) ; sections
  Reference image + References dans un collapsible fermé par défaut.
- Fichier : `app/(workspace)/create/[mode]/page.tsx`. Validé (tsc/build/lint/tests).

### [T-102] Labels « provider-friendly » + statut compatibilité assets — `status: done` · `owner: claude`
- Livré : helper pur `lib/engine-intentions.ts` (intentions produit + compat) ;
  dropdown Model mène par l'intention (« Realistic character — Seedance 2.0 · HD ·
  Refs ») + caption « Powered by » ; badges de compat sur les vignettes (faces +
  uploads) dans AssetPanel et FacesManager mobile, relatifs au moteur sélectionné.
- Fichiers : `lib/engine-intentions.ts`, `components/create/asset-panel.tsx`,
  `components/create/faces-manager.tsx`, `app/(workspace)/create/[mode]/page.tsx`.
- UI-only : aucune route jobs/providers touchée ; valeur d'engine envoyée à l'API
  inchangée (display-only). tsc · build · lint · 220 tests verts.
- **T-102b (review Codex, confidentialité)** : `status: done` — wording sans
  provider. Badge `BytePlus 2.0 only` → `Seedance 2.0 only` ; `cleanModelName()`
  retire HeyGen/BytePlus/AtlasCloud/EvoLink/Bailian/Kie.ai des labels/captions ;
  faces-manager : `BytePlus Asset ID` → `Verified Face Asset ID`, erreur idem ;
  avertissement create reformulé (sans BytePlus/Atlas). Mentions providers
  restantes = commentaires de code uniquement.

## Axe 2 — AI Director visible  `status: in_progress`

Spec : **`docs/product/ai-director-spec.md`** (UX flow, data par scène, quality
score, contraintes techniques, découpage). Le Director est une couche **avant**
`POST /api/jobs` — la state machine jobs/scenes n'est PAS touchée.

### [T-201a] Spec AI Director — `status: done` · `owner: claude`
- `docs/product/ai-director-spec.md` rédigée (spec-only, providers confidentiels,
  réutilise storyboard/prompt-enhancer/content-policy/byteplus-cost/engine-intentions).

### [T-201b] Director UI (mock/static state) — `status: done` · `owner: claude`
- Livré : `components/create/ai-director-panel.tsx` (mock/static) — quality read-out
  compact (Character/Prompt/Model/Social/Cost/Time), scene cards éditables (title,
  prompt textarea, durée, asset chips, recommended model, risk notes), actions
  Generate now / Improve / More cinematic / More realistic / Shorter for TikTok /
  Keep same character (mutent le mock local, aucun appel API).
- Page : bouton « Plan with AI Director » + état local + `buildDirectorPlan()` ;
  **skip path `Generate Video` préservé** ; providers confidentiels (cleanModelName).
- UI-only ; aucune route/DB/state machine touchée. tsc · build · lint · 226 tests verts.
- Compromis : plan édité = preview-only (R-008) → câblage en T-201c.

### [T-201c] Wire edited plan → generation — `status: done` · `owner: claude`
- Livré (UI-only) : `submitJob({ directorScenes? })` extrait de `handleSubmit` (form
  `Generate Video` = `submitJob()` sans scènes, inchangé). « Generate now » du Director
  → `submitJob({ directorScenes })` qui ajoute `scenes:[{prompt, duration_sec(clamp 3..10),
  ...(selectedEngine!=="auto" && {engine})}]`. **Jamais `engine:"auto"`.**
- Panel : durée min=3/max=10 + clamp [3,10] ; `buildDirectorPlan` initialise les durées
  dans [3,10] ; texte preview-only retiré (les éditions sont réellement envoyées).
- **Aucune modif** `app/api/jobs/route.ts`/DB/migration/state machine/Modal/Stripe/auth.
  Providers confidentiels inchangés. tsc · build · lint · 226 tests verts.
- Voir R-009 (auto + Director → fallback engine backend).
- **Décision** (`docs/product/director-plan-mapping-decision.md`) : **Option B** —
  envoyer les scènes éditées via le tableau `scenes[]` **déjà supporté** par
  `app/api/jobs/route.ts:681-692` (« Phase C: editor-provided scenes »). **Aucune
  modif backend ni state machine.**
- À faire (UI-only) : sur « Generate now » du Director, POST `scenes:[{prompt,
  duration_sec(3..10),engine:<key>}]` (ordre) + champs existants ; clamp durée
  UI à [3,10] ; garder `prompt` original + references/byteplus_asset_ids.
- (La route `/api/director/plan` de la spec n'est PAS nécessaire pour B — le plan
  est construit côté client via `buildDirectorPlan`. À garder seulement si on veut
  un plan serveur enrichi plus tard.)

### [T-202] Quality score + cost/time estimate — `status: done` · `owner: claude`
- Livré : helper pur `lib/director-quality.ts` (`computeDirectorQuality`) — types
  `QualityReadout`/`QualityTone` déplacés ici (panel les ré-exporte). Branché sur les
  vrais helpers : prompt risk ← `screenPrompt` ; cost ← `estimateBytePlusCost` +
  `SEEDANCE_USD_PER_MTOKEN` (somme des durées éditées) ; model compat ← `faceCompat`/
  `uploadCompat` ; social fit ← aspect + durée totale ; character + time.
- Page : `directorQuality` devient **dérivé (`useMemo`)** → recalcul à chaque édition de
  scène ; `buildDirectorPlan` ne renvoie plus que les scènes ; `engineCompat` wrappé
  en `useMemo` (lint clean).
- Test : `lib/__tests__/director-quality.test.ts` (prompt risk, cost Seedance/deferred,
  social fit, character, model compat, **anti provider-leak**). 234 tests au total.
- UI-only ; aucune route/API/DB/state machine. R-009 non traité (hors scope).
  tsc · build · lint · 234 tests verts.

## Axe 3 — Scene Board runtime  `status: in_progress`

Spec : **`docs/product/scene-board-runtime-spec.md`**. Le board lit les données
existantes (`job_scenes` déjà live sur la page job) + endpoints existants ; **pas
de migration ni de modif state machine**.

### [T-301a] Spec Scene Board — `status: done` · `owner: claude`
- Spec rédigée : périmètre V1 (read-only + statuts live ; retry failed via
  `retry-scenes` ; modèle provider-clean ; pas d'édition runtime V1), composants à
  créer, endpoints dispo (retry-scenes / PATCH prompt / POST regen single-scene),
  risques (R-010), tests, découpage T-301a/b/c (+ V2 d).

### [T-301b] Reutiliser SceneTimeline/ScenePanel (pas de doublon) — `status: done` · `owner: codex`
- Livre UI-only : pas de nouveau `scene-board.tsx`. `SceneTimeline` reste le board
  read-only existant ; il utilise desormais `sceneStatusMeta()` pour les labels.
- `ScenePanel` : libelle `Engine` -> `Model` +
  `cleanModelName(getEngineDisplayName(jobEngine ?? scene.engine))` ; `jobEngine`
  est passe aux panneaux mobile + desktop.
- `Regenerate` est gate via `supportsSingleSceneRegen()` (EvoLink/Bailian only,
  R-010) ; les autres modeles voient un texte discret au lieu d'un bouton qui echoue.
- Nouveau helper pur `lib/scene-status.ts` + test `lib/__tests__/scene-status.test.ts`
  (statuts provider-neutres + gating regen). 240 tests au total.
### [T-301c] Retry affordances — `status: todo` · `owner: claude`
- Retry job-level (`retry-scenes`, job failed) déjà présent sur la page ; regen
  single-scene via `ScenePanel` **gaté** (R-010). Pas de modif route.

### [T-301d] (V2) Édition prompt par scène via `PATCH` — `status: blocked` · `owner: claude`
- Déféré V2 (l'endpoint `PATCH /scenes/[i]` existe déjà).

## Axe 4 — Saved Looks  `status: todo`

### [T-401] Looks réutilisables — `status: todo` · `owner: chatgpt(spec)→claude(impl)`
- Objectif : « Create a look once, reuse it forever » — sauvegarder un rendu comme
  Look, le réutiliser (nouveau script, lipsync voix clonée, déclinaisons social).
- Briques : `cinematic_looks`/HeyGen look reuse, lipsync/voiceover existants.
- Note : nouvelle table probable → migration additive (R-003 process).

## Axe 5 — Post-generation studio  `status: in_progress`

Spec : **`docs/product/post-generation-studio-spec.md`**. Audit Codex : le studio
post-generation existe deja en grande partie (`SocialExportPanel`, `ThumbnailPicker`,
routes export/social/schedule/looks). **Ne pas creer de doublon** ; consolider et
polir l'existant.

### [T-501a] Spec/audit Post-generation Studio — `status: done` · `owner: codex`
- Livre docs-only : audit des actions job existantes, routes social/thumbnail/metadata/
  schedule/looks/duplicate, limites connues, decoupage T-501b/c/d/e.
- Decision : T-501 est surtout une consolidation UX. `SocialExportPanel` gere deja
  exports TikTok/Reels/Instagram/YouTube, thumbnail, AI copy, publish et schedule.

### [T-501b] Job action bar premium — `status: done` · `owner: codex`
- Livre UI-only : action bar du job termine regroupee dans un rail premium et stable.
  Actions conservees : Download, Share, Copy link, Copy prompt, Duplicate job,
  Save as Look si supporte.
- Fichier : `app/jobs/[id]/page.tsx`. Handlers/routes inchanges ; aucune route/API/DB.
- Decision : libelle prudent `Duplicate job` (pas `Create variation`) tant que la route
  duplique et relance directement sans editeur de variation complet (voir R-012).

### [T-501c] Social Pack consolidation - `status: done` - `owner: codex`
- Livre UI-only : header du `SocialExportPanel` transforme en module studio avec
  resume compact : Formats, Thumbnail, Copy, Channels.
- Routes/state conserves : export-social, thumbnail, generate-metadata, publish,
  scheduled-posts. Gates plan/social connections inchanges ; aucun provider visible.
- Fichier : `components/job/social-export-panel.tsx`. Validation : 240 tests,
  tsc, lint, build OK.

### [T-501d] Use as reference decision - `status: done` - `owner: codex`
- Livre docs-only : `docs/product/use-as-reference-decision.md`.
- Decision : V1 = **Use as image reference**, pas full video reference. Utiliser une
  image stable du job (thumbnail/last_frame/image_url) comme reference `outfit_style`
  dans le create flow. Ne jamais auto-classer en `character_face`.
- Raison : le pipeline structure actuel repose sur `ReferenceItem.storage_path` dans
  le bucket prive `references`, image-only aujourd'hui ; video/audio refs restent
  partiellement coming soon.

### [T-501d1] Backend reference-image route - `status: done` - `owner: codex`
- Livre : `POST /api/jobs/[id]/reference-image` choisit la meilleure still image
  (thumbnail, last_frame, image_url, R2 frame candidate), la telecharge, valide le
  MIME reel (JPG/PNG/WEBP), la copie dans le bucket prive `references`, puis retourne
  un `ReferenceItem` role `outfit_style` avec `storage_path` canonique.
- Helper pur : `lib/job-reference-image.ts` + tests `lib/__tests__/job-reference-image.test.ts`.
- Validation : 244 tests, tsc clean. Route backend, aucune migration.

### [T-501d2] Create prefill from reference job - `status: todo` - `owner: codex|claude`
- Objectif : `/create/story?reference_job_id=<id>` appelle la route T-501d1,
  ajoute la reference au state et optionnellement un chip `@image`.

### [T-501d3] Job page Use as reference action - `status: todo` - `owner: codex|claude`
- Objectif : ajouter le bouton `Use as reference` sur un job termine, sans generation
  directe et sans provider names.
### [T-501e] Duplicate fidelity audit — `status: todo` · `owner: codex|claude`
- Objectif : verifier puis ameliorer `POST /api/jobs/[id]/duplicate` pour vraiment
  dupliquer les assets/options (aspect ratio, audio/caption modes, verified faces,
  scenes/Director plan). Backend + tests, pas UI-only.
## Axe 6 — Nettoyage docs / lint / tests  `status: in_progress`

### [T-601] Refresh README.md + CLAUDE.md + HANDOVER status — `status: done` · `owner: claude`
- `CLAUDE.md` : addendum daté 2026-06-08 (pipeline multi-provider, Director Console,
  composer/assets/verified faces, confidentialité providers T-102/T-605 + guard test).
  Corps historique conservé ; bandeau « HANDOVER.md gagne ».
- `README.md` : remplacé par une version **courte, actuelle**, renvoyant vers
  `HANDOVER.md` (stack réelle, commandes, coordonnées, checks). Plus de mentions
  Runpod/SVI/AudioLDM2/LangGraph comme stack actuelle.
- `HANDOVER.md` : « Known gaps » mis à jour (README/CLAUDE/lint ✅ ; reste tests
  d'intégration), compteur tests → **226**, snapshot lint ajouté.
- Docs-only ; tsc · build · lint · 226 tests verts. R-001 résolu.

### [T-602] Tests d'intégration API + guards — `status: in_progress` · `owner: codex|claude`
- **Fait** : guard anti-leak provider `lib/__tests__/provider-leak-guard.test.ts`
  (ENGINE_DISPLAY_NAMES + getEngineDisplayName + cleanModelName ; 6 cas). Verrouille
  T-102/T-605. 226 tests au total.
- **Reste** : tests d'intégration `POST /api/jobs` (routing/plan gate/content policy),
  `byteplus-assets` (CRUD/RLS), `upload`. Mock Supabase ; pas de vrais providers. (R-005.)

### [T-603] Lint 100 % clean — `status: done` · `owner: claude`
- `next lint` → no warnings/errors. (Fait.)

### [T-604] Retirer `typescript.ignoreBuildErrors` — `status: blocked` · `owner: claude`
- `tsc` est clean ; mais fichier config critique → validation requise. (R-004.)

### [T-605b] Cleanup provider names on the job page — `status: done` · `owner: claude`
- Suite à la review visuelle (job réel). Page `app/jobs/[id]/page.tsx` + `JobCostBadge` :
  « Provider Credits » → « Generation Credits » ; « EvoLink balance » → « Credit balance » ;
  « Top up on EvoLink »/« Top up {label} » → « Top up credits » ; `JobCostBadge` affiche
  désormais `cleanModelName(getEngineDisplayName(engine))` (« Seedance 2.0 (Direct) ») au
  lieu de la clé brute `seedance2_byteplus`.
- Gating confirmé par code : ces blocs sont **admin-only** (`isAdmin`/`adminCredits`/
  `SHOW_COST_TRACKING_UI`) — nettoyés quand même (polish + future-proof). Les seules
  occurrences restantes sont des **URLs** de dashboard (hrefs admin) + un champ `label`
  non rendu dans `PROVIDER_TOP_UP`. Aucun nom provider en texte visible.
- UI-only ; aucune route/API/DB/state machine. tsc · build · lint · 226 tests verts.

### [T-605] Cleanup provider names in public create flow — `status: done` · `owner: claude`
- Livré (UI-only, aucune route/DB/Stripe/Modal touchée) :
  - Avatar picker badge `HeyGen credits · ~60× cheaper` → `Avatar mode · lower cost`.
  - `friendlyError` (page job, **public**) reformulé sans « BytePlus / Kling O3 / Atlas »
    → « Seedance 2.0 … or switch to a model that accepts uploaded face photos ».
  - `lib/types.ts ENGINE_DISPLAY_NAMES` : retrait des suffixes providers
    `(Kie.ai)` / `(Bailian)` / `(HeyGen)` / `(Atlas)` → noms modèles publics propres
    (corrige aussi `/gallery` et la page job qui utilisent `getEngineDisplayName`).
    `(Direct)` / `(Seedance 2)` conservés (termes produit).
  - faces-manager : lien « Where's my Asset ID? » → « Need help finding your verified
    face ID? » (href console provider conservé — voir R-006).
- Hors périmètre (admin-only, conforme à la consigne) : panneau coût/crédits create
  (`isAdminEmail`), « EvoLink balance »/« Top up » + `JobCostBadge` (`isAdmin`).
- Validé : tsc · build · lint · 220 tests verts.

## Terminé (résumé — détails dans agent/log.md)

- [DONE] Composer TipTap (chips + `@` autocomplete) + démo.
- [DONE] FacesManager self-service (vignettes photo, CRUD) + colonne `thumb_path`.
- [DONE] AssetPanel (panneau droit, onglets My Faces / Uploads, recherche).
- [DONE] Upload image → chip `@image` + câblage backend (references_payload).
- [DONE] Model selector → dropdown compact ; Duration/Format/Scenes compacts.
- [DONE] Fix build local `/gallery` sans secrets ; `HANDOVER.md` ; bandeau README.
- [DONE] Lint 100 % clean (CTO list).


