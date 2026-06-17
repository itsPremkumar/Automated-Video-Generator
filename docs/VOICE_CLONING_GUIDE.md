---
title: Voice Cloning Guide — Automated Video Generator
description: Set up local voice cloning and realistic TTS engines in Automated Video Generator. Free, private, high-quality voice synthesis.
---
# Local Voice Cloning & Realistic TTS Integration Guide

This guide covers setting up, configuring, and running high-quality, completely free, and local voice cloning/realistic Text-to-Speech (TTS) engines within the **Automated Video Generator**.

---

## 🌟 Overview

By default, the video generator uses **Edge-TTS**, which sounds clear but can carry a slightly robotic or computer-like tone. To generate highly expressive, real human-like voices and clone custom voices locally, you can use three newly integrated local-first providers:

| Provider | Best For | Typical Port | Voice Cloning |
| :--- | :--- | :--- | :--- |
| **Jamie Pine's Voicebox** | User-friendly UI, multi-engine quality | `17493` | Yes (Zero-shot) |
| **XTTS Local Server** | Fast, light local cloning | `8020` | Yes (3-second clip) |
| **Kokoro-FastAPI** | Blazing fast, premium quality | `8880` | Native presets |

---

## ⚙️ Configuration Setup

To enable a local realistic voice engine, open your [.env](file:///C:/one/Automated-Video-Generator/.env) file and configure the `TTS_PROVIDER` parameter along with the corresponding settings below:

### 1. Jamie Pine's Voicebox Setup
* **App URL**: [https://github.com/jamiepine/voicebox](https://github.com/jamiepine/voicebox)
* **Configuration**:
  ```env
  TTS_PROVIDER=voicebox
  VOICEBOX_API_URL=http://localhost:17493
  VOICEBOX_PROFILE_ID=your_cloned_voice_profile_id
  ```
* **How it works**: Open the Voicebox desktop app, create/clone a voice profile, copy its profile ID, and paste it as `VOICEBOX_PROFILE_ID`.

### 2. XTTS Local API Server Setup
* **App URL**: [https://github.com/daswer123/xtts-api-server](https://github.com/daswer123/xtts-api-server)
* **Configuration**:
  ```env
  TTS_PROVIDER=xtts
  XTTS_API_URL=http://localhost:8020
  XTTS_SPEAKER_WAV=test_ref.wav
  XTTS_LANGUAGE=en
  ```
* **How it works**: Install the server (`pip install xtts-api-server`), place your speaker wav file (e.g. [test_ref.wav](file:///C:/one/Automated-Video-Generator/input/voice/test_ref.wav)) inside the server's configured `speakers/` folder, and configure `.env` accordingly.

### 3. OpenAI-Compatible Kokoro Setup
* **App URL**: [https://github.com/remsky/Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI)
* **Configuration**:
  ```env
  TTS_PROVIDER=openai-local
  OPENAI_LOCAL_TTS_URL=http://localhost:8880/v1
  OPENAI_LOCAL_TTS_VOICE=af_sky
  OPENAI_LOCAL_TTS_MODEL=kokoro
  ```
* **How it works**: Spin up the Kokoro-FastAPI docker/local server, select one of the highly realistic native voices (e.g., `af_sky`, `af_sarah`), and configure `.env`.

---

## 🛠️ Code Structure

- **API Interface**: [api-tts-provider.ts](file:///C:/one/Automated-Video-Generator/src/lib/api-tts-provider.ts) handles REST communication with the local servers and fetches the generated audio stream.
- **Main Pipeline**: [voice-generator.ts](file:///C:/one/Automated-Video-Generator/src/lib/voice-generator.ts) routes the synthesis requests through provider wrappers when `process.env.TTS_PROVIDER` matches one of the custom keys.
- **State Reporting**: [voice-engine.ts](file:///C:/one/Automated-Video-Generator/src/lib/voice-engine.ts) updates the internal `getVoiceEngineStatus()` to return active engine properties back to the client and system health checks.

---

## 🧪 Testing & Validation

### Running Unit Tests
Validate that the provider integrations work correctly without contacting the live API:
```bash
npm run test:unit
```

### Running the CLI Video Generator
Process scripts from [input-scripts.json](file:///C:/one/Automated-Video-Generator/input/input-scripts.json):
```bash
npm run generate
```

### timeline/Asset Inspection (No Render)
To generate the voiceover files without compiling the final video (preserving the audio files inside `public/jobs/<job_id>/audio/`):
```bash
npm run generate -- --segment
```
