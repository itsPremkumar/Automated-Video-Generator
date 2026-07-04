# AGENTS.md

This file helps AI coding agents work effectively with this project.

## Project Overview

Automated Video Generator is a free, open-source, self-hosted AI text-to-video pipeline. It converts text scripts into MP4 videos using Remotion for rendering, Edge-TTS for voice synthesis, and multiple stock media sources for visuals.

## Tech Stack

- **Runtime**: Node.js 18+, TypeScript 5+
- **Framework**: Express.js for web server, Remotion for video rendering
- **TTS**: Edge-TTS (Python), with Voicebox, XTTS, Kokoro fallbacks
- **Media**: Pexels, Pixabay, Openverse, Wikimedia Commons, Internet Archive
- **Desktop**: Electron
- **AI**: Ollama (moondream), Gemini Vision for media verification

## Architecture Pattern

Hexagonal architecture with layers:
- `src/adapters/` — Entry points (HTTP, CLI, MCP)
- `src/application/` — Orchestration
- `src/lib/` — Core business logic
- `src/infrastructure/` — Persistence, filesystem
- `src/shared/` — Contracts, runtime utilities, logging

## Key Conventions

- **Naming**: PascalCase for classes/interfaces, camelCase for functions/variables
- **Imports**: ES module imports with `.js` extension in import paths
- **Testing**: Node.js built-in test runner (node:test + node:assert/strict)
- **Formatting**: Prettier with 120 char width, 4-space indent
- **TypeScript**: Strict mode enabled

## Important Directories

- `input/input-assets/` — User's local images/videos
- `input/input-scripts.json` — Job definitions for CLI batch mode
- `output/` — Generated videos
- `public/` — Served by web portal
- `remotion/` — React video compositions

## Common Commands

- `npm run dev` — Start web portal
- `npm run generate` — Run batch generation from CLI
- `npm run typecheck` — TypeScript validation
- `npm run test:unit` — Run tests
- `npm run lint` — ESLint
- `npm run format` — Prettier

## Common Pitfalls

1. The directory is `input/input-assets/` defined in `INPUT_ASSETS_DIR` constant in `src/lib/path-safety.ts`.
2. FFmpeg is bundled via `ffmpeg-static` but may fail on some architectures. A global FFmpeg install is the fallback.
3. For Windows desktop builds, verify bundle integrity with `npm run electron:verify-bundle`.
