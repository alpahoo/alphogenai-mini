# syntax=docker/dockerfile:1.7-labs
FROM nvidia/cuda:12.1.1-cudnn8-devel-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    git wget curl ca-certificates \
    ffmpeg \
    python3 python3-pip python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Create user
RUN useradd -m -u 1000 app
WORKDIR /app

# Copy requirements early for layer caching
COPY requirements.txt /app/requirements.txt
RUN pip3 install --upgrade pip setuptools wheel \
    && pip3 install --no-cache-dir -r /app/requirements.txt

# Clone HoloCine (shallow) and keep scripts
RUN git clone --depth=1 https://github.com/yihao-meng/HoloCine /app/HoloCine

# Copy service code
COPY app /app/app
COPY scripts /app/scripts
COPY start.sh /app/start.sh

# Runtime env
ENV CHECKPOINTS_PATH=/checkpoints \
    OUTPUTS_PATH=/outputs \
    LICENSE_MODE=research \
    AUTO_DOWNLOAD=0 \
    DEFAULT_MODE=sparse \
    DEFAULT_NUM_FRAMES=121 \
    INFERENCE_TIMEOUT_S=720 \
    PYTHONUNBUFFERED=1

# Create mount points
RUN mkdir -p /checkpoints /outputs && chown -R app:app /app /checkpoints /outputs && chmod +x /app/start.sh
USER app

# Start via wrapper that can run FastAPI HTTP or Runpod handler
ENTRYPOINT ["/app/start.sh"]

EXPOSE 8000
