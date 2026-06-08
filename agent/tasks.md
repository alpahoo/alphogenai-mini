# agent/tasks.md — Backlog partagé

Format d'une tâche :
- **[ID] Titre** — `status: todo|in_progress|blocked|done`
  - Objectif :
  - Fichiers probables :
  - Risques :
  - Critères de validation :

> Mettre à jour le statut au fil de l'eau. Une tâche « importante » doit être
> créée ici **avant** de coder (protocole AGENTS.md #1).

---

## En cours / prochaines

### [T-001] Director Console — Phase 1 (ex « B »)  — `status: todo`
- Objectif : finir la consolidation du create flow vers la « Director Console »
  du CTO : replier les sections « Reference image » + « References »
  (Character Face / Style / Camera / Mood) et réunir
  **Model · Duration · Format · Scenes · Advanced** sur une rangée compacte.
- Fichiers probables : `app/(workspace)/create/[mode]/page.tsx`,
  potentiellement `components/create/asset-panel.tsx`.
- Risques : page longue et stateful ; ne pas casser le flux refs non-BytePlus
  (Kling/Atlas/Wan uploadent des visages bruts via `references`).
- Validation : `npm test` + `tsc` + `build` verts ; lint clean ; génération test OK.

### [T-002] Labels « provider-friendly » + statut compatibilité assets — `status: todo`
- Objectif : masquer les noms techniques (ex. « Seedance 2.0 r2v ») derrière des
  intentions (« Realistic character », « Fast draft », « Avatar »…) ; afficher un
  statut par asset (`Ready` / `Needs verification` / `Works with BytePlus asset://`
  / `Works with Kling/Atlas` / `Not compatible with this model`).
- Fichiers probables : `components/create/asset-panel.tsx`,
  `components/create/faces-manager.tsx`, `app/(workspace)/create/[mode]/page.tsx`,
  mapping engine→intention dans `lib/`.
- Risques : ne pas casser la sélection d'engine existante (valeurs envoyées à l'API).
- Validation : tests + build ; vérifier que `byteplus_asset_ids` part toujours bien.
- Décision produit ouverte : voir `agent/review.md` R-002.

### [T-003] Refresh `README.md` + `CLAUDE.md` — `status: todo`
- Objectif : aligner la doc sur la stack réelle (multi-provider BytePlus/Atlas/
  EvoLink/HeyGen/Wan + composer multimodal). `HANDOVER.md` reste la source courte.
- Fichiers : `README.md`, `CLAUDE.md`, éventuellement `future-proof-notes.md`
  (ajouter une section « virage 2026-06 » sans réécrire l'historique).
- Risques : faible (doc).
- Validation : relecture ; cohérence avec `HANDOVER.md`.

### [T-004] Tests d'intégration API (jobs / byteplus-assets / upload) — `status: todo`
- Objectif : couvrir `POST /api/jobs` (routing + plan gate + content policy),
  `byteplus-assets` (CRUD + RLS), `upload` (references bucket).
- Fichiers : `tests/` (+ helpers mock Supabase).
- Risques : mocking Supabase/RLS ; ne pas appeler de vrais providers.
- Validation : nouveaux tests verts dans `npm test`.

## Roadmap produit CTO (au-delà de Phase 1)

- **Phase 2** — AI Director visible : storyboard éditable, recommandation de
  modèle, **quality score** + cost/time estimate avant génération.
  Briques existantes : `lib/storyboard.ts`, `lib/prompt-enhancer.ts`,
  `lib/content-policy.ts`, `byteplus-cost.ts`.
- **Phase 2** — **Scene Board** horizontal éditable (miniature, prompt, chips,
  durée, modèle, statut queued/generating/done/failed, actions retry/duplicate/
  replace/extend/upscale). Briques : `job_scenes`, retry scenes, last-frame chaining.
- **Phase 3** — **Looks** réutilisables (« Create a look once, reuse it forever »),
  bibliothèque Characters/Products/Styles/Motion/Brand Kits/Saved Looks.
- **Phase 4** — Studio post-génération (variation, retry failed scenes, upscale,
  social pack, schedule, save as Look/reference).

## Terminé (résumé — détails dans agent/log.md)

- [DONE] Composer TipTap (chips + `@` autocomplete) + démo.
- [DONE] FacesManager self-service (vignettes photo, CRUD) + colonne `thumb_path`.
- [DONE] AssetPanel (panneau droit, onglets My Faces / Uploads, recherche).
- [DONE] Upload image → chip `@image` + câblage backend (references_payload).
- [DONE] Model selector → dropdown compact ; Duration/Format/Scenes compacts.
- [DONE] Fix build local `/gallery` sans secrets ; `HANDOVER.md` ; bandeau README.
- [DONE] Lint 100 % clean (CTO list).
