# 6. Risques techniques, limitations et dépendances

## 6.1 Risques

| # | Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|---|
| R1 | **Déploiement involontaire** : un commit sous `modal_app/**` sur `main` redéploie `alphogenai-v2` (`deploy-modal.yml`) | Élevée si non anticipé | Moyen (prod) | Travail en branche + PR ; code ComfyUI dans `modal_app/comfy/` ; déploiement de `alphogenai-comfy` manuel jusqu'à la phase 7 |
| R2 | **Non-conformité H3** : ouverture avant modération, signalement et répercussion des conditions | Moyenne | Élevé (résiliation de licence, section VIII.2) | Phase 4 = porte bloquante ; `plans` du template vides tant qu'elle n'est pas validée |
| R3 | **Exécution de code arbitraire** via custom nodes ou graphe falsifié | Faible avec les contrôles | Critique | Liste blanche par runtime et par template, graphe reconstruit côté serveur, pas de Manager, pas de nodes d'API, réseau coupé si possible |
| R4 | **Évolution de l'API ComfyUI** (routes, messages `/ws`, `object_info`) | Moyenne à chaque montée de version | Moyen | Version figée par runtime ; `comfy-drift` avant toute montée ; tests de contrat sur le client ComfyUI |
| R5 | **Custom nodes cassés ou abandonnés** | Moyenne | Moyen | Commit épinglé, image reconstruite seulement sur décision ; préférer les nodes du cœur ComfyUI |
| R6 | **Démarrages à froid longs** (H3 : ~42 Go de modèles) | Certaine | Moyen (UX, coût) | Memory snapshots, volume dans la même région, modèles int8, `scaledown_window` réglé, préchauffage optionnel aux heures de pointe (coût à valider) |
| R7 | **Mémoire GPU insuffisante** (OOM) en Advanced (résolution, durée) | Moyenne | Faible à moyen | `limits` par template ; code d'erreur `OOM` ; tests aux bornes en phase 2 |
| R8 | **Fuite de noms de fournisseurs** via erreurs ou noms de nodes | Moyenne | Faible à moyen (règle produit) | Codes d'erreur publics, libellés du manifeste, extension du test anti-fuite |
| R9 | **Décalage voix / lèvres H3** dépendant du modèle | Constatée | Moyen | Post-traitement `audio_shift` 0,4 s validé à l'écoute ; à remesurer si la résolution, la langue ou le turbo changent |
| R10 | **Concurrence limitée** : 1 run par conteneur ComfyUI ; `MAX_ACTIVE_JOBS = 1` par utilisateur | Certaine | Faible au début | `max_containers` par runtime ajusté selon le trafic ; file d'attente = statut `queued` visible |
| R11 | **Écart coût estimé / réel** | Moyenne | Moyen | Coût réel par run en base, tableau de bord admin, alerte si écart > 20 % |
| R12 | **Obligations GPL** si le frontend ComfyUI est fourni à des clients (Studio Pro) | Certaine pour le Studio Pro | Moyen | Studio admin interne d'abord ; avis juridique avant Studio Pro ; frontend non modifié, programme séparé |
| R13 | **Licences des modèles et LoRA de la communauté** (non commerciales, interdiction de service hébergé) | Élevée pour les LoRA civitai | Élevé | Catalogue de modèles avec licence obligatoire ; refus d'import d'un modèle sans licence connue |
| R14 | **Contenu illicite généré malgré les filtres** | Faible à moyenne | Élevé | Modération entrées + sorties, signalement, retrait, sanctions (annexe A) |
| R15 | **Workflows de la communauté en format UI** non exécutables tels quels | Certaine | Faible | Import par le Studio (export API natif), jamais de convertisseur maison |

## 6.2 Limitations assumées en V1

- Pas de bascule automatique entre ComfyUI et un fournisseur API en cas d'échec.
- Pas de rebranchement libre des nodes hors Studio (D11).
- Pas de portefeuille de crédits : le quota quotidien existant s'applique (D6).
- H3 limité à ce que les poids ouverts permettent : 768p maximum, pas de module 2K ni de réécriture de prompt
  officielle (réservés à l'API de MiniMax, `verified-docs` labo).
- Un seul GPU testé pour H3 (H100).
- Aperçus intermédiaires seulement là où ComfyUI en envoie (images de sampling) ; pas d'aperçu vidéo partiel garanti.
- Pas d'entraînement, pas de Studio Pro.

## 6.3 Dépendances

| Dépendance | Version / état | Nature |
|---|---|---|
| ComfyUI | v0.42.0 (`verified-runtime` labo + POC) | GPL-3.0 |
| Frontend ComfyUI | `comfyui-frontend-package==1.55.18` (embarqué par v0.42.0) | GPL-3.0 |
| Modal | compte et volumes existants ; nouvelle app `alphogenai-comfy` | Fournisseur GPU |
| Hugging Face | Comfy-Org/MiniMax-H3, drbaph/MiniMax-H3-Turbo-Lora-ComfyUI, Comfy-Org/MOSS-Image | Sources des poids (SHA-256 figés) |
| Custom nodes MOSS | `kijai/ComfyUI-KJNodes` (GPL-3.0), `Fannovel16/comfyui_controlnet_aux` (Apache-2.0), `rgthree/rgthree-comfy` (MIT) | Code tiers exécuté |
| Supabase | migrations additives, RLS, GRANT | Existant |
| Cloudflare R2 | existant | Stockage |
| Outil de modération des sorties | à choisir (D5) | Nouveau |
| Licence MiniMax H3 | autorisation écrite spécifique à ASTUCA OÜ (document privé, hors dépôt) + licence communautaire publique | Conditions à respecter en continu |
