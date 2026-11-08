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
**Décision avant ouverture** : le propriétaire confirme le périmètre (territoires, usages) couvert par cette
autorisation.

### A.1.1 Obligations de la licence publique et leur traduction dans AlphoGen

| Clause | Obligation | Implémentation | Phase |
|---|---|---|---|
| IV.2 | Afficher **« MiniMax H3 » de façon visible** dans l'interface de tout produit commercial qui l'utilise | Titre du template = « MiniMax H3 » ; test qui l'impose ; `cleanModelName` ne doit pas le retirer ; « MiniMax » n'est pas un nom de fournisseur interdit au sens du test anti-fuite (nom de modèle) | 3 |
| IV.1 | Autorisation écrite préalable si les revenus annuels dépassent 20 M$ | Suivi par le propriétaire | — |
| V.1 + Exhibit A | Respect de la politique d'usage (20 interdictions : mineurs, usurpation d'identité sans consentement, désinformation, faux avis et engagement artificiel, harcèlement, usage militaire, décisions automatisées à haut risque, etc.) | CGU, modération des entrées et des sorties, signalement | 4 |
| V.2 | **Lier chaque utilisateur** par des conditions au moins aussi protectrices que la section V et l'Exhibit A, **et l'en informer** | Section CGU dédiée + acceptation enregistrée (date, version) avant le premier run H3 + notice à côté du modèle | 4 |
| V.3 | Ne pas utiliser H3 ni ses sorties pour **améliorer un autre modèle** que H3 ou ses dérivés | Provenance enregistrée sur chaque sortie ; futur module d'entraînement : un dataset contenant des sorties H3 ne peut servir qu'à un dérivé de H3 | 4 / entraînement |
| V.4 | Pas d'usage hors territoire autorisé | Périmètre de l'autorisation spécifique (décision ci-dessus) ; contrôle géographique si le périmètre l'exige | 4 |
| V.5 | **Avant** la mise à disposition et pendant toute l'exploitation : garde-fous techniques et organisationnels « raisonnables et proportionnés », **testés** et **revus périodiquement** ; ne pas les affaiblir | Modération entrées + sorties, plafonds, procédure de revue (`docs/compliance/minimax-h3.md`), tests automatisés de la modération | 4 |
| V.5 | **Mécanisme accessible de signalement** | Bouton « Signaler » (page job, page publique, galerie) + table `content_reports` | 4 |
| V.5 | Sur signalement de bonne foi : enquête rapide, retrait ou désactivation, **suspension des récidivistes** | File admin, retrait en une action, compteur d'infractions, suspension | 4 |
| Exhibit A, point 12 | Toute diffusion dans un environnement public doit indiquer **clairement** que le contenu est généré par une machine | Mention dans `social-metadata`, publications planifiées, page publique `/v/[id]` | 4 |
| Exhibit A, point 13 | Pas d'usurpation d'une personne sans son consentement | Consentement bloquant côté serveur pour toute image de personne réelle en entrée (pattern Headshot existant) | 4 |
| III.1 | Fournir une copie de la licence aux tiers qui utilisent un service lié | Lien vers la licence dans la notice du modèle et dans les CGU | 4 |
| III.3 (encouragé) | « Powered by MiniMax H3 », identifiant de génération IA dans les fichiers, retour d'expérience public | Identifiant IA dans les métadonnées des fichiers H3 (recommandé) ; le reste est optionnel | 4 |
| III.2 / III.4 | Notices sur fichiers modifiés et fichier « NOTICE » | S'applique à la **redistribution des poids** (hors service hébergé). AlphoGen ne redistribue pas les poids : non applicable tant que c'est le cas | — |
| VI.4 | MiniMax ne revendique aucun droit sur les sorties ; l'utilisateur en est responsable | Rappel dans les CGU | 4 |
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
- [ ] Périmètre territorial confirmé.

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
  distribution. Il faut alors proposer le code source correspondant de la version servie (et de nos
  modifications éventuelles) sous GPL-3.0. Le garder comme **programme séparé** (servi par le conteneur ComfyUI,
  pas intégré au bundle Next.js) évite d'étendre ces obligations au code d'AlphoGen (`inferred`, **avis juridique
  avant ouverture**).
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
| LoRA de contrôle `moss_image_color_depth_control` (origine `darask0/MOSS-Image-color-depth-control`) | Apache-2.0 | `verified-docs` | Retenu pour la variante contrôle |
| LoRA d'édition `moss_image_edit_lora_rank_64` (origine `chinoll/Moss-Image-Edit`) | Aucune licence déclarée sur la fiche | `verified-docs` (absence de licence) | **Exclu** (hors périmètre V1 de toute façon) |
| Encodeur « abliterated » utilisé par le workflow communautaire | Tiers | — | **Exclu** : il retire les garde-fous du modèle de langage, incompatible avec nos engagements de modération |
| Depth Anything V2 (préprocesseur du contrôle de profondeur) | Small : Apache-2.0 ; Base, Large : CC-BY-NC-4.0 (non commercial) | `verified-docs` (fiches `depth-anything/Depth-Anything-V2-*`) | Variante **Small uniquement**, imposée dans le graphe et le catalogue |

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

Aucun fichier n'entre dans un catalogue de runtime sans : source, SHA-256, licence, preuve (lien et date),
mention de l'usage commercial et du service hébergé. Le validateur d'import refuse un modèle sans licence connue.
