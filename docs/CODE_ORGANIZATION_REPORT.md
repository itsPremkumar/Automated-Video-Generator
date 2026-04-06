# Code Organization Report

Date: 2026-04-06
Status: current

## Summary

The project is now in a good organizational state.

It supports multiple runtimes from one shared codebase:

- local web portal and HTTP API
- CLI
- MCP
- Electron desktop
- MCP clients such as Claude Desktop, Claude Code, and OpenClaw

The current architecture is:

`one repo + one shared application core + thin runtime adapters`

That is the right model for this project.

## Current Assessment

Overall code organization: good

What is now strong:

- job lifecycle orchestration is centralized
- HTTP controllers are split by feature
- view controllers now go through application services
- filesystem mechanics are in infrastructure
- scene editing mechanics are in infrastructure
- Electron responsibilities are split into focused modules
- MCP tool registration is modular
- shared contracts and shared runtime helpers are clearly separated

## Current Layer Model

### `adapters/`

Runtime-specific translation layers.

- HTTP controllers and routes
- CLI runner
- MCP tool registrars

Adapters should:

- validate or normalize runtime input
- call application services
- format runtime output

Adapters should not own core business rules.

### `application/`

Shared use-case layer.

This is where cross-runtime orchestration should live.

Current examples:

- pipeline lifecycle
- portal page data composition
- media and job response composition
- setup and diagnostics orchestration
- scene editing orchestration

### `infrastructure/`

Implementation details and system-facing mechanics.

Current examples:

- job persistence
- local filesystem operations
- scene mutation and media regeneration mechanics

### `shared/`

Cross-cutting helpers used across layers.

Current examples:

- job contracts
- runtime path helpers
- runtime logging
- public URL generation
- runtime capability rules

### `services/`

This folder is still the main transition area.

It currently contains older core modules that still work well, but are not yet perfectly classified into final homes.

## What Was Fixed

These earlier organization problems have already been addressed:

- monolithic HTTP API controller was removed
- API controllers were split into focused modules
- view layer no longer bypasses the application layer for main page data
- filesystem-heavy code moved out of application into infrastructure
- scene editing logic moved out of `video-generator.ts` into infrastructure
- public URL helpers moved into `shared/http/`

## Remaining Organization Work

No major reorganization is required now.

Only low-priority refinement remains.

### 1. Reclassify `src/services/*`

This is the main remaining cleanup area.

Likely long-term direction:

- `job.service.ts`: application or infrastructure pipeline module
- `video.service.ts`: split media query logic and URL-aware output helpers more clearly
- `env.service.ts`: setup/config persistence module
- `health.service.ts`: diagnostics module
- `ai.service.ts`: infrastructure AI provider module

### 2. Group `application/` by feature when it grows more

Right now the flat `application/` folder is still manageable.

If more app services are added, a grouped structure will help:

```text
application/
  jobs/
  setup/
  diagnostics/
  media/
  portal/
  scenes/
```

### 3. Expand integration testing

The architecture is now good enough that the main remaining risk is behavior drift, not file layout drift.

The best protection is more integration coverage across:

- HTTP
- CLI
- MCP
- Electron IPC where practical

## Final Verdict

Does the project still need code organization work?

Short answer:

- no major organization work
- yes, a little optional cleanup remains

The codebase is now structurally stable.

Future effort should focus more on:

- behavior consistency
- test coverage
- gradual service reclassification

not on large folder refactors.
