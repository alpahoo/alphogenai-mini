# Annexe A. Licences : MiniMax H3, ComfyUI, MOSS-Image, custom nodes

> Analyse technique, **pas un avis juridique**. Les points marqués « avis juridique » doivent être validés par un
> conseil avant l'ouverture correspondante. Le dépôt est **public** : les termes de l'autorisation spécifique
> obtenue de MiniMax ne sont pas reproduits ici.

## A.1 MiniMax H3

Sources : licence publique « MiniMax H3 Community License Agreement » du 2 août 2026, fichier `LICENSE` de
`huggingface.co/MiniMaxAI/MiniMax-H3`, lu le 2026-11-08 (`verified-docs`). Concédant : Nanonoble Pte. Ltd. (MiniMax).
Droit applicable : Hong Kong.

**Situation d'ASTUCA OÜ.** La licence publique exclut l'Union européenne, le Royaume-Uni, la Corée du Sud et les
États-Unis (définition I.5) et invite les entités de ces territoires à demander une licence (section II). ASTUCA OÜ
détient une **autorisation écrite spécifique** de MiniMax (document privé, conservé hors dépôt). Elle est
conditionnée au respect continu des engagements pris dans la demande. Ces engagements et ces documents sont
**confidentiels** : ils ne doivent figurer ni dans le dépôt, ni dans une PR, ni dans un ticket, ni dans un log.
Le propriétaire vérifie qu'ils sont couverts par la liste A.1.2, ou la complète hors dépôt.
**Attestation privée obligatoire avant le premier run H3 sur l'infrastructure AlphoGen** (y compris en test
interne, étape 4), et non à l'ouverture bêta : le propriétaire confirme, hors dépôt, que l'autorisation couvre
l'entité, les territoires des utilisateurs, **le lieu de calcul** (région Modal), les usages envisagés et les
conditions applicables. Le dépôt ne mentionne que l'existence de l'attestation et sa date.

### A.1.1 Obligations de la licence publique et leur traduction dans AlphoGen

| Clause | Obligation | Implémentation | Étape |
|---|---|---|---|
| IV.2 | Afficher **« MiniMax H3 » de façon visible** dans l'interface de tout produit commercial qui l'utilise | Titre du template = « MiniMax H3 » ; test qui l'impose ; `cleanModelName` ne doit pas le retirer ; « MiniMax » n'est pas un nom de fournisseur interdit au sens du test anti-fuite (nom de modèle) | 5 |
| IV.1 | Autorisation écrite préalable si les revenus annuels dépassent 20 M$ | Suivi par le propriétaire | — |
| V.1 + Exhibit A | Respect de la politique d'usage (20 interdictions : mineurs, usurpation d'identité sans consentement, désinformation, faux avis et engagement artificiel, harcèlement, usage militaire, décisions automatisées à haut risque, etc.) | CGU, modération des entrées et des sorties, signalement | 5 |
| V.2 | **Lier chaque utilisateur** par des conditions au moins aussi protectrices que la section V et l'Exhibit A, **et l'en informer** | Section CGU dédiée + acceptation enregistrée (date, version) avant le premier run H3 + notice à côté du modèle | 5 |
| V.3 | Ne pas utiliser H3 ni ses sorties pour **améliorer un autre modèle** que H3 ou ses dérivés | Provenance enregistrée sur chaque sortie ; futur module d'entraînement : un dataset contenant des sorties H3 ne peut servir qu'à un dérivé de H3 | 5 / entraînement |
| V.4 | Pas d'usage hors territoire autorisé | Périmètre de l'autorisation spécifique (décision ci-dessus) ; contrôle géographique si le périmètre l'exige | 5 |
| V.5 | **Avant** la mise à disposition et pendant toute l'exploitation : garde-fous techniques et organisationnels « raisonnables et proportionnés », **testés** et **revus périodiquement** ; ne pas les affaiblir | Modération entrées + sorties, plafonds, procédure de revue (`docs/compliance/minimax-h3.md`), tests automatisés de la modération | 5 |
| V.5 | **Mécanisme accessible de signalement** | Bouton « Signaler » (page job, page publique, galerie) + table `content_reports` | 5 |
| V.5 | Sur signalement de bonne foi : enquête rapide, retrait ou désactivation, **suspension des récidivistes** | File admin, retrait en une action, compteur d'infractions, suspension | 5 |
| Exhibit A, point 12 | Toute diffusion dans un environnement public doit indiquer **clairement** que le contenu est généré par une machine | Mention dans `social-metadata`, publications planifiées, page publique `/v/[id]` | 5 |
| Exhibit A, point 13 | Pas d'usurpation d'une personne sans son consentement | Consentement bloquant côté serveur pour toute image de personne réelle en entrée (pattern Headshot existant) | 5 |
| III.1 | Fournir une copie de la licence aux tiers qui utilisent un service lié | Lien vers la licence dans la notice du modèle et dans les CGU | 5 |
| III.3 (encouragé) | « Powered by MiniMax H3 », identifiant de génération IA dans les fichiers, retour d'expérience public | Identifiant IA dans les métadonnées des fichiers H3 (recommandé) ; le reste est optionnel | 5 |
| III.2 / III.4 | Notices sur fichiers modifiés et fichier « NOTICE » | S'applique à la **redistribution des poids** (hors service hébergé). AlphoGen ne redistribue pas les poids : non applicable tant que c'est le cas | — |
| VI.4 | MiniMax ne revendique aucun droit sur les sorties ; l'utilisateur en est responsable | Rappel dans les CGU | 5 |
| VIII.2 | En cas de manquement : résiliation, arrêt immédiat, suppression des copies, information des destinataires | Kill switch : `status` du template et `engines.status` coupent H3 sans déploiement | 2 |
| Note finale | L'encodeur Qwen3-VL-32B est sous Apache-2.0 | Mention dans le catalogue du runtime | 1 |

### A.1.2 Liste de contrôle avant le premier utilisateur non admin

- [ ] « MiniMax H3 » visible sur la page de création, le job et la page publique.
- [ ] CGU mises à jour (répercussion section V + Exhibit A), validées par le propriétaire, acceptation enregistrée.
- [ ] Notice à côté du modèle : rappel des usages interdits, lien licence, « contenu généré par IA ».
- [ ] Modération du prompt (existant) et des images d'entrée.
- [ ] Modération des sorties avant livraison.
- [ ] Bouton « Signaler », file admin, retrait en une action, suspension des récidivistes.
- [ ] Mention IA sur toute publication publique.
- [ ] Provenance H3 enregistrée sur chaque sortie.
- [ ] Procédure de revue périodique écrite (fréquence, responsable, journal).
- [ ] Engagements de l'autorisation spécifique vérifiés par le propriétaire (hors dépôt).
- [ ] Périmètre confirmé hors dépôt : territoires des utilisateurs, lieu de calcul, usages.
- [ ] Contenus privés par défaut, publication explicite, retrait effectif (02 §2.6).
- [ ] Modération de l'audio (transcription) et de chaque variante livrable, brut compris.

### A.1.3 LoRA turbo v4

`drbaph/MiniMax-H3-Turbo-Lora-ComfyUI` (conversion de `larryvrh/MiniMax-H3-Turbo-Lora`) : Apache-2.0 (`verified-docs`
labo). C'est un **dérivé de H3** au sens de la définition I.11 : la licence H3 s'applique en plus de l'Apache-2.0
(`inferred`). Pas d'obligation supplémentaire tant qu'il n'est pas redistribué.

## A.2 ComfyUI et son frontend

| Composant | Licence | Preuve |
|---|---|---|
| ComfyUI (backend) | GPL-3.0 | `verified-docs` (GitHub API, dépôt `Comfy-Org/ComfyUI`) |
| Frontend `Comfy-Org/ComfyUI_frontend` (`comfyui-frontend-package`) | GPL-3.0 | `verified-docs` |
| `comfy-cli` | GPL-3.0 | `verified-docs` |

Lecture :

- **Usage côté serveur (runner, SaaS)** : la GPL-3.0 (contrairement à l'AGPL) impose ses obligations lors de la
  **distribution** du logiciel, pas lors de son exécution pour fournir un service en ligne. Exécuter ComfyUI sur
  Modal pour générer des contenus ne crée pas d'obligation de publier le code d'AlphoGen (`inferred`, avis juridique
  recommandé). Les sorties générées ne sont pas couvertes par la GPL.
- **Studio admin** : utilisé en interne par ASTUCA OÜ, pas de distribution à des tiers (`inferred`).
- **Studio Pro** : le frontend (JavaScript) est **transmis** au navigateur des clients, ce qui peut constituer une
  distribution. Il faut alors proposer les sources correspondantes de la version servie (et de nos modifications
  éventuelles), les notices, et un inventaire exact des composants. Le servir comme **programme séparé** est une
  bonne précaution architecturale, mais **ne garantit pas** à lui seul le statut juridique de l'intégration
  (`inferred`, **avis juridique avant toute diffusion à des clients**).
- **Custom nodes écrits par AlphoGen** (aucun prévu) : chargés par ComfyUI, ils seraient vraisemblablement des
  œuvres dérivées ; sans conséquence tant qu'ils ne sont pas distribués.

## A.3 MOSS-Image et ses dépendances

| Élément | Licence | Preuve | Décision |
|---|---|---|---|
| `OpenMOSS-Team/MOSS-Image-SFT` et `-Base` | Apache-2.0 | `verified-docs` (fiche HF) | Utilisable, usage commercial permis |
| `Comfy-Org/MOSS-Image` (reconditionnement ComfyUI : SFT/Base int8, LoRA contrôle et édition, encodeur, VAE) | Apache-2.0 (fiche du dépôt) | `verified-docs` | Source retenue |
| Encodeur `qwen3.5_9b` (Comfy-Org) / `Qwen/Qwen3.5-9B` | Apache-2.0 | `verified-docs` | Retenu (version int8) |
| VAE `flux2-vae_small.safetensors` (Comfy-Org/MOSS-Image, SHA-256 `d8d52ba0…`) | Apache-2.0 : fichier **identique** (même SHA-256) à `black-forest-labs/FLUX.2-small-decoder` (Apache-2.0) | `verified-docs` (comparaison des empreintes LFS, 2026-11-08) | **Retenu par défaut** |
| VAE `flux2-vae.safetensors` (Comfy-Org/MOSS-Image, SHA-256 `868fe7b3…`) | **Ambiguë.** Le même fichier (même SHA-256) est publié dans `Comfy-Org/Flux-2-Klein-4B` (Apache-2.0, reconditionnement de `black-forest-labs/FLUX.2-klein-4B`, Apache-2.0), mais aussi sous le nom `ae.safetensors` dans `black-forest-labs/FLUX.2-dev` (licence non commerciale) et dans `Comfy-Org/Flux-2-Klein-9B` (non commerciale) | `verified-docs` (empreintes LFS, 2026-11-08) | Utilisable seulement en le **sourçant depuis le dépôt Apache-2.0** Klein-4B, et après confirmation écrite (fiche officielle ou réponse de Black Forest Labs) que le VAE de FLUX.2 est sous Apache-2.0. Sinon, VAE small |
| LoRA de contrôle `moss_image_color_depth_control` (origine `darask0/MOSS-Image-color-depth-control`) | Poids déclarés Apache-2.0, **mais** la fiche précise que les cartes de profondeur d'entraînement ont été produites avec Depth Anything V2 **Large (CC-BY-NC-4.0)**, et les cartes de couleur avec Mask2Former Swin-L sur COCO panoptique | `verified-docs` (fiche lue le 2026-11-08 ; constat de la revue Codex) | **En attente de clarification** (hors périmètre V1, décision D18). Voir A.3.1 |
| LoRA d'édition `moss_image_edit_lora_rank_64` (origine `chinoll/Moss-Image-Edit`) | Aucune licence déclarée sur la fiche | `verified-docs` (absence de licence) | **Exclu** (hors périmètre V1 de toute façon) |
| Encodeur « abliterated » utilisé par le workflow communautaire | Tiers | — | **Exclu** : il retire les garde-fous du modèle de langage, incompatible avec nos engagements de modération |
| Depth Anything V2 (préprocesseur du contrôle de profondeur) | Small : Apache-2.0 ; Base, Large : CC-BY-NC-4.0 (non commercial) | `verified-docs` (fiches `depth-anything/Depth-Anything-V2-*`) | Sans objet en V1 (variante contrôle en attente de clarification) ; si elle est réactivée : **Small uniquement** |

### A.3.1 Provenance du LoRA de contrôle : faits et questions ouvertes

Faits (fiche `darask0/MOSS-Image-color-depth-control`, lue le 2026-11-08) :

- les **poids publiés** sont déclarés sous Apache-2.0 ;
- les **cartes de profondeur** utilisées pour l'entraînement ont été produites avec Depth Anything V2 Large, dont les
  poids sont sous CC-BY-NC-4.0 ;
- les **cartes de couleur** viennent de Mask2Former Swin-L appliqué à COCO panoptique (licences des annotations et des
  images à vérifier séparément) ;
- le LoRA est entraîné sur MOSS-Image Base et utilisé avec MOSS-Image SFT.

Ce que ces faits **ne permettent pas** de conclure : ni que l'usage commercial du LoRA est interdit, ni qu'il est
permis. La question juridique est de savoir si une restriction non commerciale portant sur les **poids** d'un modèle
s'étend aux **sorties** de ce modèle (ici les cartes de profondeur), puis aux poids d'un autre modèle entraîné sur
ces sorties. La réponse dépend du texte de la licence, de la juridiction et éventuellement de la position de
l'auteur.

Questions à clarifier avant toute réactivation :

1. Lecture de la CC-BY-NC-4.0 de Depth Anything V2 Large sur ce point (avis juridique).
2. Position écrite de l'auteur du LoRA (question posée sur la fiche ou par contact).
3. Licences des données COCO et de Mask2Former utilisées pour les cartes de couleur.
4. Alternative : réentraîner ou choisir un adaptateur dont toute la chaîne d'entraînement est sous licence permissive.

Jusque-là, la variante contrôle reste hors périmètre (D18). Cette prudence est une décision de gestion du risque,
pas une conclusion juridique.

**Règle MOSS** : aucun déploiement du runtime `moss-image@1` tant que chaque fichier de son catalogue n'a pas une
licence `verified-docs` compatible avec un usage commercial en service hébergé. Le validateur d'import refuse les
autres.
| LoRA de la communauté (civitai, etc.) | Variables, souvent non commerciales | — | Exclues sauf licence vérifiée et inscrite au catalogue |

## A.4 Custom nodes

| Pack | Licence | Preuve | Usage prévu |
|---|---|---|---|
| `kijai/ComfyUI-KJNodes` | GPL-3.0 | `verified-docs` | MOSS (nodes virtuels, prompt builder) ; usage serveur, pas de distribution |
| `Fannovel16/comfyui_controlnet_aux` | Apache-2.0 (les modèles téléchargés par les préprocesseurs ont leur propre licence) | `verified-docs` | MOSS contrôle ; vérifier chaque modèle de préprocesseur |
| `rgthree/rgthree-comfy` | MIT | `verified-docs` | Seulement si un node d'exécution reste après l'export API |

## A.5 Entraînement (phase ultérieure)

| Outil | Licence | Preuve |
|---|---|---|
| `ostris/ai-toolkit` | MIT | `verified-docs` |
| Autres entraîneurs (musubi-tuner, etc.) | à vérifier | `unknown` |

Contrainte H3 rappelée : section V.3 (sorties H3 interdites pour entraîner un autre modèle que H3 ou ses dérivés).

## A.6 Règle générale pour tout nouveau modèle ou node

Aucun fichier n'entre dans un catalogue de runtime sans : source, **révision** (commit Hugging Face ou Git),
SHA-256, licence, preuve (lien et date), **provenance des données d'entraînement quand la fiche la mentionne**,
mention de l'usage commercial et du service hébergé. Le validateur d'import refuse un modèle sans licence connue.
Une licence vérifiée vaut pour la révision épinglée seulement : toute montée de version la revérifie, y compris les
téléchargements transitifs des custom nodes (modèles de préprocesseurs).

Les comparaisons d'empreintes LFS de A.3 (VAE) ont été faites par l'auteur du dossier et n'ont pas été reproduites
par la revue : elles sont refaites et consignées dans le catalogue à l'étape 1.
