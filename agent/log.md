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

## 2026-06-08 — Claude (Opus 4.8) — T-301a addendum : réutiliser SceneTimeline/ScenePanel
- Audit (read-only, correction de cadrage Codex) : la page job utilise DÉJÀ
  `components/editor/SceneTimeline.tsx` (board read-only complet : strip, thumbs,
  statuts, prompt, durée, seek, progress ; aucun modèle/provider) + `ScenePanel.tsx`
  (détail + prompt éditable + Save PATCH / Regenerate POST).
- Addendum docs-only à `scene-board-runtime-spec.md` (§9) : **ne pas créer de doublon** ;
  T-301b = réutiliser/évoluer ces composants ; board read-only ; garder Save (tous
  moteurs) ; **gater Regenerate** (R-010) ; `ScenePanel` libellé « Engine »→« Model » +
  `cleanModelName` (R-011) ; optionnel `lib/scene-status.ts` pur + test.
- Risques notés : R-010 (regen non gaté), R-011 (libellé/clé ScenePanel).
- **Docs-only** ; aucun code.
- Fichiers : `docs/product/scene-board-runtime-spec.md`, `agent/tasks.md`,
  `agent/log.md`, `agent/review.md`.

## 2026-06-08 — Claude (Opus 4.8) — T-301a : spec Scene Board runtime (docs-only)
- Inspecté (read-only) : `app/jobs/[id]/page.tsx` (scenes live déjà fetchées+mergées,
  failedScenes/doneScenes/hasRetryableScenes, retry-scenes, seek par scène),
  `retry-scenes/route.ts` (retry all failed, job failed), `scenes/[i]/route.ts`
  (PATCH prompt + POST regen single-scene EvoLink/Bailian only).
- Écrit `docs/product/scene-board-runtime-spec.md` : V1 = read-only + statuts live +
  retry failed + modèle provider-clean ; pas d'édition runtime (V2) ; composants
  (`scene-board.tsx`, `scene-card.tsx`, `lib/scene-status.ts`), endpoints existants,
  risques (R-010 : regen single-scene multi-provider non supporté), tests, découpage
  T-301a/b/c/d. R-009 gardé séparé.
- **Docs-only** ; aucun code/route/DB.
- Fichiers : `docs/product/scene-board-runtime-spec.md`, `agent/tasks.md`,
  `agent/log.md`, `agent/review.md`.
- Prochaine étape : sur validation spec → T-301b (SceneBoard read-only).

## 2026-06-08 — Claude (Opus 4.8) — T-202 fix P2 : risk sur les prompts de scènes
- Bug Codex (P2) : `computeDirectorQuality` n'analysait que `input.prompt`, alors que
  depuis T-201c les prompts envoyés sont `directorScenes[].prompt` → une scène éditée
  bloquée/warn pouvait rester « Good ».
- Fix : `DirectorQualityInput.scenes` porte maintenant `prompt?` ; le screening utilise
  `scenes.map(s=>s.prompt).filter(...).join("\n")` quand présent, sinon fallback
  `input.prompt`. (Cost/social/time inchangés.)
- Test (+1) : prompt original clean + scène bloquée → `risky` ; scène avec age-word →
  `medium` ; fallback original sans prompt de scène. Anti provider-leak toujours vert.
- **UI-only / helper pur** ; aucune route/API/DB. tsc · build · lint · **235 tests** verts.

## 2026-06-08 — Claude (Opus 4.8) — T-202 : quality/cost score réel (helper pur + réactif)
- Fait : `lib/director-quality.ts` (`computeDirectorQuality`, pur) — `QualityReadout`/
  `QualityTone` déplacés ici, le panel les ré-exporte. Branché : `screenPrompt`
  (prompt risk), `estimateBytePlusCost`+`SEEDANCE_USD_PER_MTOKEN` (cost sur somme des
  durées éditées), `faceCompat`/`uploadCompat` (model compat), aspect+durée (social).
- Page : `directorQuality` = `useMemo` (recalcul à chaque édition de scène) ;
  `buildDirectorPlan` ne renvoie que les scènes ; `engineCompat` wrappé en `useMemo`
  (corrige le warning exhaustive-deps).
- Test : `lib/__tests__/director-quality.test.ts` (+8) incl. cas **anti provider-leak**.
- **UI-only / helper pur** ; aucune route/API/DB/state machine. R-009 non traité.
- Fichiers : `lib/director-quality.ts`, `lib/__tests__/director-quality.test.ts`,
  `components/create/ai-director-panel.tsx`, `app/(workspace)/create/[mode]/page.tsx`.
- Tests : `tsc` clean · `vitest` **234/234** · `lint` clean · `build` OK.

## 2026-06-08 — Claude (Opus 4.8) — T-605b : provider-leak cleanup page job (review OK)
- Contexte : review visuelle utilisateur **OK** (flux Director → job créé/terminé). Capture
  montrait « Provider Credits / EvoLink balance / Top up on EvoLink » + clé brute
  « Engine: seedance2_byteplus ».
- Fait (UI-only) : `app/jobs/[id]/page.tsx` — « Provider Credits »→« Generation Credits »,
  « EvoLink balance »→« Credit balance », « Top up on/ {label} »→« Top up credits » (×2,
  url conservée). `components/job/JobCostBadge.tsx` — affiche
  `cleanModelName(getEngineDisplayName(engine))` (ex. « Seedance 2.0 (Direct) ») + label
  « Model: » au lieu de « Engine: <clé brute> ».
- Gating confirmé : tous ces blocs sont **admin-only** ; nettoyés quand même. Reste
  uniquement des URLs dashboard (hrefs admin) + champ `label` non rendu dans
  `PROVIDER_TOP_UP`. Guard test non étendu (rendu JSX non trivial à tester) — le guard
  existant couvre déjà getEngineDisplayName/cleanModelName utilisés par JobCostBadge.
- **Aucune route/API/DB/state machine.** tsc clean · vitest 226/226 · lint clean · build OK.
- Prochaine étape : **T-202** (review OK reçu).

## 2026-06-08 — Claude (Opus 4.8) — Préparation T-202 (read-only, plan ; aucun code)
Helpers lus : `content-policy.ts` (`screenPrompt(prompt) → {blocked, findings[]}`,
findings level block/warn + message), `byteplus-cost.ts`
(`estimateBytePlusCost(res, durSec, {fps,usdPerMToken}) → {costUsd,…}` ;
`SEEDANCE_USD_PER_MTOKEN`), `engine-intentions.ts` (`faceCompat`/`uploadCompat`/
`cleanModelName`), `types.ts`. Inspecté `buildDirectorPlan()` + `QualityReadout`.

**Plan d'implémentation T-202 (à exécuter APRÈS « review OK »)** :
- Nouveau helper pur **`lib/director-quality.ts`** : `computeQuality(input) → QualityReadout`
  (déplacer le type `QualityReadout` ici, l'`ai-director-panel.tsx` l'importera).
  Input : `{ prompt, scenes[], hasFace, hasRawImage, engineCompat, selectedEngineKey, aspectRatio }`.
  Logique (remplace les heuristiques mock) :
  1. **prompt clarity/risk** ← `screenPrompt(prompt)` : `blocked`→risky « Review prompt » ;
     `warn`→medium (code/msg) ; sinon longueur → Good/Okay/Thin.
  2. **cost** ← somme des `durationSec` des scènes (reflète les éditions) ; si moteur
     Seedance (clé ∈ SEEDANCE_USD_PER_MTOKEN ou inclut seedance/byteplus/atlas) →
     `estimateBytePlusCost(res, totalDur, {usdPerMToken})` → `~$X` ; sinon « Estimated after plan ».
  3. **model/reference compat** ← `faceCompat`/`uploadCompat(engineCompat)` + présence @face
     (labels déjà provider-neutres).
  4. **social fit** ← `aspectRatio` + durée totale : 9:16 → « TikTok/Reels OK » (medium si
     totalDur > ~180s) ; 1:1 → « Square/Feed » ; 16:9 → « Landscape/YouTube ».
  - character (High/Medium/None) + time (`~n–2n min`) déplacés dans le helper.
- **Réactivité** : recalculer `directorQuality` quand `directorScenes` change (les
  éditions mettent à jour cost/social/risk en direct) — dérivé en render ou `useMemo`.
- (Option) surfacer une **note de risque** issue de `screenPrompt` dans le panneau.
- **Test** : `lib/__tests__/director-quality.test.ts` (tons ; cost présent pour Seedance ;
  social fit par aspect ; **aucun nom provider** dans les labels).
- Contraintes : helper **pur**, **UI-only**, pas de route/API/DB, providers confidentiels.
  Risque faible (la génération T-201c reste intacte ; seuls les libellés du read-out changent).

## 2026-06-08 — Claude (Opus 4.8) — Review Director : boot OK + vérif code (auth bloquante)
- Dev : `npm run dev` OK. `/create/story` → 307 (auth gate, **pas de 500 ni d'erreur de
  compilation**) ; `/login` → 200 ; **zéro erreur** dans le log dev.
- **Limite** : la passe visuelle *authentifiée* nécessite un login que je ne réalise pas
  (saisie de mot de passe = action que je ne fais pas ; pas d'identifiants). → à faire
  par un humain/Codex connecté.
- Vérif **par revue de code** des 5 points :
  1. Intégration : `AIDirectorPanel` rendu dans la colonne principale (form), avant le CTA. ✓
  2. Lisibilité desktop/mobile : quality read-out `flex flex-wrap`, scene cards pleine
     largeur empilées, actions `flex flex-wrap`. ✓ (structurel)
  3. Édition prompt (textarea) + durée `min=3/max=10` + clamp [3,10]. ✓
  4. Skip path `Generate Video` (type=submit) conservé ; « Plan with AI Director »
     uniquement quand le panneau est fermé. ✓
  5. `Generate now` → `submitJob({ directorScenes })` → body `scenes[]` (chemin
     clientScenes backend). ✓ **par code** ; la création réelle du job reste à
     confirmer en session authentifiée.
- Aucun code modifié pendant la passe.

## 2026-06-08 — Claude (Opus 4.8) — T-201c : cleanup commentaires obsolètes (review Codex)
- Fait (comments-only, zéro runtime) : en-tête `ai-director-panel.tsx` → « editable
  pre-generation plan panel » + mention submit câblé par la page ; `page.tsx` :
  « mock/static preview » → « edited plan » (état + bloc JSX + commentaire builder) ;
  « mock no-op » → « local no-op ». R-009 laissé ouvert (pas de mapping auto Director).
- Fichiers : `components/create/ai-director-panel.tsx`, `app/(workspace)/create/[mode]/page.tsx`.
- Tests : `tsc` clean · `vitest` 226/226 · `lint` clean.

## 2026-06-08 — Claude (Opus 4.8) — T-201c : plan Director → génération (scenes[])
- Fait (UI-only) : `submitJob({ directorScenes? })` extrait de `handleSubmit`. Form
  `Generate Video` inchangé (`submitJob()` sans scènes). « Generate now » du Director →
  `submitJob({ directorScenes })` → body `scenes:[{prompt, duration_sec clamp[3,10],
  ...(selectedEngine!=="auto" && {engine})}]` (jamais `engine:"auto"`). Panel durée
  min3/max10 + clamp ; durées initiales clampées ; texte preview-only retiré/reformulé.
- **Aucune modif** route jobs/DB/migration/state machine/Modal/Stripe/auth. Providers
  confidentiels OK. Backend clientScenes (`:681-692`) consommé tel quel.
- Note R-009 : auto + Director → fallback engine `wan_i2v` côté backend (faible).
- Fichiers : `app/(workspace)/create/[mode]/page.tsx`, `components/create/ai-director-panel.tsx`.
- Tests : `tsc` clean · `vitest` 226/226 · `build` OK · `lint` clean.

## 2026-06-08 — Claude (Opus 4.8) — Déblocage dev local (review visuelle Codex)
- Symptôme : `/create/story` → 500 en dev (`lib/supabase/middleware.ts` : « URL and
  Key are required »). Cause : le `.env.local` réel (gitignored) ne contenait que les
  7 vars R2, **aucune var Supabase** (le `.env.example` committé les liste pourtant).
- Fix : ajout dans `.env.local` (gitignored, non commité) de `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY` —
  valeurs **publiques** (clé anon/publishable récupérées via Supabase MCP get_project_url
  / get_publishable_keys). **JAMAIS** la `SUPABASE_SERVICE_ROLE_KEY`.
- Vérif : `npm run dev` → `/create/story` renvoie **HTTP 307** (redirige `/login`,
  pas de session) = client Supabase OK, plus de 500. Dev server arrêté ensuite.
- **Aucun code applicatif touché** ; aucun secret commité (`.env.local` gitignored ;
  les valeurs ajoutées sont des clés publiques navigateur).
- Note pour Codex : si tu lances un autre checkout, copie `.env.example` → `.env.local`
  et renseigne les vars Supabase publiques (mêmes noms).

## 2026-06-08 — Claude (Opus 4.8) — Décision mapping Director→génération (pré-T-201c)
- Fait : `docs/product/director-plan-mapping-decision.md` après inspection read-only
  de `app/api/jobs/route.ts`. **Découverte** : le backend accepte déjà un tableau
  `scenes[]` (`:101`, `:129-130`, `:681-692`, « Phase C: editor-provided scenes »)
  qui alimente le même storyboard + state machine, avec validation serveur
  (cap MAX_SCENES[plan], duration clamp [3,10], prompt ≤2000).
- **Décision : Option B** (envoyer les scènes éditées) — zéro modif backend/state
  machine, fidèle au plan éditable. Option A (prompt unique re-splitté) rejetée.
  Résout R-008 ; cadre T-201c (mapping UI-only).
- **Docs-only** ; aucun code modifié.
- Fichiers : `docs/product/director-plan-mapping-decision.md`, `agent/tasks.md`,
  `agent/log.md`, `agent/review.md`.
- Tests : (validation ci-dessous).

## 2026-06-08 — Claude (Opus 4.8) — T-201b : AI Director mock panel
- Fait : `components/create/ai-director-panel.tsx` (mock/static) + câblage page
  (`buildDirectorPlan`, état directorOpen/scenes/quality, bouton « Plan with AI
  Director », actions locales). Quality read-out + scene cards éditables + 6 actions
  de direction (mutent le mock). Skip path `Generate Video` intact. Providers
  confidentiels (cleanModelName). Note R-008 : plan édité = preview-only (→ T-201c).
- **UI-only** : aucune route/DB/POST /api/jobs/state machine/Stripe/auth/Modal.
- Fichiers : `components/create/ai-director-panel.tsx`,
  `app/(workspace)/create/[mode]/page.tsx`.
- Tests : `tsc` clean · `vitest` 226/226 · `build` OK · `lint` clean.
- Prochaine étape : review Codex UX, puis T-201c (connect storyboard) après décision archi.

## 2026-06-08 — Claude (Opus 4.8) — T-201a : spec AI Director (+ fix compteur HANDOVER)
- Fait : `docs/product/ai-director-spec.md` (spec-only) — UX flow (Plan with AI
  Director, storyboard éditable, actions Generate/Improve/Cinematic/Realistic/
  TikTok/Keep character), data par scène, quality score (réutilise content-policy/
  byteplus-cost/engine-intentions), contraintes (pas de state machine, pas de DB,
  providers confidentiels), découpage T-201a/b/c + T-202 + T-301, non-goals.
- Fix mini-suivi Codex : HANDOVER Quick start `220+ tests` → `226 tests`.
- **Docs-only** ; aucun code/route/DB.
- Fichiers : `docs/product/ai-director-spec.md`, `HANDOVER.md`, `agent/tasks.md`, `agent/log.md`.
- Tests : (validation ci-dessous).
- Prochaine étape : sur validation de la spec → T-201b (UI mock/static).

## 2026-06-08 — Claude (Opus 4.8) — T-601 fin : README court + HANDOVER status
- Fait : `README.md` remplacé par une version courte/actuelle (renvoi `HANDOVER.md`,
  stack réelle, commandes, coordonnées, checks) — plus de Runpod/SVI/AudioLDM2/
  LangGraph comme stack. `HANDOVER.md` « Known gaps » : README/CLAUDE/lint marqués ✅,
  compteur tests → 226, snapshot lint ajouté. R-001 → resolved.
- **Docs-only** ; aucun code/route/DB/secret.
- Fichiers : `README.md`, `HANDOVER.md`, `agent/tasks.md`, `agent/log.md`, `agent/review.md`.
- Tests : vitest **226/226** · tsc clean · lint clean · build OK.

## 2026-06-08 — Claude (Opus 4.8) — T-601 : refresh CLAUDE.md (ciblé)
- Fait : addendum daté 2026-06-08 en tête de `CLAUDE.md` (pipeline multi-provider
  BytePlus/Atlas/EvoLink/HeyGen/Wan ; Director Console ; composer TipTap + Assets
  panel + verified faces ; règle confidentialité providers T-102/T-605 + guard test ;
  226 tests + tsc/build/lint clean). Bandeau « HANDOVER.md = source de vérité ».
  Corps historique 2026-05-11 conservé (garde-fous). Pas de réécriture massive.
- **Docs-only** ; aucun code applicatif.
- Fichiers : `CLAUDE.md`, `agent/tasks.md`, `agent/log.md`.
- Tests : vitest 226 · tsc clean · lint clean · build OK.
- Reste : corps README (T-601 partiel).

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

## 2026-06-08 — Codex — T-301b ScenePanel polish + regen gating
- Reprise apres limite de credit Claude : travail non committe finalise sans creer de nouveau SceneBoard.
- Fait : `lib/scene-status.ts` (helper pur client-safe : `sceneStatusMeta`, `supportsSingleSceneRegen`) + test ; `SceneTimeline` reutilise `sceneStatusMeta` pour ses labels ; `ScenePanel` affiche `Model` avec `cleanModelName(getEngineDisplayName(...))`, recoit `jobEngine` mobile+desktop, et masque `Regenerate` hors moteurs supportes (EvoLink/Bailian only, R-010).
- Scope : UI-only/helper pur ; aucune route/API/DB/state machine.
- Validation : `vitest` 240/240 · `tsc` clean · `lint` clean · `build` OK.

## 2026-06-08 — Codex — T-501a Post-generation Studio spec/audit
- Contexte : Claude Code indisponible ~48h (limite credit). Codex continue avec coordination explicite pour eviter les doublons.
- Audit read-only : la page job possede deja les actions principales (Download, Share, Copy link/prompt, Duplicate, Save as Look selon moteur, retry scenes) et rend `SocialExportPanel` sur les jobs done.
- Audit routes/components : `SocialExportPanel` couvre deja exports formats, thumbnail picker, AI copy, publish direct et schedule ; routes existantes : duplicate, export-social, social-pack, thumbnail, generate-metadata, looks, scheduled-posts. `upscale` est un stub 501 -> ne pas le mettre en action primaire.
- Livre docs-only : `docs/product/post-generation-studio-spec.md` avec decoupage T-501b/c/d/e et prompt de reprise pour Claude Code.
- Coordination : `agent/tasks.md` Axe 5 recadre (ne pas creer de doublon, reutiliser SocialExportPanel/ThumbnailPicker/routes existantes). `agent/review.md` ajoute R-012 duplicate fidelity et R-013 Use as reference decision.
- Scope : docs-only, aucun runtime/route/API/DB.

## 2026-06-08 — Codex — T-501b Job action bar premium
- Fait : action bar des jobs termines regroupee dans un rail responsive plus premium.
  Zone gauche : Download, Share, Copy link, Copy prompt. Zone droite : Duplicate job,
  Save as Look quand supporte.
- Decision UX : conserver `Duplicate job` au lieu de `Create variation`, car la route
  actuelle relance directement un job et ne garantit pas encore toute la fidelite des
  assets/options (R-012).
- Scope : UI-only (`app/jobs/[id]/page.tsx`) ; handlers/routes existants inchanges ; aucune route/API/DB/state machine.
- Validation : `vitest` 240/240 · `tsc` clean · `lint` clean · `build` OK.

## 2026-06-08 - Codex - T-501c Social Pack consolidation
- Fait : `components/job/social-export-panel.tsx` a maintenant un header plus studio et un resume compact des etats : Formats, Thumbnail, Copy, Channels.
- Comportement conserve : aucun changement de route/API/state ; export-social, thumbnail, generate-metadata, publish direct et scheduled-posts restent les chemins existants.
- Scope : UI-only ; gates free/pro/social connections conserves ; aucun provider visible.
- Validation : `vitest` 240/240 - `tsc` clean - `lint` clean - `build` OK.


## 2026-06-08 - Codex - T-501d Use as reference decision
- Audit read-only : le create flow envoie des references structurees (`ReferenceItem`/`ReferencePayload`) ; source canonique = `storage_path` dans le bucket prive `references` ; `upload?bucket=references` est image-only (JPG/PNG/WEBP). Les slots video/audio sont encore coming soon.
- Decision : V1 = `Use as image reference`, pas full video reference. Utiliser thumbnail/last_frame/image_url, role `outfit_style`, jamais `character_face` automatique.
- Livre docs-only : `docs/product/use-as-reference-decision.md` + backlog decoupe T-501d1/d2/d3. R-013 resolved.
- Scope : docs-only ; aucune route/API/DB/runtime.


## 2026-06-08 - Codex - T-501d1 Backend reference-image route
- Fait : nouvelle route `POST /api/jobs/[id]/reference-image` (auth + ownership + job done) qui prepare une image de reference depuis thumbnail/last_frame/image_url/R2 frame candidate.
- Stockage : copie server-side dans le bucket prive `references` sous `{user_id}/job-refs/...`, puis signed URL 6h pour preview. Retourne un `ReferenceItem` role `outfit_style`, jamais `character_face` automatique.
- Helper pur : `lib/job-reference-image.ts` (`pickJobReferenceImageSource`, path builder, item builder) + tests unitaires.
- Scope : backend additive route + helper ; aucune migration, aucune UI encore. Prochaine suite : T-501d2 create prefill.
- Validation : `vitest` 244/244 - `tsc` clean - `lint` clean - `build` OK.


## 2026-06-08 - Codex - T-501d2 Create prefill from reference job
- Fait : `app/(workspace)/create/[mode]/page.tsx` lit `reference_job_id` via `useSearchParams`, appelle `POST /api/jobs/[id]/reference-image`, puis ajoute la reference au state existant.
- Le prefill ajoute `job_reference` dans `references`, mappe la reference dans `composerUploadItems`, insere un chip `@reference`, ouvre la zone references, et affiche un statut loading/ready/error.
- Scope : glue UI vers route T-501d1 ; aucune nouvelle route/DB/migration. Prochaine suite : T-501d3 bouton `Use as reference` sur la page job.
- Validation : `vitest` 244/244 - `tsc` clean - `lint` clean - `build` OK.


## 2026-06-08 - Codex - T-501d3 Job page Use as reference action
- Fait : ajout du bouton `Use as reference` dans l action bar des jobs termines (`app/jobs/[id]/page.tsx`).
- Le bouton est un lien vers `/create/story?reference_job_id=<job_id>` ; il ne genere rien directement et s appuie sur T-501d1/T-501d2 pour preparer et attacher la reference.
- Scope : UI-only ; aucun nouveau endpoint, aucune DB/migration, aucun provider visible.
- Validation : `vitest` 244/244 - `tsc` clean - `lint` clean - `build` OK.


## 2026-06-08 - Codex - T-501e Duplicate fidelity audit
- Audit read-only : `app/api/jobs/[id]/duplicate/route.ts` forward vers `POST /api/jobs` mais ne copie que prompt, duration, engine, image_url et references_payload.
- Compare avec le contrat `POST /api/jobs` : manquent aspect_ratio, caption/audio fields, byteplus_asset_ids, multi_scene_chain, chain_strategy, et les scenes Director/storyboard.
- Livre docs-only : `docs/product/duplicate-fidelity-audit.md` avec gaps P1/P2/P3, recommendation T-501e1, test plan et copy guidance.
- Coordination : T-501e done ; T-501e1 ajoute comme implementation backend + tests ; R-012 reste open et passe medium jusqu a correction route.
- Scope : docs-only ; aucun runtime/route/API/DB modifie.


## 2026-06-08 - Codex - T-501e1 Duplicate route fidelity implementation
- Fait : helper pur `lib/job-duplicate-payload.ts` pour construire le body `POST /api/jobs` depuis une row jobs existante, sans copier outputs/status/couts.
- Route `app/api/jobs/[id]/duplicate/route.ts` : select etendu (storyboard, verified face IDs, aspect, audio/captions, chain settings, avatar_final) puis forward centralise vers `POST /api/jobs`.
- Fidelite : storyboard persiste -> `scenes[]` pour conserver les plans Director ; aspect ratio, captions/audio, chain settings, references/image_url et verified faces repris.
- Avatar/look jobs : blocage explicite 409 provider-neutral (pas de duplication trompeuse tant que les champs source dedies ne sont pas persistables/reconstructibles).
- Tests : `lib/__tests__/job-duplicate-payload.test.ts` couvre copie moderne, invalid optionals, non-copie plan/outputs, avatar block, prompt manquant.


## 2026-06-08 - Codex - R-009 AI Director Auto decision
- Decision Paul : Auto dans AI Director = Seedance 2.0 Fast, cle interne `seedance2_fast_byteplus`.
- Fait : nouveau helper pur `lib/director-engine.ts` + test ; `/create/[mode]` resout `selectedEngine === "auto"` vers cette cle pour `scenes[].engine` quand le Director genere.
- Le quality/cost read-out utilise la meme cle resolue ; labels publics restent provider-neutral.
- Priorites suivantes consignees : T-602, R-003, T-604, T-401, avatar/look duplicate, T-301c, R-006.


## 2026-06-08 - Codex - T-602a byteplus-assets route tests
- Fait : ajout de `app/api/byteplus-assets/route.test.ts`, tests route-level avec `createClient` Supabase mocke.
- Couverture : 401 sans user, GET scope `user_id` + signed thumbnail, POST validation asset id + upsert trimme, PATCH no-op + scope id/user, DELETE id requis + scope id/user.
- Aucun appel Supabase/provider reel ; pas de runtime modifie.
- Validation : `vitest` 258/258, `tsc` clean, `lint` clean, `build` OK.


## 2026-06-08 - Codex - T-602b upload references route tests
- Fait : ajout de `app/api/upload/route.test.ts`, tests route-level du chemin `POST /api/upload?bucket=references`.
- Mocks : `createClient`, `uuid.v4`, `file-type/fromBuffer`; aucun appel Supabase/R2/provider reel.
- Couverture : auth 401, fichier requis, magic bytes absents, MIME mismatch, upload user-scoped `user_id/uuid.ext`, signed URL 6h, erreur storage.
- Validation : `vitest` 264/264, `tsc` clean, `lint` clean, `build` OK.


## 2026-06-09 - Codex - T-602c POST /api/jobs route tests
- Fait : ajout de `app/api/jobs/route.test.ts`, tests route-level de `POST /api/jobs` avec Supabase service/auth et providers mockes.
- Couverture : prompt min, content policy, reference storage ownership, active generation gate, daily quota free, plan gate moteur Pro.
- Aucun appel provider reel ; les tests restent sur les early exits/gates avant generation.
- Validation : `vitest` 270/270, `lint` clean, `build` OK, `tsc` clean (relance seule apres build pour eviter collision .next/types).


## 2026-06-09 - Codex - T-701 Schedule double-sidebar fix + visible roadmap
- Fait : suppression de la sidebar locale dans `app/(workspace)/schedule/page.tsx`; le layout workspace rend maintenant l unique navigation.
- Nettoyage : retrait du fetch profil local `plan/email` devenu inutile.
- Coordination : ajout Axe 7 Visible Premium Pass, R-014 (perception visuelle encore insuffisante), R-015 (dettes restantes rappelees par Paul), et push policy autonome.
- Validation : `vitest` 270/270, `tsc` clean, `lint` clean, `build` OK.


## 2026-06-09 - Codex - T-702 Landing public refresh
- Fait : refresh `app/page.tsx`, suppression du message date "open-source AI models on Modal".
- Nouveau positionnement : AI video direction workspace, Director plan, assets, post-generation studio, CTA "Create with Director".
- Scope : UI/copy-only, provider-neutral ; aucune route/API/DB.
- Validation : `vitest` 270/270, `tsc` clean, `lint` clean, `build` OK. Dev server local a repondu HTTP 200 ; Browser plugin indisponible pendant le check.


## 2026-06-09 - Codex - T-703 Create flow premium pass
- Fait : ajout d'une `Director Console` visible dans `app/(workspace)/create/[mode]/page.tsx`, juste apres les controles Model/Duration/Format/Scenes.
- UX : le Director n'est plus un bouton secondaire en bas ; la console montre Plan, Model, Readiness, propose `Plan with AI Director` et garde un skip path `Generate now`.
- Nettoyage : suppression du doublon bas du Director ; textes visibles de credits admin rendus provider-neutral dans le create flow.
- Scope : UI-only ; aucune route/API/DB/state machine.
- Validation : `vitest` 270/270, `tsc` clean, `lint` clean, `build` OK. Dev server local : `/create/story` -> HTTP 307 (auth gate, pas de 500). Browser plugin toujours indisponible dans cet environnement.


## 2026-06-09 - Codex - Playwright QA + T-704 Home command center
- Browser plugin KO confirme dans une session dediee : `windows sandbox failed: spawn setup refresh`.
- Fait : ajout de Playwright en dev dependency (`@playwright/test`) + script `npm run test:e2e`, config Chromium et smoke tests publics/auth gate.
- Fait : `/home` remplace le template picker par un command center premium : actions principales, production pulse, pipeline workspace, starters et projets recents.
- Scope T-704 : UI-only ; aucune route/API/DB. Les tests Playwright ne saisissent aucun login ; les routes workspace sont verifiees comme auth-gated sans session.
- Validation : `vitest` 270/270, `test:e2e` 3/3, `tsc` clean, `lint` clean, `build` OK. Note : un serveur dev stale a ete redemarre apres une erreur Turbopack locale (`[turbopack]_runtime.js` manquant).


## 2026-06-09 - Codex - T-705 Library asset studio pass
- Fait : `/library` transforme la grille simple en Asset Studio : hero, stats, recherche, filtres, cartes video premium.
- Actions par asset : utiliser comme reference (`/create/story?reference_job_id=<id>`), ouvrir Studio (`/jobs/<id>`), telecharger le master, ouvrir le job pour social pack.
- Scope : UI-only ; reutilise `jobs` done + `social_exports`, aucune route/API/DB.
- Validation : `vitest` 270/270, `test:e2e` 3/3, `tsc` clean, `lint` clean, `build` OK.


## 2026-06-09 - Codex - Remaining roadmap cleanup
- R-006 : ajout de la page interne `/help/verified-face-id` et remplacement du lien fournisseur dans `FacesManager`.
- T-401 : spec Saved Looks livree dans `docs/product/saved-looks-spec.md` (docs-only, audit/migration deferees).
- Avatar/look duplicate : contrat livre dans `docs/product/avatar-look-duplicate-contract.md`; le 409 actuel reste volontaire tant que la reconstruction fidele n'est pas prouvee.
- T-301c : retry affordances cloturees via l'existant (`retry-scenes`) + gating single-scene regen deja livre par `supportsSingleSceneRegen()`.
- R-003 : migration retrospective deja presente et verifiee (`20260608_byteplus_assets_thumb_and_update_policy.sql`), sans donnees user ; aucune operation prod nouvelle.
- T-604/R-004 : `next.config.ts` ne contient plus `typescript.ignoreBuildErrors`; tsc/lint/build restent clean.


## 2026-06-09 - Codex - T-401a/T-401b Saved Looks first surface
- Audit livre : `docs/product/saved-looks-audit.md`.
- Constat : l'existant Saved Looks est `cinematic_looks` + `/api/looks`, limite aux jobs `heygen_avatar_shots`; aucune migration locale ne cree la table.
- Implementation safe slice : `/library` affiche les Saved Looks et propose `Create with look`.
- `/create/avatar?look_id=<id>` preselectionne le look et bascule en mode cinematic apres chargement des looks.
- Scope : aucune route/API/DB/migration/provider modifiee.
- Validation : `tsc` clean, `vitest` 270/270, `lint` clean, `build` OK, `test:e2e` 3/3.
- Browser plugin : KO dans cette session avec `windows sandbox failed: spawn setup refresh`; fallback Playwright utilise.


## 2026-06-09 - Codex - T-401c Saved Look reuse payload helper
- Ajout `lib/saved-look-payload.ts` : helper pur pour construire le body `POST /api/jobs`
  depuis un Look sauvegarde (`look_id`, script, voix, qualite lipsync).
- `/create/avatar` reutilise ce helper pour le chemin `Create with look`.
- Tests `lib/__tests__/saved-look-payload.test.ts` : contrat, validations, cap 2000,
  default `speed`, anti provider-leak.
- Scope : pas de route/API/DB/migration/provider.
- Validation : `tsc` clean, `vitest` 274/274, `lint` clean, `build` OK, `test:e2e` 3/3.


## 2026-06-09 - Codex - T-401d blocked audit + T-801a UGC Studio spec
- Supabase live audit tente en lecture seule : `list_tables` et `execute_sql` bloques
  par access-control ; `.env.local` sans service-role/DB URL.
- Livre `docs/product/saved-looks-supabase-audit.md` avec constat, evidence locale,
  requetes SQL lecture seule et recommandation de ne pas migrer avant audit privilegie.
- Livre `docs/product/ugc-studio-spec.md` : Product/UGC flow, references V1 via
  `outfit_style`, Verified Faces/Saved Looks/AI Director/Social Pack, slices T-801.
- Scope : docs/coordination only ; aucune route/API/DB/migration/runtime.
- Validation : `tsc` clean, `vitest` 274/274, `lint` clean, `build` OK.


## 2026-06-09 - Codex - T-801b UGC Director helper
- Ajout `lib/ugc-director.ts` : helper pur product/outfit/angle/platform/creator
  -> prompt global + aspect ratio + scenes Director.
- V1 utilise les labels de references compatibles (`image 1`, `image 2`) sans nouveau role DB.
- Tests `lib/__tests__/ugc-director.test.ts` : 6 scenes avec outfit, 5 sans outfit,
  mapping aspect ratio, variantes angle/creator, fallbacks, anti provider-leak.
- Scope : helper/test/docs only ; aucune UI, route, API, DB, migration ou provider.
- Validation : `tsc` clean, `vitest` 280/280, `lint` clean, `build` OK.


## 2026-06-09 - Codex - T-801c UGC panel in create flow
- Ajout d'un panneau UGC Studio UI-only sur `/create/product` et `/create/social`.
- Le panneau lit les images deja inserees dans le composer : premiere image = product,
  deuxieme image = outfit/style, sans nouveau role de reference.
- `Build UGC Director plan` appelle `buildUGCDirectorPlan()`, applique l'aspect ratio,
  plafonne scenes/duree selon le plan et ouvre le AI Director avec scenes locales.
- Scope : aucune route/API/DB/migration/provider ; `Generate Video` classique inchange.
- Validation : `tsc` clean, `vitest` 280/280, `lint` clean, `build` OK, `test:e2e` 3/3.

## 2026-06-09 - Codex - T-801d explicit UGC reference roles
- Ajout des roles image `product_reference` et `outfit_reference` au contrat `ReferenceRole` et a `validateReferences()` ; `outfit_style` reste accepte pour compat legacy.
- `/create/product` et `/create/social` affichent deux slots pres du composer : Product reference et Outfit/style, avec upload fichier ou drag/drop.
- Les uploads UGC portent le role explicite dans `references_payload`, mais le Director conserve les placeholders modele `image 1` / `image 2` via le serializer du composer.
- `ReferenceUpload` expose aussi Product + Outfit/Style comme slots images explicites.
- Scope : aucune DB/migration/route/provider/state machine.
- Validation : `tsc` clean, `vitest` 281/281, `lint` clean, `build` OK, `test:e2e` 3/3. Browser plugin KO connu (`windows sandbox failed: spawn setup refresh`), fallback Playwright utilise.

## 2026-06-09 - Codex - T-801e UGC creator identity polish
- Ajout d'un panneau `Creator identity` dans UGC Studio (`/create/product`, `/create/social`) : Product-first, Verified face, Saved Look, Avatar.
- Les cartes affichent disponibilite, miniatures quand disponibles et selecteurs si plusieurs assets existent.
- Chargement paresseux de `/api/looks` pour Saved Looks ; `/api/heygen` se charge aussi quand l'identite Avatar est choisie.
- `lib/ugc-director.ts` accepte `creatorLabel` et injecte le nom de l'identite choisie dans les prompts/scenes Director ; tests ajoutes.
- Scope : UI/helper/test only ; aucun changement route/API/DB/migration/provider/state machine.
- Validation : `tsc` clean, `vitest` 282/282, `lint` clean, `build` OK, `test:e2e` 3/3.
