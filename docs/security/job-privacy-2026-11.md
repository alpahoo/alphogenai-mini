# Confidentialité des jobs : correctif et propositions (2026-11-08)

Origine : revue Codex de la PR #89 (dossier ComfyUI, 01 §1.5). Les trois défauts
ci-dessous existent déjà en production. Ils ne dépendent pas de ComfyUI.

| # | Défaut | Dans cette PR |
|---|---|---|
| 1 | `GET /api/jobs/[id]` renvoie n'importe quel job à n'importe qui | **Corrigé et testé** |
| 2 | `/v/[id]` publie tout job `done` | **Chantier distinct** : migration `shared_at` à créer dans une PR ultérieure ; code `/v` inchangé |
| 3 | Sorties servies par des URL R2 publiques | **Analyse seule**, aucun changement de stockage |

---

## 1. `GET /api/jobs/[id]` : correctif (dans cette PR)

### Avant
La route lisait le job avec `createServiceClient()` + `select("*")` en filtrant seulement sur l'id.
Elle **faisait avancer la machine à états** (appels providers, Modal, TTS, R2) puis renvoyait
`formatJob(job)` et `job_scenes.*` à **tout appelant**, anonyme compris. Il suffisait de connaître
l'id du job. Conséquences : fuite de données (prompt, URL, metadata, scènes) **et** déclenchement
d'actions payantes par un tiers.

### Après (`app/api/jobs/[id]/route.ts`)
Le contrôle passe **avant** toute lecture renvoyée et avant toute transition d'état :

1. Appel machine : `Authorization: Bearer $CRON_SECRET` (nouveau `isCronRequest()` dans
   `lib/cron-auth.ts`, fermé par défaut : `false` si `CRON_SECRET` n'est pas défini) → accès autorisé.
2. Sinon, session : `createClient().auth.getUser()`. Sans utilisateur → **401** (la table n'est même pas lue).
3. Le job est lu (service role). S'il n'existe pas → 404.
4. Si `job.user_id !== user.id` et que l'appelant n'est pas admin (`isAdminEmail`) → **403**,
   sans aucune donnée et sans faire avancer la machine à états.

`formatJob()` est inchangé. Il ne projette toujours pas `user_id`, et un test le vérifie.

### Appelants vérifiés
| Appelant | Effet |
|---|---|
| `app/jobs/[id]/page.tsx` (poll UI, cookie de session) | OK pour le propriétaire. 401/403/404 passent désormais tous à l'état « denied » (avant : seulement 404). |
| `lib/use-job-realtime.ts` | N'appelle pas la route : Supabase Realtime sous RLS (`users_select_own_jobs`). Aucun changement. |
| `app/api/cron/evolink-poll` (self-call) | Envoie maintenant `Authorization: Bearer $CRON_SECRET`, qu'il possède déjà puisque `assertCronAuth` vient de le valider. **Sans cela, le poller recevrait 401 et les jobs dont l'onglet est fermé ne progresseraient plus.** |
| `app/api/cron/jogg-poll` | Appelle `settleJoggJob` directement, pas la route. |
| MCP (`app/api/mcp`, `lib/mcp/*`) | Lit la base directement, n'appelle pas cette route. |
| `PATCH` / `DELETE` de la même route | Avaient déjà le contrôle propriétaire. Inchangés. |

### Effet de bord à connaître
Les jobs historiques sans `user_id` ne sont plus lisibles via cette route que par un admin.

### Tests
- `app/api/jobs/[id]/route.test.ts` : anonyme → 401 (table non lue) ; **utilisateur B sur le job de A → 403
  sans données** ; propriétaire → 200 sans `user_id` ; admin → 200 ; cron avec le bon bearer → 200 sans
  session ; mauvais bearer → 401 ; `CRON_SECRET` absent → 401 ; job inconnu → 404.
- `lib/__tests__/cron-auth.test.ts` : `isCronRequest` fermé par défaut.

### Déploiement
Code seulement, sans migration. Il faut que `CRON_SECRET` soit défini côté Vercel, ce qui est déjà
nécessaire au cron. Après déploiement, vérifier dans les logs Vercel que `[cron/poll] … advanced`
ne reçoit pas de 401.

---

## 2. `/v/[id]` : publication explicite (proposition, **décision du propriétaire requise**)

### Problème
`app/v/[id]/page.tsx` sert (service role) tout job `status = 'done'` : prompt, moteur, vidéo,
miniature. Le bouton « Share » de la page job **copie seulement l'URL**. Aucun consentement n'est
enregistré, donc tout job terminé est public pour qui devine ou intercepte son id.

### Proposition
Migration additive **à préparer dans une PR distincte**, non incluse dans ce correctif d'API : future colonne `jobs.shared_at TIMESTAMPTZ NULL`
- `jobs.shared_at TIMESTAMPTZ NULL` (NULL = privé). C'est un horodatage plutôt qu'un booléen
  `is_public` : il porte la même information plus la date de publication.
- Index partiel `WHERE shared_at IS NOT NULL`.
- RLS réaffirmée + GRANT explicites (`service_role`, `authenticated`). **Aucun grant/policy pour `anon`**.

Code à livrer **après** application de la migration, dans une PR séparée : déployé avant elle, le
filtre sur une colonne absente ferait échouer toutes les pages `/v`.
1. `app/v/[id]/page.tsx` : `getPublicJob` ajoute `.not("shared_at", "is", null)`. Le `select`
   projeté reste inchangé (aucune colonne privée).
2. Nouvelle route `POST/DELETE /api/jobs/[id]/share` (propriétaire uniquement, même contrôle que §1) :
   pose ou efface `shared_at`.
3. Bouton « Share » de `app/jobs/[id]/page.tsx` : appelle d'abord `POST …/share`, puis copie l'URL.
   Ajout d'un bouton « Unshare ».
4. Tests : job `done` sans `shared_at` → 404 ; avec `shared_at` → 200 ; B ne peut pas partager le job de A.

### Liens déjà partagés : 3 options (à trancher)
| Option | Effet | Pour | Contre |
|---|---|---|---|
| **A. Grand-père total** | backfill `shared_at` sur les jobs `done` existants | aucun lien cassé | l'exposition actuelle reste pour tout l'historique, y compris ce qui n'a jamais été partagé |
| **B. Strict** (recommandée) | aucun backfill | vraie confidentialité immédiate | tout ancien lien `/v/…` donne 404 jusqu'à ce que le propriétaire reclique « Share » |
| C. Hybride | backfill seulement si galerie publiée ou post social publié | garde les publications avérées | peu ou pas de jobs concernés (à mesurer avant de choisir) |

Recommandation : **B**. Rien ne permet de distinguer un lien vraiment partagé d'un job jamais partagé
(le clic « Share » n'est pas journalisé), et C en récupère peu. A garde le défaut pour tout
l'historique. Les trois options devront être documentées dans cette future PR ; aucune migration de publication n'est incluse dans la présente branche.

**Questions au propriétaire :** (1) option A, B ou C ? (2) `shared_at` vous convient-il, ou préférez-vous
`is_public` booléen ? (3) feu vert pour appliquer la migration, puis la PR de code ?

---

## 3. URL R2 publiques : analyse

L'analyse détaillée (options URL signées / bucket privé / proxy, impact sur l'existant, ordre de
bascule) et les constats annexes sont **transmis en privé au propriétaire**. Ce dépôt est public, et
ces éléments décrivent une exposition encore ouverte. Aucun changement de stockage dans cette PR.
