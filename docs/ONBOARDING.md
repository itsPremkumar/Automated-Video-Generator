---
title: Onboarding — 5 Minutes to Your First Agentic Video
description: A fast-start guide for new developers joining the Automated Video Generator agentic pipeline.
---

# Onboarding — New Developer Guide (5 minutes)

Welcome! This gets you from clone to your first agent-driven video without reading the
whole codebase.

## Minute 1 — Clone & install

```bash
git clone https://github.com/itsPremkumar/Automated-Video-Generator.git
cd Automated-Video-Generator
npm install
```

No API keys required. The pipeline is **free and key-less** by default (Openverse/Pexels
stock, royalty-free music, Edge-TTS voiceover).

## Minute 2 — Run the one-shot agentic pipeline

```bash
npm run agentic -- --topic "5 fascinating facts about coffee" --title "Coffee Facts"
```

That single command makes the **agent** do everything: write the script, pick stock
visuals, verify them, decide approve/reject, gate, generate voiceover + captions, and
render a `.mp4` via the bundled `ffmpeg-static`. Output lands in
`agentic-pipeline/workspaces/<jobId>/render/`.

## Minute 3 — Talk to it in plain language (MCP)

Start the MCP server and drive it from any MCP client (Hermes, OpenClaw, Claude Desktop):

```bash
npm run mcp
```

Try these tools:
- `agentic_run` — `{ "topic": "facts about lions", "title": "Lions" }`
- `do_task` — `{ "prompt": "crop to 9:16 then add music ambient lofi", "files": ["clip.mp4"] }`
- `make_voiceover` — `{ "text": "Hello world" }`
- `download_image` — `{ "keyword": "mountains" }`

The full tool list is in [`API.md`](./API.md).

## Minute 4 — Where the code lives

```text
src/agentic/orchestrate.ts   ← runAgenticPipeline() : the 6-stage orchestrator + renderer
src/agentic/plan.ts          ← STAGE 1  script → scenes
src/agentic/acquire.ts       ← STAGE 2  fetch + download candidates
src/agentic/verify.ts        ← STAGE 3  signal checks
src/agentic/agent.ts         ← STAGE 4  agentDecide()
src/agentic/gateway.ts       ← STAGE 4  decision loop + re-fetch
src/agentic/gate.ts          ← STAGE 5 + post-render (X1–X16)
src/agentic/tts.ts           ← STAGE 6  voiceover + captions
src/agentic/operations/      ← single-task edits (crop, merge, grade, …)
src/adapters/mcp/            ← MCP tool registration (what clients call)
src/lib/                     ← free-stack primitives (fetchers, music, TTS)
```

Read [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the diagram and the data-flow table.

## Minute 5 — Make a change safely

1. Branch: `git checkout -b feat/<slug>` (off `main`).
2. Edit code. Keep the agentic layer **additive** — don't touch the classic
   `npm run generate` flow or the Voicebox integration files unless asked.
3. Gate before commit:
   ```bash
   npm run typecheck && npm run lint && npm run test:unit
   ```
   All three must pass (typecheck = 0 errors).
4. Add/extend a doc if behavior changed (`API.md` / `ARCHITECTURE.md`).

## Mental model (the 3 things to remember)

1. **Agent = the intelligence, not a paid API.** `backend: 'agent'` uses deterministic
   heuristics + the agent's own model; no Gemini/Ollama key needed. Vision verify and
   Voicebox are *opt-in bolt-ons*.
2. **Every stage is injected + offline-testable.** Fetchers/verifiers are passed in as deps
   so unit tests never hit the network.
3. **Never hang, never crash.** Timeouts on all network I/O, real placeholder/tone
   fallbacks for missing assets, and a post-render gate (X7–X16) that proves the output
   is shippable.

## Next reads

- `docs/ARCHITECTURE.md` — full system design
- `docs/API.md` — every MCP tool, with examples
- `docs/adr/` — why the big decisions were made (agentic monolith, Voicebox lifecycle,
  free-stack mandate)
- `docs/CONTRIBUTING.md` — branch/test policy + how to add an operation
