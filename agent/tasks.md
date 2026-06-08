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

## Axe 2 — AI Director visible  `status: todo`

### [T-201] Storyboard éditable avant génération — `status: todo` · `owner: chatgpt(spec)→claude(impl)`
- Objectif : étape visible/éditable (scène, caméra, personnage, style, modèle
  recommandé, risque) + boutons « Generate now / Improve / More cinematic /
  More realistic / Shorter for TikTok / Keep same character ».
- Briques : `lib/storyboard.ts`, `lib/prompt-enhancer.ts`, `references_payload`.
- Risques : ne pas dupliquer la logique de génération ; rester additif.

### [T-202] Quality score + cost/time estimate — `status: todo` · `owner: claude`
- Objectif : diagnostic pré-génération (character consistency, prompt clarity,
  provider compat, social fit, cost, durée estimée).
- Briques : `lib/byteplus-cost.ts`, `lib/content-policy.ts`.

## Axe 3 — Scene Board éditable  `status: todo`

### [T-301] Scene Board horizontal — `status: todo` · `owner: chatgpt(spec)→claude(impl)`
- Objectif : bandeau de scènes (miniature, prompt éditable, chips assets, durée,
  modèle, statut queued/generating/done/failed, actions retry/duplicate/replace/
  extend/upscale).
- Briques : `job_scenes`, retry scenes, last-frame chaining (NE PAS toucher la
  state machine sans review — `future-proof-notes` §2.1).

## Axe 4 — Saved Looks  `status: todo`

### [T-401] Looks réutilisables — `status: todo` · `owner: chatgpt(spec)→claude(impl)`
- Objectif : « Create a look once, reuse it forever » — sauvegarder un rendu comme
  Look, le réutiliser (nouveau script, lipsync voix clonée, déclinaisons social).
- Briques : `cinematic_looks`/HeyGen look reuse, lipsync/voiceover existants.
- Note : nouvelle table probable → migration additive (R-003 process).

## Axe 5 — Post-generation studio  `status: todo`

### [T-501] Page résultat premium + actions — `status: todo` · `owner: claude`
- Objectif : `Create variation`, `Retry failed scenes`, `Use as reference`,
  `Save as Look`, `Generate caption pack`, `Schedule post`, `Export TikTok/Reels/
  Shorts`, `Duplicate with same assets` — rendre visibles les routes existantes.
- Fichiers : `app/jobs/[id]/page.tsx`, routes social/export/scheduled.

## Axe 6 — Nettoyage docs / lint / tests  `status: in_progress`

### [T-601] Refresh README.md + CLAUDE.md — `status: in_progress` · `owner: claude`
- **Fait** : `CLAUDE.md` — addendum daté 2026-06-08 en tête (pipeline multi-provider,
  Director Console, composer/assets/verified faces, règle confidentialité providers
  T-102/T-605 + guard test, état validations 226 tests). Corps historique conservé ;
  bandeau « HANDOVER.md gagne ». Mise à jour ciblée (pas de réécriture massive).
- **Reste** : corps README (bandeau déjà en place, corps encore historique). (R-001.)

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
