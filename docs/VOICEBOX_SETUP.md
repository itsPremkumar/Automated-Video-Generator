---
title: Voicebox Setup & Integration — Automated Video Generator
description: >-
  Complete, step-by-step guide to installing, configuring, and running Jamie
  Pine's Voicebox as the local GPU-accelerated TTS engine for the Automated
  Video Generator pipeline. Covers one-time install, voice cloning, lifecycle
  auto-start, quality tuning, and troubleshooting.
---

# Voicebox — Complete Setup & Integration Guide

This document covers everything you need to get **Voicebox** running as the
Text-to-Speech engine for the Automated Video Generator pipeline, with **your
cloned voice**, **GPU acceleration**, and **automatic lifecycle management**.

**Quick status:** once configured per this guide, the pipeline auto-starts
Voicebox, generates narration in your cloned voice, and keeps the server
running for instant reuse. Zero manual steps per video.

---

## Table of Contents

1. [What is Voicebox?](#1-what-is-voicebox)
2. [System Requirements](#2-system-requirements)
3. [One-Time Installation](#3-one-time-installation)
4. [Voice Cloning — One-Time Setup](#4-voice-cloning--one-time-setup)
5. [Pipeline Integration (Env Vars)](#5-pipeline-integration-env-vars)
6. [How Auto-Start Works](#6-how-auto-start-works)
7. [Audio Quality Tuning](#7-audio-quality-tuning)
8. [Verification & Testing](#8-verification--testing)
9. [RAM/VRAM Budget & Management](#9-ramvram-budget--management)
10. [Troubleshooting](#10-troubleshooting)
11. [Env Vars Reference](#11-env-vars-reference)

---

## 1. What is Voicebox?

**Voicebox** (https://github.com/jamiepine/voicebox — MIT license, 44k★) is a
free, open-source, local-first AI voice studio. It bundles 7 TTS engines behind
one **headless FastAPI server** with a REST API. The key features:

- **Zero-shot voice cloning** — clone a voice from a few seconds of audio
- **GPU accelerated** — runs on NVIDIA RTX (CUDA) for fast inference
- **Headless mode** — no GUI needed, runs as a background server
- **Auto-lifecycle** — the generator pipeline starts/stops it automatically
- **7 engines bundled:** Qwen3-TTS, Chatterbox Multilingual, Chatterbox Turbo,
  LuxTTS, HumeAI TADA, Kokoro, and Qwen CustomVoice

---

## 2. System Requirements

### Minimum (Verified on this box)
| Component | Requirement |
|-----------|-------------|
| **OS** | Windows 10/11 |
| **GPU** | NVIDIA RTX 3050 (4 GB VRAM) or better |
| **RAM** | 6 GB total (system + GPU shared) |
| **Python** | 3.11 (via `uv`) |
| **CUDA** | 12.6 (or matching your pytorch version) |
| **Disk** | ~5 GB for Voicebox + models + cache |

### Recommended
| Component | Recommendation |
|-----------|---------------|
| **GPU** | RTX 3060+ (8+ GB VRAM) for larger engines like Qwen |
| **RAM** | 16 GB+ |
| **CUDA** | 12.6 |

---

## 3. One-Time Installation

### 3.1 Clone & venv setup

```bash
# Clone Voicebox (shallow = faster)
git clone --depth 1 https://github.com/jamiepine/voicebox.git C:/one/voicebox
cd C:/one/voicebox

# Create venv with uv (faster than pip)
uv venv --python 3.11 .venv

# Install CPU deps
env PYTHONPATH= uv pip install --python .venv/Scripts/python.exe \
  --extra-index-url https://download.pytorch.org/whl/cpu \
  -r requirements-minimal-cpu.txt

# Install CUDA pytorch (for GPU acceleration)
env PYTHONPATH= TMPDIR=C:/tmp UV_CACHE_DIR=C:/tmp/uvcache \
  uv pip install --python .venv/Scripts/python.exe \
  --index-url https://download.pytorch.org/whl/cu126 \
  "torch==2.13.0+cu126" "torchaudio==2.11.0+cu126"
```

> **⚠️ IMPORTANT:** Always run Voicebox commands with `PYTHONPATH=` cleared
> (empty). The Hermes agent sets `PYTHONPATH` to include its own venv, which
> contains a CPU-only pytorch. Clearing it ensures Voicebox uses its own
> CUDA-capable pytorch from its `.venv`.

### 3.2 Verify GPU detection

```bash
C:/one/voicebox/.venv/Scripts/python.exe -c "
import torch
print('CUDA available:', torch.cuda.is_available())
print('PyTorch:', torch.__version__)
"
```

Expected output:
```
CUDA available: True
PyTorch: 2.13.0+cu126
```

If `CUDA available: False`, check:
- Your NVIDIA driver is up to date
- CUDA 12.6 toolkit is installed (or matching your pytorch wheel)
- You ran with `PYTHONPATH=` cleared

### 3.3 Manual start test (before pipeline integration)

```bash
cd C:/one/voicebox
env PYTHONPATH= .venv/Scripts/python.exe -m backend.main \
  --host 127.0.0.1 --port 17493 --data-dir C:/one/voicebox/.voicebox-data
```

You should see in the log:
```
GPU: CUDA (NVIDIA GeForce RTX 3050 Laptop GPU)
Backend: PYTORCH
Ready
```

Keep this running and open a **second terminal** to continue.

---

## 4. Voice Cloning — One-Time Setup

Voicebox is **profile-based**. Every generation needs a registered voice profile.
For cloned voices (your real voice), you need to:

1. **Create a clone profile**
2. **Upload a reference audio sample** (10–30 seconds of clean speech)

### 4.1 Create a clone profile

```bash
curl -X POST http://127.0.0.1:17493/profiles \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Voice",
    "voice_type": "cloned",
    "default_engine": "chatterbox_turbo"
  }'
```

Response:
```json
{"id": "9d484367-edf8-427b-b0b3-1f7a38479229", "name": "My Voice", ...}
```

**Save the `id`** — this is your `VOICEBOX_PROFILE_ID`.

### 4.2 Upload a voice sample

Record yourself speaking clearly for 10–30 seconds. Read a paragraph naturally
— the transcript must be **word-for-word exact**.

```bash
curl -X POST \
  "http://127.0.0.1:17493/profiles/9d484367-edf8-427b-b0b3-1f7a38479229/samples" \
  -F "file=@C:/path/to/your-voice.wav" \
  -F "reference_text=The exact words you spoke in the audio clip verbatim."
```

### 4.3 Or use the bundled setup script

The project ships a helper script that does both steps:

```bash
cd C:/one/Automated-Video-Generator
node scripts/setup-voicebox-clone.mjs C:/path/to/your-voice.wav \
  "verbatim transcript of the clip"
```

### 4.4 Test the cloned voice

```bash
curl -s -X POST http://127.0.0.1:17493/speak \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello, this is my cloned voice speaking.",
    "profile": "9d484367-edf8-427b-b0b3-1f7a38479229",
    "engine": "chatterbox_turbo",
    "language": "en"
  }'
```

This returns a generation ID. Poll until `status:completed`, then download
the WAV:

```bash
# Poll status (replace <GENERATION_ID>)
curl -s "http://127.0.0.1:17493/generate/<GENERATION_ID>/status"
# Download audio when done
curl -s "http://127.0.0.1:17493/audio/<GENERATION_ID>" -o test_voice.wav
```

---

## 5. Pipeline Integration (Env Vars)

Set these in **`C:/one/Automated-Video-Generator/.env`**:

```env
# ─── Voicebox as active TTS provider ──────────────────────────────────────────
TTS_PROVIDER=voicebox

# ─── Voicebox API connection ──────────────────────────────────────────────────
VOICEBOX_API_URL=http://127.0.0.1:17493
VOICEBOX_ENGINE=chatterbox_turbo

# ─── Your cloned voice profile (from step 4) ──────────────────────────────────
VOICEBOX_PROFILE_ID=9d484367-edf8-427b-b0b3-1f7a38479229

# ─── Auto-start settings (pipeline spawns Voicebox if not already running) ────
VOICEBOX_BACKEND_DIR=C:/one/voicebox
VOICEBOX_PYTHON=C:/one/voicebox/.venv/Scripts/python.exe
```

> **What's safe to share?** `VOICEBOX_PROFILE_ID` is a UUID — it's a profile
> identifier, not a secret. Anyone with it can use your voice profile while
> your Voicebox server is running, so treat it like a local credential. The
> `PEXELS_API_KEY` IS a real API key — **never** commit it or share it.

### 5.1 Switching between engines

| Engine | Use Case | VRAM | Quality |
|--------|----------|------|---------|
| `chatterbox_turbo` | Cloned voice, fast | ~3.8 GB | Very high |
| `chatterbox` | Cloned voice, multilingual | ~3.2 GB | High |
| `kokoro` | Default narrator (no clone) | ~0.8 GB | Good |
| `qwen-3-tts` | High-quality narrator | ~3.6 GB | Excellent |

Change by editing `VOICEBOX_ENGINE` in `.env`.

---

## 6. How Auto-Start Works

The pipeline manages Voicebox's lifecycle automatically through
`src/lib/voicebox-lifecycle.ts`. Here's what happens when you run a video
generation:

```
[You run: npx tsx bin/agentic-run.ts --topic "Solar System"]

1. Pipeline starts, needs voiceover for scene 1
2. Calls ensureBackend() → checks if 127.0.0.1:17493 answers /models/status

   ┌─── If ALREADY RUNNING ───────────────────────────────────────┐
   │   → Uses existing server (instant, ~0.5s)                    │
   └───────────────────────────────────────────────────────────────┘

   ┌─── If NOT RUNNING (cold start) ───────────────────────────────┐
   │   → Spawns:                                                    │
   │     C:/one/voicebox/.venv/Scripts/python.exe                  │
   │       -m backend.main --host 127.0.0.1 --port 17493           │
   │     with PYTHONPATH= (to avoid CPU torch pollution)            │
   │   → Polls /models/status every 1s (up to 40s)                 │
   │   → Server starts on CUDA (~7-15s)                            │
   │   ✅ Voicebox is now ready                                     │
   └───────────────────────────────────────────────────────────────┘

3. POST /speak {text, profile, engine, language}
   → Model loads lazily on first call (~45s for chatterbox_turbo)
   → Subsequent scenes reuse the loaded model (instant)
4. Audio WAV returned and used in video render
5. Pipeline finishes → Voicebox stays running (detached:true)
   → Next pipeline run: instant reuse
```

### Key behaviors

| Behavior | Implementation |
|----------|---------------|
| **Auto-start on demand** | `ensureBackend()` spawns if not answering |
| **Server persistence** | `detached: true` — survives pipeline exit |
| **Clean PYTHONPATH** | `PYTHONPATH: ''` in spawn env (avoids CPU torch) |
| **Headless (no window)** | `windowsHide: true` |
| **Graceful fallback** | If Voicebox unreachable, falls back to Edge-TTS |
| **GPU acceleration** | Uses CUDA pytorch from Voicebox's own .venv |

---

## 7. Audio Quality Tuning

### 7.1 The audio quality fix (already applied)

The pipeline's renderer originally encoded audio at **~69 kbps AAC** (default
ffmpeg bitrate for mono), which made voice sound unclear and noisy. This has
been fixed — all three render paths now use **192 kbps AAC**:

| Render Path | Before | After | File |
|-------------|--------|-------|------|
| Per-segment encoding | ~69k (default) | **192k** | `render.ts:603` |
| Music+SFX mixing pass | 128k | **192k** | `render.ts:667` |
| Non-segmented render | 128k | **192k** | `render.ts:634` |

### 7.2 Voicebox output quality

| Setting | Default | Better | Best |
|---------|---------|--------|------|
| Engine | `chatterbox_turbo` | `qwen-3-tts`* | — |
| Sample rate | 24 kHz (native) | — | — |
| Audio pipeline | 192k AAC | — | — |

\* Qwen requires >4 GB VRAM.

### 7.3 If voice still sounds degraded

1. **Check audio bitrate in final video:**
   ```bash
   ffprobe -v error -select_streams a:0 -show_entries stream=bit_rate output.mp4
   ```
   Should show `> 160000` (160+ kbps).

2. **Check Voicebox WAV quality:**
   Extract and compare:
   ```bash
   ffprobe -v error -show_entries stream=sample_rate,bit_rate scene_voice.wav
   ```
   Should be `24000 Hz`, `384 kb/s`.

3. **Check for overlapping audio:** If SFX or music layers overlap the voice,
   the `audio-ducking` plugin should reduce music volume during speech. Verify
   in the pipeline log: `ducking=true`.

---

## 8. Verification & Testing

### 8.1 Quick health check

```bash
curl -s http://127.0.0.1:17493/health | python -m json.tool
```

Expected:
```json
{
  "status": "healthy",
  "gpu_available": true,
  "gpu_type": "CUDA (NVIDIA GeForce RTX 3050 Laptop GPU)",
  "backend_variant": "cuda"
}
```

### 8.2 Auto-start test (cold start)

Kill the server, then run the pipeline. It should auto-spawn:

```bash
# Kill any existing Voicebox
taskkill -F -PID <PID>

# Run pipeline — it auto-starts Voicebox
cd C:/one/Automated-Video-Generator
npx tsx bin/agentic-run.ts --topic "Quick test" --duration 10
```

Watch for:
```
[VOICEBOX-LIFECYCLE] spawning voicebox backend: ...
[VOICEBOX-LIFECYCLE] backend is up
[API-TTS] Voicebox synthesis: http://127.0.0.1:17493/speak
```

### 8.3 End-to-end generation

```bash
cd C:/one/Automated-Video-Generator
npx tsx bin/agentic-run.ts \
  --topic "Solar System" \
  --orientation portrait \
  --quality medium \
  --intro auto --outro auto \
  --sfx --backend agent
```

Check the output:
- **Audio bitrate:** Extract video → `ffprobe` → should show `>160 kbps`
- **Voice clarity:** Listen to the narration — should match your cloned voice
- **Log check:** `grep "VOICEBOX-LIFECYCLE\|API-TTS"` in the pipeline output

### 8.4 Unit tests

```bash
cd C:/one/Automated-Video-Generator
npm run test:unit  # TTS provider tests
```

---

## 9. RAM/VRAM Budget & Management

### VRAM usage by engine

| Engine | VRAM | Fits RTX 3050 (4 GB)? | Notes |
|--------|------|----------------------|-------|
| `kokoro` | ~0.8 GB | ✅ Comfortably | Default narrator, no cloning |
| `chatterbox` | ~3.2 GB | ✅ Yes | Multilingual clone |
| `chatterbox_turbo` | ~3.8 GB | ✅ Barely | Fast clone (used in this setup) |
| `qwen-3-tts` | ~3.6 GB | ⚠️ With OS overhead | Excellent quality |
| `qwen-custom-voice` | ~3.6 GB | ⚠️ | Custom voice clone |

### VRAM management

- **Engine loads lazily** on first `/speak` call — nothing loaded at server start
- **Stays warm in VRAM** after first generation for instant reuse
- **To free VRAM:** call `POST /models/unload` or stop the Voicebox server
- **On 6 GB total RAM / 4 GB VRAM laptop:** only run ONE engine at a time

### Lifecycle commands

```bash
# Unload current engine (frees VRAM, keeps server running)
curl -X POST http://127.0.0.1:17493/models/unload

# Unload all engines
curl -X POST http://127.0.0.1:17493/models/chatterbox_turbo/unload

# Kill server entirely (frees everything)
# Find PID: netstat -ano | grep 17493
taskkill -F -PID <PID>
```

---

## 10. Troubleshooting

### 10.1 "GPU: None (CPU only)" at startup

**Cause:** `PYTHONPATH` includes Hermes's venv which has a CPU-only pytorch.

**Fix:** Ensure Voicebox is spawned with `PYTHONPATH=` cleared. The pipeline
does this automatically (via `voicebox-lifecycle.ts`). If starting manually:

```bash
env PYTHONPATH= .venv/Scripts/python.exe -m backend.main
```

### 10.2 Voice sounds unclear / noisy

**Cause:** Low AAC audio bitrate in the render pipeline (was default ~69k).

**Fix:** Already applied — the pipeline now encodes at 192k AAC. Verify:

```bash
ffprobe -v error -select_streams a:0 -show_entries stream=bit_rate output.mp4
# Should be >160000 bps
```

### 10.3 Voicebox fails to start (ModuleNotFoundError)

**Cause:** The spawn `cwd` was set to `backend/` directory, but `python -m
backend.main` needs the Voicebox root directory.

**Fix:** Already applied — `cwd` is now the Voicebox root dir. If manually
debugging:

```bash
cd C:/one/voicebox   # NOT C:/one/voicebox/backend/
env PYTHONPATH= .venv/Scripts/python.exe -m backend.main
```

### 10.4 CUDA out of memory

**Cause:** Multiple engines loaded simultaneously, or Remotion rendering on
dGPU at the same time.

**Fix:**
1. Unload the current engine before loading a different one
2. Ensure Remotion uses the iGPU (Intel), not the dGPU (NVIDIA)
3. Switch to a lighter engine (`kokoro` = ~0.8 GB)
4. Close other GPU-using applications

### 10.5 Server won't die (port already in use)

```bash
# Find and kill any process on port 17493
netstat -ano | grep 17493 | grep LISTENING
taskkill -F -PID <PID>
```

### 10.6 Voice sample upload fails

- Ensure the reference transcript is **exact** (word-for-word)
- The audio file should be WAV or MP3, 10-30 seconds
- Speak clearly with minimal background noise
- Try the bundled script: `node scripts/setup-voicebox-clone.mjs`

---

## 11. Env Vars Reference

| Variable | Required? | Default | What it does |
|----------|-----------|---------|--------------|
| `TTS_PROVIDER` | ✅ | `edge-tts` | Set to `voicebox` to enable Voicebox TTS |
| `VOICEBOX_API_URL` | ✅ | `http://127.0.0.1:17493` | Voicebox server base URL |
| `VOICEBOX_ENGINE` | ✅ | `kokoro` | TTS engine: `chatterbox_turbo`, `chatterbox`, `kokoro`, `qwen-3-tts` |
| `VOICEBOX_PROFILE_ID` | ✅ | *(none)* | Your cloned voice profile UUID (from step 4) |
| `VOICEBOX_BACKEND_DIR` | ⚠️ For auto-start | `./voicebox` | Path to the cloned Voicebox repo |
| `VOICEBOX_PYTHON` | ⚠️ For auto-start | `<dir>/.venv/Scripts/python.exe` | Python interpreter in the Voicebox venv |
| `VOICEBOX_PORT` | ❌ | `17493` | Override the backend port |
| `VOICEBOX_API_URL` | ✅ | auto-set by lifecycle | Also used as the synthesis endpoint |

### What's safe to commit

| Env var | Safe in .env.example? | Notes |
|---------|----------------------|-------|
| `TTS_PROVIDER` | ✅ Yes | Just a choice string |
| `VOICEBOX_API_URL` | ✅ Yes | Localhost URL |
| `VOICEBOX_ENGINE` | ✅ Yes | Engine name |
| `VOICEBOX_PROFILE_ID` | ⚠️ No | Local credential — don't share your profile UUID |
| `VOICEBOX_BACKEND_DIR` | ✅ Yes | Local filesystem path |
| `VOICEBOX_PYTHON` | ✅ Yes | Local filesystem path |
| `VOICEBOX_PORT` | ✅ Yes | Port number |

> **Secret vars** (never commit or share): `PEXELS_API_KEY`, `GEMINI_API_KEY`,
> `OPENROUTER_API_KEY`, `VOICEBOX_PROFILE_ID` (it's a local credential —
> anyone with it can use your voice while your server runs).

---

## Appendix: Changed Files Since Integration

| File | Change | Purpose |
|------|--------|---------|
| `src/agentic/orchestrator/render.ts` | `-b:a 192k` (3 paths) | Fixed audio quality (was ~69k) |
| `src/lib/voicebox-lifecycle.ts` | `cwd: dir` | Fixed spawn directory for module discovery |
| `src/lib/voicebox-lifecycle.ts` | `detached: true` + `windowsHide: true` | Server persists after pipeline exit |
| `src/lib/voicebox-lifecycle.ts` | `PYTHONPATH: ''` | Ensures CUDA torch, not CPU torch |
| `.env` | Added `BACKEND_DIR` + `PYTHON` | Auto-start config |

---

*Last updated: July 2026 — verified on Windows 10, RTX 3050, CUDA 12.6, Voicebox v0.5.0*
