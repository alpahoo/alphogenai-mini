# Audio Ambience Service

AI-powered audio generation and selection service for video content. Provides ambient audio generation using AudioLDM2, video-conditioned audio with Diff-Foley, and intelligent audio selection using CLAP.

## Features

- **AudioLDM2**: Text-to-audio generation with high-quality ambient sounds
- **Diff-Foley**: Video-conditioned audio generation (experimental)
- **CLAP**: Audio-text similarity scoring for intelligent selection
- **FFmpeg Integration**: Audio normalization to -16 LUFS and video mixing
- **Dual Storage**: Supabase Storage (primary) with Cloudflare R2 fallback
- **Mock Mode**: Development mode without GPU requirements

## Architecture

```
┌─────────────────────────────────────────────────┐
│           Audio Ambience Service                │
│                                                 │
│  ┌──────────────┐  ┌──────────────┐           │
│  │  AudioLDM2   │  │  Diff-Foley  │           │
│  │  Generator   │  │  Generator   │           │
│  └──────┬───────┘  └──────┬───────┘           │
│         │                  │                    │
│         └──────────┬───────┘                    │
│                    │                            │
│         ┌──────────▼───────────┐               │
│         │    CLAP Scorer       │               │
│         │  (Audio Selection)   │               │
│         └──────────┬───────────┘               │
│                    │                            │
│         ┌──────────▼───────────┐               │
│         │   Audio Mixer        │               │
│         │  (FFmpeg Normalize)  │               │
│         └──────────┬───────────┘               │
│                    │                            │
│         ┌──────────▼───────────┐               │
│         │  Storage Manager     │               │
│         │  (Supabase/R2)       │               │
│         └──────────────────────┘               │
└─────────────────────────────────────────────────┘
```

## API Endpoints

### 1. Health Check

```bash
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "service": "audio-ambience",
  "mode": "auto",
  "mock": false,
  "models": {
    "audioldm2": true,
    "difffoley": false,
    "clap": true
  },
  "timestamp": "2025-10-26T17:00:00Z"
}
```

### 2. AudioLDM2 Generation

Generate audio from text prompt.

```bash
POST /audio/audioldm2
Content-Type: application/json

{
  "prompt": "Ocean waves crashing on a beach with seagulls",
  "duration": 10.0,
  "seed": 42,
  "negative_prompt": "music, speech",
  "guidance_scale": 3.5,
  "num_inference_steps": 50
}
```

**Response:**
```json
{
  "audio_url": "https://storage.example.com/audio/audioldm2/20251026_170000_audio.wav",
  "duration": 10.0,
  "sample_rate": 16000,
  "tags": ["ocean", "nature"],
  "seed": 42,
  "generation_time": 8.5
}
```

### 3. Diff-Foley Generation

Generate audio from video (video-conditioned).

```bash
POST /audio/difffoley
Content-Type: application/json

{
  "video_url": "https://storage.example.com/videos/video.mp4",
  "duration": 60.0,
  "target_lufs": -16.0,
  "normalize": true,
  "seed": 42
}
```

**Response:**
```json
{
  "audio_url": "https://storage.example.com/audio/difffoley/20251026_170000_audio.wav",
  "score": 0.85,
  "duration": 60.0,
  "sample_rate": 48000,
  "normalized": true,
  "generation_time": 15.2
}
```

### 4. CLAP Audio Selection

Select best audio from candidates using audio-text similarity.

```bash
POST /audio/clap/select
Content-Type: application/json

{
  "prompt": "Ocean waves and seagulls",
  "candidates": [
    {
      "url": "https://storage.example.com/audio1.wav",
      "source": "difffoley",
      "metadata": {}
    },
    {
      "url": "https://storage.example.com/audio2.wav",
      "source": "audioldm2",
      "metadata": {}
    }
  ]
}
```

**Response:**
```json
{
  "best_url": "https://storage.example.com/audio1.wav",
  "best_source": "difffoley",
  "scores": {
    "difffoley": 0.81,
    "audioldm2": 0.64
  },
  "selection_time": 1.2
}
```

## Installation

### Prerequisites

- Python 3.10+
- CUDA 12.1+ (for GPU support)
- FFmpeg
- Docker (for containerized deployment)

### Local Development

```bash
# Clone repository
cd services/audio-service

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Set environment variables
cp ../../.env.example .env
# Edit .env with your credentials

# Run service
python main.py
```

The service will be available at `http://localhost:3000`.

### Docker Deployment

```bash
# Build image
docker build -t audio-service:latest .

# Run container (GPU required)
docker run --gpus all \
  -p 3000:3000 \
  -e SUPABASE_URL=your_url \
  -e SUPABASE_SERVICE_ROLE=your_key \
  -e AUDIO_MODE=auto \
  -e AUDIO_MOCK=false \
  audio-service:latest
```

### Runpod Serverless Deployment

1. Build and push Docker image:
```bash
docker build -t your-registry/audio-service:latest .
docker push your-registry/audio-service:latest
```

2. Create Runpod Serverless endpoint:
   - Go to [Runpod Console](https://www.runpod.io/console/serverless)
   - Select GPU: RTX 4090 (preferred) or T4
   - Enter image URL
   - Set max workers: 1
   - Configure environment variables

3. Update `.env`:
```bash
AUDIO_BACKEND_URL=https://api.runpod.ai/v2/YOUR_ENDPOINT_ID
```

## Configuration

### Environment Variables

```bash
# Required
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE=your_service_role_key

# Audio Service
AUDIO_MODE=auto              # auto|off
AUDIO_PRIORITY=audioldm2     # difffoley|audioldm2
AUDIO_DIFFFOLEY=false        # Enable Diff-Foley (experimental)
AUDIO_MOCK=false             # Mock mode for development
CLAP_ENABLE=true             # Enable CLAP scoring

# Storage (Optional - R2)
R2_ENDPOINT=https://your-account.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_BUCKET=your_bucket_name

# Storage (Fallback - Supabase)
SUPABASE_BUCKET=generated    # Supabase Storage bucket
```

### Modes

**Production Mode** (`AUDIO_MOCK=false`):
- Requires GPU (RTX 4090 or T4)
- Full AudioLDM2 and CLAP functionality
- ~8-15s generation time per audio

**Mock Mode** (`AUDIO_MOCK=true`):
- No GPU required
- Returns silent audio files
- Instant generation for testing
- Use for development and CI/CD

## Testing

### Smoke Tests

```bash
# Local testing
export AUDIO_BACKEND_URL=http://localhost:3000
./tests/smoke_test.sh

# Remote testing
export AUDIO_BACKEND_URL=https://api.runpod.ai/v2/YOUR_ENDPOINT_ID
./tests/smoke_test.sh
```

### Manual Testing

```bash
# Test AudioLDM2
curl -X POST http://localhost:3000/audio/audioldm2 \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Ocean waves",
    "duration": 5.0
  }'

# Test CLAP selection
curl -X POST http://localhost:3000/audio/clap/select \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Ocean waves",
    "candidates": [
      {"url": "https://example.com/audio1.wav", "source": "test1"},
      {"url": "https://example.com/audio2.wav", "source": "test2"}
    ]
  }'
```

## Performance

### Generation Times (RTX 4090)

- **AudioLDM2**: ~8-12s for 10s audio
- **Diff-Foley**: ~15-20s for 60s video
- **CLAP Scoring**: ~1-2s per candidate
- **FFmpeg Normalization**: ~2-3s per file

### GPU Memory Requirements

- **AudioLDM2**: ~6-8GB VRAM
- **Diff-Foley**: ~8-10GB VRAM
- **CLAP**: ~1-2GB VRAM (CPU compatible)

### Cost Estimation (Runpod RTX 4090)

- **Active**: ~$0.69/hour
- **Idle**: $0.00/hour (auto-scales to 0)
- **Per Audio**: ~$0.002-0.005
- **100 audios/day**: ~$0.20-0.50/day

## Troubleshooting

### GPU Not Detected

**Problem**: Service starts but uses CPU

**Solution**:
```bash
# Check CUDA availability
python -c "import torch; print(torch.cuda.is_available())"

# Verify GPU in Docker
docker run --gpus all nvidia/cuda:12.1.0-base-ubuntu22.04 nvidia-smi
```

### Model Loading Fails

**Problem**: `Model loading failed` error

**Solution**:
1. Check internet connection (models download from Hugging Face)
2. Verify disk space (models are 5-10GB)
3. Check Hugging Face cache: `echo $HF_HOME`

### FFmpeg Not Found

**Problem**: `ffmpeg not installed` error

**Solution**:
```bash
# Ubuntu/Debian
sudo apt-get install ffmpeg

# Docker: Already included in Dockerfile
```

### Storage Upload Fails

**Problem**: `Storage upload failed` error

**Solution**:
1. Verify Supabase credentials
2. Check bucket exists and is public
3. Verify R2 credentials if using R2

### Cold Start Timeout

**Problem**: First request times out

**Solution**:
- Serverless endpoints have 30-60s cold start
- Pre-cache models in Docker image (see Dockerfile)
- Increase timeout in client

## Development

### Project Structure

```
services/audio-service/
├── main.py              # FastAPI application
├── audio_utils.py       # Audio generation models
├── mix_utils.py         # FFmpeg mixing utilities
├── storage_utils.py     # Storage management
├── requirements.txt     # Python dependencies
├── Dockerfile           # Container definition
├── README.md            # This file
└── tests/
    └── smoke_test.sh    # Smoke tests
```

### Adding New Models

1. Add model wrapper to `audio_utils.py`
2. Add endpoint to `main.py`
3. Update `requirements.txt`
4. Update Dockerfile to pre-cache model
5. Add tests to `smoke_test.sh`

### Code Style

- Follow PEP 8
- Use type hints
- Add docstrings to all functions
- Log important operations
- Handle errors gracefully

## Integration

### Worker Integration

```python
import httpx

async def generate_audio_for_video(video_url: str, prompt: str):
    """Generate audio for video using audio service."""
    
    # Try Diff-Foley first
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{AUDIO_BACKEND_URL}/audio/difffoley",
            json={
                "video_url": video_url,
                "duration": 60.0,
                "normalize": True
            },
            timeout=120.0
        )
        
        if response.status_code == 200:
            difffoley_result = response.json()
        else:
            # Fallback to AudioLDM2
            response = await client.post(
                f"{AUDIO_BACKEND_URL}/audio/audioldm2",
                json={
                    "prompt": prompt,
                    "duration": 60.0
                },
                timeout=120.0
            )
            audioldm2_result = response.json()
        
        # Select best with CLAP
        response = await client.post(
            f"{AUDIO_BACKEND_URL}/audio/clap/select",
            json={
                "prompt": prompt,
                "candidates": [
                    {"url": difffoley_result["audio_url"], "source": "difffoley"},
                    {"url": audioldm2_result["audio_url"], "source": "audioldm2"}
                ]
            }
        )
        
        selection = response.json()
        return selection["best_url"]
```

## License

MIT License - See LICENSE file for details

## Support

For issues and questions:
- Check logs: `docker logs <container_id>`
- Review health endpoint: `GET /health`
- Run smoke tests: `./tests/smoke_test.sh`
- Check Runpod console for GPU status
