# 9. Correspondance avec la revue Codex (PR #89, commit `a34ae8f`)

Revue indépendante reçue le 2026-11-08. Chaque constat a été **revérifié dans le code** (`origin/main` @ `39cfbc6`)
ou dans les sources officielles avant correction.

Statuts : ✅ **corrigé dans la spécification, réalisation à vérifier pendant le développement** ; 🟡 accepté avec
nuance ; ❌ contesté (preuve fournie). Aucun ✅ ne signifie que le mécanisme existe ou fonctionne : seuls les
critères d'acceptation de 05, une fois passés, le prouveront.

## 9.1 Bloquants

| ID | Constat | Vérification | Statut | Correction (où) |
|---|---|---|---|---|
| B1 | Confidentialité : `GET /api/jobs/[id]` lit avec le client service sans authentification ; `/v/[id]` expose tout job `done` ; R2 construit des URL publiques | Confirmé : `app/api/jobs/[id]/route.ts` L104-125 (`createServiceClient`, `select("*")`, filtre sur l'id seul) ; `app/v/[id]/page.tsx` L11-23 (aucun indicateur de publication) | ✅ | Médias privés par défaut, publication explicite, couche d'accès qui vérifie propriétaire + modération + retrait, stockage privé, délai de révocation ≤ 15 min défini et testé (02 §2.6, 05 étape 2, 08). Défaut **confirmé dans le code de `main`**, indépendant de ComfyUI ; sa présence dans la production déployée **n'est pas vérifiée** (01 §1.5) ; signalé à part au propriétaire |
| B2 | Admission non atomique (compter puis insérer), erreurs de comptage non bloquantes, utilisateur absent → plan free | Confirmé : `lib/jobs/guard.ts` puis insertion `app/api/jobs/route.ts` L690-745 | ✅ | Transaction d'admission en base (verrou par utilisateur, quota, budget, création job + run + dispatch), clé d'idempotence, prise en charge atomique par le worker, identité obligatoire (02 §2.5) |
| B3 | La liste blanche n'isole pas le code tiers ; le worker détiendrait la clé Supabase service et R2 | Confirmé : `modal_app/video_pipeline.py` L189-205 (client service) ; les options ComfyUI limitent le code chargé, pas ses droits | ✅ | Séparation **courtier** (secrets, réseau) / **exécuteur** (ComfyUI, sans secret, réseau coupé), politique de réutilisation des conteneurs par runtime, recyclage, test de fuite inter-utilisateurs (02 §2.7) |
| B4 | Le routeur historique pourrait sélectionner un moteur `comfy_workflow` puis retomber sur Wan | Confirmé : `modal_app/engines/router.py` (aucun filtre de type) et `modal_app/engines/__init__.py` (inconnu → `wan_i2v`). Nuance : le risque se réalise quand le chemin Modal sélectionne sans moteur préféré valide, ce qui existe (étapes 2 et 3 du routeur) | ✅ | Chaque routeur ne voit que les familles qu'il sait exécuter ; identifiant inconnu = erreur explicite dans le nouveau parcours ; test de non-régression (02 §2.3) |
| B5 | Sémantique de modération ambiguë (`review` livré vs `fail_closed` retenu) ; audio non couvert ; capacités des fournisseurs | Confirmé dans notre propre texte (ancien 02 §2.7) | ✅ | États `blocked` / `held` / `private_ok` / `public_ok`, audio et transcription, chaque asset livrable modéré, capacités déclarées (catégorie absente ≠ score nul), délais et rétention bornés (02 §2.8) |

## 9.2 Importants

| ID | Constat | Vérification | Statut | Correction |
|---|---|---|---|---|
| I1 | Correspondance des états `jobs` / `comfy_runs`, annulation, relance, runs bloqués | `lib/types.ts` : 4 états. Nuance : la migration d'origine `20251004_jobs_table.sql` autorise aussi `cancelled` ; la contrainte réellement en production est **à vérifier** (lecture seule) | 🟡 | Machine à états complète, écritures atomiques, « premier état terminal gagne », relance = nouveau job, heartbeat, expiration, réconciliation (02 §2.5) |
| I2 | Graphe non reproductible avec le seul hash | Confirmé (ancien 02 §2.4) | ✅ | Graphe résolu stocké côté serveur (accès service uniquement) + hash + paramètres effectifs + version du résolveur + identité du runtime ; le worker vérifie et soumet tel quel ; un seul résolveur (TS) (02 §2.4) |
| I3 | Le registre demande plus qu'un CHECK : API admin, test, catalogue public, statuts `beta/live` absents | Confirmé : `app/api/admin/engines/route.ts` L72 (`api`/`modal_local` seulement), `[id]/test/route.ts` L33 (`api` seulement), `app/api/engines/route.ts` (listes statiques) | ✅ | Inventaire des contrats à modifier, lien `engine_id` ↔ template, statuts du catalogue séparés de `engines.status` (02 §2.3, 08) |
| I4 | `/object_info` ne suffit pas à générer tous les widgets | Accepté : les custom nodes peuvent avoir une validation Python et des widgets JS propres | ✅ | Contrat de widgets supportés + extensions déclarées ; validation native ComfyUI conservée au `/prompt` ; variantes structurelles = graphes complets exportés nativement, patches limités à `set` (04) |
| I5 | Le déploiement se déclenche sur `main` **et** `claude/**` pour `modal_app/**` ; le placement dans `modal_app/comfy/` ne l'évite pas | Confirmé : `.github/workflows/deploy-modal.yml` | ✅ | Règles de déploiement corrigées **avant** le premier fichier sous `modal_app/` (étape 3, prérequis) (05, 06 R1) |
| I6 | Realtime et e-mails non réutilisés automatiquement | Confirmé : `lib/use-job-realtime.ts` écoute `jobs` et `job_scenes` ; e-mail envoyé uniquement par `app/api/webhooks/modal/route.ts` L77-84 | ✅ | Publication realtime de `comfy_runs` (RLS propriétaire), événement terminal par `notification_outbox` (révisé en 9.7), récupération par l'historique ComfyUI après coupure (02 §2.5) |
| I7 | Image et post-production pas transparentes : bibliothèque vidéo, overlay lié à Research | Confirmé : `app/(workspace)/library/page.tsx` L390, `app/api/jobs/[id]/route.ts` L234-245, `app/api/jobs/[id]/overlay/route.ts` | ✅ | Résultat typé (MIME, rôle, capacités de post-production), test image factice CPU avant H3, brut et corrigé = deux assets à provenance commune ; overlay retiré des promesses (02 §2.6) |
| I8 | Studio CPU à vérifier tôt ; routes HTTP et WS à protéger ; `requireAdmin` | Confirmé : `app/api/admin/middleware.ts` exporte `requireAdmin` | ✅ | Vérification CPU en étape 1 ; échange URL signée → session courte ; toutes routes + WS protégées ; soumission directe bloquée (03) |

## 9.3 Mineurs

| Constat | Statut | Correction |
|---|---|---|
| Prompt H3 4 000 car. vs garde à 2 000 (`guard.ts` L117) | ✅ | Limite par template, appliquée par le parcours commun ; H3 V1 = 2 000 pour rester cohérent (04) |
| Clé inconnue tantôt ignorée, tantôt rejetée | ✅ | Rejet explicite (04 §4.1) |
| Filtre global `/` et `\` | ✅ | Validation par rôle de champ (04 §4.2) |
| Annulation via `/interrupt` seulement | ✅ | Annulation native par identifiant `POST /api/jobs/{job_id}/cancel` (ComfyUI v0.42.0, `server.py` L1060, idempotente) (02 §2.5) |
| Runs « depuis l'UI admin » avant les formulaires | ✅ | Formulaire de test admin minimal dans l'étape H3 (05) |
| Budget MOSS incohérent (0,20 $ / 0,40 $) | ✅ | Un seul chiffre par étape (05) |
| MOSS absent des conditions d'ouverture | ✅ | MOSS validé avant ouverture (05 étape 7) |

## 9.4 Sécurité, licences, coûts

| Constat | Statut | Correction |
|---|---|---|
| Attestation des droits H3 trop tardive (bêta) | ✅ | Attestation privée (entité, territoires des utilisateurs **et du calcul**, usages) avant le **premier run H3 sur l'infrastructure AlphoGen** (annexe A, 05 étape 4) |
| LoRA contrôle MOSS : poids Apache-2.0 mais cartes d'entraînement issues de Depth Anything V2 Large (CC-BY-NC-4.0) | ✅ | Confirmé sur la fiche (`darask0/MOSS-Image-color-depth-control`). Variante contrôle **en attente de clarification** de la provenance (sans conclusion sur l'usage commercial) ; MOSS V1 = texte vers image seul (annexe A.3) |
| Preuves de licence par fichier et par révision | ✅ | Catalogue : source, révision (commit HF), SHA-256, licence, lien, date (annexe A.6) |
| GPL : pas de garantie générale | ✅ | Formulation durcie, inventaire et sources correspondantes avant toute diffusion (annexe A.2) |
| `screenPrompt` existant bloque marques et personnalités | ✅ | Reconnu ; exceptions légitimes organisées (02 §2.8) |
| Coût H3 : les 50 s « à froid » excluent les 12-14 s de démarrage de ComfyUI | ✅ | Confirmé dans `h3-lab/app.py` (`start()` chronométré à part, `cost_usd = gen_s × prix`). Estimations refaites avec démarrage conteneur + ComfyUI + chargement + calcul + inactivité + CPU/mémoire (07) |
| Studio 2 cœurs / 8 Gio ≈ 0,158 $/h, au-dessus de la cible de 0,10 $ | ✅ | Confirmé (prix Modal du 2026-11-08) ; cible corrigée (07) |
| Volumes 0,09 $/Gio/mois | ✅ | La page de prix annonce 1 Tio/mois inclus, mais cette franchise ne garantit pas un coût nul (plan, volumes partagés de tout l'espace, doublons, trafic sortant). Stockage traité comme un poste à mesurer (07 §7.1) |
| Précision ±10 % par run sans méthode d'allocation | ✅ | Coût de génération, coût du conteneur et frais partagés séparés ; tolérance mesurée sur le total de la période (07) |
| Snapshots = optimisation à mesurer | ✅ | Reformulé (07) |
| Plafond financier global (`max_containers` ne borne que le débit) | ✅ | Registre de dépenses avec réservation à l'admission + limite de dépense de l'espace Modal en filet de sécurité (02 §2.5, 07) |
| Kill switch revalidé au dispatch et avant publication | ✅ | Lecture en base (pas de cache) au dispatch, à la prise en charge et à la publication (02 §2.3) |

## 9.5 Points contestés ou précisés

1. **Stockage Modal** : nuance initiale **retirée** après la seconde remarque de Codex. La franchise annoncée ne
   garantit pas un coût nul ; le stockage est mesuré (07 §7.1).
2. **Statut `cancelled`** (🟡) : `lib/types.ts` n'en a que 4, mais `supabase/migrations/20251004_jobs_table.sql`
   L6 l'autorise. Il faut lire la contrainte réelle en production (lecture seule) avant d'écrire la correspondance
   finale. Le dossier n'en dépend pas : annulation = `failed` + `error_code = CANCELLED` si `cancelled` n'est pas
   autorisé.
3. **« MOSS prouve déjà la généricité »** : le dossier présentait MOSS comme un critère futur (ancien 05 phase 6).
   Formulation clarifiée sans changement de fond.
4. **`block_network` et appels de fonctions Modal** : l'architecture corrigée suppose que les entrées et sorties
   d'un appel de fonction Modal transitent même quand le réseau du conteneur est bloqué (`inferred`). C'est vérifié
   en étape 1 (test CPU, quelques centimes, sur autorisation). Sinon, repli documenté : réseau limité au seul
   courtier par liste d'adresses, ou exécuteur sans secret mais avec réseau sortant restreint (02 §2.7).

Aucun autre point n'est contesté.

## 9.6 Précisions demandées après la réponse à la revue (2026-11-08)

| # | Précision | Où |
|---|---|---|
| 1 | Coût H3 de ~0,18 $ présenté comme une estimation, avec comparaison des méthodes de calcul (A à E) | 07 §7.3 |
| 2 | La franchise de stockage Modal ne garantit pas un coût nul | 07 §7.1, 9.4, 9.5 |
| 3 | Provenance du LoRA contrôle MOSS : faits, questions ouvertes, sans conclusion sur l'usage commercial | annexe A.3.1 |
| 4 | Délai maximal de révocation des liens signés (≤ 15 min), caches compris, et tests | 02 §2.6 « Retrait et révocation », 05 étape 2 |
| 5 | Audit des custom nodes maintenu même avec un conteneur isolé par run | 02 §2.7, 05 étape 6 |
| 6 | Périmètre, comptabilisation et mécanismes d'arrêt des plafonds financiers | 02 §2.5 « Plafonds financiers », 07 §7.8 |
| 7 | Vulnérabilités confirmées dans le code de `main` distinguées de la production déployée (non vérifiée) | 01 §1.5, 9.1 |
| — | Contrat courtier / exécuteur détaillé (interface, canal de contrôle, tailles, recyclage) | 02 §2.7 |
| — | Transitions terminales : effets par état, événements tardifs, matrice de courses | 02 §2.5 |

## 9.7 Troisième lecture (commit `90825e0`)

Codex juge satisfaisants dans la spécification : graphe résolu stocké et résolveur unique, variantes en graphes
complets, filtrage du routage historique, résultats typés, séparation courtier / exécuteur et audit des custom nodes,
distinction `main` / production, réserves sur coûts, licences MOSS et conditions H3. Constats restants :

| # | Constat | Vérification | Statut | Correction |
|---|---|---|---|---|
| 1 (bloquant) | Le verrou par utilisateur ne protège pas les budgets partagés : deux utilisateurs peuvent réserver le même solde | Exact : `pg_advisory_xact_lock(hashtext(user_id))` ne sérialise que les admissions d'un même utilisateur | ✅ | Enveloppes `spend_envelopes` mises à jour par `UPDATE` conditionnel dans un ordre stable (verrou de ligne), test multi-utilisateurs avec une seule admission possible (02 §2.5, 05 étape 2) |
| 1 bis | « Un job actif » non garanti entre parcours ComfyUI et historique | Exact : le parcours historique ne prend pas ce verrou | ✅ | Deux options décrites (index unique partiel commun ou limite assumée), décision Q7 ; V1 proposée : limite assumée et documentée |
| 2 (bloquant) | Accès secondaires aux médias : vignette = média ; RLS « propriétaire » sur le stockage contournerait `/api/media` | Exact (permissions Supabase Storage portées par `storage.objects`, `verified-docs`) | ✅ | Aucun aperçu visuel pour H3 avant autorisation (`--preview-method none`) ; bucket `comfy-outputs` sans aucune politique client ; métadonnées (vue sans `storage_key`) séparées des octets ; tests par les API directes de stockage (02 §2.6, 05 étape 2) |
| 3 | Un run `held` expirerait avant la revue ; table incomplète (`held → expired`, annulation depuis `moderating`/`held`) | Exact | ✅ | Échéance d'exécution et échéance de modération séparées ; ressources rendues à l'entrée en `held` ; tâche différée persistante `moderation_tasks` ; table et tests harmonisés (02 §2.5) |
| 4 | État terminal ≠ fin de consommation ; `FunctionCall.cancel()` ne détruit pas le conteneur par défaut | Exact : `cancel(terminate_containers=False)` par défaut (`verified-docs`, SDK Modal) | ✅ | Clôture financière distincte (`open` → `closing` → `closed`), provision conservée jusqu'à l'arrêt confirmé, consommation tardive comptabilisée sans livraison, `terminate_containers=True` explicite (02 §2.5) |
| 5 | La notification décrite ne pouvait jamais partir (`notified_at` posé deux fois) et perdait ou doublait l'e-mail | Exact | ✅ | `notification_outbox` transactionnelle, identifiant stable, reprises, clé d'idempotence du fournisseur si disponible, `sent_at` = confirmation ; garantie « au moins une fois », « aucun doublon » conditionné au fournisseur (02 §2.5, 05 étape 3) |
| 6 | Variantes H3 ambiguës (image + full) ; verrous turbo écrasant le graphe full | Exact | ✅ | Axes + table complète des combinaisons, `unsupported` explicite, verrous jamais écrits (valeurs du graphe de la variante), test des 4 combinaisons (04 §4.5) |
| Mineur | Révocation : objectif à mesurer ; rejouer une URL déjà en cache | Exact | ✅ | Formulation « objectif d'acceptation » ; test de rejeu après mise en cache (02 §2.6, 05) |
| Mineur | Budgets Modal : usage, dépense après crédits, budgets par environnement | Exact (`verified-docs`, guide Budgets) | ✅ | Trois mécanismes distingués, trois options comparées (02 §2.5, 07, Q2) |
| Mineur | « critère vérifié sur MOSS » → « qui sera vérifié » | Exact | ✅ | README corrigé |

Aucun point de cette troisième lecture n'est contesté.
