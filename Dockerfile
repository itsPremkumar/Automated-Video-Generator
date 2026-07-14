FROM node:20-bullseye

LABEL org.opencontainers.image.title="Automated Video Generator"
LABEL org.opencontainers.image.description="Free and open-source AI text-to-video pipeline"
LABEL org.opencontainers.image.url="https://github.com/itsPremkumar/Automated-Video-Generator"
LABEL org.opencontainers.image.source="https://github.com/itsPremkumar/Automated-Video-Generator"
LABEL org.opencontainers.image.licenses="MIT"

WORKDIR /app

RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    chromium \
    fonts-liberation \
    fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

RUN pip3 install edge-tts

COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

COPY . .

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PORT=3001
ENV VIDEO_ORIENTATION=landscape
ENV VIDEO_VOICE=en-US-GuyNeural
ENV NODE_ENV=production

EXPOSE 3001

# Fix (D1): health route is mounted at /api/health (api-routes.ts), not /health.
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3001/api/health', r => {process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

CMD ["npm", "run", "dev"]
