# 2. Architecture cible

Révision 2 (2026-11-08), après la revue Codex : correspondance détaillée dans [09](09-correspondance-revue-codex.md).

Répartition des responsabilités :

| Couche | Responsable de |
|---|---|
| **AlphoGen** (Next.js + Supabase) | identité, autorisations, admission (quota, budget, idempotence), jobs, conformité (modération, signalement, retrait), stockage privé, publication, livraison, coûts |
| **ComfyUI** | validation sémantique et exécution de **ses** graphes, nodes, file interne, cache, événements |
| **Modal** | environnements d'exécution figés, GPU, volumes de modèles |
| **Graphe API + manifeste + catalogue** | description d'une offre publiable sur un runtime compatible |

## 2.1 Les quatre objets

| Objet | Rôle | Où il vit | Qui le change |
|---|---|---|---|
| **Runtime** | Environnement exécutable approuvé : version ComfyUI, custom nodes au commit près, dépendances verrouillées, catalogue de modèles (source, révision, SHA-256, licence), GPU par défaut, options de lancement, **politique de réutilisation des conteneurs** (§2.7) | `workflows/comfy/runtimes/<runtime>@<version>.yaml` → image Modal | Développeur, via PR. Une nouvelle version = une nouvelle image, l'ancienne reste disponible |
| **Template** | Offre publiable : un ou plusieurs graphes API complets (un par variante structurelle, §04) + manifeste + graphe UI optionnel (pour rouvrir dans le Studio) | `workflows/comfy/templates/<slug>/` (source de vérité) → `comfy_templates` / `comfy_template_versions` (copie publiée, SHA-256) | Admin (Studio → import), revu en PR |
| **Run** | Une tentative traçable : version de template, paramètres effectifs, **graphe résolu stocké**, états, sorties typées, coûts | `comfy_runs`, enfant de `jobs` | Le courtier Modal, côté serveur |
| **Post-traitement** | Étape après ComfyUI, déclarée dans le manifeste, implémentée une fois par **type** d'étape (`audio_shift`, …) | `modal_app/comfy/postprocess.py` | Développeur (une fois par type, pas par workflow) |

Ajouter un workflow sur un runtime existant = un dossier de template + des lignes en base, **sans** modifier le code
commun. C'est un **critère vérifié** sur MOSS (05 étape 6), pas une propriété acquise : si un besoin générique
manque, le socle est corrigé explicitement, puis le test est rejoué.

## 2.2 Schéma

```
┌──────────────────── Next.js (Vercel) ────────────────────┐
│ /create/comfy/[slug]  formulaire généré (Simple / Advanced)
│ /admin/workflows      catalogue, versions, import Studio, test admin minimal
│ POST /api/jobs (branche comfy, utilisateur authentifié obligatoire)
│   1. validateTemplateParams (manifeste, plan, plafonds) + modération des entrées
│   2. resolveGraph (TS, seul résolveur) → graphe résolu + hash + seeds figés
│   3. RPC admit_comfy_job(...) : UNE transaction (verrou utilisateur, quota, budget,
│      idempotence, insert jobs + comfy_runs + dispatch_outbox)
│   4. réponse 202 { job_id }  (le dispatch part de l'outbox, pas de la requête)
│ GET /api/jobs/[id]   authentification + propriétaire obligatoires (§2.6)
│ GET /api/media/[asset_id]  accès privé : propriétaire + état de modération + retrait → URL signée courte
│ /v/[id], galerie     uniquement les assets explicitement publiés (public_ok)
└──────────────────────────────────────────────────────────┘
        │ outbox → POST /dispatch {run_id} (secret)         ▲ realtime comfy_runs (RLS propriétaire)
        ▼                                                  │
┌──────────────── Modal « alphogenai-comfy » ─────────────────────────────────┐
│ COURTIER (CPU, secrets Supabase + R2 + modération, réseau sortant)            │
│   - prise en charge atomique du run (UPDATE … WHERE status='queued')          │
│   - revalide kill switch + budget en base, vérifie le hash du graphe          │
│   - télécharge les entrées du run depuis le stockage privé                    │
│   - appelle l'EXÉCUTEUR avec (graphe, octets d'entrée) ; reçoit (octets de    │
│     sortie, événements) ; heartbeat ; annulation                              │
│   - post-traitements, modération des sorties, upload privé, états, coûts,     │
│     événement terminal idempotent (notification)                              │
│                                                                              │
│ EXÉCUTEUR (GPU, par runtime, SANS secret métier, réseau bloqué si possible)  │
│   - ComfyUI local (127.0.0.1), modèles en lecture seule                       │
│   - /upload, POST /prompt, /ws, /history, /view, cancel natif par identifiant │
│   - ne connaît ni Supabase, ni R2, ni l'utilisateur                           │
│                                                                              │
│ STUDIO (CPU, admin, édition seulement, §03)                                  │
└──────────────────────────────────────────────────────────────────────────────┘
        │ après « done » : post-production existante seulement si le type d'asset et
        ▼ ses capacités le permettent (§2.6)
```

## 2.3 Routage et registre

**Problème vérifié** (B4) : `modal_app/engines/router.py` parcourt tous les moteurs actifs du registre sans filtre de
type, et `modal_app/engines/__init__.py` remplace un identifiant inconnu par `wan_i2v`. Un template ComfyUI
prioritaire pourrait donc être choisi par le pipeline historique, qui exécuterait Wan.

Règles :

1. **Chaque routeur ne voit que les familles qu'il sait exécuter.** Le routeur historique exclut
   `type = 'comfy_workflow'`. La branche comfy n'accepte que `comfy_workflow`.
2. Dans le nouveau parcours, un identifiant inconnu, désactivé ou non autorisé produit une **erreur explicite**
   (4xx). Jamais de repli silencieux sur un autre moteur.
3. « Moteur privilégié » : quand l'utilisateur ne choisit pas de modèle, la sélection côté Next.js compare les
   moteurs de toutes les familles qui couvrent la capacité demandée, et retient la plus haute priorité. Un template
   ComfyUI gagne quand l'admin lui donne la priorité. Quand l'utilisateur choisit un modèle, son choix gagne s'il est
   autorisé pour son plan.
4. Pas de bascule automatique entre fournisseurs en V1.
5. **Kill switch** relu **en base** (sans cache) à l'admission, à la prise en charge par le courtier et avant toute
   publication.
6. Test de non-régression obligatoire : activer un template ComfyUI de priorité maximale pendant une génération
   historique ne change pas le moteur exécuté par le pipeline historique.

**Registre** (I3) : élargir le CHECK ne suffit pas. Contrats à adapter (08) :

| Contrat existant | Comportement actuel (vérifié) | Adaptation |
|---|---|---|
| `POST /api/admin/engines` | refuse tout type autre que `api` / `modal_local` (L72) | accepter `comfy_workflow`, mais seulement créé par la publication d'un template |
| `POST /api/admin/engines/[id]/test` | refuse tout type autre que `api` (L33) | test d'un template = run admin normal (§2.5) |
| `GET /api/engines` (catalogue public) | assemble des listes statiques des clients fournisseurs | ajouter les templates publiés, libellé public issu du manifeste |
| `engines.status` | `active` / `coming_soon` / `deprecated` | inchangé ; le cycle de vie du template (`draft`, `admin`, `beta`, `live`, `deprecated`) vit dans `comfy_templates.status`. Correspondance : `admin` ⇒ moteur `coming_soon` visible des admins seulement ; `beta`/`live` ⇒ `active` + `engine_plans` |
| Lien moteur ↔ template | inexistant | `engines.id = 'comfy:<slug>'` stable ; `comfy_templates.engine_id` ; la **version** exacte est figée dans chaque run |

## 2.4 Modèle de données (esquisse, migrations écrites à l'étape 2)

Toutes les tables : RLS activée, **GRANT explicites dans la même migration** (`CLAUDE.md`, règle du 30/10/2026).

```sql
comfy_templates(id, slug unique, title, kind, status check in ('draft','admin','beta','live','deprecated'),
  engine_id text references engines(id), current_version_id, created_at, updated_at)

comfy_template_versions(id, template_id, version int, runtime text,      -- immuable une fois publiée
  graphs_api jsonb not null,          -- { "<variante>": graphe API complet exporté nativement }
  graph_ui jsonb, manifest jsonb not null, object_info_snapshot jsonb not null,
  sha256 text not null, created_by uuid, published_at, unique(template_id, version))

comfy_runs(id, job_id fk jobs on delete cascade, user_id not null, template_version_id, engine_id,
  mode check in ('simple','advanced'),
  idempotency_key text not null, unique(user_id, idempotency_key),
  params_effective jsonb not null,    -- valeurs validées + seeds tirés + noms d'assets générés
  resolver_version text not null, runtime text not null,
  resolved_graph_sha256 text not null,
  status ..., -- cf. §2.5
  attempt int default 1, claimed_by text, claimed_at, heartbeat_at, exec_expires_at,
  review_due_at, retention_deadline,                  -- échéances de modération (état held)
  financial_status check in ('open','closing','closed') default 'open',
  comfy_prompt_id text, modal_call_id text,
  progress jsonb, error_code text, error_message_internal text,
  reserved_cost_usd numeric, gpu_type, gpu_seconds, container_seconds, cold_start_s, cost_usd numeric,
  created_at, started_at, finished_at)

comfy_run_graphs(run_id pk fk comfy_runs, resolved_graph jsonb not null)
  -- service_role uniquement (aucun GRANT à authenticated) : le graphe n'est jamais exposé au navigateur

assets(id, owner_id, job_id, run_id, role check in ('final','raw','preview','thumbnail'),
  kind check in ('image','video','audio'), mime, storage_key, bytes, width, height, duration_s,
  derived_from uuid, transform text,                  -- ex. raw → final par 'audio_shift'
  postprocess_capabilities text[],                    -- ex. {'voiceover','social_export'}
  moderation_state check in ('pending','blocked','held','private_ok','public_ok'),
  published_at, withdrawn_at, provenance jsonb,       -- { model: 'minimax-h3', runtime, template_version }
  created_at)

dispatch_outbox(id, run_id unique, created_at, dispatched_at, attempts, last_error)
notification_outbox(id text pk,          -- stable : run_id + type d'événement
  run_id, kind, payload jsonb, status check in ('pending','sent','failed'), attempts, next_attempt_at,
  provider_message_id, sent_at, created_at)
moderation_tasks(run_id pk, review_due_at, retention_deadline, reminded_at, escalated_at, done_at)
spend_ledger(id, scope, run_id, kind check in ('reservation','settlement','release','adjustment'), amount_usd, period_day, created_at)
spend_envelopes(scope, period check in ('day','month'), period_start date, limit_usd, reserved_usd, consumed_usd,
  primary key (scope, period, period_start))          -- compteurs verrouillés à l'admission (§2.5)
                                                       -- scopes : comfy_global, runtime:<id>, template:<slug>, tests
moderation_policies, moderation_events, content_reports, user_strikes   -- §2.8
```

`jobs` reste le parent : `jobs.metadata = { comfy_run_id, template_slug, output_kind }`. Les URL publiques ne sont
plus écrites dans `jobs` pour les runs ComfyUI : les médias passent par `assets` et la couche d'accès (§2.6).

**Reproductibilité** (I2) : le résolveur TypeScript est le seul résolveur. Il fige les seeds aléatoires et les noms
d'assets dans `params_effective`, stocke le graphe résolu dans `comfy_run_graphs` et son hash dans le run. Le courtier
relit le graphe, recalcule le hash, vérifie `runtime` et `resolver_version`, puis le transmet tel quel à
l'exécuteur. Pas de second résolveur en Python.

## 2.5 Admission, machine à états, annulation (B2, I1, I6)

### Admission atomique

Fonction Postgres `admit_comfy_job(...)` (`security definer`, `search_path` figé, appelée par le client service
après authentification) :

1. verrou par utilisateur (`pg_advisory_xact_lock(hashtext(user_id))`) : protège **seulement** les compteurs propres
   à l'utilisateur (quota, job actif) ;
2. si `(user_id, idempotency_key)` existe déjà : renvoie le job existant (idempotence) ;
3. relit en base : plan, suspension, template actif et autorisé pour ce plan (kill switch) ;
4. compte les jobs actifs et ceux des 24 dernières heures ; **toute erreur = refus** ;
5. **réserve les enveloppes budgétaires partagées** (ci-dessous) ; un seul refus = annulation de toute la
   transaction (« capacité atteinte ») ;
6. insère `jobs`, `comfy_runs`, `comfy_run_graphs`, `dispatch_outbox`, `spend_ledger(reservation)`.

Tout ou rien. Un utilisateur anonyme ne peut pas lancer de run ComfyUI. Le navigateur génère la clé
d'idempotence (UUID par intention de génération) et la renvoie en cas de nouvel essai réseau.

**Réservation atomique des enveloppes partagées.** Le verrou par utilisateur ne protège pas le budget : deux
utilisateurs différents prennent deux verrous différents. Les plafonds sont donc portés par des **lignes de
compteurs** (`spend_envelopes`, une ligne par périmètre et par période : `comfy_global`, `runtime:<id>`,
`template:<slug>`, `tests` × jour, mois), mises à jour par une **écriture conditionnelle** :

```sql
-- pour chaque enveloppe concernée, dans un ORDRE STABLE (tri lexicographique de scope, puis période),
-- afin qu'aucun couple de transactions ne puisse se bloquer mutuellement
UPDATE spend_envelopes
   SET reserved_usd = reserved_usd + :amount
 WHERE scope = :scope AND period_start = :period
   AND consumed_usd + reserved_usd + :amount <= limit_usd
RETURNING 1;
-- 0 ligne → plafond atteint → RAISE → toute la transaction est annulée
```

L'`UPDATE` verrouille la ligne jusqu'à la fin de la transaction : une seconde admission concurrente attend, puis
relit le solde **à jour** et échoue si elle le dépasse. Les lignes d'enveloppe sont créées à l'avance (cron du début
de période) pour ne pas dépendre d'une insertion concurrente. `spend_ledger` reste le journal (append-only) ; les
compteurs sont recalculés et comparés au journal à chaque rapprochement.

Test d'acceptation : N utilisateurs **différents** lancent en même temps une admission alors que l'enveloppe
globale ne permet qu'**une** réservation → exactement 1 admission, N−1 refus « capacité atteinte », compteurs
cohérents avec le journal.

**Limite « un job actif par utilisateur » entre parcours.** Les créations historiques (`app/api/jobs/route.ts`
hors branche comfy) ne prennent pas ce verrou. Sans mécanisme commun, une création ComfyUI et une création
historique simultanées peuvent dépasser `MAX_ACTIVE_JOBS = 1`. Deux options (décision Q7) :

1. **Mécanisme commun en base** : index unique partiel sur `jobs(user_id) WHERE status IN ('pending','in_progress')`,
   qui s'applique à tous les parcours. À n'adopter qu'après vérification qu'aucun parcours existant ne crée
   légitimement plusieurs jobs actifs (scènes, podcasts, research) ; sinon il casserait la production.
2. **Limite assumée** : la garantie ne vaut qu'à l'intérieur du parcours ComfyUI ; un dépassement entre parcours est
   possible, rare, et sans conséquence de coût pour le budget ComfyUI (qui reste protégé par les enveloppes).

**Décision ouverte (Q7).** Préférence du propriétaire : option 1 (un seul job actif par utilisateur, tous moteurs
confondus), à figer seulement après vérification de l'impact sur les parcours existants. Tant qu'elle n'est pas
tranchée, l'option 2 s'applique et la limite est documentée.

**Dispatch durable** : un envoyeur (dans la requête après commit, puis rattrapage par cron pour les lignes non
envoyées) poste `run_id` au courtier. Le courtier prend le run par `UPDATE comfy_runs SET status='starting',
claimed_by=…, claimed_at=now() WHERE id=… AND status='queued' RETURNING *`. Deux envois du même run = une seule
exécution.

### États

| `comfy_runs.status` | `jobs.status` | Transition vers |
|---|---|---|
| `queued` | `pending` | `starting`, `cancelled`, `expired` |
| `starting` | `in_progress` | `running`, `failed`, `cancelled`, `expired` |
| `running` | `in_progress` | `postprocessing`, `failed`, `cancelled`, `expired` |
| `postprocessing` | `in_progress` | `moderating`, `failed`, `cancelled` |
| `moderating` | `in_progress` | `done`, `held`, `blocked`, `failed`, `cancelled` |
| `held` (en revue, **aucune ressource de calcul**) | `in_progress` | `done` (revue favorable), `blocked` (revue défavorable), `expired` (échéance de modération dépassée, `error_code = REVIEW_TIMEOUT`), `cancelled` |
| `done` | `done` | — (terminal) |
| `failed`, `blocked`, `expired` | `failed` (+ `error_code`) | — (terminal) |
| `cancelled` | `cancelled` si la contrainte en production l'autorise, sinon `failed` + `error_code = CANCELLED` (à vérifier, cf. 09 §9.5) | — (terminal) |

### Transitions terminales

États terminaux : `done`, `failed`, `blocked`, `expired`, `cancelled`. `held` n'est **pas** terminal : il a une
échéance de modération (ci-dessous).

**Deux échéances distinctes** :

| Échéance | S'applique à | Valeur | Contrôle |
|---|---|---|---|
| `exec_expires_at` + heartbeat | `queued` → `moderating` (le courtier travaille) | création + `timeout_s` + marge ; heartbeat ≤ 2 min | cron d'expiration d'exécution |
| `review_due_at`, `retention_deadline` | `held` uniquement | entrée en `held` + 48 h (revue) ; + 7 jours (suppression) | **tâche différée persistante** (`moderation_tasks`, une ligne par run retenu), traitée par un cron : rappel à 24 h, escalade à 48 h, passage en `expired` + suppression des médias à 7 jours |

À l'entrée en `held`, le courtier **termine son travail et rend toutes les ressources** : les médias sont déjà dans
le stockage privé, l'exécuteur est arrêté, plus aucun heartbeat n'est attendu, `exec_expires_at` est mis à `NULL`. Le
cron d'expiration d'exécution **exclut** les runs `held`. Aucun courtier n'attend une revue humaine.

Une seule fonction SQL, `transition_comfy_run(run_id, from_states[], to_state, payload)`, porte toutes les
transitions :

```sql
UPDATE comfy_runs SET status = :to, … WHERE id = :run AND status = ANY(:from) RETURNING *;
-- 0 ligne modifiée = transition refusée (un autre acteur est passé avant) → l'appelant s'arrête
```

Dans la **même transaction** : mise à jour de `jobs.status`, changement d'état des assets du run, et, si l'état est
terminal, insertion d'un événement dans `notification_outbox` (§ « Notification »). **La transition terminale ne
clôt pas les comptes** : elle fixe le résultat pour l'utilisateur ; la clôture financière est un processus distinct
(§ « Clôture financière »).

| Effet par état terminal | `done` | `failed` / `expired` | `blocked` | `cancelled` |
|---|---|---|---|---|
| Résultat utilisateur | figé | figé | figé | figé |
| Budget | clôture financière ouverte (provision conservée) | idem | idem | idem |
| Assets | `final` (et `raw` si conservé) passent à l'état décidé par la modération ; aperçus supprimés | tous supprimés | médias supprimés selon la rétention (§2.8) | tous supprimés |
| Quota quotidien | compté | compté (règle actuelle : tout job créé compte ; remboursement sur panne d'infrastructure = **décision produit**, Q6) | compté | compté |
| Notification (outbox) | 1 événement | 1 événement | 1 événement (« contenu non conforme ») | aucun |

### Clôture financière

Un état terminal ne signifie pas que la consommation est arrêtée : un conteneur peut encore tourner pendant son
arrêt ou sa fenêtre d'inactivité. `comfy_runs.financial_status` suit donc son propre cycle :

| `financial_status` | Signification | Passage au suivant |
|---|---|---|
| `open` | run en cours ; réservation complète en place | à l'état terminal du run |
| `closing` | résultat figé ; **la provision reste réservée** ; arrêt du calcul demandé si nécessaire | quand l'arrêt est **confirmé** : événement `done` de l'exécuteur, ou statut terminal de l'appel Modal (`FunctionCall`) après annulation |
| `closed` | coût réglé (consommé mesuré + part d'inactivité allouée), reste libéré | — |

- **Destruction du conteneur** : pour `cancelled`, `expired`, OOM, `cleanup_ok = false` ou timeout, le courtier
  appelle `FunctionCall.cancel(terminate_containers=True)`. Par défaut (`terminate_containers=False`), Modal annule
  l'entrée mais **ne détruit pas** le conteneur (`verified-docs`, SDK Modal `FunctionCall.cancel`), qui resterait
  réutilisable et facturé jusqu'à sa fenêtre d'inactivité.
- **Consommation tardive** : toute consommation constatée après la transition terminale (fin d'arrêt, inactivité)
  est comptabilisée comme `settlement` complémentaire du même run, **sans** seconde livraison, publication ou
  notification.
- **Runs bloqués en `closing`** : le rapprochement quotidien les clôt à partir des données d'usage Modal ; au-delà de
  24 h, alerte admin. La provision reste imputée au plafond tant que le run n'est pas `closed`.

Règles :

- **Le premier état terminal gagne.** Tout événement arrivant après (fin tardive après annulation, sortie après
  expiration, résultat de modération après retrait) est **journalisé et ignoré** ; ses fichiers sont supprimés ; il
  ne peut ni publier, ni notifier, ni facturer une seconde fois.
- `done` n'est posé que lorsque l'asset final est `private_ok` ou `public_ok`. Une sortie en attente de revue laisse
  le run en `held`.
- Annulation pendant `moderating` ou `held` : autorisée, gagne si elle passe la première.
- **Relance = nouveau job** (nouvelle clé d'idempotence, nouvelle unité de quota). Pas de relance automatique
  (`retries=0`, convention du dépôt).
- Matrice de courses testée (05 étape 2) : annulation × fin, expiration × fin, deux dispatchs × un run, revue ×
  retrait, annulation × `held`, échéance de modération × revue, notification rejouée.
- **Heartbeat** du courtier toutes les 15 s, pendant l'exécution seulement. Le cron d'expiration d'exécution passe en
  `expired` les runs **hors `held`** dont le heartbeat dépasse 2 minutes ou dont `exec_expires_at` est dépassé, puis
  ouvre la clôture financière et demande la destruction du conteneur (`modal_call_id`).
- **Réconciliation** : après une coupure WebSocket, le courtier relit `/history/{prompt_id}` ; après disparition du
  conteneur, le cron d'expiration fait foi.

### Annulation

`POST /api/jobs/[id]/cancel` (propriétaire) → `transition_comfy_run(cancelled)`. Le courtier lit l'état à chaque
heartbeat (≤ 15 s) et :

1. demande à l'exécuteur, par le canal de contrôle (§2.7), l'annulation native de ComfyUI
   `POST /api/jobs/{prompt_id}/cancel` (v0.42.0, idempotente, `server.py` L1060) ;
2. si l'exécuteur ne répond pas sous 10 s : `FunctionCall.cancel(terminate_containers=True)` (destruction du
   conteneur).

En `held`, aucune ressource n'est à arrêter : l'annulation supprime les médias retenus et clôt le run.
Budget : clôture financière (ci-dessus), jamais au moment même de l'annulation.

### Progression et notification

- `comfy_runs` ajouté à la publication realtime ; RLS : le propriétaire lit ses runs (sans `params_effective`
  sensibles si besoin, via une vue). Le hook existant écoute `jobs` et `job_scenes` : il est étendu, pas remplacé.
- Progression écrite au plus une fois par seconde. Pour les profils de modération `fail_closed` (H3), la progression
  est **uniquement textuelle** (étape, pourcentage) : aucun aperçu visuel n'est transmis avant autorisation (§2.6).

### Notification (outbox transactionnelle)

- La transition terminale insère, dans la même transaction, une ligne `notification_outbox` : `id` **stable**
  (dérivé de `run_id` + type d'événement, contrainte d'unicité), `status` (`pending`/`sent`/`failed`), `attempts`,
  `next_attempt_at`, `provider_message_id`, `sent_at`.
- Un envoyeur (cron, plus déclenchement après commit) traite les lignes `pending` : envoi via `lib/email.ts`, avec
  l'`id` de l'outbox comme **clé d'idempotence du fournisseur** si celui-ci en accepte une (`unknown` pour Resend, à
  vérifier en étape 3) ; reprises avec délai croissant ; `failed` après N essais, alerte admin.
- `sent_at` (ancien `notified_at`) est posé **après** confirmation du fournisseur : c'est une **confirmation
  d'envoi**, pas une réservation.
- Garantie réelle : livraison **au moins une fois**. « Jamais deux e-mails » n'est garanti que si le fournisseur
  déduplique sur la clé d'idempotence ; sinon, un doublon reste possible dans le cas rare d'un arrêt entre l'envoi
  et l'enregistrement de `sent_at`. Le critère d'acceptation est formulé ainsi (05).

### Plafonds financiers

**Périmètre.** Comptent : tout ce que consomme l'app Modal `alphogenai-comfy` (GPU, CPU et mémoire de l'exécuteur,
du courtier, du Studio et des crons), le trafic sortant, les appels payants de modération et de transcription
liés aux runs ComfyUI. Ne comptent pas : les pipelines existants (`alphogenai-v2`, fournisseurs API), qui gardent
leurs propres suivis. Le budget de **tests** (05 §5.9) est un périmètre séparé (`scope = 'tests'`).

**Périmètres de plafond** (`spend_envelopes`) : `comfy_global`, `runtime:<id>`, `template:<slug>`, `tests` ; périodes
jour (UTC) et mois civil.

**Comptabilisation** (`spend_ledger`) :

| Écriture | Quand | Montant |
|---|---|---|
| `reservation` | à l'admission | coût **maximal** : (`timeout_s` + démarrage + post-traitement + inactivité de fin) × prix du conteneur, + modération estimée |
| `settlement` | à la **clôture financière** (arrêt confirmé), puis en complément si une consommation tardive est constatée | coût mesuré : secondes de conteneur × prix (GPU + CPU + mémoire), part d'inactivité allouée (07 §7.4), appels de modération facturés |
| `release` | à la clôture financière | réservation − règlement |
| `adjustment` | rapprochement quotidien | écart entre le total comptabilisé et la consommation relevée chez Modal (relevé d'usage ou facture) |

Consommé de la période = règlements + ajustements + réservations ouvertes.

**Mécanismes d'arrêt**, du plus fin au plus large :

1. **Admission** : refusée si `consommé + réservation > limite` pour l'un des périmètres (message « capacité
   atteinte », sans facturation ni quota).
2. **Dispatch et prise en charge** : le courtier relit le plafond en base ; un run `queued` au-delà de la limite
   passe en `failed` (`BUDGET`), réservation libérée.
3. **Runs en cours** : ils vont à leur terme. Leur coût est borné par la réservation faite à l'admission ; c'est ce
   qui garantit qu'aucun run ne dépasse le plafond de plus que sa propre réservation.
4. **Coupure automatique** : si le rapprochement montre un dépassement, le template ou le runtime concerné passe en
   kill switch (statut en base), avec alerte admin.
5. **Filet de sécurité Modal.** Modal distingue trois mécanismes (`verified-docs`, guide Budgets) :

   | Mécanisme | Ce qu'il plafonne | Portée | Effet pour nous |
   |---|---|---|---|
   | Budget d'espace (*Workspace budget*) | l'**usage** total du mois, avant application des crédits | tout l'espace | couvre aussi la production `alphogenai-v2` : un dépassement ComfyUI pourrait l'arrêter |
   | Limite de dépense (*spend limit*) | les charges **nettes** après crédits | tout l'espace | même réserve |
   | Budget d'environnement (*Environment budget*) | l'usage **de calcul** d'un environnement Modal | un environnement | isole `alphogenai-comfy` sans toucher la production ; ne couvre **pas** tous les frais (stockage, trafic) ; disponibilité selon le plan, **à vérifier** |

   Options à comparer (décision Q2) : (a) environnement Modal dédié à `alphogenai-comfy` avec son budget
   d'environnement, plus le budget d'espace placé au-dessus des besoins de la production ; (b) espace Modal séparé ;
   (c) budget d'espace seul, réglé haut. Les frais non couverts par un budget d'environnement restent suivis par
   notre propre comptabilisation (enveloppes et rapprochement).

Tests (05 étape 2) : refus d'admission au plafond, run `queued` bloqué au dispatch, réservations concurrentes qui
ne dépassent jamais la limite, ajustement de rapprochement, coupure automatique.

## 2.6 Confidentialité, stockage et publication (B1, I7)

Constat sur l'existant (vérifié **statiquement dans le code de `main`** @ `39cfbc6`, indépendant de ComfyUI ; le
comportement de la production déployée n'est **pas** vérifié, cf. 01 §1.5) : `GET /api/jobs/[id]` lit n'importe quel
job avec le client service sans vérifier l'appelant ; `/v/[id]` affiche tout job `done` ; les helpers R2 produisent
des URL publiques. Le parcours ComfyUI ne s'appuie sur aucun de ces comportements.

| Règle | Implémentation |
|---|---|
| **Privé par défaut** | Toute sortie (finale, brute, aperçu, miniature) est écrite dans un stockage privé (bucket privé, clé non devinable, aucune URL publique) |
| Lecture privée | `GET /api/jobs/[id]` et `GET /api/media/[asset_id]` exigent une session et vérifient `owner_id = auth.uid()` (ou admin via `requireAdmin`) avant toute lecture ; URL signées de courte durée (≤ 10 min) |
| États d'accès | `pending`, `held`, `blocked` : **aucun octet** accessible au propriétaire ; `private_ok` : propriétaire seulement ; `public_ok` : peut être publié |
| **Aperçus** | Une vignette de progression **est un média**, même en basse définition. Profils `fail_closed` (H3) : aucun aperçu visuel n'est produit ni transmis avant autorisation (ComfyUI lancé avec `--preview-method none`, événement `preview` désactivé côté exécuteur) ; progression **textuelle** seulement. Autres profils : un aperçu est un asset `role = preview`, soumis aux mêmes règles d'accès et de modération que le final |
| **Publication explicite** | Action de l'utilisateur sur un asset `public_ok` : pose `published_at`. `/v/[id]`, la galerie et l'export social ne lisent que des assets publiés et non retirés |
| Retrait | Voir « Retrait et révocation » ci-dessous |
| Assets typés | `kind`, `mime`, `role`, `postprocess_capabilities`. La bibliothèque et la page job rendent selon `kind` (image ou vidéo). Une post-production n'est proposée que si l'asset la déclare |
| Brut et corrigé H3 | Deux assets (`raw`, `final`) liés par `derived_from` + `transform = 'audio_shift'`, même provenance |
| Overlay | **Non proposé** pour les sorties ComfyUI en V1 : l'overlay existant exige un plan Research (`research_job_id`). Voix-off et export social seulement si les capacités sont déclarées et testées |

Ces règles s'appliquent **avant les premiers contenus utilisateurs**, y compris en bêta fermée.

### Droits : métadonnées et octets séparés, aucun accès direct au stockage

Les permissions de Supabase Storage s'appliquent sur `storage.objects`, **indépendamment** des routes applicatives
(`verified-docs`, guide Storage access control) : une politique « propriétaire » sur le bucket permettrait au client
de signer ou de télécharger un objet retenu en contournant `/api/media`. D'où :

| Ressource | `anon` | `authenticated` (propriétaire) | `service_role` (serveur) |
|---|---|---|---|
| Bucket des sorties ComfyUI (`comfy-outputs`, privé) : `storage.objects` | aucune politique | **aucune politique** : ni lecture, ni liste, ni signature, ni écriture | lecture, écriture, signature |
| Objets R2, si R2 est utilisé à la place | aucun domaine public, aucun bucket public | aucune clé | URL présignées émises par le serveur seulement |
| `assets` : **métadonnées** (id, job, kind, mime, état de modération, dates) | — | lecture de **ses** lignes via une vue `assets_public_meta`, **sans** `storage_key` ni provenance interne | tout |
| `assets.storage_key` et colonnes internes | — | **aucun GRANT** sur ces colonnes | tout |
| Octets | — | uniquement via `GET /api/media/[asset_id]` : session + propriétaire + `moderation_state ∈ {private_ok, public_ok}` + non retiré → URL signée courte émise par le serveur | — |

Tests (05 étape 2), **par les API directes et pas seulement par les routes Next.js** : avec le jeton d'un utilisateur,
appels Storage directs (`createSignedUrl`, `download`, `list`, `upload`) sur `comfy-outputs` → refusés, y compris pour
ses propres objets ; `select storage_key from assets` via PostgREST → refusé ; URL R2 devinée → refusée ; asset
`held` de l'utilisateur lui-même → aucun octet par aucun chemin.

### Retrait et révocation

**Délai maximal de révocation : objectif d'acceptation, à mesurer** (pas encore une garantie acquise) :
`T_rev = TTL des URL signées (10 min) + délai de purge du cache (objectif ≤ 5 min)`, soit **≤ 15 min** pour toute
copie servie par AlphoGen. Valeurs à confirmer (Q4).

| Copie | Mécanisme | Délai |
|---|---|---|
| Nouvelles URL signées | `withdrawn_at` posé : `GET /api/media/[asset_id]` refuse immédiatement | immédiat |
| URL signées déjà émises (privées) | Servies avec `Cache-Control: private, no-store` : aucun cache partagé ne les garde ; elles expirent à leur TTL | ≤ 10 min |
| Copie publique (asset publié, servie avec cache) | Au retrait : objet **supprimé ou déplacé** sous une nouvelle clé (l'ancienne clé ne sert plus rien), puis purge CDN de l'ancienne URL ; vérification que l'URL renvoie 404 | ≤ purge mesurée |
| Dérivés (brut, final, miniature, aperçus, exports sociaux générés) | Retrait **en cascade** sur tout le graphe `derived_from` d'un même run | identique |
| Pages publiques (`/v/[id]`, galerie) | Lecture de `withdrawn_at` sans cache applicatif ; revalidation des pages statiques au retrait | immédiat après revalidation |
| Publications déjà envoyées sur des réseaux sociaux | Suppression via les connexions sociales existantes quand l'API le permet ; sinon, tâche manuelle tracée | hors de notre contrôle, best effort |
| Copies téléchargées par l'utilisateur ou des tiers | Aucune révocation possible : c'est une limite, à écrire dans les CGU | — |

Après expiration de la rétention (§2.8) ou retrait définitif, les objets sont **supprimés du stockage** (et non
seulement masqués), journal de suppression conservé.

Tests (05 étape 2) : émettre une URL, retirer, vérifier immédiatement le refus de nouvelles URL, puis le refus de
l'ancienne URL après le TTL ; publier, **mettre l'URL publique en cache** (requêtes préalables par le CDN), retirer,
puis **rejouer cette URL déjà en cache** à intervalles réguliers jusqu'au 404 : le délai observé est la mesure de
`T_rev` (les en-têtes seuls ne prouvent pas l'absence de copie servie par un cache) ; cascade sur les dérivés.

## 2.7 Isolation du code tiers et des secrets (B3)

Les options ComfyUI (`--disable-all-custom-nodes`, `--whitelist-custom-nodes`, `--disabled-nodes-config`,
`--disable-api-nodes`, `verified-code` v0.42.0) **limitent le code chargé**. Elles n'isolent pas ce code : un custom
node est du code Python privilégié dans le processus ComfyUI.

### Contrat courtier / exécuteur

| | Courtier | Exécuteur |
|---|---|---|
| Rôle | orchestration du run : base, stockage, modération, états, coûts, notification | exécution du graphe dans ComfyUI, rien d'autre |
| Ressources | CPU | GPU du runtime |
| Secrets Modal | Supabase service, stockage, modération | **aucun** (ni Supabase, ni stockage, ni modération, ni jeton Hugging Face : les modèles sont déjà sur le volume) |
| Réseau | sortant vers Supabase, stockage, modération | **bloqué** (`block_network=True`) si l'étape 1 le valide |
| Volumes | aucun volume de modèles | volume de modèles **en lecture seule** |
| Identité de l'utilisateur | connue | **inconnue** : l'exécuteur ne reçoit qu'un identifiant de run aléatoire |

Interface (une fonction Modal de l'exécuteur, appelée par le courtier) :

```python
# executor.run_graph(run_nonce: str, graph: dict, inputs: dict[str, bytes], limits: dict) -> Iterator[Event]
# Event = {"type": "progress"|"preview"|"output"|"done"|"error", ...}
#   output  : {"name", "mime", "bytes"}            preview : vignette = MÉDIA ; jamais émis pour un profil fail_closed (H3)
#   done    : {"cleanup_ok": bool, "gpu_seconds": float}   error : {"code": "OOM"|"INVALID_INPUT"|"TIMEOUT"|"INTERNAL"}
```

- Appel en mode **générateur** (`remote_gen`), qui donne au courtier progression, aperçus et heartbeat sans réseau
  côté exécuteur. Canal de contrôle (annulation) : un second appel léger vers le même conteneur ou, à défaut,
  `FunctionCall.cancel()` (§2.5). Le mécanisme exact est **validé en étape 1** (`inferred`).
- Tailles : les entrées et sorties transitent par les arguments et retours Modal. La **taille maximale** acceptée
  est `unknown` : à mesurer en étape 1 avec une vidéo H3 de 10 s. Repli si la limite est trop basse : volume
  éphémère par run, écrit par l'exécuteur, lu puis effacé par le courtier, jamais partagé entre runs.
- Le courtier vérifie chaque sortie (MIME réel, taille, nombre de sorties attendu par le manifeste) avant de la
  stocker. Une sortie inattendue fait échouer le run.
- `cleanup_ok = false`, une erreur, un OOM, une annulation ou un timeout entraînent le **recyclage** du conteneur.

### Exigences d'isolation

| Exigence | Implémentation |
|---|---|
| **Custom nodes = code à auditer, toujours** | Chaque pack d'un runtime a une revue écrite (version épinglée, surface : fichiers, réseau, `exec`, téléchargements, dépendances transitives). **L'isolation des conteneurs ne remplace pas cette revue** : même dans un conteneur par run, un pack compromis peut altérer les sorties, contourner la modération par le contenu produit, ou exfiltrer des données si le réseau est ouvert. Pas de pack sans revue, quelle que soit la politique de réutilisation |
| Aucun secret métier dans l'exécuteur | cf. contrat ; vérifié par un test sur la définition de l'app (aucun `modal.Secret` attaché à l'exécuteur) |
| Réseau | `block_network=True`. Repli si l'étape 1 l'invalide : réseau sortant restreint, aucun secret, et revue des packs renforcée |
| Modèles | volume en lecture seule, séparé de toute donnée utilisateur |
| Espace de travail | `input/`, `output/`, `temp/` propres au run, bornés en taille, effacés en fin de run, vérifiés (`cleanup_ok`) |
| **Réutilisation des conteneurs** | Politique par runtime : `cross_user`, `same_user` ou `none` (un conteneur par run). Proposé : `cross_user` pour H3 (cœur ComfyUI seul) après test de fuite ; `none` pour MOSS au départ. Décision Q1 |
| Recyclage | destruction du conteneur après erreur, OOM, annulation, timeout ou nettoyage incomplet |
| Test de fuite | deux utilisateurs, deux runs successifs sur le même conteneur : le second n'obtient ni fichier, ni historique, ni aperçu, ni sortie du premier |
| Graphe | jamais fourni par le navigateur ; reconstruit côté serveur à partir d'une version immuable (§2.4) |

## 2.8 Modération (D5, B5)

### Contrat interchangeable

```ts
interface ModerationProvider {
  id: string; version: string;
  capabilities: { media: ("text"|"image"|"video_frames"|"audio")[]; categories: Category[] };
  checkText(text: string): Promise<ModerationResult>;
  checkImage(bytes: Uint8Array, mime: string): Promise<ModerationResult>;
  checkAudio?(bytes: Uint8Array, mime: string): Promise<ModerationResult>;
}
interface ModerationResult {
  scores: Partial<Record<Category, number>>;   // une catégorie ABSENTE n'est jamais un score nul
  unsupported: Category[]; provider_id: string; provider_version: string; latency_ms: number;
}
```

Adaptateurs prévus : API externe, ou modèle auto-hébergé sur Modal (dans le courtier, ou une fonction dédiée). Le
choix concret se fait sur banc de test (précision, faux positifs, coût, latence, licence, traitement des données
personnelles). Mode fantôme possible avant activation.

### Couverture

| Contenu | Contrôle |
|---|---|
| Prompt, textes produits par des nodes (ex. `TextGenerate` de MOSS) | `checkText` + `screenPrompt` existant |
| Images d'entrée | `checkImage` |
| Image de sortie | `checkImage` |
| Vidéo de sortie | N images échantillonnées (N par profil, au minimum 1 par seconde) |
| **Audio** (dialogue H3, audio importé) | transcription (Whisper, déjà utilisé par le module Clipping sur Modal) → `checkText`, plus `checkAudio` si un fournisseur le propose |
| Chaque variante livrable (brut **et** corrigé) | Décision par asset. Un dérivé n'hérite de la décision de sa source que si la transformation est déclarée sans effet sur le contenu (`audio_shift` : oui) |

Si une catégorie exigée par le profil n'est couverte par aucun fournisseur actif, le contenu est `held`.

### Décisions et rétention

| Décision | Livré au propriétaire | Publiable | Délai, rétention |
|---|---|---|---|
| `blocked` | Non | Non | Média supprimé sous 7 jours, sauf conservation légale (signalement aux autorités) ; métadonnées gardées 12 mois |
| `held` | **Non** | Non | Revue humaine ≤ 48 h ; sans décision à 7 jours : supprimé ; l'utilisateur voit « en vérification » |
| `private_ok` | Oui | Après revue humaine | Rétention normale du compte |
| `public_ok` | Oui | Oui (publication explicite) | Rétention normale |

Panne d'un fournisseur : profils `fail_closed` (H3) → `held` ; `fail_open` → `private_ok` + revue a posteriori
obligatoire avant publication. Aucun contenu indéterminé n'est livré sous un profil `fail_closed`.

### Liberté créative

La politique ne bloque que ce qu'imposent la loi, les CGU et la licence (Exhibit A de H3). Fiction, horreur,
violence non graphique et contenus artistiques passent en `public_ok` ou `private_ok`. La politique existante
`screenPrompt` (blocage de marques protégées et de personnalités) est **reconnue** : ses exceptions légitimes
(personne consentante avec visage vérifié, marque de l'utilisateur lui-même) sont traitées par un mécanisme
d'exception tracé, pas par un contournement.

### Revue humaine, signalement, sanctions

- File admin unique : contenus `held`, demandes de publication `private_ok`, signalements (`content_reports`).
- Accès des modérateurs journalisé (qui, quoi, quand), limité aux admins via `requireAdmin`.
- Actions : valider, retirer (`withdrawn_at`), sanctionner (`user_strikes`, suspension vérifiée à l'admission), avec
  motif. L'utilisateur est informé et peut contester une fois.
- Tests : pannes de fournisseur, catégories non supportées, tentatives de contournement (texte dans l'image, audio
  seul, variante brute), jeu « contenus légitimes ».

## 2.9 Perspectives hors V1 (sans impact sur le schéma V1)

- **Studio Pro** : même validateur, conteneur par utilisateur, runtime restreint, obligations GPL traitées
  (annexe A.2). Pas de colonne dédiée en V1 : `mode` reste `simple` / `advanced`.
- **Entraînement** : outil spécialisé (candidat vérifié : `ostris/ai-toolkit`, MIT), tables propres le moment venu.
  Contrainte H3 V.3 : les sorties H3 ne peuvent améliorer qu'un dérivé de H3 (provenance déjà portée par
  `assets.provenance`).
