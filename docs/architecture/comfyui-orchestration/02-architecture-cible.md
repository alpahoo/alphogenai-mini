# 2. Architecture cible

## 2.1 Les quatre objets

| Objet | Rôle | Où il vit | Qui le change |
|---|---|---|---|
| **Runtime** | Environnement ComfyUI figé : version ComfyUI, custom nodes au commit près, dépendances pip verrouillées, catalogue de modèles (source, SHA-256, licence), GPU par défaut, options de lancement | `workflows/comfy/runtimes/<runtime>@<version>.yaml` (dépôt) → image Modal | Développeur, via PR. Une nouvelle version = une nouvelle image, l'ancienne reste disponible |
| **Template** | Un workflow publiable : graphe au format API + manifeste (paramètres exposés, variantes, sorties, post-traitements, politiques, licence, coût) + graphe UI optionnel (pour rouvrir dans Studio) | `workflows/comfy/templates/<slug>/` (dépôt, source de vérité) → tables `comfy_templates` / `comfy_template_versions` (copie publiée, empreinte SHA-256) | Admin (Studio → import), revu en PR |
| **Run** | Une exécution : version de template, valeurs utilisateur, graphe résolu, progression, sorties, GPU, coût, erreur | Table `comfy_runs`, enfant de `jobs` | Le runner Modal, côté serveur uniquement |
| **Post-traitement** | Étape après ComfyUI, déclarée dans le manifeste, implémentée une fois pour toutes (`audio_shift`, puis watermark, export social…) | `modal_app/comfy/postprocess.py` | Développeur (une fois par type d'étape, pas par workflow) |

Ajouter un workflow sur un runtime existant = **un dossier de template + une ligne en base**. Aucun Python.
Ajouter un custom node = **une nouvelle version de runtime** (YAML) + reconstruction d'image. Toujours aucun
adaptateur Python par workflow.

## 2.2 Schéma

```
┌──────────────── Next.js (Vercel) ────────────────┐
│ /create/[template]   formulaire généré (Simple / Advanced)
│ /admin/workflows     catalogue, versions, import Studio, test
│ POST /api/jobs ── guard.ts existant (plan, quota, 1 job actif, screenPrompt)
│      │            + validateTemplateParams(manifest, object_info figé)   ← nouveau
│      │            + modération des entrées                               ← nouveau (D5)
│      ├─ branches fournisseurs API existantes (inchangées)
│      └─ branche comfy : insert jobs + comfy_runs (graphe résolu côté serveur)
│                         → POST https://…alphogenai-comfy…/run {run_id}  (secret partagé)
│ GET /api/jobs/[id] ── lit jobs + comfy_runs (progression, aperçus)        ← extension
└───────────────────────────────────────────────────┘
          │ run_id seulement (jamais le graphe envoyé par le navigateur)
          ▼
┌──────────────── Modal app « alphogenai-comfy » ──────────────────────────┐
│ dispatcher (CPU, web endpoint) : lit comfy_runs, choisit la classe du runtime
│ ComfyRunner[h3-video@1]  GPU H100   ┐ une classe par runtime, générée à partir du YAML
│ ComfyRunner[moss-image@1] GPU L40S  ┘ (même code), volume de modèles partagé
│   1. démarre ComfyUI (127.0.0.1, options de sécurité, cf. 2.6)
│   2. télécharge les entrées depuis R2 / bucket privé → /upload/image
│   3. POST /prompt ; écoute /ws : progress, executing, executed, erreurs, aperçus
│   4. écrit la progression (limitée à 1 écriture/s) dans comfy_runs
│   5. récupère les sorties (/view), applique les post-traitements du manifeste
│   6. upload R2, met à jour jobs (video_url ou métadonnées image) + comfy_runs (coût réel)
│   7. modération des sorties (D5) avant passage en « done »
│ Studio admin (CPU) : ComfyUI + frontend natif derrière authentification (cf. 03)
└──────────────────────────────────────────────────────────────────────────┘
          │ après « done », rien ne change :
          ▼
  overlays, voix, export social, miniature (fonctions existantes d'alphogenai-v2)
```

## 2.3 Routage : « moteur privilégié »

- Chaque version de template publiée crée ou met à jour une ligne `engines` (`type = 'comfy_workflow'`,
  `id = 'comfy:<slug>'`), avec `engine_plans` et `engine_costs` (D2). L'admin active, désactive, ou change la
  priorité **sans redéploiement**, comme pour les autres moteurs.
- Le manifeste déclare des **capacités** (`t2v`, `i2v`, `t2i`, `edit`, `audio`). Quand l'utilisateur ne choisit pas
  de modèle, la sélection retient le moteur actif de plus haute priorité qui couvre la capacité et le plan.
  Pour faire de ComfyUI le moteur privilégié sur une capacité, l'admin lui donne la priorité la plus haute.
- Quand l'utilisateur choisit un modèle (« MiniMax H3 »), son choix gagne s'il est autorisé pour son plan
  (règle existante de `router.py`).
- Pas de bascule automatique d'un fournisseur API vers ComfyUI (ou l'inverse) en cas d'échec dans la V1 :
  l'échec est explicite, l'utilisateur relance. La bascule est un sujet séparé.

## 2.4 Modèle de données (esquisse, migrations à écrire en phase 2)

Toutes les tables : RLS activée, **GRANT explicites dans la même migration** (règle du 30/10/2026 de `CLAUDE.md`).

```sql
-- catalogue (lecture : authenticated si status ∈ beta/live ; écriture : service_role)
comfy_templates(
  id uuid pk, slug text unique, title text, kind text check (kind in ('image','video','audio','multi')),
  status text check (status in ('draft','admin','beta','live','deprecated')),
  current_version_id uuid, created_at, updated_at)

comfy_template_versions(           -- immuable une fois publiée
  id uuid pk, template_id uuid fk, version int, runtime text,      -- ex. 'h3-video@1'
  graph_api jsonb not null, graph_ui jsonb, manifest jsonb not null,
  object_info_snapshot jsonb not null,  -- schéma des nodes utilisés, figé à l'import
  sha256 text not null, created_by uuid, published_at timestamptz,
  unique(template_id, version))

-- exécutions (lecture : propriétaire ; écriture : service_role)
comfy_runs(
  id uuid pk, job_id uuid fk jobs on delete cascade, user_id uuid fk,
  template_version_id uuid fk, mode text check (mode in ('simple','advanced','studio')),
  params jsonb not null,            -- valeurs utilisateur validées
  resolved_graph_sha256 text,       -- le graphe résolu est recalculable, on ne stocke que l'empreinte
  status text check (status in ('queued','starting','running','postprocessing','moderating','done','failed','cancelled')),
  progress jsonb,                   -- { node, step, max, percent, preview_url }
  outputs jsonb,                    -- [{ kind, url, raw_url, width, height, duration_s }]
  gpu_type text, gpu_seconds numeric, cold_start_s numeric, cost_usd numeric,
  modal_call_id text, comfy_prompt_id text, error_code text, error_message text,
  created_at, started_at, finished_at)

-- conformité (cf. annexe A)
content_reports(id, reporter_id, job_id, run_id, reason, details, status, resolution, created_at, resolved_at)
moderation_policies(id, profile, version, rules jsonb, created_by, created_at)          -- cf. 2.7
moderation_events(id, subject_kind, subject_id, stage, provider_id, provider_version,
                  scores jsonb, policy_id, decision, latency_ms, created_at)            -- cf. 2.7
user_strikes(user_id, count, last_strike_at)      -- ou colonnes sur profiles
```

`jobs` reçoit dans `metadata` : `{ "comfy_run_id", "template_slug", "output_kind": "image"|"video" }`. Pas de
nouvelle colonne obligatoire sur `jobs`. Pour une sortie image, l'URL va dans `comfy_runs.outputs` et
`jobs.output_url_final` (à confirmer : vérifier que les écrans bibliothèque et job tolèrent une image, sinon petite
adaptation d'affichage, cf. 08).

## 2.5 Cycle d'un run

| Étape | Qui | Détail |
|---|---|---|
| 1. Formulaire | Navigateur | Champs générés depuis le manifeste et le mode. Les valeurs verrouillées ne sont jamais envoyées |
| 2. Garde | `/api/jobs` | Garde existante, puis `validateTemplateParams` : clé connue, autorisée pour ce mode et ce plan, type et plage (intersection manifeste ∩ `object_info_snapshot`), modèle présent dans le catalogue du runtime, plafonds (durée, résolution, steps) |
| 3. Résolution | `/api/jobs` (TS pur, testable) | Copie du `graph_api` de la version, application des variantes puis des valeurs, calcul des champs dérivés déclarés (`frames_from_seconds`). Empreinte SHA-256 stockée |
| 4. Dispatch | `/api/jobs` → Modal | `POST /run {run_id}` avec secret. Le runner relit tout en base : un graphe fourni par le navigateur n'est jamais exécuté |
| 5. Exécution | Runner | ComfyUI `POST /prompt`, suivi `/ws`. Timeout par template (manifeste) ; `POST /interrupt` sur annulation |
| 6. Sorties | Runner | `/view` → post-traitements → modération → R2 |
| 7. Fin | Runner | `comfy_runs` (coût réel, durées), `jobs` (status, URLs) → e-mail existant, realtime existant |
| 8. Suite | Existant | Overlays, voix, export social : inchangés, sur `jobs.video_url` / `output_url_final` |

Annulation : `POST /api/jobs/[id]/cancel` (nouveau) → statut `cancelled` → le runner appelle `/interrupt` et rend
le GPU. Reprise : un nouveau run (même job ou nouveau job selon la règle produit), jamais une relance Modal
automatique (`retries=0`, convention du dépôt).

## 2.6 Sécurité et isolation

| Risque | Contrôle |
|---|---|
| Exécution de code arbitraire via des custom nodes | Liste blanche de packs **par runtime** (`--disable-all-custom-nodes` + `--whitelist-custom-nodes <packs>`, `verified-code` ComfyUI v0.42.0) ; liste noire de nodes (`--disabled-nodes-config`) ; liste blanche de `class_type` **par template** vérifiée côté serveur avant `/prompt` |
| Nodes d'API payantes ou appels réseau | `--disable-api-nodes` (désactive aussi les nodes partenaires, `verified-code`) ; `block_network` sur les fonctions runner quand le runtime n'en a pas besoin (`inferred`, option Modal à confirmer) ; pas de ComfyUI-Manager (`--disable-manager-ui`, pas de `--enable-manager`) |
| Lecture ou écriture de fichiers arbitraires | Aucun champ de chemin exposé ; noms de fichiers d'entrée générés par le runner ; dossiers `input/` et `output/` propres à chaque run, vidés en fin de run |
| Fuite de données entre utilisateurs | Un run à la fois par conteneur (ComfyUI exécute une file unique) ; nettoyage des dossiers et de l'historique (`POST /history {clear}`) entre deux runs ; `--disable-metadata` pour ne pas embarquer le graphe dans les fichiers livrés (protège aussi les templates) |
| Graphe falsifié par le client | Le navigateur n'envoie que des valeurs. Le graphe est reconstruit côté serveur à partir d'une version immuable |
| Fuite de noms de fournisseurs | Libellés publics issus du manifeste ; erreurs ComfyUI converties en codes (`OOM`, `INVALID_INPUT`, `TIMEOUT`, `INTERNAL`) ; message brut réservé aux logs admin ; tests anti-fuite étendus |
| Abus de ressources | Plafonds par template (durée, résolution, steps, nombre de sorties), timeout, `max_containers` par runtime, quota et 1 job actif existants |

## 2.7 Modération interchangeable (décision D5)

Objectif : respecter les obligations de licence (annexe A) **sans brider la création** au-delà de ce qu'elles
exigent, avec un fournisseur de modération remplaçable sans toucher au reste.

### Contrat unique

```ts
// lib/moderation/types.ts (TS) et modal_app/comfy/moderation.py (Python), même contrat
interface ModerationProvider {
  id: string;                       // ex. "external-api-x", "selfhosted-modal-y" (jamais affiché à l'utilisateur)
  version: string;
  checkText(text: string): Promise<ModerationResult>;
  checkImage(url: string): Promise<ModerationResult>;
  checkVideo(url: string, opts: { frames: number }): Promise<ModerationResult>; // échantillon d'images
}
interface ModerationResult {
  categories: Record<Category, number>;   // scores normalisés 0..1
  provider_id: string; provider_version: string; latency_ms: number; raw_ref?: string;
}
type Category = "minors_sexual" | "sexual" | "non_consensual_real_person" | "violence_graphic"
  | "extremism" | "hate" | "self_harm" | "illegal_activity" | "ip_infringement_suspected" | "other";
```

Les adaptateurs traduisent les catégories propres à chaque fournisseur vers cette liste. Deux familles prévues :

| Famille | Avantages | Limites | Où |
|---|---|---|---|
| API externe | Pas d'infrastructure, couverture large, mise à jour par le fournisseur | Données envoyées à un tiers (politique de confidentialité, accord de traitement RGPD), coût par appel, dépendance | `lib/moderation/providers/<id>.ts` |
| Modèle auto-hébergé sur Modal | Données gardées chez nous, coût marginal faible si GPU déjà chaud, réglable | À maintenir, à évaluer (précision), licence du modèle à vérifier | `modal_app/comfy/moderation.py`, exécuté dans le conteneur du runner après la génération |

Le choix des fournisseurs concrets se fait à l'implémentation, sur un banc de test interne (précision, faux
positifs, coût, latence, licence). Un fournisseur peut tourner en **mode fantôme** (résultats journalisés, sans
effet) pour être évalué avant d'être activé.

### Politique séparée du fournisseur

Les décisions ne sont pas prises par le fournisseur mais par une **politique** déclarée (`moderation_profile` du
manifeste), versionnée, stockée en base, modifiable par l'admin :

| Décision | Effet | Exemples de catégories (profil H3) |
|---|---|---|
| `block` | Génération refusée (entrée) ou sortie non livrée, non publiable, journalisée | `minors_sexual`, `non_consensual_real_person` (personne réelle sans consentement enregistré), `extremism`, tout ce que l'Exhibit A interdit explicitement |
| `review` | Sortie livrée **en privé** à l'utilisateur, mais **publication publique bloquée** (galerie, page publique, export social) jusqu'à revue humaine | scores intermédiaires, `ip_infringement_suspected`, `violence_graphic` élevé |
| `allow` | Aucune restriction | tout le reste, dont la fiction, l'horreur, la violence non graphique, le contenu artistique |

C'est ce qui donne de la **liberté créative** : on ne bloque que ce que la loi et la licence imposent, le reste
passe, et la zone grise est gérée par la revue avant publication plutôt que par un refus.

### Points d'application

1. Entrée : prompt (en plus de `screenPrompt` existant) et images de référence, avant tout appel GPU.
2. Sortie : images, ou N images échantillonnées de la vidéo (N défini par le profil), avant `done`.
3. Publication : toute action qui rend un contenu public relit la décision et exige `allow` ou une revue validée.

### Panne du fournisseur

Comportement configurable par profil : `fail_closed` (sortie retenue en `review`, profil H3 par défaut) ou
`fail_open` (livrée et marquée à revoir). Jamais de blocage silencieux : l'utilisateur voit « en cours de
vérification ».

### Traçabilité, signalement et revue

- Table `moderation_events` : objet modéré, fournisseur, version, scores, politique appliquée, décision, durée.
- Les signalements des utilisateurs (`content_reports`) et les décisions `review` alimentent **la même file admin**.
- Actions de l'admin : valider, retirer (contenu désactivé partout), sanctionner (compteur d'infractions,
  suspension), avec motif enregistré. L'utilisateur est informé et peut contester une fois.
- Revue périodique (obligation V.5) : statistiques par catégorie, faux positifs constatés, ajustement de la
  politique, consignés dans `docs/compliance/minimax-h3.md`.

## 2.8 Prévu dès maintenant pour un Studio Pro (non implémenté)

Le Studio Pro réutilise **la même chaîne** que le Studio admin, avec ces restrictions qui doivent être possibles
dès la V1 du schéma :

- `comfy_runs.mode = 'studio'` et `comfy_template_versions.created_by` (un template privé appartient à un
  utilisateur) : prévu dans le schéma, inutilisé en V1.
- Un runtime « studio-pro » distinct, avec une liste blanche de nodes plus courte, sans upload de modèles.
- Validation serveur identique (le frontend Studio ne fait jamais foi) : un graphe envoyé depuis le Studio Pro
  passe par le même validateur avant exécution.
- Conteneur Studio **par utilisateur**, jamais partagé, détruit après inactivité.
- Obligations GPL du frontend ComfyUI à traiter avant ouverture (annexe A).

## 2.9 Prévu pour l'entraînement (phase ultérieure, non implémenté)

ComfyUI n'est pas l'outil d'entraînement. Architecture réservée :

- Tables `datasets`, `training_jobs`, `custom_models` (propriétaire, RLS).
- Entraîneurs spécialisés exécutés sur Modal par un runner dédié (candidat vérifié : `ostris/ai-toolkit`, MIT,
  `verified-docs` ; d'autres à évaluer au cas par cas, licence comprise).
- Un modèle entraîné est enregistré dans le catalogue de modèles **de l'utilisateur** (préfixe de chemin par
  `user_id` sur le volume) et devient une option d'un paramètre `lora` du manifeste, filtrée par propriétaire.
- Traçabilité de provenance sur chaque asset : la licence H3 interdit d'utiliser ses sorties pour améliorer un
  autre modèle que H3 (section V.3). Un dataset contenant des sorties H3 ne peut entraîner qu'un dérivé de H3.
