# 1. Audit de l'existant

Base : `origin/main` @ `39cfbc6`. Révision 2 (2026-11-08) après revue Codex : plusieurs briques présentées comme
réutilisables « sans changement » ne le sont pas (correspondance : [09](09-correspondance-revue-codex.md)).

## 1.1 Flux actuel (`verified-code`)

```
Navigateur ── POST /api/jobs (app/api/jobs/route.ts)
                 │ garde lib/jobs/guard.ts : plan via profiles, PLAN_DAILY_QUOTA, MAX_ACTIVE_JOBS = 1,
                 │ screenPrompt, validateReferences, prompt ≤ 2 000 caractères
                 │ puis insertion jobs PLUS LOIN dans la route (L690-745) : pas de transaction commune
                 ├── fournisseurs API appelés depuis Next.js (BytePlus, AtlasCloud, EvoLink, Bailian, HeyGen, Jogg, MuAPI)
                 └── Modal « alphogenai-v2 » : POST /webhook → fonctions GPU ; select_engine() (router.py)
Navigateur ── GET /api/jobs/[id] : client service, aucun contrôle de l'appelant (L104-125) ; machine à états
Modal ─────── update_job() écrit directement en base (client service) ; POST /api/webhooks/modal envoie les e-mails
Public ────── /v/[id] : tout job « done » ; R2 : URL publiques
```

## 1.2 Inventaire

| Brique | Existe (preuve) | Réutilisable | Manque ou à corriger | Décision |
|---|---|---|---|---|
| **Jobs** | `jobs` (status, engine_used, estimated_cost_usd, metadata, output_url_final, video_url ; `image_url` = image **d'entrée** I2V) ; `lib/types.ts` : 4 états ; migration d'origine autorise aussi `cancelled` | Comme **parent** (bibliothèque, quotas, page job) | États enfant, correspondance, annulation | `comfy_runs` enfant + `transition_comfy_run` (02 §2.5) |
| **Garde de création** | `lib/jobs/guard.ts` : compte puis la route insère ; erreurs de comptage non bloquantes ; utilisateur absent → plan free | Les règles métier (plan, quotas, `screenPrompt`) | **Atomicité**, idempotence, refus sur erreur, identité obligatoire | Transaction `admit_comfy_job` qui reprend ces règles (02 §2.5) |
| **Lecture des jobs** | `GET /api/jobs/[id]` : `createServiceClient`, `select("*")`, filtre sur l'id seul | Non pour du privé | Authentification, contrôle propriétaire | Lecture authentifiée pour le parcours ComfyUI (02 §2.6). **Défaut existant en production**, signalé à part |
| **Page publique** | `/v/[id]` : tout job `done` | Non | Indicateur de publication | Lecture limitée aux assets publiés (02 §2.6) |
| **Stockage** | R2 (`lib/r2.ts`, `upload_to_r2` côté Modal) : URL publiques ; bucket privé Supabase `references` (URL signées) | Le bucket privé et le pattern d'URL signées | Stockage privé des sorties | Sorties ComfyUI privées, URL signées courtes (02 §2.6) |
| **Registre des moteurs** | `engines`, `engine_plans`, `engine_costs`, `engine_secrets` ; CHECK `type IN ('api','modal_local')` ; `status` ∈ `active`/`coming_soon`/`deprecated` | Statut, plans, priorité, coût | `POST /api/admin/engines` refuse les autres types (L72) ; `/test` refuse tout sauf `api` (L33) ; `GET /api/engines` assemble des listes statiques | Inventaire des contrats à adapter (02 §2.3, 08) |
| **Routage** | Next.js choisit la famille ; `modal_app/engines/router.py` parcourt tous les moteurs actifs, sans filtre de type ; `modal_app/engines/__init__.py` : inconnu → `wan_i2v` | La priorité comme mécanisme | Filtre par famille exécutable ; erreur explicite | 02 §2.3 + test de non-régression |
| **Contrat moteur Python** | `BaseEngine.generate() -> bytes` (un clip MP4) | Le principe d'un moteur générique piloté par configuration | Ne convient pas aux sorties image, audio ou multiples | Courtier/exécuteur ComfyUI séparé, sans `BaseEngine` par workflow |
| **App Modal** | `alphogenai-v2` ; secret `alphogenai-secrets-corrected-v2` (dont clé Supabase service) ; `retries=0` | Conventions (`retries=0`, secret côté courtier seulement) | Séparation secrets / code tiers | Nouvelle app `alphogenai-comfy` : courtier avec secrets, exécuteur sans secret (02 §2.7) |
| **Déploiement Modal** | `.github/workflows/deploy-modal.yml` : `modal_app/**` sur `main` **et `claude/**`** → déploiement de `video_pipeline.py` + LatentSync | — | Règles de déclenchement | Corrigées **avant** tout fichier sous `modal_app/comfy/` (05 étape 2) |
| **Realtime** | `lib/use-job-realtime.ts` écoute `jobs` et `job_scenes` | Le hook, à étendre | Abonnement `comfy_runs` | Publication realtime + RLS (02 §2.5) |
| **E-mails** | Envoyés par `POST /api/webhooks/modal` sur `done`/`failed` (L77-84) ; `update_job()` Python n'envoie rien | La route et `lib/email.ts` | Événement terminal idempotent | `notified_at` (02 §2.5) |
| **Bibliothèque, page job** | `app/(workspace)/library/page.tsx` rend des vidéos ; `GET /api/jobs/[id]` traite `output_url_final` comme une vidéo (L234-245) | Oui avec adaptation | Rendu par type d'asset | Assets typés (02 §2.6) |
| **Post-production** | Overlay (exige `metadata.research_job_id`), voix-off, export social, miniature, filigrane | Voix-off, export social **si testés** sur les sorties ComfyUI | Overlay générique | Capacités par asset ; overlay non proposé en V1 |
| **Plans, quotas, Stripe** | `PLAN_DAILY_QUOTA` (1 / 50 / illimité), `MAX_ACTIVE_JOBS = 1`, Stripe | Oui (règles reprises dans l'admission) | Pas de portefeuille de crédits ; pas de plafond financier global | `spend_limits` + `spend_ledger` (02 §2.5) ; crédits = chantier séparé (D6) |
| **Coûts** | `jobs.estimated_cost_usd`, `engine_costs` | Oui | Coût réel, allocation | `comfy_runs` + méthode 07 §7.4 |
| **Modération** | `lib/content-policy.ts` (`screenPrompt` : règles et mots-clés, bloque marques protégées et personnalités) ; `validateReferences` (forme du payload) ; consentement Headshot | `screenPrompt` reconnu comme politique existante | Images, vidéo, **audio**, sorties, fournisseurs | Contrat interchangeable (02 §2.8) |
| **Signalement** | Aucun | — | Tout | 02 §2.8 |
| **CGU** | `app/terms/page.tsx`, « 3. Acceptable use » (une phrase) | Socle | Répercussion de l'AUP H3 | Étape 5 |
| **Confidentialité des fournisseurs** | `cleanModelName`, `provider-leak-guard.test.ts` | Oui | Noms de nodes et erreurs ComfyUI | Libellés du manifeste, codes d'erreur publics |
| **Admin** | `requireAdmin` côté serveur (`app/api/admin/middleware.ts`) ; `isAdminEmail` | Oui | — | Toutes les routes admin et le Studio passent par `requireAdmin` |
| **UI de création** | `create/[mode]`, composer TipTap, panneau d'assets | Comme widgets du formulaire | Formulaire généré | `components/comfy/*` |

## 1.3 Hors dépôt (à porter)

| Élément | Emplacement | Contenu prouvé | Usage |
|---|---|---|---|
| Labo H3 | `Documents/Claude/h3-lab/` | `verified-runtime` : ComfyUI v0.42.0 sur H100, graphe API H3, int8, turbo v4, `frames_for()`, `shift_audio()`, mesure lipsync. **Chronométrage** : démarrage ComfyUI mesuré à part ; coût = durée de génération × prix GPU | Graphes de référence, post-traitement, outil QA |
| POC ComfyUI produit | `poc/comfyui_product_photo/` (copie locale, non suivi, absent d'`origin/main`) | `verified-runtime` 2026-10-20 sur L40S | Pattern Modal de référence |
| Workflows communautaires | `Documents/Patreon-Aitrepreneur/workflows/` | Format **UI** | Import via le Studio uniquement |

## 1.4 Paramètres H3 validés (à ne pas modifier sans justification)

| Paramètre | Valeur |
|---|---|
| Modèle | `minimax_h3_fl2va_pruned_int8_convrot.safetensors` |
| Encodeur | `qwen3vl_32b_minimax_h3_int8_convrot.safetensors` (`CLIPLoader type: minimax`) |
| VAE | `minimax_h3_video_vae_int8_convrot` + `minimax_h3_audio_vae_fp32` |
| Turbo | LoRA `minimax_h3_turbo_v4_step600_ema_pruned_comfyui`, force 1, `euler`, `beta`, 8 steps |
| Images | `n = max(5, round(s*24)); n + (5 - n % 17) % 17` |
| Prompt | format officiel |
| Post-production | audio avancé de 0,4 s (validé à l'écoute entre 0,33 et 0,45 s), configurable ; brut conservé en option |
| GPU | H100 (seul testé) |

## 1.5 Défauts existants signalés (hors périmètre de ce chantier)

À traiter dans un correctif séparé, indépendamment de ComfyUI. **Niveau de preuve** : chaque défaut est confirmé par
lecture du code de `main` @ `39cfbc6`. Leur présence dans la **production déployée** (alphogen.com) **n'est pas
vérifiée** : la version réellement déployée sur Vercel et Modal, les règles de cache et la configuration de R2 n'ont
pas été consultées, et aucun test n'a été fait contre la production.

| # | Défaut | Confirmé dans le code de `main` | Vérifié en production |
|---|---|---|---|
| 1 | `GET /api/jobs/[id]` renvoie le job complet à tout appelant qui connaît l'identifiant | Oui (`app/api/jobs/[id]/route.ts` L104-125) | Non |
| 2 | `/v/[id]` publie tout job terminé, sans publication explicite | Oui (`app/v/[id]/page.tsx` L11-23) | Non |
| 3 | Les sorties sont servies par des URL R2 publiques | Oui (`modal_app/video_pipeline.py::upload_to_r2` renvoie `R2_PUBLIC_URL/key`) | Non (configuration du bucket et du domaine public non consultée) |

Vérification proposée, sans risque : comparer le commit déployé (tableau de bord Vercel, dernier déploiement de
production) à `39cfbc6`, puis, avec l'accord du propriétaire, tester le point 1 sur un job de test lui appartenant,
depuis une session anonyme. Ces identifiants étant des UUID, l'exploitation suppose qu'un identifiant ait fuité (lien
partagé, journaux, page publique) ; la gravité reste élevée parce que la réponse contient le job complet.

## 1.6 Écarts documentation / code

- `CLAUDE.md` présente EvoLink comme fournisseur principal ; `HANDOVER.md` et le code montrent un routage
  multi-fournisseurs. `HANDOVER.md` fait foi.
- `budget_guard.py` est importé par `workers/worker.py` et des tests, par aucun fichier de `modal_app/`.
- La copie locale de travail a 23 commits de retard sur `origin/main`. Ce dossier ne s'appuie que sur `origin/main`.
