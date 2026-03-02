# Model upgrades (2026+) — guide pratique (Modal only)

Ce projet est conçu pour **changer de modèles sans casser l’app** en conservant des **contrats d’API stables**.

## Principe

- Le frontend/worker ne “connaît” pas le modèle exact.
- Il parle à **un seul backend vidéo** via HTTP (Modal) : `MODAL_VIDEO_ENDPOINT_URL`
- Local/CI: **MockBackend** (même interface) pour tester sans GPU.

## Contrat attendu — Vidéo (Modal backend)

Le worker appelle:
- `GET  {MODAL_VIDEO_ENDPOINT_URL}/healthz`
- `POST {MODAL_VIDEO_ENDPOINT_URL}/generate_film`

Payload minimum:
```json
{
  "prompt": "…",
  "fps": 24,
  "duration": 60,
  "resolution": "1920x1080",
  "seed": 42
}
```

Réponse attendue:
```json
{
  "video_url": "https://…/video.mp4"
}
```

Si tu changes de modèle (ex: SVI vNext, Wan2.x, HunyuanVideo, etc.), le plus simple est de **remplacer le modèle derrière l’endpoint Modal** en conservant cette réponse.

## Où brancher des modèles plus récents

- **Vidéo**: intégrer/mettre à jour le modèle dans `services/video_modal/modal_app.py` et garder:
  - `GET /healthz`
  - `POST /generate_film` → `{ video_url }`

## Champs DB à préserver (compat)

Dans `jobs`:
- `status`, `current_stage`, `error_message`, `retry_count`
- `video_url`, `output_url_final`, `final_url`
- `app_state` (paramètres + traces d’exécution)

Dans `video_cache`:
- `prompt_hash`, `video_url`, `metadata`

Tant que ces champs restent cohérents, tu peux moderniser les modèles sans toucher à l’UI.

