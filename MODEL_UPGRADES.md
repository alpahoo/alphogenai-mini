# Model upgrades (2026+) — guide pratique

Ce projet est conçu pour **changer de modèles sans casser l’app** en conservant des **contrats d’API stables**.

## Principe

- Le frontend/worker ne “connaît” pas les modèles exacts.
- Il parle à **2 backends** via HTTP:
  - **SVI backend** (vidéo): `SVI_ENDPOINT_URL`
  - **Audio backend** (audio + mix): `AUDIO_BACKEND_URL`
- Pour passer à des modèles plus récents, tu as 2 options:
  1. **Remplacer le modèle derrière l’endpoint** (même routes, meilleure perf/qualité).
  2. **Créer un nouveau backend** + adapter le client (ex: nouveau `*_client.py`) tout en gardant les mêmes champs DB.

## Contrat attendu — Vidéo (SVI backend)

Le worker appelle:
- `POST {SVI_ENDPOINT_URL}/generate_film`
- `POST {SVI_ENDPOINT_URL}/generate_shot`
- `GET  {SVI_ENDPOINT_URL}/healthz`

Payload minimum:
```json
{
  "prompt": "…",
  "duration": 60,
  "resolution": "1920x1080",
  "fps": 24,
  "seed": 42
}
```

Réponse attendue:
```json
{
  "video_url": "https://…/video.mp4",
  "metadata": { "model": "…", "latency_sec": 123 }
}
```

Si tu changes de modèle (ex: SVI vNext, Wan2.x, HunyuanVideo, etc.), l’idéal est de **conserver cette shape**.

## Contrat attendu — Audio (Audio backend)

Le worker appelle:
- `POST {AUDIO_BACKEND_URL}/audio/audioldm2`
- `POST {AUDIO_BACKEND_URL}/audio/difffoley` (optionnel)
- `POST {AUDIO_BACKEND_URL}/audio/clap/select`
- `POST {AUDIO_BACKEND_URL}/video/mix` (obligatoire pour produire `output_url_final`)
- `GET  {AUDIO_BACKEND_URL}/healthz`

Objectif: produire une **vidéo finale avec audio intégré**.

Payload du mix:
```json
{
  "video_url": "https://…/video.mp4",
  "audio_url": "https://…/audio.wav",
  "target_lufs": -16.0,
  "mode": "replace"
}
```

Réponse attendue:
```json
{
  "output_url_final": "https://…/final.mp4"
}
```

## Où brancher des modèles plus récents

- **Vidéo**: remplacer le moteur du backend SVI (ou le backend complet) tant que tu renvoies `video_url`.
- **Audio**:
  - remplacer AudioLDM2 par un modèle plus récent (ou “music model”),
  - garder CLAP (ou remplacer par un scorer plus récent),
  - garder le endpoint `/video/mix` (c’est lui qui garantit la compat “app”).

## Champs DB à préserver (compat)

Dans `jobs`:
- `status`, `current_stage`, `error_message`, `retry_count`
- `video_url`, `audio_url`, `output_url_final`, `final_url`
- `app_state` (paramètres + traces d’exécution)

Dans `video_cache`:
- `prompt_hash`, `video_url`, `metadata`

Tant que ces champs restent cohérents, tu peux moderniser les modèles sans toucher à l’UI.

