# Stable Video Infinity (SVI) - Runpod Deployment

This directory contains the Docker image and deployment scripts for SVI on Runpod Serverless.

## Overview

SVI (Stable Video Infinity) is deployed as a serverless HTTP endpoint on Runpod with A100 80GB GPU. The deployment includes:

- **Docker image** with model weights pre-loaded (reduces cold-start time)
- **FastAPI server** exposing 4 endpoints
- **Automatic scaling** based on queue depth
- **Health monitoring** via `/healthz` endpoint

## Prerequisites

- Docker installed locally
- Runpod API key (`RUNPOD_API_KEY`)
- Optional: Docker Hub account for pushing images (`DOCKER_USERNAME`)

## Quick Start

### Option 1: Use Existing Endpoint (Recommended)

If you already have a Runpod endpoint ID:

```bash
# Set environment variables
export RUNPOD_API_KEY=your_api_key
export RUNPOD_ENDPOINT_ID=your_endpoint_id

# Build and validate
python tools/deploy_svi.py --build-only
```

### Option 2: Create New Endpoint

```bash
# Set environment variables
export RUNPOD_API_KEY=your_api_key
export DOCKER_USERNAME=your_dockerhub_username

# Build, push, and deploy
python tools/deploy_svi.py --push
```

## Files

- **Dockerfile** - Multi-stage build with CUDA 12.1, PyTorch, and model weights
- **svi_server.py** - FastAPI server with 4 endpoints
- **svi_model.py** - Model wrapper for video generation
- **README.md** - This file

## API Endpoints

Once deployed, the SVI endpoint exposes:

### 1. Health Check
```bash
GET /healthz
```

Response:
```json
{
  "status": "healthy",
  "model_loaded": true,
  "timestamp": "2025-10-26T17:00:00Z"
}
```

### 2. Prompt Stream (Auto Mode)
```bash
POST /prompt_stream
Content-Type: application/json

{
  "keyword": "whale rescue",
  "duration": 60,
  "fps": 24,
  "resolution": "1920x1080",
  "seed": 42
}
```

### 3. Generate Film
```bash
POST /generate_film
Content-Type: application/json

{
  "prompt": "A cinematic video of a whale rescue operation",
  "duration": 60,
  "fps": 24,
  "resolution": "1920x1080",
  "seed": 42
}
```

### 4. Generate Shot
```bash
POST /generate_shot
Content-Type: application/json

{
  "prompt": "Close-up of whale breaching water",
  "duration": 10,
  "fps": 24,
  "resolution": "1920x1080",
  "seed": 42
}
```

## Configuration

### Environment Variables

```bash
# Required
RUNPOD_API_KEY=your_runpod_api_key

# Optional (for deployment)
RUNPOD_ENDPOINT_ID=existing_endpoint_id
DOCKER_USERNAME=your_dockerhub_username

# SVI Configuration (set after deployment)
SVI_ENDPOINT_URL=https://api.runpod.ai/v2/your_endpoint_id
SVI_MODE=film
SVI_FPS=24
SVI_RES=1920x1080
SVI_DURATION_SEC=60
SVI_SEED=42
```

### GPU Configuration

- **GPU Type**: NVIDIA A100 80GB
- **Max Workers**: 1 (configurable)
- **Idle Timeout**: 5 seconds
- **Scaler**: Queue-based (4s delay)

## Deployment Steps

### 1. Build Docker Image

```bash
python tools/deploy_svi.py --build-only
```

This builds the image locally with:
- CUDA 12.1 + cuDNN 8
- PyTorch with CUDA support
- FastAPI + Uvicorn
- Model weights (cached during build)

### 2. Push to Registry (Optional)

```bash
export DOCKER_USERNAME=your_username
python tools/deploy_svi.py --push
```

### 3. Create Endpoint

If you don't have an existing endpoint:

1. Go to [Runpod Console](https://www.runpod.io/console/serverless)
2. Click "New Endpoint"
3. Select "A100 80GB" GPU
4. Enter your Docker image URL
5. Set max workers to 1
6. Save and copy the endpoint ID

### 4. Validate Deployment

```bash
export RUNPOD_ENDPOINT_ID=your_endpoint_id
python tools/deploy_svi.py --deploy-only
```

This will:
- Construct the endpoint URL
- Check `/healthz` endpoint
- Validate model is loaded
- Display configuration to add to `.env`

## Testing

### Test Health Endpoint

```bash
curl https://api.runpod.ai/v2/YOUR_ENDPOINT_ID/healthz
```

### Test Video Generation

```bash
curl -X POST https://api.runpod.ai/v2/YOUR_ENDPOINT_ID/generate_shot \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A beautiful sunset over the ocean",
    "duration": 10,
    "fps": 24,
    "resolution": "1920x1080"
  }'
```

## Troubleshooting

### Cold Start Issues

**Problem**: Endpoint returns 404 or timeout on first request

**Solution**: Serverless endpoints have cold start time (30-60s). Wait and retry.

### Model Not Loading

**Problem**: Health check shows `model_loaded: false`

**Solution**: 
1. Check Docker logs in Runpod console
2. Verify model weights are included in image
3. Check GPU memory availability

### Build Failures

**Problem**: Docker build fails

**Solution**:
1. Ensure Docker has enough disk space (20GB+)
2. Check CUDA compatibility
3. Verify all dependencies in Dockerfile

### Deployment Failures

**Problem**: Endpoint creation fails

**Solution**:
1. Verify RUNPOD_API_KEY is valid
2. Check Runpod account has credits
3. Ensure GPU type is available in your region

## Cost Estimation

### Runpod Serverless Pricing (A100 80GB)

- **Active**: ~$1.89/hour
- **Idle**: $0.00/hour (auto-scales to 0)
- **Cold Start**: ~30-60 seconds

### Example Costs

- 1 video (60s, 24fps): ~$0.05-0.10
- 10 videos/day: ~$0.50-1.00/day
- 100 videos/day: ~$5.00-10.00/day

**Note**: Actual costs depend on generation time and queue depth.

## Next Steps

After successful deployment:

1. Add `SVI_ENDPOINT_URL` to your `.env` file
2. Test the endpoint with sample requests
3. Integrate with the audio service pipeline
4. Monitor costs in Runpod dashboard

## Support

For issues:
- Check Runpod logs in console
- Review Docker build output
- Verify environment variables
- Test health endpoint manually

## Notes

- **Model Weights**: The Dockerfile includes placeholders for model weights. You need to add actual SVI model loading code in `svi_model.py`.
- **Production Ready**: This is a template. Replace mock implementations with actual SVI model code.
- **Security**: Never commit API keys. Use environment variables only.
