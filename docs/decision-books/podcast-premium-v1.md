# Podcast Premium V1

## Statut

**VALIDÉ** — 🔒 GELÉ

Date de validation : **15 juillet 2026**

## Objectif

Créer automatiquement un **podcast vidéo premium à deux intervenants** (talking-head
lip-syncé), sans reconstruire de moteur de génération : orchestrer un fournisseur
best-in-class et réutiliser le compositeur existant.

## Architecture retenue

- **AlphoGenAI** : orchestration (file de jobs, route admin, suivi)
- **VEED AI Studio (Web)** : génération talking-head (avatars stock + voix TTS + lip-sync)
- **Worker Playwright** : automatisation du parcours web (profil Chrome authentifié)
- **R2** : stockage des MP4
- **Compositeur existant** : conservé tel quel (Modal `render_podcast`, mode premium)
- **Jobs existants** : réutilisés (table `jobs`, aucune nouvelle table)

## Décision

### Pourquoi VEED Web a été retenu (V1)

- **Qualité** talking-head + lip-sync jugée ≥ HeyGen sur nos tests.
- **Coût** : abonnement forfaitaire (pas de facturation à la seconde côté fal/API).
- **Delete-more-than-you-add** : réutilise le compositeur + la table `jobs` existants ;
  aucune nouvelle infra, aucune nouvelle table.
- **Sortie standard** : MP4 720×1280 H.264 + AAC, directement réutilisable/compositable.
- **Récupération automatisable** prouvée (Download UI via `expect_download`).

### Pourquoi ces alternatives n'ont pas été retenues pour la V1

- **HeyGen** — qualité comparable mais **coût à l'usage** plus élevé et facturation par
  crédit/minute ; déjà intégré en code mais pas l'axe MVP coût-minimal.
- **Vadoo** — testé → **NO-GO** (ne délivrait pas la valeur attendue pour le prix).
- **Jogg** — non retenu V1 (pas d'avantage décisif vs VEED sur qualité/coût pour ce workflow).
- **Hedra** — non retenu V1 (périmètre/qualité talking-head deux-intervenants non prioritaire).
- **fal.ai (VEED Fabric 1.0)** — voie **API** valable et déjà codée (`lib/veed-fabric-client.ts`),
  mais **facturée à la seconde** → coût supérieur au forfait web pour le volume MVP.
  **Conservée comme voie de repli** (voir Rollback), pas comme moteur V1.

## POC réalisés (chronologique)

1. **Fabric via fal.ai (API)** — POC + E2E podcast (9/9) réussis, ~3,14 $ ; a prouvé la
   faisabilité mais **coût à la seconde** → écarté comme moteur V1.
2. **VEED Web — faisabilité manuelle** — 1 génération talking-head, download MP4, ffprobe :
   GO usage interne.
3. **VEED Web — récupération** — le bouton Download fait un GET CDN authentifié ;
   récupération **automatisable** (≠ URL CDN nue = 403).
4. **VEED Web — test de fiabilité (3 vidéos)** — **3/3**, 2 speakers, session stable,
   download + R2 + ffprobe OK.
5. **VEED Web — industrialisation minimale** — worker Playwright + route admin
   (réutilise `jobs`), validé techniquement.
6. **VEED Web — validation réelle du worker (end-to-end)** — job soumis → `pending` →
   `in_progress` → `done`, MP4 sur R2, ffprobe OK, session persistante.

### Résultats

- **Fiabilité** : **3/3** (test dédié) + **1/1** worker autonome end-to-end.
- **Worker autonome** : claim job → génère → télécharge → R2 → écrit métriques.
- **R2** : MP4 servis publiquement (HTTP 200, `video/mp4`).
- **ffprobe** : **720×1280 (9:16) · H.264 Main 30 fps · AAC stéréo 48 kHz** (MP4 valides).
- **Temps moyen** : rendu ~**40–90 s** ; cycle worker complet ~**130 s** (avec overheads).
- **Crédits** : **dépend du compte**.
  - Compte Digitavision : **0 crédit décompté** (rendus non facturés au pool visible).
  - Compte `digitalpaho` (2 500 crédits) : **~11 crédits/vidéo décomptés**.
  - ⚠️ **Aucune conclusion « illimité »** — à confirmer sur 7 jours ; sur compte à crédits, ils sont bien consommés.
- **Qualité** : talking-head lip-syncé jugé ≥ HeyGen, format standard réutilisable.

## Architecture finale

```
Admin
  │  POST /api/admin/experiments/veed-web-jobs {script, format=portrait}
  ▼
table jobs (app_state.engine = "veed_web", status = pending)
  │
  ▼  (poll, concurrence 1, plafond 3/j)
Worker Playwright (machine locale, Chrome authentifié)
  │  studio → script → Générer → storyboard → Terminé (rendu)
  │  → /view → Download (expect_download) → MP4
  ▼
R2 (veed-web-mvp/<jobId>.mp4)
  │
  ▼
jobs.final_url + métriques (app_state)  →  [compositeur premium existant, inchangé]
```

## Fichiers utilisés (réellement)

- `workers/veed_web/veed_web_worker.py` — worker (claim → génère → download → R2 → métriques)
- `workers/veed_web/login.py` — login one-time (profil persistant)
- `workers/veed_web/login_email.py` — login one-time via code email
- `workers/veed_web/README.md` — mode d'emploi + garde-fous
- `app/api/admin/experiments/veed-web-jobs/route.ts` — route admin submit/status (réutilise `jobs`)
- Table `jobs` (existante) · stockage R2 (existant) · compositeur `render_podcast` (existant, inchangé)

## Rollback

Revenir temporairement à l'ancien pipeline si nécessaire :

1. **Ne pas soumettre** de jobs `engine=veed_web` (ou ne pas lancer le worker) → la brique
   web est simplement inactive ; aucun impact sur le reste.
2. **Voie de repli Fabric/API déjà codée** : `lib/veed-fabric-client.ts` +
   `app/api/admin/experiments/veed-fabric-poc/route.ts` (fal.ai, facturé à la seconde) —
   réactivable pour produire les clips premium via l'API.
3. Le **compositeur premium existant** (`modal_app/video_pipeline.py` → `render_podcast`)
   n'a pas été modifié : il consomme les clips `ready` quelle que soit leur provenance
   (VEED web **ou** Fabric/API), donc le rollback n'exige aucun changement du compositeur.

## P0 restants (vrais P0 uniquement)

- **Bêta 7 jours à exécuter** (J1–J2 : 1/j · J3–J4 : 2/j · J5–J7 : 3/j) pour confirmer
  stabilité de session, reconnexions, captcha, quotas cachés et **coût crédit réel**.
- **Login lié à la machine locale** : le worker exige le Chrome authentifié local
  (ni VPS, ni headless tant que la session dépend d'un login manuel). Documenter la
  procédure de re-login (`NEEDS_LOGIN` → `login.py` / `login_email.py`).
- **CGU VEED** à confirmer pour usage commercial (avatars stock + voix TTS) avant ouverture publique.

## Ce qui est explicitement hors scope

- nouveaux providers
- nouveaux benchmarks
- optimisation
- refactor
- Browser Use
- n8n
- fal.ai (reste uniquement comme voie de repli documentée, pas de développement)

## Décision officielle

Le workflow **Podcast Premium V1 est GELÉ**.

**Aucun nouveau développement n'est autorisé, sauf bug bloquant.**

Le prochain workflow devient officiellement : **URL → Video**.
