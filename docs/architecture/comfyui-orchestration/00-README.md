# ComfyUI comme moteur privilégié des workflows d'AlphoGen : dossier d'architecture

Date : 2026-11-08. Base analysée : `origin/main` @ `39cfbc6`.
Statut : **architecture validée par le propriétaire, en attente de revue critique indépendante**. Rien n'est
implémenté. Aucun code, aucune migration, aucun déploiement, aucune dépense GPU n'a été faite pour ce dossier.
Destinataire : l'agent de revue puis d'implémentation (Codex). Décisions et points ouverts en bas de ce fichier.

## Principe directeur

> ComfyUI exécute les graphes. AlphoGen rend cette puissance accessible et sûre : comptes, plans, quotas,
> jobs, stockage, modération, conformité, coûts, post-production et interface.

Règles qui s'appliquent à tout le dossier :

1. **ComfyUI est le moteur privilégié pour les workflows compatibles.** Le routage le choisit en priorité lorsqu'un
   template ComfyUI actif couvre la capacité demandée. Les fournisseurs API existants (Seedance via BytePlus,
   AtlasCloud, EvoLink, HeyGen, Jogg, MuAPI, etc.) restent en place là où ils sont meilleurs. **Aucun fournisseur
   n'est retiré** dans ce dossier.
2. **Intégration générique.** Un workflow = un graphe JSON au format API + un manifeste. Ajouter un workflow qui
   tourne sur un runtime existant = **zéro ligne de Python**. Un nouveau custom node = une nouvelle version de runtime
   (fichier de verrouillage déclaratif), pas un adaptateur.
3. **Pas de second moteur de nodes.** AlphoGen ne réinterprète jamais un graphe : il remplit des valeurs déclarées,
   valide, puis envoie à `POST /prompt`. L'édition de la structure d'un graphe se fait dans l'éditeur natif ComfyUI.
4. **Tout paramètre techniquement compatible et autorisé par l'admin est configurable.** Simple = volontairement
   court. Advanced = tout ce que l'admin a ouvert. Studio = éditeur ComfyUI natif (admin d'abord, Pro plus tard).
5. **Tout l'existant métier est conservé** : `jobs`, quotas, Stripe, Supabase/RLS, routage, post-production Modal,
   fournisseurs API, garde-fou anti-fuite des noms de fournisseurs.
6. **Conformité avant ouverture.** MiniMax H3 n'est ouvert à aucun utilisateur non admin avant que les obligations
   de licence (annexe A) soient implémentées et vérifiées.

## Sommaire

| # | Livrable | Fichier |
|---|---|---|
| 1 | Audit de l'existant (existe / réutilisable / manque) | [01-audit-existant.md](01-audit-existant.md) |
| 2 | Architecture cible | [02-architecture-cible.md](02-architecture-cible.md) |
| 3 | Réutilisation du frontend ComfyUI (Studio) | [03-frontend-comfyui-studio.md](03-frontend-comfyui-studio.md) |
| 4 | Synchronisation workflows ↔ paramètres (manifeste) | [04-synchronisation-manifeste.md](04-synchronisation-manifeste.md) |
| 5 | Plan d'implémentation progressif + critères d'acceptation | [05-plan-implementation.md](05-plan-implementation.md) |
| 6 | Risques, limitations, dépendances | [06-risques-limitations.md](06-risques-limitations.md) |
| 7 | Coûts Modal et optimisations | [07-couts-modal.md](07-couts-modal.md) |
| 8 | Fichiers et composants à créer / modifier | [08-fichiers-composants.md](08-fichiers-composants.md) |
| A | Licences : MiniMax H3, ComfyUI, MOSS-Image, custom nodes | [annexe-a-licences.md](annexe-a-licences.md) |

## Labels de preuve

Convention du dépôt (`docs/product/muapi-ecosystem-implementation-handbook.md`) :

- `verified-code` : lu dans le code (AlphoGen `origin/main`, ou ComfyUI tag `v0.42.0`).
- `verified-runtime` : observé en exécution réelle (labo H3 sur Modal, 2026-11-08, ou POC ComfyUI produit 2026-10-20).
- `verified-docs` : documentation ou fiche officielle (Hugging Face, GitHub, page de prix).
- `inferred` : déduction raisonnable, à confirmer.
- `unknown` : à vérifier avant de coder dessus.

## Templates de référence

1. **MiniMax H3** (vidéo + audio natif) : configuration validée en labo, reprise telle quelle (int8, turbo v4, prompt
   officiel, audio avancé de 0,4 s configurable, version brute conservée en option).
2. **MOSS-Image** (image) : deuxième template, pour prouver que la même chaîne sert l'image et embarque des custom nodes.

Pas de workflow Amazon dans ce dossier.

## Décisions du propriétaire (2026-11-08)

L'architecture proposée est **validée**. Le développement reste **non autorisé** tant que la revue critique
indépendante de ce dossier n'est pas faite et acceptée.

| ID | Décision | Statut |
|---|---|---|
| D1 | `jobs` reste le parent (quotas, realtime, bibliothèque) + table enfant `comfy_runs` | ✅ Validée |
| D2 | Chaque template publié est une ligne du registre `engines` (`type = 'comfy_workflow'`) | ✅ Validée |
| D3 | Templates versionnés dans le dépôt (revus en PR) + copie publiée en base avec empreinte SHA-256 | ✅ Validée |
| D4 | App Modal dédiée `alphogenai-comfy`, déploiement manuel tant que la phase 2 n'est pas validée | ✅ Validée |
| D5 | **Modération interchangeable** : un contrat unique, compatible avec une API externe ou un modèle auto-hébergé sur Modal ; politique séparée du fournisseur (allow / review / block) qui laisse une large liberté créative et ne bloque que ce qu'imposent la loi et la licence ; signalement et revue humaine des contenus générés (02 §2.7) | ✅ Validée sous cette forme ; fournisseurs concrets choisis sur banc de test en phase 4 |
| D6 | V1 = plans + quota quotidien existants + coût réel tracé ; portefeuille de crédits = chantier séparé | ✅ Validée |
| D7 | Studio admin en conteneur CPU, tests via le runner GPU standard | ✅ Validée |
| D8 | MOSS-Image V1 = texte vers image (SFT int8) + variante contrôle ; pas d'encodeur « abliterated » ; **licences de toutes les dépendances vérifiées avant tout déploiement** (annexe A.3) | ✅ Validée |
| D9 | Textes juridiques rédigés par l'agent, relus et validés par le propriétaire | ✅ Validée |
| D10 | Budget de tests : **3,00 $ maximum** jusqu'à MOSS inclus ; **aucune dépense sans autorisation explicite** du propriétaire ; chaque estimation inclut démarrage à froid, chargement des modèles, calcul et temps GPU inactif (05, 07) | ✅ Validée |
| D11 | Advanced : variantes déclarées dans le manifeste, pas de rebranchement libre (réservé au Studio). Aucune autre limite que l'autorisation de l'admin | ✅ Validée |

Principes confirmés par le propriétaire :

- ComfyUI reste le moteur privilégié des workflows de génération compatibles.
- Le backend AlphoGen conserve l'orchestration métier et les fournisseurs existants.
- Ajouter un workflow compatible = JSON + manifeste + catalogue, sans modification systématique du code commun.
- Le mode Advanced expose tous les paramètres autorisés par l'admin, sans limitation artificielle.
- Le Studio admin utilise autant que possible les fonctionnalités natives de ComfyUI.
- H3 est le premier workflow, MOSS-Image le deuxième.
- Les conditions de l'autorisation MiniMax déjà reçue sont respectées ; aucun document confidentiel n'est publié.

## Points encore ouverts

| Point | Responsable | Avant |
|---|---|---|
| Périmètre (territoires, usages) de l'autorisation MiniMax spécifique | Propriétaire (hors dépôt) | Phase 7 (ouverture bêta) |
| Licence du VAE `flux2-vae` complet (fichier également publié sous licence non commerciale) ; à défaut, VAE small (Apache-2.0 vérifiée) | Agent d'implémentation + propriétaire | Phase 6 |
| Avis juridique GPL sur le frontend ComfyUI | Propriétaire | Studio Pro |
| Prix Modal L40S, CPU et stockage | Agent d'implémentation | Chaque demande de budget |

## Revue critique demandée (avant tout développement)

Une revue indépendante doit challenger, au minimum :

1. **Architecture** : la séparation runtime / template / run / post-traitement tient-elle pour H3 et MOSS ? Le
   choix `jobs` + `comfy_runs` et l'extension du registre `engines` sont-ils compatibles avec le code de
   `app/api/jobs/route.ts` et `app/api/jobs/[id]/route.ts` (filtre `formatJob`) ?
2. **Sécurité** : liste blanche de nodes, reconstruction serveur du graphe, isolation entre runs, Studio admin
   (jeton signé, exposition réseau), cas d'abus non couverts.
3. **Licences** : annexe A, en particulier H3 (IV.2, V.2, V.3, V.5, Exhibit A point 12), GPL du frontend, VAE MOSS.
4. **Modération** : contrat interchangeable, politique allow / review / block, comportement en panne, équilibre
   entre liberté créative et obligations.
5. **Plan** : ordre des phases, critères d'acceptation mesurables et vérifiables, budgets, risques oubliés.

Format attendu : liste de constats classés (bloquant, important, mineur), chacun avec le fichier et la section
concernés, la preuve et une proposition de correction.
