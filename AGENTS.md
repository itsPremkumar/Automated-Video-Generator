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
- `src/agentic/` — **Agentic video pipeline** (fully agent-controlled)
- `bin/agentic-run.ts` — one-shot CLI to generate a video from a topic
- `bin/agentic-batch.ts` — generate + verify multiple videos
- `skills/agentic-video/SKILL.md` — canonical agent-driving doc
- `agentic-pipeline/` — planning docs (`README.md`, `VERIFICATION_MATRIX.md`, `AGENT_TOOLS_AND_PHASES.md`)

## Agentic Video Generation (fully agent-controlled, no external AI needed)

The `src/agentic/` pipeline lets **any AI coding agent** (Claude Code, Cursor,
Antigravity/Gemini, OpenCode, Codex, Windsurf, GitHub Copilot, or the in-repo
Hermes/OpenClaw skill) produce a real MP4 from just a topic — with the agent
making every decision (script, keywords, asset fetch, per-asset verify,
approve/reject, and the final render gate).

**Backends**
- `backend=agent` (DEFAULT) — Hermes/OpenClaw is the AI. NO Google Gemini, NO
  Ollama, NO API key required. Signal-level verification only.
- `backend=vision` (opt-in) — adds Gemini/Ollama semantic relevance scoring.

**How an agent generates a video (pick one):**
1. CLI (simplest, works in any terminal):
   ```bash
   npm run agentic -- --topic "5 home workout exercises" --title "Home Workout" --backend agent --orientation landscape --images
   npm run agentic:batch        # generate + verify 3 sample videos
   ```
2. MCP tools (when the repo's MCP server is connected):
   `agentic_run` (one-shot), or granular `agentic_plan` → `agentic_acquire` →
   `agentic_verify_all` → `agentic_list_pending` → `agentic_approve` /
   `agentic_reject` → `agentic_gate`.
3. Library import:
   ```ts
   import { runAgenticPipeline, renderAgenticSlideshow } from './src/agentic/orchestrate.js';
   const res = await runAgenticPipeline({ topic, title, backend: 'agent' });
   const mp4 = await renderAgenticSlideshow(res);
   ```

**Verification & safety (the agent refuses to ship bad output):**
- Every asset is signal-verified (dimensions, duration, license, silence,
  bitrate) in `src/lib/media-verifier.ts` + `src/lib/music-verifier.ts`.
- The final **gate (X1–X6)** blocks render if ANY check fails (duration
  alignment, runtime limit, attribution, caption sync, etc.).
- `agentic-pipeline/workspaces/` (runtime artifacts) is git-ignored.

**The legacy `npm run generate` workflow (`src/video-generator.ts`,
`src/lib/script-parser.ts`, `input/input-scripts.json`) is UNCHANGED** — the
agentic system is purely additive.

## Common Commands

- `npm run dev` — Start web portal
- `npm run generate` — Run batch generation from CLI (LEGACY workflow)
- `npm run agentic` — Generate one video from a topic (AGENTIC workflow)
- `npm run agentic:batch` — Generate + verify multiple videos (AGENTIC)
- `npm run typecheck` — TypeScript validation
- `npm run test:unit` — Run tests
- `npm run lint` — ESLint
- `npm run format` — Prettier

## Common Pitfalls

1. The directory is `input/input-assets/` defined in `INPUT_ASSETS_DIR` constant in `src/lib/path-safety.ts`.
2. FFmpeg is bundled via `ffmpeg-static` but may fail on some architectures. A global FFmpeg install is the fallback.
3. For Windows desktop builds, verify bundle integrity with `npm run electron:verify-bundle`.
4. The agentic pipeline uses NodeNext module resolution — ALL relative imports
   need the `.js` extension (e.g. `from './plan.js'`).
5. With `backend=agent` and no network, asset fetching gracefully falls back to
   ffmpeg-generated placeholder cards/music, so the pipeline still yields a
   renderable MP4.
