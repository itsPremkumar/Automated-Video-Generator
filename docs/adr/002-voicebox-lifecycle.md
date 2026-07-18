---
title: ADR 002 — Voicebox Lifecycle
status: Accepted
date: 2026-07-18
deciders: Project owner + agentic pipeline contributors
---

# ADR 002: Voicebox Lifecycle (RAM-gated external GPU backend)

## Context

High-quality voice cloning / TTS is available from **Voicebox** (jamiepine/voicebox), a
separate **Python** process, useful on a GPU machine (e.g. RTX 3050). But the host is a
**6 GB laptop** that also runs the Remotion/ffmpeg render and the asset-fetch phases.
Keeping *any* TTS engine resident during those phases would exhaust RAM and crash the run.

Additional constraint: the agentic pipeline must stay **free and key-less by default**, and
the owner explicitly said *do not touch the Voicebox integration files* when documenting —
i.e. Voicebox is a first-class but strictly optional capability.

## Decision

Treat Voicebox as a **lifecycle-controlled, opt-in backend** behind
`src/lib/voicebox-lifecycle.ts`:

- `ensureBackend()` — spawn `python -m backend.main` only if it isn't already answering
  `/models/status`; poll up to 40s; on failure, **return false and fall back** (no throw).
- `loadEngine(modelSize)` — `POST /models/load` (downloads once, then cached).
- `unloadEngine(...)` / `unloadAll()` — free that engine's RAM but keep the backend up
  between scenes/jobs.
- `killBackend()` — terminate the process for **zero RAM footprint** until the next run.
- Config via env: `VOICEBOX_API_URL` (default `http://127.0.0.1:17493`),
  `VOICEBOX_BACKEND_DIR` (default `C:/one/voicebox` or `./voicebox`),
  `VOICEBOX_PYTHON` (default `<backend_dir>/.venv/Scripts/python.exe`), `VOICEBOX_PORT`.

The controller **fails safe**: if the backend can't start or the engine can't load, the
caller falls back to Edge-TTS (existing null-safe behavior in `src/lib/voice-generator.ts`
and `src/agentic/tts.ts` tone fallback). Voicebox is never on the critical path.

## Consequences

**Good:**
- RAM is freed precisely when not needed (unload between jobs, kill at end), protecting the
  6 GB laptop from OOM during render/fetch.
- Voice cloning is available on capable machines with **zero impact** on default free runs.
- The pipeline never hard-fails because Voicebox is missing — graceful degradation.

**Trade-offs:**
- Spawn + model-load adds latency on first use (up to ~40s poll + ~180s load, both bounded
  by timeouts); acceptable because it's opt-in and off the default path.
- An extra process to manage; the lifecycle controller centralizes that complexity so
  callers stay simple.

**Rejected alternative:** keeping Voicebox (or any heavy TTS) resident for the whole run —
ruled out by the RAM constraint on the target hardware.
