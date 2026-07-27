#!/bin/bash
# =============================================================================
# Voicebox Backend — Production Entrypoint
# =============================================================================
# Handles:
#   1. Model cache directory setup
#   2. Optional: pre-download common models on first run
#   3. Starts uvicorn with production settings
#
# Environment variables:
#   VOICEBOX_DATA_DIR    - Persistent data directory (default: /data)
#   VOICEBOX_MODELS_DIR  - Model cache directory (default: $VOICEBOX_DATA_DIR/models/hub)
#   VOICEBOX_WORKERS     - Number of uvicorn workers (default: 1)
#   VOICEBOX_LOG_LEVEL   - Log level: debug|info|warning|error (default: info)
#   VOICEBOX_PRELOAD     - Comma-separated models to preload at startup (default: "")
#                          e.g. "kokoro" or "kokoro,qwen-tts-1.7B"
# =============================================================================

set -euo pipefail

# --- Resolve directories ---
DATA_DIR="${VOICEBOX_DATA_DIR:-/data}"
MODELS_DIR="${VOICEBOX_MODELS_DIR:-${DATA_DIR}/models/hub}"
WORKERS="${VOICEBOX_WORKERS:-1}"
LOG_LEVEL="${VOICEBOX_LOG_LEVEL:-info}"
PRELOAD="${VOICEBOX_PRELOAD:-}"

export VOICEBOX_DATA_DIR="${DATA_DIR}"
export HF_HUB_CACHE="${MODELS_DIR}"

# --- Ensure directories exist ---
mkdir -p "${DATA_DIR}/generations" \
         "${DATA_DIR}/profiles" \
         "${DATA_DIR}/captures" \
         "${DATA_DIR}/cache" \
         "${MODELS_DIR}"

echo "[entrypoint] Data dir:       ${DATA_DIR}"
echo "[entrypoint] Models cache:   ${MODELS_DIR}"
echo "[entrypoint] Workers:        ${WORKERS}"
echo "[entrypoint] Log level:      ${LOG_LEVEL}"

# --- Optional: preload models at startup ---
if [ -n "${PRELOAD}" ]; then
    echo "[entrypoint] Preloading models: ${PRELOAD}"
    IFS=',' read -ra MODELS <<< "${PRELOAD}"
    for model in "${MODELS[@]}"; do
        echo "[entrypoint] Preloading model: ${model}..."
        python -c "
import sys, json, urllib.request
try:
    req = urllib.request.Request('http://127.0.0.1:8000/models/load', data=b'', method='POST')
    req.add_header('Content-Type', 'application/json')
    body = json.dumps({'model_size': '${model}'}).encode()
    resp = urllib.request.urlopen(req, data=body, timeout=300)
    print(f'  ✅ {model} loaded')
except Exception as e:
    print(f'  ⚠ {model} preload skipped: {e}')
" 2>&1 || true
    done
fi

# --- Start uvicorn (or gunicorn with uvicorn workers for multi-worker) ---
echo "[entrypoint] Starting voicebox backend..."

if [ "${WORKERS}" -gt 1 ]; then
    # Multi-worker: use gunicorn with uvicorn workers
    exec gunicorn speech.main:app \
        --worker-class uvicorn.workers.UvicornWorker \
        --workers "${WORKERS}" \
        --bind 0.0.0.0:8000 \
        --log-level "${LOG_LEVEL}" \
        --access-logfile - \
        --error-logfile - \
        --timeout 300 \
        --graceful-timeout 30 \
        --keep-alive 5
else
    # Single worker: use uvicorn directly (simpler, better for GPU)
    exec uvicorn speech.main:app \
        --host 0.0.0.0 \
        --port 8000 \
        --log-level "${LOG_LEVEL}" \
        --timeout-keep-alive 5 \
        --no-server-header
fi