---
title: Contributing — Automated Video Generator
description: Dev setup, npm scripts, branch & test policy, and how to add a new agentic operation.
---

# Contributing to Automated Video Generator

Thanks for contributing! This guide covers the **agentic pipeline** (`src/agentic/*`),
its operations layer (`src/agentic/operations/*`), and the MCP surface (`src/adapters/mcp/*`).
The classic CLI/Remotion/Electron code is covered by the same policies where applicable.

## 1. Development Setup

Prerequisites: **Node.js 20+** and (optionally) **Python 3.10+** for the opt-in Voicebox GPU backend.

```bash
git clone https://github.com/itsPremkumar/Automated-Video-Generator.git
cd Automated-Video-Generator
npm install
cp .env.example .env        # optional; pipeline runs key-less by default
npm run typecheck           # must pass with 0 errors before any PR
```

> The agentic pipeline and all single-task operations run **without any API key**.
> Stock media (Openverse/Pexels), music (`lib/free-music.ts`), and TTS (Edge-TTS) are all
> free. Only optional bolt-ons (vision verify, Voicebox) need extra setup.

Run the agentic pipeline end-to-end:

```bash
npm run agentic -- --topic "5 fascinating facts about coffee" --title "Coffee Facts"
# or the one-shot MCP path:
npm run mcp                 # starts the MCP server (Claude Desktop / OpenClaw / Hermes)
```

## 2. npm Scripts (relevant to contributors)

| Script | Purpose |
|--------|---------|
| `npm run dev` | `tsx watch src/server.ts` — live-reload HTTP server |
| `npm run typecheck` | `tsc -p tsconfig.json --noEmit` — **gate for every PR** |
| `npm run lint` / `lint:fix` | ESLint over `src/` |
| `npm run format` / `format:check` | Prettier over `src/`, `remotion/`, `*.json` |
| `npm test` | `typecheck` + `test:unit` (full gate) |
| `npm run test:unit` | `tsx --test "src/**/*.test.ts"` — offline unit tests |
| `npm run test:render` | `tsx --test "src/render.e2e.test.ts"` — render e2e |
| `npm run test:coverage` | unit tests with coverage |
| `npm run generate` | classic CLI flow (`src/cli.ts`) from `input/input-scripts.json` |
| `npm run agentic` | one-shot agentic pipeline (`bin/agentic-run.ts`) |
| `npm run agentic:batch` | batch agentic runs (`bin/agentic-batch.ts`) |
| `npm run mcp` | start the MCP server (`src/mcp-server.ts`) |
| `npm run batch` | classic batch queue (`src/cli.ts --batch`) |

## 3. Branch & Test Policy

- **Branch off `main`.** Name branches by intent:
  - `docs/<topic>` — documentation only (this branch's convention)
  - `feat/<slug>` — new feature
  - `fix/<slug>` — bug fix
  - `test/<slug>` — test additions
- **Keep the agentic code additive.** Per project mandate, the agentic pipeline is a
  *parallel* layer; do **not** modify the classic `npm run generate` flow or the Voicebox
  integration files (`src/lib/voicebox-lifecycle.ts` and related) unless explicitly asked.
- **Typecheck must stay at 0 errors.** No TypeScript changes are required for docs work and
  the existing `tsc --noEmit` gate must remain green.
- **Tests run offline.** Unit tests must not require network or API keys. Use the injected
  deps pattern (`AcquireDeps`, `VerifyDeps`, `GatewayDeps` in `src/agentic/*`) so fakes can
  be supplied. The real fetchers are only touched in e2e.
- **PR checklist:**
  1. `npm run typecheck` passes (0 errors)
  2. `npm run lint` is clean (or `--fix` applied)
  3. `npm run format:check` passes
  4. `npm run test:unit` passes
  5. Docs updated if behavior changed (see `docs/ARCHITECTURE.md`, `docs/API.md`)

## 4. How to Add a New Agentic Operation

The operations layer is the recommended way to add a single, reusable video transform.
Follow these steps:

### Step A — Implement the operation
Create `src/agentic/operations/my-op.ts` exporting an async function that returns a
result shape (`ok`, `output`/`outputs`, `detail`):

```ts
import { runFfmpeg } from './edit.js';

export interface MyOpResult { ok: boolean; output?: string; detail: string; }

export async function myOp(file: string, out?: string): Promise<MyOpResult> {
  const target = out ?? path.join(process.cwd(), 'output', `myop_${Date.now()}.mp4`);
  const { code } = await runFfmpeg(['-i', file, /* …ffmpeg args… */, '-y', target]);
  if (code !== 0 || !fs.existsSync(target)) return { ok: false, detail: 'ffmpeg failed' };
  return { ok: true, output: target, detail: 'done' };
}
```

Rules:
- Use `runFfmpeg` from `edit.ts` (it already wraps `ffmpeg-static` with a kill timeout).
- Accept an optional `out` and default to `output/`.
- Never assume network; if the op needs media, reuse the free fetchers.

### Step B — Expose it as an MCP tool
In `src/adapters/mcp/register-operations-tools.ts`,
import your function and register a tool:

```ts
import { myOp } from '../../agentic/operations/my-op.js';
server.registerTool(
  'my_op',
  { title: 'My Op', description: 'What it does (no paid key needed).',
    inputSchema: z.object({ file: z.string(), out: z.string().optional() }) as any },
  async (a: any) => { const r = await myOp(a.file, a.out); return okr(r.ok, r.output, r.detail); },
);
```

`okr(ok, out, detail)` is the shared helper that returns a `textResponse` on success and
`errorResponse` on failure.

### Step C — (Optional) Wire it into the natural-language router
In `src/agentic/operations/route.ts`, add a `TaskKind` entry and a `classifyOne` branch so
`do_task("do my op on clip.mp4")` resolves to it. Then handle the `kind` in
`dispatch.ts`'s `runOne` switch.

### Step D — Test it offline
Add `src/agentic/operations/my-op.test.ts` using a tiny fixture clip (no network). Mirror
the existing `operations.test.ts` / `route.test.ts` patterns.

### Step E — Document it
Add the tool to `docs/API.md` (Operations Tools section) and, if it changes the pipeline,
to `docs/ARCHITECTURE.md`. For any significant design choice, add an ADR under `docs/adr/`.

## 5. Code Style

- TypeScript, ESM-style imports with explicit `.js` extensions (project `tsconfig` uses
  `moduleResolution: node16`/bundler — match existing files).
- Prefer **dependency injection** for anything that touches the network or filesystem, so
  tests stay offline (see `AcquireDeps`/`VerifyDeps` in `src/agentic/`).
- Keep every operation **key-less and offline-safe**: a missing network call must fall back
  to a real artifact (placeholder card / tone / cached track), never throw a hard failure.
- Add a short JSDoc header to every new module stating its purpose and the free source it
  uses (consistent with the existing `*.ts` files).

## 6. Documentation Policy

- Architecture lives in `docs/ARCHITECTURE.md`; the MCP tool surface in `docs/API.md`.
- New developers start at `docs/ONBOARDING.md`.
- Architecture Decision Records go in `docs/adr/` (one file per decision, numbered).
- If a doc contradicts the code, treat the **code as source of truth** and update the doc
  (or note the discrepancy in the PR description). Do not "fix" the code to match docs
  without explicit review.
