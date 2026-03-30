# Base image: Node.js 18 on Debian Bullseye
# We use full Debian (not Alpine) for better compatibility with Python/Edge-TTS/Remotion
FROM node:18-bullseye

# Set working directory
WORKDIR /app

# 1. Install System Dependencies
# - python3 & pip: for edge-tts
# - ffmpeg: for media processing
# - chromium: for Remotion rendering
# - fonts: for better text rendering
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    chromium \
    fonts-liberation \
    fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

# 2. Install Python Dependencies (Edge-TTS)
# We specifically need edge-tts for voice generation
RUN pip3 install edge-tts

# 3. Install Node Dependencies
# Copy package files first to leverage Docker cache
COPY package*.json ./
RUN npm install

# 4. Copy Source Code
COPY . .

# 5. Environment Configuration
# Set Puppeteer executable path for Remotion
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Configurable environment variables (defaults)
ENV PORT=3000
ENV VIDEO_ORIENTATION=landscape
ENV VIDEO_VOICE=en-US-JennyNeural

# 6. Build/Prepare
# (Optional: if we had a build step, we'd run it here. 
# Since it's TS executed via tsx, we just ensure permissions)

# 7. Start Command
# Default to running the batch generator
CMD ["npm", "run", "generate"]
