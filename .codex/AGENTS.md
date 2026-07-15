# Codex / OpenAI Codex instructions

Repo: `automated-video-generator` (TypeScript, Node 18+, Remotion, Edge-TTS).

## Agentic video generation (no external AI key required)
```bash
npm run agentic -- --topic "5 home workout exercises" --title "Home Workout" --backend agent --orientation landscape --images
npm run agentic:batch
```
`backend=agent` => the host agent drives script/keywords/fetch/verify/approve and
the final gate. Optional `backend=vision` adds Gemini/Ollama relevance scoring.

## Import
```ts
import { runAgenticPipeline, renderAgenticSlideshow } from './src/agentic/orchestrate.js';
```

## MCP tools (server: `npx tsx src/mcp-server.ts`)
`agentic_run` (one-shot) or `agentic_plan`→`agentic_acquire`→`agentic_verify_all`
→`agentic_list_pending`→`agentic_approve`/`agentic_reject`→`agentic_gate`.

## Conventions
- NodeNext: relative imports need `.js` (e.g. `from './plan.js'`).
- Legacy `npm run generate` workflow untouched; add under `src/agentic/`.
- `agentic-pipeline/workspaces/` is git-ignored.
- Run `npm run typecheck` + `npm run test:unit` after edits.
- Do NOT push without user approval.
