# Future-Proof Notes — Architecture AlphoGen

**Audience** : développeurs humains + agents IA (Claude Code, etc.) intervenant sur ce repo.
**Objectif** : préserver la stabilité production en documentant les **décisions historiques**, les **garde-fous** ("NE PAS faire"), les **patterns à respecter** et les **recettes** pour les opérations courantes.

Version : **2026-05-11** · à actualiser après chaque shift architectural majeur.

> 📌 **Lire `CLAUDE.md` AVANT ce document.** CLAUDE.md décrit l'état actuel ; ce fichier explique le pourquoi et fixe les règles.

---

## Sommaire

1. [Décisions architecturales historiques (le "pourquoi")](#1-décisions-architecturales-historiques-le-pourquoi)
2. [Garde-fous — Ne PAS faire](#2-garde-fous--ne-pas-faire)
3. [Patterns à respecter](#3-patterns-à-respecter)
4. [Anti-patterns identifiés](#4-anti-patterns-identifiés)
5. [Recettes opérationnelles](#5-recettes-opérationnelles)
6. [Règles pour les agents IA](#6-règles-pour-les-agents-ia)
7. [Glossaire](#7-glossaire)

---

## 1. Décisions architecturales historiques (le "pourquoi")

### 1.1 Pourquoi EvoLink comme provider principal et pas Kie.ai direct

**Décision** : depuis avril 2026, EvoLink (`api.evolink.ai/v1`) est le gateway unifié pour tous les modèles vidéo fermés (Wan 2.6, Wan 2.7, Happy Horse 1.0). Kie.ai reste en code mais n'est plus la cible des nouvelles features.

**Pourquoi** :
- EvoLink expose plusieurs providers derrière une API unique → ajouter un nouveau modèle = ajouter une ligne dans le registry DB, pas un nouveau client
- Le routing inter-modèles (fallback, quality tier) est géré par EvoLink, pas par notre code
- L'évaluation Alibaba Cloud Bailian se fait via EvoLink (Frankfurt region, GDPR)
- Kie.ai garde un usage spécifique : Seedance direct pour les cas où on veut bypass EvoLink (testing, fallback)

**Quand reconsidérer** : si EvoLink devient instable, ou si on signe directement avec Alibaba Bailian sans intermédiaire (cf. Catalyst Program).

### 1.2 Pourquoi Engine Registry DB-driven

**Décision** : les engines sont définis dans 4 tables Supabase (`engines`, `engine_plans`, `engine_costs`, `engine_secrets`) plutôt que dans le code TypeScript ou Python.

**Pourquoi** :
- Admin peut activer/désactiver un engine, changer son pricing, rotater une clé API **sans redéploiement**
- Le routing utilise `priority` (numerique) pour ranker les engines disponibles pour un plan donné
- Les secrets sont chiffrés AES-256-GCM dans `engine_secrets` (pas en env Vercel)
- Nouveau engine = une INSERT, pas un PR

**Conséquence** : ne JAMAIS hardcoder un engine ID dans le code business. Toujours passer par `select_engine()` du router Python ou via le registry TS.

### 1.3 Pourquoi state machine + cron au lieu de Modal retries

**Décision** : les Modal functions ont `retries=0`. Les jobs failés sont retentés via cron GitHub Actions toutes les 5 min (`/api/cron/evolink-poll`).

**Pourquoi** :
- Modal retries automatiques ne savent pas distinguer une 5xx récupérable d'une 4xx définitive → re-burn du GPU pour rien
- Notre state machine atomique (`scenes.status` avec claims) gère la sémantique métier : "scene 2 a failé après scene 1 done" → retry seulement scene 2
- Le cron rattrape les jobs orphelins EvoLink (webhook raté) sans dépendre de la stabilité d'un canal
- Idempotency : un même `task_id` EvoLink peut être polled plusieurs fois sans effet de bord

**Quand reconsidérer** : si EvoLink expose un webhook fiable + signature HMAC, on peut envisager de réduire la fréquence du cron.

### 1.4 Pourquoi AES-256-GCM custom (Node built-in) plutôt que lib externe

**Décision** : `lib/encryption.ts` utilise `crypto` natif (pas `node-jose`, pas `crypto-js`).

**Pourquoi** :
- Zéro dep externe pour une primitive critique sécurité
- AES-256-GCM est l'algo recommandé pour secret encryption (authenticated, NIST-approved)
- IV 12 bytes (standard GCM), authTag stocké séparément
- La master key (`ENGINE_SECRETS_KEY`) est 32 bytes (256 bits), générée via `openssl rand -hex 32`
- Format de sortie : 3 colonnes DB (`encrypted` base64 + `iv` base64 + `authTag` base64) — facile à query et roter

**Conséquence** : ne JAMAIS introduire une lib externe pour chiffrer / déchiffrer ces secrets. Si besoin d'algo différent (KMS, HSM), proposer en RFC architecture, pas en commit direct.

### 1.5 Pourquoi 4 contextes Supabase client

**Décision** : `lib/supabase/{client,server,middleware,service}.ts` — 4 helpers, pas un seul.

**Pourquoi** :
- `client.ts` : browser-side, cookies session géré par `@supabase/ssr`, anon key uniquement
- `server.ts` : server-side authentifié, cookies via Next.js `cookies()` API
- `middleware.ts` : edge runtime, refresh session avant chaque request workspace
- `service.ts` : **bypass RLS** via service-role key, **server-side uniquement**

Mélanger ces contextes = bug ou faille sécurité (ex : utiliser `service.ts` côté client exposerait la service-role key au monde).

### 1.6 Pourquoi SiteShell allowlist pattern

**Décision** : `components/site-shell.tsx` ne pose le header/footer marketing que sur une **allowlist** de routes publiques (`/`, `/about`, `/technology`, `/pricing`, `/privacy`, `/terms`, `/blog*`).

**Pourquoi** :
- Workspace (`/home`, `/create`, `/library`, `/projects`, `/jobs/[id]`) a son propre layout avec sidebar `h-screen overflow-hidden`
- Admin (`/admin/*`) a son propre layout
- Login (`/login`) est bare (pas de chrome)
- Allowlist (vs blocklist) est **safe-by-default** : une nouvelle route inconnue n'aura PAS de header marketing accidentel

**Conséquence** : pour ajouter une nouvelle page marketing, l'ajouter explicitement au `PUBLIC_PATHS` Set dans `site-shell.tsx`.

### 1.7 Pourquoi Stripe multi-SaaS isolation layer

**Décision** : `lib/stripe-app-context.ts` filtre les events Stripe par `app_id` (metadata custom).

**Pourquoi** :
- Le même compte Stripe peut servir plusieurs SaaS (AlphoGen, tradinglab, etc.)
- Sans filtre, les webhooks d'un projet déclencheraient des actions sur les autres → corruption de données
- Pattern : chaque session checkout / customer porte un `metadata.app_id` qu'on vérifie au webhook

**Conséquence** : tout nouveau event handler doit appeler le helper `isEventForThisApp(event, appId)` avant traitement.

### 1.8 Pourquoi `typescript.ignoreBuildErrors: true` (temporaire)

**Décision actuelle** : `next.config.ts` skip les erreurs TS au build.

**Pourquoi (historique)** :
- Migration legacy → Next 15 + React 19 a laissé 8 erreurs TS sur des fichiers admin et Stripe
- Désactiver le check au build permettait de continuer à shipper sans bloquer
- C'est une **dette assumée** documentée dans `docs/CTO_TECHNICAL_DEEP_DIVE_2026-05-11.md` §11.1

**Quand changer** : **dès que les 8 erreurs sont cleanées** (sprint dédié ~2h), retirer le flag et bloquer les nouveaux PRs avec erreurs TS. **Reco** : faire ce cleanup AVANT Multi-Reference V1.

### 1.9 Pourquoi storage buckets `videos` + `assets` publics

**Décision actuelle** : buckets Supabase Storage `videos` et `assets` sont `public: true`.

**Pourquoi (historique)** :
- Les vidéos générées sont publiquement consultables (sharing produit)
- URLs prévisibles mais signées server-side au upload
- Simplification UX initiale

**À ne plus faire** :
- Les **références utilisateurs** (V1 multi-reference) **ne doivent PAS** atterrir dans ces buckets publics
- Créer un bucket `references` **privé** avec signed URLs TTL 6h (cf. décision CTO 2026-05-11)
- Cf. recette §5.4

### 1.10 Pourquoi multi-scene chaining via last-frame (Option B)

**Décision** : pour générer une vidéo multi-scenes cohérente, on extrait le dernier frame de la scène N et on l'utilise comme `first_frame_url` de la scène N+1 (I2V mode).

**Pourquoi (alternatives évaluées)** :
- **Option A** : générer toutes les scènes en parallèle → pas de continuité visuelle
- **Option B** (choisie) : chaîner via last-frame → continuité naturelle des personnages, lumière, props
- **Option C** : modèle natif multi-scene → pas disponible côté providers actuels

**Conséquence pratique** :
- La fonction Modal `generate_multi_scene` orchestre le chaînage
- `extract_last_frame` est appelée entre chaque scène
- En cas de fail d'une scène intermédiaire : retry seulement cette scène (sans perdre les précédentes)
- Validé end-to-end sur job réel `1f06605d-f342-43d6-86c9-04d7bc5163e8`

---

## 2. Garde-fous — Ne PAS faire

### 2.1 Code stable à NE PAS toucher sans demande explicite

| Composant | Raison |
|---|---|
| `modal_app/engines/wan.py` (Wan I2V local) | Fallback stable production, mécanique GPU/diffusers délicate |
| `app/api/stripe/webhook/route.ts` (idempotency + multi-SaaS) | Logic billing validée en prod, déshabiller = risque financier |
| `app/api/cron/evolink-poll/route.ts` (state machine recovery) | Sécurité contre les jobs orphelins, complexité non triviale |
| `modal_app/video_pipeline.py:generate_multi_scene` | Multi-scene chaining Option B fraîchement shippé et validé |
| `lib/encryption.ts` | Primitive sécurité, ne pas "améliorer" sans audit |
| `lib/stripe-app-context.ts` | Multi-SaaS isolation, casser ça = cross-project data corruption |
| Schéma DB existant (toute migration applicate à date) | Schéma stable, additif uniquement |

### 2.2 Refactors interdits sans RFC explicite

- ❌ **Remplacer EvoLink** par un autre provider tant qu'il est en évaluation Catalyst Program
- ❌ **Introduire un ORM** (Prisma, Drizzle, Kysely). `@supabase/supabase-js` couvre nos besoins, ajouter une couche = yak shaving + perte de RLS automatique
- ❌ **Migrer le pipeline vers une queue externe** (BullMQ, Inngest, Temporal). Le pattern actuel state machine + cron + Modal direct fonctionne et est simple à debug
- ❌ **Réécrire le SiteShell allowlist en blocklist** — l'allowlist est safe-by-default
- ❌ **Remplacer Supabase Auth** par Auth0/Clerk/Workos. Migration de l'`auth.users` table = coût massif sans bénéfice
- ❌ **Migrer R2 vers S3 ou un autre storage** tant que zero egress fee est nécessaire au modèle économique
- ❌ **Ajouter Redux/Zustand** côté frontend. React 19 + Server Components couvrent les besoins. State local + URL params + React Query si vraiment besoin un jour
- ❌ **Custom design system from scratch** — réutiliser shadcn primitives existantes (`components/ui/`)

### 2.3 Patterns à NE PAS introduire

- ❌ **Hardcoder un engine ID** dans le code business — toujours passer par le registry DB
- ❌ **Stocker une URL signée** comme source de vérité — toujours stocker le storage path et signer à la demande
- ❌ **JSONB blob pour données relationnelles** — créer une vraie table (cf. `job_references` V1)
- ❌ **Public bucket pour données utilisateur sensibles** — bucket privé + signed URL
- ❌ **Polling client-side** quand un realtime channel existe (Supabase Realtime sur les jobs)
- ❌ **Server-side validation manquante** — toujours valider même si le client valide aussi
- ❌ **`console.log` brut sur routes critiques** — utiliser logs structurés JSON
- ❌ **Migrations destructives sans plan rollback** — toujours additif, sinon RFC explicite

### 2.4 Sécurité — interdits absolus

- ❌ **JAMAIS** exposer `SUPABASE_SERVICE_ROLE_KEY` côté client (frontend, code public)
- ❌ **JAMAIS** logger `ENGINE_SECRETS_KEY`, OAuth tokens, ou contenu déchiffré
- ❌ **JAMAIS** roter `ENGINE_SECRETS_KEY` sans re-chiffrer toute la DB (sinon tous les secrets engines + OAuth tokens deviennent illisibles)
- ❌ **JAMAIS** trust un input client pour le plan utilisateur ou l'engine demandé — résoudre depuis `profiles` server-side
- ❌ **JAMAIS** skip les hooks Git (`--no-verify`) sauf demande utilisateur explicite
- ❌ **JAMAIS** force-push sur `main`

### 2.5 Workflow Git

- ❌ **Pas de commit direct sur `main`** sans review (sauf hotfix critique)
- ❌ **Pas d'amend de commits déjà pushés**
- ❌ **Pas de `git reset --hard origin/main`** sans backup local
- ❌ **Pas de modification de `.github/workflows/`** sans tester en preview branch

---

## 3. Patterns à respecter

### 3.1 State machine atomique pour jobs

**Pattern** :
```python
# Pseudo-code Python (Modal)
def claim_scene(job_id, scene_index):
    # Atomic UPDATE — only succeeds if status is still 'queued'
    result = supabase.from('scenes').update({
        'status': 'in_progress',
        'claimed_at': now(),
    }).eq('job_id', job_id).eq('scene_index', scene_index).eq('status', 'queued').execute()
    
    return len(result.data) > 0  # True if we claimed it, False if someone else did
```

**Pourquoi** : 2 workers ne peuvent pas claim la même scene → pas de double generation, pas de double cost.

### 3.2 Service-role client pour writes privilégiés

**Pattern** :
```ts
// Côté server (route API, webhook)
import { createServiceClient } from "@/lib/supabase/service";

const supabase = createServiceClient();
// bypass RLS — utilisable seulement quand on a déjà vérifié l'auth via createClient()
```

**Quand l'utiliser** : webhooks (Stripe, Modal), cron, admin operations, après vérif manuelle de l'auth user. **Jamais** côté client.

### 3.3 Plan gate server-side

**Pattern** :
```ts
// app/api/jobs/route.ts
const plan = await resolvePlanFromProfile(user.id);  // never trust body
if (preferred_engine && !isEngineAllowedForPlan(preferred_engine, plan)) {
  return NextResponse.json({ error: "Engine not allowed for your plan" }, { status: 403 });
}
```

**Pourquoi** : un user free qui envoie `{ preferred_engine: "happy_horse" }` doit être rejeté. Le plan est lu depuis `profiles`, jamais depuis le body.

### 3.4 Stripe webhook idempotency

**Pattern** :
```ts
const { data: existing } = await supabase.from('stripe_events')
  .select('event_id').eq('event_id', event.id).maybeSingle();

if (existing) {
  console.info(JSON.stringify({ level: 'info', event: 'webhook.duplicate', ... }));
  return NextResponse.json({ received: true, status: 'duplicate' });
}

// ... process event ...

await supabase.from('stripe_events').insert({ event_id: event.id, ... });
```

**Pourquoi** : Stripe peut retry un webhook. Sans idempotency, un user pourrait être chargé 2x ou un upgrade pourrait être appliqué 2x.

### 3.5 Logs structurés JSON

**Pattern** :
```ts
console.info(JSON.stringify({
  level: 'info',
  service: 'alphogenai_stripe',
  event: 'webhook.processed',
  event_id: event.id,
  event_type: event.type,
  action: 'subscription_created',
  user_id: customerId,
  timestamp: new Date().toISOString(),
}));
```

**Pourquoi** : parsable par tout log aggregator futur (Datadog, Loki, Sentry), filtrable par service + event.

### 3.6 Encrypted secrets pattern

**Pattern** :
```ts
import { encrypt, decrypt } from "@/lib/encryption";

// At insert
const { encrypted, iv, authTag } = encrypt(plaintext);
await supabase.from('engine_secrets').insert({ engine_id, secret_name, encrypted, iv, authTag });

// At read
const { encrypted, iv, authTag } = await getSecret(engineId, name);
const plaintext = decrypt({ encrypted, iv, authTag });
```

**Pourquoi** : un dump DB ne suffit pas à lire les secrets — il faut aussi `ENGINE_SECRETS_KEY` (en env Vercel uniquement).

### 3.7 OAuth tokens AES-256-GCM

**Pattern** : même que §3.6, appliqué aux tokens OAuth YouTube/TikTok/Instagram stockés dans `social_connections.access_token` et `refresh_token`.

### 3.8 Storage path > signed URL

**Pattern** :
```ts
// ❌ Bad : stocker l'URL signée
await supabase.from('jobs').update({ reference_url: signedUrl });

// ✅ Good : stocker le path, signer à la demande
await supabase.from('jobs').update({ reference_path: 'references/abc-123.png' });
// puis :
const signedUrl = await signReferenceUrl(reference_path, ttl=6h);
```

**Pourquoi** : l'URL signée expire. Le path ne change jamais. Signer juste avant l'usage = TTL frais à chaque appel.

---

## 4. Anti-patterns identifiés (à ne pas reproduire)

### 4.1 ❌ `typescript.ignoreBuildErrors: true` permanent
**Symptôme** : actuellement actif dans `next.config.ts`.
**Pourquoi c'est mal** : masque les régressions TS futures.
**Fix** : sprint cleanup les 8 erreurs existantes, retirer le flag, ajouter un pre-push hook.

### 4.2 ❌ Buckets publics pour données user
**Symptôme** : `videos`, `assets` buckets `public: true`.
**Pourquoi c'est OK pour les outputs** : les vidéos générées sont meant-to-be-public.
**Pourquoi c'est MAL pour les inputs** : les références utilisateur sont potentiellement sensibles (visage, brand).
**Fix** : bucket `references` privé + signed URLs (V1 multi-reference).

### 4.3 ❌ JSONB blob pour données relationnelles
**Symptôme** : `jobs.references_payload JSONB` (V0).
**Pourquoi c'est mal** : pas d'index, pas de JOIN, pas de FK, validation côté app uniquement.
**Fix** : créer table `job_references` (V1) en migration additive. Garder le JSONB pour backward compat. Dual-write puis cutover.

### 4.4 ❌ Hardcoded engine ID
**Symptôme** : pattern à éviter, exemple :
```ts
// ❌
if (preferred_engine === 'wan_i2v') { ... }
```
**Fix** :
```ts
// ✅
const engine = await selectEngine(plan, duration, preferred_engine);
if (engine.type === 'modal_local') { ... }
```

### 4.5 ❌ Polling au lieu de Realtime
**Symptôme** : `GET /api/jobs/[id]` est appelé toutes les 3s côté client.
**Pourquoi c'est sub-optimal** : Supabase Realtime existe et est gratuit.
**Fix futur** : migrer vers Supabase Realtime channel sur `jobs` row.

---

## 5. Recettes opérationnelles

### 5.1 Ajouter une migration DB

```bash
# 1. Créer le fichier
touch supabase/migrations/YYYYMMDD_short_description.sql

# 2. Écrire la migration ADDITIVE uniquement
# (CREATE TABLE IF NOT EXISTS, ALTER TABLE ADD COLUMN IF NOT EXISTS, etc.)

# 3. Appliquer en preview (branche Supabase) pour test
# Via Supabase MCP : create_branch + apply_migration

# 4. Une fois validé, merger sur main → apply_migration sur prod
# Via Supabase MCP : apply_migration project_id=qbrpzmuedfugbhoeytdj

# 5. Vérifier le schéma post-migration
# Via execute_sql : SELECT column_name FROM information_schema.columns WHERE table_name = '...'

# 6. Commit le fichier dans le repo (pour traçabilité)
```

### 5.2 Ajouter un nouvel engine (ex : "wan_2_6")

```sql
-- migrations/YYYYMMDD_add_wan_26_engine.sql
INSERT INTO public.engines (id, name, type, status, max_duration, gpu, clip_duration, priority, api_config)
VALUES (
  'wan_2_6',
  'Wan 2.6',
  'api',
  'active',
  60,
  NULL,
  5.0,
  95,
  '{
    "provider": "evolink",
    "model_id": "wan_2_6",
    "endpoint": "https://api.evolink.ai/v1/videos/generations",
    "auth": "bearer:EVOLINK_API_KEY"
  }'::jsonb
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.engine_plans (engine_id, plan) VALUES
  ('wan_2_6', 'pro'),
  ('wan_2_6', 'premium')
ON CONFLICT DO NOTHING;

INSERT INTO public.engine_costs (engine_id, billing_model, per_second_usd) VALUES
  ('wan_2_6', 'per_second', 0.045)
ON CONFLICT DO NOTHING;
```

Le secret API : ne PAS le mettre dans `engines.api_config`. Plutôt :
- Soit utiliser une env var existante (`EVOLINK_API_KEY` partagée pour tous les engines EvoLink)
- Soit, si secret engine-spécifique : `INSERT INTO engine_secrets (engine_id, secret_name, encrypted, iv, authTag)` via `lib/encryption.ts:encrypt()`

### 5.3 Ajouter une route API

```ts
// app/api/<resource>/route.ts
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  // 1. Auth user
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 2. Parse + validate body
  const body = await req.json();
  if (!body.foo || typeof body.foo !== "string") {
    return NextResponse.json({ error: "Invalid foo" }, { status: 400 });
  }

  // 3. Plan gate si nécessaire
  const plan = await resolvePlanFromProfile(user.id);
  if (body.preferred_engine && !isEngineAllowedForPlan(body.preferred_engine, plan)) {
    return NextResponse.json({ error: "Engine not allowed" }, { status: 403 });
  }

  // 4. Service-role write si nécessaire
  const service = createServiceClient();
  const { data, error } = await service.from('your_table').insert({ ... }).select().single();
  if (error) {
    console.error(JSON.stringify({ level: 'error', service: 'your_route', error: error.message }));
    return NextResponse.json({ error: "Internal" }, { status: 500 });
  }

  // 5. Structured log success
  console.info(JSON.stringify({ level: 'info', service: 'your_route', event: 'created', id: data.id }));
  return NextResponse.json({ success: true, data });
}
```

### 5.4 Créer un bucket Supabase privé avec signed URLs

```sql
-- migrations/YYYYMMDD_create_references_bucket.sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'references',
  'references',
  false,                    -- PRIVÉ
  10485760,                 -- 10 MB max
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Policies : user can insert/select only their own files
CREATE POLICY "Users can upload their own references" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'references' 
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can read their own references" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'references' 
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
```

```ts
// lib/supabase/storage.ts
export async function signReferenceUrl(path: string, ttlSeconds = 6 * 3600): Promise<string> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.storage
    .from('references')
    .createSignedUrl(path, ttlSeconds);
  if (error) throw error;
  return data.signedUrl;
}
```

### 5.5 Debug un job en prod

```bash
# 1. Récupérer le job_id depuis l'UI ou Supabase dashboard

# 2. Inspecter la row jobs + scenes
# Supabase SQL :
SELECT id, status, plan, engine_used, error_message, references_payload, social_exports, created_at
FROM jobs WHERE id = '<job_id>';

SELECT scene_index, status, video_url, last_frame_url, error_message
FROM scenes WHERE job_id = '<job_id>' ORDER BY scene_index;

# 3. Sentry — chercher des events avec le job_id en tag
# (Modal et Next.js taggent les exceptions avec job_id si possible)

# 4. Vercel logs
# Dashboard Vercel → Project → Logs → filter par /api/jobs/<job_id>

# 5. Modal logs
python -m modal app logs alphogenai-v2 --since 1h

# 6. Si le job est bloqué en 'in_progress' depuis > 30 min :
# Le cron evolink-poll devrait l'avoir rattrapé. Sinon, check workflow GH Actions
# https://github.com/alpahoo/alphogenai-mini/actions/workflows/evolink-cron.yml
```

### 5.6 Rotater un secret OAuth (ex : KIE_API_KEY → DB secret)

```bash
# Pattern actuel : env var Vercel → encrypted DB secret
# Via UI admin : /admin/engines → "Migrate ENV → DB" button
# OU via route : POST /api/admin/engines/migrate-env
# Effet : copie KIE_API_KEY de l'env Vercel vers engine_secrets (encrypted)
# Une fois fait, retirer la var de l'env Vercel (mais garder en backup ailleurs 24h)
```

---

## 6. Règles pour les agents IA

### 6.1 Avant toute session
1. Lire **`CLAUDE.md`** intégralement
2. Lire **ce fichier** intégralement
3. Si le user demande une feature : vérifier qu'elle n'est pas **déjà implémentée** (grep le repo, regarder les migrations)
4. Si décalage entre doc et code : **STOP** et signaler au user

### 6.2 Process de décision
- **Audit avant plan, plan avant code**
- Pour toute feature non-triviale (> 100 LOC ou > 3 fichiers), produire un plan d'implémentation **avant** de coder
- Pour toute modif sur du code stable (cf §2.1), demander confirmation explicite
- **STOP après le plan**, attendre la review user

### 6.3 Quand utiliser quoi
| Besoin | Outil |
|---|---|
| Lookup fichier connu | `Read` (path absolu) |
| Recherche symbol/string spécifique | `Grep` |
| Pattern matching fichiers | `Glob` |
| Recherche large multi-fichiers ouverte | `Agent` (general-purpose) |
| Multi-step tracking | `TodoWrite` |
| DB query | Supabase MCP `execute_sql` |
| DB migration | Supabase MCP `apply_migration` (PAS execute_sql pour DDL) |
| Deploy Modal | `python -m modal deploy modal_app/video_pipeline.py` |

### 6.4 Sources de vérité par sujet
| Sujet | Source autoritative |
|---|---|
| Stack technique | `package.json` + ce fichier |
| Schéma DB | `supabase/migrations/` (chronologique) |
| État engines | Table `engines` en prod (via Supabase MCP) |
| Env vars utilisées | `grep "process.env." -r app/ lib/` |
| Routes API | `find app/api -name "route.ts"` |
| Modal functions | `grep "@app.function" modal_app/video_pipeline.py` |

### 6.5 Garde-fous comportementaux
- **Ne jamais** modifier `next.config.ts`, `tsconfig.json`, `package.json` sans demande explicite
- **Ne jamais** ajouter une dépendance npm sans justification dans le PR
- **Ne jamais** committer de valeurs d'env vars ou secrets
- **Toujours** sourcer une affirmation technique par un `file:line` du repo
- **Toujours** vérifier avant de réinventer : `git log --all --source -- <path>` pour voir l'historique
- **Toujours** marquer les TodoWrite items `completed` immédiatement après accomplissement (pas en batch)

### 6.6 Si tu trouves un bug pendant ton travail
1. Évaluer la criticité : prod-affecting vs dette
2. Si prod-affecting : signaler immédiatement, proposer un fix séparé (ne pas mélanger avec la feature en cours)
3. Si dette : utiliser `mcp__ccd_session__spawn_task` pour le tracker comme task séparée
4. **Ne pas** silencieusement fixer hors-scope de la feature demandée

---

## 7. Glossaire

| Terme | Définition |
|---|---|
| **EvoLink** | Gateway REST unifié pour modèles vidéo IA (`api.evolink.ai/v1`). Provider principal d'AlphoGen. |
| **Bailian** | Alibaba Cloud's frontier model service (Wan 2.6/2.7/Happy Horse). Accédé via EvoLink en prod, intégration directe envisagée si Catalyst Program approuvé. |
| **Kie.ai** | Provider tiers, route Seedance direct (legacy path conservé). |
| **Engine Registry** | 4 tables DB (`engines`, `engine_plans`, `engine_costs`, `engine_secrets`) qui définissent les engines disponibles + leur config + leur pricing + leurs secrets chiffrés. |
| **Engine Router** | `modal_app/engines/router.py:select_engine()`. Choisit l'engine optimal pour un job donné selon plan + preferred + priority. |
| **Reference Mapper** | `modal_app/engines/reference_mapper.py:build_engine_references()`. Map un payload références normalisé vers le format spécifique d'un engine. |
| **State Machine** | `scenes.status` workflow : `queued → in_progress → done` ou `failed`. Avec claims atomiques pour éviter les double-traitements. |
| **Multi-scene chaining (Option B)** | Architecture pour générer une vidéo multi-scenes cohérente : extraire le dernier frame d'une scène et l'utiliser comme `first_frame_url` (I2V) de la suivante. Préserve les personnages, la lumière, les props. |
| **Catalyst Program** | Alibaba Cloud AI Catalyst Program — $120k credits + 2B Model Studio tokens. Candidature AlphoGen soumise mai 2026. |
| **SiteShell** | Composant client (`components/site-shell.tsx`) qui pose le chrome marketing seulement sur une allowlist de routes publiques. |
| **Plan gate** | Vérification server-side que l'utilisateur a le droit d'utiliser l'engine demandé selon son plan (free/pro/premium). |
| **Multi-SaaS isolation** | Pattern dans `lib/stripe-app-context.ts` qui filtre les events Stripe par `app_id` pour éviter qu'un projet déclenche des actions sur un autre projet partageant le même compte Stripe. |

---

## Note de maintenance

Ce document doit être **mis à jour** après chacun de ces événements :
- Nouveau provider intégré (Section 1 + Glossaire)
- Refactor majeur de routing / state machine (Section 1 + 3)
- Nouvelle décision "ne pas faire" (Section 2)
- Nouvelle recette opérationnelle (Section 5)
- Bug pattern observé > 2 fois → ajouter à Section 4

**Format des updates** : ajouter une entrée datée en tête de la section concernée. Garder l'historique des décisions plutôt que les remplacer.

---

*Document créé le 2026-05-11 après brief CTO sur Multi-Reference V1. Sources : code repo + décisions actées dans les échanges Paul ↔ CTO ↔ Claude entre avril et mai 2026.*
