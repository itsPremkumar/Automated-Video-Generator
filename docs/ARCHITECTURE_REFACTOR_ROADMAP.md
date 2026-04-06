# Architecture Refactor Roadmap

Status: the main refactor described here has now been implemented in the codebase.
Use [docs/ARCHITECTURE.md](./ARCHITECTURE.md) for the current architecture reference.

This project has crossed the point where it behaves like a single app with a few entry points. It now operates as a shared product platform with multiple runtimes:

- browser and HTTP API
- Electron desktop
- CLI
- MCP server
- MCP clients such as Claude Desktop, Claude Code, and OpenClaw

The current repo structure is still workable, but the main architectural risk is now `logic drift`: one runtime gets a fix, validation rule, or recovery behavior, while another runtime keeps using older pipeline logic.

The right next move is not a repo split. The right move is:

`one repo, one shared core, many thin adapters`

## Executive Summary

This roadmap has effectively been completed in phases:

- shared pipeline orchestration now lives in `src/application/pipeline-app.service.ts`
- CLI runs through `src/adapters/cli/cli-runner.ts`
- HTTP runs through `src/adapters/http/*`
- MCP runs through `src/adapters/mcp/*`
- Electron desktop responsibilities are split under `electron/*`
- `src/runtime.ts` is now a compatibility barrel rather than the active home of path, logging, and persistence logic

## Current Strengths

- The HTTP stack now follows a cleaner adapter pattern under `src/adapters/http/`.
- Validation is separated in `src/schemas/api.schemas.ts`.
- MCP prompt and resource definitions are already split into `src/mcp-prompts.ts` and `src/mcp-resources.ts`.
- The repo still fits well inside a single deployment and release unit.

## Core Problems To Fix

### 1. Orchestration duplication

This was the main original risk and is the part that has now been addressed. All main runtime entry points flow through the shared application facade.

### 2. Runtime concentration

This has been partially addressed. `src/runtime.ts` is now a compatibility barrel over split modules in `src/shared/runtime/`, `src/shared/logging/`, and `src/infrastructure/persistence/`.

### 3. Electron main concentration

This has also been addressed. Electron responsibilities are now split into dedicated modules:

- `electron/dependency-service.ts`
- `electron/server-manager.ts`
- `electron/window-manager.ts`
- `electron/ipc.ts`

### 4. Shared contracts are not yet truly shared

Input definitions are split across runtime-specific shapes:

- CLI job shape in `src/cli.ts`
- HTTP schemas in `src/schemas/api.schemas.ts`
- MCP tool schema in `src/mcp-server.ts`

The longer this remains true, the more likely it becomes that one adapter accepts data that another rejects.

### 5. Bootstrap and dependency checks

This is improved but still the main remaining low-priority cleanup area. Bootstrap behavior is much cleaner now, but diagnostics/setup logic can still be consolidated further over time.

## Target Architecture

```text
src/
  domain/
    jobs/
    pipeline/
    outputs/
    voices/
  application/
    jobs/
    setup/
    diagnostics/
  adapters/
    http/
    cli/
    mcp/
    electron/
  infrastructure/
    persistence/
    filesystem/
    ai/
    tts/
    render/
    media/
  shared/
    contracts/
    config/
    errors/
    logging/
    capabilities/
```

Layer rules:

- `domain`: pure rules and core types, with no runtime or transport assumptions.
- `application`: use cases and orchestration.
- `adapters`: HTTP, CLI, MCP, and Electron translation only.
- `infrastructure`: file system, ffmpeg, TTS, media providers, persistence.
- `shared`: contracts, config, logging, error types, capability flags.

## Phase 1: Unify Job Orchestration

This is the highest-value change and should happen before any large folder move.

Create one shared application facade, for example `PipelineAppService`, that becomes the only entry point for job lifecycle operations.

Suggested surface:

- `createJob(request)`
- `continueJobToRender(jobId)`
- `cancelJob(jobId)`
- `retryJob(jobId)`
- `getJob(jobId)`
- `listJobs()`
- `getSetupStatus()`
- `repairRuntimeDependencies()`

Adapters should then become thin:

- HTTP controllers call the facade.
- CLI commands call the facade.
- MCP tools call the facade.
- Electron IPC calls the facade.

Phase 1 acceptance criteria:

- no adapter calls `generateVideo()` directly
- no adapter calls `renderVideo()` directly for normal job flow
- retry and cancel behavior are defined in one place
- status transitions are consistent across HTTP, CLI, MCP, and desktop

## Phase 2: Split Runtime and Contracts

Refactor `src/runtime.ts` into smaller modules with single responsibilities, such as:

- `shared/runtime/paths.ts`
- `shared/logging/runtime-logger.ts`
- `shared/contracts/job.ts`
- `infrastructure/persistence/job-store.ts`

Goal:

- runtime detection stops owning job persistence
- job contracts stop living beside path and logging helpers
- job recovery logic can be tested without loading unrelated runtime utilities

Phase 2 acceptance criteria:

- runtime helpers are side-effect free
- job store can be imported and tested independently
- job request and status types are imported by all adapters from one place

## Phase 3: Break Up Electron Main

Split `electron/electron-main.ts` into focused modules, for example:

- `electron/services/dependency-service.ts`
- `electron/services/server-manager.ts`
- `electron/windows/window-manager.ts`
- `electron/setup/setup-flow.ts`
- `electron/ipc/register-ipc.ts`

Goal:

- desktop setup and repair logic can evolve without touching tray or window code
- backend server startup can be tested and reasoned about independently
- IPC handlers become a thin adapter layer instead of a second app core

Phase 3 acceptance criteria:

- `electron-main.ts` becomes a small composition root
- dependency repair logic is callable outside Electron UI concerns
- IPC registration no longer contains business rules

## Phase 4: Modularize MCP

The MCP layer is already partway there because prompts and resources are split. The next step is to move inline tool registration and execution out of `src/mcp-server.ts`.

Suggested split:

- `src/adapters/mcp/register-job-tools.ts`
- `src/adapters/mcp/register-input-tools.ts`
- `src/adapters/mcp/register-output-tools.ts`
- `src/adapters/mcp/register-admin-tools.ts`

Goal:

- tool schemas stay close to tool registration
- tool handlers call shared application services
- MCP becomes another adapter, not another pipeline implementation

Phase 4 acceptance criteria:

- `mcp-server.ts` mainly boots the server and wires registrars
- MCP tool handlers no longer manage long-running pipeline steps directly

## Phase 5: Add Runtime Capabilities

Introduce a shared capability matrix, for example in `src/shared/capabilities.ts`.

Example capabilities:

- `desktop`: native dialogs, setup repair, tray, installer recovery
- `browser`: local portal actions, review UI, job status display
- `cli`: batch mode, resume mode, segment mode
- `mcp`: tool-safe operations, text-only status, non-UI job control

Why this matters:

- adapters can hide unsupported operations up front
- features stop leaking accidentally from one runtime to another
- future client integrations stay aligned with explicit runtime rules

Phase 5 acceptance criteria:

- adapters consult shared capability rules before exposing runtime-specific actions
- unsupported features fail predictably with clear errors

## Phase 6: Unify Diagnostics and Setup

Replace duplicated bootstrap checks in desktop and MCP with a reusable diagnostics service.

Suggested ownership:

- `application/setup/get-setup-status.ts`
- `application/setup/repair-runtime-dependencies.ts`
- runtime-specific renderers in CLI, Electron, and MCP

Goal:

- one dependency truth
- multiple runtime-specific presentations

## What Was Implemented

The codebase now includes these key changes:

- shared job orchestration through `src/application/pipeline-app.service.ts`
- shared contracts in `src/shared/contracts/job.contract.ts`
- shared runtime helpers in `src/shared/runtime/paths.ts`
- shared runtime logging in `src/shared/logging/runtime-logging.ts`
- persistent job storage in `src/infrastructure/persistence/job-store.ts`
- HTTP adapters under `src/adapters/http/`
- CLI adapter under `src/adapters/cli/`
- MCP adapters under `src/adapters/mcp/`
- Electron module split under `electron/`
- `src/server.ts` reduced to a thin executable entrypoint

## Testing Strategy

The test plan should mirror the architecture:

- contract tests for shared request and response schemas
- application-service tests for create, retry, cancel, resume, and recovery
- adapter tests for HTTP, CLI, MCP, and Electron IPC
- one cross-runtime test that proves the same request yields the same persisted job behavior
- installer and packaged desktop smoke tests for Windows

## What Not To Do

- do not split this into multiple repos yet
- do not create separate business logic for Claude Desktop, Claude Code, and OpenClaw
- do not keep adding pipeline logic directly into CLI or MCP handlers
- do not keep expanding `src/runtime.ts` or `electron/electron-main.ts` as catch-all files

## Recommended Sequence

1. Build the shared application facade and move CLI and MCP onto it.
2. Extract shared job contracts and job persistence out of `runtime.ts`.
3. Move diagnostics and dependency checks into a reusable setup service.
4. Break up Electron main into composition, setup, server, windows, and IPC.
5. Finish MCP modularization around thin tool registrars.
6. Add cross-runtime contract and orchestration tests.

## Bottom Line

The refactor direction described in this roadmap is now the active project structure. The repo remains a single repository with a shared application core and thin runtime adapters.

Use [docs/ARCHITECTURE.md](./ARCHITECTURE.md) for the up-to-date reference.
