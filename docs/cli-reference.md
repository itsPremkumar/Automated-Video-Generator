# CLI Reference

## npm Scripts

All commands are run via `npm run <script>` from the project root.

### Generation (Legacy Workflow)

| Script | Command | Description |
|--------|---------|-------------|
| `generate` | `tsx src/cli.ts` | Generate videos from `input/scripts/input-scripts.json` |
| `resume` | `tsx src/cli.ts --resume` | Resume an interrupted generation run from existing scene data |
| `segment` | `tsx src/cli.ts --segment` | Rebuild video from existing scene data (segment-only mode) |
| `batch` | `tsx src/cli.ts --batch` | Run batch generation from CLI (legacy batch mode) |

### Agentic Pipeline — Full Pipeline

| Script | Command | Description |
|--------|---------|-------------|
| `agentic` | `tsx bin/agentic-run.ts` | Generate one video from a topic (agent-controlled pipeline) |
| `agentic:batch` | `tsx bin/agentic-batch.ts` | Generate + verify multiple videos via the agentic pipeline |

### Agentic Modular — Single-Stage Commands

Each runs one stage of the agentic pipeline independently:

| Script | Command | Description |
|--------|---------|-------------|
| `agentic:plan` | `tsx src/adapters/cli/agentic-modular.ts plan` | Plan only — generate script structure from topic |
| `agentic:visuals` | `tsx src/adapters/cli/agentic-modular.ts visuals` | Download images/videos for planned scenes |
| `agentic:voice` | `tsx src/adapters/cli/agentic-modular.ts voice` | Generate voiceovers for each scene |
| `agentic:render` | `tsx src/adapters/cli/agentic-modular.ts render` | Render final video from prepared assets |
| `agentic:edit` | `tsx src/adapters/cli/agentic-modular.ts edit` | Apply per-scene edits (transitions, grades, etc.) |
| `agentic:editor` | `tsx src/adapters/cli/agentic-editor.ts` | Scene editor for rendered videos |
| `agentic:list` | `tsx src/adapters/cli/agentic-modular.ts list` | List jobs and their status |
| `agentic:revise` | `tsx src/adapters/cli/agentic-modular.ts revise` | Revise a rendered video with AI feedback |
| `agentic:critique` | `tsx src/adapters/cli/agentic-modular.ts critique` | AI critique of rendered video quality |
| `agentic:reorder` | `tsx src/adapters/cli/agentic-modular.ts reorder` | Reorder scenes in the pipeline |
| `agentic:audio` | `tsx src/adapters/cli/agentic-audio.ts` | Audio-specific pipeline operations |
| `agentic:image` | `tsx src/adapters/cli/agentic-image.ts` | Image-specific pipeline operations |
| `agentic:preview` | `tsx src/adapters/cli/agentic-preview.ts` | Generate preview thumbnails |
| `agentic:generate` | `tsx src/adapters/cli/agentic-batch.ts --generate --topics "..."` | Full generate from topic list |

### Agentic Batch Mode Presets

Fine-grained batch stage control:

| Script | Command | Description |
|--------|---------|-------------|
| `agentic:mode:plan` | `tsx src/adapters/cli/agentic-batch.ts --mode plan` | Batch plan stage only |
| `agentic:mode:images` | `tsx src/adapters/cli/agentic-batch.ts --mode download-images` | Batch download images |
| `agentic:mode:videos` | `tsx src/adapters/cli/agentic-batch.ts --mode download-videos` | Batch download videos |
| `agentic:mode:music` | `tsx src/adapters/cli/agentic-batch.ts --mode download-music` | Batch download background music |
| `agentic:mode:voice-edgetts` | `tsx src/adapters/cli/agentic-batch.ts --mode generate-voice-edgetts` | Batch voiceover (Edge-TTS) |
| `agentic:mode:voice-voicebox` | `tsx src/adapters/cli/agentic-batch.ts --mode generate-voice-voicebox` | Batch voiceover (Voicebox) |
| `agentic:mode:clone` | `tsx src/adapters/cli/agentic-batch.ts --mode clone-voice` | Batch voice cloning |
| `agentic:mode:sfx` | `tsx src/adapters/cli/agentic-batch.ts --mode download-sfx` | Batch sound effect download |
| `agentic:mode:url` | `tsx src/adapters/cli/agentic-batch.ts --mode download-url` | Batch URL-based media download |
| `agentic:mode:advanced` | `tsx src/adapters/cli/agentic-batch.ts --mode apply-advanced` | Apply advanced motion FX |
| `agentic:mode:rerender` | `tsx src/adapters/cli/agentic-batch.ts --mode rerender` | Re-render existing batch jobs |
| `agentic:mode:compose` | `tsx src/adapters/cli/agentic-batch.ts --mode compose` | Compose final video from batch assets |
| `agentic:post` | `tsx src/adapters/cli/agentic-batch.ts --post` | After batch completes, post every successful job's MP4 to TikTok / Instagram / YouTube (via upload-post.com). **Opt-in**: requires `UPLOAD_POST_ENABLED=true` + `UPLOAD_POST_API_KEY` + `UPLOAD_POST_USERNAME` in `.env`. Writes `publish-manifest.json` per job as an audit trail. |

### Utility & Cleanup

| Script | Command | Description |
|--------|---------|-------------|
| `agentic:clean` | `tsx src/adapters/cli/agentic-clean.ts` | Clean temporary workspace files |
| `agentic:fetch` | `tsx src/adapters/cli/agentic-batch.ts --search` | Search for media assets |
| `batch:hardening` | `tsx bin/batch-10.ts` | Run 10-video batch stress test for pipeline hardening |
| `version:sync` | `node scripts/sync-version.cjs` | Sync version across project files (auto-run after `npm version`) |

### Development

| Script | Command | Description |
|--------|---------|-------------|
| `dev` | `tsx watch src/server.ts` | Start the local web portal on port 3001 (hot-reload enabled) |

### MCP

| Script | Command | Description |
|--------|---------|-------------|
| `mcp` | `tsx src/mcp-server.ts` | Start the MCP server for AI agent integration |

### Type Checking & Testing

| Script | Command | Description |
|--------|---------|-------------|
| `typecheck` | `tsc -p tsconfig.json --noEmit` | Validate TypeScript types (strict mode) |
| `test` | `npm run typecheck && npm run test:unit` | Run typecheck then unit tests |
| `test:unit` | `node --import tsx --test --test-timeout=240000 --test-concurrency=2 --experimental-test-module-mocks "src/**/*.test.ts" "remotion/**/*.test.ts" "tests/**/*.test.ts"` | Run all unit tests (~700+ across 80+ test files) |
| `test:render` | `tsx --test src/render.e2e.test.ts` | Run render end-to-end test |
| `test:coverage` | `node --import tsx --experimental-test-coverage --test --experimental-test-module-mocks "src/**/*.test.ts" "remotion/**/*.test.ts" "tests/**/*.test.ts"` | Run unit tests with coverage reporting |

### Linting & Formatting

| Script | Command | Description |
|--------|---------|-------------|
| `lint` | `eslint src/ remotion/` | Run ESLint on source and Remotion directories |
| `lint:fix` | `eslint src/ remotion/ --fix` | Run ESLint with auto-fix |
| `format` | `prettier --write src/` | Format source files with Prettier (120 char width, 4-space indent) |
| `format:check` | `prettier --check src/` | Check formatting without writing changes |

### Remotion

| Script | Command | Description |
|--------|---------|-------------|
| `remotion:studio` | `remotion studio remotion/index.ts` | Open Remotion Studio for template preview and composition editing |
| `remotion:render` | `tsx src/render.ts` | Render using the Remotion rendering pipeline |

### Electron

| Script | Command | Description |
|--------|---------|-------------|
| `electron:dev` | `npm run electron:compile && electron .` | Compile and launch the Electron desktop app in development mode |
| `electron:debug` | `npm run electron:compile && node scripts/run-electron-debug.cjs` | Launch Electron with debug helpers |
| `electron:compile` | `tsc -p tsconfig.electron.json` | Compile Electron TypeScript sources |
| `electron:build` | `verify-bundle → compile → electron-builder → verify-release` | Build distributable Electron installer |
| `electron:pack` | `verify-bundle → compile → electron-builder --dir → verify-release` | Pack Electron app into a directory (unpacked) |
| `electron:release` | `verify-bundle → compile → electron-builder --publish always → verify-release` | Build and publish Electron release |
| `electron:verify-bundle` | `node scripts/verify-desktop-bundle.cjs` | Verify Electron bundle integrity before build |
| `electron:verify-release` | `node scripts/verify-desktop-bundle.cjs --release release/win-unpacked` | Verify built release artifacts |

### Docker

| Script | Command | Description |
|--------|---------|-------------|
| `docker:build` | `docker build -t automated-video-generator .` | Build the Docker image for the project |
| `docker:run` | `docker run -p 3001:3001 -v "$(pwd)/input:/app/input" -v "$(pwd)/output:/app/output" automated-video-generator` | Run the Docker container (maps ports 3001, mounts input/output volumes) |

### Voice

| Script | Command | Description |
|--------|---------|-------------|
| `voicebox:clone` | `node scripts/setup-voicebox-clone.mjs` | Set up Voicebox voice cloning dependencies |

---

## CLI Options & Flags

### `npm run agentic` (full pipeline)

| Flag | Description |
|------|-------------|
| `--topic <text>` | Video topic (required) |
| `--title <text>` | Video title (auto-derived from topic if omitted) |
| `--orientation <mode>` | Output orientation: `portrait` (9:16) or `landscape` (16:9) |
| `--format <preset>` | Aspect format: `none` (default) or `square` (1:1, 1080×1080) |
| `--backend <mode>` | AI backend: `agent` (default, no API key) or `vision` (Gemini/Ollama) |
| `--gpu` | Enable GPU-accelerated rendering (`h264_amf`/`nvenc`/`qsv`) |
| `--dry-run` | Dry-run mode: plan + print decisions, skip all downloads and rendering |
| `--renderer <engine>` | Render engine: `ffmpeg` (default) or `remotion` |
| `--quality <level>` | Render quality: `draft`, `medium` (default), or `high` |
| `--preset <name>` | Visual preset: `cinematic`, `reels`, `documentary`, `neutral`, etc. |
| `--images` | Use images (photo slideshow) instead of video clips |
| `--videos` | Use video clips instead of images |
| `--sfx` | Enable sound effects (cut effects) |
| `--no-sfx` | Skip background music / sound effects |
| `--no-ducking` | Disable audio ducking (music stays at full volume) |
| `--no-ken-burns` | Disable Ken Burns zoom effect |
| `--no-kinetic` | Disable kinetic typography |
| `--intro <mode>` | Intro style: `none`, `auto`, or `custom` |
| `--outro <mode>` | Outro style: `none`, `auto`, or `custom` |
| `--transition <name>` | Transition style: `auto` (default) or specific transition name |
| `--verbose` | Verbose ffmpeg stderr output during rendering |
| `--chapters` | Generate video chapter markers |
| `--aspect <ratio>` | Output aspect ratio (e.g. `16:9`, `1:1`, `9:16`) |
| `--local-assets <files>` | Comma-separated local asset files (`--local-assets "a.jpg,b.mp4"`) |
| `--default-visual <file>` | Fallback visual file when stock media is unavailable |
| `--max-attempts <N>` | Maximum render attempts for self-healing (default: 1) |

### `npm run generate` (legacy workflow)

| Flag | Description |
|------|-------------|
| `--landscape` | Force landscape (16:9) output instead of default orientation |
| `--resume` | Resume generation from existing scene data |
| `--segment` | Run in segment-only mode (skips audio/voice generation) |
| `--music <file>` | Specify a custom background music file path |

---

## Configuration

The project is configured through environment variables in a `.env` file at the project root (see `.env.example`).

### Core

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Web portal server port |
| `PEXELS_API_KEY` | — | API key for Pexels stock media (recommended) |
| `PIXABAY_API_KEY` | — | API key for Pixabay stock media (fallback) |
| `GPU_ACCEL` | `false` | Set to `true` to enable GPU-accelerated rendering |

### Media Sources

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENVERSE_ENABLED` | `true` | Enable/disable Openverse media fetching (set `false` to avoid Flickr 502s) |
| `WIKIMEDIA_ENABLED` | `true` | Enable/disable Wikimedia Commons fetching |
| `INTERNETARCHIVE_ENABLED` | `true` | Enable/disable Internet Archive fetching |

### AI / Vision Verification

| Variable | Default | Description |
|----------|---------|-------------|
| `GEMINI_API_KEY` | — | API key for Gemini Vision (semantic media verification) |
| `OLLAMA_ENABLED` | `false` | Enable Ollama local AI for media verification |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama server URL |

### TTS / Voice

| Variable | Default | Description |
|----------|---------|-------------|
| `TTS_PROVIDER` | `voicebox` | TTS provider: `voicebox` (default, vendored in-repo), `edge-tts`, `xtts`, `openai-local` |
| `VOICEBOX_ENGINE` | `kokoro` | Voicebox engine (e.g. `kokoro`, `chatterbox_turbo`) |
| `VOICEBOX_PROFILE_ID` | — | Voicebox voice profile ID for cloned voice |

### Pipeline Tuning

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENTIC_MAX_RUN_MS` | `1800000` (30 min) | Global watchdog timeout — set `0` to disable |
| `AGENTIC_FFMPEG_TIMEOUT_MS` | `30000` | Hard timeout for ffmpeg operations (ms) |
| `AGENTIC_FFPROBE_TIMEOUT_MS` | `15000` | Hard timeout for ffprobe operations (ms) |
| `VERIFY_PASS` | `7` | Minimum confidence threshold (1–10) for asset verification gate |
| `AUTO_FREE_MUSIC` | `true` | Auto-select free background music when none specified |
| `AUDIO_DUCK_LEVEL` | `0.06` | Ducking level for bgm when voiceover active |
| `AUDIO_FULL_LEVEL` | `0.18` | Full volume level for bgm during silence |
| `AGENTIC_KEEP_WORKSPACES` | `25` | Max temp workspaces to retain after runs |
| `AGENTIC_RENDER_SOFTEN` | — | Set to `1` for softer/higher-quality render settings |
| `AGENTIC_SEGMENTED` | `1` | Set to `0` to disable segmented rendering |

### Output

| Variable | Default | Description |
|----------|---------|-------------|
| `OUTPUT_DIR` | `output` | Directory for generated videos |
| `INPUT_ASSETS_DIR` | `input/visuals` | Directory for user-supplied local assets |
| `RENDER_TIMEOUT` | `300000` | Render timeout in milliseconds |

See [ENVIRONMENT.md](./ENVIRONMENT.md) for the full environment variable reference.

---

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success — video(s) generated without errors |
| `1` | General error — invalid input, missing dependencies, or runtime failure |
| `2` | CLI validation error — invalid flag value or missing required argument |
| `3` | Watchdog timeout — pipeline exceeded `AGENTIC_MAX_RUN_MS` |
| `4` | Test failure — one or more tests did not pass |
| `5` | Render timeout — video rendering exceeded the configured timeout |
| `6` | Docker error — container build or run failed |
| `7` | Electron build error — desktop bundle verification or compilation failed |

---

## Notes

- **Legacy vs Agentic**: `npm run generate` uses the classic pipeline (`src/cli.ts` + `input/scripts/input-scripts.json`). `npm run agentic` uses the newer fully agent-controlled pipeline (`src/agentic/`) that requires no API keys.
- **GPU Support**: Requires a compatible GPU (AMD AMF, NVIDIA NVENC, or Intel QSV). The `--gpu` flag selects the best available encoder automatically.
- **Watchdog**: Every agentic run has a 30-minute hard timeout by default. Override with `AGENTIC_MAX_RUN_MS` env var (`0` disables).
- **Watch mode**: The `dev` script uses `tsx watch` for automatic restart on file changes.
- **Windows**: For Docker on Windows, use the appropriate PowerShell syntax for volume mounts instead of `$(pwd)`.
