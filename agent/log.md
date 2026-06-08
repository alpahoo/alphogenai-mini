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

## 2026-06-08 — Claude (Opus 4.8) — Guard test anti provider-leak (T-602)
- Fait : `lib/__tests__/provider-leak-guard.test.ts` — assure qu'aucun label public
  ne contient BytePlus/AtlasCloud/EvoLink/Bailian/Kie.ai/HeyGen (ENGINE_DISPLAY_NAMES,
  getEngineDisplayName, cleanModelName + cas réalistes + non-over-stripping). Verrouille
  T-102/T-605 contre toute régression future.
- Test-only ; aucun code applicatif modifié.
- Fichiers : `lib/__tests__/provider-leak-guard.test.ts`.
- Tests : **226/226** (10 fichiers) · `tsc` clean · `lint` clean · `build` OK.

## 2026-06-08 — Claude (Opus 4.8) — T-605 : remove public provider names
- Fait (UI-only ; aucune route/DB/Stripe/Modal) :
  - Avatar picker badge `HeyGen credits · ~60× cheaper` → `Avatar mode · lower cost`.
  - `friendlyError` page job (public) sans BytePlus/Kling O3/Atlas.
  - `lib/types.ts ENGINE_DISPLAY_NAMES` : retrait `(Kie.ai)/(Bailian)/(HeyGen)/(Atlas)`
    → corrige aussi `/gallery` + page job (getEngineDisplayName). `(Direct)` gardé.
  - faces-manager : texte du lien d'aide neutralisé.
- Audit : panneaux coût/crédits create + « EvoLink balance »/« Top up » + JobCostBadge
  sont **admin-gated** → laissés (conforme consigne). Avatar studio : 0 provider visible.
- Ouvert : R-006 (href console provider sur le lien d'aide, faible).
- Fichiers : `app/(workspace)/create/[mode]/page.tsx`, `app/jobs/[id]/page.tsx`,
  `lib/types.ts`, `components/create/faces-manager.tsx`.
- Tests : `vitest` 220/220 · `tsc` clean · `build` OK · `lint` clean.

## 2026-06-08 — Claude (Opus 4.8) — T-102b : wording sans provider (review Codex)
- Fait : badge `BytePlus 2.0 only` → `Seedance 2.0 only` ; `cleanModelName()`
  retire les noms providers (HeyGen/BytePlus/AtlasCloud/EvoLink/Bailian/Kie.ai) des
  labels de modèles + caption « Powered by » ; faces-manager : `BytePlus Asset ID`
  → `Verified Face Asset ID` (+ message d'erreur) ; avertissement create reformulé
  sans BytePlus/Atlas. Vérif : mentions providers restantes = commentaires uniquement.
- Créé `[T-605]` (cleanup noms providers ailleurs : HeyGen credits, EvoLink balance,
  message job, lien console) — non mélangé à T-102b (consigne Codex).
- **UI-only**, aucune route touchée.
- Fichiers : `lib/engine-intentions.ts`, `components/create/faces-manager.tsx`,
  `app/(workspace)/create/[mode]/page.tsx`.
- Tests : (à lancer ci-dessous).

## 2026-06-08 — Claude (Opus 4.8) — T-102 labels provider-friendly + badges compat
- Fait : `lib/engine-intentions.ts` (helper pur, display-only) → intentions produit
  (Realistic character / Fast draft / Avatar / Cinematic HD / General) + statut de
  compatibilité asset relatif au moteur. Dropdown Model mène par l'intention +
  caption « Powered by ». Badges de compat sur vignettes faces (AssetPanel +
  FacesManager mobile) et uploads (AssetPanel).
- **UI-only** : aucune route `jobs`/providers modifiée ; la valeur d'engine envoyée
  à l'API reste inchangée (le label est cosmétique). Donc rien à valider côté
  `review.md` au titre du protocole #4.
- Fichiers : `lib/engine-intentions.ts`, `components/create/asset-panel.tsx`,
  `components/create/faces-manager.tsx`, `app/(workspace)/create/[mode]/page.tsx`.
- Tests : `vitest` 220/220 · `tsc` clean · `build` OK · `lint` clean.
- Prochaine étape : review ciblée Codex (UX + régression), puis T-201/T-301 selon Paul.

## 2026-06-08 — Claude (Opus 4.8) — Protocole multi-agents : rôles + backlog 6 axes
- Fait : ajout de la section « Rôles des agents » dans `AGENTS.md` (Claude Code /
  Codex local / ChatGPT : périmètres, droits, règle de non-collision avec owner) ;
  restructuration de `agent/tasks.md` en **6 axes Director Console** (polish create
  flow, AI Director, Scene Board, Saved Looks, post-gen studio, cleanup docs/lint/
  tests) avec `owner` par tâche.
- Fichiers : `AGENTS.md`, `agent/tasks.md`, `agent/log.md`. **Aucun code applicatif.**
- Tests : docs-only → build non requis.
- Prochaine étape : sur décision de Paul, démarrer T-102 (labels friendly + badges
  compat) ou un autre axe.

## 2026-06-08 — Claude (Opus 4.8) — T-001 Director Console (layout-only) + migration rétro
- Fait :
  - Rangée de contrôles unifiée **Model · Duration · Format · Scenes** en haut
    (dropdowns), suppression de l'ancienne grille Duration/Format/Scenes dupliquée.
  - Sections « Reference image » + « References » repliées dans un collapsible
    (fermé par défaut) → page nettement plus courte. Toujours accessibles pour
    les moteurs non-BytePlus.
  - Migration rétroactive `supabase/migrations/20260608_byteplus_assets_thumb_and_update_policy.sql`
    (additive, idempotente ; trace la colonne `thumb_path` + policy UPDATE déjà en
    prod). Non ré-appliquée (déjà présente). R-003 → résolu côté traçabilité.
- Fichiers : `app/(workspace)/create/[mode]/page.tsx`,
  `supabase/migrations/20260608_byteplus_assets_thumb_and_update_policy.sql`.
- Tests : `tsc` clean · `build` OK · `lint` clean · `vitest` 220/220.
- Prochaine étape : T-002 (labels provider-friendly + badges statut assets) — sur
  décision R-002 (Paul a choisi « layout only » pour cette itération).

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
