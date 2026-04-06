# Production and Desktop Hardening Guide

This document summarizes the production-readiness work implemented across the API, job pipeline, rendering flow, and Windows desktop app.

## Goals

The hardening work focused on:

- scalability under heavier load
- safer defaults for local and desktop usage
- cleaner controller and middleware structure
- better logging and error handling
- stronger fallback behavior
- improved release reliability for non-technical Windows users

This work now sits on top of the refactored runtime structure described in [ARCHITECTURE.md](./ARCHITECTURE.md).

## Backend and API Improvements

### Input validation

The HTTP layer now validates incoming request shapes before they reach generation logic.

Why this matters:

- prevents invalid payloads from crashing controller code
- makes errors predictable for both UI and API consumers
- reduces hidden assumptions in service code

### Centralized error handling

Error handling was moved toward shared middleware and typed application errors instead of scattered `try/catch` logic.

Benefits:

- consistent API responses
- easier logging
- easier future monitoring and alerting

### Structured logging and request context

The app now uses structured request logging and request identifiers so failures can be traced across controllers and background processing.

Benefits:

- easier debugging
- better post-failure analysis
- better operator visibility when multiple jobs are active

### Safer HTTP defaults

The web layer was tightened with safer defaults such as:

- stricter CORS behavior
- CSP support
- safer headers
- tighter setup and filesystem route protections

## Job Lifecycle and Fault Tolerance

### Bounded job queue

Heavy work no longer starts as unbounded background tasks.

This reduces:

- uncontrolled concurrency
- resource spikes
- instability during larger workloads

### Durable job state

Job metadata is persisted so the app can recover more cleanly after restarts.

Tracked state now includes:

- status
- phase
- progress
- retry count
- cancellation intent
- timestamps
- stored request snapshot

### Cancel, retry, and recovery

Jobs now support lifecycle control instead of only fire-and-forget execution.

Implemented behavior:

- queued jobs can be cancelled
- active jobs can stop at safe checkpoints
- failed or interrupted jobs can be retried
- interrupted jobs are recoverable after restart

### Render resume

Segmented rendering already allowed resume behavior, and the recovery flow now fits more cleanly with job orchestration.

This is especially useful for:

- long renders
- machine restarts
- render crashes in later stages

## Fallback and Resilience Strategy

### Voice generation fallback order

Narration is now more fault tolerant.

Current priority:

1. `Edge-TTS`
2. Windows offline speech fallback in packaged desktop mode
3. Google TTS fallback when available

This fixes the earlier problem where the app worked on a developer laptop only because Python or `edge-tts` was already installed globally.

### Health and setup reporting

Setup and health status now reflect the actual voice engine state instead of only checking one dependency.

That means the UI can report:

- Edge-TTS ready
- Windows voice ready
- fallback mode
- not ready

### Safer render defaults

Chromium web security is now enabled by default during rendering.

It can still be disabled for controlled debugging with:

```bash
set REMOTION_DISABLE_WEB_SECURITY=1
```

## Desktop Hardening

### Setup window launch flow

The setup wizard now has explicit launch behavior.

Before:

- launch and skip mainly closed the window
- the app could be left in a broken in-between state

Now:

- setup actions explicitly call back into the Electron main process
- the backend starts correctly
- the portal opens reliably
- early close exits cleanly

### Electron security improvements

Desktop security was improved with:

- sandboxed renderer windows
- guarded navigation
- guarded `window.open()`
- allowlisted `openExternal`

This reduces the attack surface for desktop usage.

### Release verification

Desktop packaging now includes explicit verification steps for both source inputs and unpacked release output.

This helps catch missing files before a user installs the app.

Verified artifacts include:

- bundled Python
- bundled `edge-tts.exe`
- setup HTML
- icons
- packaged desktop executable
- packaged runtime resources

## Maintainability Improvements

### Cleaner separation of concerns

The codebase now has clearer boundaries between:

- adapters
- application services
- infrastructure
- shared runtime/contracts
- renderer integration
- Electron shell logic

### More explicit state transitions

Job state is now easier to reason about because the lifecycle is represented more explicitly in runtime data.

### Documentation and operator clarity

The desktop and setup flow is now documented instead of relying on assumptions from a developer machine.

## Recommended Verification Workflow

For backend changes:

```bash
npx tsc -p tsconfig.json --noEmit
```

For Electron changes:

```bash
cmd /c node_modules\.bin\tsc.cmd -p tsconfig.electron.json --noEmit
```

For desktop bundle input verification:

```bash
npm run electron:verify-bundle
```

For unpacked Windows release verification:

```bash
npm run electron:verify-release
```

## Remaining Recommended Work

The repo is in a much better place now, but these are still strong next steps:

1. Replace JSON job persistence with SQLite or another embedded durable store.
2. Add automated integration tests for the main generation and packaged desktop flows.
3. Add rotating file logs and diagnostics export for the Windows app.
4. Add auto-update flow and crash reporting.
5. Add clean persistent settings storage for desktop configuration.

## Related Docs

- [../README.md](../README.md)
- [../QUICKSTART.md](../QUICKSTART.md)
- [SETUP.md](./SETUP.md)
- [WINDOWS_INSTALLER.md](./WINDOWS_INSTALLER.md)
- [ARCHITECTURE.md](./ARCHITECTURE.md)
