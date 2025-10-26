#!/usr/bin/env bash
set -euo pipefail

: "${SERVER_MODE:=http}"

# Optional checkpoints sync
if [[ "${AUTO_DOWNLOAD:-0}" == "1" ]]; then
  python3 /app/scripts/sync_checkpoints.py || true
fi

if [[ "$SERVER_MODE" == "runpod" ]]; then
  echo "Starting Runpod serverless handler..."
  exec python3 -u /app/app/handler.py
else
  echo "Starting FastAPI HTTP server..."
  exec uvicorn app.main:app --host 0.0.0.0 --port 8000
fi
