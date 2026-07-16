# URL → Video — Decision Book d'intégration V1 (Jogg)

> Statut : ✅ **PLAN D'INTÉGRATION MINIMAL — VALIDÉ (workflow figé). Aucun code écrit.**
> Date : **16 juil. 2026** · Moteur retenu : **Jogg** (POC 80/100, gagnant net) · Decision Book final : [url-to-video-v1.md](./url-to-video-v1.md) · Détails : [url-to-video.md](./url-to-video.md) · [POC + audit](./url-to-video-poc.md).
> Règle d'or : **réutiliser l'existant, coder le minimum**. On n'ajoute qu'**1 client REST** ; tout le reste est déjà là.

## Objectif
Sortir une **V1 commerciale URL/produit → vidéo ad** en orchestrant l'**API Jogg**, en réutilisant `jobs` + cron + R2 + overlay Modal, pour un coût marginal ≈ **1 crédit/pub** (≈ 0 $ sur la clé test actuelle).

## Périmètre V1 (et hors périmètre)
- **DANS la V1** : **URL→Video** (copie auto Jogg) — le parcours prouvé end-to-end (vidéo 1080p, sans watermark).
- **HORS V1 (→ V2)** : Avatar Video (script verbatim), AI Script pré-généré, preview 13-variantes, Lip Sync, Traduction, Photo Avatar, Templates, custom avatars/voices, **webhooks** (V1 = polling).
- **Jamais (pas d'API Jogg)** : Podcast 2.0, PPT/PDF→Vidéo, face swap, extension vidéo, transcription, screen recorder → sourcer ailleurs si besoin.

## Faits vérifiés (audit 16 juil. 2026)
- **E2E prouvé avec la clé actuelle** : **URL→Video** (vidéo complète) + **AI Script** (scripts FR) + **Avatar Video** (talking-head, **script verbatim** via `voice.script`). Les **5** autres moteurs (Lip Sync/Template/Traduction/Photo Avatar/Motion) = **endpoint + auth prouvés, génération non encore démontrée**.
- **`quota = 0` mais génère** (clé test/promo à entitlement spécial) → à traiter comme **temporaire et NON contractuel** ; **ne pas** bâtir l'éco dessus. La page officielle [api-pricing](https://www.jogg.ai/api-pricing/) **gate les features par plan** (Free = Avatar+AI Scripts ; Advanced ajoute URL→Video+Templates ; Pro ajoute Photo Avatar ; Enterprise Custom Avatar) — **la V1 se chiffre sur Advanced**, pas sur la gratuité de la clé test.
- **`override_script` IGNORÉ** sur URL→Video → la copie est écrite par le `script.style` obligatoire (bonne qualité FR). *Script verbatim = endpoint `create_video_from_avatar` (V2), au prix de perdre le b-roll auto.*
- **Aucun endpoint webhook joignable** sur ce compte → **polling** en V1.
- **Sortie API = sans watermark** (≠ UI free). Format 9:16 1080×1920, durée `"15"/"30"/"60"`.
- **Rate limit** : 20 POST/min (header `X-RateLimit-Remaining` sur POST).

## Architecture V1 (réutilise TOUT — cloud, pas de worker local)
> ≠ VEED (qui exigeait un worker navigateur local). Jogg = **API cloud** → tourne sur **Vercel + cron**, comme le pipeline EvoLink existant.

```
Admin/Owner
  │ POST /api/admin/experiments/url-to-video { url, format=portrait, style }
  ▼
Route (serverless) :
  1. POST Jogg /product            (analyse URL → product_id, ~10-30s, gratuit)
  2. POST Jogg /create_video_from_product (style FR) → video_id (async immédiat)
  3. INSERT jobs (engine='jogg', status='pending', app_state={video_id, url, style, métriques})
  ▼
Cron GH Actions /5min → /api/cron/jogg-poll   (RÉUTILISE le pattern evolink-cron)
  → pour chaque job jogg 'pending' : GET Jogg /product_video/{video_id}
     → si success : download MP4 → [overlay Modal T-1111 : logo/CTA] → R2 → status='done', final_url
     → si failed  : status='failed', error_message
  ▼
GET /api/.../status?id=  → statut + final_url + métriques
```

## Ce qui est RÉUTILISÉ (0 réinvention)
| Besoin | Existant réutilisé |
|---|---|
| File de jobs | table **`jobs`** + `app_state` (prouvé sur veed_web) — **aucune nouvelle table** |
| Stockage MP4 | **`lib/r2.ts`** (`uploadBufferToR2`) |
| Auth route | **`requireAdmin`** |
| Polling différé | **workflow `evolink-cron.yml` existant + 1 step curl** vers `/api/cron/jogg-poll` (PAS de nouveau scheduler) |
| Pattern client | **`lib/*-client.ts`** (byteplus/heygen/evolink) → ajouter **`lib/jogg-client.ts`** (~150 LOC) |
| Branding (logo/CTA) | **overlay Modal T-1111** (rend le provider swappable) |
| Confidentialité provider | **`engine-intentions.ts`** — label public **« URL to Video »**, « Jogg » interne only |

**Net code V1** = 1 fichier client (`lib/jogg-client.ts`) + 1 route submit/status + 1 route cron-poll. Le reste = réutilisation.

## Endpoints V1 (chemins REST réels vérifiés)
| Étape | Endpoint | Coût |
|---|---|---|
| Analyse URL | `POST /product` | gratuit |
| Génération | `POST /create_video_from_product` | 1 cr (0 sur clé test) |
| Statut/polling | `GET /product_video/{id}` | gratuit |
| Défauts (cache 1×) | `GET /voices`, `GET /avatars/public`, `GET /visual_styles` | gratuit |
| Info solde | `GET /user/remaining_quota` | gratuit (**non bloquant — jauge non fiable**) |

## Garde-fous V1
- **Budget-guard maison** (PAS `remaining_quota`) : compteur d'usage dans `jobs` (ex. plafond N/jour) + lecture des **codes d'erreur** Jogg.
- **Concurrence / rate limit** : ≤ 20 POST/min → sérialiser/espacer les submits.
- **Confidentialité** : nom « Jogg » jamais exposé côté UI publique (garde-fou `provider-leak-guard.test.ts`).
- **Idempotence** : 1 job = 1 `video_id` ; le cron ne re-soumet jamais.

## Coûts (base **contractuelle**, pas la gratuité test)
- **Référence business V1 = plan Advanced** (99 $/mo) → `create_video_from_product` = **1 cr / vidéo ≤ 2 min ≈ 0,99 $/pub** (+ éventuels **preview 0,5 cr** et **AI Script 0,2 cr** si utilisés). Professional (399 $/800 cr) ≈ 0,50 $/pub au volume ; Enterprise < 0,50 $.
- ⚠️ **La clé test actuelle génère à `quota=0`** mais c'est **temporaire/non contractuel** → **exclue du chiffrage**. Ok pour *construire/valider*, pas pour le P&L.
- **Dev** : faible (~jours). **Dette** : minimale (1 client + réutilisation). **Modal GPU** : **non requis** (Jogg rend côté serveur ; overlay T-1111 = léger).

## Proposition V2 (repoussé volontairement)
Avatar Video (script verbatim), AI Script pré-généré (contrôle éditorial), **webhooks** (remplacer polling), Lip Sync, Traduction, Templates, Photo Avatar/Motion, preview 13-variantes, custom avatars/voices, UI publique self-service.

## Rollback
Désactiver la soumission de jobs `engine='jogg'` (feature flag / ne pas appeler la route) → brique inactive, **aucun impact** sur le reste (jobs/cron/R2 partagés mais filtrés par `engine`). Voie de repli qualité éventuelle : Creatify (UI) ou API alternative — non intégrée.

## P0 avant ouverture publique
1. **Plan contractuel** : la clé test est *offerte* (peut être limitée/retirée) → passer sur un **plan payant** au compte du user avant lancement commercial.
2. **CGU commerciales** Jogg (revente/multi-tenant des vidéos produites) à confirmer.
3. **Clé en prod** : ajouter `JOGG_API_KEY` aux env **Vercel** (aujourd'hui local uniquement) + rotation quand le cycle 30 j le permet.
4. Gestion d'erreurs + rate-limit + retries idempotents côté cron.
5. **Overlay T-1111** : valider qu'il stampe un **MP4 externe arbitraire** (pas seulement nos scènes Modal). Si non trivial → **ship V1 sans overlay** (rendu Jogg déjà propre), branding en fast-follow. **Ne doit pas bloquer la mise en prod.**

## Décision
**GO intégration V1** sur Jogg, périmètre **URL→Video (copie auto)**, archi ci-dessus (réutilise `jobs`/cron/R2/T-1111 + 1 client). Développement à lancer **sur validation explicite** ; ce document ne contient **aucun code**.
