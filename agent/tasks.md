# agent/tasks.md — Backlog partagé

## T-1164d - Creator UGC Studio adaptation - CODE READY (2026-07-30, Codex)
- Audited Open-AI-UGC and retained its useful generation contract: one script plus ordered actor/product/scene references in one native video request.
- Added an explicit creator script and up to six private product/scene reference uploads to the admin UGC studio.
- Hardened the provider prompt around visible product use, same-creator continuity, product fidelity and native creator speech.
- BytePlus remains the first provider behind the existing provider-neutral contract. No MUAPI, NextAuth, Prisma or Stripe code was imported.
- Revideo is optional post-production only; the three-shot assembly is now marked legacy.
- Validation: 18 focused tests, TypeScript and production build pass; zero provider spend.
- Next: deploy, upload 2-4 clean Powerbeats references, write one short first-person script and run one capped 15-second native UGC acceptance. Do not run the legacy assembly for this gate.

## T-1164b - Native multi-shot Product Ad path - TECH PASS / PRODUCT FAIL (2026-07-30, Codex)
- Added a provider-neutral `UGCNativeAdProvider` contract alongside the existing three-shot contract.
- Added one high-quality Seedance/BytePlus adapter task for a complete 15-second native ad with timed hook, product demo and lifestyle CTA beats.
- The native task accepts the same product and presenter references, enables synchronized native audio, persists DB-first and copies the finished result to permanent R2 storage.
- Added an admin-only start/poll route. The public Product Ad workflow remains untouched until one capped Beats acceptance passes.
- `directed_edit` and the Revideo worker remain available for exact copy, voice, timing and branding; ComfyUI is not an immediate dependency.
- Validation: 9 focused tests, TypeScript and production build pass. One explicitly approved production task completed as job `ce13f059-408d-4a51-875d-fa097ea6a9f7`.
- QA: technical PASS (15.07s, 1080x1920, photoreal creator, verified identity); product FAIL (altered product geometry/colors, weak framing and no useful final CTA).
- Next: do not repeat cosmetic native generations. Run the `directed_edit` path with three product-faithful shots, then assemble once through Revideo.

## T-1164a - Provider-neutral UGC shot pipeline - CODE READY (2026-07-29, Codex)
- Freeze `three-shot-v2` as a rejected product renderer. It remains historical fallback code only; no additional visual investment is planned.
- Added a provider-neutral `UGCShotProvider` contract and a Seedance adapter over the existing BytePlus client.
- Added a coherent three-shot storyboard (`creator_hook`, `product_demo`, `lifestyle_cta`) with explicit anti-collage and product-fidelity constraints.
- Extended BytePlus multimodal references to preserve safe product refs alongside verified face assets and to pass video/audio references.
- Added an admin-only DB-first experimental start/poll route that copies completed outputs to permanent R2 URLs.
- Added an isolated Revideo Node 22/Linux worker for deterministic three-shot assembly. Worker typecheck, root TypeScript, focused tests and production build pass. Local Windows rendering timed out; the first Docker/Hostinger render remains a gate.
- Decision and acceptance plan: `docs/product/product-ad-ugc-shot-pipeline.md`.
- Next: deploy the private Revideo worker, then run exactly one capped Beats Powerbeats Pro 2 generation and review the final assembled ad.

## T-1163e V2 - Native Product Ad editorial rebuild - CODE READY (2026-07-27, Codex)
- The first production render proved the private presenter pipeline but failed product acceptance: generic voice, one static poster layout, oversized copy and weak product placement. It is not considered a Product Ad PASS.
- V2 extracts up to four useful product images (Open Graph, Product JSON-LD and bounded page images) and renders a deterministic three-shot edit: product hook, presenter-led middle shot with timed caption halves, and product CTA close.
- Native voice is now an explicit curated choice and is validated and passed to multilingual TTS. The provider remains private.
- The compositor retains private-media resolution, animation fallback and portrait/square/landscape support. No provider generation or paid QA was launched for this rebuild.
- Focused tests, TypeScript, Python syntax, production build and a synthetic ffmpeg filter-graph smoke test pass. Deployment and one capped authenticated acceptance remain.

## T-1163e - Native Product Ad compositor integration - SUPERSEDED BY V2
- Added an explicit native-beta path to Product Ad: one ready private reusable performance clip plus one product URL produces a provider-neutral eight-second ad.
- The server reserves the job before network generation, extracts product metadata, writes a bounded short script, generates speech, and reuses or starts the private native-animation cache from T-1163d.
- The existing job status endpoint advances animation state and dispatches a new CPU Modal compositor. Animation failure is deliverable through a normalized-performance fallback with the same speech.
- Modal resolves all private media server-side and composes product imagery, animated presenter, deterministic captions, branding and 9:16, 1:1 or 16:9 output. No storage path, model name or task id is public.
- Product Ad UI makes the native path selectable only for ready private performance clips, fixes the beta duration at eight seconds and explains the scope. The existing external Product Ad path remains unchanged.
- No migration is required beyond the already-applied T-1163d schema. Deployment and one capped authenticated production acceptance remain.

## T-1163a - Manual-assisted Video Presenter publication - DONE (2026-07-26, Codex)
- Added a provider-neutral admin action that links a completed account presenter ID to a waiting AlphoGen Video Presenter request.
- The server verifies the ID against the completed custom-avatar catalog, publishes or reuses the private `user_presenters` row, marks the request ready with an optimistic status guard, then deletes source and consent footage.
- Linking is restricted to unclaimed `pending`, `needs_login`, `needs_review` and `failed`; active worker requests cannot race with the manual path. The action is idempotent and a cleanup failure does not lose the completed presenter.
- Updated the Product Ads Decision Book: manual-assisted delivery is the immediate production bridge; Playwright is experimental, not a freeze gate.

## T-1163c - Native Video Presenter private normalization - DONE (2026-07-27, Codex)
- Added asynchronous, idempotent CPU normalization for retained performance clips. Next.js claims the row, Modal reads/writes private Supabase objects server-side, and the UI polls provider-neutral state with explicit retry.
- Normalization contract: center-cropped 720x720, 25 fps, H.264/yuv420p, silent stereo AAC, max 30 seconds, validated by ffprobe before `ready`.
- Privacy hardening: webhook secret is fail-closed; source and normalized copies are deleted together; recent work is protected while a normalization stale for more than two hours cannot block retention cleanup forever.
- No GPU/model/provider call and no paid generation. Migration `20260726_native_presenter_normalization.sql` is applied in AlphoGen production.
- Validation: 17 focused tests, 1036/1036 full tests, TypeScript, Python AST parse and production build pass.
- Commit `f033fab` is on `origin/main`; Vercel and the Modal workflow deployed successfully. The public presenter route and retention cron both fail closed with `401` when called without authorization.
- Production acceptance passed on one temporary private retained clip: `uploaded -> normalizing -> ready`, 720x720, 25 fps, 6.443 seconds, silent AAC contract, valid private MP4. Source, normalized object, database row and local QA copy were deleted after verification.
- Next slice: T-1163d provider-neutral speech animation adapter (LatentSync first).

## T-1163d - Native Video Presenter speech animation adapter - DONE (2026-07-27, Codex)
- Added an own-only animation cache and private media bucket contract for one ready native base plus one verified speech file. Migration `20260727_create_native_presenter_animations.sql` is applied in AlphoGen production.
- Added a provider-neutral Next.js prepare/upload/submit/poll/download/remove API. It claims before GPU launch, deduplicates by base + audio SHA-256 + adapter version, blocks automatic re-spend, and quarantines incomplete task tracking.
- Extended the isolated LatentSync Modal app with private native start/status endpoints. Inputs are captured before model bootstrap, output paths are UUID-scoped, and completed MP4s write directly to private Supabase Storage.
- Public responses expose no model/provider/task id, signed input, storage path or raw infrastructure error. Ready downloads use a ten-minute signed URL.
- Validation: 16 focused Vitest tests, 1052/1052 full tests, TypeScript, Python syntax and production build pass. Python pytest is unavailable in the local runtime; the extended Python contract test is committed for CI.
- Deployment hardening: the Modal workflow now installs `pydantic`; the lightweight polling image also installs `requests` so remote network failures remain serializable and observable.
- Production acceptance passed with one private 3.192-second speech clip and one normalized 6.443-second base. The A10G animation completed in 113.29 seconds and produced a private 512x512 H.264 + AAC MP4 of 3.24 seconds. Sampled frames show mouth motion while identity, body and studio remain stable.
- Temporary database rows and private Storage objects were removed after verification. No Product Ad renderer switch was made.
- Next slice: T-1163e provider-neutral Product Ad compositor integration, fallback and product UX.

## T-1163b - Native Video Presenter independence track - SLICE 1 DONE (2026-07-26, Codex)
- Goal: retain a consented performance clip as a separate private reusable asset, animate it through the provider-neutral lip-sync adapter (LatentSync first), and compose Product Ads inside AlphoGen.
- This is not a provider-ID swap. It requires a distinct retention consent, private base-clip lifecycle, voice/script timeline, product-media compositor and deletion controls.
- Current one-time source and consent footage must continue to be deleted after manual publication; it cannot be silently retained for the native track.
- Slice 1 deployed: optional retention consent, separate direct private upload, one-year expiry, daily fail-closed cleanup, and immediate deletion. No GPU/model call.
- Migration `20260726_create_user_presenter_native_bases.sql` was applied to AlphoGen production before deployment.
- Slice 2 private normalization is tracked separately as T-1163c.

## T-1162 - Product Ad V1 operational hardening - DONE (2026-07-26, Codex)
- Added the admin-only `/admin/video-presenters` operations surface and `/api/admin/video-presenters` route. It lists provider-neutral queue state, user, attempts, private media sizes and recovery policy without exposing provider ids, storage paths or raw provider errors.
- Added controlled recovery rules: active claims cannot be retried; claims become releasable after 30 minutes; recent ambiguous submissions are locked for six hours; invalid footage/consent requires a new request; retries stop after three attempts; any retry that may spend requires explicit confirmation.
- Added idempotent private-footage cleanup and inactive-request removal. Active submitted/processing operations cannot be removed.
- Added `docs/decision-books/product-ads-v1.md` and a Hostinger VPS runbook. Product Ads remains BETA HARDENING until one live Custom Avatar form calibration and one capped end-to-end Video Presenter request pass.
- Validation: 18 focused tests, TypeScript and production build pass; final scope and provider-leak review pass. No provider call or spend.

## T-1161 - High-fidelity Video Presenter bridge - DEPLOYED / CALIBRATION PENDING (2026-07-19, Codex)
- Added a provider-neutral `user_video_presenter_requests` queue and private 200 MB video bucket. Source footage and consent footage upload directly to Supabase through short-lived signed upload tokens, avoiding Vercel body limits.
- Added a white-label Video Presenter option to Product Ad. Users see upload/training/review state; provider names and external ids never cross the public API.
- Added a one-at-a-time Playwright worker with a persistent account-owned browser profile, strict semantic selectors, API catalog completion detection, durable publication into `user_presenters`, and private-footage deletion after completion.
- Production state: migration applied and verified on AlphoGen Supabase (`user_video_presenter_requests`, private bucket, 4 queue RLS policies, 3 storage policies); commit `a6b403c` pushed and the protected `/api/presenters/video` route is live. Worker selectors still require one `login` + `inspect` calibration against the live account before any real submission. No provider task or spend was started.
- Validation: 22 focused tests, TypeScript, Python compile, production build, and diff-check pass.
- Interactive Custom Avatar form calibration has been delegated to Claude. Local calibration helpers remain uncommitted and must not be overwritten by T-1162.

## T-1160 - Product Ad account presenters - DONE (2026-07-18, Codex)
- Added a private, reusable account-presenter flow to `/create/url`: upload a consented portrait, normalize and deduplicate it, explicitly start one paid animation task, poll it, then select the resulting presenter for Product Ad.
- Added `user_presenters`, private `user-presenters` storage, own-only RLS, signed image URLs, server-side ownership resolution, and provider-neutral public responses.
- Paid-call guardrails: claim before spend, reuse ready/processing rows, persist asynchronous task ids before the final avatar id exists, and never automatically re-spend when tracking state is incomplete.
- Migration applied to production manually in the correct AlphoGen Supabase project. No provider generation was run during QA.
- Validation: 23/23 targeted tests, TypeScript clean, production build OK. Next optional step: one explicitly approved real portrait animation QA (about two presenter-generation credits).

Format d'une tâche :
- **[ID] Titre** — `status: todo|in_progress|blocked|done` · `owner: claude|codex|chatgpt|—`
  - Objectif :
  - Fichiers probables :
  - Risques :
  - Critères de validation :

> Règles : créer la tâche **avant** de coder (AGENTS.md #1) ; une tâche
> `in_progress` n'a **qu'un seul owner** ; `git pull` avant de prendre une tâche.

---

### [T-1157] Premium lipsync QA follow-up and failure observability - `status: superseded` · `owner: claude`
- **SUPERSEDED (2026-07-16)** par le gel de **Podcast Premium V1 = VEED web worker** (voir `docs/decision-books/podcast-premium-v1.md`). Ce suivi QA portait sur l'ancienne voie **HeyGen lip-sync premium**, qui n'est plus la brique V1. Conservé pour historique ; aucune action.
- Objective (historique): finish the short premium render only after explaining the two remaining missing lip-sync clips.
- Current production case: podcast `307e628c-96a0-4ad6-b948-60a2f57c2f9a`; 8 voiced dialogue lines; 6 premium clips ready, 2 missing.
- Failed lines: `Break them down into daily habits, like checking email only twice a day.` and `Exactly, and then reviewing your progress each Friday to adjust for the next week.`
- Already attempted: one grouped retry plus one individual retry per missing line. Do not spend more credits blindly.
- First inspect the live lipsync status/API and `podcast_segment_lipsync_clips` rows, including `status`, `provider`, `provider_task_id`, `audio_url`, `base_clip_id`, `cache_key`, and `error_message`. Fix the real cause or improve error propagation before one targeted retry.
- Once 8/8 clips are ready: render the premium video, verify the active speaker moves while the inactive speaker stays frozen, verify captions/studio layout, then document actual spend and result.
- Related delivered commit: `51bdbdc` (premium sync failure details in UI), pushed and validated with 950 tests, tsc, and build.
- Risk: paid provider calls. No more than one targeted retry after the cause is understood.

# Backlog - Roadmap Director Console (6 axes)

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

### [T-1135] Podcast long-form (up to 10 min) — `status: in_progress` · `owner: claude`
- T-1135 livré (un seul ticket, décisions validées : B1 batch+boucle UI, dialogue chunké, tours auto cap 60).
  Podcast-only, **pas de migration**. (1) `podcast.ts` : `PODCAST_TARGET_DURATIONS` + 600. (2) `dialogue.ts` :
  `turnsForDuration()` (≤120s→6-10 ; 300s→~23 ; 600s→~46, cap **ABSOLUTE_MAX_SEGMENTS=60**), bornes de validation
  optionnelles, prompt avec `turns`+`continuation` (mode chunké). (3) `dialogue-llm.ts` : `generatePodcastDialogue()`
  — court=1 appel, long=**chunks de ~12 tours** continués jusqu'au target, budget temps ~45s (stop avant kill
  serverless), repair alternance stricte en fallback. (4) `script/route.ts` : utilise l'orchestrateur, `maxDuration=60`.
  (5) `tts/route.ts` : **batch borné** MAX_SYNTH_PER_CALL=12, renvoie `remaining`, cap 60 ; l'UI boucle « Generate
  pending voices » jusqu'à 0. (6) `segments/route.ts` cap 60. (7) UI : option **10 min**, boucle de voix avec progress
  « N left… ». (8) **render Modal** : base pré-rendue **par segment** (layout statique dans un segment, seule la barre
  de progression s'anime) → 10 min CPU sans timeout ; `timeout 600→1800`. 130 tests podcast verts ; py_compile OK ;
  build OK ; tsc clean ; Modal redéployé (visuels identiques vérifiés sur re-render court). QA prod 10 min e2e à suivre.
  Pas de personnages réels/lip-sync promis.

### [T-1134] Podcast Video Jogg-like quality pass — `status: in_progress` · `owner: codex`
- T-1134e (claude) — review render polish (commits Codex c507e89/85af728) : OK, aucun P1/P2, scope clean. Tous
  les points visuels remplis (fond studio, cartes speakers, actif/inactif, captions hiérarchisées, branding
  AlphoGen Podcast, avatars RGBA sans carré noir, `_podcast_avatar` swappable). py_compile/121 tests/build/tsc OK.
  **Modal redéployé** ; QA prod re-render (1d492d13) → MP4 premium vérifié (frame 8s). Pas de personnages réels/
  lip-sync promis. **Long-form 10 min = ticket séparé** (plus de segments, TTS async/chunked, render timeout long).
- T-1134a livré (docs-only) — **`docs/product/podcast-video-jogg-quality-pass-spec.md`**.
  Objectif produit clarifié : le Podcast V1 prouve le backend, mais la cible reste un parcours **Podcast Video façon Jogg** : choix visuel du format, source simple, voix testables avant génération, dialogue éditable, rendu vidéo crédible.
- Priorité recommandée : **T-1134b Dialogue Quality Pass** → T-1134c Voice Lab UX Upgrade → T-1134d Render Visual Upgrade → T-1134e Upload Script/Audio → T-1134f Provider Lab.
- Non-goals : ne pas cloner Jogg, ne pas fake upload script/audio, ne pas promettre lip-sync, ne pas utiliser Google AI Pro consumer hors API officielle, ne pas casser Story/Avatar/Product/URL/Research.
- T-1134b livré — **Dialogue Quality Pass**. lib/podcast/dialogue.ts impose désormais une vraie barre qualité podcast : hook non générique, rôle distinct du guest, arc hook→tension→explication→implication→takeaway, interdiction d'inventer marques/stats/faits source non fournis, anti Q&A robotique. Tests de contrat ajoutés.
- T-1134d livre - **Render Visual Upgrade V1.1**. `render_podcast` conserve le pipeline CPU/two-shot/audio existant mais remplace le rendu initial tres brut par une scene podcast plus credible : fond studio clair, cartes speakers, speaker actif, avatars placeholder plus humains, waveform, captions dans un cartouche lisible et barre de progression. Aucun changement DB/API/UI/TTS.
### [T-1132] Podcast UX quality — `status: in_progress` · `owner: codex`
- T-1133c livré (claude) — **add / delete / reorder lignes de dialogue**, podcast-only, **pas de migration**.
  Routes : `POST /api/podcasts/[id]/segments` (add en fin, `order_index=max+1`, pending/no-audio, cap **max 10**),
  `DELETE /api/podcasts/[id]/segments/[segmentId]` (garde **min 2**, n'efface pas les autres audios),
  `PATCH /api/podcasts/[id]/segments/reorder` (`{ordered_ids}` = permutation exacte validée). Toutes : auth +
  ownership 404 + **reset render AVANT mutation** (échec reset → 500 sans mutation). UI : ↑/↓ (disabled aux bornes),
  Delete (disabled si 2 lignes, **confirm si audio/MP4 existe**), « + Add line » Host/Guest. add→pending+mic ;
  delete/reorder → vidéo invalidée, audios conservés. 120 tests podcast verts ; build OK ; tsc clean.
  **⚠️ Limite V1 acceptée (Option A) — reorder non-atomique** : reindex en 2N requêtes REST (phase 1 négatifs
  `-(1e6+i)`, phase 2 positions finales), collision-free mais **non transactionnel**. Crash/timeout entre phases →
  ordre transitoirement mélangé (négatifs en tête), **sans perte de donnée, sans violation unique, audios intacts,
  render déjà invalidé** ; **auto-réparable par un nouveau reorder**. Probabilité faible (N≤10). Durcissement
  Option B (RPC transactionnel = 1 migration fonction) **différé** — à faire seulement si problème réel observé (V1.1).
- T-1132a review (claude) : OK, aucun P1/P2 — durée/style/sourceUrl réellement utilisés dans le prompt,
  scope respecté (podcast-only, pas de migration/route, autres flows intacts). Note : durations [30,60,120,300]
  (pas de 10min — choix conservateur cohérent avec le cap 6–10 tours).
- T-1132b livré (claude) — **Podcast Voice Lab**. `lib/podcast/voice-catalog.ts` (10 voix curées ElevenLabs+OpenAI,
  metadata produit id/label/provider/gender/tone/language/useCase, défauts host=rachel/guest=adam, prêt multi-provider).
  Nouvelles routes (pas de migration, colonne voice_id existante) : `PATCH /api/podcasts/[id]/speakers`
  (sauve host/guest voice, valide ∈ catalogue, **host≠guest**), `POST /api/podcasts/[id]/voice-preview`
  (synth phrase type, **cache R2 par voix**, provider jamais exposé, 503 si TTS off). UI `/create/podcast` :
  section **Voices** (sélecteurs Host/Guest, label produit + tag provider discret « hybride », preview audio réel,
  garde same-voice). Loudness : **per-segment ffmpeg loudnorm** dans `render_podcast` (fix « Adam trop fort /
  Rachel trop bas ») — patch localisé, Modal redéployé. 93 tests podcast verts ; py_compile OK ; build OK ;
  tsc clean. Google/Gemini TTS différé (catalogue prêt). **QA prod e2e OK** : section Voices rendue,
  `POST /voice-preview` 200 (audio réel), `PATCH /speakers` 200 (changement host persisté), garde same-voice
  (erreur inline, pas de persist). Loudnorm déployé (non re-rendu e2e cette session — flag ffmpeg localisé).
- T-1132a livré (Podcast setup controls, UI + prompt contract) — `app/(workspace)/create/podcast/page.tsx`,
  `app/api/podcasts/[id]/script/route.ts`, `lib/podcast/dialogue.ts`, `lib/podcast/podcast.ts` + tests.
  Ajout d'un vrai setup avant génération : durée cible (30s/60s/2min/5min), style (casual/news/expert/debate/
  documentary), langue, URL source optionnelle et distinction claire **Script engine LiteLLM** vs voix générées
  après dialogue. La route `/api/podcasts/[id]/script` valide `target_duration_seconds` + `style` et transmet
  durée/style/source URL au prompt LiteLLM. Upload script/audio reste disabled/Soon (pas de faux bouton). Aucun
  nouveau backend, aucune migration, podcast-only. Tests ciblés 30/30 verts ; build OK ; tsc clean.
  Prochaine étape recommandée : T-1132b Voice Lab (choix/preview de voix, normalisation volume).

### [T-1133] Podcast editing — `status: in_progress` · `owner: codex`
- T-1133a livré (manual line edit) — nouvelle route `PATCH /api/podcasts/[id]/segments/[segmentId]` +
  UI inline dans `/create/podcast`. L'utilisateur peut corriger une ligne du dialogue sans régénérer tout le script.
  La sauvegarde valide ownership + texte 1..600, ne fait rien si le texte est inchangé, et sinon clear le render
  **avant** de muter le segment puis remet seulement cette ligne en `pending` (`audio_url/start_ms/end_ms=null`).
  Ainsi un ancien MP4 ne peut pas rester associé à un dialogue corrigé ; l'utilisateur régénère ensuite les voix.
  Tests ciblés 25/25 verts ; build OK ; tsc clean. Pas de migration, podcast-only.
- T-1133b livré (targeted voice regeneration) — `/create/podcast` utilise la route TTS existante avec
  `{ preview: segment_id }` pour générer/régénérer une seule ligne. Le bouton global devient pending-only :
  après une correction, il génère seulement les lignes `pending` au lieu de forcer toutes les voix ; un bouton micro
  par ligne permet aussi de générer précisément la ligne corrigée. Pas de nouvelle route, pas de migration.
  Test TTS ciblé 19/19 vert ; build OK ; tsc clean.
  (T-1133c poussé ensuite par Codex `ea43dfd` ; entrée consolidée en tête de section avec la limite V1 reorder.)

### [T-1131] Podcast Video backend — `status: done` · `owner: claude`
- T-1131f-hardening-fix3 livré (review Codex, P2 cleanup) — supprimé l'appel **dupliqué** à `invalidateRender()`
  resté après la boucle d'update en full mode (`tts/route.ts`) : une seule invalidation (avant la boucle),
  plus de 2ᵉ update Supabase inutile ni de faux 500 après segments sauvés. +1 test (full ready>0 → 1 seul update
  podcasts). 74 tests podcast verts ; build OK ; tsc clean.
- T-1131f-hardening-fix2 livré (review Codex, 1 P1 transactionnel) — l'invalidation du render se fait
  **AVANT** toute mutation de segments. (1) `script` : reset `podcasts` (video_url/render_status/render_error +
  status ready) AVANT le delete/insert des segments ; si le reset échoue → 500 et **segments intacts** (ancien
  dialogue + ancien MP4 cohérents) ; puis seulement delete/insert (restore si insert échoue). (2) `tts` : preview
  → `invalidateRender()` AVANT l'update du segment ; full → invalidate AVANT la boucle d'update ; si invalidate
  échoue → 500 **sans muter aucun segment** (upload R2 orphelin accepté). Plus jamais « nouveau dialogue/audio +
  ancien MP4 » en DB. 73 tests podcast verts (tests ajustés : script reset-fail → 0 mutation segment ; tts
  full/preview invalidate-fail → 0 update segment) ; build OK ; tsc clean.
- T-1131f-hardening-fix livré (review Codex, 2 P1) — les updates qui invalident le render vérifient
  désormais `{error}`. (1) `script/route.ts` : si le reset final (status ready + video_url/render_status/
  render_error) échoue → rollback vers l'ancien dialogue (delete + re-insert `previousSegments`) + **500**
  « Failed to save the new dialogue state. Your previous script was kept. » (jamais « nouveau dialogue + ancien
  MP4 »). (2) `tts/route.ts` : `invalidateRender()` renvoie un booléen ; si `ready>0` et l'invalidation échoue
  (preview ou full) → **500** « Audio was generated but the stale video could not be cleared. Please retry. »
  (provider toujours caché ; audio déjà sauvé conservé). 73 tests podcast verts (+3 : script reset fail→rollback+500,
  tts full invalidate fail→500, tts preview invalidate fail→500) ; build OK ; tsc clean.
- T-1131f-hardening livré (invalidation des renders obsolètes) — `script/route.ts` + `tts/route.ts` +
  `create/podcast/page.tsx`. (1) `/script` : sur nouveau dialogue, reset `video_url=null`/`render_status='idle'`/
  `render_error=null` (un ancien MP4 ne reste jamais sur un nouveau script). (2) `/tts` : si ≥1 segment audio
  (re)généré (`ready>0`), même reset ; pas de reset si tout skipped. (3) UI : « Rewrite dialogue » et
  « Generate/Regenerate voices » vident l'état vidéo local (si génération effective) ; **timeout polling render
  5 min** → stop + message « Render is taking longer than expected. You can refresh… » (ne casse pas le podcast).
  70 tests podcast verts (+3 : script clear, tts clear si audio changé, tts skip-only ne clear pas) ; build OK ;
  tsc clean. Pas de migration, podcast-only, autres flows intacts.
- T-1131f livré (**UI `/create/podcast` V1 + e2e vérifié + hub live**) — `app/(workspace)/create/podcast/page.tsx`
  (page guidée : topic → dialogue → voices → render → MP4, endpoints existants seuls, bearer auth, stepper 4
  étapes, dialogue lecture seule host/guest, status par segment + preview audio, render gated sur tous ready,
  poll GET jusqu'à done/failed, `<video>` final). **QA e2e prod réelle OK** : create → 8 tours → 8 voix ready →
  render → **MP4 43s 1280×720 two-shot** (speaker actif, captions, lower-thirds, marques publiques conservées).
  **Fix runtime trouvé en QA** : Modal `render_podcast` téléchargeait l'audio R2 via `urllib` → **403** (UA bloqué
  par l'edge R2) ; remplacé par **httpx** (comme le reste du pipeline) ; Modal redéployé → render OK. Puis **carte
  hub Podcast passée « Soon »→live** (`href:/create/podcast`, overlay « Coming soon » conditionné sur status soon).
  build OK, tsc clean. V1 only : pas d'upload/édition dialogue/voice picker/split-talk (V1.1). **Série T-1131 close.**
- T-1131e-fix livré (review Codex, 2 points) — (P1 bloquant) `modal_app/video_pipeline.py` : `subprocess`
  importé dans `_podcast_probe_duration()` et `render_podcast()` (était function-local partout ailleurs, mais
  absent de mes 2 fonctions → `NameError` runtime) ; py_compile OK ; **Modal redéployé**. (P2) `app/api/podcasts/[id]/render/route.ts`
  vérifie l'`{error}` de l'update `render_status='rendering'` : si échec → log + 500 et **ne déclenche pas**
  Modal (état DB cohérent). +1 test. 36 tests render/podcast verts ; build OK ; tsc clean.
- T-1131e livré (**render/compositing two-shot**, Modal CPU) — migration
  `supabase/migrations/20260622_add_podcast_render_columns.sql` **appliquée prod** (podcasts +
  `video_url`/`render_status`(idle|rendering|done|failed)/`render_error`) ; Modal `render_podcast()` +
  webhook `/render-podcast` (`modal_app/video_pipeline.py`, **déployé**) ; `lib/modal-client.ts`
  `triggerRenderPodcast()` ; route SaaS `POST /api/podcasts/[id]/render`. Flow : route (auth+ownership 404,
  **400 si layout≠two_shot**, **400 si tous segments pas ready+audio_url**, 409 si déjà rendering) →
  set render_status=rendering → trigger Modal (spawn, payload `{podcast_id}` seul) → Modal lit
  podcast/speakers/segments **server-side**, **ffprobe** des vraies durées, **réécrit start_ms/end_ms**,
  compose two-shot (avatars placeholder, speaker actif, lower-thirds, **captions déterministes**), concat audio
  + gap, encode MP4 (libx264+aac), upload R2 → écrit `video_url`+`render_status=done` (ou failed+render_error,
  video_url inchangé). **CPU, pas de GPU, pas de lip-sync, pas d'UI, pas de débit crédit** ; provider TTS jamais
  référencé ; Story/Avatar/Research intacts. 67 tests podcast verts ; py_compile OK ; build OK ; tsc clean ;
  Modal déployé (alphogenai-v2). split_screen/talk_show = V1.1. Prochaine étape : T-1131f (UI /create/podcast).
- T-1131d-fix livré (review Codex, 3 points) — `app/api/podcasts/[id]/tts/route.ts` + tests. (1) updates
  `podcast_segments` vérifient désormais `{error}` : preview→500 propre si l'update échoue ; full→le segment
  n'est plus compté `ready` (passe `failed`) si son update DB échoue. (2) clé R2 **versionnée par génération**
  (`{segId}-{randomUUID()}.mp3`) → `force` ne sert plus un audio caché ; `audio_url` mis à jour seulement
  après upload réussi, ancien conservé sinon. (3) **host+guest requis** avant génération → 500
  « Podcast is missing its speakers » (plus de voix par défaut silencieuse). 59 tests podcast verts (4 nouveaux) ;
  build OK ; tsc clean. Pas de migration/render/UI. Prochaine étape : T-1131e.
- T-1131d livré (**multi-speaker TTS**, backend, pas de render/lip-sync) — `lib/podcast/voices.ts`,
  `app/api/podcasts/[id]/tts/route.ts` + tests. Audit validé : **schéma suffisant, aucune migration**.
  `resolveSpeakerVoices` (host/guest voix distinctes, défauts rachel/adam, respecte voice_id, collision→nudge) ;
  `estimateSegmentTimings` (start/end ms cumulés + gap 300ms, provisoires jusqu'au render). Route `POST /tts` :
  auth+ownership(404), 503 si TTS indispo, **preview** (1 segment), **force** (régénère les ready), full
  (génère pending/failed/sans audio, **skip ready** sauf force), `generateVoiceover` (ElevenLabs→OpenAI fallback)
  → `uploadBufferToR2(audio/podcast/{id}/{segId}.mp3)` → update segment `audio_url`+timings+`status=ready`.
  Échec segment : retry 1×, `status=failed`, **garde l'ancien audio_url** (non-destructif), n'abort pas les autres ;
  **podcasts.status jamais passé à failed** pour un échec audio (état au niveau segment). `maxDuration=60`, cap 10.
  **Provider jamais exposé** (`{ready, failed, skipped, segments}`). 55 tests podcast verts ; build OK ; tsc clean.
  Pas de migration, pas de render/lip-sync, pas d'UI, carte hub « Soon ». Prochaine étape : T-1131e (render/compositing).
- T-1131c-fix livré (review Codex, 4 points) — `lib/podcast/dialogue.ts`, `app/api/podcasts/[id]/script/route.ts`
  + tests. **P1** prompt : ne plus interdire toutes les marques ; n'interdire que les providers/infra internes
  AlphoGen sauf si le sujet les demande explicitement. **P2** scrubber : blocklist réduite aux seules infra
  internes confidentielles (heygen/byteplus/atlascloud/evolink/bailian/kie.ai/litellm) — OpenAI/Seedance/Kling/
  Wan/LTX/ElevenLabs ne sont plus censurés ; scrub désormais **conditionnel** (un terme présent dans le topic
  utilisateur est conservé). **P3** alternance : `validatePodcastSegments` refuse >2 tours consécutifs du même
  speaker (host,host,host,guest,guest,guest échoue) + 2 tests. **P4** régénération non-destructive : snapshot des
  anciens segments avant delete ; si l'insert échoue → restauration des anciens + status failed (REST, pas de
  transaction multi-statement) + test. 38 tests podcast verts ; build OK ; tsc clean. Pas de migration, pas de
  TTS/render, carte hub reste « Soon ». Prochaine étape : T-1131d (multi-speaker TTS).
- T-1131b+c livré (**schema + dialogue generator**, backend, fusionnés) — migration
  `supabase/migrations/20260622_create_podcast_schema.sql` **appliquée en prod** (projet qbrpzmuedfugbhoeytdj) :
  `podcasts` / `podcast_speakers` / `podcast_segments`, RLS owner (enfants via join podcasts), indexes +
  uniques (role, order_index), trigger updated_at. API : `POST/GET /api/podcasts`, `GET/PATCH /api/podcasts/[id]`,
  `POST /api/podcasts/[id]/script`. Auth bearer (`lib/podcast/auth.ts`, user_id toujours du token), service-role
  pour les requêtes, ownership strict (404 non-owned). POST crée le draft + **2 speakers par défaut** (host/guest).
  Script : topic (body ou source_topic) → prompt → **LiteLLM gateway** (`lib/podcast/dialogue-llm.ts`, PAS Anthropic
  direct) → parse/normalize/validate (`lib/podcast/dialogue.ts` : fences ```json, wrapper/array, 6–10 turns,
  alternance host+guest, caps longueur, **scrub provider names**) → delete+insert segments → status ready ;
  échec → status failed + error_message ; **aucun TTS/audio, aucun render**. Tests : 34 (helpers + routes :
  auth requise, 2 speakers créés, ownership 404, insert segments, JSON LLM invalide→failed, scrub providers).
  build OK, tsc clean. **Pas de `/create/podcast`, carte hub reste « Soon »** (base backend, pas un produit user).
  Note : 1 test pré-existant `app/api/jobs/[id]/voiceover/route.test.ts` échoue (mismatch message d'erreur mux,
  hors scope, non touché par ce ticket). Prochaine étape : T-1131d (multi-speaker TTS).
- T-1131-poc livré (**prototype compositing jetable, off-prod**) — `scripts/poc/podcast/segments.json` +
  `build_poc.py`, rapport `docs/product/podcast-compositing-poc-report.md`. MP4 local two-shot 1280×720
  16:9 24fps H.264+AAC, 34,5 s, ~13 s de rendu CPU (PIL frames + numpy audio placeholder + ffmpeg de
  `imageio_ffmpeg` ; aucun TTS provider, aucun réseau, aucun coût). Valide : layout two-shot lisible,
  alternance Host/Guest claire, speaker actif identifiable (bordure couleur + panneau éclairci + waveform +
  lower-third), captions déterministes exactes, mux audio. Timeline = liste de « clips » par segment →
  extensible lip-sync (le clip statique serait remplacé par un clip lip-syncé, même contrat). Reco :
  **hybride voice-first d'abord** (cheap/rapide/crédible, pas de GPU), lip-sync en `render_mode` premium
  plus tard. MP4/intermédiaires NON commités (`tmp/` ajouté au `.gitignore`). Aucun changement prod ;
  `/create/podcast` non créé. Prochaine étape : T-1131b (schema).
- T-1131a livré (**backend spec docs-only**) — **`docs/product/podcast-video-backend-spec.md`**.
  Audit des briques réutilisables (TTS mono `lib/tts.ts`, lip-sync HeyGen, **mux audio→vidéo existant**
  `app/api/jobs/[id]/voiceover`, Modal pipeline, post-prod overlay/captions, `lipsync-cost`) ; architecture
  V1 (pipeline 9 étapes : dialogue → speaker assign → TTS/segment → timeline → visuel/speaker → compositing
  → mux → upload → job page) ; **reco moteur : Option B voice-first** (multi-speaker audio + speakers cadrés,
  pas de lip-sync exact) en V1, **Option A lip-sync** en upgrade V1.1 sur le **même** contrat timeline/compositing ;
  data model proposé (podcasts/podcast_speakers/podcast_segments/podcast_renders, RLS owner) **non appliqué** ;
  API contract (POST/GET/PATCH /api/podcasts + /script /tts /render, `render.confirm` = seul point de débit) ;
  failure model (jamais render/débit sans confirmation ; fallbacks TTS/lip-sync sans abort) ; cost model V1 ;
  découpage T-1131a..f ; non-goals (pas de live, pas de 3+ speakers, pas de fake lip-sync, pas de route UI
  avant backend). Docs-only : aucun runtime/migration/UI ; `/create/podcast` non créé ; flows existants intacts.

### [T-1130] Guided Creation Hub — `status: in_progress` · `owner: claude`
- T-1130f livré (Visual guided flow pass, **UI-only**) — `app/(workspace)/create/page.tsx`,
  `create/url/page.tsx`, `create/[mode]/page.tsx`. **P1 Hub** : blocs gradient abstraits remplacés par
  des mini-illustrations métier inline-SVG par carte (Story clap+frames, URL page→vidéo, Avatar
  tête+waveform+script, UGC phone+produit+cœur, Explainer slide+captions, Podcast 2 micros + « Coming
  soon »). **P3 /create/url** : vraies vignettes d'exemple (mocks page produit/article/docs) au lieu des
  gradients + overlay de loading guidé (Analyze URL → Collect media → Write script → Open plan) ; même
  `POST /api/research/jobs`. **P2 /create/story** : bouton « Add visual references » visible dans la zone
  de brief (story-only, ouvre le panneau références existant). Aucun backend/route/DB/migration ; handlers
  de génération inchangés ; Product/Social intacts. build OK puis tsc clean (/create 3,38 kB, /create/url
  5,83 kB, /create/[mode] 37,1 kB). QA prod Claude-in-Chrome : 6 cartes visuelles OK + podcast non-cliquable ;
  url vignettes + overlay 4 étapes + vrai job `16b0c2a3…` créé & nav /research/[id] ; story bouton ouvre le
  panneau (chip « Text with Reference » activée) ; product sans chips/bouton, Generate conservé.
  Note QA : framer-motion (opacity d'entrée) est throttlé sous automation (rAF gelé) → vérifs via
  textContent + override `!important` ; comportement réel utilisateur OK.
- T-1130e livré (Podcast — **Option B docs-only** validée par Paul) — **`docs/product/podcast-video-guided-flow-spec.md`**.
  Mini-audit read-only : **aucune brique podcast réelle** (pas de route `/create/podcast`, pas de script
  dialogue multi-speaker — `lib/research/script.ts` est mono-voix, pas de TTS multi-speaker — `lib/tts.ts`
  = 1 texte→1 voix, pas de layout two-shot/split/talk-show — `VALID_ENGINES` tous mono-sortie, pas de
  render/compositing podcast, pas de DB). Donc Option C écartée, pas de fausse page. Spec docs-only décrit
  l'UX cible (entry « Turn your ideas into podcasts » : Generate script / Upload script or audio, input
  central, trending/exemples, podcasts récents ; editor : speakers/layouts à gauche, dialogue host/guest
  à droite, voix par speaker, Render) + les gaps backend + découpage futur **T-1131a..f** (spec backend,
  schema, script dialogue, TTS multi-speaker, render/compositing, UI). **Aucun runtime**, `/create/podcast`
  non créé, carte hub reste « Soon » (non-cliquable, sans href) jusqu'à T-1131f. Flows existants intacts.
  Série T-1130 close (a→e).
- T-1130d livré (Avatar guided polish, **Option A** validée par Paul) — **`app/(workspace)/create/avatar/page.tsx`**.
  Polish **UI-only** de la page existante (pas de refonte) : **stepper visuel 3 étapes** en haut
  (1 Select avatar · 2 Modify script · 3 Voice & render) dérivé de l'état du formulaire existant
  (coche verte quand l'étape est faite) ; libellés mode en clair (**Presenter** = « Talking head from a
  photo », **Cinematic** = « Cinematic shot + lip-sync ») + une phrase d'explication courte selon le mode.
  **Aucun** backend / route / migration ; HeyGen avatars, voix, clone voice, looks, lip-sync, jobs **intacts**
  (handlers préservés). Pas d'AI writer ni toggle sous-titres (auraient nécessité du backend → hors scope).
  build OK puis tsc clean (ordre Codex). QA prod Claude-in-Chrome (compte premium) : page rendue,
  stepper présent + réactif (sélection avatar → étape 1 cochée + « Avatar ready »), 10 avatars HeyGen +
  8 voix chargés, toggle Presenter/Cinematic met à jour hints + description, bouton Generate présent.
  Reste T-1130e (Podcast).
- T-1130c livré (URL to Video guided entry, Option A) — nouvelle page **`app/(workspace)/create/url/page.tsx`**
  centrée et épurée : grand titre, champ URL unique + CTA **« Create video »**, **Try example**,
  3 minidiapos d'exemple (Product page / Article / Docs → préremplissent l'URL + l'intention),
  chips d'intention simples (Product / Tutorial / News), lien discret **« Open Research Studio »**.
  **« Create video »** appelle la route EXISTANTE `POST /api/research/jobs` (URL en `input_url`,
  topic auto + durée selon intention) puis handoff vers `/research/[id]` — **vrai** research_job,
  pas de mock. **« No URL? Upload product media manually »** ouvre une petite modale qui route vers
  le studio Product/UGC existant (`/create/product`, upload média réel) — pas de backend upload neuf.
  Le hub `/create` pointe désormais URL to Video vers `/create/url` (au lieu de `/research`).
  **UI-only** : aucune route handler/API/DB neuve, aucune migration, aucun pipeline ; Research Studio
  (`/research`) + watchlists **intacts**. tsc + build OK (/create/url 4,65 kB static). QA prod
  Claude-in-Chrome OK : hub→/create/url, Try example, miniature (URL+mode), modale→/create/product,
  Create video crée le job `0bf65257…` (mode=product, input_url, topic auto, 30s) + nav /research/[id],
  /research avancé intact. Reste T-1130d (Avatar), T-1130e (Podcast).
- T-1130b livré (couche guidée story-only, option 1 validée par Paul) —
  `app/(workspace)/create/[mode]/page.tsx` : rangée de chips **« How do you want to start? »**
  gardée par `mode === "story"` → **Text to Video** / **Text with Reference** (badge compteur de
  références) / **Director scenes**, câblée sur l'état EXISTANT (`setShowReferences`,
  `setDirectorOpen`, `storyTab`). Aucune nouvelle logique de génération ; handlers/submitJob
  intacts. Header story déjà conforme (« Story Video » / « Describe a narrative scene… »),
  Advanced reste replié, AI Director accessible. **product/social non touchés** (chips gardés
  story-only). Aucune route/API/DB/migration, aucun backend. tsc + build OK (/create/[mode]
  36,9 kB). QA : /create/story + non-régression /create/product & /create/social via
  Claude-in-Chrome après déploiement. Reste T-1130c (URL to Video), T-1130d (Avatar), T-1130e (Podcast).
- T-1130a livré (UI/navigation only) — `app/(workspace)/create/page.tsx` refait en **hub guidé**
  fidèle au mockup `mockups/alphogen-guided-flows-v2.html` : header « Create a video » + grille de
  **6 cartes visuelles** (mini-visuels gradient, design blanc/soft, accents bleu/cyan). Story /
  Cinematic = **carte featured** (sombre, première, badge Core) → /create/story. Autres : URL to
  Video → /research, Avatar → /create/avatar, Product/UGC → /create/product, Explainer → /research
  (badge Low cost), Podcast → **Soon** (disabled, pas de route). États hover + disabled/Soon.
  Retiré : Advanced Tools / AI Playground / Start-from-scratch / Recent Projects (évite la
  page-dashboard) ; pas de bloc noir Research, pas de watchlists/recent research. Réutilise les
  routes existantes ; **aucune** route/API/DB/migration/pipeline. tsc + build OK (/create 2,13 kB).
  **Vérifié fonctionnel en prod (Claude-in-Chrome)** : chaque carte branchée → vrai flow
  (/create/story, /create/avatar, /create/product=UGC réel, /research) ; Podcast = seule
  carte disabled. Pas de carte cliquable vide. Flows détaillés = T-1130b/c/d.

### [T-1120] Premium UI — Research / Explainer / Render Studio — `status: done` · `owner: claude`
- Tier B livré (persistance working copy, autorisé par Paul) : migration prod (colonne
  `research_jobs.working_storyboard jsonb`, via Supabase MCP) + route PUT
  `/api/research/jobs/[id]/working-storyboard` (sanitisée) + autosave débouncé dans le Studio
  (indicateur Saving…/Saved) + seed du Studio depuis le brouillon persisté ; `research_storyboards`
  intact ; coût ~0 €. tsc + build + 27 tests OK. E2E prod (survie reload) à vérifier post-déploiement.
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
- T-1120f livré — QA via Claude-in-Chrome sur la prod (plan approuvé) : Home/Plan
  Review/Render panel/preview/Studio **vérifiés** (édition Studio → preview se met à jour ;
  accès cross-frame OK ; pas d'erreur app en console). Fix robustesse : ExplainerPreview
  pilote la lecture depuis l'**horloge du parent** (rAF parent → `tl.time(t)`) au lieu du
  ticker GSAP de l'iframe (fragile/throttlé). Fluidité temps-réel non confirmable en
  automation (rAF global throttlé) — OK pour un vrai utilisateur. **E2E « Render these
  edits » réussi** : édition → POST storyboard édité → rendu Modal (~95s) → MP4 en page Job
  + **Library** (job 8314b207). T-1120 (b/c/c-polish/e/preview-spike/d 1-3 + render-edits/f)
  complet.
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


## T-1144a — Podcast talking-duo base clip render (2026-07-05, Claude)
- FAIT : render_podcast branche les base clips 1:1 ready (frames animées bouclees dans les speaker cards), fallback statique, sans HeyGen/credit/migration/UI. py_compile+tsc+test 852+build OK. Push -> auto-deploy Modal. QA prod ensuite.
- NON fait : lip-sync par segment, cout HeyGen au render, render_mode UI.


## T-1144b-lite — Render mode UI + disclosure (2026-07-05, Claude) — FAIT
- metadata.render_mode (static/talking_visual/lipsync_premium), défaut talking_visual.
  static bypass base clips dans render_podcast ; lipsync_premium visible mais disabled.
  Copy UI explicite (talking visual ≠ lip-sync exact). Aucun crédit/appel provider/migration.
  Validé tsc+vitest+build+deploy Modal ; QA prod e531f932 : logs confirment static bypass
  vs talking_visual base clips host=yes guest=yes. Commit 768fedc.
- Suite recommandée : mini-gate lip-sync 1 segment (qualité/délai/coût réel) → T-1144b
  complet (lip-sync par segment actif, cache, fallback T-1144a, activation lipsync_premium).

## T-1147a - Podcast lip-sync provider benchmark framework (2026-07-07, Codex) - DONE
- Added docs/product/podcast-lipsync-provider-benchmark-spec.md: provider-neutral benchmark gates, candidate notes (HeyGen baseline, Descript workflow reference, BytePlus, Google, OpenAI, open-source), sequence T-1147a-e, and decision rules before any provider switch.
- Added lib/podcast/lipsync-provider-benchmark.ts: pure scoring helper for quality, cost, latency, API/cache/consent fit, and integration effort. Includes HeyGen baseline benchmark data.
- Added lib/podcast/__tests__/lipsync-provider-benchmark.test.ts: baseline, cheaper candidate, reject gates, integration penalty, sort order.
- Scope: no UI, no route, no Modal, no provider call, no spend. Next: T-1147b adapter interface wrapping current HeyGen calls without changing behavior.


## T-1147b - Podcast lip-sync provider adapter (2026-07-08, Codex) - DONE
- Added lib/podcast/lipsync-provider.ts with `PodcastLipsyncProvider`, `heygenPodcastLipsyncProvider`, and `getPodcastLipsyncProvider()`.
- Refactored `/api/podcasts/[id]/lipsync` to call the provider adapter for create/poll while preserving the current HeyGen behavior, cache rows, caps, cleanup, and fallback semantics.
- Added lib/podcast/__tests__/lipsync-provider.test.ts. No UI, no provider switch, no Modal, no provider calls, no spend.
- Next: T-1147c admin benchmark harness for real candidate comparisons under a hard spend cap.


### [T-1147c] Admin lip-sync benchmark harness - `status: done` ? `owner: codex`
- Added admin-only experimental route `POST /api/admin/experiments/podcast-lipsync-benchmark` with `start`/`poll`/`score`. One clip per run, hard spend cap, completed outputs copied to R2, no product DB rows, no UI.


### [T-1147d] Provider comparison report - `status: done` ? `owner: codex`
- Added `docs/product/podcast-lipsync-provider-comparison-report.md`: HeyGen remains the baseline; Descript is workflow inspiration, Google/OpenAI/BytePlus are watchlist/use-case-specific, and self-hosted lip-sync is the next benchmark candidate.

### [T-1147e] Self-hosted lip-sync feasibility spec - `status: done` ? `owner: codex`
- Added `docs/product/podcast-self-hosted-lipsync-feasibility.md`: defines the no-switch feasibility path for open-source/self-hosted lip-sync, candidate families, drop-in contract, acceptance gates, and the recommended T-1147e1 Modal GPU one-clip spike.
- Scope: docs/spec only; no provider call, no GPU run, no UI, no route, no product switch, no spend.


## URL→Video V1 (Jogg) — 2026-07-16, Claude — DONE (GELÉ, validé prod)
- Livré + gelé : `lib/jogg-client.ts`, `app/api/admin/experiments/url-to-video`,
  `app/api/cron/jogg-poll`, step Jogg dans `evolink-cron.yml`, docs `docs/decision-books/url-to-video-v1*.md`.
- Commit feature `2c760e3`, gel docs `6292f95`. Job prod `75c17c27-...-b1922a` = done, MP4 R2 valide.
- Env : `JOGG_API_KEY` ajoutée Vercel prod. Admin-only, "Jogg" jamais exposé UI publique.
- Détails complets + relais : voir `agent/log.md` (entrée 2026-07-16 "BILAN CTO / RELAIS CODEX").
- Backlog V2 (non commencé) : Avatar Video verbatim, webhooks, UI publique, overlay T-1111.
- P0 business avant ouverture payante : plan Advanced + compte prod confirmé + CGU Jogg.

## Prochain workflow — Publication → benchmark Postiz — TODO
- Ouvrir un nouveau Decision Book (open-source, self-hostable, API). Un workflow à la fois.


## URL→Video V1 — lot "AVANT OUVERTURE PAYANTE" — 2026-07-16, Claude — TODO (nouveau GO requis)
Durcissements robustesse/charge issus de la revue Codex. **Ne PAS implémenter sans nouveau GO.**
Bêta fermée admin-only OK sans eux ; **requis avant tout trafic client payant.**
- [ ] **DB-first reservation + reprise des orphelins** (Codex P1 #2) : insérer la ligne `jobs` (`pending`) AVANT l'appel Jogg, puis stocker `external_task_id` ; si l'appel Jogg échoue → `failed`. Ajouter une reprise des jobs restés sans `external_task_id` (génération dépensée mais non suivie).
- [ ] **Quota atomique** (Codex P1 #3) : compter TOUTES les soumissions (y compris `failed`, qui peut avoir consommé un crédit) + réservation atomique côté DB pour empêcher le dépassement du plafond en concurrence (le `count → appel` actuel n'est pas atomique).
- [ ] **Poller batché** (Codex P1 #4) : borner le nombre de jobs traités par run + concurrence limitée + budget temps < `maxDuration` (éviter le timeout en plein download quand plusieurs jobs sont actifs).
- [ ] **Couverture tests complète submit/status/poll/idempotence** : validation d'entrée, quota, échec provider, transitions poll, idempotence bout-en-bout (l'auth cron + parsing + persistance poller sont déjà couverts par le lot quick-wins).
Réfs : revue Codex 2026-07-16 ; `agent/log.md` (entrée durcissement).
## T-1164c - Directed Product Ad quality path - CODE READY (2026-07-30, Codex)
- Versioned the shot pack to V2 and removed product generation from both creator shots. The product demo is anchored to one exact first frame and uses full Seedance 2.
- Added deterministic French narration, captions and CTA before paid generation; the Revideo manifest owns voice, copy, branding and timing.
- Added an admin `directed_edit` control that starts and polls the three-shot pack and exposes the three permanent outputs plus manifest readiness.
- Validation: 12 focused tests, root TypeScript, Revideo worker TypeScript and production build pass. Zero paid generation in this slice.
- Next: deploy an authenticated Revideo service on Hostinger, then run one capped three-shot Beats QA. Do not repeat native one-shot QA.
- Worker service is code-ready: async private API, concurrency 1, direct R2 output, Next.js start/poll integration and local security smoke pass. Deployment requires `REVIDEO_WORKER_SECRET` plus existing R2 variables on Hostinger and matching worker URL/secret on Vercel.
