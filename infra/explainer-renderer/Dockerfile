FROM node:22-bookworm-slim

# System deps: ffmpeg + chromium (render & screenshot), python + espeak-ng (Kokoro TTS), fonts.
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      ffmpeg chromium python3 python3-pip espeak-ng curl ca-certificates \
      fonts-liberation fonts-noto-color-emoji \
      libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 \
      libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 \
      libpango-1.0-0 libcairo2 \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PUPPETEER_SKIP_DOWNLOAD=1 \
    KOKORO_MODEL_DIR=/models \
    NODE_ENV=production

# Kokoro TTS (CPU, no API key) + model files baked into the image.
RUN pip3 install --no-cache-dir --break-system-packages kokoro-onnx soundfile
RUN mkdir -p /models \
    && curl -fsSL -o /models/kokoro-v1.0.onnx https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx \
    && curl -fsSL -o /models/voices-v1.0.bin  https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
# Pre-warm the hyperframes CLI into the npx cache so renders don't fetch on first call.
RUN npx --yes hyperframes@0.6.110 --help >/dev/null 2>&1 || true
COPY build.js tts_kokoro.py server.js ./

EXPOSE 9100
CMD ["node", "server.js"]
