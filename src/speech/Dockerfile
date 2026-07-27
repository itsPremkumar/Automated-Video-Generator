# =============================================================================
# Voicebox Backend — Production Dockerfile
# =============================================================================
# Multi-stage build:
#   stage 1 (builder): compile heavy dependencies (onnxruntime, torchaudio)
#   stage 2 (runtime): minimal image with models volume
#
# Build variants (via --build-arg):
#   BASE_IMAGE=python:3.11-slim       (default, CPU-only)
#   TORCH_INDEX_URL=https://download.pytorch.org/whl/cpu  (default, CPU)
#
#   For CUDA 12.1:
#     --build-arg BASE_IMAGE=nvidia/cuda:12.1.0-runtime-ubuntu22.04
#     --build-arg TORCH_INDEX_URL=https://download.pytorch.org/whl/cu121
#
# Usage:
#   docker build -t voicebox-backend:latest -f Dockerfile ../..
#   docker run -p 8000:8000 -v voicebox-data:/data voicebox-backend:latest
# =============================================================================

ARG BASE_IMAGE=python:3.11-slim
ARG TORCH_INDEX_URL=https://download.pytorch.org/whl/cpu

# ── Stage 1: Builder ────────────────────────────────────────────────────────
FROM $BASE_IMAGE AS builder

ARG TORCH_INDEX_URL
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# System build deps (for onnxruntime, scipy, librosa native extensions)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    cmake \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Copy only requirements first for Docker layer caching
COPY src/speech/requirements.txt .
COPY src/speech/requirements-clone.txt .

# Install Python deps into a venv (bundled into final image)
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

RUN pip install --upgrade pip setuptools wheel

# Install PyTorch from the specified index (CPU or CUDA)
RUN pip install torch torchaudio --index-url $TORCH_INDEX_URL

# Install core requirements (without optional clone engines)
RUN grep -v '^#' requirements.txt | grep -v '^$' | grep -v '^torch' | \
    pip install -r /dev/stdin

# ── Stage 2: Runtime ───────────────────────────────────────────────────────
FROM $BASE_IMAGE AS runtime

ARG TORCH_INDEX_URL

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH" \
    VOICEBOX_DATA_DIR="/data" \
    HF_HUB_CACHE="/data/models/hub" \
    PYTHONPATH="/app/speech"

# Install runtime system deps (audio codecs, espeak for phonemizer)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libsndfile1 \
    libsndfile1-dev \
    espeak-ng \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy venv from builder (includes all Python deps)
COPY --from=builder /opt/venv /opt/venv

# Create non-root user
RUN groupadd -r voicebox && useradd -r -g voicebox -d /app -s /sbin/nologin voicebox

# Create app directory structure
WORKDIR /app
RUN mkdir -p /app/speech /data && chown -R voicebox:voicebox /app /data

# Copy application source
COPY src/speech/ ./speech/
COPY src/speech/entrypoint.sh /entrypoint.sh

# Make entrypoint executable
RUN chmod +x /entrypoint.sh && chown -R voicebox:voicebox /app

# Switch to non-root user
USER voicebox

# Expose API port
EXPOSE 8000

# Health check: the /health endpoint returns 200 when the backend is ready
HEALTHCHECK --interval=15s --timeout=5s --start-period=45s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Default command
ENTRYPOINT ["/entrypoint.sh"]
CMD ["--host", "0.0.0.0", "--port", "8000", "--data-dir", "/data"]