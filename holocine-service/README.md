# HoloCine Service (Runpod + FastAPI)

Production-ready, plug-and-play HoloCine wrapper exposing both:

- FastAPI HTTP server (dev/dedicated)
- Runpod Serverless handler (production jobs)

No weights committed. Checkpoints sync from R2/HF into `$CHECKPOINTS_PATH`.

## Features

- `/generate`, `/status/{id}`, `/healthz`
- Upload outputs to Cloudflare R2 (S3-compatible)
- Supabase `jobs` table for status persistence
- JSON logging with GPU/VRAM/latency
- Dockerfile (CUDA 12 + Torch 2.x), Compose, CI workflow

## Environment

```bash
# Runpod
RUNPOD_API_KEY=

# R2 (Cloudflare, S3-compatible)
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_ENDPOINT_URL=
R2_BUCKET_MODELS=
R2_BUCKET_OUTPUTS=
R2_PUBLIC_BASE_URL=

# Hugging Face
HUGGINGFACE_TOKEN=

# Supabase
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# Service
CHECKPOINTS_PATH=/checkpoints
OUTPUTS_PATH=/outputs
LICENSE_MODE=research
AUTO_DOWNLOAD=1
DEFAULT_MODE=sparse
DEFAULT_NUM_FRAMES=121
INFERENCE_TIMEOUT_S=720
```

## Build & Run (local)

```bash
docker compose up --build
# Open http://localhost:8000/docs
```

## API

```http
POST /generate
{
  "global_caption": "a cat sitting on a chair",
  "shot_captions": [],
  "num_frames": 121,
  "mode": "sparse",
  "seed": 42
}
→ { "job_id": "uuid", "status": "queued" }

GET /status/{job_id}
→ { "status": "running|done|error", "video_url": "https://...", "progress": 0.0-1.0 }

GET /healthz
→ GPU/VRAM, torch/cuda, flash_attn version, license, checkpoints
```

## Runpod

- Build image and push to GHCR (CI does this).
- Create Serverless endpoint pointing to the image.
- Handler path: `app/handler.py` → `runpod.serverless.start({"handler": run})`.

## Supabase Schema (`jobs`)

```sql
create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('queued','running','done','error')),
  progress float8 default 0,
  video_url text,
  error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

## Licence

For Research and Non-Commercial Use Only (`LICENSE_MODE=research`).
