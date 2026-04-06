# File Structure

Date: 2026-04-06
Status: current

This document shows the current repository structure and explains what each area is responsible for.

## Top Level

```text
src/        main backend and shared runtime code
electron/   desktop runtime integration
docs/       project and architecture documentation
assets/     desktop and repository branding assets
public/     static web assets
input/      source scripts and user-provided media inputs
output/     generated job output folders
scripts/    developer and packaging scripts
remotion/   video rendering composition files
```

## `src/`

```text
src/
  adapters/
  application/
  infrastructure/
  shared/
  services/
  views/
  middleware/
  schemas/
  constants/
  types/
  app.ts
  server.ts
  cli.ts
  mcp-server.ts
  mcp-prompts.ts
  mcp-resources.ts
  render.ts
  runtime.ts
  pipeline-workspace.ts
  video-generator.ts
```

## `src/adapters/`

Runtime-facing translation layers.

### `src/adapters/cli/`

```text
cli/
  cli-runner.ts
```

- CLI argument handling and batch job execution flow

### `src/adapters/http/`

```text
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
```

- feature-based Express controllers
- API routing and view routing
- file download and media response routes
- shared HTTP helper functions

### `src/adapters/mcp/`

```text
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
```

- MCP tool registration
- MCP-specific file and output helpers
- MCP-safe response formatting

## `src/application/`

Shared use-case layer.

```text
application/
  ai-app.service.ts
  diagnostics.service.ts
  filesystem-app.service.ts
  media-app.service.ts
  pipeline-app.service.ts
  pipeline-app.service.test.ts
  portal-app.service.ts
  scene-app.service.ts
  setup.service.ts
```

- `pipeline-app.service.ts`: main shared pipeline facade
- `portal-app.service.ts`: portal page data composition
- `media-app.service.ts`: published video and job response composition
- `filesystem-app.service.ts`: application-level file management use cases
- `scene-app.service.ts`: scene editing orchestration
- `setup.service.ts`: setup/env orchestration
- `diagnostics.service.ts`: cross-runtime diagnostics
- `ai-app.service.ts`: AI-oriented application use cases

## `src/infrastructure/`

System-facing implementation modules.

```text
infrastructure/
  filesystem/
    local-filesystem.ts
  persistence/
    job-store.ts
  pipeline/
    scene-editor.ts
```

- `local-filesystem.ts`: file browsing, file copy/delete, path-based file serving helpers
- `job-store.ts`: tracked job persistence and lookup
- `scene-editor.ts`: scene mutation and regeneration mechanics

## `src/shared/`

Cross-cutting utilities and contracts.

```text
shared/
  capabilities.ts
  contracts/
    job.contract.ts
    job.contract.test.ts
  http/
    public-url.ts
  logging/
    runtime-logging.ts
  runtime/
    paths.ts
```

- contracts shared across runtimes
- capability matrix for runtime-safe behavior
- URL generation helpers
- logging helpers
- runtime path resolution

## `src/services/`

Legacy-but-active core modules still used by the application layer.

```text
services/
  ai.service.ts
  env.service.ts
  health.service.ts
  job.service.ts
  video.service.ts
```

These are still valid parts of the app, but they are the main remaining transition area for future cleanup.

## `src/views/`

HTML page builders for the local portal.

```text
views/
  home.view.ts
  job-status.view.ts
  layout.view.ts
  watch.view.ts
```

## `src/middleware/`

```text
middleware/
  error-handler.ts
  local-only.ts
  rate-limit.ts
  request-context.ts
```

- request-local protections
- error shaping
- rate limiting
- request logging/context helpers

## Entry Files

```text
app.ts         express application composition
server.ts      HTTP executable entrypoint
cli.ts         CLI executable entrypoint
mcp-server.ts  MCP executable entrypoint
render.ts      render pipeline entry
runtime.ts     compatibility barrel
```

## `electron/`

Desktop runtime composition.

```text
electron/
  dependency-service.ts
  electron-main.ts
  electron-preload.ts
  electron-setup.html
  ipc.ts
  server-manager.ts
  window-manager.ts
```

- dependency checks and setup flow
- backend server process lifecycle
- window and tray lifecycle
- IPC registration

## Final Notes

The most important structural rule for this repository is:

`adapters -> application -> infrastructure/shared`

The `services/` directory is the only major remaining transition area, but the current structure is already stable and production-usable.
