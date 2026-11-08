# 8. Fichiers et composants à créer ou modifier

Révision 2 (2026-11-08). Chemins relatifs à la racine du dépôt (`origin/main`). « Étape » renvoie au plan (05).
Principe : **créer** du générique, **modifier** l'existant au minimum, ne **rien supprimer**.

## 8.1 À créer

| Chemin | Étape | Rôle |
|---|---|---|
| `workflows/comfy/runtimes/h3-video@1.yaml` | 1 | Runtime H3 (cœur ComfyUI seul), catalogue (source, révision, SHA-256, licence), GPU, politique de réutilisation |
| `workflows/comfy/runtimes/moss-image@1.yaml` | 1 / 6 | Runtime MOSS (packs restants après export, épinglés et revus) |
| `workflows/comfy/runtimes/reviews/<pack>@<commit>.md` | 6 | Revue écrite de chaque custom node |
| `workflows/comfy/templates/minimax-h3/graph.{t2v,i2v,t2v_full}.api.json` | 1 | Graphes exportés nativement |
| `workflows/comfy/templates/minimax-h3/{manifest.json, object_info.snapshot.json, README.md}` | 1 / 4 | Manifeste, schéma figé, origine et mesures |
| `workflows/comfy/templates/moss-image/*` | 1 / 6 | Idem, texte vers image seul |
| `workflows/comfy/templates/_test-image/*` | 3 | Template factice CPU (image vide → sauvegarde) |
| `lib/comfy/manifest-schema.ts` | 3 | Types et validation de structure |
| `lib/comfy/widgets-contract.ts` | 3 | Contrat de widgets supportés (04 §4.2) |
| `lib/comfy/validate-params.ts` | 3 | Validation par rôle, plans, verrous, plafonds, rejet des clés inconnues |
| `lib/comfy/resolve-graph.ts` | 3 | Choix de variante, `set`, dérivés, hash, `resolver_version` (seul résolveur) |
| `lib/comfy/derived.ts` | 3 | `frames_from_seconds`, `dims_from_aspect`, `random_seed` |
| `lib/comfy/graph-policy.ts` | 3 | Liste blanche de `class_type`, modèles du catalogue |
| `lib/comfy/errors.ts` | 3 | Codes d'erreur publics |
| `lib/comfy/__tests__/*` + fixtures du labo | 3 | Tests |
| `lib/media/access.ts` | 2 | Contrôle d'accès aux assets (propriétaire, modération, retrait) et URL signées |
| `lib/moderation/{types,policy}.ts`, `lib/moderation/providers/*`, `lib/moderation/__tests__/*` | 5 | Contrat, politique, adaptateurs (dont un faux), tests de contrat |
| `modal_app/comfy/app.py` | 3 | App `alphogenai-comfy` : courtier (secrets), exécuteur (sans secret), Studio |
| `modal_app/comfy/broker.py` | 3 | Prise en charge, heartbeat, entrées/sorties, post-traitement, modération, états, coûts, notification |
| `modal_app/comfy/executor.py` | 3 | Démarrage ComfyUI, `/upload`, `/prompt`, `/ws`, `/history`, `/view`, annulation native |
| `modal_app/comfy/runtime.py` | 3 | YAML → image Modal |
| `modal_app/comfy/models.py` | 4 | Copie et vérification des modèles du catalogue |
| `modal_app/comfy/postprocess.py` | 4 | `audio_shift` (portage de `h3-lab/app.py::shift_audio`) |
| `modal_app/comfy/moderation.py` | 5 | Adaptateur auto-hébergé, transcription audio |
| `modal_app/comfy/studio_proxy.py` | 1 / 5 | Proxy d'authentification du Studio (session, WS, routes d'exécution refusées) |
| `supabase/migrations/2026MMDD_create_comfy_catalog.sql` | 2 | `comfy_templates`, `comfy_template_versions` |
| `supabase/migrations/2026MMDD_create_comfy_runs.sql` | 2 | `comfy_runs`, `comfy_run_graphs` (service seulement), `dispatch_outbox` |
| `supabase/migrations/2026MMDD_create_assets.sql` | 2 | `assets` (privé, RLS propriétaire) |
| `supabase/migrations/2026MMDD_create_spend.sql` | 2 | `spend_ledger`, `spend_limits` |
| `supabase/migrations/2026MMDD_comfy_functions.sql` | 2 | `admit_comfy_job`, `transition_comfy_run` (security definer, search_path figé) |
| `supabase/migrations/2026MMDD_engines_comfy_type.sql` | 2 | CHECK `engines.type` élargi à `comfy_workflow` |
| `supabase/migrations/2026MMDD_realtime_comfy_runs.sql` | 3 | Publication realtime `comfy_runs` |
| `supabase/migrations/2026MMDD_create_moderation.sql` | 5 | `moderation_policies`, `moderation_events`, `content_reports`, `user_strikes` |
| `app/api/media/[asset_id]/route.ts` | 2 | Accès privé aux médias |
| `app/api/jobs/[id]/cancel/route.ts` | 3 | Annulation |
| `app/api/jobs/[id]/publish/route.ts` | 2 | Publication explicite d'un asset `public_ok` |
| `app/api/cron/comfy-reconcile/route.ts` | 2 | Outbox non envoyée, expiration, réconciliation |
| `app/api/admin/comfy/templates/*`, `app/api/admin/comfy/studio-session/route.ts` | 4 / 5 | Catalogue, import, session Studio (`requireAdmin`) |
| `app/api/reports/route.ts` | 5 | Signalement |
| `app/(admin)/admin/workflows/*`, `app/(admin)/admin/reports/page.tsx` | 4 / 5 | Gestion des templates, test admin minimal, file de modération |
| `app/(workspace)/create/comfy/[slug]/page.tsx` | 5 | Page de création générée |
| `components/comfy/{manifest-form,run-progress}.tsx`, `components/comfy/widgets/*` | 5 | Formulaires et progression |
| `components/report-button.tsx` | 5 | Bouton « Signaler » |
| `tools/comfy-drift.ts`, `tools/lipsync_measure.py` | 4 | Outils |
| `docs/compliance/minimax-h3.md` | 5 | Procédure de conformité et revue périodique (sans contenu confidentiel) |

## 8.2 À modifier

| Chemin | Étape | Modification |
|---|---|---|
| `.github/workflows/deploy-modal.yml` | 2 | Exclure `modal_app/comfy/**` du déploiement de `alphogenai-v2` sur `main` et `claude/**` ; déploiement de `alphogenai-comfy` manuel jusqu'à l'étape 7 |
| `modal_app/engines/router.py` | 2 | Exclure `type = 'comfy_workflow'` des sélections du pipeline historique |
| `modal_app/engines/registry.py` | 2 | Exposer le type pour permettre ce filtre (si nécessaire) |
| `app/api/jobs/route.ts` | 3 | Branche comfy : authentification obligatoire, validation, résolution, appel `admit_comfy_job` ; les autres branches ne changent pas |
| `app/api/jobs/[id]/route.ts` | 2 | Parcours ComfyUI : authentification + contrôle propriétaire ; joindre `comfy_runs` et `assets` sans exposer `comfy_run_graphs`. Attention au filtre `formatJob()` |
| `app/v/[id]/page.tsx`, galerie | 2 | Pour les sorties ComfyUI : uniquement les assets publiés et non retirés |
| `app/api/admin/engines/route.ts`, `[id]/test/route.ts`, `app/api/engines/route.ts` | 4 | Accepter / présenter `comfy_workflow` (02 §2.3) |
| `lib/jobs/guard.ts` | 3 | Règles reprises par `admit_comfy_job` ; refus des comptes suspendus |
| `lib/use-job-realtime.ts` | 3 | Abonnement à `comfy_runs` |
| `app/api/webhooks/modal/route.ts` | 3 | Événement terminal idempotent (`notified_at`) pour les runs ComfyUI |
| `app/(workspace)/library/page.tsx`, page job | 3 | Rendu selon `assets.kind` (image ou vidéo) |
| `lib/engine-intentions.ts`, `lib/__tests__/provider-leak-guard.test.ts` | 5 | Libellés des manifestes ; « MiniMax H3 » imposé |
| `lib/types.ts` | 2 | Types des runs, assets, états |
| `app/terms/page.tsx`, `lib/social-metadata.ts` | 5 | CGU (AUP H3), mention IA |
| `HANDOVER.md`, `CLAUDE.md`, `docs/architecture/future-proof-notes.md` | chaque étape | État réel et garde-fous |

## 8.3 À ne pas modifier

- `modal_app/video_pipeline.py` et les adaptateurs `modal_app/engines/*` autres que le filtre du routeur.
- Clients fournisseurs `lib/*-client.ts`, routes Stripe, cron EvoLink.
- Les parcours non ComfyUI de `GET /api/jobs/[id]`, `/v/[id]` et R2 : leurs défauts sont signalés à part (01 §1.5)
  et corrigés dans un chantier dédié, pas dans celui-ci.

## 8.4 Contenu à porter depuis le labo H3 (hors dépôt)

| Source (`Documents/Claude/h3-lab/`) | Destination |
|---|---|
| `build_workflow()` | référence d'égalité pour `graph.t2v.api.json` (export natif) |
| `TURBO_MODES` | variantes `t2v` / `t2v_full` (graphes complets) |
| `frames_for()` | `lib/comfy/derived.ts::frames_from_seconds` |
| `shift_audio()` | `modal_app/comfy/postprocess.py::audio_shift` |
| `FILES` + `download_models()` | catalogue du runtime + `modal_app/comfy/models.py` |
| `tests_v2.json`, `tests_v3.json` | fixtures (prompts au format officiel) |
| `lipsync_measure.py` | `tools/lipsync_measure.py` |

Le labo reste en place, isolé, ni supprimé ni branché sur la production.
