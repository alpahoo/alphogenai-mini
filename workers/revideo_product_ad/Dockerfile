FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium ffmpeg fonts-inter \
  && rm -rf /var/lib/apt/lists/*

ENV DISABLE_TELEMETRY=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY src ./src

EXPOSE 4000

CMD ["npm", "run", "serve"]
