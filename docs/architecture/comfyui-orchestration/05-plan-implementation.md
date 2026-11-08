# 5. Plan d'implémentation progressif

Révision 2 (2026-11-08) : ordre des étapes repris de la revue Codex (sécuriser l'orchestration **avant** le socle
d'exécution), critères d'acceptation vérifiables. Correspondance : [09](09-correspondance-revue-codex.md).

Règles valables pour toutes les étapes :

- Une étape = une PR (ou une petite série), revue avant fusion. Pas de push direct sur `main`.
- **Aucune dépense** (GPU, CPU, stockage, API de modération) sans autorisation explicite du propriétaire, demandée
  avant chaque lancement avec une estimation détaillée (§5.9). Budget de tests total : **3,00 $** jusqu'à MOSS inclus.
- Aucune migration appliquée en production sans validation. Migrations additives, RLS + GRANT dans le même fichier.
- Tous les tests existants restent verts (`npm run test`, `npx tsc --noEmit`, `npm run lint`, `next build`).
- Le garde-fou anti-fuite des fournisseurs reste vert et est étendu à chaque étape qui ajoute des libellés.
- Aucune condition confidentielle de l'autorisation MiniMax n'est écrite dans le dépôt, une PR, un ticket ou un log.

## Étape 0 : dossier corrigé (cette révision)

| Livrable | Acceptation |
|---|---|
| Corrections B1-B5, I1-I8, mineurs | Chaque constat a une ligne dans 09 avec statut et emplacement de la correction |
| Nouvelles décisions du propriétaire | Inscrites dans le README |
| Attestation privée des droits H3 | **Hors dépôt** : le propriétaire confirme qu'elle couvre entité, territoires des utilisateurs et du calcul (région Modal), usages et conditions (annexe A.1). Le dépôt ne contient que « attestation : oui / date » |

## Étape 1 : vérifier les contrats, sans GPU

| Livrable | Acceptation |
|---|---|
| Graphes API H3 exportés nativement (variantes `t2v`, `i2v`, `t2v_full`) | Trois fichiers JSON inspectables ; `t2v` identique (JSON normalisé) au graphe du labo `build_workflow(turbo='v4', te='int8')` |
| Graphe API MOSS texte vers image exporté nativement (sans branche contrôle) | Fichier inspectable ; liste exacte des `class_type` restants et des packs qu'ils exigent |
| Démarrage Studio CPU (`--cpu`) des runtimes `h3-video@1` et `moss-image@1` | ComfyUI démarre, `/object_info` répond pour tous les nodes des graphes, le frontend s'affiche ; packs qui exigent un GPU à l'import listés |
| Contrat courtier / exécuteur (02 §2.7), sur CPU | Une fonction Modal avec `block_network=True` et **aucun** `Secret` : (a) reçoit et rend des octets par appel ; (b) envoie des événements en mode générateur ; (c) accepte une annulation (canal de contrôle ou `FunctionCall.cancel()`) en < 10 s ; (d) taille maximale d'entrée et de sortie mesurée (objectif : vidéo de 10 s) ; sinon le repli (volume éphémère par run) est choisi et documenté |
| Contrat de widgets (04 §4.2) | Chaque entrée exposée de H3 et MOSS est classée « supportée » ou « hors contrat » |
| Contrainte réelle `jobs.status` en production | Lue (lecture seule) et consignée ; correspondance d'annulation tranchée (02 §2.5) |

Coût : CPU uniquement (§5.9), sur autorisation.

## Étape 2 : sécuriser l'orchestration (aucun GPU)

| Livrable | Acceptation (tests automatisés) |
|---|---|
| Lecture privée : `GET /api/jobs/[id]` (parcours ComfyUI) et `GET /api/media/[asset_id]` authentifiés, contrôle propriétaire | Utilisateur B ne peut lire ni le job, ni les assets, ni la progression de A (403/404) ; anonyme : 401 |
| Stockage privé + URL signées ≤ 10 min | Aucune URL publique produite pour un asset ComfyUI (test sur le helper) |
| Publication explicite (`published_at`) ; `/v/[id]` et galerie lisent uniquement les assets publiés | Asset non publié, `held`, `blocked` ou retiré : 404 sur la page publique |
| Retrait et révocation (02 §2.6) | Après retrait : nouvelle URL refusée immédiatement ; URL privée déjà émise refusée au plus tard à son TTL (10 min) et servie avec `Cache-Control: private, no-store` ; URL publique d'un asset publié → 404 après purge, purge mesurée (objectif ≤ 5 min) ; délai total ≤ 15 min mesuré ; cascade sur brut, final, miniature, aperçus ; objets supprimés du stockage à la fin de la rétention |
| Admission atomique `admit_comfy_job` + idempotence | 20 requêtes simultanées du même utilisateur (1 job actif autorisé) → exactement 1 admission ; même clé d'idempotence rejouée → même `job_id` ; erreur de comptage simulée → refus ; anonyme → 401 |
| Plafonds financiers (02 §2.5) | Admission refusée au plafond (jour et mois, par périmètre) ; 20 réservations concurrentes ne dépassent jamais la limite ; run `queued` au-delà de la limite → `failed` (`BUDGET`) au dispatch ; règlement, libération et ajustement corrects ; dépassement constaté au rapprochement → kill switch automatique + alerte ; budget de tests isolé (`scope = 'tests'`) |
| Machine à états `transition_comfy_run` | Toutes les transitions interdites échouent. **Matrice de courses** : annulation × fin ; expiration × fin ; deux dispatchs × un run ; annulation × modération ; revue × retrait ; notification rejouée. Dans chaque cas : un seul état terminal, budget réglé une fois, une notification au plus, aucun asset publié après un état terminal autre que `done`, parent `jobs` cohérent |
| Expiration et réconciliation (cron) | Run sans heartbeat > 2 min → `expired`, réservation libérée |
| Routage historique (B4) | Test : template `comfy_workflow` actif de priorité maximale → le routeur Python ne le sélectionne jamais ; identifiant inconnu dans la branche comfy → 4xx explicite |
| Règles de déploiement (I5) | `deploy-modal.yml` modifié pour que les changements sous `modal_app/comfy/**` **ne déclenchent pas** le déploiement de `alphogenai-v2`, ni sur `main`, ni sur `claude/**` ; vérifié par un commit de test sur une branche dédiée **avant** tout fichier sous `modal_app/comfy/` |

## Étape 3 : socle générique d'exécution

| Livrable | Acceptation |
|---|---|
| Runtime YAML, catalogue (source, révision, SHA-256, licence) | Le validateur refuse un modèle sans licence connue |
| Validateur et résolveur TS (`lib/comfy/*`) | ≥ 20 cas de rejet (clé inconnue, hors plage, option hors liste, verrou, plan, modèle hors catalogue, `class_type` hors liste blanche, longueur de prompt, MIME d'upload…) ; les prompts contenant `/` ou `\` sont acceptés ; couverture ≥ 90 % |
| Graphe résolu stocké (`comfy_run_graphs`) + hash + `resolver_version` | Le courtier refuse un graphe dont le hash ne correspond pas (test) |
| Courtier / exécuteur (`modal_app/comfy/*`) | L'exécuteur n'a aucun `modal.Secret` attaché (vérifié par test sur la définition de l'app) |
| Résultats typés (`assets`), brut et corrigé distincts | Un run produit des assets avec `kind`, `mime`, `role`, `derived_from` |
| Annulation native, heartbeat, réconciliation `/history` | Annulation pendant un run factice → `cancelled` en < 30 s |
| Realtime `comfy_runs` + notification idempotente | Une seule notification par run, même si l'événement terminal est rejoué |
| **Test image factice sur CPU** (graphe du cœur ComfyUI, ex. image vide → sauvegarde) | Chaîne complète admission → courtier → exécuteur → asset privé → bibliothèque, **sans GPU** ; la bibliothèque affiche l'image comme image |
| Test de fuite inter-utilisateurs | Deux runs factices de deux utilisateurs sur le même conteneur : aucune donnée du premier accessible au second |
| Aucun moteur de nodes maison | Le seul traitement de graphe dans le code est `set` sur des entrées déclarées (revue de code) |

## Étape 4 : H3 en admin

| Livrable | Acceptation |
|---|---|
| Template `minimax-h3` (graphes de l'étape 1, manifeste 04 §4.4) | Statut `admin`, `plans` vides |
| Formulaire de test admin minimal | Permet de lancer un run H3 avant les formulaires générés |
| Post-traitement `audio_shift` | Mesure `lipsync_measure.py` : décalage global dans ±150 ms (brut : +330 à +540 ms) |
| Smoke test (sur autorisation, §5.9) | 3 runs dans une seule rafale réussissent ; MP4 H.264 + audio ; durée 5,17 s ± 0,05 s pour 5 s |
| Mesure de **toute** la durée facturable | Démarrage du conteneur, démarrage ComfyUI, chargement des modèles, calcul, post-traitement, inactivité : chaque poste mesuré et rapporté ; coût total de la période comparé à la facture Modal (écart < 10 % sur le total de la période, pas par run) |
| Accès | Non-admin : moteur invisible et 403 s'il est forcé |

## Étape 5 : conformité et formulaires

Détail des obligations : annexe A. Aucun utilisateur non admin avant validation de cette étape.

| Livrable | Acceptation |
|---|---|
| Contrat de modération + 2 adaptateurs (dont un faux pour les tests) | Même suite de tests de contrat ; changer de fournisseur = configuration seulement |
| Couverture : texte, images d'entrée, image et vidéo de sortie, **audio** (transcription) | Jeux de tests : 100 % des cas bloquants refusés ou retenus ; catégorie non supportée → `held` ; panne simulée sous `h3_fail_closed` → `held`, rien n'est livré |
| Jeu « contenus légitimes » | Taux de blocage ≤ 2 %, publié dans la PR |
| File de revue, signalement, retrait, sanctions | Revue ≤ 48 h affichée ; suppression automatique à 7 jours des contenus `held` sans décision ; utilisateur suspendu → refus à l'admission |
| Journal d'accès des modérateurs | Chaque consultation d'un contenu retenu est journalisée |
| CGU (répercussion section V + Exhibit A H3), notice, lien licence, mention IA | Textes validés par le propriétaire ; acceptation enregistrée avant le premier run H3 d'un utilisateur |
| « MiniMax H3 » visible | Test qui l'impose sur la page de création, le job et la page publique |
| Formulaires générés Simple / Advanced | Aucun code propre à H3 dans `components/comfy/` ; Simple H3 = 4 champs ; Advanced = tous les champs autorisés du contrat de widgets ; valeurs falsifiées rejetées par le serveur |
| Procédure de revue périodique | `docs/compliance/minimax-h3.md` (fréquence, responsable, journal) |

## Étape 6 : MOSS-Image, texte vers image (preuve de généricité)

| Livrable | Acceptation |
|---|---|
| Runtime `moss-image@1` (packs restants après export, épinglés) | **Revue écrite de chaque pack** (`workflows/comfy/runtimes/reviews/`) **obligatoire, quelle que soit la politique de réutilisation** : un conteneur par run ne dispense pas de l'audit (02 §2.7) ; licences `verified-docs` pour **chaque** fichier du catalogue (annexe A.3) **avant** tout déploiement |
| Template `moss-image` | **0 ligne** modifiée dans `modal_app/comfy/*.py`, `lib/comfy/*.ts`, `components/comfy/*`. Si un manque générique est trouvé : correction séparée du socle, puis nouveau test |
| Sortie image | Asset `image/png` privé, affiché comme image, modéré |
| Mesure (sur autorisation) | Coût complet mesuré sur L40S et H100 ; choix du GPU documenté |
| Variante contrôle de profondeur | **Hors périmètre** tant que la provenance du LoRA n'est pas clarifiée (annexe A.3) |

## Étape 7 : ouverture progressive

Conditions : étapes 2 à 6 validées, MOSS compris, attestation H3 confirmée, décision du propriétaire.

| Critère | Seuil |
|---|---|
| Cohorte | Liste d'utilisateurs autorisés, puis plan pro |
| Fiabilité | Taux d'échec < 5 % sur 50 runs réels |
| Coût | Coût moyen par run comparé à l'estimation : écart < 20 % ; plafond global jamais dépassé |
| Conformité | Aucun signalement non traité depuis plus de 48 h |
| Retour arrière | Procédure testée : kill switch en base coupe l'admission et la publication en < 1 min, sans déploiement |

## Perspectives (documentées, hors V1)

Entraînement LoRA, Studio Pro, portefeuille de crédits : études séparées, sans impact sur le schéma V1 (02 §2.9).

## 5.9 Budget de tests (D10)

**Plafond total : 3,00 $ jusqu'à MOSS inclus. Chaque lancement est soumis à autorisation explicite avec l'estimation
ci-dessous, puis le coût réel est rapporté.**

Prix Modal relevés le 2026-11-08 (`verified-docs`, modal.com/pricing) : H100 0,001097 $/s ; L40S 0,000542 $/s ;
L4 0,000222 $/s ; CPU 0,0000131 $/cœur/s ; mémoire 0,00000222 $/Gio/s ; volumes 0,09 $/Gio/mois (franchise annoncée,
sans garantie de coût nul : taille des volumes relevée à chaque étape, 07 §7.1). Un conteneur GPU facture **aussi**
son CPU et sa mémoire. Tous les montants ci-dessous sont des **estimations** (méthode D de 07 §7.3), remplacées par
les coûts mesurés après chaque étape.

Hypothèses H3 (480x832, 5 s) : démarrage du conteneur ~20 s (`unknown`, à mesurer) + démarrage ComfyUI 13 s +
chargement des modèles et premier calcul 50 s + inactivité de fin 60 s = **143 s** de conteneur pour le premier run
d'une rafale ; ~22 s par run chaud supplémentaire. Mémoire du conteneur supposée 64 Gio (+0,000142 $/s).

| Étape | Contenu | Froid + chargement | Calcul chaud | Inactivité | Autres | Estimation | Plafond |
|---|---|---|---|---|---|---|---|
| 1 | Studio CPU ×2 runtimes, test `block_network`, construction d'images | — | — | inclus | CPU 2 cœurs / 8 Gio ≈ 0,158 $/h, ~1 h | ≈ 0,20 $ | 0,25 $ |
| 3 | Tests factices CPU (image vide → sauvegarde, fuite, annulation) | — | — | inclus | CPU ~20 min | ≈ 0,05 $ | 0,10 $ |
| 4 | Copie des ~42 Go de modèles H3 vers le volume de l'app ; 3 runs H3 en 1 rafale | 83 s ≈ 0,103 $ | 2 × 22 s ≈ 0,055 $ | 60 s ≈ 0,074 $ | copie CPU ~15 min ≈ 0,04 $ | ≈ 0,27 $ | 0,35 $ |
| 5 | Banc de modération (modèle auto-hébergé sur L4, ~10 min, sorties existantes) ; 3 runs UI en 2 rafales | 2 × 83 s ≈ 0,206 $ | 22 s ≈ 0,027 $ | 2 × 60 s ≈ 0,149 $ | L4 ≈ 0,15 $ ; API externe éventuelle (centimes) | ≈ 0,55 $ | 0,65 $ |
| 6 | MOSS : copie ~16 Go ; 10 images L40S + 5 images H100, 1 rafale par GPU | L40S ≈ 0,045 $ ; H100 ≈ 0,078 $ | ≈ 0,066 $ + 0,030 $ | ≈ 0,037 $ + 0,074 $ | copie CPU ≈ 0,03 $ | ≈ 0,36 $ | 0,45 $ |
| **Total** | | | | | | **≈ 1,43 $** | **1,80 $** (+ 1,20 $ de réserve = 3,00 $) |

L'étape 2 ne consomme rien sur Modal. L'inactivité pèse autant que le calcul : grouper les tests d'une étape en une
seule rafale. Le forfait de calcul inclus de Modal peut absorber une partie de ces montants ; ils sont tout de même
comptés dans le budget.
