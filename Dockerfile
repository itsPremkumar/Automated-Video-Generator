# Automated Video Generator — production Docker image
#
# Design rules to AVOID version / system errors:
#   1. Pin a single, well-tested Node base (node:20-bookworm). engines require >=18.
#   2. Install ALL deps (no --only=production) because the app runs via `tsx`
#      (a devDependency) at runtime — dropping devDeps breaks `npm run dev`.
#   3. ffmpeg-static ships its OWN platform binary; we do NOT rely on apt ffmpeg,
#      which avoids version drift between the bundled binary and system ffmpeg.
#   4. Non-root user for stability + security.
#   5. Healthcheck hits the REAL route (/api/health) mounted in api-routes.ts.

FROM node:20-bookworm

LABEL org.opencontainers.image.title="Automated Video Generator"
LABEL org.opencontainers.image.description="Free and open-source AI text-to-video pipeline"
LABEL org.opencontainers.image.url="https://github.com/itsPremkumar/Automated-Video-Generator"
LABEL org.opencontainers.image.source="https://github.com/itsPremkumar/Automated-Video-Generator"
LABEL org.opencontainers.image.licenses="MIT"

WORKDIR /app

# System deps: chromium is needed by Remotion headless rendering.
# Edge-TTS is pure Python (no native build) -> safe on any arch.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    chromium \
    fonts-liberation \
    fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

# edge-tts is pure Python (no native build) -> safe on any arch.
# Debian Bookworm Python is externally-managed (PEP 668), so install into a venv.
RUN python3 -m venv /opt/venv && /opt/venv/bin/pip install --no-cache-dir edge-tts
ENV PATH="/opt/venv/bin:${PATH}"
# Install dependencies FIRST (better layer caching).
# Full install (dev + prod) so `tsx` is present at runtime.
# Retry on flaky networks (ECONNRESET) instead of failing the build.
COPY package.json package-lock.json* ./
RUN npm config set fetch-retries 5 \
    && npm config set fetch-retry-mintimeout 60000 \
    && npm config set fetch-retry-maxtimeout 120000 \
    && npm config set fetch-timeout 300000 \
    && for i in 1 2 3; do \
         npm ci --prefer-offline --no-audit --no-fund && break \
         || echo "npm ci attempt $i failed (network), retrying..."; \
       done || { echo "ERROR: npm ci failed after 3 retries"; exit 1; }

# Copy source (respects .dockerignore).
COPY . .

# Non-root runtime user.
RUN useradd -m -u 1001 appuser && chown -R appuser:appuser /app
USER appuser

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PORT=3001
ENV VIDEO_ORIENTATION=landscape
ENV VIDEO_VOICE=en-US-GuyNeural
ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=2048

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3001/api/health', r => process.exit(r.statusCode===200?0:1)).on('error', () => process.exit(1))"

CMD ["npm", "run", "dev"]
