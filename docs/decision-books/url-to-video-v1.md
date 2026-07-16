# URL → Video V1

## Statut

**VALIDÉ** — ⚙️ **intégration en cours** (PAS encore gelé) · Provider retenu : 🥇 **Jogg**
Date de validation : **16 juillet 2026**
Références : [benchmark](./url-to-video.md) · [POC + audit API](./url-to-video-poc.md) · [plan d'intégration minimal](./url-to-video-v1-integration.md)

> Le choix du provider est figé (Jogg) — on n'y revient pas **sauf bug critique ou évolution majeure du marché**.
> Le **workflow sera officiellement GELÉ** une fois **l'intégration minimale terminée ET validée en production**. Alors seulement on ouvrira le Decision Book suivant.
>
> **Intégration V1 codée (16 juil. 2026)** : `lib/jogg-client.ts`, `app/api/admin/experiments/url-to-video/route.ts`, `app/api/cron/jogg-poll/route.ts` + step Jogg dans `evolink-cron.yml`. Reste : déploiement + validation prod (voir P0).

---

## Objectif

Sortir une **V1 commerciale « URL/produit → vidéo ad »** en orchestrant l'**API Jogg**,
sans reconstruire de moteur : réutiliser `jobs` + cron + R2 + overlay branding, pour un
coût marginal ≈ **1 crédit/pub**. La V1 vise le **parcours prouvé end-to-end** : une URL
produit → une vidéo verticale 1080×1920, sans watermark, copie FR auto-générée.

---

## Décision

Le workflow **URL → Video V1 est figé sur Jogg**, périmètre **URL→Video (copie auto)**.
Basée sur : benchmark, POC réels, audit API, coût réel, qualité du rendu, simplicité
d'intégration et réutilisation maximale de l'existant.

### Pourquoi Jogg ? (max 10 points — faits démontrés)

1. **Meilleur output réel du panel** : verdict utilisateur **80/100** (vidéo + son nets), très au-dessus de Creatify (40) et Topview (6).
2. **Voie d'intégration = API REST propre**, prouvée end-to-end (`/product` → `/create_video_from_product` → `/product_video/{id}`), là où Topview/Creatify n'ont **pas d'API accessible** sur nos comptes (pilotage UI uniquement).
3. **Sortie sans watermark** dès l'API (≠ Creatify/Topview free qui en collent un).
4. **Scraping URL de qualité** : vrais visuels produit (drone, RC-N2, lifestyle) + specs captées automatiquement.
5. **Rapide et fiable** : rendu en quelques minutes, aucun stall (vs Topview bloqué à 99 %, Creatify ~5 min).
6. **Coût unitaire ultra-bas** : ≈ **1 crédit / pub courte** (vidéo < 2 min), le meilleur ratio du panel.
7. **Format natif 9:16 1080×1920** + captions FR correctes, directement exploitable.
8. **Avatar talking-head réaliste** avec compositing propre (≠ Creatify dont le fond vert empiète sur l'avatar).
9. **Réutilisation maximale** : s'intègre au pattern `jobs`/cron/R2/overlay existant → **1 seul client REST à écrire**.
10. **Couverture large en réserve** (Avatar Video verbatim, Lip Sync, Traduction…) pour les évolutions V2, sur la même clé/compte.

### Pourquoi les autres solutions n'ont pas été retenues (faits POC uniquement)

**Topview — 6/100 (verdict utilisateur, audio inclus)**
- VO **catastrophique** : voix robotisée mélangeant français + anglais, accent espagnol (« Franglais »), **désynchronisée** de l'image.
- **Pas d'avatar** : rendu = diaporama « PowerPoint » de visuels + VO plaquée.
- **Watermark « PREVIEW ONLY »** partout (plan free).
- **Fiabilité mauvaise** : UI bloquée à 99 % à répétition (analyse URL ~4 min de hang, export figé).
- **Pas d'API** accessible → pilotage UI uniquement.

**Creatify — 40/100 (verdict utilisateur, audio inclus)**
- Bien meilleur que Topview : **VO fluide** (français canadien), format riche (avatar + b-roll + captions animées + 13 variantes).
- ❌ **Défaut rédhibitoire** : **compositing fond vert raté** — l'image empiète sur le corps de l'avatar → pas pro (≠ rendu Jogg propre).
- **Watermark** (free), rendu **lent** (~5 min), **10 crédits/rendu** (le plus cher).
- **API payante requise** (pas accessible sur notre compte).

---

## POC réalisés (chronologique)

1. **Jogg — POC API E2E (15 juil.)** : DJI Mini 4 Pro → `/product` → `/create_video_from_product` → poll → R2 → ffprobe. Sortie 1080×1920 H264 30 fps AAC mono 35,8 s. Score commun **52/90** (compte test, coût non mesuré).
2. **Topview — POC UI (15 juil.)** : URL→Video via extension (pas d'API), « Use My Script », export watermark → R2. **6/100**.
3. **Creatify — POC UI (16 juil.)** : Video Ad via extension, script FR imposé, avatar Stefan, 13 variantes, render Aurora (10 cr) → R2. **40/100**.
4. **Jogg — retest `override_script` (16 juil.)** : **conclusif** — override **ignoré**, `script.style` régénère toujours la copie.
5. **Jogg — audit clé API (16 juil.)** : lecture OK (0 crédit), génération réelle acceptée `code 0`→`success` ~32 s, MP4 propre, **quota inchangé 0→0**.
6. **Jogg — Avatar Video E2E (16 juil.)** : `code 0`→`success` ~24 s, caption = **script verbatim** (`voice.script` respecté) → voie script-imposé confirmée (V2).

### Résultat / classement final POC

| Rang | Provider | Score (user, audio inclus) | Raison décisive |
|---|---|---|---|
| 🥇 | **Jogg** | **80/100** | Vidéo + son nets, **API E2E prouvée**, coût bas, rapide/fiable |
| 🥈 | Creatify | 40/100 | Format riche mais **compositing avatar raté**, watermark, lent, 10 cr |
| 🥉 | Topview | 6/100 | VO Franglais robotisée, diaporama, bug 99 % |

---

## Endpoints réellement validés (E2E, clé actuelle)

| Capacité | Endpoints | Preuve |
|---|---|---|
| **URL→Video** | `POST /product` · `POST /create_video_from_product` · `GET /product_video/{id}` | ✅ vidéo complète générée, MP4 propre |
| **AI Script** | `POST /ai_scripts` · `GET /ai_scripts/results/{id}` | ✅ scripts FR générés |
| **Avatar Video** (verbatim) | `POST /create_video_from_avatar` · `GET /avatar_video/{id}` | ✅ caption = script exact |
| **Lecture (0 crédit)** | `GET /voices` (113) · `/voices/custom` (52) · `/avatars/public` (627) · `/avatars/custom` · `/musics` · `/visual_styles` · `/templates` (276) · `/user/whoami` · `/user/remaining_quota` | ✅ 200 |

**Non démontrés (endpoint+auth OK, génération non lancée)** : Lip Sync, Template, Traduction, Photo Avatar, Motion.

## Endpoints RETENUS pour la V1

| Étape | Endpoint | Coût |
|---|---|---|
| Analyse URL | `POST /product` | gratuit |
| Génération | `POST /create_video_from_product` | ~1 cr |
| Polling statut | `GET /product_video/{id}` | gratuit |
| Défauts (cache 1×) | `GET /voices`, `/avatars/public`, `/visual_styles` | gratuit |

**Un seul chemin d'appel** : product → create → poll. Pas d'AI Script, pas de preview, pas de webhook en V1.

## Endpoints REPORTÉS à la V2

Avatar Video (script verbatim), AI Script pré-généré (contrôle éditorial), preview 13-variantes,
Lip Sync, Traduction, Templates, Photo Avatar/Motion, **webhooks** (remplacer le polling),
custom avatars/voices, UI publique self-service.

---

## Coût réel

- **Base contractuelle V1 = plan Advanced (99 $/mo)** → `create_video_from_product` = **1 cr / vidéo ≤ 2 min ≈ 0,99 $/pub** (avant éventuels preview 0,5 cr / AI Script 0,2 cr, non utilisés en V1). Professional (399 $/800 cr) ≈ 0,50 $/pub au volume.
- Crédits **débités à la requête** (pas à la fin).
- ⚠️ **La clé test actuelle génère à `quota=0`** — **temporaire/non contractuel**, exclu du chiffrage P&L. OK pour construire/valider, pas pour vendre.
- **Modal GPU non requis** (Jogg rend côté serveur ; overlay branding = léger).

---

## Limites connues (démontrées)

1. **Script non contrôlé** en URL→Video : `override_script` ignoré, `script.style` régénère la copie (bonne qualité FR). Script exact = Avatar Video (V2, perd le b-roll auto).
2. **`remaining_quota` non fiable** comme jauge (reste à 0 même après génération) → ne **pas** l'utiliser comme budget-guard.
3. **Pas de webhook joignable** sur ce compte (path 404) → **polling** en V1.
4. **Audio mono** ; **durée déborde** légèrement la cible (35,8 s pour 30 demandées — `length` = indice, pas strict).
5. **Branding non appliqué** par Jogg (ni logo, ni couleurs, ni CTA) → stamper via overlay.
6. **Rate limit** 20 POST/min → sérialiser les soumissions.

---

## Architecture finale

```
Admin/Owner
  │ POST /api/admin/experiments/url-to-video { url, format=portrait, style }
  ▼
Route (serverless, requireAdmin) :
  1. POST Jogg /product                     → product_id (~10-30 s, gratuit)
  2. POST Jogg /create_video_from_product   → video_id (async immédiat)
  3. INSERT jobs (app_state.engine='jogg', status='pending', {video_id, url, style, metrics})
  ▼
Cron GH Actions /5min (workflow evolink-cron.yml, +1 step) → /api/cron/jogg-poll
  → pour chaque job jogg 'pending' : GET Jogg /product_video/{video_id}
     → success : download MP4 → [overlay branding T-1111 : logo/CTA] → R2 → status='done', final_url
     → failed  : status='failed', error_message
  ▼
GET /api/.../status?id= → statut + final_url + métriques
```

## Fichiers concernés

**À créer (minimal)** :
- `lib/jogg-client.ts` (~150 LOC) — client REST (product, create, poll) sur le pattern `lib/*-client.ts`.
- `app/api/admin/experiments/url-to-video/route.ts` — submit + status (réutilise `jobs`, `requireAdmin`).
- `app/api/cron/jogg-poll/route.ts` — poll des jobs `jogg` pending (pattern `evolink-poll`).

**Réutilisés (0 réinvention)** :
- Table `jobs` + `app_state` (aucune nouvelle table) · `lib/r2.ts` · `requireAdmin` · workflow `evolink-cron.yml` (+1 step curl) · overlay Modal **T-1111** (branding) · `lib/engine-intentions.ts` (label public « URL to Video », « Jogg » interne only) · garde-fou `provider-leak-guard.test.ts`.
- **Clé** : `JOGG_API_KEY` (déjà en `.env.local`) → à ajouter aux env Vercel (P0).

---

## Rollback

Désactiver la soumission de jobs `engine='jogg'` (feature flag / ne pas appeler la route)
→ brique inactive, **aucun impact** sur le reste (jobs/cron/R2 partagés mais filtrés par
`engine`). Voie de repli qualité éventuelle : Creatify (UI) — non intégrée.

## P0 restants

1. **Plan contractuel Advanced** sur le compte prod voulu **avant toute ouverture payante** (la clé test est offerte, non contractuelle, cycle 30 j).
2. **Confirmer le compte** de la clé (`gvnahid292`) = compte prod souhaité (+ rotation quand le cycle le permet).
3. **`JOGG_API_KEY` → env Vercel** (aujourd'hui local uniquement).
4. **CGU commerciales Jogg** (revente/multi-tenant des vidéos) à confirmer.
5. **Overlay T-1111** : valider qu'il stampe un MP4 externe arbitraire ; sinon ship sans overlay (fast-follow).
6. Gestion d'erreurs + rate-limit + retries idempotents côté cron.

---

## Lessons learned

1. **Le son fait le verdict, pas les frames.** Mes notes « visuel seul » (Topview 64/90, Creatify 69/90) étaient trompeuses ; avec l'audio, les vrais scores sont 6 et 40. → toujours juger l'output complet (VO + sync).
2. **Un param accepté ≠ une capacité prouvée.** `override_script` renvoyait `code 0` mais était ignoré ; il a fallu 3 tests pour le prouver. → E2E ou rien.
3. **Distinguer 3 niveaux de preuve** (E2E généré / endpoint+auth / lecture) évite de survendre une clé.
4. **Une jauge de quota peut mentir** (`remaining_quota` = 0 en générant) → toujours notre propre compteur.
5. **L'entitlement d'une clé test n'est pas le prix contractuel** → chiffrer le P&L sur le plan payant réel, jamais sur la gratuité promo.
6. **« Delete more than you add »** : la meilleure intégration est celle qui réutilise `jobs`/cron/R2/overlay et n'ajoute qu'un client — c'est ce qui a fait gagner Jogg autant que la qualité.

---

## Décision officielle

Le workflow **URL → Video V1 est VALIDÉ** sur **Jogg**, périmètre **URL→Video (copie auto)**.
Provider figé. **Intégration minimale codée** ; le workflow sera **officiellement GELÉ après
validation en production** (P0 ci-dessus). Ce n'est qu'**après ce gel** qu'on ouvrira le
Decision Book du workflow suivant.
