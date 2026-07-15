# GitHub Copilot / Copilot Coding Agent instructions

This repo is `automated-video-generator` (TypeScript, Node 18+, Remotion, Edge-TTS).

## Agentic video generation (primary feature for coding agents)

Any coding agent can produce a real MP4 from a topic with **no external AI key**
(`backend=agent`): the agent itself writes the script, expands keywords, fetches
assets, verifies each one, approves/rejects, and the final gate blocks render on
any failed check.

### Generate a video
```bash
npm run agentic -- --topic "5 home workout exercises" --title "Home Workout" --backend agent --orientation landscape --images
npm run agentic:batch          # generate + verify 3 sample videos end-to-end
```

### Library use
```ts
import { runAgenticPipeline, renderAgenticSlideshow } from './src/agentic/orchestrate.js';
const res = await runAgenticPipeline({ topic: '...', title: '...', backend: 'agent' });
const mp4 = await renderAgenticSlideshow(res);
```

### MCP surface (when repo MCP server connected)
One-shot: `agentic_run`. Granular: `agentic_plan`, `agentic_acquire`,
`agentic_verify_all`, `agentic_list_pending`, `agentic_approve`,
`agentic_reject`, `agentic_gate`. Server entry: `npx tsx src/mcp-server.ts`.

## Rules
- NodeNext: relative imports MUST include `.js` (e.g. `from './plan.js'`).
- Legacy `npm run generate` workflow (`src/video-generator.ts`,
  `src/lib/script-parser.ts`, `input/input-scripts.json`) is UNCHANGED — keep
  edits additive under `src/agentic/`.
- `agentic-pipeline/workspaces/` is git-ignored (runtime artifacts only).
- Verify changes with `npm run typecheck` and `npm run test:unit` before claiming done.
- Do NOT commit or push without explicit user approval.
