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

### [R-009] AI Director + moteur « Auto » → fallback engine backend — `severity: low` · `status: open`
- Contexte : en mode « Auto », « Generate now » du Director envoie des scènes **sans**
  `engine` (conforme à la consigne : jamais `engine:"auto"`). Le chemin clientScenes du
  backend (`app/api/jobs/route.ts:690`) applique alors `s.engine || preferred || "wan_i2v"`
  → comme `preferred_engine` est aussi omis en auto, les scènes Director tombent sur
  `wan_i2v`, là où le chemin normal « auto » laisserait le backend choisir le meilleur moteur.
- Risque : faible. La plupart des utilisateurs du Director choisissent un modèle explicite.
- Reco : pour faire résoudre « auto » au mieux côté clientScenes, il faudrait soit
  envoyer un engine résolu côté client, soit ajuster le backend (hors scope UI-only).
  À arbitrer si on veut un vrai « Auto » dans le Director.

## Décisions actées

- `HANDOVER.md` = source de vérité courante (prime sur README/CLAUDE si conflit).
- Build local doit passer **sans secrets** (`/gallery` dégrade proprement) — acquis.
- Lint doit rester « no warnings or errors » — acquis.
