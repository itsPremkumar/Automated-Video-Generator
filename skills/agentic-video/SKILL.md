---
name: agentic-video
description: How an AI agent drives the fully-agentic video pipeline (plan → acquire → verify → decide → gate → render) with complete control over every image, video, and music asset.
version: 5.0.0
---

# Agentic Video Pipeline — Agent Skill

This skill turns the Automated Video Generator into a **fully agentic director**. Instead
of only writing a script and pressing "generate", the agent controls every asset:
it downloads candidate images, videos, and background music into separate folders,
verifies each one (vision + signal checks), decides approve / reject / replace,
and only then lets the final gate render — but only after EVERYTHING is verified.

## The six stages (MCP tools)

| Stage | Tool | What the agent does |
|---|---|---|
| 1. Plan | `agentic_plan` | script → `plan.json` (scenes, per-scene visual intent, music query) |
| 2. Acquire | `agentic_acquire` | download N candidates into `assets/images/<scene>/`, `assets/videos/<scene>/`, `assets/music/` |
| 3. Verify | `agentic_verify_all` | runs full matrix → `verification/*.json` (I1–I7, V1–V7, M1–M5) |
| 4. Decide | `list_pending_assets`, `get_asset_preview`, `approve_asset`, `reject_asset` | agent SEES each asset (base64 thumb) and decides |
| 5. Gate | `agentic_gate` | holistic X1–X6 cross-checks; BLOCKS render if anything unverified |
| 6. Render | `renderAgenticSlideshow()` (CLI `npm run agentic`) | renders only approved assets into a real MP4 via bundled ffmpeg |

## Drive it from ANY coding agent (not just Hermes)

This skill is tool-agnostic. Any agent that can run a shell or call an MCP
server can use it:

- **Claude Code / Cursor / Windsurf / Antigravity(Gemini) / OpenCode / Codex /
  GitHub Copilot** — all read the repo's instruction files
  (`AGENTS.md`, `GEMINI.md`, `.github/copilot-instructions.md`,
  `.cursor/rules/agentic-video.mdc`, `opencode.json`, `.codex/AGENTS.md`) and
  can run:
  ```bash
  npm run agentic -- --topic "5 home workout exercises" --title "Home Workout" --backend agent --orientation landscape --images
  npm run agentic:batch
  ```
- **MCP-capable agents** — connect `npx tsx src/mcp-server.ts` and call
  `agentic_run` (one-shot) or the granular tools below.
- **Library import** (TypeScript agents):
  ```ts
  import { runAgenticPipeline, renderAgenticSlideshow } from './src/agentic/orchestrate.js';
  const res = await runAgenticPipeline({ topic, title, backend: 'agent' });
  const mp4 = await renderAgenticSlideshow(res);
  ```

## Autonomy levels
Set `AGENT_AUTONOMY` (env):
- `L2-autonomous` (default): agent approves/rejects itself, logs rationale to `approval-manifest.json`.
- `L0-manual` / `L1-suggest`: surface approve/reject to a human instead.

## Backends: "Hermes IS the AI" vs "vision assist"

The pipeline runs with **one of two backends** (set per call):

| Backend | What does the AI? | External AI key needed? |
|---|---|---|
| **`agent`** (default) | Hermes/OpenClaw writes the script, expands keywords, and **DECIDES** every asset by reading the verification matrix. Verification uses **deterministic signal checks** (resolution, duration, license, silence, watermark-heuristic, NSFW-heuristic). | **NONE** — works fully offline, free. |
| `vision` | Same agent control, BUT vision relevance (does the image/video match the keyword?) is scored by Gemini/Ollama when `MEDIA_VERIFICATION_ENABLED` + a key is present. | Only if you opt into vision. |

> **You said: "if this is controlled by you, the Hermes AI agent, I don't want to use
> any other AI models — all the AI work you can do yourself."**
> That is exactly `backend: 'agent'`. No Google Gemini key, no Ollama model required.
> The agent reasons over structured verification output (confidence scores + reasons +
> signal metrics) and approves/rejects/replaces each image, video and music track itself.
> Vision similarity is an *optional* bolt-on, never a dependency.

## One-shot agent run (recommended)
`agentic_run` does the entire 6-stage loop in one call:
1. Hermes writes the script from a `topic` (heuristic; or plug your LLM via `agent.writeScript`).
2. Hermes expands per-scene keywords (heuristic; or `agent.expandKeywords`).
3. Acquire real candidates (Openverse/Pexels/Pixabay + free-music).
4. Verify (signal checks always; vision only in `vision` backend).
5. **Hermes DECIDES** each asset (approve / reject / replace-with-refetch).
6. Final gate — blocks render unless everything is verified + approved.

```json
{ "topic": "5 home workouts", "title": "Home Workout", "backend": "agent" }
```

## Or drive the stages yourself (full control)
`agentic_plan` → `agentic_acquire` → `agentic_verify_all` →
`list_pending_assets` / `get_asset_preview` (SEE the asset) / `approve_asset` / `reject_asset`
→ `agentic_gate` → render.

## Old workflow is UNTOUCHED
The classic path (`input/input-scripts.json` → `npm run generate`, the Electron app, the
existing MCP `generate_video` tool) is **completely unaffected**. This agentic pipeline is
additive — a parallel, agent-driven path. Turn it on only when you want the agent in control.
1. Call `agentic_plan` with the script.
2. Call `agentic_acquire` (candidatesPerAsset=2).
3. Call `agentic_verify_all`.
4. Loop: `list_pending_assets` → for each, `get_asset_preview` to SEE it →
   `approve_asset` (good) or `reject_asset` (wrong → auto re-fetch) with a rationale.
5. Call `agentic_gate`. If it BLOCKS, read the failed checks (X2 missing scene, etc.)
   and fix decisions, then re-gate.
6. Once GATE PASS, hand the approved `render-manifest.json` to the render stage.

## What is verified
- **Images:** relevance (vision), no watermark/text, NSFW-safe, min resolution, aspect ratio, license.
- **Videos:** same vision checks + duration fit + codec + aspect ratio + license.
- **Music:** valid license, duration ≥ video, no silence/corrupt, min bitrate (96 kbps).
- **Cross-checks (gate):** TTS duration alignment, every scene covered, no unresolved
  decisions, runtime limit, attribution completeness, caption sync.

## Files (for reference)
- `src/agentic/plan.ts`, `acquire.ts`, `verify.ts`, `gateway.ts`, `gate.ts`, `types.ts`, `workspace.ts`, `agent.ts`, `orchestrate.ts`
- `src/lib/music-verifier.ts` (new), `src/lib/media-verifier.ts` (extended: watermark/safety)
- `src/adapters/mcp/register-agentic-tools.ts` (the 9 MCP tools)
- Workspace per job: `agentic-pipeline/workspaces/<jobId>/`
