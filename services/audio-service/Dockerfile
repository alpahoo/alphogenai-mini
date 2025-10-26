# Audio Ambience Service - Dockerfile
# GPU-enabled container for AudioLDM2, CLAP, and Diff-Foley
# Target: RTX 4090 or T4 GPU on Runpod Serverless

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
    libsndfile1 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Upgrade pip
RUN python3 -m pip install --upgrade pip setuptools wheel

# Set working directory
WORKDIR /app

# Copy requirements first (for better caching)
COPY requirements.txt .

# Install PyTorch with CUDA support
RUN pip3 install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121

# Install Python dependencies
RUN pip3 install -r requirements.txt

# Pre-download models to reduce cold-start time
RUN python3 -c "from transformers import ClapModel, ClapProcessor; \
    ClapProcessor.from_pretrained('laion/clap-htsat-unfused'); \
    ClapModel.from_pretrained('laion/clap-htsat-unfused'); \
    print('CLAP model cached')"

# Note: AudioLDM2 models are large (~5GB), uncomment to pre-cache
# RUN python3 -c "from diffusers import AudioLDM2Pipeline; \
#     AudioLDM2Pipeline.from_pretrained('cvssp/audioldm2'); \
#     print('AudioLDM2 model cached')"

# Copy application code
COPY main.py .
COPY audio_utils.py .
COPY mix_utils.py .
COPY storage_utils.py .

# Create directories
RUN mkdir -p /app/outputs /app/cache

# Set Hugging Face cache directory
ENV HF_HOME=/app/cache \
    TRANSFORMERS_CACHE=/app/cache \
    HF_DATASETS_CACHE=/app/cache

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Start the service
CMD ["python3", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3000"]
