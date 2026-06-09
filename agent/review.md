# agent/review.md — Points de review, risques, décisions ouvertes

Format :
- **[ID] Sujet** — `severity: info|low|medium|high` · `status: open|resolved`
  - Contexte :
  - Risque / impact :
  - Recommandation / décision attendue :

---

## Risques & dette

### [R-019] MCP skeleton `/api/mcp` (T-901c/d) — surface inerte par défaut — `severity: low` · `status: open`
- Contexte (2026-06-09, Claude) : surface MCP read-only / no-cost livrée —
  `app/api/mcp/route.ts` (dispatcher) + `lib/mcp/{auth,serialize,tools,types}.ts`.
  Outils (tous scope `read`/`plan`, cost `none`) : `get_job`, `list_recent_jobs`
  (read-only, scoping par `userId`), `validate_job_payload` (preview, **réutilise
  `assertCanCreateJob`**, aucun insert), `create_director_plan` (réutilise
  `generateStoryboard` + `resolveUserPlan`), `create_ugc_plan` (réutilise
  `buildUGCDirectorPlan`). Sortie provider-neutral (`getEngineDisplayName`/`cleanModelName`,
  scrub des erreurs ; clé engine brute jamais exposée). **Aucun `create_video` payant.**
  Aucune exposition Supabase directe au MCP.
- Garde-fous : route 404 sauf `MCP_ENABLED=true` ; auth **fail-closed** (401 si
  `MCP_TOKEN_PEPPER`/token de test non configurés) ; PAT vérifié par HMAC-SHA256+pepper
  en temps constant ; service-role utilisé **uniquement server-side**, jamais renvoyé.
  Config détaillée : `docs/product/alphogen-mcp-auth-design.md` §12.
- Décision ouverte (Paul) : (1) quand créer la migration `mcp_tokens` (R-003, additive)
  pour passer du token de test env → store DB owner-scoped ; (2) quand activer
  `MCP_ENABLED` (compte de test d'abord, jamais prod tant que rate-limit/audit absents).
- Validé : 355 tests · tsc 0 · lint 0 · build OK (route `/api/mcp` enregistrée).

### [R-001] Dette documentaire : CLAUDE.md / future-proof-notes périmés — `severity: medium` · `status: resolved`
- Résolu (2026-06-08) : `CLAUDE.md` a un addendum daté à jour ; `README.md` est court
  et pointe vers `HANDOVER.md` ; `HANDOVER.md` à jour (226 tests). `future-proof-notes`
  garde sa valeur historique/garde-fous (bandeau « HANDOVER.md gagne » partout).
- (contexte historique ci-dessous)
- Contexte : `CLAUDE.md` et `docs/architecture/future-proof-notes.md` datent du
  2026-05-11 et présentent **EvoLink comme provider principal** + pipeline Modal,
  sans le virage **BytePlus (Seedance `asset://`) / AtlasCloud / HeyGen** ni le
  **composer multimodal**. Le README a un bandeau mais son corps reste historique.
- Risque : un nouvel agent/dev suit une doc périmée (mauvais provider, mauvais flux).
- Reco : `HANDOVER.md` reste la source de vérité ; rafraîchir CLAUDE.md/README
  (tâche T-003). Ne pas supprimer l'historique (garder le « pourquoi »).

### [R-002] Décision produit : niveau de la « Director Console » — `severity: medium` · `status: resolved`
- Résolu : T-001 = layout-only (validé) ; T-102 = labels provider-friendly +
  badges de compatibilité (livré, UI-only, valeur d'engine inchangée). Codex fait
  la review UX. Suite : axes 2→5 selon priorité Paul.
- (historique ci-dessous)
- Contexte : le CTO veut remplacer les noms techniques de modèles par des
  intentions de direction (« Best for realistic character video ») et exposer un
  statut de compatibilité par asset.
- Décision attendue (Paul) : périmètre de T-001/T-002 :
  - (a) layout seul (sûr) ;
  - (b) layout + labels friendly + badges compat ;
  - (c) + début Scene Board.
- Impact : (b)/(c) modifient le sélecteur d'engine récemment livré → garder la
  valeur réellement envoyée à l'API inchangée derrière le label.

### [R-003] Opérations DB faites avant ce protocole — `severity: medium` · `status: resolved`
- Résolu côté traçabilité : `supabase/migrations/20260608_byteplus_assets_thumb_and_update_policy.sql`
  existe, est additive/idempotente, contient uniquement `thumb_path` + policy UPDATE,
  et n'insère aucune donnée utilisateur. Aucune opération prod nouvelle effectuée ici.
- Contexte : effectuées sur Supabase prod (`qbrpzmuedfugbhoeytdj`) **avant** la
  mise en place d'AGENTS.md, donc à acter rétroactivement (protocole #4) :
  1. `ALTER TABLE byteplus_assets ADD COLUMN thumb_path text;` (additif, OK).
  2. `CREATE POLICY byteplus_assets_update_own ... FOR UPDATE` (manquait → bloquait
     le PATCH/upsert côté user ; corrige un vrai bug RLS).
  3. INSERT des 7 assets vérifiés de l'utilisateur (groupe « Paul »), puis réduction
     à 1 par défaut (`asset-20260607230638-229pt`). Données utilisateur, réversibles
     via l'UI.
- ⚠️ Ces changements n'ont **pas** de fichier dans `supabase/migrations/`.
- Reco : créer une migration additive rétroactive
  (`supabase/migrations/2026XXXX_byteplus_assets_thumb_and_update_policy.sql`)
  pour la traçabilité (colonne + policy), **sans** les INSERT de données user.
  → À valider avant de l'écrire (touche aux migrations DB = protocole #4).

### [R-004] `typescript.ignoreBuildErrors: true` (dette héritée) — `severity: low` · `status: resolved`
- Résolu : `next.config.ts` ne contient plus `typescript.ignoreBuildErrors`.
  `tsc --noEmit`, lint et build sont clean.
- Contexte : flag dans `next.config.ts` (cf future-proof-notes §1.8). `tsc --noEmit`
  est actuellement **clean**, donc on pourrait retirer le flag — mais c'est un
  fichier de config critique (protocole #4).
- Reco : retirer le flag dans un commit dédié après confirmation `tsc` clean en CI.
  Ne pas toucher sans validation.

### [R-005] Couverture de tests sur les nouveaux flux - `severity: low` - `status: resolved`
- Resolu T-602 : ajout de tests route-level mockes pour les flux recents actifs.
- `byteplus-assets` : auth, scope user, signed thumbnail, CRUD.
- `upload?bucket=references` : validation fichier/MIME magic bytes, path user-scoped,
  signed preview URL, erreurs storage.
- `POST /api/jobs` : validations et gates avant provider (prompt, content policy,
  references ownership, active generation, daily quota, plan gate).
- Aucun appel Supabase/provider reel ; suite a 270 tests au dernier passage.

### [R-006] Lien « verified face ID » pointe vers la console provider — `severity: low` · `status: resolved`
- Résolu : `components/create/faces-manager.tsx` pointe vers `/help/verified-face-id`.
  Nouvelle page interne AlphoGen : `app/help/verified-face-id/page.tsx`.
- Contexte : dans `faces-manager.tsx`, le lien « Need help finding your verified face
  ID? » a un `href` vers `console.byteplus.com` (le **texte** est provider-neutre,
  seule l'URL révèle le provider à qui inspecte / au survol).
- Risque : faible (pas de texte visible ; mais l'URL expose le provider).
- Reco : à terme, page d'aide interne AlphoGen (« comment obtenir un verified face
  ID ») qui masque la console réelle. UI-only quand on la fera.

### [R-007] `ENGINE_DISPLAY_NAMES` — collisions de noms volontaires — `severity: info` · `status: resolved`
- Plusieurs clés mappent au même nom public (ex. `evolink`/`seedance` → « Seedance
  2.0 » ; `wan_26`/`wan_26_bailian` → « WAN 2.6 » ; atlas/byteplus → « Seedance 2.0
  (Direct) »). C'est **voulu** : on cache le provider, l'utilisateur voit le modèle.
  La clé technique (`engine_used`) reste distincte côté data/admin.

### [R-008] AI Director (T-201b) : plan édité = preview-only — `severity: info` · `status: resolved`
- Résolu (décision) : `docs/product/director-plan-mapping-decision.md` → **Option B**.
  Le backend `app/api/jobs/route.ts:681-692` **accepte déjà** un tableau `scenes[]`
  (« Phase C: editor-provided scenes ») qui alimente le même storyboard/state machine.
  T-201c = mapping UI-only (POST `scenes[]`), **aucune modif backend/state machine**.
  L'ancienne question « prompt unique vs prompts par scène » est tranchée : prompts
  par scène, voie déjà supportée et validée serveur (cap/clamp/troncature).

### [R-009] AI Director + moteur Auto - `severity: low` - `status: resolved`
- Decision Paul (2026-06-08) : dans AI Director, `Auto` signifie le modele rapide
  Seedance 2.0 Fast (cle interne `seedance2_fast_byteplus`).
- Resolu : `lib/director-engine.ts` expose `AI_DIRECTOR_AUTO_ENGINE` et
  `resolveDirectorEngineKey()`. Le create flow envoie cette cle dans `scenes[].engine`
  quand `Generate now` est lance depuis le Director avec le selecteur sur Auto.
- Le label public reste `Auto`/provider-neutral ; le quality/cost read-out utilise
  la meme resolution, donc le cout n est plus differe dans ce cas.

### [R-010] Régénération single-scene limitée à certains moteurs — `severity: low` · `status: open`
- Contexte : `POST /api/jobs/[id]/scenes/[sceneIndex]` (régénère **une** scène)
  n'appelle que `createEvoLinkTask`/`createBailianTask` → **EvoLink/Bailian only**.
  Les scènes BytePlus/Atlas/HeyGen ne peuvent pas être régénérées individuellement.
- Impact : faible. Pour ces moteurs, le board s'appuiera sur `retry-scenes`
  (job-level, job *failed*). T-301 : n'afficher le bouton regen single-scene que
  lorsque le moteur est supporté ; sinon le masquer.
- Reco : si on veut le regen single-scene multi-provider, c'est une évolution
  **backend** (hors scope T-301 UI-only) — à arbitrer plus tard.
- Constat T-301 audit : `ScenePanel.tsx` affichait le bouton **Regenerate sans gating**
  moteur -> il echouait pour BytePlus/Atlas/HeyGen. **Fait T-301b** : bouton gate
  via `supportsSingleSceneRegen()` (EvoLink/Bailian only). R-010 reste ouvert
  pour une eventuelle evolution backend multi-provider.

### [R-011] `ScenePanel` libelle `Engine` + cle non nettoyee — `severity: low` · `status: resolved`
- Resolu T-301b : `ScenePanel` affiche `Model` et passe par
  `cleanModelName(getEngineDisplayName(jobEngine ?? scene.engine))`; `jobEngine` est
  cable depuis la page job pour les panneaux mobile + desktop.

### [R-012] Duplicate job ne duplique pas encore toute la configuration - `severity: medium` - `status: resolved`
- Contexte : `POST /api/jobs/[id]/duplicate` forward bien vers `POST /api/jobs` (bon
  choix d architecture), mais ne copie aujourd hui que prompt, duration, engine,
  image URL et references payload.
- Audit T-501e : `docs/product/duplicate-fidelity-audit.md` documente les gaps :
  aspect ratio perdu, verified face IDs perdus, scenes Director/storyboard non
  preservees, chain settings et audio/captions non repris.
- Risque : un duplicate de job moderne peut produire un format, un personnage, une
  scene ou un habillage social differents du job original.
- Resolu T-501e1 : route duplicate branchee sur `lib/job-duplicate-payload.ts`
  avec tests. Les champs de fidelite sont copies et `storyboard` est converti en
  `scenes[]`. Avatar/look jobs restent explicitement non duplicables (409
  provider-neutral) tant qu un contrat dedie n existe pas.

### [R-013] Use as reference doit etre decide avant implementation - `severity: low` - `status: resolved`
- Contexte : la page job devrait idealement proposer `Use as reference`, mais le
  create flow attend des references structurees et `reference-upload.tsx` marque encore
  certains slots video/audio comme coming soon.
- Risque : un simple lien vers `/create/story` avec une URL video pourrait ne pas etre
  compatible avec le composer/payload attendu, ou creer une UX trompeuse.
- Resolu T-501d : `docs/product/use-as-reference-decision.md`. Decision V1 = image reference structuree (`outfit_style`) depuis thumbnail/last_frame/image_url, via une future route server-side qui copie dans le bucket prive `references`. Full video reference est deferred V2.

### [R-014] Changements visibles encore insuffisants - `severity: medium` - `status: resolved`
- Résolu par Axe 7 : Schedule double-sidebar fix, landing refresh, Create Director
  Console, Home command center, Library asset studio. Playwright smoke tests ajoutés.
- Contexte : Paul a partage des captures du SaaS le 2026-06-09. Une grande partie
  du travail recent est backend/fondation ou visible uniquement dans certains flows
  (job termine, Director ouvert, Duplicate/Use as reference), donc le produit global
  ne donne pas encore un gros saut visuel.
- Risque : perception utilisateur encore trop "dashboard/formulaire" malgre les
  fondations premium.
- Reco : Axe 7 Visible Premium Pass : schedule double-sidebar fix (fait), landing refresh,
  create flow premium pass, home command center, library asset studio.

### [R-015] Dette qualite restante apres T-602 - `severity: low` - `status: resolved`
- Résolu : R-003 tracée, T-604 vérifié/résolu, T-401 spec livrée, contrat
  Avatar/look duplicate livré, T-301c clôturé, R-006 aide interne livrée.
- Reste confirme par Paul : R-003 migration retrospective Supabase, T-604 retrait
  `typescript.ignoreBuildErrors`, T-401 Saved Looks spec, contrat Avatar/look duplicate,
  T-301c retry affordances, R-006 aide interne verified face ID.

### [R-016] Live `cinematic_looks` schema audit blocked - `severity: medium` - `status: open`
- Contexte : T-401 doit rester sur le contrat existant tant que le schema live
  `cinematic_looks` n'est pas verifie.
- Tentative 2026-06-09 : Supabase MCP `list_tables` et `execute_sql` refusent
  l'acces ; `.env.local` ne contient pas de service-role/DB URL.
- Mitigation : `docs/product/saved-looks-supabase-audit.md` contient les requetes
  lecture seule a executer dans Supabase SQL Editor / connexion privilegiee.
- Ne pas creer de migration Saved Looks generale tant que ce risque est ouvert.
- Reco : ne pas perdre ces items pendant le Visible Premium Pass ; les traiter en
  tranches dediees, avec validation explicite pour R-003/T-604.

### [R-017] UGC exact try-on / product grounding is not guaranteed in V1 - `severity: medium` - `status: open`
- Contexte : T-801 livre un UGC Studio premium base sur references, AI Director,
  creator identity et Social Pack. Le pipeline actuel reste le `POST /api/jobs`
  standard ; il ne garantit pas un vrai try-on physique, la preservation parfaite
  du logo/geometrie produit, ni un lipsync natif voix importee.
- Risque : une future UI ou spec pourrait sur-promettre "swap clothes" ou "exact
  product preservation" alors que le modele selectionne reste best-effort.
- Decision T-802 : `docs/product/ugc-generation-contract.md` fixe la promesse V1.
  Toute evolution exact try-on/product grounding devient T-803+ avec validation
  capacites modele/provider, tests et wording dedie.

### [R-018] Audit sécurité Supabase (email « RLS disabled ») — `severity: high` · `status: resolved (critique) / open (durcissement)`
- **RÉSOLU (2026-06-09, go Paul)** : `ALTER TABLE public.app_settings ENABLE ROW LEVEL
  SECURITY;` appliqué via MCP (`apply_migration enable_rls_app_settings`) + tracé dans
  `supabase/migrations/20260609_enable_rls_app_settings.sql`. Vérifié : `rowsecurity=true` ;
  l'advisor est passé de **ERROR `rls_disabled_in_public`** → **INFO `rls_enabled_no_policy`**
  (état attendu/sûr, deny-par-défaut, service-role bypasse). Plus aucun advisor ERROR.
  Aucune fonctionnalité cassée (tous les accès sont en service-role).
- **Reste ouvert (durcissement, non urgent, tranche dédiée + go)** :
  ~~policies `jobs` INSERT~~ ✅ R-018b ; `music_cache`/`video_cache` INSERT idem ;
  `REVOKE EXECUTE … FROM anon/authenticated` sur les RPC admin (déjà gardées en interne) ;
  `search_path` des fonctions ; activer leaked-password protection (Auth) ; **R-018c** ci-dessous.

### [R-018b] Jobs INSERT policies permissives — `severity: medium` · `status: resolved`
- **RÉSOLU (2026-06-09, go Paul)** : drop des 3 policies INSERT permissives sur
  `public.jobs` (`All users can create jobs`, `Allow authenticated to create jobs`,
  `Allow insert on jobs` [role public → anon]), toutes `WITH CHECK (true)`. Migration
  `jobs_drop_permissive_insert_policies` via MCP + `supabase/migrations/20260609_jobs_drop_permissive_insert_policies.sql`.
- **Vérifié sûr** : l'app insère les jobs uniquement en **service-role**
  (`app/api/jobs/route.ts` → `createServiceClient`, bypass RLS) ; aucun insert
  client/anon. Restent `users_insert_own_jobs` (`auth.uid()=user_id`) +
  `service_role_all_jobs`. Advisor : les 3 `rls_policy_always_true` sur `jobs` ont
  disparu. Aucune donnée user modifiée ; création de jobs/quotas intacts.

### [R-018c] Jobs SELECT policy `USING (true)` — fuite de lecture — `severity: medium` · `status: resolved`
- **RÉSOLU (2026-06-09, go Paul)** : `drop policy "Users can view own jobs"` (la
  permissive `USING (true)`) via MCP `apply_migration jobs_drop_permissive_select_policy`
  + `supabase/migrations/20260609_jobs_drop_permissive_select_policy.sql`. Vérifié :
  policies `jobs` finales = `service_role_all_jobs` (ALL) + `users_insert_own_jobs`
  (`auth.uid()=user_id`) + `users_select_own_jobs` (`auth.uid()=user_id`). Fuite fermée.
  Audit lecture ci-dessous prouvant l'absence de casse (partage public/gallery en
  service-role ; pages « my » déjà scoping user_id). Aucune donnée user modifiée.
- (audit détaillé ci-dessous)
- Constat (audit R-018b) : `public.jobs` a une policy SELECT `Users can view own jobs`
  en **`USING (true)`** pour le rôle `authenticated` → un utilisateur connecté peut
  lire **tous** les jobs (tous users) directement via PostgREST. L'advisor Supabase
  n'en parle pas (SELECT `true` volontairement exclu) mais c'est une vraie fuite.
- Il existe déjà `users_select_own_jobs` (`auth.uid()=user_id`) correcte.
- ⚠️ NE PAS dropper sans auditer les chemins de **lecture** (page job, `/v/[id]`
  partage public, projects, library) : certains peuvent lire via le client user et
  dépendre de cette policy, ou lire un job d'autrui (partage). Stop & document
  (consigne Paul). Reco : audit lecture → remplacer `USING (true)` par
  `auth.uid()=user_id` (+ éventuelle policy dédiée au partage public si nécessaire).

- **AUDIT LECTURE (2026-06-09, read-only) — correctif jugé SÛR :**
  | Chemin | Client | RLS ? | Scoping |
  |---|---|---|---|
  | `/v/[id]` (partage public) | `createServiceClient` | non (bypass) | lit par `id`+`status=done` |
  | `/gallery` | `createServiceClient` | non (bypass) | — |
  | `/jobs/[id]` via `app/api/jobs/[id]/route.ts` | `createServiceClient` | non | ownership en code |
  | `/library`, `/home`, `/projects`, `/create` | `lib/supabase/client` (navigateur, auth) | **oui** | **déjà `.eq("user_id", user.id)`** |
  | APIs social/thumbnail/duplicate/publish/export/metadata | `createServiceClient` (+ `createClient` pour `getUser`) | non | ownership en code |
  - **Aucun chemin** ne lit un job d'autrui via le client user/anon en s'appuyant
    sur `USING (true)`. Le **partage public `/v/[id]` et `/gallery` sont en
    service-role** (bypass) → **pas besoin de policy RLS dédiée au partage**.
  - La policy correcte **`users_select_own_jobs` (`auth.uid()=user_id`) existe déjà** ;
    `Users can view own jobs (USING true)` n'est qu'un doublon permissif qui annule
    le scoping (OR permissif → effectif `true`).
  - **Réponses aux questions** :
    1. Remplacer `USING (true)` par `auth.uid()=user_id` ? → **OUI, sûr.** Plus propre
       encore : **dropper** `Users can view own jobs` (la correcte existe déjà).
    2. Policy séparée pour vidéos publiques/partagées ? → **NON** (service-role).
    3. `/v/[id]` ou `/gallery` dépendent du read public via RLS ? → **NON** (service-role).
  - **SQL proposé (minimal, miroir de R-018b — en attente du go avant application)** :
    ```sql
    drop policy if exists "Users can view own jobs" on public.jobs;
    -- reste : users_select_own_jobs (auth.uid()=user_id) + service_role_all_jobs
    ```
  - Statut : **audit done, fix proposé, attente go Paul** (aucune migration appliquée).
- Diagnostic (2026-06-09, MCP `74b88f17…`, projet `qbrpzmuedfugbhoeytdj`, read-only).
- **CRITIQUE (ERROR)** — `public.app_settings` a **RLS désactivé** alors qu'elle est
  exposée à PostgREST → lecture/écriture possibles via la clé anon. Contenu :
  `key='providers'` (flags d'activation providers). Risque : fuite (noms providers +
  états) et surtout **écriture anon** (un attaquant pourrait désactiver tous les
  providers → DoS génération).
  - **Vérifié** : tous les accès code passent par le **service-role**
    (`/api/engines`, `/api/admin/providers`, Modal). Donc **activer RLS sans policy
    ne casse RIEN** (service-role bypasse RLS ; anon/authenticated = deny par défaut).
  - **Fix proposé (sûr, réversible)** :
    `ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;`
    (pas de policy nécessaire — aucun lecteur anon). À tracer en migration.
  - ⚠️ Modif sécurité/DB → **attend le go explicite de Paul** (protocole #4 + règles
    sécurité). Je peux l'appliquer via MCP sur confirmation, ou Paul l'exécute.
- **WARN mitigés (pas urgents)** :
  - `admin_delete_user` / `admin_read_user` (SECURITY DEFINER, advisor « anon
    executable ») → **gardés en interne** (`auth.jwt()->>'role'='admin'`) ; anon =
    permission denied / résultat vide. Best-practice : `REVOKE EXECUTE ... FROM anon`,
    non urgent.
  - `stripe_events` : RLS activé **sans** policy = deny par défaut (sûr, service-role
    OK). INFO.
  - `jobs` : 3 policies INSERT `WITH CHECK (true)` (doublons « All users can create
    jobs » / « Allow authenticated… » / « Allow insert on jobs ») → permissif ;
    inserts réels passent en service-role. À nettoyer (resserrer/dédupliquer).
  - `music_cache` / `video_cache` INSERT `WITH CHECK (true)` ; ~15 fonctions
    `search_path` mutable ; `auth_leaked_password_protection` désactivé (activer
    HaveIBeenPwned). Durcissement, non urgent.
- Reco priorité : (1) `app_settings` RLS **maintenant** (sur go) ; (2) nettoyer les
  policies `jobs` INSERT permissives ; (3) durcissement (revoke anon RPC, search_path,
  leaked-password) en tranche dédiée.

### [R-018d] Durcissement sécurité Supabase (suite) — `severity: low` · `status: partiel`
Audit + actions 2026-06-09 (go Paul) sur les 4 items de durcissement restants :
- **#1 cache INSERT permissifs — ✅ RÉSOLU.** `music_cache`/`video_cache` avaient
  INSERT `WITH CHECK (true)` (authenticated). Audit code : écrits **uniquement** par
  les workers Python en **service-role** (`workers/music_selector.py`,
  `workers/supabase_client.py`) ; l'app TS n'y touche pas. Drop des 2 policies via
  `apply_migration cache_drop_permissive_insert_policies` +
  `supabase/migrations/20260609_cache_drop_permissive_insert_policies.sql`. Advisor :
  catégorie `rls_policy_always_true` désormais **vide**. Aucune donnée user.
- **#2 REVOKE EXECUTE sur RPC admin — ⛔ NON FAIT (documenté).** `is_admin()` est
  utilisé dans des **policies RLS** (`projects`, `project_scenes`, `daily_themes`,
  `music_tracks`, `video_jobs_log`) → révoquer `EXECUTE` casserait l'évaluation de ces
  policies pour les rôles concernés. Les fonctions admin (`admin_delete_user`,
  `admin_read_user`) sont **déjà gardées en interne** (`auth.jwt()->>'role'='admin'`),
  donc le risque réel est faible (advisor WARN mitigé). Triggers
  (`handle_new_user`, `ingest_provider_webhook`, `generic_broadcast_trigger`) : un
  revoke ne change rien (les triggers s'exécutent indépendamment des grants). **Reco :
  laisser tel quel**, ou faire une révocation **anon-only très ciblée** sur
  `admin_delete_user`/`admin_read_user` dans une tranche séparée après vérif que
  l'app appelle ces RPC en service-role.
- **#3 `search_path` des fonctions — ✅ RÉSOLU (2026-06-09, go Paul).** Les 14 corps
  ont été relus : seules refs **non qualifiées** = tables `public` (`jobs`/`job_scenes`
  dans les watchdogs) ; tout le reste qualifié (`auth.*`, `realtime.*`,
  `information_schema.*`, `public.*`) + built-ins via `pg_catalog`. `gen_random_uuid()`
  = core PG (pg_catalog), pas `extensions` → pas de risque. Donc `SET search_path =
  public, pg_temp` (immuable, `pg_temp` en dernier) est **sûr et non cassant**.
  `apply_migration harden_function_search_path` (14 `ALTER FUNCTION`) +
  `supabase/migrations/20260609_harden_function_search_path.sql`. Vérifié : 14/14
  `proconfig` posé ; smoke-test `is_admin()`/`current_user_id()` OK ; advisor
  `function_search_path_mutable` **vidé**.
- **#4 leaked-password protection — ⛔ BLOQUÉ PAR LE PLAN (Free).** Tenté via le
  dashboard (Auth → Email → « Prevent use of leaked passwords ») le 2026-06-09 : erreur
  Supabase « available on Pro Plans and up ». La feature HaveIBeenPwned est **réservée
  au plan Pro+** → non activable sur Free. WARN advisor restera ouvert tant que le
  projet est Free (non critique : email confirmé déjà requis). **Décision financière
  (upgrade Pro) = Paul.** Alternative gratuite recommandée (même panneau Email) :
  passer **Minimum password length de 6 → 8+** et/ou ajouter des **Password
  requirements** (hygiène mdp sans HIBP).

## Décisions actées

- `HANDOVER.md` = source de vérité courante (prime sur README/CLAUDE si conflit).
- Build local doit passer **sans secrets** (`/gallery` dégrade proprement) — acquis.
- Lint doit rester « no warnings or errors » — acquis.

