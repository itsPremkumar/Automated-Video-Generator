# Environment Variables

This is the consolidated reference for configuration via environment
variables. Most have safe defaults and need not be set for local use. Secrets
(`GEMINI_API_KEY`, `PEXELS_API_KEY`, `YOUTUBE_API_KEY`, `VOICEBOX_PROFILE_ID`)
belong in `.env` (git-ignored) — see `.env.example`. **Never commit real
values.** The app redacts secret-shaped values from logs and error responses.

## Server / networking
| Variable | Default | Purpose |
|---|---|---|
| `PORT` / `HOST` | `3001` / `0.0.0.0` | HTTP server bind. |
| `AVG_PORT` / `AVG_PORT_IGNORE_ENV` | — | Alternate port override + ignore-env flag. |
| `ALLOWED_ORIGINS` | — | Comma-separated CORS allow-list (loopback auto-allowed). |
| `TRUST_PROXY` | — | Enable `express` proxy trust (set behind a reverse proxy). |
| `ALLOW_UNSAFE_REMOTE_ADMIN` | `0` | If `1`, disable the local-only admin gate (DANGER — LAN exposure). |
| `ALLOW_UNSAFE_MCP_TOOLS` | — | Expose potentially-destructive MCP tools. |
| `EXPOSE_HEALTH_DETAILS` | — | Include verbose info in `/api/health`. |

## Jobs / concurrency
| Variable | Default | Purpose |
|---|---|---|
| `MAX_CONCURRENT_JOBS` | — | Cap parallel agentic jobs. |
| `AVG_BATCH_MAX_RETRIES` | — | Retries for batch runs. |
| `AUTOMATED_VIDEO_GENERATOR_DATA_ROOT` | project root | Override data/workspace root (Electron/container). |

## Media fetching / download
| Variable | Default | Purpose |
|---|---|---|
| `PEXELS_API_KEY` | — | Pexels stock video/image source. |
| `YOUTUBE_API_KEY` | — | YouTube metadata source. |
| `OPENVERSE_ENABLED` | — | Enable Openverse source. |
| `MAX_DOWNLOAD_BYTES` | — | Reject oversized downloads. |
| `DOWNLOAD_STALL_TIMEOUT_MS` / `FREE_VIDEO_DOWNLOAD_STALL_TIMEOUT_MS` | — | Stall guard for streamed downloads. |
| `AGENTIC_FFMPEG_TIMEOUT_MS` / `AGENTIC_FFPROBE_TIMEOUT_MS` | `30000`/`15000` | ffmpeg/ffprobe hard timeout. |

## AI verification (opt-in)
| Variable | Default | Purpose |
|---|---|---|
| `MEDIA_VERIFICATION_ENABLED` | `true` | Master toggle for AI vision checks. |
| `MEDIA_VERIFICATION_CONFIDENCE` | `6` | Min confidence (0-10) to pass. |
| `AI_PROVIDER` | `ollama` | `ollama` or `gemini`. |
| `GEMINI_API_KEY` | — | Required for `gemini` provider. |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Model id. |
| `GEMINI_TIMEOUT_MS` / `GEMINI_MAX_RETRIES` / `GEMINI_MAX_CONCURRENCY` | — | Gemini call tuning. |

## Voice / TTS
| Variable | Default | Purpose |
|---|---|---|
| `TTS_PROVIDER` | `edge` | `edge` (free) or `voicebox` (GPU clone). |
| `VOICEBOX_ENGINE` / `VOICEBOX_PROFILE_ID` | — | Voicebox engine + profile (keep in `.env`). |
| `EDGE_TTS_PATH` | — | Path to edge-tts venv python if not on PATH. |

## Rendering / audio
| Variable | Default | Purpose |
|---|---|---|
| `AGENTIC_RENDER_SOFTEN` / `AGENTIC_SEGMENTED` / `AGENTIC_NORMALIZE_MUSIC` | — | Render knobs. |
| `AGENTIC_KEEP_WORKSPACES` | — | Keep temp workspaces after run. |
| `AUDIO_DUCK_LEVEL` / `AUDIO_FULL_LEVEL` | — | Ducking levels. |
| `AUTO_FREE_MUSIC` | — | Auto-pick royalty-free music. |
| `CHROME_EXECUTABLE` | — | Remotion/Chrome path. |
| `BRAIN_TIMEOUT_MS` | — | Agent brain (LLM) timeout. |

> The full list is resolved in `src/constants/config.ts` and
> `src/agentic/config.ts`. This table documents the user-facing surface; the
> Electron/desktop vars (`ELECTRON_*`) are for the packaged app only.
