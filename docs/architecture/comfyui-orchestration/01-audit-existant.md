# 1. Audit de l'existant

Base : `origin/main` @ `39cfbc6`. Pour chaque brique : ce qui existe, ce qu'on réutilise, ce qui manque.
L'objectif est d'**éviter toute duplication** : la colonne « Décision » dit ce que l'implémentation doit faire.

## 1.1 Vue d'ensemble du flux actuel (`verified-code`)

```
Navigateur ── POST /api/jobs (app/api/jobs/route.ts, 1012 l.)
                 │  guard : lib/jobs/guard.ts (plan via profiles, PLAN_DAILY_QUOTA, MAX_ACTIVE_JOBS = 1,
                 │          screenPrompt, validateReferences)
                 │  insertion jobs (status, engine_used, references_payload, metadata jsonb…)
                 ├── fournisseurs API appelés directement depuis Next.js (BytePlus, AtlasCloud, EvoLink,
                 │   Bailian, HeyGen, Jogg, MuAPI)
                 └── Modal app « alphogenai-v2 » (modal_app/video_pipeline.py, 4361 l.)
                       endpoint POST /webhook (x-webhook-secret) → spawn d'une fonction GPU
                       (wan_i2v, ltx_2_3) ; select_engine() dans modal_app/engines/router.py
Navigateur ── GET /api/jobs/[id] (1642 l.) : poller / machine à états (scènes, R2, voix, lipsync)
Modal ─────── met à jour Supabase directement (update_job) ou via POST /api/webhooks/modal
              (liste blanche ALLOWED_UPDATE_FIELDS)
Post-prod ─── fonctions Modal CPU : overlays, voix, concat, export social, miniature, filigrane
```

## 1.2 Inventaire

| Brique | Existe (preuve) | Réutilisable pour ComfyUI | Manque | Décision |
|---|---|---|---|---|
| **Jobs** | Table `jobs` (status, engine_used, estimated_cost_usd, metadata jsonb, output_url_final, video_url, image_url = image d'entrée I2V) ; realtime activé (`20260517_enable_realtime_jobs_scenes.sql`) ; hook `lib/use-job-realtime.ts` | Oui, comme **parent** de chaque exécution ComfyUI : quotas, bibliothèque, page job, realtime, e-mails fonctionnent sans changement | Pas de colonne de sortie « image » (image_url = entrée) ; pas de progression par node ; pas de version de graphe | Garder `jobs`. Ajouter une table enfant `comfy_runs` (D1) et un `jobs.metadata.output_kind` |
| **Garde de création** | `lib/jobs/guard.ts` : `resolveUserPlan`, quota quotidien, 1 job actif, `screenPrompt`, `validateReferences` | Oui, appelé tel quel avant toute exécution ComfyUI | Validation des paramètres du template (types, plages) | Ajouter un validateur de manifeste appelé **après** la garde existante |
| **Registre des moteurs** | Tables `engines`, `engine_plans`, `engine_costs`, `engine_secrets` (`20260416_create_engines_tables.sql`) ; CHECK `type IN ('api','modal_local')` ; pages `/admin/engines` ; routes `/api/admin/engines/*` (dont `/test`) | Oui : statut, plans autorisés, priorité de routage, coût, page admin, bouton de test | Le type `comfy_workflow` | Migration additive : élargir le CHECK. Chaque template publié = une ligne `engines` (D2) |
| **Routage** | Next.js choisit la famille (route.ts:763 « Bailian vs EvoLink vs Modal ») ; `modal_app/engines/router.py` choisit parmi les moteurs Modal par plan et priorité | Oui : la priorité de `engines` fait de ComfyUI le moteur **privilégié** sans réécrire le routeur | Une branche « comfy » dans `app/api/jobs/route.ts` ; des tags de capacité (t2v, i2v, t2i, edit) par template | Ajouter la branche et les capacités dans le manifeste. Ne pas toucher aux autres branches |
| **Contrat moteur Python** | `modal_app/engines/base.py` (`BaseEngine.generate() -> bytes`) ; `generic_api.py` piloté par `api_config` | Le **principe** (un moteur générique piloté par la configuration) est exactement le bon | Rien pour ComfyUI | **Ne pas** créer un `BaseEngine` par workflow. Un seul runner ComfyUI générique, à part (cf. 02) |
| **App Modal** | `alphogenai-v2` (video_pipeline.py) ; secret `alphogenai-secrets-corrected-v2` ; volumes `alphogenai-models`, `huggingface-cache` ; `retries=0` partout ; `scaledown`, GPU par fonction | Les conventions (`retries=0`, secret partagé, `update_job`, `upload_to_r2`, webhook à secret) | Aucun ComfyUI dans le dépôt | Nouvelle app `alphogenai-comfy` (D4). Réutiliser les helpers R2 / Supabase en les **important** et non en les copiant (cf. 08) |
| **Déploiement Modal** | `.github/workflows/deploy-modal.yml` : tout push sur `main` qui touche `modal_app/**` lance `modal deploy modal_app/video_pipeline.py` + l'adaptateur LatentSync | Oui, plus tard | — | **Attention** : un commit sous `modal_app/` redéploie la prod `alphogenai-v2`. Le code ComfyUI ira dans `modal_app/comfy/`, et son déploiement restera manuel jusqu'à validation (D4) |
| **Post-production** | Modal : `apply_overlays_to_video`, `apply_voiceover_to_job`, `apply_research_voiceover_to_video`, `export_social_formats`, `generate_thumbnail`, `add_watermark`, `mux_audio` ; routes `app/api/jobs/[id]/overlay`, `/voiceover` ; `output_url_final` garde `video_url` brut | Oui : une sortie ComfyUI vidéo écrite dans `jobs.video_url` passe ensuite par tous ces boutons sans changement | Le décalage audio H3 (−0,4 s) | Nouveau post-traitement `audio_shift` dans le runner ComfyUI (porté du labo, cf. 1.4) |
| **Stockage** | R2 (`lib/r2.ts`, `upload_to_r2` côté Modal) ; bucket privé Supabase `references` (URL signées) | Oui, sorties et entrées | — | Sorties ComfyUI → R2 sous `comfy/{user_id}/{run_id}/…` |
| **Plans, quotas, Stripe** | `PLAN_DAILY_QUOTA` (free 1, pro 50, premium illimité), `MAX_ACTIVE_JOBS = 1`, Stripe abonnement + idempotence `stripe_events` + isolation `app_id` | Oui, sans changement | **Il n'existe pas de portefeuille de crédits utilisateur.** « Credits » dans le code = soldes des fournisseurs (`/api/admin/credits`) | V1 : quota existant + coût réel tracé par run. Crédits = chantier séparé (D6) |
| **Suivi des coûts** | `jobs.estimated_cost_usd`, `engine_costs`, `lib/byteplus-cost.ts`, `lib/lipsync-cost.ts`, `SHOW_COST_TRACKING_UI` | Oui | Coût **réel** GPU par run | `comfy_runs.gpu_seconds`, `gpu_type`, `cost_usd` ; recopie dans `jobs.estimated_cost_usd` |
| **Modération des entrées** | `lib/content-policy.ts` (`screenPrompt` : IP, personnalités, âge, récit), `validateReferences` (forme du payload), consentement bloquant côté serveur pour Headshot | Oui pour le texte | Aucune modération des **images d'entrée** ni des **sorties** | À créer (D5). Obligatoire pour H3 (annexe A) |
| **Signalement** | Aucun : pas de bouton « Signaler », pas de table de signalements, pas de file admin | — | Tout | À créer avant toute ouverture de H3 (annexe A, section V.5) |
| **Mentions IA** | Texte « AI-generated » dans `app/v/[id]/page.tsx` et `lib/social-metadata.ts` | Oui | Pas de marquage dans les fichiers ; pas de mention garantie sur chaque publication | Étendre : mention obligatoire pour les sorties H3 publiées (AUP point 12) |
| **CGU** | `app/terms/page.tsx`, section « 3. Acceptable use » (une phrase) | Oui, comme socle | Répercussion de la politique d'usage H3 et notification des utilisateurs (licence H3, section V.2) | Compléter (D9) |
| **Confidentialité des fournisseurs** | `lib/engine-intentions.ts` (`cleanModelName`), test `lib/__tests__/provider-leak-guard.test.ts` (liste BytePlus, AtlasCloud, EvoLink, Bailian, Kie.ai, HeyGen, Jogg) | Oui | Les nodes ComfyUI ont des noms techniques (`MiniMaxH3ImageToVideo`, nodes d'API partenaires) qui peuvent fuiter dans les erreurs et formulaires | Libellés publics = ceux du manifeste, jamais `class_type`. Messages d'erreur ComfyUI nettoyés. « MiniMax H3 » reste **obligatoire** (nom de modèle, licence IV.2) |
| **Admin** | `isAdminEmail` (`NEXT_PUBLIC_ADMIN_EMAILS`), layout `(admin)` | Oui pour tout le Studio admin et la gestion des templates | — | Nouvelles pages `/admin/workflows/*` |
| **UI de création** | `app/(workspace)/create/[mode]/page.tsx`, composer TipTap, panneau d'assets, catalogue `app/(workspace)/create/page.tsx` | Composer de prompt, panneau d'assets et upload réutilisés comme **widgets** du formulaire généré | Formulaire généré depuis un manifeste | `components/comfy/manifest-form.tsx` + widgets qui encapsulent l'existant |
| **Feature flags** | `lib/flags.ts` (admin, coûts) | Oui | Pas de flag par module (la carte Amazon est sortie sans kill switch, cf. mémoire produit) | Chaque template a son `status` (draft, admin, beta, live) en base = kill switch sans redéploiement |

## 1.3 Ce qui existe hors dépôt (à porter, pas à recopier aveuglément)

| Élément | Emplacement | Contenu prouvé | Ce qu'on en fait |
|---|---|---|---|
| Labo H3 | `Documents/Claude/h3-lab/` (hors dépôt, tests internes) | `verified-runtime` : ComfyUI v0.42.0 headless sur H100, graphe API H3 (12 nodes), int8, turbo v4, `frames_for()`, `shift_audio()`, mesure lipsync | Le graphe devient `workflows/comfy/minimax-h3/graph.api.json` ; `TURBO_MODES` devient une **variante** du manifeste ; `shift_audio` devient le post-traitement `audio_shift` ; `lipsync_measure.py` devient un outil QA |
| POC ComfyUI photo produit | `poc/comfyui_product_photo/` dans la copie **locale** uniquement (non suivi par git, absent de `origin/main`) | `verified-runtime` 2026-10-20 : ComfyUI v0.42.0 sur L40S, volume `comfyui-models` | Référence pour le pattern Modal. Pas de workflow Amazon dans ce chantier |
| Workflows de la communauté | `Documents/Patreon-Aitrepreneur/workflows/` | Format **UI** (nodes + liens + sous-graphes), pas format API | Importés via le Studio (ouvrir puis « Export API »). **Jamais** de convertisseur maison (cf. 03) |

## 1.4 Paramètres H3 validés à ne pas modifier sans justification

Source `verified-runtime` (h3-lab/RESULTS.md, 2026-11-08) :

| Paramètre | Valeur |
|---|---|
| Modèle | `minimax_h3_fl2va_pruned_int8_convrot.safetensors` |
| Encodeur de texte | `qwen3vl_32b_minimax_h3_int8_convrot.safetensors` (CLIPLoader `type: minimax`) |
| VAE | `minimax_h3_video_vae_int8_convrot` + `minimax_h3_audio_vae_fp32` |
| Turbo | LoRA `minimax_h3_turbo_v4_step600_ema_pruned_comfyui` force 1, `euler`, `beta`, 8 steps |
| Images | `frames_for(s)` : `n = max(5, round(s*24)); n + (5 - n % 17) % 17` (formule du template officiel) |
| Prompt | format officiel (`integrated_multimodal_description`, `[Shot 1]`, `overall_soundscape`, `non_diegetic_music`, `<d>[Langue] …</d>`, `(S1)`) |
| Post-prod | audio avancé de **0,4 s** (plage validée à l'écoute : 0,33 à 0,45 s), configurable ; brut conservé en option |
| GPU | H100 (le labo n'a pas testé d'autre GPU) |

## 1.5 Écarts constatés entre la documentation et le code

À signaler, conformément à `CLAUDE.md` :

- `CLAUDE.md` présente EvoLink comme fournisseur principal ; `HANDOVER.md` et le code montrent un routage multi-fournisseurs. `HANDOVER.md` fait foi.
- `CLAUDE.md` mentionne `budget_guard.py` comme limite de coût GPU par job. Il est importé par `workers/worker.py` et des scripts de test, mais par aucun fichier de `modal_app/` (`verified-code`). Le runner ComfyUI doit porter **sa propre** limite de durée (timeout par template).
- La copie locale de travail a 23 commits de retard sur `origin/main`. Ce dossier ne s'appuie que sur `origin/main`.
