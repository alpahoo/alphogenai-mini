# VEED Web MVP — worker minimal (bêta fermée)

Industrialisation **minimale** du parcours VEED Web déjà validé (test fiabilité 3/3).
Ne remplace rien : réutilise la table `jobs` et le stockage R2 existants.

## Capability exacte testée
**VEED AI Studio → "Generate Talking Head Videos" (AI Avatars) + lip-sync.**
- Workspace switcher : *Gen-AI Studio* · carte *Generate Talking Head Videos* · URL `/ai-studio`
- Avatars **stock** nommés (Marcus, Mira…), voix **TTS** VEED, bandeau *"Lip sync will be applied in final video"*.
- ⚠️ **Ce n'est PAS l'API Fabric 1.0.** Fabric = modèle image→vidéo via API. Ici c'est le
  parcours AI Studio talking-head avec avatars pré-construits. Ne pas présenter comme Fabric.

## Composants
| Fichier | Rôle |
|---|---|
| `veed_web_worker.py` | Worker Playwright déterministe : claim job → studio → script → Generate → attente → **Download UI (`expect_download`)** → R2 → métriques |
| `login.py` | Login **one-time** dans le profil Chrome persistant du worker |
| `app/api/admin/experiments/veed-web-jobs/route.ts` | Route admin : `submit` / `status` (réutilise `jobs`) |

## Pré-requis
```
pip install playwright requests boto3 imageio-ffmpeg
python -m playwright install chrome   # ou Chrome système (channel="chrome")
```
`.env.local` (repo) fournit `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `R2_*`.
Profil persistant : `~/.veed_worker_profile` (override via `VEED_WORKER_PROFILE`).

## Cycle d'utilisation
```
python login.py                    # 1x : se connecter à VEED (session persistée)
python veed_web_worker.py once     # traite 1 job pending veed_web (respecte le plafond 3/j)
python veed_web_worker.py loop     # boucle concurrence 1 jusqu'au plafond/jour
python veed_web_worker.py selftest "Mon script court" portrait   # job local, sans Supabase
```
Soumission d'un job (admin) :
```
POST /api/admin/experiments/veed-web-jobs   { "action":"submit", "script":"...", "format":"portrait" }
GET  /api/admin/experiments/veed-web-jobs?id=<jobId>     # statut + métriques + URL R2
```

## Garde-fous (codés)
- **Concurrence 1** (une seule boucle, un job à la fois) · **plafond 3 vidéos/jour** (worker + route)
- Aucune rotation UA/compte · aucun contournement captcha/quota · aucune API interne VEED
- Aucun cookie hors navigateur (profil persistant uniquement) · **aucun fallback fal.ai**
- Session expirée → statut **`NEEDS_LOGIN`** (le job reste `pending`), le worker s'arrête → `login.py` puis reprise
- Si l'UI attendue change, le worker capture un screenshot de diagnostic puis s'arrête.
- Bêta fermée : seul le format **portrait** validé est accepté.

### Reprise après une erreur de persistance

Si la vidéo est déjà sur R2 mais que l'écriture finale DB échoue, le worker
conserve `final_url`/`video_url` dans l'état **`veed_output_ready`** et retente
uniquement la promotion en `done` au passage suivant. Il ne rouvre pas VEED et
ne relance jamais une génération payante.

Si Supabase est totalement indisponible, un manifeste local
`*_OUTPUT_READY.json` conserve l'URL R2. Le worker reprend automatiquement ce
manifeste avant d'ouvrir Playwright, puis le supprime après promotion réussie.

Test de persistance sans navigateur :
```
python -m unittest workers.veed_web.test_worker_persistence
```

## Suivi des limites (enregistré par job dans `jobs.app_state`)
`plan_before`, `credits_before`, `credits_after`, `mode_or_model`, `avatar`, `format_hint`,
`render_seconds`, `total_seconds`, `ffprobe` (durée/résolution/codecs/taille), `captcha_or_quota`.
> ⚠️ Ne conclure à AUCUNE génération « illimitée » avant **7 jours** de fonctionnement réel.
