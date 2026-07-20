# GEMINI.md — for Gemini CLI / Antigravity

Repository: `automated-video-generator` (TypeScript, Node 18+, Remotion, Edge-TTS).

## Generate a video with the agentic pipeline (no Gemini/Ollama key needed)
```bash
npm run agentic -- --topic "5 home workout exercises" --title "Home Workout" --backend agent --orientation landscape --images
npm run agentic:batch
```
The `agent` backend means **this agent (or any host agent) drives everything**;
signal-level verification only, no extra model call. The optional `vision`
backend adds Gemini/Ollama semantic relevance scoring.

## Import API
```ts
import { runAgenticPipeline, renderAgenticSlideshow } from './src/agentic/orchestrate.js';
const res = await runAgenticPipeline({ topic, title, backend: 'agent' });
const mp4 = await renderAgenticSlideshow(res);
```

## MCP tools (server: `npx tsx src/mcp-server.ts`)
`agentic_run` (one-shot) or `agentic_plan`→`agentic_acquire`→`agentic_verify_all`
→`agentic_list_pending`→`agentic_approve`/`agentic_reject`→`agentic_gate`.

## Conventions
- NodeNext: relative imports need `.js` (e.g. `from './plan.js'`).
- Keep legacy `npm run generate` workflow untouched; add under `src/agentic/`.
- `agentic-pipeline/workspaces/` is git-ignored.
- Always run `npm run typecheck` + `npm run test:unit` after edits.
- Do NOT push without user approval.
