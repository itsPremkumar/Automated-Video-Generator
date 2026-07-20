# CLI Reference

## npm Scripts

All commands are run via `npm run <script>` from the project root.

### Generation

| Script | Command | Description |
|--------|---------|-------------|
| `generate` | `tsx src/cli.ts` | Generate videos from `input/scripts/input-scripts.json` (legacy workflow) |
| `resume` | `tsx src/cli.ts --resume` | Resume an interrupted generation run from existing scene data |
| `segment` | `tsx src/cli.ts --segment` | Rebuild video from existing scene data (segment-only mode) |
| `batch` | `tsx src/cli.ts --batch` | Run batch generation from CLI (legacy batch mode) |

### Agentic Pipeline

| Script | Command | Description |
|--------|---------|-------------|
| `agentic` | `tsx bin/agentic-run.ts` | Generate one video from a topic (agent-controlled pipeline) |
| `agentic:batch` | `tsx bin/agentic-batch.ts` | Generate + verify multiple videos via the agentic pipeline |

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
| `test:unit` | `node --import tsx --test ... "src/**/*.test.ts" "remotion/**/*.test.ts"` | Run all unit tests (487+ across 75 test files) |
| `test:render` | `tsx --test src/render.e2e.test.ts` | Run render end-to-end test |
| `test:coverage` | `node --import tsx --experimental-test-coverage ...` | Run unit tests with coverage reporting |

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
| `docker:run` | `docker run -p 3001:3001 -v ...` | Run the Docker container (maps ports 3001, mounts input/output volumes) |

### Voice

| Script | Command | Description |
|--------|---------|-------------|
| `voicebox:clone` | `node scripts/setup-voicebox-clone.mjs` | Set up Voicebox voice cloning dependencies |

### Other

| Script | Command | Description |
|--------|---------|-------------|
| `batch:hardening` | `tsx bin/batch-10.ts` | Run 10-video batch stress test for pipeline hardening |
| `version:sync` | `node scripts/sync-version.cjs` | Sync version across project files (auto-run after `npm version`) |

---

## CLI Options & Flags

### `npm run generate` (legacy workflow)

| Flag | Description |
|------|-------------|
| `--landscape` | Force landscape (16:9) output instead of default orientation |
| `--resume` | Resume generation from existing scene data |
| `--segment` | Run in segment-only mode (skips audio/voice generation) |
| `--music <file>` | Specify a custom background music file path |

### `npm run agentic` (agentic pipeline)

| Flag | Description |
|------|-------------|
| `--topic <text>` | Video topic (required) |
| `--title <text>` | Video title (auto-derived from topic if omitted) |
| `--preset <name>` | Visual preset: `cinematic`, `reels`, `documentary`, `neutral`, etc. |
| `--backend <mode>` | AI backend: `agent` (default, no API key) or `vision` (Gemini/Ollama) |
| `--orientation <mode>` | Output orientation: `landscape` or `portrait` |
| `--images` | Use images (photo slideshow) instead of video clips |
| `--videos` | Use video clips instead of images |
| `--no-sfx` | Skip background music / sound effects |
| `--karaoke` | Enable word-level karaoke captions |
| `--aspect <ratio>` | Output aspect ratio (e.g. `16:9`, `1:1`, `9:16`) |
| `--local-assets <files>` | Comma-separated local asset files (`--local-assets "a.jpg,b.mp4"`) |
| `--default-visual <file>` | Fallback visual file when stock media is unavailable |
| `--max-attempts <N>` | Maximum render attempts for self-healing (default: 1) |
| `--renderer <engine>` | Render engine: `ffmpeg` or `remotion` |

### `npm run agentic:batch`

Uses the same flags as `agentic` but processes multiple topics defined internally.

---

## Configuration

The project is configured through environment variables in a `.env` file at the project root (see `.env.example`).

### Core

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Web portal server port |
| `PEXELS_API_KEY` | — | API key for Pexels stock media (recommended) |
| `PIXABAY_API_KEY` | — | API key for Pixabay stock media (fallback) |

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
| `TTS_BACKEND` | `edge-tts` | TTS backend: `edge-tts`, `voicebox`, `xtts`, `kokoro` |
| `TTS_VOICE` | — | Voice selection for the chosen TTS backend |
| `VOICEBOX_CLONE_DIR` | — | Directory for Voicebox voice clone data |

### Output

| Variable | Default | Description |
|----------|---------|-------------|
| `OUTPUT_DIR` | `output` | Directory for generated videos |
| `INPUT_ASSETS_DIR` | `input/visuals` | Directory for user-supplied local assets |
| `RENDER_TIMEOUT` | `300000` | Render timeout in milliseconds |

See [configuration.md](./configuration.md) for the full environment variable reference.

---

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success — video(s) generated without errors |
| `1` | General error — invalid input, missing dependencies, or runtime failure |
| `2` | TypeScript type error — typecheck failed |
| `3` | Linting error — ESLint or Prettier check failed |
| `4` | Test failure — one or more tests did not pass |
| `5` | Render timeout — video rendering exceeded the configured timeout |
| `6` | Docker error — container build or run failed |
| `7` | Electron build error — desktop bundle verification or compilation failed |

---

## Notes

- **Legacy vs Agentic**: `npm run generate` uses the classic pipeline (`src/cli.ts` + `input/scripts/input-scripts.json`). `npm run agentic` uses the newer fully agent-controlled pipeline (`src/agentic/`) that requires no API keys.
- **Watch mode**: The `dev` script uses `tsx watch` for automatic restart on file changes.
- **Windows**: For Docker on Windows, use the appropriate PowerShell syntax for volume mounts instead of `$(pwd)`.
- **Electron prerequisites**: Run `npm run electron:verify-bundle` before any build script to ensure bundle integrity.
