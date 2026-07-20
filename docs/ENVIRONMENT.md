# Environment Variables

Consolidated reference for all environment variables consumed by the
Automated Video Generator. Most have safe defaults and need not be set for
local use. Secrets (`GEMINI_API_KEY`, `PEXELS_API_KEY`, `VOICEBOX_PROFILE_ID`,
`OPENROUTER_API_KEY`) belong in `.env` (git-ignored) — see `.env.example`.
**Never commit real values.** The app redacts secret-shaped values from logs
and error responses.

---

## Server / Networking

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3001` | HTTP server bind port. Resolution order: `AVG_PORT` > `.env` `PORT` > `3001`. Ambient `process.env.PORT` from the shell is intentionally ignored unless `AVG_PORT` is set. |
| `HOST` | `127.0.0.1` | HTTP server bind address. |
| `AVG_PORT` | — | Explicit port override. When set, takes priority over both `PORT` and ambient shell `PORT`. |
| `AVG_PORT_IGNORE_ENV` | — | When set to any truthy value, skip reading `PORT` from `.env` entirely (only use `AVG_PORT` or hard default `3001`). |
| `ALLOWED_ORIGINS` | — | Comma-separated CORS allow-list. Loopback origins are auto-allowed. |
| `TRUST_PROXY` | — | Set to `1` to enable Express `trust proxy` (needed behind a reverse proxy). |
| `ALLOW_UNSAFE_REMOTE_ADMIN` | `0` | Set to `1` to disable the local-only admin gate. **DANGER — exposes admin endpoints to LAN.** |
| `ALLOW_UNSAFE_MCP_TOOLS` | — | Set to `1` to expose potentially destructive MCP tools. |
| `EXPOSE_HEALTH_DETAILS` | — | Set to `1` to include verbose system info in `/api/health` responses (beyond local-only default). |
| `PUBLIC_BASE_URL` | — | Canonical public URL (e.g. `https://your-domain.example`). Used for sitemap.xml, robots.txt, social metadata, and canonical links. |

## Jobs / Concurrency

| Variable | Default | Purpose |
|---|---|---|
| `MAX_CONCURRENT_JOBS` | `1` | Cap on parallel agentic pipeline jobs. |
| `AVG_BATCH_MAX_RETRIES` | — | Retry count for batch runs. |
| `AUTOMATED_VIDEO_GENERATOR_DATA_ROOT` | project root (or Electron `userData`) | Override data/workspace root for alternate runtime environments (Electron, containers). |

## Media Fetching / Download

| Variable | Default | Purpose |
|---|---|---|
| `PEXELS_API_KEY` | — | Pexels API key for stock video and image source. Get one at https://www.pexels.com/api/ |
| `PIXABAY_API_KEY` | — | Pixabay API key for alternative stock media. |
| `YOUTUBE_API_KEY` | — | YouTube metadata source. |
| `OPENVERSE_ENABLED` | `true` | Enable Openverse CC-licensed image fallback (no API key required). Set to `false` to disable. |
| `MAX_DOWNLOAD_BYTES` | `157286400` (150 MB) | Reject downloads exceeding this byte limit. |
| `DOWNLOAD_STALL_TIMEOUT_MS` | `30000` | Stall guard timeout for streamed downloads (milliseconds). |
| `FREE_VIDEO_DOWNLOAD_STALL_TIMEOUT_MS` | `30000` | Stall guard timeout specifically for free video sources. |
| `AGENTIC_FFMPEG_TIMEOUT_MS` | `30000` | Hard timeout for ffmpeg operations in the agentic pipeline (milliseconds). |
| `AGENTIC_FFPROBE_TIMEOUT_MS` | `15000` | Hard timeout for ffprobe operations (milliseconds). |

## AI Verification

| Variable | Default | Purpose |
|---|---|---|
| `MEDIA_VERIFICATION_ENABLED` | `true` | Master toggle for AI vision-based media checks. Set to `false` to skip verification. |
| `MEDIA_VERIFICATION_CONFIDENCE` | `6` | Minimum confidence score (1–10) required for an asset to pass verification. |
| `VERIFY_PASS` | `7` | Minimum confidence threshold (1–10) used by the agentic pipeline's verification gate. |
| `AI_PROVIDER` | `ollama` | AI backend provider: `ollama` (local, free) or `gemini` (cloud API key required). |
| `GEMINI_API_KEY` | — | Google Gemini API key (required when `AI_PROVIDER=gemini`). Get one at https://aistudio.google.com/app/apikey |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Gemini model identifier. |
| `GEMINI_TIMEOUT_MS` | `30000` | Timeout for Gemini API calls (milliseconds). |
| `GEMINI_MAX_RETRIES` | `2` | Maximum retries for failed Gemini API calls. |
| `GEMINI_MAX_CONCURRENCY` | `2` | Maximum concurrent Gemini API calls. |

## Ollama (Local AI)

| Variable | Default | Purpose |
|---|---|---|
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Ollama server URL. |
| `OLLAMA_URL` | — | Alternate Ollama URL used by the agentic brain (falls back to Ollama not configured when absent). |
| `OLLAMA_HOST` | `http://127.0.0.1:11434` | Ollama host URL (used by the sub-modules/free-video-gen-lab sub-project). |
| `OLLAMA_MODEL` | `moondream:latest` | Ollama model for vision-based media verification. Agentic brain defaults to `llama3.1`. |
| `OLLAMA_SCRIPT_MODEL` | `llama3.2:1b` (or falls back to `OLLAMA_MODEL` / `llama3`) | Ollama model used for script generation (sub-modules/free-video-gen-lab) and AI service calls. |
| `OLLAMA_TIMEOUT_MS` | `120000` | Timeout for Ollama API calls (milliseconds). |
| `OLLAMA_MAX_RETRIES` | `2` | Maximum retries for failed Ollama API calls. |
| `OLLAMA_MAX_CONCURRENCY` | `2` | Maximum concurrent Ollama API calls. |
| `OLLAMA_AUTOSTART` | `true` | Automatically start the Ollama process when needed. |
| `OLLAMA_AUTOPULL` | `true` | Automatically pull missing models from Ollama registry. |

## Voice / TTS Providers

| Variable | Default | Purpose |
|---|---|---|
| `TTS_PROVIDER` | `edge-tts` | Voice synthesis backend: `edge-tts`, `voicebox`, `xtts`, or `openai-local`. |
| `EDGE_TTS_PATH` | — | Absolute path to the edge-tts Python executable (or venv python) if not on PATH. |
| `VOICEBOX_API_URL` | `http://127.0.0.1:17493` | Voicebox backend API URL. |
| `VOICEBOX_ENGINE` | `kokoro` | Voicebox TTS engine (e.g. `kokoro`, `chatterbox_turbo`). |
| `VOICEBOX_PROFILE_ID` | — | Voicebox voice profile ID. Keep in `.env` — the placeholder `<your-voicebox-profile-id-here>` is treated as unset. |
| `VOICEBOX_BACKEND_DIR` | `voicebox/` (relative to cwd) | Directory containing the Voicebox backend source. |
| `VOICEBOX_PYTHON` | `<backendDir>/.venv/Scripts/python.exe` | Path to the Python executable for the Voicebox backend. |
| `VOICEBOX_PORT` | `17493` | Port for the Voicebox backend server. |
| `XTTS_API_URL` | `http://127.0.0.1:8020` | Local XTTS API server URL. |
| `XTTS_SPEAKER_WAV` | `cloned_speaker.wav` | Speaker reference WAV file for XTTS voice cloning. |
| `XTTS_LANGUAGE` | `en` | Language code for XTTS synthesis. |
| `OPENAI_LOCAL_TTS_URL` | `http://127.0.0.1:8880/v1` | OpenAI-compatible / Kokoro-FastAPI local TTS endpoint URL. |
| `OPENAI_LOCAL_TTS_VOICE` | `af_sky` | Voice identifier for the OpenAI-compatible TTS endpoint. |
| `OPENAI_LOCAL_TTS_MODEL` | `kokoro` | Model name for the OpenAI-compatible TTS endpoint. |
| `OPENAI_LOCAL_TTS_API_KEY` | `mock-key` | API key for the OpenAI-compatible TTS endpoint (most local servers accept any value). |

## Rendering / Audio

| Variable | Default | Purpose |
|---|---|---|
| `AGENTIC_RENDER_SOFTEN` | — | Set to `1` to enable softer/higher-quality render settings. |
| `AGENTIC_SEGMENTED` | `1` (enabled) | Set to `0` to disable segmented rendering. |
| `AGENTIC_NORMALIZE_MUSIC` | — | Set to `1` to enable music normalization in the render pipeline. |
| `AGENTIC_KEEP_WORKSPACES` | `25` | Maximum number of temporary workspaces to retain after pipeline runs. |
| `AUDIO_DUCK_LEVEL` | `0.06` | Ducking level for background music when voiceover is active (linear gain). |
| `AUDIO_FULL_LEVEL` | `0.18` | Full volume level for background music during silence (linear gain). |
| `AUTO_FREE_MUSIC` | `true` | Automatically select royalty-free background music when no music query is specified. |
| `CHROME_EXECUTABLE` | — | Absolute path to Chrome/Chromium binary for Remotion rendering. When set, Remotion uses this instead of auto-downloading a browser. |
| `BRAIN_TIMEOUT_MS` | `20000` | Timeout for agentic brain LLM calls (milliseconds). |
| `DEBUG_FF` | — | Set to `1` to enable verbose ffmpeg stderr logging during rendering. |
| `BACKGROUND_MUSIC` | — | Path or identifier for default background music track. |
| `BACKGROUND_MUSIC_VOLUME` | — | Volume level for default background music. |

## Video Defaults

| Variable | Default | Purpose |
|---|---|---|
| `VIDEO_ORIENTATION` | `landscape` (web portal CLI) | Default output orientation: `landscape` (16:9) or `portrait` (9:16). |
| `VIDEO_VOICE` | `en-US-GuyNeural` | Default Edge-TTS neural voice for voiceover. |
| `OUTPUT_DIR` | `<project>/output` | Custom output directory for generated videos. |
| `REMOTION_BROWSER_EXECUTABLE` | — | Absolute path to Chrome/Chromium for Remotion composition selection and rendering. |
| `REMOTION_DISABLE_WEB_SECURITY` | — | Set to `1` to disable Chrome web security for Remotion rendering. |

## OpenRouter (Agentic Brain)

| Variable | Default | Purpose |
|---|---|---|
| `OPENROUTER_API_KEY` | — | API key for OpenRouter (enables cloud LLM calls from the agentic brain). |
| `OPENROUTER_MODEL` | `meta-llama/llama-3.1-8b-instruct:free` | OpenRouter text model for the agentic brain. |
| `OPENROUTER_VISION_MODEL` | `google/gemini-2.0-flash-thinking-exp-1219:free` | OpenRouter vision-capable model for visual analysis. |

## Debug / Electron

| Variable | Default | Purpose |
|---|---|---|
| `AUTOMATED_VIDEO_GENERATOR_DEBUG` | — | Set to `1` to enable debug runtime features in Electron. |
| `AUTOMATED_VIDEO_GENERATOR_OPEN_DEVTOOLS` | — | Set to `1` to auto-open DevTools in Electron. |
| `AUTOMATED_VIDEO_GENERATOR_REMOTE_DEBUG_PORT` | `9222` | Remote debugging port for Electron. |
| `AUTOMATED_VIDEO_GENERATOR_MCP` | — | Set to `1` (done automatically by MCP init) to signal MCP mode; affects path resolution and tool availability. |
| `AUTOMATED_VIDEO_GENERATOR_DATA_ROOT` | project root (or Electron `userData`) | Override data/workspace root. |
| `ELECTRON_BACKEND_SERVER` | — | Set internally by the Electron backend server process. |
| `ELECTRON_RESOURCES_PATH` | — | Set internally to the Electron `resourcesPath`. |
| `REMOTION_TMPDIR` | — | Set internally by the render process for Remotion temporary files. |

---

> The full resolution logic for most env vars lives in `src/constants/config.ts`,
> `src/agentic/brain.ts`, `src/lib/ollama-client.ts`, `src/lib/api-tts-provider.ts`,
> `src/lib/voicebox-lifecycle.ts`, and `src/lib/visual-fetcher.ts`. This table
> documents the complete user-facing surface.
