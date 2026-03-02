# Video backend — Modal (V1)

Ce dossier contient le **backend vidéo unique** pour la production: **Modal** (serverless GPU).

## Contrat HTTP (stable)

- `GET /healthz` → 200 si OK
- `POST /generate_film` → `{ "video_url": "https://.../file.mp4" }`

Payload:
```json
{
  "prompt": "…",
  "duration": 60,
  "fps": 24,
  "resolution": "1920x1080",
  "seed": 42
}
```

## Notes

- V1: **upload direct** vers Supabase Storage bucket **`generated`** (public read).
- Le worker appelle ce service via `MODAL_VIDEO_ENDPOINT_URL`.
- En local/CI, on utilise `VIDEO_BACKEND=mock` (voir `workers/video_backend/mock_backend.py`).

## Déploiement (Modal)

Prérequis:
- `modal` installé et configuré
- variables d’environnement Modal (Secrets) :
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY` (ou `SUPABASE_SERVICE_KEY`)
  - `SUPABASE_BUCKET=generated`

Déployer:
```bash
cd services/video_modal
modal deploy modal_app.py
```

Récupérer l’URL web endpoint et la mettre dans:
```bash
MODAL_VIDEO_ENDPOINT_URL=...
VIDEO_BACKEND=modal
```

## TODO (V2)

Remplacer la génération “dummy mp4” par le vrai modèle vidéo (SVI ou autre) **dans Modal**,
sans changer le contrat `/generate_film`.

