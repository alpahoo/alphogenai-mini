# AlphoGenAI Mini — Worker (V1)

Le worker Python est le “cerveau”. Il poll la table `jobs` (Supabase) et déclenche **un seul backend vidéo** via l’interface `VideoBackend`.

## Pipeline (happy path)

1. Récupère 1 job `pending`
2. Passe le job en `in_progress`
3. Calcule la clé cache (hash stable JSON: `prompt + duration_sec + fps + resolution + seed`)
4. Si cache HIT (`video_cache`) → job `done` immédiatement
5. Sinon → `VideoBackend.generate_video(...)` → retourne une **URL MP4 publique**
6. Met à jour `jobs.output_url_final` (+ `final_url`) puis `status=done`
7. Sauvegarde l’URL dans `video_cache`

## Backends disponibles

- **MockBackend (défaut local/CI)**: génère un MP4 dummy (~1s) avec ffmpeg, l’uploade sur Supabase Storage, renvoie l’URL publique.
- **ModalBackend (prod)**: appelle un web endpoint Modal et récupère `{ video_url }`.

Sélection via env:
```bash
VIDEO_BACKEND=mock   # défaut
# ou
VIDEO_BACKEND=modal
MODAL_VIDEO_ENDPOINT_URL=https://...
```

## Dépendances & setup

```bash
cd workers
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## Démarrer le worker

```bash
python -m workers.worker
```

Mode “un tour” (utile pour tests/E2E):
```bash
python -m workers.worker --once
```

## Test E2E sans GPU

À la racine du repo:
```bash
python3 tools/e2e_test_v1.py
```

