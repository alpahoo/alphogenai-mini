# Editing / Enhancement (V1.1) — Audit API Descript

> Statut : 🔬 **AUDIT / BENCHMARK — clé testée en live (lecture seule), aucune génération, aucun crédit consommé.**
> Date : **16 juil. 2026** · Workflow cible : **✂️ Editing / Enhancement (V1.1)** · Voir [README](./README.md).
> Règle d'or : une intégration doit **supprimer plus qu'elle n'ajoute**. On mesure ici si Descript remplace du montage/post-prod manuel par **1 client REST**.

## Ce qui a été prouvé EN LIVE aujourd'hui (clé `DESCRIPT_API_KEY`)
Auth **Bearer token** valide · base `https://descriptapi.com/v1` · rate limit **1000 req/h** · **Aucun crédit consommé** (endpoints lecture seule uniquement).

| Endpoint | Méthode | Résultat live | Preuve |
|---|---|---|---|
| `/status` | GET | **200** — `drive_id=ddc896cf…ca8d`, `api_version=v1` | ✅ token valide, drive actif |
| `/agent/models` | GET | **200** — 12 modèles (dont `claude-opus-4.8`, `claude-sonnet-5`, `gpt-5.5`, `gemini-3.1-pro`) + alias | ✅ moteur d'édition IA accessible |
| `/projects` | GET | **200** — **4 projets** (dont « UEFA », créés le 16 juil.) | ✅ lecture drive |
| `/projects/{id}` | GET | **200** — projet « UEFA » : 1 vidéo 62,8 s + 1 audio .wav 62,7 s + 2 images ; 1 composition ; 0 publish | ✅ lecture détaillée média |
| `/jobs` | GET | **200** — `data: []` (aucun job récent) | ✅ file de jobs lisible |

> ⚠️ **Non encore démontré (consommerait crédits/minutes)** : `POST /jobs/agent` (édition), `POST /jobs/publish` (export), `POST /export/transcript`, `POST /jobs/import/project_media`. Endpoints + auth **prouvés joignables** ; génération **non lancée** (par prudence crédits — même logique que l'audit Jogg).

## Capacités (carte des endpoints — doc officielle `docs.descriptapi.com`)
| Groupe | Endpoint | Ce que ça fait |
|---|---|---|
| **Import média** | `POST /jobs/import/project_media` | importe fichiers → crée projet + compositions ; retourne `media_seconds_used` |
| **Édition IA (Underlord)** | `POST /jobs/agent` | **prompt langage naturel** : *retirer les filler words*, *studio sound* (amélioration audio), *supprimer les silences*, *highlight reel 30 s*, *couper 1:30→2:15*, *créer une vidéo de X s*. Retourne `ai_credits_used`. Params : `project_id`/`project_name`, `composition_id`, `prompt`, `model`, `callback_url` (**webhook**), `conversation_id` |
| **Modèles** | `GET /agent/models` | liste modèles + coût (low/medium/high) |
| **Publier / Export** | `POST /jobs/publish` | rend une composition → `share_url` + `download_url` (signé, expirable). `media_type` Video/Audio, `resolution` **480p→4K**, `access_level`. **Aucun watermark mentionné** |
| **Export transcript** | `POST /export/transcript` | `txt/markdown/html/rtf/docx/srt`, speaker labels, markers, timecodes |
| **Jobs** | `GET /jobs`, `GET /jobs/{id}`, `DELETE /jobs/{id}` | monitoring async + annulation |
| **Partner** | `POST /edit_in_descript/schema`, `GET /published_projects/{slug}` | edit-in-Descript, métadonnées publiées |

## Adéquation au workflow « Editing / Enhancement » (verdict)
**Très bon fit fonctionnel.** Descript consolide en **un seul provider** ce qui serait sinon plusieurs outils/étapes manuelles de post-prod :
- ✅ **Studio Sound** (débruitage/mastering voix) — le gain qualité #1 pour nos vidéos avatar/podcast.
- ✅ **Filler words + silences** retirés automatiquement (montage « propre » sans timeline manuelle).
- ✅ **Sous-titres / transcript** multi-format (SRT pour la publication sociale).
- ✅ **Highlight reels / recut** par prompt (repurposing d'une vidéo longue en short).
- ✅ **Export ≤ 4K sans watermark** + `download_url` → réutilisable direct dans notre pipeline.
- ✅ **Async + `callback_url` (webhooks)** → colle **parfaitement** au pattern existant `jobs` + cron + R2 (comme le plan Jogg). 1 client `lib/descript-client.ts` suffirait.

## ⚠️ Points de vigilance (à trancher avant tout dev V1.1)
1. **Économie des crédits = le vrai sujet.** La doc montre un job agent à **`ai_credits_used: 32`**. Les plans donnent **400 cr (Hobbyist) / 800 (Creator) / 1500 (Business)** par mois. À ~32 cr/job, un plan Creator (800 cr) ≈ **25 éditions IA/mois** avant top-up. **À VÉRIFIER** : le coût réel en crédits *par action* (studio sound vs highlight vs filler) — non documenté finement. **C'est le chiffrage P0.**
2. **Top-ups réservés à Creator/Business.** Pour un pipeline automatisé qui peut déborder, la **base contractuelle mini = plan Creator** (24 $/mo annuel, 800 cr, 30 h média, top-ups possibles). Hobbyist (pas de top-up) = inadapté à un usage SaaS.
3. **Import = minutes média consommées** (`media_seconds_used`) → double compteur (minutes média **et** crédits IA) à surveiller.
4. **Flux multi-étapes** : import → agent-edit → publish. Plus lourd qu'un endpoint unique, mais chaque étape est un job async standard → gérable par le cron existant.
5. **API en open beta 2026** → surface susceptible d'évoluer ; verrouiller les schémas et prévoir la gestion d'erreurs.

## Limites officielles confirmées (article d'aide Descript, 16 juil. 2026)
- **Pas de plan « Business only »** : l'API marche dès qu'on peut créer un **token** (réglages compte). Les **crédits/minutes viennent du plan** ; si épuisés → **erreur 402**. → *le gate n'est pas le plan, c'est le budget crédits* (confirme le P0).
- **Pas d'export local** : on ne récupère le MP4 **qu'en publiant** (`/jobs/publish` → `download_url` signé). Pas d'export fichier sans publier. → **OK pour nous** : le pipeline publie puis télécharge le MP4 vers R2 (comme prévu).
- **URLs YouTube non supportées** en import.
- **Historique des jobs = 30 jours** seulement → notre `jobs`/DB reste la source de vérité durable.
- **Token mono-drive** : 1 token = 1 drive (éditer un projet d'un autre drive = erreur).
- **Import ≤ 1 Go** ; les *share links* (Drive/Dropbox) doivent être des **liens de téléchargement direct**.
- Transcription **automatique** à l'import ; MCP officiel dispo (Claude/ChatGPT/custom) — mais **API REST directe = la bonne voie** pour un pipeline prod.

## Coûts (base **contractuelle**, pas l'entitlement de la clé test)
| Plan | Prix (annuel/mensuel) | Crédits IA/mois | Média/mois | Top-up |
|---|---|---|---|---|
| Free | 0 $ | 100 (one-time) | 60 min | ❌ |
| Hobbyist | 16 / 24 $ | 400 | — | ❌ |
| **Creator** *(base V1.1 recommandée)* | **24 / 35 $** | **800** | **30 h** | ✅ |
| Business | 50 / 65 $ | 1 500 (+1 000 bonus) | 40 h (+10) | ✅ |

> Comme pour Jogg : **ne pas** bâtir l'éco sur la gratuité de la clé test (entitlement temporaire/non contractuel). Le P&L V1.1 se chiffre sur **Creator** au minimum, avec le **coût réel en crédits/action à confirmer** (P0).

## Démonstration métier — édition NON DESTRUCTIVE E2E (16 juil. 2026, VÉRIFIÉ sur la clé)
Preuve que Descript répond au besoin « modifier une vidéo existante sans la régénérer » :
- **Source** : notre pub DJI URL→Video (MP4 R2, 36,4 s, narration FR) — une vidéo **déjà rendue**.
- **Flux API réel** (`https://descriptapi.com/v1`, Bearer) : `POST /jobs/import/project_media` → `POST /jobs/agent` → `POST /jobs/publish`, polling `GET /jobs/{id}`.
- **Import** : projet `4efe163d-…-2d9968218b4d`, composition `edit`, `media_seconds_used=36`.
- **Édition agent** (prompt : retirer filler/silences + Studio Sound + sous-titres) : `result=success`, réponse = *« Studio Sound appliqué ; sous-titres "Karaoke classic" ajoutés ; aucun filler/silence détecté »*. **`ai_credits_used = 16,61`**.
- **Publish** 1080p → `download_url` → MP4 36,4 s (ré-encodé, sous-titres incrustés).
- **Non-destructivité prouvée** : `GET /projects/{id}` → `media_files=['main']` (**source intacte**) + composition `edit` par-dessus.
- **Preuve visuelle** : sous-titres Descript (style karaoké, mot surligné) présents dans l'édité, **absents de la source**.
- **Donnée coût MESURÉE (clôt une partie du P0)** : **~16,6 crédits pour 1 édition** (Studio Sound + captions, 36 s) → sur plan Creator (800 cr/mois) ≈ **48 éditions/mois** avant top-up. Le coût grimpe vite dès qu'on empile les actions → à intégrer au chiffrage/POC.

## Décision (proposée)
**GO benchmark → pré-validé pour V1.1.** Descript couvre le besoin « Editing / Enhancement » avec une **API REST propre, async, webhookée, sans watermark**, réutilisable via `jobs`/cron/R2 (+ 1 client). **Blocage à lever avant dev** : chiffrer le **coût réel en crédits par action** (P0) pour valider la marge. Aucun code écrit ; ce document est un audit.

## Sources
- Doc API : [docs.descriptapi.com](https://docs.descriptapi.com/) · Aide : [Descript API](https://help.descript.com/hc/en-us/articles/43370311322509-Descript-API)
- Tarifs : [descript.com/pricing](https://www.descript.com/pricing) · récap [CostBench](https://costbench.com/software/ai-video-generators/descript/), [Fluxnote](https://fluxnote.io/guides/descript-pricing-2026)
