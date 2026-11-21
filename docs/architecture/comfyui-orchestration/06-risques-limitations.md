# 6. Risques techniques, limitations et dépendances

Révision 2 (2026-11-08), après revue Codex.

## 6.1 Risques

| # | Risque | Probabilité | Impact | Mitigation | Étape |
|---|---|---|---|---|---|
| R1 | **Déploiement involontaire** : `modal_app/**` sur `main` **ou `claude/**`** redéploie `alphogenai-v2` ; un dossier `modal_app/comfy/` ne l'évite pas | Élevée | Moyen (prod) | Règles de déclenchement corrigées et testées **avant** le premier fichier sous `modal_app/comfy/` | 2 |
| R2 | **Exposition de contenus privés** (lecture sans contrôle, page publique implicite, URL R2 publiques) | Confirmée dans le code de `main` ; production non vérifiée | Élevé | Privé par défaut, couche d'accès, publication explicite, retrait testé | 2 |
| R3 | **Admission non atomique** : doublons, dépassement de quota, jobs orphelins, dépenses répétées | Moyenne | Moyen à élevé | Transaction d'admission, idempotence, outbox, prise en charge atomique, expiration | 2 |
| R4 | **Code tiers privilégié** : un custom node compromis lit les secrets ou les données d'un autre utilisateur | Faible à moyenne | Critique | Revue des packs, exécuteur sans secret et réseau bloqué, politique de réutilisation, recyclage, test de fuite | 3 |
| R5 | **Routage historique** qui sélectionne un template ComfyUI puis exécute Wan | Moyenne si non traité | Moyen | Filtre par famille, erreur explicite, test de non-régression | 2 |
| R6 | **Contenu livré pendant une panne de modération** ou **audio non contrôlé** | Moyenne | Élevé | États `held`/`blocked`, `fail_closed` pour H3, transcription de l'audio, catégorie absente = `held` | 5 |
| R7 | **Non-conformité H3** : ouverture avant les obligations, ou usage hors du périmètre de l'autorisation (y compris la **région de calcul**) | Moyenne | Élevé (résiliation, section VIII.2) | Attestation privée avant le premier run H3 sur l'infra AlphoGen ; étape 5 bloquante | 0, 5 |
| R8 | **Hypothèse `block_network`** non vérifiée (transit des arguments et retours Modal) | Inconnue | Moyen | Test en étape 1 ; repli documenté (02 §2.7) | 1 |
| R9 | **Studio en CPU impossible** pour un runtime (pack qui exige un GPU à l'import) | Moyenne | Faible à moyen | Vérification en étape 1 ; sinon Studio GPU à la demande, sur autorisation | 1 |
| R10 | **Évolution de l'API ComfyUI** | Moyenne à chaque montée de version | Moyen | Version figée par runtime ; `comfy-drift` ; tests de contrat du client | 3 |
| R11 | **Custom nodes cassés ou abandonnés** | Moyenne | Moyen | Commit épinglé ; préférer le cœur ComfyUI ; sortir du runtime les packs inutiles après export | 1, 6 |
| R12 | **Démarrages à froid longs** (~42 Go de modèles H3) | Certaine | Moyen | int8, fenêtre d'inactivité réglée, snapshots à mesurer | 4 |
| R13 | **OOM** en Advanced | Moyenne | Faible à moyen | `limits` par template, code `OOM`, recyclage du conteneur | 3, 4 |
| R14 | **Fuite de noms de fournisseurs** (nodes, erreurs) | Moyenne | Faible à moyen | Libellés du manifeste, codes publics, test anti-fuite étendu | 3, 5 |
| R15 | **Décalage voix / lèvres H3** propre au modèle | Constatée | Moyen | `audio_shift` 0,4 s ; remesure si résolution, langue ou turbo changent | 4 |
| R16 | **Écart coût estimé / facturé** (inactivité, CPU et mémoire non comptés au labo) | Élevée sans méthode | Moyen | Mesure de tous les postes, allocation définie, rapprochement par période | 4 |
| R17 | **Dépense cumulée non bornée** | Moyenne | Élevé | Plafond global à l'admission + limite de dépense de l'espace Modal | 2 |
| R18 | **Licences et provenance** des modèles et LoRA (ex. LoRA contrôle MOSS entraîné sur des cartes produites par un modèle sous licence non commerciale) | Élevée pour la communauté | Élevé | Catalogue avec preuve par fichier et révision ; variante contrôle en attente de clarification | 6 |
| R19 | **Obligations GPL** si le frontend est fourni à des clients | Certaine pour un Studio Pro | Moyen | Studio admin interne ; avis juridique avant toute diffusion | Hors V1 |
| R20 | **Workflows communautaires en format UI** | Certaine | Faible | Import par le Studio (export API natif) | 1 |

## 6.2 Limitations assumées en V1

- Pas de bascule automatique entre ComfyUI et un fournisseur API.
- Pas de rebranchement de nodes hors Studio ; variantes = graphes complets exportés.
- Widgets générés seulement dans le contrat 04 §4.2 ; le reste demande une extension déclarée.
- Pas de portefeuille de crédits (D6).
- H3 : 768p maximum, pas de 2K ni de réécriture de prompt officielle (API MiniMax uniquement).
- Un seul GPU testé pour H3 (H100).
- Overlay non proposé pour les sorties ComfyUI.
- MOSS : texte vers image seul ; contrôle de profondeur en attente de clarification de la provenance.
- Pas d'entraînement, pas de Studio Pro.

## 6.3 Dépendances

| Dépendance | Version / état | Nature |
|---|---|---|
| ComfyUI | v0.42.0 (`verified-runtime`) | GPL-3.0 |
| Frontend ComfyUI | `comfyui-frontend-package==1.55.18` (embarqué par v0.42.0) | GPL-3.0 |
| Modal | nouvelle app `alphogenai-comfy` ; volumes ; limite de dépense de l'espace | Fournisseur |
| Hugging Face | Comfy-Org/MiniMax-H3, drbaph/MiniMax-H3-Turbo-Lora-ComfyUI, Comfy-Org/MOSS-Image, black-forest-labs/FLUX.2-small-decoder | Poids (révision + SHA-256 figés) |
| Custom nodes MOSS | seulement ceux qui restent après l'export API ; candidats : KJNodes (GPL-3.0), controlnet_aux (Apache-2.0), rgthree (MIT) | Code tiers à auditer |
| Supabase | migrations additives, RLS, GRANT, fonctions SQL d'admission et de transition | Existant |
| Stockage privé | bucket privé + URL signées | Existant (bucket `references`) à étendre |
| Modération | fournisseurs choisis sur banc de test (étape 5) | Nouveau |
| Transcription | Whisper (déjà utilisé par le module Clipping sur Modal) | Existant |
| Licence MiniMax H3 | autorisation écrite spécifique (privée, hors dépôt) + licence communautaire publique | Conditions continues |
