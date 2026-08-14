# 🤖 Local AI Generation Suite

## Overview

This directory contains 12 AI modules for advanced video generation. All modules follow the same **identity-preserving pattern**:

1. `isEnabled()` → boolean (checks availability without blocking)
2. `generate(opts)` → Promise<string> (returns `''` on any failure, never throws)
3. **Provider chain**: local → fallback → placeholder (always works)

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        AI Job Queue                              │
│  (serial processing — one AI job at a time for 6GB RAM)         │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│   Providers   │   │ Intelligence  │   │    Polish     │
├───────────────┤   ├───────────────┤   ├───────────────┤
│ comfyui.ts    │   │ beat-sync.ts  │   │ storyboard.ts │
│ cogvideo.ts   │   │ clip-match.ts │   │ thumbnail.ts  │
│ animatediff.ts│   │ script-enh.ts │   │ translate.ts  │
│ upscale.ts    │   │               │   │               │
│ bg-removal.ts │   │               │   │               │
└───────────────┘   └───────────────┘   └───────────────┘
        │                     │                     │
        ▼                     ▼                     ▼
   ┌─────────┐          ┌─────────┐          ┌─────────┐
   │ ComfyUI │          │ Ollama  │          │ Whisper │
   │ Server  │   OR      │ LLMs    │   OR     │ NLLB    │
   │ (local) │          │ (local) │          │ (local) │
   └─────────┘          └─────────┘          └─────────┘
```

## Modules

### Core Generation (P0)

| Module | Purpose | Model | RAM | Hardware |
|--------|---------|-------|-----|----------|
| `comfyui.ts` | Local image gen | SD1.5/SDXL | ~3GB | NVIDIA dGPU |
| `cogvideo.ts` | Local text-to-video | CogVideoX-2B | ~4GB | NVIDIA dGPU |
| `animatediff.ts` | Local image-to-video | AnimateDiff | ~3GB | NVIDIA dGPU |
| `upscale.ts` | AI upscaling | Real-ESRGAN | ~2GB | NVIDIA dGPU |
| `bg-removal.ts` | Background removal | rembg/U2-Net | ~1.5GB | CPU |

### Intelligence Layer (P1)

| Module | Purpose | Model | RAM | Hardware |
|--------|---------|-------|-----|----------|
| `beat-sync.ts` | Beat detection | librosa | ~200MB | CPU |
| `clip-match.ts` | Semantic matching | CLIP ViT-B/32 | ~500MB | CPU/CUDA |
| `script-enhance.ts` | Script optimization | Qwen2.5-7B | ~2GB | CUDA offload |
| `translate.ts` | Multi-language subs | Whisper + NLLB | ~1GB | CPU |

### Polish Layer (P2)

| Module | Purpose | Model | RAM | Hardware |
|--------|---------|-------|-----|----------|
| `storyboard.ts` | Keyframe generation | ComfyUI | ~3GB | NVIDIA dGPU |

## Job Queue

The `job-queue.ts` enforces **serial processing** — critical for 6GB RAM hardware. Running AI jobs in parallel causes OOM.

```typescript
import { enqueueJob } from './ai/job-queue.js';

const jobId = await enqueueJob('image-gen', {
    prompt: 'cinematic sunset',
    outDir: 'output/scene_01',
    filename: 'generated.png',
    orientation: 'landscape'
});

// Check status
const result = getJobResult(jobId);
```

## Environment Variables

All modules are **OPTIONAL** and **OFF by default**. Set env vars to enable:

```bash
# ComfyUI (image generation)
COMFYUI_URL=http://127.0.0.1:8188
COMFYUI_MODEL=sd15

# CogVideoX (text-to-video)
COGVIDEO_SCRIPT=./scripts/cogvideo_generate.py

# AnimateDiff (image-to-video)
ANIMATEDIFF_TIMEOUT_MS=600000

# Real-ESRGAN (upscaling)
REALESRGAN_SCRIPT=./scripts/upscale.py
REALESRGAN_FACTOR=2

# rembg (background removal)
REMBG_SCRIPT=./scripts/remove_bg.py

# Beat-Sync
BEAT_SYNC_SCRIPT=./scripts/beat_detect.py

# CLIP Matching
CLIP_SCRIPT=./scripts/clip_match.py

# Script Enhancement (Ollama)
OLLAMA_SCRIPT_MODEL=qwen2.5:7b

# Translation
TRANSLATE_SCRIPT=./scripts/translate.py
WHISPER_MODEL=ggml-base.bin
NLLB_MODEL=nllb-200-distilled-600M
```

## Installation Guide

### ComfyUI Setup (for image-gen, I2V, storyboard, thumbnail)

```bash
# 1. Clone ComfyUI
git clone https://github.com/comfyanonymous/ComfyUI.git
cd ComfyUI

# 2. Install dependencies
pip install -r requirements.txt

# 3. Download SD1.5 model (smaller, works on 6GB)
mkdir -p models/checkpoints
# Download v1-5-pruned-emaonly.ckpt from HuggingFace

# 4. Start server
python main.py --lowvram --preview-method auto
```

### AnimateDiff Setup

```bash
cd ComfyUI
# Install AnimateDiff extension
cd custom_nodes
git clone https://github.com/ArtVentureX/ComfyUI-AnimateDiff.git
cd ComfyUI-AnimateDiff
pip install -r requirements.txt

# Download motion model
mkdir -p models/animatediff
# Download mm_sd_v15.ckpt
```

### CogVideoX Setup

```bash
pip install diffusers transformers accelerate torch
# Script will auto-download model on first run
```

### Real-ESRGAN Setup

```bash
pip install realesrgan basicsr
# Script will auto-download model on first run
```

### rembg Setup

```bash
pip install rembg
# Or for CPU-only: pip install rembg[cpu]
```

### Whisper.cpp Setup (for transcription)

```bash
git clone https://github.com/ggerganov/whisper.cpp.git
cd whisper.cpp
make
bash models/download-ggml-model.sh base
```

### NLLB Setup (for translation)

```bash
pip install transformers sentencepiece torch
# Model auto-downloads on first run
```

## Usage in Pipeline

The AI modules integrate into the existing `acquire.ts` fallback chain:

```typescript
// In acquire.ts
import { enqueueJob } from '../../lib/ai/job-queue.js';

// For local image generation
if (scene.visualPreference === 'gen-local') {
    enqueueJob('image-gen', { ... });
}

// For local video generation
if (scene.visualPreference === 'video-gen-local') {
    enqueueJob('video-gen', { ... });
}
```

## Graceful Fallback

Every module follows the pattern:
1. Try local AI (free, offline)
2. Fall back to API providers (if key configured)
3. Fall back to stock media
4. Fall back to placeholder (always works)

**A missing ComfyUI server never breaks a run.**

## Performance Notes

- **6GB RAM constraint**: Run ONE AI job at a time
- **Queue size**: Default 10 jobs max (`MAX_AI_QUEUE_SIZE`)
- **Timeouts**: Configure per-module (default 5-10 minutes)
- **GPU offload**: Set `CUDA_VISIBLE_DEVICES=0` to use dGPU
