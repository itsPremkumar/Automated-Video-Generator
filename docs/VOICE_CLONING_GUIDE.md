---
title: Voice Cloning & Realistic TTS — Automated Video Generator
description: >
  Complete, license-verified guide to free, self-hosted, realistic voice cloning and
  Text-to-Speech engines for the Automated Video Generator agentic pipeline.
  Includes the full open-source model comparison, license analysis, RAM-fit guidance,
  and the recommended integration architecture.
---

# Local Voice Cloning & Realistic TTS — Full Documentation

This document is the authoritative reference for adding **realistic, human-like,
cloned voices** to the Automated Video Generator. Every claim here was verified
against the projects' actual GitHub/HuggingFace license files and model weights
(licenses, sizes, and maintenance status are real, not marketing copy).

---

## 1. Why this matters for the project

The generator's default voice engine is **Edge-TTS** (Microsoft cloud, free but
remote, no cloning, slightly robotic). To meet the project's zero-cost,
self-hosted, privacy-first, and **realistic human-voice cloning** goals, we use
**local-first TTS engines** that:

- run entirely on your machine (no API fees, no data leaves the box),
- are **license-clean** for an MIT-licensed project (MIT / Apache-2.0 only — no
  AGPL, no non-commercial, no MPL copyleft for the shipping path),
- expose a **CLI / REST / MCP** interface so the agentic pipeline
  (`orchestrate.ts`) can drive them headlessly,
- fit a **low-spec laptop** (this dev box: ~5.86 GB total RAM, often < 400 MB free).

---

## 2. The three providers already wired into the code

The pipeline already supports these via `TTS_PROVIDER` in `.env`. The wiring
lives in:

- `src/lib/api-tts-provider.ts` — REST client for each provider
- `src/lib/voice-generator.ts` — routes synthesis requests by provider
- `src/lib/voice-engine.ts` — `getVoiceEngineStatus()` health reporting
- `src/constants/config.ts` — env-var declarations

| Provider key | Engine | Default port | Clones? | Code status |
| :--- | :--- | :--- | :--- | :--- |
| `voicebox` | jamiepine/Voicebox (multi-engine) | `17493` | Yes (zero-shot) | ✅ Recommended |
| `xtts` | Coqui XTTS API server | `8020` | Yes (3s clip) | ⚠️ See §6 caveat |
| `openai-local` | Kokoro (OpenAI-compatible server) | `8880` | No (presets) | ✅ Default narrator |

### 2.1 Voicebox (recommended clone engine)

- **Repo:** https://github.com/jamiepine/voicebox — **MIT**, 42k★, actively
  maintained (pushed within the last week of writing).
- **What it is:** a local-first AI voice studio — a free/open-source alternative
  to ElevenLabs. It bundles **7 local TTS engines** (Qwen3-TTS, Qwen CustomVoice,
  LuxTTS, Chatterbox Multilingual, Chatterbox Turbo, HumeAI TADA, Kokoro) behind
  one **headless FastAPI server + built-in MCP server + REST API**.
- **Verified local-only:** I inspected `backend/backends/hume_backend.py` —
  the HumeAI TADA backend imports `torch` + a local DAC shim and makes **no
  cloud HTTP call / requires no API key**. All engines run on-device.
- **Cloning:** zero-shot from a few seconds of reference audio.
- **Config:**
  ```env
  TTS_PROVIDER=voicebox
  VOICEBOX_API_URL=http://localhost:17493
  VOICEBOX_PROFILE_ID=your_cloned_voice_profile_id
  ```
- **Usage:** open the Voicebox app, clone a voice profile, copy its profile ID,
  paste as `VOICEBOX_PROFILE_ID`. The pipeline calls `POST /speak` / `POST /generate`.

### 2.2 Kokoro (default narrator — `openai-local`)

- **Repo:** https://github.com/hexgrad/Kokoro-82M — **Apache-2.0**, model weights
  **312 MB** (fits the low-RAM box comfortably).
- **Cloning:** ❌ no — ships 50+ curated built-in voices (`af_sky`, `af_sarah`, …).
- **Role:** the always-on default narrator. Fast on CPU, tiny footprint.
- **Server:** run any OpenAI-compatible Kokoro server (e.g. `remsky/Kokoro-FastAPI`)
  and point the pipeline at it.
- **Config:**
  ```env
  TTS_PROVIDER=openai-local
  OPENAI_LOCAL_TTS_URL=http://localhost:8880/v1
  OPENAI_LOCAL_TTS_VOICE=af_sky
  OPENAI_LOCAL_TTS_MODEL=kokoro
  ```

### 2.3 XTTS (Coqui) — ⚠️ documented but NOT recommended for new builds

- **Repo:** `daswer123/xtts-api-server` wraps Coqui `coqui-ai/TTS` (XTTS).
- **Verified status (important):** the underlying **Coqui XTTS repo is archived /
  read-only (last meaningful commit ~2 years ago)** and is licensed **MPL-2.0**
  (file-level copyleft — not ideal for a clean MIT shipping path). It is also
  RAM-heavy (~1.5 GB).
- **Conclusion:** keep the wiring for backwards compatibility, but **do not adopt
  XTTS as a new clone engine**. Prefer Voicebox (which bundles Chatterbox/Qwen) or
  the standalone F5-TTS / Chatterbox options in §5.
- **Config (legacy only):**
  ```env
  TTS_PROVIDER=xtts
  XTTS_API_URL=http://localhost:8020
  XTTS_SPEAKER_WAV=test_ref.wav
  XTTS_LANGUAGE=en
  ```

---

## 3. Full open-source voice-model comparison (license-verified)

All sizes and licenses below were pulled live from GitHub / HuggingFace.

| # | Model | License | Size | Clones? | Langs | Quality | Maintained? | RAM fit (6 GB box) | Interface |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| 1 | **Kokoro** | Apache-2.0 | **312 MB** | ❌ presets | 8 | Good | ✅ | ✅ Comfortable | Lib / ONNX / HTTP |
| 2 | **F5-TTS** | **MIT** | **1.3 GB** | ✅ 10s ref | EN (+forks) | High | ✅ | ⚠️ on-demand | Lib / CLI |
| 3 | **Qwen3-TTS** (0.6B) | Apache-2.0 | 1.7 GB | ✅ + delivery | 10 | High | ✅ | ⚠️ on-demand | HF / server |
| 4 | **Chatterbox** | MIT | ~1.8 GB | ✅ few-sec | 23 | High | ✅ | ⚠️ on-demand + **HF gated (login)** | HTTP API / MCP |
| 5 | **GPT-SoVITS** | MIT | ~2–3 GB | ✅ 1–2s few-shot | 50+ | Very high | ✅ | ❌ heavy | GUI / API |
| 6 | **Voicebox (jamiepine)** | MIT | bundles 7 | ✅ few-sec | 23 | High (best-of-7) | ✅ | ⚠️ run light engine | **REST + MCP + headless** |
| 7 | **OpenVoice** | MIT | ~1 GB | ✅ | EN/JP/KR/ZH | Good | ❌ **stale Apr 2025** | ⚠️ edge but dead | Lib |
| 8 | **RVC** | MIT | ~1 GB | ❌ **conversion only** | many | High (VC) | ✅ | ⚠️ wrong job | GUI / API |
| 9 | **VibeVoice-ASR** | MIT | **15.9 GB** | n/a (transcribe) | 50+ | High (ASR) | ✅ | ❌ impossible here | HF / server |
| 10 | **VibeVoice-Realtime-0.5B** | MIT | 1.9 GB | ❌ fixed voices | EN + 9 exp. | Good | ✅ | ⚠️ edge, no clone | HF |
| 11 | **Coqui XTTS** | **MPL-2.0** | ~1.5 GB | ✅ | 16 | Good | ❌ **archived 2y** | ⚠️ | Lib |
| 12 | **Fish Speech** | **Non-commercial** ❌ | ~1 GB | ✅ | many | High | ✅ | ⚠️ | — |
| 13 | **OmniVoice Studio** | **AGPL** ❌ | — | ✅ | — | Good | ✅ | ⚠️ | GUI |
| 14 | ElevenLabs / Azure | Proprietary/paid ❌ | cloud | ✅ | many | High | — | n/a | Cloud API |

### License verdict (hard rule: MIT / Apache only)

- ✅ **Clean for an MIT project:** Kokoro (Apache), F5-TTS (MIT), Qwen3-TTS
  (Apache), Chatterbox (MIT), GPT-SoVITS (MIT), Voicebox (MIT), OpenVoice (MIT),
  RVC (MIT), VibeVoice family (MIT).
- ❌ **Rejected:** Fish Speech (non-commercial license — commercial use forbidden),
  OmniVoice (AGPL copyleft — would dominate the MIT project), Coqui XTTS
  (MPL-2.0 copyleft + dead), ElevenLabs / Azure (paid cloud, breaks zero-cost rule).

### Capability notes

- **Real zero/few-shot cloning:** F5-TTS, Qwen3-TTS, Chatterbox, GPT-SoVITS,
  Voicebox, OpenVoice.
- **NOT cloning:** Kokoro (fixed voices), VibeVoice (TTS code removed / fixed
  voices only), RVC (voice *conversion* of existing audio, not text→speech),
  VibeVoice-ASR (transcription only).
- **Multilingual cloning:** Qwen3-TTS, Chatterbox Multilingual (23 langs),
  GPT-SoVITS (50+), Voicebox (23 via bundled engines).

---

## 4. RAM-fit strategy for the low-spec laptop

This dev machine: **Total ≈ 5.86 GB, Free ≈ 390 MB, 280+ processes**. Model size
is the deciding filter.

- **Always-on default narrator → Kokoro (312 MB).** Fits with room to spare;
  CPU-fast; never starves the box.
- **Clone engine → load on-demand, then release.** F5-TTS (1.3 GB), Chatterbox
  (~1.8 GB), Qwen3-TTS (1.7 GB) must be loaded **only when a clone is requested**,
  then unloaded, so normal runs stay light.
- **Never on this box:** VibeVoice-ASR (15.9 GB), GPT-SoVITS full toolkit
  (~2–3 GB), running all 7 Voicebox engines simultaneously.
- **Voicebox practical config:** run the headless backend (`python -m backend.main`)
  with **Kokoro as the active engine** for default narration and a single clone
  engine (Chatterbox Turbo / Qwen3-TTS) loaded on demand.

---

## 5. Recommended architecture (best fit)

> **Run `jamiepine/voicebox` as a headless local voice microservice**, with
> **Kokoro as the default narrator** and a **clone engine (Chatterbox Turbo /
> Qwen3-TTS) loaded on demand**. All MIT/Apache, fully local, MCP + REST ready.

This is the cleanest agentic integration: one server, one REST/MCP surface, no
per-model plumbing. Your `orchestrate.ts` simply calls `POST /speak` with a cloned
profile.

**Standalone fallback (if you skip the heavy Voicebox app):**
- Lightest pure-clone path = **F5-TTS (MIT, 1.3 GB)** — maintained, lighter than
  Chatterbox, clean license. Wrap it in a small Python/HTTP service and call it
  from the pipeline the same way as the `openai-local` provider.

**Summary recommendation:**
- Default narrator: **Kokoro** (Apache, 312 MB).
- Clone engine (primary): **Voicebox** (MIT) → uses bundled Chatterbox/Qwen.
- Clone engine (standalone): **F5-TTS** (MIT, 1.3 GB).
- Multilingual clone backup: **Qwen3-TTS** (Apache).
- Few-shot extreme backup: **GPT-SoVITS** (MIT) — only if you have RAM headroom.
- Transcription helper (optional, not on this box): **VibeVoice-ASR** (MIT, 15.9 GB)
  or Whisper.cpp for word-timing.
- Cloud fallback: **Edge-TTS** (current default) when no local server is up.

---

## 6. Rejected / do-not-use (with reasons)

- **Fish Speech** — "Fish Audio Research License" is **non-commercial**; commercial
  use requires a separate paid license. Violates the project's free/commercial-MIT
  goal.
- **OmniVoice Studio** — **AGPL-3.0**; network use would force source disclosure
  incompatible with a clean MIT product.
- **Coqui XTTS** — **MPL-2.0** (file-level copyleft) **and archived/unmaintained
  (~2 years)**. Keep legacy wiring only; do not adopt for new builds.
- **OpenVoice** — MIT but **last push April 2025** (effectively dead). Avoid as a
  dependency.
- **RVC** — voice *conversion*, not text-to-speech; wrong tool for script→narration.
- **VibeVoice-TTS** — TTS code **removed** by Microsoft; unusable for cloning.
  VibeVoice-ASR is fine for transcription but 15.9 GB (won't run here).
- **ElevenLabs / Azure / cloud TTS** — paid, data-leaves-box; breaks zero-cost +
  privacy rules.

---

## 7. Code structure (current implementation)

- `src/lib/api-tts-provider.ts` — REST client for Voicebox (`VOICEBOX_API_URL`),
  XTTS (`XTTS_API_URL`), and OpenAI-compatible Kokoro (`OPENAI_LOCAL_TTS_URL`).
  Fetches the generated audio stream.
- `src/lib/voice-generator.ts` — routes synthesis through provider wrappers when
  `process.env.TTS_PROVIDER` matches `voicebox` / `xtts` / `openai-local`.
- `src/lib/voice-engine.ts` — `getVoiceEngineStatus()` returns active engine +
  readiness to health checks and the client.
- `src/constants/config.ts` — declares all `TTS_*` / `VOICEBOX_*` / `XTTS_*` /
  `OPENAI_LOCAL_TTS_*` env vars.

---

## 8. Setup & verification

### 8.1 Voicebox (recommended)

```bash
# clone + run headless backend (MIT)
git clone https://github.com/jamiepine/voicebox
cd voicebox/backend
pip install -r requirements.txt
python -m backend.main --host 127.0.0.1 --port 17493

# in another terminal, generate with a cloned profile via REST
curl -X POST http://127.0.0.1:17493/generate \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello world","profile_id":"<your-cloned-profile>","language":"en"}'
```

MCP: Voicebox ships a built-in MCP server (`backend/mcp_server/`) — register it
with any MCP-aware agent (Claude Code, Cursor, Cline) to let the agent speak in
your cloned voice.

### 8.2 Kokoro (default narrator)

```bash
docker run -p 8880:8880 ghcr.io/remsky/kokoro-fastapi:latest
# set .env: TTS_PROVIDER=openai-local, OPENAI_LOCAL_TTS_URL=http://localhost:8880/v1
```

### 8.3 Project wiring check

```bash
# unit tests (no live API)
npm run test:unit

# generate voices only (no render) — audio lands in public/jobs/<job_id>/audio/
npm run generate -- --segment
```

---

## 9. Decision checklist (pick your stack)

- Need **realistic cloned narration, zero cloud, MIT-clean, agentic-ready**?
  → **Voicebox headless server** (Kokoro default + Chatterbox/Qwen clone on demand).
- Want the **lightest single clone model** you control yourself?
  → **F5-TTS (MIT, 1.3 GB)** wrapped as an HTTP service.
- Need **many languages + delivery instructions** ("speak slowly")?
  → **Qwen3-TTS (Apache)** or Voicebox's bundled Qwen engine.
- Only need a **generic narrator, no cloning**?
  → **Kokoro (Apache, 312 MB)** — the safe always-on choice.
- **Never** use Fish Speech / OmniVoice / Coqui-XTTS / cloud TTS for the shipping path.

---

## 10. Voicebox headless integration (implemented)

Voicebox runs as a **separate, lifecycle-managed headless backend** (its own
Python process), NOT embedded in the Node pipeline. The pipeline owns its RAM
lifecycle so no TTS engine stays resident during Remotion render / asset-fetch.

### 10.1 Install (verified working on this box — RTX 3050 4 GB VRAM + CUDA 12.6)

```bash
git clone --depth 1 https://github.com/jamiepine/voicebox.git C:/one/voicebox
cd C:/one/voicebox

# 1. Create an ISOLATED venv. IMPORTANT: a global PYTHONPATH env var on this box
#    leaks the Hermes venv's site-packages into every python, so always run the
#    backend AND installs with `PYTHONPATH=` cleared (empty) to isolate.
#    Also: `python -m venv` is broken here (base python is itself a venv), use `uv`.
uv venv --python 3.11 .venv

# 2. Install CPU-side deps + the model backends. misaki[en] only (NOT [ja]/[zh])
#    — the [ja] extra pulls pyopenjtalk which needs cmake + a C compiler.
env PYTHONPATH= uv pip install --python .venv/Scripts/python.exe \
  --extra-index-url https://download.pytorch.org/whl/cpu \
  -r requirements-minimal-cpu.txt
# requirements-minimal-cpu.txt = fastapi/uvicorn + transformers + kokoro +
#   misaki[en] + spacy(en_core_web_sm) + fastmcp + pedalboard + pydub + PIL +
#   qwen-tts + soundfile + numpy + scipy. (If a download times out, re-run — uv resumes.)
#   NOTE: qwen-tts pulls an old huggingface-hub (1.2.3); that's fine once PYTHONPATH
#   is cleared so the venv resolves its own pinned version, not Hermes's.

# 3. GPU: install CUDA torch so models load into VRAM, not system RAM.
#    This is what makes it work on a 6 GB-RAM / 4 GB-VRAM laptop — on CPU-only
#    the 3.5 GB Qwen model OOMs; on GPU, Kokoro-82M uses ~800 MB VRAM.
env PYTHONPATH= TMPDIR=C:/tmp UV_CACHE_DIR=C:/tmp/uvcache \
  uv pip install --python .venv/Scripts/python.exe \
  --index-url https://download.pytorch.org/whl/cu126 "torch==2.13.0+cu126" "torchaudio==2.11.0+cu126"
# Verify:  .venv/Scripts/python.exe -c "import torch; print(torch.cuda.is_available())" -> True
```

> **Why GPU matters here:** The `/models/load` endpoint is Qwen-only (it calls
> `load_model_async` → `qwen-tts-{size}`). Kokoro and the clone engines load
> **lazily on first `/speak`** via `get_tts_backend_for_engine`. Kokoro-82M
> (`hexgrad/Kokoro-82M`, ~350 MB) is the lightest and the recommended narration
> engine; it loads into VRAM on a CUDA box. Qwen 1.7B (3.6 GB) needs GPU VRAM —
> it will NOT fit a 4 GB card alongside the OS, so use Kokoro for narration.

### 10.2 Run headless (no GUI = saves RAM)

```bash
cd C:/one/voicebox
env PYTHONPATH= .venv/Scripts/python.exe -m backend.main \
  --host 127.0.0.1 --port 17493 --data-dir C:/one/voicebox/.voicebox-data
# backend log prints:  GPU: CUDA (NVIDIA GeForce RTX 3050 Laptop GPU); Ready
```

`src/lib/voicebox-lifecycle.ts` `ensureBackend()` spawns exactly this command
(with `PYTHONPATH=` cleared) if the port isn't answering — so the pipeline can
own the full lifecycle.

### 10.3 Synthesis flow (verified end-to-end)

Voicebox is **profile-based**: every generation needs a voice profile. Create a
**Kokoro PRESET profile** (no reference audio needed) once:

```bash
curl -X POST http://127.0.0.1:17493/profiles -H "Content-Type: application/json" \
  -d '{"name":"Narrator (Kokoro Heart)","voice_type":"preset",
       "preset_engine":"kokoro","preset_voice_id":"af_heart","default_engine":"kokoro"}'
# -> {"id":"<PROFILE_ID>", ...}   (set VOICEBOX_PROFILE_ID=<PROFILE_ID>)
```

Then the pipeline drives it (see `src/lib/api-tts-provider.ts`):

1. `POST /speak` `{ text, profile, engine:"kokoro", language }` → `{ id, status:"generating" }`
2. poll `GET /generate/{id}/status` (SSE stream) until `status:"completed"`
3. `GET /audio/{id}` → WAV (24 kHz mono PCM) written to the job's audio dir

No manual `/models/load` is needed — the engine loads lazily into VRAM on the
first `/speak`. This was proven on this box: a 5.3 s WAV synthesized via
Kokoro-82M on the RTX 3050 (819 MB VRAM used, system RAM untouched).

### 10.4 Env vars
| Var | Default | Purpose |
| :--- | :--- | :--- |
| `TTS_PROVIDER` | `edge-tts` | set `voicebox` to use this path |
| `VOICEBOX_API_URL` | `http://127.0.0.1:17493` | backend base URL |
| `VOICEBOX_BACKEND_DIR` | `C:/one/voicebox` | repo dir (for spawn) |
| `VOICEBOX_PYTHON` | `<dir>/.venv/Scripts/python.exe` | interpreter |
| `VOICEBOX_ENGINE` | `kokoro` | engine for narration (`chatterbox-turbo` for clone) |
| `VOICEBOX_PROFILE_ID` | — | **required** — the Kokoro preset or cloned profile |
| `VOICEBOX_API_URL` is also auto-set to `ws://`/HTTP by lifecycle if spawned |

### 10.5 RAM/VRAM budget on this box (RTX 3050 4 GB VRAM)
- **Kokoro-82M (recommended):** ~800 MB VRAM, ~0 system RAM — fits comfortably,
  even with the Remotion render running on the iGPU.
- **Clone engine (Chatterbox-Turbo ~1.5 GB / Qwen 1.7B ~3.6 GB):** load **only
  for the clone job** on GPU; for Qwen you need >4 GB VRAM (use a bigger card or
  the smaller Chatterbox-Turbo). Never keep two engines resident.
- Always launch with `PYTHONPATH=` cleared so the backend uses only `.venv`.

### 10.6 Lifecycle (managed automatically by the pipeline)
`src/lib/voicebox-lifecycle.ts`:
- `ensureBackend()` — spawns `env PYTHONPATH= .venv/Scripts/python.exe -m backend.main`
  (the §10.2 command) if not already answering `/models/status`; bounded 40 s poll.
- `isRunning()` / `killBackend()` — health + terminate the process (zero RAM until next run).

`src/lib/api-tts-provider.ts` `generateVoiceoverWithVoicebox()`:
- wakes the backend, `POST /speak` (profile + engine), **polls** the async status
  to completion, then `GET /audio/{id}` → WAV. No manual engine unload needed
  (the model stays warm in VRAM for the next segment; kill the backend to free it).
- fails safe: if backend unreachable / no `VOICEBOX_PROFILE_ID` / engine can't
  load, it throws and the caller (`voice-generator.ts`) falls back to Edge-TTS.

### 10.7 Clone YOUR real voice (end-to-end, verified on this box)

Voicebox is **profile-based**: narration runs through a *voice profile*. For a
cloned voice you register a `cloned` profile, give it a ~10-30s reference clip of
your real voice, then point the pipeline at that profile. Verified working on the
RTX 3050: a Chatterbox-Turbo clone generated a 4.96s clip in your (placeholder)
voice using ~3.8 GB VRAM.

**One-time registration** (backend must be running, see §10.2):

```bash
# 1. Create a CLONED profile backed by chatterbox-turbo (MIT, ~4GB VRAM footprint)
curl -X POST http://127.0.0.1:17493/profiles -H "Content-Type: application/json" \
  -d '{"name":"My Real Voice","voice_type":"cloned","default_engine":"chatterbox_turbo"}'
# -> {"id":"<CLONE_PROFILE_ID>", ...}

# 2. Upload a clean 10-30s clip of YOUR voice + verbatim transcript
curl -X POST http://127.0.0.1:17493/profiles/<CLONE_PROFILE_ID>/samples \
  -F "file=@C:/path/to/your-voice.wav" \
  -F "reference_text=the exact words you spoke in the clip"
```

**Or use the bundled setup script** (does both steps + writes `.env`):

```bash
node scripts/setup-voicebox-clone.mjs C:/path/to/your-voice.wav "verbatim transcript of the clip"
```

Then `.env` already has (set during integration):

```
TTS_PROVIDER=voicebox
VOICEBOX_API_URL=http://127.0.0.1:17493
VOICEBOX_ENGINE=chatterbox_turbo
VOICEBOX_PROFILE_ID=<your cloned profile id>
```

The agentic pipeline (`src/lib/voice-generator.ts` → `generateVoiceoverWithVoicebox`)
now narrates EVERY scene in your cloned voice. Each scene: `POST /speak`
{text, profile, engine:"chatterbox_turbo"} → poll status → `GET /audio/{id}` → WAV.

**VRAM note:** Chatterbox-Turbo is ~4 GB; on the 4 GB RTX 3050 it loads at
~3.8 GB (OS + CUDA overhead leaves little headroom). It fits, but do NOT also run
the Remotion GPU render on the dGPU simultaneously — let Voicebox use the dGPU,
Remotion uses the iGPU. If you hit CUDA OOM, switch `VOICEBOX_ENGINE` to
`chatterbox` (multilingual, ~3.2 GB) or use the lighter Kokoro narrator
(`VOICEBOX_ENGINE=kokoro` + a Kokoro **preset** profile — no cloning, ~0.8 GB VRAM).
