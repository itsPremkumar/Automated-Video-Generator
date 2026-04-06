# Architecture

This document describes the current code organization of the project after the multi-runtime refactor.

## Overview

The project supports multiple runtimes that all share one application core:

- HTTP API and local web portal
- Electron desktop app
- CLI
- MCP server for Claude Desktop, Claude Code, OpenClaw, and similar clients

The guiding rule is:

`all runtime inputs -> PipelineAppService -> shared job orchestration -> consistent output`

No runtime should implement its own pipeline lifecycle.

## Current Structure

```text
src/
  adapters/
    cli/
      cli-runner.ts
    http/
      ai-controller.ts
      api-helpers.ts
      api-routes.ts
      file-routes.ts
      files-controller.ts
      jobs-controller.ts
      scenes-controller.ts
      server-bootstrap.ts
      setup-controller.ts
      videos-controller.ts
      view-controller.ts
      view-routes.ts
    mcp/
      env-tools.ts
      input-store.ts
      output-store.ts
      pipeline-commands.ts
      register-admin-tools.ts
      register-input-tools.ts
      register-job-tools.ts
      register-output-tools.ts
      responses.ts
  application/
    ai-app.service.ts
    diagnostics.service.ts
    filesystem-app.service.ts
    media-app.service.ts
    pipeline-app.service.ts
    portal-app.service.ts
    scene-app.service.ts
    setup.service.ts
  infrastructure/
    filesystem/
      local-filesystem.ts
    persistence/
      job-store.ts
    pipeline/
      scene-editor.ts
  shared/
    capabilities.ts
    contracts/
      job.contract.ts
    http/
      public-url.ts
    logging/
      runtime-logging.ts
    runtime/
      paths.ts
  services/
    ai.service.ts
    env.service.ts
    health.service.ts
    job.service.ts
    video.service.ts
  app.ts
  cli.ts
  mcp-prompts.ts
  mcp-resources.ts
  mcp-server.ts
  render.ts
  runtime.ts
  server.ts
  video-generator.ts

electron/
  dependency-service.ts
  electron-main.ts
  electron-preload.ts
  ipc.ts
  server-manager.ts
  window-manager.ts
```

## Layer Responsibilities

### `application/`

This is the shared application layer.

- [src/application/pipeline-app.service.ts](/c:/one/Automated-Video-Generator/src/application/pipeline-app.service.ts) is the main facade for job lifecycle operations.
- [src/application/setup.service.ts](/c:/one/Automated-Video-Generator/src/application/setup.service.ts) centralizes setup status and environment update orchestration.
- [src/application/diagnostics.service.ts](/c:/one/Automated-Video-Generator/src/application/diagnostics.service.ts) exposes cross-runtime diagnostics behavior.
- [src/application/media-app.service.ts](/c:/one/Automated-Video-Generator/src/application/media-app.service.ts) owns published video and job-response use cases for HTTP and view adapters.
- [src/application/filesystem-app.service.ts](/c:/one/Automated-Video-Generator/src/application/filesystem-app.service.ts) exposes file-management use cases without embedding raw filesystem mechanics.
- [src/application/scene-app.service.ts](/c:/one/Automated-Video-Generator/src/application/scene-app.service.ts) owns scene editing and AI-assisted refinement orchestration.
- [src/application/portal-app.service.ts](/c:/one/Automated-Video-Generator/src/application/portal-app.service.ts) provides the local portal view layer with structured page data.

### `adapters/`

These modules translate runtime-specific inputs and outputs.

- HTTP: Express feature controllers, route wiring, file responses, view rendering, and server bootstrap
- CLI: batch runner and command-line workflow
- MCP: tool registration, prompt/resource surface, and MCP-friendly file/env helpers

Adapters should validate input, call shared services, and format output. They should not own business logic.

### `infrastructure/`

This contains runtime-independent implementation details that back the application layer.

- [src/infrastructure/persistence/job-store.ts](/c:/one/Automated-Video-Generator/src/infrastructure/persistence/job-store.ts) persists and recovers tracked jobs.
- [src/infrastructure/filesystem/local-filesystem.ts](/c:/one/Automated-Video-Generator/src/infrastructure/filesystem/local-filesystem.ts) contains local filesystem and OS-level file browser operations.
- [src/infrastructure/pipeline/scene-editor.ts](/c:/one/Automated-Video-Generator/src/infrastructure/pipeline/scene-editor.ts) contains scene mutation and media regeneration mechanics extracted from the main generator file.

### `shared/`

This is the cross-runtime foundation.

- [src/shared/contracts/job.contract.ts](/c:/one/Automated-Video-Generator/src/shared/contracts/job.contract.ts) defines shared job request and status contracts.
- [src/shared/http/public-url.ts](/c:/one/Automated-Video-Generator/src/shared/http/public-url.ts) owns base URL and absolute URL generation for HTTP-facing links.
- [src/shared/runtime/paths.ts](/c:/one/Automated-Video-Generator/src/shared/runtime/paths.ts) owns project/resource path resolution.
- [src/shared/logging/runtime-logging.ts](/c:/one/Automated-Video-Generator/src/shared/logging/runtime-logging.ts) owns runtime-aware console behavior.
- [src/shared/capabilities.ts](/c:/one/Automated-Video-Generator/src/shared/capabilities.ts) describes runtime capability flags.

## Main Entry Points

### HTTP

- [src/app.ts](/c:/one/Automated-Video-Generator/src/app.ts) builds the Express app.
- [src/adapters/http/jobs-controller.ts](/c:/one/Automated-Video-Generator/src/adapters/http/jobs-controller.ts), [src/adapters/http/setup-controller.ts](/c:/one/Automated-Video-Generator/src/adapters/http/setup-controller.ts), [src/adapters/http/videos-controller.ts](/c:/one/Automated-Video-Generator/src/adapters/http/videos-controller.ts), [src/adapters/http/scenes-controller.ts](/c:/one/Automated-Video-Generator/src/adapters/http/scenes-controller.ts), [src/adapters/http/files-controller.ts](/c:/one/Automated-Video-Generator/src/adapters/http/files-controller.ts), and [src/adapters/http/ai-controller.ts](/c:/one/Automated-Video-Generator/src/adapters/http/ai-controller.ts) are the feature-oriented HTTP controller layer.
- [src/adapters/http/server-bootstrap.ts](/c:/one/Automated-Video-Generator/src/adapters/http/server-bootstrap.ts) owns reusable server startup.
- [src/server.ts](/c:/one/Automated-Video-Generator/src/server.ts) is now only the executable entrypoint.

### CLI

- [src/cli.ts](/c:/one/Automated-Video-Generator/src/cli.ts) is the executable CLI entry.
- [src/adapters/cli/cli-runner.ts](/c:/one/Automated-Video-Generator/src/adapters/cli/cli-runner.ts) translates batch input into shared job requests.

### MCP

- [src/mcp-server.ts](/c:/one/Automated-Video-Generator/src/mcp-server.ts) boots the MCP server.
- [src/adapters/mcp/register-job-tools.ts](/c:/one/Automated-Video-Generator/src/adapters/mcp/register-job-tools.ts) handles pipeline-related tools.
- [src/mcp-resources.ts](/c:/one/Automated-Video-Generator/src/mcp-resources.ts) and [src/mcp-prompts.ts](/c:/one/Automated-Video-Generator/src/mcp-prompts.ts) define the read-only MCP surface.

### Electron

- [electron/electron-main.ts](/c:/one/Automated-Video-Generator/electron/electron-main.ts) is the desktop composition root.
- [electron/dependency-service.ts](/c:/one/Automated-Video-Generator/electron/dependency-service.ts) handles desktop dependency checks and repair.
- [electron/server-manager.ts](/c:/one/Automated-Video-Generator/electron/server-manager.ts) manages the backend server process.
- [electron/window-manager.ts](/c:/one/Automated-Video-Generator/electron/window-manager.ts) manages desktop windows and tray behavior.
- [electron/ipc.ts](/c:/one/Automated-Video-Generator/electron/ipc.ts) wires Electron IPC to shared services.

## Shared Pipeline Entry

The central application facade is [src/application/pipeline-app.service.ts](/c:/one/Automated-Video-Generator/src/application/pipeline-app.service.ts).

Current core operations:

- `createJob(request)`
- `createRenderReadyJob(request)`
- `continueJobToRender(jobId)`
- `cancelJob(jobId)`
- `retryJob(jobId)`
- `getJob(jobId)`
- `listJobs()`
- `waitForJobCompletion(jobId)`
- `getSetupStatus()`
- `getDiagnostics()`
- `repairRuntimeDependencies()`

## Runtime Safety Rules

- HTTP, CLI, MCP, and Electron all go through the shared application facade for job lifecycle operations.
- Shared job contracts come from `src/shared/contracts/`.
- Shared path and runtime helpers come from `src/shared/runtime/`.
- `src/runtime.ts` remains only as a compatibility barrel and should not be the preferred import target for new code.

## What Changed

These major cleanup steps have already happened:

- CLI no longer directly orchestrates generation and render logic.
- MCP no longer directly owns the pipeline lifecycle in a monolithic server file.
- HTTP route/controller wiring now lives under `src/adapters/http/` with feature-specific controllers instead of a monolithic API controller.
- Electron main has been split into focused modules.
- `src/server.ts` is now a thin executable entry.
- local portal view controllers now use application services instead of bypassing the newer application boundary directly.
- shared public URL generation now lives in `src/shared/http/public-url.ts`.
- filesystem operations and scene editing mechanics were moved into `src/infrastructure/`.
- Root-level legacy HTTP route/controller files and root-level legacy MCP tool files were removed.

## Remaining Low-Priority Cleanup

The architecture is now stable. Remaining cleanup is optional and lower priority:

- move more `src/services/*` modules into `application/` or `infrastructure/` based on responsibility
- reduce new usage of `src/runtime.ts` further until it can eventually be retired
- group `src/application/*` into feature subfolders when the current flat service list grows further
- expand adapter-level integration tests

## Recommended Import Direction

Prefer:

- `src/shared/contracts/*` for shared types
- `src/shared/runtime/*` for path/runtime helpers
- `src/shared/logging/*` for runtime-aware logging
- `src/infrastructure/persistence/*` for job persistence
- `src/application/*` for cross-runtime orchestration

Avoid adding new logic to:

- `src/runtime.ts`
- `src/server.ts`
- `src/mcp-server.ts`
- `electron/electron-main.ts`

Those should stay as thin composition or compatibility layers.
