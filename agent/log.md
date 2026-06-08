# agent/log.md — Journal chronologique

Entrée la plus récente en haut. Format :

```
## YYYY-MM-DD HH:MM — Agent — Titre
- Fait :
- Fichiers modifiés :
- Tests : (npm test / tsc / build) → résultat
- Prochaine étape :
```

---

## 2026-06-08 — Claude (Opus 4.8) — Mise en place coordination multi-agents
- Fait : lecture `HANDOVER.md` + `CLAUDE.md` + `future-proof-notes.md` ; création
  des fichiers de coordination `AGENTS.md`, `agent/tasks.md`, `agent/log.md`,
  `agent/review.md`.
- Constat doc : `CLAUDE.md` et `future-proof-notes.md` datent du 2026-05-11 et
  décrivent une stack EvoLink/Modal antérieure au virage BytePlus/HeyGen/composer
  → noté dans `agent/review.md` (R-001).
- Fichiers : `AGENTS.md`, `agent/tasks.md`, `agent/log.md`, `agent/review.md`.
- Tests : changements docs-only (pas de code) → build non requis.
- Prochaine étape : T-001 (Director Console Phase 1) après validation du niveau
  souhaité (R-002).

## 2026-06-08 — Claude (Opus 4.8) — Lint 100% clean (liste CTO)
- Fait : `setPagination` fonctionnel (admin/jobs) ; suppression d'un
  `eslint-disable` inutilisé ; lucide `Image`→`ImageIcon` (library) ;
  `eslint-disable` sur 4 `<img>` intentionnels (avatar + create).
- Fichiers : `app/(admin)/admin/jobs/page.tsx`,
  `app/(workspace)/create/[mode]/page.tsx`, `app/(workspace)/library/page.tsx`,
  `app/(workspace)/create/avatar/page.tsx`.
- Tests : `next lint` → no warnings/errors ; `build` OK ; `vitest` 220/220.
- Commit : `e91c5d5`.

## 2026-06-08 — Claude (Opus 4.8) — Consolidation CTO (build/handover/gallery)
- Fait : `/gallery` resilient au build sans `SUPABASE_SERVICE_ROLE_KEY`
  (try/catch) ; création `HANDOVER.md` ; bandeau `README.md`.
- Fichiers : `app/gallery/page.tsx`, `HANDOVER.md`, `README.md`.
- Tests : `build` OK de bout en bout ; `vitest` 220/220 ; `tsc` clean.
- Commit : `359d6e4`.

## 2026-06-08 — Claude (Opus 4.8) — Director Console : layout (A + contrôles)
- Fait : Model selector → dropdown compact (badges HD/Refs/verrou en texte) ;
  Duration/Format/Scenes → rangée compacte de dropdowns ; panneau Assets à droite
  (AssetPanel : onglets My Faces / Uploads, recherche, vignettes, click-to-insert) ;
  ancien bloc faces en fallback mobile.
- Fichiers : `app/(workspace)/create/[mode]/page.tsx`,
  `components/create/asset-panel.tsx`.
- Tests : `build` OK ; `tsc` clean.
- Commits : `49960eb`, `6056ce0`, `0b434a2`.

## 2026-06-08 — Claude (Opus 4.8) — Faces self-service + asset:// validé end-to-end
- Fait : `FacesManager` (vignettes photo, add photo+assetId, attach photo, delete) ;
  colonne `byteplus_assets.thumb_path` ; API `GET/POST/PATCH/DELETE` (thumbs signés) ;
  upload image → chip `@image` + envoi via `references_payload` (uniquement les chips
  présents dans le prompt). Génération réussie avec visage vérifié (`asset://`) sur
  Seedance 2.0 Fast (job `e235de1e`).
- ⚠️ Opérations DB hors-protocole (faites avant ce protocole) → voir `review.md` R-003 :
  migration `thumb_path`, policy RLS `byteplus_assets_update_own`, insertion des
  assets vérifiés de l'utilisateur (groupe « Paul »).
- Fichiers : `components/create/faces-manager.tsx`,
  `app/api/byteplus-assets/route.ts`, `app/(workspace)/create/[mode]/page.tsx`,
  `components/create/prompt-composer.tsx`.
- Tests : `build` OK ; `tsc` clean ; `vitest` 220/220.
- Commits : `da38afc`, `4dbda8a`, `098b707`, `03eaffe`, `fc14560`, `8e702da`, `7ac7380`.
