# ComfyUI comme moteur privilégié des workflows d'AlphoGen : dossier d'architecture

Date : 2026-11-08. Base analysée : `origin/main` @ `39cfbc6`.
**Révision 2** : corrections après la revue indépendante de Codex (PR #89, commit `a34ae8f`), puis sept précisions demandées après sa seconde lecture (09 §9.6). Tableau de
correspondance constat par constat : [09-correspondance-revue-codex.md](09-correspondance-revue-codex.md).

Statut : **architecture validée par le propriétaire, révision 2 soumise à revue**. Rien n'est implémenté. Aucun code,
aucune migration, aucun déploiement, aucune dépense n'a été faite pour ce dossier. Développement non autorisé à ce
stade.

## Principe directeur

> ComfyUI valide et exécute ses graphes. AlphoGen assure l'identité, les autorisations, l'admission, les quotas, les
> jobs, la conformité, le stockage privé et la livraison. Modal fournit les environnements d'exécution.

1. **ComfyUI est le moteur privilégié** des workflows de génération compatibles. Les fournisseurs API existants
   restent en place là où ils sont meilleurs. Aucun fournisseur n'est retiré.
2. **Intégration générique** : graphe(s) API exportés nativement + manifeste + catalogue. Ajouter un workflow sur un
   runtime existant ne modifie pas le code commun ; c'est un critère **vérifié** sur MOSS, pas une hypothèse.
3. **Pas de moteur de nodes maison** : AlphoGen ne fait qu'écrire des valeurs dans des entrées déclarées. Les
   variantes structurelles sont des graphes complets exportés par le Studio.
4. **Advanced expose tout ce que l'admin autorise** dans le contrat de widgets (04 §4.2), sans autre limite.
5. **Tout l'existant métier est conservé.** Là où il ne suffit pas (admission, lecture privée, stockage), le parcours
   ComfyUI ajoute ce qui manque sans changer les autres parcours.
6. **Sécurité et conformité avant les premiers contenus utilisateurs**, pas seulement avant l'ouverture publique.

## Sommaire

| # | Livrable | Fichier |
|---|---|---|
| 1 | Audit de l'existant | [01-audit-existant.md](01-audit-existant.md) |
| 2 | Architecture cible (admission, états, confidentialité, isolation, modération) | [02-architecture-cible.md](02-architecture-cible.md) |
| 3 | Studio admin sur l'éditeur ComfyUI natif | [03-frontend-comfyui-studio.md](03-frontend-comfyui-studio.md) |
| 4 | Manifeste, contrat de widgets, variantes | [04-synchronisation-manifeste.md](04-synchronisation-manifeste.md) |
| 5 | Plan d'implémentation, critères d'acceptation, budget de tests | [05-plan-implementation.md](05-plan-implementation.md) |
| 6 | Risques, limitations, dépendances | [06-risques-limitations.md](06-risques-limitations.md) |
| 7 | Coûts Modal et optimisations | [07-couts-modal.md](07-couts-modal.md) |
| 8 | Fichiers et composants | [08-fichiers-composants.md](08-fichiers-composants.md) |
| 9 | Correspondance avec la revue Codex | [09-correspondance-revue-codex.md](09-correspondance-revue-codex.md) |
| A | Licences | [annexe-a-licences.md](annexe-a-licences.md) |

## Labels de preuve

`verified-code` (code lu), `verified-runtime` (exécution observée), `verified-docs` (source officielle), `inferred`
(déduction à confirmer), `unknown` (à vérifier avant de coder dessus).

## Templates de référence

1. **MiniMax H3** (vidéo + audio) : réglages validés en labo repris tels quels.
2. **MOSS-Image** (image), **texte vers image seul** en V1 ; la variante contrôle de profondeur attend une
   clarification juridique (annexe A.3).

## Décisions du propriétaire

### Première série (2026-11-08)

| ID | Décision | Statut |
|---|---|---|
| D1 | `jobs` parent + `comfy_runs` enfant | ✅ (mise en œuvre précisée, 02 §2.4-2.5) |
| D2 | Templates publiés = lignes du registre `engines` (`comfy_workflow`) | ✅ (contrats à adapter, 02 §2.3) |
| D3 | Templates versionnés dans le dépôt + copie publiée en base avec SHA-256 | ✅ |
| D4 | App Modal dédiée `alphogenai-comfy`, déploiement manuel jusqu'à l'étape 7 | ✅ (règles CI corrigées d'abord, 05 étape 2) |
| D5 | Modération interchangeable (API externe ou auto-hébergée), politique séparée, liberté créative, signalement et revue | ✅ (sémantique précisée, 02 §2.8) |
| D6 | Plans + quota existants + coût réel tracé ; crédits = chantier séparé | ✅ |
| D7 | Studio admin en CPU, tests via le parcours normal | ✅ (vérifié dès l'étape 1) |
| D8 | MOSS sans encodeur « abliterated », licences vérifiées avant tout déploiement | ✅ |
| D9 | Textes juridiques rédigés par l'agent, validés par le propriétaire | ✅ |
| D10 | Budget de tests 3,00 $ max, aucune dépense sans autorisation, estimations complètes | ✅ (05 §5.9) |
| D11 | Advanced : pas de rebranchement libre hors Studio | ✅ |

### Deuxième série, après la revue Codex (2026-11-08)

| ID | Décision | Statut |
|---|---|---|
| D12 | Générations **privées par défaut**, publication explicite uniquement | ✅ |
| D13 | Authentification et autorisation obligatoires pour accéder aux résultats privés | ✅ |
| D14 | Admission atomique, idempotence, réservation des ressources | ✅ |
| D15 | Isolation du moteur ComfyUI et des secrets métier | ✅ |
| D16 | Aucune exécution de graphe arbitraire fourni par un utilisateur | ✅ |
| D17 | Modération images, vidéo **et audio**, politique de rétention explicite | ✅ |
| D18 | MOSS texte vers image d'abord ; contrôle de profondeur après clarification juridique | ✅ |
| D19 | Plafond financier global distinct du budget de tests | ✅ |
| D20 | Confirmation des droits MiniMax H3 conservée hors dépôt public | ✅ |

### À trancher par le propriétaire avant développement

| ID | Question | Proposition |
|---|---|---|
| Q1 | Réutilisation des conteneurs entre utilisateurs (02 §2.7) | `cross_user` pour H3 (cœur ComfyUI seul) après test de fuite ; `none` pour MOSS au départ. Dans tous les cas, **revue écrite obligatoire de chaque custom node** |
| Q2 | Plafonds financiers et filet Modal (02 §2.5) | `comfy_global` : 5 $/jour et 50 $/mois pendant la bêta. Filet : soit la limite de dépense de l'espace Modal au-dessus des besoins de la production existante, soit un **espace Modal séparé** pour `alphogenai-comfy` (recommandé, pour qu'un dépassement ComfyUI n'arrête jamais la production) |
| Q3 | Délais de modération | revue ≤ 48 h ; contenu `held` sans décision supprimé à 7 jours ; contenu `blocked` supprimé à 7 jours, métadonnées gardées 12 mois |
| Q4 | Révocation des médias (02 §2.6) | URL signées de 10 min, purge du cache ≤ 5 min, délai maximal garanti ≤ 15 min |
| Q5 | Défauts confirmés dans le code de `main` (01 §1.5), présence en production non vérifiée | vérifier le commit déployé, puis correctif dédié et séparé de ce chantier, à autoriser |
| Q6 | Quota quotidien sur un run échoué pour cause d'infrastructure | règle actuelle conservée (tout job créé compte) ; remboursement possible plus tard, décision produit |

## Points encore ouverts

| Point | Responsable | Avant |
|---|---|---|
| Attestation privée des droits H3 (entité, territoires des utilisateurs, **lieu de calcul**, usages) | Propriétaire, hors dépôt | Premier run H3 sur l'infra AlphoGen (étape 4) |
| Provenance du LoRA contrôle MOSS (cartes d'entraînement non commerciales) | Propriétaire (juridique) | Toute réactivation de la variante contrôle |
| Licence du VAE `flux2-vae` complet ; à défaut, VAE small (Apache-2.0) | Agent + propriétaire | Étape 6 |
| Contrainte réelle `jobs.status` en production | Agent (lecture seule) | Étape 1 |
| Transit des arguments Modal avec `block_network` | Agent (test CPU, sur autorisation) | Étape 1 |
| Avis juridique GPL du frontend | Propriétaire | Studio Pro (hors V1) |

## Revue de la révision 2

Une nouvelle revue critique est attendue sur les mêmes axes (architecture, sécurité, licences, modération, plan),
en vérifiant en priorité que chaque correction de 09 répond bien au constat initial. Format : constats classés
bloquant / important / mineur, avec fichier, section, preuve et correction proposée.
