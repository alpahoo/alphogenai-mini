# 8. Fichiers et composants à créer ou modifier

Chemins relatifs à la racine du dépôt (`origin/main`). « Phase » renvoie au plan (05).
Principe : **créer** du générique, **modifier** l'existant au minimum, ne **rien supprimer**.

## 8.1 À créer

| Chemin | Phase | Rôle |
|---|---|---|
| `workflows/comfy/runtimes/h3-video@1.yaml` | 1 | Runtime H3 : ComfyUI v0.42.0, catalogue de modèles (source, SHA-256, licence), GPU, options de lancement |
| `workflows/comfy/runtimes/moss-image@1.yaml` | 6 | Runtime MOSS : custom nodes épinglés, modèles Comfy-Org/MOSS-Image |
| `workflows/comfy/templates/minimax-h3/graph.api.json` | 1 | Graphe validé du labo |
| `workflows/comfy/templates/minimax-h3/manifest.json` | 1 | Manifeste (cf. 04) |
| `workflows/comfy/templates/minimax-h3/object_info.snapshot.json` | 1-2 | Schéma des nodes utilisés (capturé sur le runtime, sans GPU possible avec `--cpu`, à confirmer) |
| `workflows/comfy/templates/minimax-h3/README.md` | 1 | Origine, réglages validés, mesures, licence |
| `workflows/comfy/templates/moss-image/*` | 6 | Idem pour MOSS |
| `lib/comfy/manifest-schema.ts` | 1 | Types et validation de structure du manifeste |
| `lib/comfy/validate-params.ts` | 1 | Validation des valeurs (manifeste ∩ object_info, plans, verrous, plafonds) |
| `lib/comfy/resolve-graph.ts` | 1 | Variantes, valeurs, dérivés, empreinte |
| `lib/comfy/derived.ts` | 1 | `frames_from_seconds`, `dims_from_aspect`, `random_seed` |
| `lib/comfy/graph-policy.ts` | 1 | Liste blanche de `class_type`, refus des chemins et des modèles hors catalogue |
| `lib/comfy/errors.ts` | 2 | Codes d'erreur publics, nettoyage des messages ComfyUI |
| `lib/comfy/__tests__/*.test.ts` + fixtures du labo | 1 | Tests (≥ 20 cas de rejet, égalité de graphe avec le labo) |
| `modal_app/comfy/app.py` | 2 | App `alphogenai-comfy` : dispatcher, `ComfyRunner` par runtime, `StudioServer` (phase 5) |
| `modal_app/comfy/runtime.py` | 2 | Lecture du YAML → image Modal (version ComfyUI, custom nodes, pip) |
| `modal_app/comfy/comfy_client.py` | 2 | `/prompt`, `/ws`, `/view`, `/upload/image`, `/interrupt`, `/history` |
| `modal_app/comfy/models.py` | 2 | Téléchargement et vérification des modèles du catalogue |
| `modal_app/comfy/postprocess.py` | 2 | `audio_shift` (portage de `h3-lab/app.py::shift_audio`), `keep_raw` |
| `modal_app/comfy/moderation.py` | 4 | Contrat `ModerationProvider` côté Python + adaptateur auto-hébergé (02 §2.7) |
| `lib/moderation/types.ts`, `lib/moderation/policy.ts`, `lib/moderation/providers/*` | 4 | Contrat TS, politique versionnée (allow / review / block), adaptateurs interchangeables, faux fournisseur de test |
| `lib/moderation/__tests__/*` | 4 | Tests de contrat communs à tous les adaptateurs, jeux « bloquants » et « contenus légitimes » |
| `supabase/migrations/2026MMDD_create_moderation.sql` | 4 | `moderation_policies`, `moderation_events` (RLS + GRANT) |
| `supabase/migrations/2026MMDD_create_comfy_templates.sql` | 2 | `comfy_templates`, `comfy_template_versions` (RLS + GRANT) |
| `supabase/migrations/2026MMDD_create_comfy_runs.sql` | 2 | `comfy_runs` (RLS propriétaire + GRANT) |
| `supabase/migrations/2026MMDD_engines_comfy_type.sql` | 2 | CHECK `engines.type` élargi à `comfy_workflow` (D2) |
| `supabase/migrations/2026MMDD_create_content_reports.sql` | 4 | Signalements + sanctions |
| `app/api/jobs/[id]/cancel/route.ts` | 2 | Annulation |
| `app/api/admin/comfy/templates/route.ts` (+ `[id]`, `import`) | 2 / 5 | Catalogue, versions, import |
| `app/api/admin/comfy/studio-session/route.ts` | 5 | Jeton signé pour le Studio |
| `app/api/reports/route.ts` | 4 | Signalement |
| `app/(admin)/admin/workflows/page.tsx` (+ `[slug]`, `studio`) | 2 / 5 | Gestion des templates, éditeur de manifeste, diff |
| `app/(admin)/admin/reports/page.tsx` | 4 | File de modération |
| `app/(workspace)/create/comfy/[slug]/page.tsx` | 3 | Page de création générée (ou intégration dans `create/[mode]`, à décider sur le code) |
| `components/comfy/manifest-form.tsx` + `components/comfy/widgets/*` | 3 | Formulaire Simple / Advanced |
| `components/comfy/run-progress.tsx` | 3 | Progression et aperçus |
| `components/report-button.tsx` | 4 | Bouton « Signaler » |
| `tools/comfy-drift.ts` (ou `.py`) | 5 | Comparaison d'`object_info` entre runtimes |
| `tools/lipsync_measure.py` | 2 | Portage de l'outil du labo (QA) |
| `docs/compliance/minimax-h3.md` | 4 | Procédure de conformité et revue périodique |

## 8.2 À modifier (modifications minimales)

| Chemin | Phase | Modification |
|---|---|---|
| `app/api/jobs/route.ts` | 2 | Une branche « comfy » à côté des branches existantes, après la garde existante ; aucune autre branche touchée |
| `app/api/jobs/[id]/route.ts` | 2 | Joindre `comfy_runs` (progression, sorties) au job retourné. **Attention** au filtre `formatJob()` qui ne garde que certains champs (bug récurrent déjà rencontré avec `metadata`) |
| `lib/jobs/guard.ts` | 2 / 4 | Accepter les moteurs `comfy:*` dans la validation de moteur ; refus si l'utilisateur est suspendu (phase 4) |
| `lib/engine-intentions.ts` | 3 | Nom public des templates issu du manifeste (« MiniMax H3 ») |
| `lib/__tests__/provider-leak-guard.test.ts` | 3 | Couvrir les libellés des manifestes et les codes d'erreur ComfyUI ; exiger « MiniMax H3 » pour H3 |
| `lib/types.ts` | 2 | Types `ComfyRun`, statut, `output_kind` |
| `app/terms/page.tsx` | 4 | Répercussion de la politique d'usage H3, mention de la licence (texte validé, D9) |
| `app/v/[id]/page.tsx`, galerie, page job | 4 | Bouton « Signaler », mention « généré par IA » |
| `lib/social-metadata.ts` | 4 | Mention IA garantie pour les sorties H3 publiées |
| `app/(workspace)/library/*`, page job | 3 / 6 | Affichage d'une sortie image si nécessaire (à vérifier sur le code) |
| `.github/workflows/deploy-modal.yml` | 7 | Ajouter le déploiement de `modal_app/comfy/app.py`, seulement à l'ouverture bêta et sur décision |
| `HANDOVER.md`, `CLAUDE.md`, `docs/architecture/future-proof-notes.md` | chaque phase | Mise à jour de l'état réel et des garde-fous |

## 8.3 À ne pas modifier

- `modal_app/video_pipeline.py` et `modal_app/engines/*` : la nouvelle app importe éventuellement des helpers
  partagés (R2, Supabase) ; s'ils doivent être factorisés, les extraire vers `modal_app/utils/` dans une PR
  séparée et sans changement de comportement.
- Clients fournisseurs `lib/*-client.ts`, routes Stripe, webhooks existants, cron EvoLink.
- Toute table existante, à part l'élargissement du CHECK de `engines.type`.

## 8.4 Contenu à porter depuis le labo H3 (hors dépôt)

| Source (`Documents/Claude/h3-lab/`) | Destination |
|---|---|
| `build_workflow()` (graphe 12 nodes) | `graph.api.json` + variantes du manifeste |
| `TURBO_MODES` | variante `quality` |
| `frames_for()` | `lib/comfy/derived.ts::frames_from_seconds` |
| `shift_audio()` | `modal_app/comfy/postprocess.py::audio_shift` |
| `FILES` + `download_models()` | catalogue du runtime + `modal_app/comfy/models.py` |
| `tests_v2.json`, `tests_v3.json` | fixtures de tests (prompts au format officiel) |
| `lipsync_measure.py` | `tools/lipsync_measure.py` |
| `RESULTS.md` (mesures) | `workflows/comfy/templates/minimax-h3/README.md` (résumé) |

Le labo reste en place, isolé. Il n'est ni supprimé ni branché sur la production.
