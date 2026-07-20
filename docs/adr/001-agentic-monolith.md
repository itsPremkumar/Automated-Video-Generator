---
title: ADR 001 — Agentic Monolith
status: Accepted
date: 2026-07-18
deciders: Project owner + agentic pipeline contributors
---

# ADR 001: Agentic Monolith (one pipeline, one orchestrator)

## Context

The project began as a classic, script-driven CLI (`input/scripts/input-scripts.json` →
`npm run generate` → Remotion render). As an AI agent (Hermes/OpenClaw) took over video
production, two structural options emerged:

1. **Spread agent logic across many micro-services / separate runtimes.**
2. **Keep one orchestrator (`runAgenticPipeline`) in `src/agentic/orchestrate.ts` that
   drives the six stages, and expose it (plus a single-task operations library) through a
   thin MCP adapter layer.**

Constraints from the owner: the agent must be the *sole* intelligence, the classic flow
must keep working untouched, and everything must stay free/key-less. Multiple runtimes
(HTTP, Electron, CLI, MCP) already share one application core (`PipelineAppService`); the
agentic layer had to fit the same "single source of truth" rule.

## Decision

Adopt the **agentic monolith**:

- A single orchestrator `runAgenticPipeline()` owns the six stages
  (plan → acquire → verify → decide → gate → voiceover) and the ffmpeg render
  (`renderAgenticSlideshow`). It is **additive and parallel** to the classic CLI — it does
  not fork or replace `src/cli.ts`.
- Each stage is a **pure-ish, dependency-injected function** (`plan.ts`, `acquire.ts`,
  `verify.ts`, `agent.ts` + `gateway.ts`, `gate.ts`, `tts.ts`) so the whole pipeline is
  unit-testable **offline**.
- A separate **single-task operations library** (`src/agentic/operations/*`) handles
  one-off edits; a natural-language router (`src/agentic/operations/route.ts`) + dispatcher
  (`src/agentic/operations/dispatch.ts`) let an agent say "crop to 9:16 then add music"
  without invoking the full pipeline (except `full_video`, which delegates back to
  `runAgenticPipeline`).
- The MCP surface (`src/adapters/mcp/*`) is a **thin adapter** that registers these
  functions as tools; it contains no pipeline logic of its own.

## Consequences

**Good:**
- One place to reason about the end-to-end flow; easy to audit and to add stages.
- Offline unit tests are trivial because every network/filesystem dependency is injected.
- The classic `npm run generate` path is provably untouched (additive mandate).
- The MCP adapter stays small and stable even as the pipeline evolves.

**Trade-offs:**
- `orchestrate.ts` is large (~1.6k lines) because it also contains the ffmpeg render
  builder; this is a known concentration point rather than a distributed set of modules.
- A monolith couples all stages behind one orchestrator — but since the operations library
  covers single-task needs, the coupling rarely bites.

**Rejected alternative:** distributing stages as separate services would have added
serialization, orchestration, and a runtime to operate — contrary to the free/self-hosted
mandate and the "single source of truth" rule already enforced for the other runtimes.
