# agent/review.md — Points de review, risques, décisions ouvertes

Format :
- **[ID] Sujet** — `severity: info|low|medium|high` · `status: open|resolved`
  - Contexte :
  - Risque / impact :
  - Recommandation / décision attendue :

---

## Risques & dette

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

### [R-003] Opérations DB faites avant ce protocole — `severity: medium` · `status: open (à valider)`
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

### [R-004] `typescript.ignoreBuildErrors: true` (dette héritée) — `severity: low` · `status: open`
- Contexte : flag dans `next.config.ts` (cf future-proof-notes §1.8). `tsc --noEmit`
  est actuellement **clean**, donc on pourrait retirer le flag — mais c'est un
  fichier de config critique (protocole #4).
- Reco : retirer le flag dans un commit dédié après confirmation `tsc` clean en CI.
  Ne pas toucher sans validation.

### [R-005] Couverture de tests sur les nouveaux flux — `severity: low` · `status: open`
- Contexte : 220 tests unitaires passent, mais pas de tests d'intégration sur
  `jobs` / `byteplus-assets` / `upload` (flux récents les plus actifs).
- Reco : T-004.

### [R-006] Lien « verified face ID » pointe vers la console provider — `severity: low` · `status: open`
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
## Décisions actées

- `HANDOVER.md` = source de vérité courante (prime sur README/CLAUDE si conflit).
- Build local doit passer **sans secrets** (`/gallery` dégrade proprement) — acquis.
- Lint doit rester « no warnings or errors » — acquis.

