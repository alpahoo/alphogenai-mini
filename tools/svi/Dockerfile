# Stable Video Infinity (SVI) - Runpod Serverless Deployment
# This Dockerfile builds an image for SVI with weights included to reduce cold-start time
# Target: A100 80GB GPU on Runpod Serverless

FROM nvidia/cuda:12.1.0-cudnn8-devel-ubuntu22.04

# Set environment variables
ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    CUDA_HOME=/usr/local/cuda \
    PATH=/usr/local/cuda/bin:$PATH \
    LD_LIBRARY_PATH=/usr/local/cuda/lib64:$LD_LIBRARY_PATH

# Install system dependencies
RUN apt-get update && apt-get install -y \
    python3.10 \
    python3-pip \
    python3-dev \
    git \
    wget \
    curl \
    ffmpeg \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Upgrade pip
RUN python3 -m pip install --upgrade pip setuptools wheel

# Set working directory
WORKDIR /app

# Install PyTorch with CUDA support (for A100)
RUN pip3 install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121

# Install common video generation dependencies
RUN pip3 install \
    transformers>=4.30.0 \
    diffusers>=0.21.0 \
    accelerate>=0.20.0 \
    safetensors>=0.3.0 \
    omegaconf>=2.3.0 \
    einops>=0.6.0 \
    imageio>=2.31.0 \
    imageio-ffmpeg>=0.4.8 \
    opencv-python>=4.8.0 \
    pillow>=10.0.0 \
    numpy>=1.24.0 \
    scipy>=1.11.0 \
    tqdm>=4.65.0 \
    xformers>=0.0.20

# Install FastAPI and server dependencies
RUN pip3 install \
    fastapi>=0.100.0 \
    uvicorn[standard]>=0.23.0 \
    pydantic>=2.0.0 \
    python-multipart>=0.0.6 \
    aiofiles>=23.0.0

# Create directories for models and outputs
RUN mkdir -p /app/models /app/outputs /app/weights

# Copy SVI implementation files (to be provided)
# NOTE: The actual SVI model code needs to be added here
# This could be from a GitHub repo or custom implementation
COPY svi_model.py /app/
COPY svi_server.py /app/

# Download and cache model weights during build (reduces cold-start)
# NOTE: Replace with actual SVI model weights download
# Example for Stable Diffusion Video (placeholder):
# RUN python3 -c "from diffusers import StableVideoDiffusionPipeline; \
#     pipe = StableVideoDiffusionPipeline.from_pretrained('stabilityai/stable-video-diffusion-img2vid-xt', \
#     cache_dir='/app/weights'); print('Weights cached')"

# Create a placeholder model download script
RUN echo '#!/usr/bin/env python3\n\
import os\n\
print("Model weights should be downloaded here")\n\
print("Cache directory:", os.environ.get("HF_HOME", "/app/weights"))\n\
' > /app/download_weights.py && chmod +x /app/download_weights.py

# Set Hugging Face cache directory
ENV HF_HOME=/app/weights \
    TRANSFORMERS_CACHE=/app/weights \
    HF_DATASETS_CACHE=/app/weights

# Expose port for HTTP server
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8000/healthz || exit 1

# Start the server
CMD ["python3", "svi_server.py"]
