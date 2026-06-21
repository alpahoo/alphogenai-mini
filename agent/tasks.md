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
- UI-only ; aucune route/API/DB/state machine. R-009 resolu ensuite : Auto Director
  utilise Seedance 2.0 Fast via `lib/director-engine.ts`. tsc/build/lint/tests verts.

### [T-203] AI Director Auto engine resolution - `status: done` - `owner: codex`
- Decision produit : `Auto` dans AI Director = Seedance 2.0 Fast (cle interne
  `seedance2_fast_byteplus`), sans exposer le provider en UI.
- Livre : helper pur `lib/director-engine.ts` + test ; create flow utilise
  `resolveDirectorEngineKey(selectedEngine)` pour `scenes[].engine` et le score cout.
- Scope : UI/create-flow only ; pas de route/API/DB/state machine.

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
### [T-301c] Retry affordances - `status: done` - `owner: codex`
- Retry job-level (`retry-scenes`, job failed) est deja present sur la page job.
- Regen single-scene via `ScenePanel` est gate par `supportsSingleSceneRegen()`;
  les modeles non supportes voient un texte discret au lieu d'un bouton qui echoue.
  Pas de modif route/state machine.

### [T-301d] (V2) Édition prompt par scène via `PATCH` — `status: blocked` · `owner: claude`
- Déféré V2 (l'endpoint `PATCH /scenes/[i]` existe déjà).

## Axe 4 - Saved Looks  `status: in_progress`

### [T-401] Looks reutilisables spec - `status: done` - `owner: codex`
- Livre docs-only : `docs/product/saved-looks-spec.md`.
- Definit le contrat V1 : save from completed job, reuse in Create/Library/Job,
  capabilities provider-neutral, audit schema/API avant migration.
- Decoupage restant : T-401a audit route/schema existants ; T-401b UI Saved Looks ;
  T-401c helper payload ; T-401d migration seulement si necessaire ; T-401e tests.

### [T-401a] Audit existing looks route/schema - `status: done` - `owner: codex`
- Livre : `docs/product/saved-looks-audit.md`.
- Conclusion : implementation actuelle = `cinematic_looks` pour avatar/cinematic shots ;
  aucune migration locale ne cree la table, donc pas d'extension schema avant audit Supabase.

### [T-401b] Saved Looks Library surface - `status: done` - `owner: codex`
- `/library` affiche les Saved Looks comme assets reutilisables.
- Action `Create with look` -> `/create/avatar?look_id=<id>`.
- `/create/avatar` preselectionne le look via query param et passe en mode cinematic.
- Aucun changement DB/API/provider.

### [T-401c] Saved Look reuse payload helper - `status: done` - `owner: codex`
- Nouveau helper pur `lib/saved-look-payload.ts`.
- Centralise le contrat `look_id + script_text + voice_id + lipsync_mode` vers
  `POST /api/jobs`.
- Tests unitaires : validation champs requis, trim/cap script, default `speed`,
  anti provider-leak.

### [T-401d] Supabase live schema audit - `status: blocked` - `owner: codex`
- Livre : `docs/product/saved-looks-supabase-audit.md`.
- Blocage : Supabase MCP `list_tables` et `execute_sql` refusent l'accès ; `.env.local`
  n'a pas de service-role/DB URL. Aucune migration avant audit live privilegie.

## Axe 8 - UGC Studio  `status: in_progress`

### [T-801a] UGC Studio spec - `status: done` - `owner: codex`
- Livre : `docs/product/ugc-studio-spec.md`.
- V1 propose un mode Product/UGC base sur les references existantes (`outfit_style`),
  Verified Faces, Saved Looks, AI Director et Social Pack.
- Aucun changement runtime/DB.

### [T-801b] UGC Director prompt helper - `status: done` - `owner: codex`
- Nouveau helper pur `lib/ugc-director.ts`.
- Transforme product + outfit + angle + platform + creator en prompt global,
  aspect ratio et 5/6 scenes Director.
- Tests : scenes avec/sans outfit, aspect ratio, angle/creator copy, fallbacks,
  anti provider-leak.

### [T-801c] UGC panel in create flow - `status: done` - `owner: codex`
- Panneau UI-only dans `/create/product` et `/create/social`.
- Champs : product name, main benefit, tone, angle, platform, creator.
- Bouton `Build UGC Director plan` utilise `buildUGCDirectorPlan()` et ouvre
  le Director avec scenes locales, aspect ratio et duree plafonnes par le plan.
- Aucun changement backend/API/DB/payload submit.

### [T-801d] Explicit UGC reference roles - `status: done` - `owner: codex`
- Ajout des roles image `product_reference` et `outfit_reference` dans le contrat
  `ReferenceRole` + validation serveur, avec `outfit_style` garde en compat legacy.
- `/create/product` et `/create/social` affichent deux slots proches du composer :
  Product reference et Outfit/style, avec upload ou drag/drop direct.
- Mapping V1 conserve les placeholders modele `image 1` / `image 2` dans le
  Director, tout en envoyant des roles explicites dans `references_payload`.
- Aucun changement DB/migration/provider/state machine.

### [T-801e] UGC creator identity polish - `status: done` - `owner: codex`
- Panneau `Creator identity` dans UGC Studio : Product-first, Verified face,
  Saved Look, Avatar, avec disponibilite, miniatures et selecteurs quand plusieurs
  assets existent.
- Chargement paresseux des Saved Looks sur `/create/product` et `/create/social` ;
  avatars charges quand l'identite Avatar est choisie.
- `buildUGCDirectorPlan()` accepte `creatorLabel` pour nommer l'identite choisie
  dans les scenes Director, sans nouveau payload backend.
- Scope : UI/helper/test only ; aucune route/API/DB/migration/provider/state machine.

### [T-801f] UGC Social Pack presets - `status: done` - `owner: codex`
- Ajout `lib/ugc-social-pack.ts` : presets TikTok/Reels, Instagram feed et
  Landscape ad (aspect ratio, formats cibles, brief metadata, CTA, hashtags).
- `buildUGCDirectorPlan()` integre le preset social dans le prompt global, les
  scenes hook/CTA et expose `plan.social`.
- UGC Studio affiche un encart `Social Pack preset` et active `caption_mode=auto`
  quand le plan UGC est construit.
- Scope : UI/helper/test only ; aucune route/API/DB/migration/provider/state machine.

### [T-802] UGC generation contract - `status: done` - `owner: codex`
- Livre docs-only : `docs/product/ugc-generation-contract.md`.
- Definit la promesse V1 exacte : product/outfit references + creator identity +
  AI Director + Social Pack sur le payload jobs existant, sans promettre exact
  try-on, product geometry/logo preservation, native lip-sync ou consistence longue
  garantie.
- Cadrage suite : T-802b payload audit, T-802c readiness score, T-802d decision
  dedicated backend seulement si le payload jobs actuel ne suffit pas.
- Scope : aucun runtime, aucune route/API/DB/migration/provider/state machine.

### [T-802b] UGC payload audit - `status: done` - `owner: codex`
- Livre : `docs/product/ugc-payload-audit.md`.
- Ajout d'un test route-level `POST /api/jobs` qui prouve la preservation de
  `references_payload`, `byteplus_asset_ids`, `aspect_ratio`, `caption_mode` et
  `scenes[]` pour un payload UGC.
- Decision : pas de route dediee `/api/ugc/jobs` en V1 ; le payload jobs existant
  suffit tant qu'on ne promet pas exact try-on/product grounding.

### [T-802c] UGC readiness score - `status: done` - `owner: codex`
- Ajout helper pur `lib/ugc-readiness.ts` : statuts `Ready`, `Missing product`,
  `Style-only`, `Needs identity`, `Best effort` + checks Product/Style/Identity.
- Create flow : le panneau UGC affiche un encart readiness reactif sur
  `/create/product` et `/create/social`, sans bloquer la generation.
- Tests `lib/__tests__/ugc-readiness.test.ts` : statuts, copy exact try-on
  best-effort, identites indisponibles, anti provider-leak.
- Scope : UI/helper/test only ; aucune route/API/DB/migration/provider/state machine.

### [T-802d] Dedicated UGC backend decision - `status: done` - `owner: codex`
- Livre docs-only : `docs/product/ugc-backend-decision.md`.
- Decision : ne pas creer `/api/ugc/jobs` en V1. Le chemin existant
  `POST /api/jobs` preserve deja le contrat UGC (refs, verified faces, scenes,
  aspect ratio, captions, identity fields) et garde quota/policy/routing centralises.
- Reconsiderer seulement pour T-803+ si exact try-on/product grounding impose un
  contrat backend impossible a exprimer via `POST /api/jobs`.
- Scope : aucun runtime, aucune route/API/DB/migration/provider/state machine.

### [T-803a] Exact try-on / product grounding spec - `status: done` - `owner: codex`
- Livre docs-only : `docs/product/ugc-exact-tryon-grounding-spec.md`.
- Definit les tiers futurs : grounded product UGC, logo/text preservation,
  outfit style transfer, exact try-on, avec copy autorisee/interdite.
- Cadre les requirements data/payload, safety/consent, evaluation harness et
  decoupage T-803b/c/d/e.
- Decision : ne pas creer de backend dedie sans preuve qu'un modele valide exige
  un contrat impossible via `POST /api/jobs`.
- Scope : aucun runtime, aucune route/API/DB/migration/provider/state machine.

### [T-803b] UGC capability matrix - `status: done` - `owner: codex`
- Ajout helper pur `lib/ugc-capabilities.ts` : matrice provider-neutral par modele
  public (product grounding, logo/text, outfit style, exact try-on, verified identity,
  duree fiable, usages/cautions).
- Exact try-on reste `none` pour tous les modeles actuels tant qu'aucune validation
  T-803e ne prouve une capacite dediee.
- Tests `lib/__tests__/ugc-capabilities.test.ts` : Auto -> Seedance Fast, product
  grounding fort, avatar vs product grounding, defaults prudents, anti provider-leak.
- Scope : helper/test/docs only ; aucune route/API/DB/migration/provider/state machine.

## Axe 9 — AlphoGen MCP (studio API pour agents)  `status: in_progress`

Spec : **`docs/product/alphogen-mcp-spec.md`**. Principe : **MCP → API interne
AlphoGen uniquement**, jamais MCP → Supabase/secrets/providers directs. Réutilise
les gates existants (plan/quota/content-policy/ownership/confidentialité providers).

### [T-901a] Spec MCP AlphoGen — `status: done` · `owner: claude`
- `docs/product/alphogen-mcp-spec.md` : objectif, cas d'usage (dev QA Claude/Codex,
  agent réalisateur ChatGPT, preview payload, plan Director, suivi jobs), archi
  (serveur MCP externe + futur `/api/mcp/*` + PAT scoping, pas de service-role),
  outils V1 read-only/no-cost (`get_job`, `list_recent_jobs`, `validate_job_payload`,
  `create_director_plan`, `create_ugc_plan`) et V2 side-effect (`create_video`,
  `use_as_reference`, `duplicate_job`, `export_social_pack`), règles sécurité,
  phasing T-901a→e, non-goals. Docs-only.

### [T-901b] `/api/mcp` auth design (PAT) — `status: done (design)` · `owner: claude`
- Livré docs-only : `docs/product/alphogen-mcp-auth-design.md`. PAT `agk_<id>_<secret>`
  (hash HMAC-SHA256+pepper, montré une fois, révocable, TTL optionnel) ; table future
  `mcp_tokens` (RLS owner-scoped, migration additive plus tard = go Paul) ; flux de
  résolution header→user (service-role UNIQUEMENT dans le resolver, jamais exposé au
  MCP) ; **scopes** least-privilege (`read`/`plan`/`generate`/`export`/`assets`,
  défaut `read+plan`) ; **réutilisation des gates** existants (plan/quota/content-policy/
  references/confidentialité) via un helper partagé `assertCanCreateJob(userId,payload)`
  à extraire ; rate limit ; audit logs (sans secret/provider) ; preview-first pour les
  actions coûteuses. Implémentation derrière review.

### [T-901b-impl] Helper partagé `assertCanCreateJob` — `status: done` · `owner: claude`
- Premier pas d'implémentation à faible risque (refactor interne pur, **aucune route
  MCP**). Extrait la séquence de gate de `POST /api/jobs` (prompt → content-policy →
  references ownership → résolution plan depuis `profiles` → limite génération active →
  quota journalier → engine plan gate EvoLink/Bailian Pro+, HeyGen Premium + avatar/voix)
  dans `lib/jobs/guard.ts` : `assertCanCreateJob(supabase, input)` →
  `{ ok:true, plan }` | `{ ok:false, status, body }`. `MAX_ACTIVE_JOBS` y migre aussi.
- Fichiers : `lib/jobs/guard.ts` (nouveau), `app/api/jobs/route.ts` (appelle le helper,
  imports nettoyés : screenPrompt/validateReferences/PLAN_DAILY_QUOTA/const MAX_ACTIVE_JOBS
  retirés), `lib/__tests__/jobs-guard.test.ts` (nouveau, 18 tests).
- Comportement **identique** : `app/api/jobs/route.test.ts` (7 tests) reste le filet de
  régression et passe inchangé. Validé : 326 tests · tsc 0 · lint 0 · build OK.
- Source de vérité unique pour le futur `/api/mcp/*` (voir auth-design §5).

### [T-901c] Outils read-only sur compte de test (squelette) — `status: done` · `owner: claude`
- `get_job`, `list_recent_jobs` ; prouve la frontière auth + confidentialité providers.
- Livré : premier squelette `/api/mcp` (surface AlphoGen-side).
  - `app/api/mcp/route.ts` : dispatcher `POST {tool,input}` + `GET` catalogue ; flag
    `MCP_ENABLED` (404 sauf `"true"`) ; auth fail-closed ; service-role server-side only.
  - `lib/mcp/auth.ts` : PAT `agk_<id>_<secret>` parsé + vérifié HMAC-SHA256+pepper en
    temps constant ; résolution via token de test env (pas de DB) ; fail-closed.
  - `lib/mcp/serialize.ts` : `toPublicJob` provider-neutral (jamais de clé engine brute /
    nom de provider ; scrub des messages d'erreur).
  - `lib/mcp/tools.ts` : `get_job` + `list_recent_jobs` (read, scoping `userId`, cap 20) +
    `validate_job_payload` (scope plan, preview — **réutilise `assertCanCreateJob`, aucun
    insert, aucune nouvelle logique de gate**). Aucun `create_video` payant.
  - `lib/mcp/types.ts` ; tests `lib/__tests__/mcp.test.ts` (24) + `app/api/mcp/route.test.ts` (8).
- Config/garde-fous documentés : `docs/product/alphogen-mcp-auth-design.md` §12. Ouvert
  (R-019) : migration future `mcp_tokens` + activation du flag = go Paul.
- Validé : 355 tests · tsc 0 · lint 0 · build OK (`/api/mcp` enregistrée).

### [T-901d] Outils plan/validate (purs) — `status: done` · `owner: claude`
- `validate_job_payload` (livré en T-901c), `create_director_plan`, `create_ugc_plan`.
- Livré : deux planners purs ajoutés au registre MCP (`lib/mcp/tools.ts`), scope `plan`,
  cost `none`, aucun insert / aucune dépense.
  - `create_director_plan({prompt, target_duration_seconds?, scenes?})` → réutilise
    `generateStoryboard` (pur). Résout le plan réel via `resolveUserPlan` (extrait de
    `lib/jobs/guard.ts` — 1 source de vérité, le gate l'utilise aussi) pour que le cap de
    scènes corresponde au plan. Sortie `{ plan, scene_count, total_duration_seconds, scenes }` ;
    la clé engine brute n'est PAS exposée.
  - `create_ugc_plan({product, outfit?, angle, platform, creator, ...})` → réutilise
    `buildUGCDirectorPlan` (pur, `ugc-director` + `ugc-social-pack`). Valide les enums
    (angle/platform/creator) → 400 sinon. Sortie provider-neutral (prompt global, beats de
    scènes, aspect ratio, social pack).
- Refactor : `resolveUserPlan(supabase, userId)` extrait de la résolution de plan inline du
  gate ; `assertCanCreateJob` l'appelle désormais (comportement identique, tests verts).
- Validé : 363 tests · tsc 0 · lint 0 · build OK. Toujours derrière `MCP_ENABLED` (off).

### [T-901e] `create_video` derrière confirmation — `status: todo` · `owner: claude/codex`
- Action coûteuse : quota/plan + **preview-first** + confirmation explicite. Puis
  `use_as_reference` / `duplicate_job` / `export_social_pack`. Séquencé en dernier.

## Axe 10 — Gallery curation & premium redesign  `status: in_progress`

Spec : **`docs/product/gallery-curation-redesign-spec.md`**. Règle non négociable :
**rien n'est public sur `/gallery` sauf si un admin publie explicitement** ; la galerie
n'infère JAMAIS la publiabilité depuis le statut d'un job. Pas de lecture directe
`jobs` → galerie publique.

### [T-1001] Spec — `status: done` · `owner: codex`
- `docs/product/gallery-curation-redesign-spec.md` (modèle de données, RLS, admin UX,
  public UX, slices T-1002→T-1006). Docs-only.

### [T-1004a/b] Shell premium privacy-first + contrat de projection — `status: done` · `owner: codex`
- `/gallery` ne lit plus `jobs` automatiquement (shell curated). `lib/gallery-showcase.ts`
  = contrat public provider-neutral (`GalleryItemRow` → `GalleryShowcaseItem`), placeholders
  privacy-first tant que `gallery_items` n'existe pas.

### [T-1002] Schéma `gallery_items` + RLS — `status: done` · `owner: claude`
- Migration `supabase/migrations/20260609_create_gallery_items.sql` **appliquée en prod**
  (MCP `apply_migration`, projet `qbrpzmuedfugbhoeytdj`) + tracée dans le repo.
- Table `public.gallery_items` (colonnes alignées sur le contrat `GalleryItemRow`), défaut
  `status='draft'`. RLS : **public SELECT uniquement `status='published'`** ; aucune policy
  write anon/auth (default-deny) ; service-role full access (admin CRUD + SSR, gardé par
  `isAdminEmail` au niveau app — pas d'`is_admin` en RLS). `source_job_id ON DELETE SET NULL`.
  Trigger `updated_at` avec `search_path` épinglé (pas de régression advisor R-018d).
- Vérifié : advisors security **0 nouvelle alerte** ; table 0 ligne (aucun backfill) ; 2
  policies + RLS on + trigger présents.

### [T-1003] Admin Gallery Manager — `status: done` · `owner: claude/codex`
- **API livrée** (couche testable d'abord) :
  - `lib/gallery-admin.ts` (pur) : `normalizeGalleryWrite(body, "create"|"update")` (whitelist
    stricte des champs écrivables — id/created_by/timestamps jamais acceptés ; enums validés ;
    `display_model` toujours scrubé via `cleanModelName` ; `published_at` dérivé du `status`,
    jamais de l'input) ; `galleryDraftFromJob(job)` (draft sûr depuis un job fini —
    `status='draft'`, **`public_prompt=null` : jamais le prompt privé brut**).
  - `GET/POST /api/admin/gallery` (list+filtres status/category ; create, `created_by`=admin).
  - `PATCH/DELETE /api/admin/gallery/[id]` (publish/unpublish/hide/edit ; remove = supprime la
    ligne galerie uniquement, **jamais le job source**).
  - `POST /api/admin/gallery/from-job` ({job_id} → draft sûr, prompt brut jamais copié).
  - Toutes admin-gated `requireAdmin()` (`isAdminEmail`) + service-role. Tests : 23
    (`lib/__tests__/gallery-admin.test.ts` + `app/api/admin/gallery/route.test.ts`, 1er test
    de route admin du repo). 394 tests · tsc 0 · lint 0 · build OK.
- **UI livree** : page `/admin/gallery` (list/filtre, create draft, create from job id,
  edit title/subtitle/public prompt, publish/unpublish/hide/delete, toggle featured,
  preview media) + entree sidebar admin. `/admin/jobs` expose aussi une action
  `Add` sur les jobs termines : elle cree un draft via `/api/admin/gallery/from-job`
  puis redirige vers `/admin/gallery` pour edition/publication explicite.

### [T-1004] Refonte page publique `/gallery` — `status: done` · `owner: codex`
- Lire **uniquement** `gallery_items.status='published'` (via projection `gallery-showcase`)
  + rendu premium (hero featured, filtres catégories, grille curated). Remplace les
  placeholders quand des items publiés existent.
- Livre : `/gallery` lit `gallery_items` via client Supabase public/RLS, filtre
  `status='published'`, trie featured/sort_order/published_at et passe les lignes a
  `GalleryShowcasePage`. Fallback placeholders privacy-first si zero item publie ou
  erreur. Aucune lecture directe de `jobs`, aucune route admin/service-role.

### [T-1005/1006] Lightbox + Create similar / Visual QA — `status: done` · `owner: codex`
- Lightbox statique publique deja presente dans `GalleryShowcasePage` : preview media,
  metadata provider-neutral, CTA `Create similar`.
- `Create similar` utilise `source_job_id` uniquement quand un item curaté en expose un,
  sinon fallback sûr `/create/story`.
- Polish : filtres catégorie fonctionnels côté client (`All`, `Cinematic`, `UGC`, etc.).
- QA : `/gallery` HTTP 200, capture Playwright OK, `test:e2e` 3/3.

## Axe 11 — Premium Product Experience  `status: in_progress`

Objectif : homogénéiser l'expérience AlphoGen autour d'un langage Runway-like /
Director Console : media-first, éditorial, privé par défaut, moins "template SaaS".
Spec : `docs/product/premium-product-experience-spec.md`.

### [T-1101] Design direction spec — `status: done` · `owner: codex`
- Livre : spec globale design premium (principes, langage visuel, pages cibles,
  non-goals, séquence recommandée).

### [T-1102] Shared premium primitives — `status: done` · `owner: codex`
- Ajout `components/premium/premium-marketing.tsx` : `PremiumEyebrow`,
  `PremiumSectionHeader`, `PremiumMediaFrame`, `PremiumWorkflowCard`,
  `PremiumMetricStrip`.
- Scope : UI-only, aucune donnée app/Supabase.

### [T-1103] Landing public rebuild — `status: done` · `owner: codex`
- `/` reconstruit en page éditoriale premium : hero Director Console, preuve
  workflows, UGC/product section, post-generation studio, privacy/curation copy.
- Scope : public UI-only ; aucune route/API/DB/provider.

### [T-1104] Home command center V2 — `status: done` · `owner: codex`
- Livre UI-only : `/home` harmonise le command center avec l'Axe 11 (fond warm-neutral,
  hero workspace blanc, CTA neutre, production pulse, pipeline, starters et recents
  en cards premium).
- Aucun changement requête Supabase, navigation ou logique métier.

### [T-1105] Create flow visual polish — `status: done` · `owner: codex`
- Polir `/create/[mode]` autour de la Director Console existante, sans toucher au
  submit/payload backend.
- Livre UI-only : fond warm-neutral, header `Production brief` avec métriques plan/
  format/scènes, formulaire dans un panneau premium, Director Console en surface sombre
  media-led, rail assets harmonisé et panel AI Director ouvert aligné au nouveau style.
  Aucun changement submit/payload/route/API/DB.

### [T-1106] Job studio polish — `status: done` · `owner: codex`
- Livre UI-only : `/jobs/[id]` adopte le langage premium Axe 11 (fond warm-neutral,
  vidéo média-led, bloc "Post-generation studio", actions principales harmonisées,
  rail desktop blanc/translucide, cartes Status/Production plus sobres).
- Confidentialité : labels modèle passés par `cleanModelName(getEngineDisplayName(...))`.
- Aucun changement handler, route, API, DB, retry, duplicate, save-look, scene panel ou
  Social Pack.

### [T-1107/T-1108] Secondary pages + visual QA — `status: done` · `owner: codex`
- Livre UI-only : `/projects`, `/library`, `/analytics`, `/schedule` alignés sur
  l'Axe 11 (fond warm-neutral, headers éditoriaux, surfaces blanches, CTA neutres,
  filtres/tabs plus premium, cards plus lisibles).
- Confidentialité : analytics passe les labels modèles par
  `cleanModelName(getEngineDisplayName(...))`.
- Aucun changement requêtes Supabase, endpoints, drag/drop schedule, actions projets,
  library links, analytics API ou logique métier.

### [T-1109] Public secondary pages premium pass — `status: done` · `owner: codex`
- Livre UI/copy-only : `/pricing`, `/about`, `/technology` harmonisés avec la
  landing Axe 11 (fond warm-neutral, surfaces blanches/noires, headers éditoriaux,
  CTA sobres, récit Director/studio plutôt que stack technique).
- Confidentialité : retrait des noms providers/infra/modèles des textes publics ;
  `/technology` décrit les capacités et l'orchestration sans exposer le routing.
- Pricing conserve le checkout existant (`POST /api/stripe/checkout`) ; aucune
  route/API/DB/auth/Stripe modifiée.

### [T-1110] Public utility pages premium pass — `status: done` · `owner: codex`
- Livre UI/copy-only : `/login`, `/generate`, `/blog`, `/blog/[slug]`,
  `/privacy`, `/terms`, `/help/verified-face-id` harmonisés avec l'Axe 11.
- Login conserve les appels Supabase auth existants ; `/generate` conserve le
  POST direct `/api/jobs` tout en orientant vers la Director Console.
- Blog/legal/help nettoyés des noms providers/infra visibles et convertis en
  surfaces éditoriales warm-neutral ; aucun endpoint, DB, auth ou génération modifié.

### [T-1111] Public premium E2E smoke QA — `status: done` · `owner: codex`
- Mise à jour du smoke Playwright `tests/e2e/workspace-smoke.spec.ts`.
- Couvre `/pricing`, `/about`, `/technology`, `/blog`, `/privacy`, `/terms`,
  `/help/verified-face-id`, `/generate` + login + auth gate workspace.
- Vérifie que les pages publiques refondues rendent leurs headlines et qu'aucun
  nom provider sensible n'apparaît dans le texte visible.

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

### [T-501d2] Create prefill from reference job - `status: done` - `owner: codex`
- Livre UI/backend glue : `/create/story?reference_job_id=<id>` appelle
  `POST /api/jobs/[id]/reference-image`, ajoute le `ReferenceItem` au state
  `references` + `composerUploadItems`, insere un chip `@reference`, ouvre la zone
  references et affiche un statut loading/ready/error dans le composer.
- Fichier : `app/(workspace)/create/[mode]/page.tsx`. Validation : 244 tests,
  tsc, lint, build OK.

### [T-501d3] Job page Use as reference action - `status: done` - `owner: codex`
- Livre UI-only : bouton `Use as reference` dans l action bar des jobs termines.
  Il pointe vers `/create/story?reference_job_id=<job_id>` et reutilise le prefill
  T-501d2 ; aucune generation directe, aucun provider visible.
- Fichier : `app/jobs/[id]/page.tsx`. Validation : 244 tests, tsc, lint, build OK.
### [T-501e] Duplicate fidelity audit - `status: done` - `owner: codex`
- Livre docs-only : `docs/product/duplicate-fidelity-audit.md`.
- Constat : la route duplicate garde la bonne architecture (forward vers `POST /api/jobs`),
  mais copie trop peu de champs pour les jobs modernes : aspect ratio, verified faces,
  Director scenes/storyboard, chain settings, audio/captions.
- Decision : garder le label prudent `Duplicate job` tant que T-501e1 n est pas livre.

### [T-501e1] Duplicate route fidelity implementation - `status: done` - `owner: codex`
- Livre backend + tests : helper pur `lib/job-duplicate-payload.ts` + test
  `lib/__tests__/job-duplicate-payload.test.ts`, route
  `app/api/jobs/[id]/duplicate/route.ts` branchee dessus.
- Duplicate copie desormais les champs de fidelite : aspect ratio, captions/audio,
  chain settings, verified face IDs, references, image_url, engine, et convertit le
  storyboard persiste en `scenes[]` pour preserver les plans Director.
- Avatar/look jobs : blocage explicite 409 avec message provider-neutral tant que la
  source generique `jobs` ne permet pas une reconstruction fidele.
- Architecture conservee : forward vers `POST /api/jobs` pour garder quota/policy/routing
  centralises ; aucun output/status/cout/provider task ID n est copie.

### [T-501e2] Avatar/look duplicate contract - `status: done` - `owner: codex`
- Livre docs-only : `docs/product/avatar-look-duplicate-contract.md`.
- Decision : conserver le 409 actuel pour avatar/look jobs tant qu'un contrat dedie
  ne prouve pas la reconstruction fidele (avatar id, voice/script, look payload,
  references, scenes, aspect/captions/audio).
- Prochaine implementation seulement apres audit des champs durables avatar/look.

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

### [T-602] Tests d'int?gration API + guards - `status: done` - `owner: codex|claude`
- **Fait** : guard anti-leak provider `lib/__tests__/provider-leak-guard.test.ts`
  (ENGINE_DISPLAY_NAMES + getEngineDisplayName + cleanModelName ; 6 cas). Verrouille
  T-102/T-605.
- **Fait T-602a (Codex)** : tests route-level mockes
  `app/api/byteplus-assets/route.test.ts` couvrant auth 401, GET scoped user +
  signed thumbnails, POST validation/upsert, PATCH scoped update et DELETE scoped delete.
- **Fait T-602b (Codex)** : tests route-level mockes
  `app/api/upload/route.test.ts` pour `?bucket=references` : auth 401, fichier requis,
  magic bytes absents, MIME mismatch, upload user-scoped + signed URL, erreur storage.
- **Fait T-602c (Codex)** : tests route-level mockes
  `app/api/jobs/route.test.ts` pour `POST /api/jobs` : prompt min, content policy,
  ownership references, active generation gate, daily quota free, plan gate moteur Pro.
- Etat validation : **270 tests** au total, tsc/lint/build clean au dernier passage.
- Aucun appel Supabase/provider reel dans ces tests ; providers critiques sont mockes.

### [T-603] Lint 100 % clean — `status: done` · `owner: claude`
- `next lint` → no warnings/errors. (Fait.)

### [T-604] Retirer `typescript.ignoreBuildErrors` - `status: done` - `owner: codex`
- Verifie : `next.config.ts` ne contient plus `typescript.ignoreBuildErrors`.
- `tsc --noEmit`, lint et build sont clean ; R-004 resolu.

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
    face ID? » ; R-006 remplace ensuite l'href fournisseur par une page d'aide interne.
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



## Push policy - Codex peut pousser

- Decision Paul (2026-06-09) : Codex peut commit + push `main` des qu une tranche est
  validee (tests/tsc/lint/build selon risque), sans attendre un "push main" explicite.
- Exceptions : demander validation avant migrations DB, secrets, config critique, changement
  produit ambigu, ou action potentiellement destructive.

## Priorites actees Paul - 2026-06-08

1. T-602 - tests d integration API : done.
2. R-003 - migration retrospective Supabase : migration tracee, no user data.
3. T-604 - retirer typescript.ignoreBuildErrors : done/verifie.
4. T-401 - Saved Looks : spec done ; implementation future apres audit.
5. Avatar/look duplicate : contrat done ; 409 conserve jusqu a reconstruction fidele.
6. T-301c - retry affordances : done.
7. R-006 - aide interne verified face ID : done.

## Axe 7 - Visible Premium Pass  `status: in_progress`

### [T-701] Schedule double-sidebar fix - `status: done` - `owner: codex`
- Livre UI-only : `app/(workspace)/schedule/page.tsx` ne rend plus sa propre
  `Sidebar`; le layout workspace reste la seule source de navigation.
- Nettoyage : suppression du fetch profil local `plan/email` devenu inutile.
- Validation : 270 tests, tsc, lint, build OK.

### [T-702] Landing public refresh - `status: done` - `owner: codex`
- Livre UI/copy-only : `app/page.tsx` remplace le hero date "Text to Video / Modal"
  par un positionnement product-led : AI video direction workspace, Director plan,
  assets, post-generation studio.
- Provider-neutral ; aucun backend/route/DB. Validation : 270 tests, tsc, lint, build OK.
- Note verification : dev server HTTP 200 ; Browser plugin indisponible dans cet environnement au moment du check.

### [T-703] Create flow premium pass - `status: done` - `owner: codex`
- Livre UI-only : ajout d'une `Director Console` dans le create flow, juste apres
  les controles principaux. Le Director devient un chemin central visible avec
  resume Plan / Model / Readiness, CTA `Plan with AI Director`, et skip path
  `Generate now`.
- Nettoyage : retrait de l'ancien bouton Director cache en bas du formulaire ;
  libelles visibles de credits admin rendus provider-neutral dans le create flow.
- Scope : aucune route/API/DB/state machine ; generation Director et Generate Video
  conservent les chemins existants.
- Validation : 270 tests, tsc, lint, build OK ; dev server local `/create/story`
  -> HTTP 307 (auth gate, pas de 500).

### [T-704] Home dashboard premium pass - `status: done` - `owner: codex`
- Livre UI-only : `/home` transforme l'ancien template picker en command center
  premium : hero operationnel, actions principales (Director, reference, studio),
  production pulse, pipeline workspace, starters compacts et projets recents.
- Donnees : reutilise uniquement le fetch existant des jobs recents (limite portee
  a 8) ; aucune route/API/DB.
- QA : Playwright ajoute comme dev dependency + smoke tests publics/auth gate
  (`npm run test:e2e`). La capture authentifiee reste limitee par le login user.
- Validation : 270 tests, 3 smoke e2e Playwright, tsc, lint, build OK.

### [T-705] Library asset studio pass - `status: done` - `owner: codex`
- Livre UI-only : `/library` devient un Asset Studio avec hero, stats, recherche,
  filtres (all/reference/social-ready), grille video premium et actions par asset.
- Actions : `Reference` -> `/create/story?reference_job_id=<id>`, `Studio` ->
  `/jobs/<id>`, `Master` telecharge la video finale, `Social` ouvre le job.
- Donnees : reutilise `jobs` done + `social_exports` existants ; aucune route/API/DB.
- Validation : 270 tests, 3 smoke e2e Playwright, tsc, lint, build OK.

---

## Axe 8 — Lip-Sync & Video Reuse  `status: in_progress`

Spec : **`docs/product/lipsync-existing-video-spec.md`** (audit complet, costing, 
workflows, non-goals V1/V2). Objectif : réutiliser une vidéo cinématique réussie 
(HeyGen Avatar Shots) sans régénération complète, en appliquant nouveau script + voix 
+ lip-sync pour réduire coûts (V1 = 5–20% du coût full video).

### [T-801] Audit + Spec : Lip-sync existing video — `status: done` · `owner: claude`
- **Scope** : audit pure, docs-only, sans code runtime.
- Livré : `docs/product/lipsync-existing-video-spec.md`
  - État actuel (✅ implementé) : Save Look, Reuse Look, TTS + lip-sync workflow
  - Limitations actuelles (⚠️) : UX affordance manquante, costing non transparent
  - Out of scope V1 (❌) : arbitrary video lip-sync, ElevenLabs TTS, editing results
  - Decisions & rationale : pourquoi HeyGen Avatar Shots only, pourquoi HeyGen TTS V1
  - Open questions : script screening, quality degradation, plan limits
  - Testing strategy, rollout plan, API examples
- Audit files lus :
  - `app/(workspace)/create/avatar/page.tsx` (Reuse Look UI)
  - `lib/saved-look-payload.ts` (validation payload)
  - `app/api/looks/route.ts` (save/list/delete Looks)
  - `app/api/jobs/route.ts` (look_id branch, lip-sync workflow)
  - `lib/heygen-client.ts` (generateSpeech, createLipsync)
- Conclusions : Feature core est fonctionnel et testé ; manquent UX affordance + 
  costing display pour V1 public launch.
- Validation : spec review-ready ; docs/product/* conforme ; pas de code breaking.

### [T-802] UX affordance : "Reuse with new voice" — `status: done` · `owner: claude`
- Livré : Button "Reuse with new voice" sur job page (HeyGen Avatar Shots only)
  - Auto-navigates `/create/avatar?look_id=...` quand Look sauvegardée
  - Button visible uniquement après `lookSaved && savedLookId` true
  - Stocke `savedLookId` retourné par `POST /api/looks`
- Fichiers : `app/jobs/[id]/page.tsx` (button + state pour savedLookId)
- Validation : tsc/lint clean, tests 408/408 passing

### [T-803] Cost transparency : Lip-sync costing in UI — `status: done` · `owner: claude`
- Livré : Helper `estimateLipsyncCost(scriptLength, mode, duration)` dans `lib/lipsync-cost.ts`
  - Estime TTS cost (~0.01 credits/100 chars) + lip-sync cost (mode-dependent)
  - Retourne `{ ttsCost, lipsyncCost, totalCost, percentOfFullVideo }`
  - Display sur `/create/avatar` quand Look selected & script fourni
  - Affichage : "X credits (~Y% of full video)" avec breakdown TTS + lip-sync
  - Mise à jour réactive : cost recalcule quand script ou lipsyncMode change
- Fichiers : `lib/lipsync-cost.ts` (new), `lib/__tests__/lipsync-cost.test.ts` (6 tests),
  `app/(workspace)/create/avatar/page.tsx` (import + display)
- Validation : tsc/lint clean, tests 408/408 passing

### [T-804a] Spec: Library Looks management — `status: done` · `owner: claude`
- Livré : `docs/product/library-looks-management-spec.md` (spec-only, audit + decisions)
  - Audit `/api/looks` GET/POST/DELETE, schema `cinematic_looks`
  - UX decisions : `/library?tab=looks` (cohérent), hard delete (simple), 
    no thumbnail V1 (MVP: inline video preview)
  - Rename strategy : `PATCH /api/looks/[id] { name }` (new endpoint)
  - Implementation phases : T-804a (grid UI), T-804b (thumbnail), T-804c (rename + E2E)
- Risk mitigation : lazy-gen thumbnails, grid virtualization if >50 Looks, 
  soft delete in V1+ if user feedback needed
- Non-goals V1 : bulk ops, tags, share, analytics, soft delete

### [T-804b] UI: Library Looks grid + rename modal — `status: done` · `owner: claude`
- Livré : UI complète de gestion des Looks dans la Library.
  - ✅ Grid composant déjà présent (video preview + name + duration badge + "Create with look" button)
  - ✅ Rename modal : input (1-100 chars), Save/Cancel, validation feedback (char count)
  - ✅ Delete confirmation modal : avertissement "permanently delete", Delete (red)/Cancel
  - ✅ Hover actions : pencil icon → rename, trash icon → delete (group:hover)
  - ✅ Empty state déjà implémenté
  - ✅ Responsive layout : 4 cols desktop (xl:grid-cols-4), 2 mobile (sm:grid-cols-2) ✅
- `app/(workspace)/library/page.tsx` : état (renameModalOpen, selectedLookId, newName, 
  deleteConfirmOpen, lookToDelete, isSaving, isDeleting) + handlers 
  (handleStartRename, handleSaveRename, handleStartDelete, handleConfirmDelete)
- Error handling : user-facing alerts (rename/delete failures)
- Dépendances : T-804a spec done ✅
- Commit : b3c5b67

### [T-804c] API + E2E: Rename endpoint + delete confirmation — `status: done` · `owner: claude`
- Livré : API endpoints + UI modals (inclus dans T-804b implementation).
  - ✅ `PATCH /api/looks/[id] { name }` route (`app/api/looks/[id]/route.ts`)
    - Validation : name [1..100], type string
    - Ownership check : user_id == auth user
    - Response : { success, look: { id, name, updated_at } }
    - Errors : 400 (invalid), 401 (unauth), 404 (not found), 500 (DB)
  - ✅ `DELETE /api/looks/[id]` route (path param variant, nouvelle + query param ancien)
    - Ownership check : user_id == auth user
    - Hard delete (spec V1 acceptable)
  - ✅ UI modals : rename + delete confirmation (voir T-804b)
- `app/api/looks/[id]/route.ts` (nouveau) : 85 lines, PATCH + DELETE handlers
- Tests : tsc clean (Promise<params> fix), build OK
- Dépendances : T-804a (spec) ✅, T-804b (grid UI + modals) ✅
- Commit : b3c5b67

### [T-805] Futures : Video upload / Lip-sync source video contract
- Objectif : Permettre à l'utilisateur de télécharger une vidéo et faire juste du lip-sync.
- Priorité : **TIER 2** (plus risqué, nécessite spec + contrat backend clair).
- Scope : Research + spec phase d'abord, pas implementation V1.
- Questions clés :
  - Formats vidéo acceptés (mp4, webm, mov) ? Résolution min/max ?
  - Durée min/max ? Constraints HeyGen lip-sync API ?
  - Comment reconnaître "vidéo compatible" vs "vidéo non-compatible" ?
  - UX : upload form vs drag-drop vs gallery picker ?
  - Costing : moins cher que génération Seedance ? Baseline estimate ?
- À faire post-T-804 : audit HeyGen lip-sync API, draft spec contract

### [T-806] V2 Planning : Alternative TTS providers — `status: todo` · `owner: —`
- Objectif : abstraire voice provider pour supporter ElevenLabs + open-source (V2+).
- Priorité : **TIER 3** (moins urgent ; après flux HeyGen parfaitement propre).
- Scope : architecture & decision, pas d'implementation.
- À faire (design phase) :
  - [ ] Spec voice_provider abstraction (heygen | elevenlabs | openai | custom)
  - [ ] Costing model per provider + currency handling
  - [ ] Consent/licensing logic (ElevenLabs commercial, etc)
  - [ ] Voice mapping: HeyGen voice_id ≠ ElevenLabs voice_id
  - [ ] Fallback strategy si voice provider unavailable
- Dépendances : T-801 (spec) done ; T-804 (Looks stable) done
- Risques : feature creep ; dépasser scope V1 produit

### [T-805] V2 Planning : Alternative TTS providers — `status: todo` · `owner: —`
- Objectif : abstraire voice provider pour supporter ElevenLabs + open-source (V2+).
- Scope : architecture & decision, pas d'implementation.
- À faire (design phase) :
  - [ ] Spec voice_provider abstraction (heygen | elevenlabs | openai | custom)
  - [ ] Costing model per provider + currency handling
  - [ ] Consent/licensing logic (ElevenLabs commercial, etc)
  - [ ] Voice mapping: HeyGen voice_id ≠ ElevenLabs voice_id
  - [ ] Fallback strategy si voice provider unavailable
- Dépendances : T-801 (spec) done
- Risques : feature creep ; dépasser scope V1 produit

---

## Axe 9 — Favorites & Personal Curation  `status: in_progress`

Objectif : donner à l'utilisateur un contrôle simple sur ses meilleures générations
sans migration DB V1. Les favoris sont stockés dans `jobs.app_state.favorite`,
préservant tout état applicatif existant.

### [T-901] Favorites V1 — `status: done` · `owner: codex`
- Scope : favori par job vidéo, visible sur job detail, Library et Projects.
- Données : `jobs.app_state.favorite === true` ; aucune nouvelle table, aucune migration.
- API : `PATCH /api/jobs/[id]` avec `{ favorite: boolean }`, ownership check et
  service-role côté serveur ; ne modifie pas `updated_at`.
- UI :
  - bouton `Favorite/Favorited` sur la page job ;
  - filtre `Favorites` + badge dans Library ;
  - filtre `Favorites` + badge dans Projects.
- Tests : helper pur `lib/job-favorite.ts` couvert par Vitest.
- Non-goals V1 : dossiers, tags utilisateur, tri avancé, favoris galerie publique.

---

## Axe 10 — AlphoResearch Engine  `status: in_progress`

Objectif : transformer un sujet, une URL, un produit, un concurrent ou une tendance
en sources verifiees, angles editoriaux, script, storyboard puis payload Director.

Contraintes :
- **Pas de n8n** : l'utilisateur a deja son orchestrateur/workflow.
- Docs/spec d'abord ; aucune route/API/DB avant validation.
- Hostinger VPS = services auxiliaires (SearXNG, Crawl4AI, changedetection.io,
  Speaches/Kokoro, Redis/Dragonfly optionnel), pas remplacement de Vercel/Supabase.
- V1 = approval manuel, pas de publication ou generation video automatique.

### [T-1100a] Spec: AlphoResearch Engine — `status: done` · `owner: codex`
- Livre : `docs/product/alphoresearch-engine-spec.md`.
- Couvre : intent produit, architecture sans n8n, role Hostinger, API future,
  modele de donnees propose, discovery SearXNG, extraction Crawl4AI, analyse LLM,
  storyboard compatible Director, quality score, watchlists changedetection et
  roadmap T-1100b -> T-1108.
- Scope : docs-only, aucune migration, aucune route, aucun runtime.

### [T-1100b] Service contract Hostinger — `status: done` · `owner: claude`
- Livré : `docs/product/hostinger-service-contract.md` (2900+ lines, docs-only).
- Contenus :
  - **SearXNG** : recherche meta, port 9090, API contract JSON, health check toutes les 5 min,
    rate limit 60 req/min, failure graceful (fallback manual).
  - **Crawl4AI** : extraction Markdown, port 8000, metadata + links, timeout 30s,
    max 20 URLs/job, 50 KB per source, failure tagging sans blocage job.
  - **changedetection** : monitoring (Phase 4), webhook contract, auth token, TBD.
  - **Speaches/Kokoro** : TTS low-cost (Phase 3+), reference implementée.
  - **Redis** : cache optionnel, rate-limit counters.
  - **Network & Security** : firewall rules (Vercel → VPS), internal DNS, SSL self-signed.
  - **Operations** : baseline 2+ CPU, 4+ GB RAM, docker-compose, health check orchestration,
    restart policies, Uptime Kuma monitoring, log retention (7-30 days).
  - **Scope out** : ❌ production Supabase/Next.js sur Hostinger, ❌ n8n, ❌ auto-publish.
- Validation : Prête pour review avant T-1101 (schema DB).
- Commit : 241e6e1+ (docs/product/hostinger-service-contract.md).
- Review Codex : addendum réseau ajouté. Vercel ne doit pas appeler directement
  `*.internal`/127.0.0.1 ni des ports services ; utiliser un gateway Hostinger
  unique en HTTPS + service token/tunnel, les containers restant privés.

### [T-1101a] Schema spec review — `status: done` · `owner: claude`
- Livré : `docs/product/alphoresearch-schema-review.md` (specs-only, no migration).
- Couverture :
  - 5 tables (research_jobs, research_sources, research_angles, research_scripts, research_storyboards)
    avec colonnes, types, contraintes, tailles max.
  - RLS policies (users see own jobs only, service-role bypass pour app routes).
  - Indexes (performance pour découverte, listing, tri).
  - Foreign key graph (jobs → sources/angles → scripts → storyboards).
  - Size constraints : extracted_markdown 50 KB, script 10 KB, scenes_json 100 KB.
  - Integration Director (scenes_json compatible).
  - Validation checklist (13 points avant migration).
- Out of scope : ❌ n8n hooks, ❌ seeded data, ❌ soft-delete V1, ❌ sharing.
- Validation : Prête pour review + feedback avant migration T-1101.
- Commit : À faire (docs-only).

### [T-1101] Research schema migration — `status: done` · `owner: claude`
- Livré : Migration SQL traçable `supabase/migrations/20260610_create_alphoresearch_schema.sql` (376 lines, timestamped).
- Contenu :
  - ✅ 5 tables : research_jobs, research_sources, research_angles, research_scripts, research_storyboards
  - ✅ Colonnes exactes, types, CHECK constraints, size limits du spec T-1101a
  - ✅ Indexes : (user_id, created_at DESC), (job_id, selected), URL uniqueness per job, partial unique angle selected
  - ✅ RLS enabled : SELECT/INSERT/UPDATE WITH CHECK/DELETE policies user ownership, sans service-role redondant
  - ✅ jsonb_typeof validation : sections_json et scenes_json = array
  - ✅ Foreign keys cascading (jobs → sources/angles/scripts → storyboards)
  - ✅ Triggers : updated_at maintenance sur research_jobs, research_sources, research_scripts
- Application : Appliquée manuellement via Supabase SQL Editor (2026-06-10).
- Validation PROD ✅ (2026-06-10) :
  - 5 tables research_* existent en Table Editor
  - RLS enabled = true sur tous
  - 4 policies par table (SELECT, INSERT, UPDATE, DELETE)
  - Index partial unique research_angles_job_id_selected_partial avec WHERE selected = TRUE
  - Tous indexes et constraints présents
  - 3 triggers updated_at actifs
  - Advisor : pas d'erreurs critiques
- Dépendances : T-1101a (spec review) ✅, T-1100b (Hostinger) ✅
- Commit : e3810b6 (migration SQL) + 8c16b35 (T-1101 fix)

### [T-1102] Research API skeleton — `status: done` · `owner: claude`
- Livré : 4 routes API authentifiées pour recherche job CRUD minimal.
- Routes :
  - `POST /api/research/jobs` : Créer job (draft status)
  - `GET /api/research/jobs` : Lister jobs user avec pagination + status filter
  - `GET /api/research/jobs/[id]` : Récupérer job (ownership check)
  - `PATCH /api/research/jobs/[id]` : Éditer job draft seulement
- Authentification : Supabase session (Bearer token), user_id from auth.uid() jamais client body
- Ownership strict : Filtrage user_id sur toutes les requêtes, 404 si non-owned
- Validation : topic 3-500, mode enum, URL format, language, duration 3-600
- Draft-only : PATCH rejette éditions sur jobs non-draft
- Codes erreur : 401 (no auth), 404 (missing/non-owned), 400 (validation), 500 (DB)
- Tests : route-level avec Supabase mocké (auth, ownership, validation, draft-only)
- Pas d'appels externes (SearXNG, Crawl4AI, LLM)
- Validation : npm test 454/454, tsc clean, npm build OK
- Commit : eab661e

### [T-1103] Source discovery adapter — `status: done` · `owner: claude`
- SearXNG integration : queries, normalize, dedupe, classify, tests.
- Livré : `lib/research/discovery.ts` (helpers), `app/api/research/jobs/[id]/discover/route.ts` (POST handler)
- Spec : `docs/product/research-discovery-adapter-spec.md`
- Validation : npm test 464/464, tsc clean, npm build OK
- Commit : e81ff9f

### [T-1104] Extraction adapter — `status: done` · `owner: claude`
- Crawl4AI integration : Markdown extraction, metadata, per-source errors, caps.
- Livré : `lib/research/extraction.ts` (helpers), `app/api/research/jobs/[id]/extract/route.ts` (POST handler)
- Production fixes (Codex review) : research_job_id column, extraction_status enum conformance
- Validation : npm test 477/477 ✓, tsc clean ✓, npm build OK ✓
- Commits : b2b308a (initial), 7d6e3cc (prod fixes)

### [T-1105] Angles analysis — `status: done` · `owner: claude`
- Summaries, uncertainty, contradictions, 3-5 angles, recommended angle.
- Livré : `lib/research/angles.ts` (helpers), `app/api/research/jobs/[id]/analyze/route.ts` (POST handler)
- LLM: Claude via Anthropic API (server-side only)
- Status flow: ready_for_angles → scripting → ready_for_angles or failed
- Validation : npm test 499/499, tsc clean, npm build OK
- Commit : 5f3a34b

### [T-1106] Script + storyboard — `status: done` · `owner: codex`
- Script depuis angle selectionne + scenes compatibles Director.
- Livré : `lib/research/script.ts` (helpers purs), `lib/research/script-llm.ts` (LLM call isolé), `app/api/research/jobs/[id]/script/route.ts` (POST handler).
- Route : `POST /api/research/jobs/[id]/script`.
- Status flow : ready_for_angles/scripting/failed → scripting ; succès conserve `scripting` avec `approved=false`.
- DB payloads : `research_job_id` only on child tables, no `user_id`/`job_id`; `research_scripts` + `research_storyboards` schema-aligned.
- Validation : npm test 531/531, tsc clean, npm build OK.

### [T-1107] Research Studio UI — `status: done` · `owner: codex`
- Livré V1 : `/research` (brief + liste) et `/research/[id]` (pipeline Sources → Angles → Script/Storyboard).
- Navigation : entrée `Research` ajoutée dans la sidebar workspace.
- Intégration : actions UI branchées sur `discover`, `extract`, `analyze`, `script`; lecture directe RLS pour jobs/sources/angles/scripts/storyboards.
- Fix inclus : `POST /api/research/jobs` retourne maintenant la ligne créée via `.select().single()`.
- Limite V1 : handoff Director encore placeholder (`Open Director`), pas d’édition fine sources/script/scènes.
- Validation : npm test 531/531, tsc clean, npm build OK.

### [T-1107a] Research Studio UX spec — `status: done` · `owner: codex`
- Livre : `docs/product/research-studio-ux-spec.md`.
- Couvre : navigation `/research` + `/research/[id]`, new research brief,
  pipeline Brief/Sources/Angles/Script/Storyboard/Director, etats UX, actions,
  quality score, plan gates, handoff vers Director sans `POST /api/jobs` direct.
- Scope : docs-only, aucune route/API/DB/runtime ; ne bloque pas T-1101a schema review.

### [T-1108] Watchlists — `status: todo` · `owner: claude`
- changedetection.io webhook + notifications dashboard, sans auto-publication.
- Livré V1 : migration `research_watchlists` + `research_watchlist_events`, API
  utilisateur `GET/POST/PATCH/DELETE /api/research/watchlists`, webhook
  `POST /api/webhooks/changedetection` protégé par `CHANGEDETECTION_WEBHOOK_SECRET`.
- Règle : un changement crée uniquement un brouillon `research_jobs.status='draft'`
  et un événement `draft_created`; aucune génération, publication ou dépense auto.

### [T-1109] Research Cinematic Planner — `status: done` · `owner: claude`
- Livré : spec + helper pur + branchement script route.
- Les scènes Research stockées dans `research_storyboards.scenes_json` gardent
  `title/prompt/duration_sec`, avec prompt enrichi caméra/lumière/mood/voiceover.
- Handoff Director inchangé côté contrat ; Create reçoit aussi `voiceoverText`.

### [T-1110] Research Source Media Collector — `status: in_progress` · `owner: codex`
- T-1110a/b/c livrés : spec, helper pur, gateway `/api/extract` avec
  `media_candidates`, table `research_source_media`, persistance metadata-only.
- T-1110d livré : bloc `Suggested references` sur `/research/[id]`, sélection
  explicite avec copie serveur vers bucket privé `references`, puis handoff vers
  Create comme `ReferenceItem` image. Aucun média n'est injecté automatiquement.
- Reste V1+ : polish thumbnails, éventuelle édition du rôle de référence,
  e2e visuel authentifié après déploiement.

### [T-1120] Premium UI — Research / Explainer / Render Studio — `status: todo` · `owner: claude`
- T-1120a livré (docs-only) : `docs/product/research-explainer-premium-ui-spec.md` —
  vision UX premium 4 écrans (Research Home command center, Plan Review, Explainer
  Studio éditable + détails cinématiques, Render/Post-production) + navigation
  Home→Review→Studio→Render→Job/Social Pack + wireframes + existant/manquant + non-goals.
- Scope : docs-only, aucun runtime/route/composant/migration ; fidèle au mockup
  validé avec Codex. Review Paul requise avant toute implémentation UI.
- Addendum garde-fous (docs-only, §13 de la spec) : preview V1 low-fi browser vs V2
  high-fi HyperFrames (aucun rendu coûteux auto) ; working storyboard éditable séparé
  (ne jamais écraser `research_storyboards`) ; Brand Kit minimal V1 (logo_url/name/couleur) ;
  voix-off vs lip-sync séparés (coût/routing explicites) ; captions V1 déterministes
  depuis script/voiceover_text, STT word-level en V2 ; Studio Simple par défaut /
  Advanced replié (caméra/lumière/mood/motion) ; desktop-first, mobile = consultation.
- T-1120b livré (UI-only) : Research Home premium command center —
  `app/(workspace)/research/page.tsx` : hero compact, **chips workflow**
  (News/Tutorial/Product/Competitor + note Explainer), **starter templates**
  (préremplissent le brief, client-only), Recent research avec compteur,
  microcopy/tooltips, états loading/empty/error. Aucune route/API/DB/pipeline
  touché. Validé : `tsc --noEmit` clean + `npm run build` OK. **QA visuelle
  authentifiée desktop/mobile à faire** (route auth-gated) → T-1120f.
- T-1120c livré (UI-only) : Plan Review premium — `app/(workspace)/research/[id]/page.tsx` :
  barre de progression fait/actif/à-faire, colonne droite **sticky** + carte **Next action**
  guidée (réutilise les handlers existants), statuts sources lisibles (Pending/Extracted/Blocked),
  bandeau **consentement** sur Suggested references (suggestions-only, rien d'auto), angle
  sélectionné mis en avant + line-clamp, script scrollable, durée dans le header. Aucune
  route/API/DB, aucun changement pipeline ; garde-fous §13 préservés. Validé : tsc + build OK.
  QA visuelle authentifiée desktop/mobile à faire → T-1120f.
- T-1120c-polish livré (UI-only, supervisé Codex puis mergé) — `app/(workspace)/research/[id]/page.tsx` :
  Sources limitées à 5 (+ Show all), Suggested references à 9 (+ Review all), Plan Summary
  compact (4 tuiles : angle/durée/scènes/références prêtes), carte Next action enrichie
  (`detail`), scroll réduit. tsc + build OK. Commit 2d7b797.
- T-1120e livré (UI-only, scope « honnête » — STOP-and-explain validé par Paul) —
  `app/(workspace)/research/[id]/page.tsx` : carte Explainer transformée en panneau
  **Render & post-production** — cadrage **Raw vs Final**, bouton render existant réutilisé,
  états in_progress/done/failed, et au statut *done* deep-links vers la **page Job**
  (overlays/captions/branding/exports y existent déjà) + Library, avec description honnête
  de la post-prod. **Aucun back** : pas de nouvelle route/API/DB, aucun rendu déclenché
  depuis ce panneau, aucun faux contrôle. tsc + build OK. QA visuelle authentifiée → T-1120f.
  Note : le panneau post-prod **fonctionnel** complet (overlays/voix/exports actifs) reste
  hors UI-only — câblerait les routes `app/api/jobs/[id]/{overlay,voiceover,export-social}`
  (déclenchent Modal = coût ; sémantique à vérifier sur explainer) → ticket séparé si voulu.
- T-1120-preview-spike livré (docs-only) — `docs/product/t1120-preview-spike.md` :
  décision = preview **low-fi client-side WYSIWYG** dans le Studio (la composition est
  du HTML/CSS+GSAP pur, donc le même HTML tourne dans le navigateur → fidélité ≈ rendu
  final, $0, instantané, sans Modal) ; high-fi = render Modal CPU existant, **au clic
  uniquement** (~minutes, ~2-5¢). Garde-fou « aucun rendu coûteux auto » confirmé et
  renforcé (le spike n'a déclenché aucun rendu). 1ʳᵉ étape de T-1120d = extraire
  `lib/explainer/composition.ts` (partagé build.js + Studio) + composant preview iframe.
  **T-1120d débloqué.**
- T-1120d-render-edits livré (Tier A backend, autorisé par Paul — **route**, pas UI-only) :
  `POST /api/research/jobs/[id]/explainer` accepte désormais un `{ storyboard }` édité
  optionnel. **Validé serveur** via `sanitizeEditedScenes` (enum templates/motions, clamp
  durée [2,30], cap longueurs/bullets/scènes, template user **préservé**), **marque
  re-dérivée serveur** (le client ne peut pas injecter brand/logo). `research_storyboards`
  **jamais modifié** (édits utilisés pour ce rendu seulement) ; `metadata.edited` taggé.
  **Aucune migration, aucun changement Modal** (Modal acceptait déjà un storyboard). Studio :
  bouton « Render these edits (~$0.03) » → `onRender(draft)` → `generateExplainer(sb)`.
  Fix : `onClick={() => generateExplainer()}` (évitait de passer l'event comme storyboard).
  6 tests sanitize ajoutés (27 explainer OK). tsc + build OK sans warning, /research/[id]
  15,8 kB. QA visuelle/e2e → T-1120f. Persistance (survie reload/autosave) = Tier B, non fait.
- T-1120d en cours — étape 3/n livrée : **Explainer Studio éditable** (UI-only, scope
  confirmé par Paul) — `components/explainer/explainer-studio.tsx`, ouvert en overlay
  depuis le panneau Render. Édite un **working copy local** (seedé du plan, jamais persisté
  → `research_storyboards` intact, §13.2) : liste de scènes (réordonner/dupliquer/supprimer),
  inspecteur **Simple** (template, texte écran, voix-off, durée, bullets) + **Advanced replié**
  (camera_motion, citation) §13.6, **preview live débouncé** (350 ms) qui reflète chaque édit,
  Reset to plan. Note honnête : le **rendu final reste basé sur le plan sauvegardé** (wiring
  édits→rendu + persistance = ticket backend suivant, le point ouvert §13). Aucune route/API/
  DB, aucun pipeline. tsc + build OK (sans warning), /research/[id] 15,6 kB ; 21 tests explainer
  OK. QA visuelle live non réalisable (cwd worktree ≠ alphogenai-mini) → T-1120f.
- T-1120d en cours — étape 2/n livrée : composant **preview WYSIWYG**
  `components/explainer/explainer-preview.tsx` — charge le HTML de `composition.ts`
  dans un `<iframe srcdoc>` (scale-to-fit 1920×1080), pilote la timeline GSAP in-frame
  (play/pause/scrub via `__timelines.main`, accès cross-frame OK grâce à
  `sandbox="allow-scripts allow-same-origin"` ; HTML entièrement échappé). Câblé dans la
  page plan (panneau Render) : preview affiché dès qu'un storyboard existe (avant tout
  rendu payant). **$0, local, aucun Modal.** UI-only : aucune route/API/DB, aucun
  pipeline. tsc + build OK (sans warning), /research/[id] 13,6 kB. QA visuelle live non
  réalisable (route auth-gated + infra preview non liée au worktree) → T-1120f ; parité
  HTML déjà prouvée à l'étape 1.
- T-1120d en cours — étape 1/n livrée : extraction `lib/explainer/composition.ts`
  (port fidèle de `build.js` : 6 templates + timeline GSAP, fonction pure
  `buildCompositionHtml(storyboard, assets) → string` + `compositionDurationSec`).
  Champs optionnels `comparison`/`stat` ajoutés à `ExplainerScene` (additif). 9 tests
  vitest + **parité byte-identique prouvée vs build.js** sur les 6 templates (one-off,
  non commité). build.js / Modal / VPS **non touchés** (unifier build.js dessus = ticket
  Modal séparé). tsc + tests OK. Reste T-1120d : composant preview `<iframe srcdoc>` +
  GSAP play/scrub, puis layout Studio (storyboard éditable, inspecteur).
- Reste, ordre recommandé :
  T-1120d (suite : preview iframe + Studio layout — UI-first, pas de back) →
  T-1120f Visual QA desktop/mobile.

