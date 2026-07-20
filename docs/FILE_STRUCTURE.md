---
title: File Structure — Automated Video Generator
description: Complete file structure and directory layout of Automated Video Generator. Source code organization and project structure.
---
# File Structure

Date: 2026-07-20
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
  agentic/
  application/
  infrastructure/
  lib/
  shared/
  services/
  views/
  middleware/
  schemas/
  constants/
  types/
  app.ts
  cli.ts
  integration.pipeline.test.ts
  mcp-env-init.ts
  mcp-prompts.ts
  mcp-resources.ts
  mcp-server.ts
  pipeline-workspace.ts
  render.e2e.test.ts
  render.ts
  runtime-safety.test.ts
  runtime.ts
  server.ts
  video-generator.ts
```

- `app.ts`: Express application composition
- `cli.ts`: CLI executable entrypoint
- `mcp-server.ts`: MCP executable entrypoint
- `mcp-prompts.ts`, `mcp-resources.ts`, `mcp-env-init.ts`: MCP prompt/resource definitions and env bootstrap
- `pipeline-workspace.ts`: Pipeline workspace abstraction
- `render.ts`: Render pipeline entry
- `runtime.ts`: Compatibility barrel
- `video-generator.ts`: Legacy video generation entry point
- `integration.pipeline.test.ts`, `render.e2e.test.ts`, `runtime-safety.test.ts`: Integration/e2e/safety tests

## `src/adapters/`

Runtime-facing translation layers.

### `src/adapters/cli/`

```text
cli/
  batch-queue.test.ts
  batch-queue.ts
  cli-runner.ts
```

- CLI argument handling, batch queue, and batch job execution flow

### `src/adapters/http/`

```text
http/
  agentic-controller.ts
  ai-controller.ts
  api-helpers.test.ts
  api-helpers.ts
  api-routes.test.ts
  api-routes.ts
  file-routes.ts
  files-controller.ts
  free-video-controller.ts
  jobs-controller.ts
  scenes-controller.ts
  server-bootstrap.test.ts
  server-bootstrap.ts
  setup-controller.ts
  social-download-controller.ts
  video-download-controller.ts
  videos-controller.test.ts
  videos-controller.ts
  view-controller.ts
  view-routes.ts
```

- Feature-based Express controllers (agentic, AI, files, free-video, jobs, scenes, setup, social-download, video-download, videos)
- API routing and view routing
- File download and media response routes
- Shared HTTP helper functions

### `src/adapters/mcp/`

```text
mcp/
  driver-llm.test.ts
  driver-llm.ts
  env-tools.test.ts
  env-tools.ts
  input-store.test.ts
  input-store.ts
  output-store.ts
  pipeline-commands.test.ts
  pipeline-commands.ts
  register-admin-tools.ts
  register-agentic-tools.ts
  register-free-video-tools.ts
  register-input-tools.ts
  register-job-tools.ts
  register-operations-tools.ts
  register-output-tools.ts
  responses.ts
```

- MCP tool registration for admin, agentic, free-video, input, job, operations, output domains
- LLM driver for agentic MCP operations
- MCP-specific file, input, output helpers
- MCP-safe response formatting

## `src/agentic/`

Agentic video pipeline — fully agent-controlled, no external AI required. Every decision (script, keywords, asset fetch, verification, render gate) is made by the agent.

```text
agentic/
  acquire.fallback.test.ts
  acquire.test.ts
  acquire.ts
  agent.ts
  agentic.test.ts
  ai-verify.test.ts
  ai-verify.ts
  archive.test.ts
  archive.ts
  asset-checks.test.ts
  asset-checks.ts
  autopilot.test.ts
  autopilot.ts
  brain.test.ts
  brain.ts
  bridge.test.ts
  bridge.ts
  config.test.ts
  config.ts
  contact-sheet.test.ts
  enhancement.test.ts
  export.test.ts
  export.ts
  gate.test.ts
  gate.ts
  gateway.ts
  job.test.ts
  job.ts
  localize.test.ts
  localize.ts
  operations/
  orchestrate.pure.test.ts
  orchestrate.ts
  orchestrate/
  plan.test.ts
  plan.ts
  plugins/
  prepareRemotionAssets.test.ts
  publish.test.ts
  publish.ts
  render.test.ts
  revision.test.ts
  revision.ts
  scene-edit.test.ts
  scene-edit.ts
  sfx-selector.ts
  source-attribution.test.ts
  style-engine.ts
  tts.test.ts
  tts.ts
  types.ts
  verify.ts
  video-analyzer.test.ts
  video-analyzer.ts
  workspace.ts
```

- `acquire.ts`: Asset acquisition (images, video, audio) with fallback
- `agent.ts`: Agent decision-making core
- `ai-verify.ts`: AI-powered content verification
- `archive.ts`: Pipeline archiving
- `asset-checks.ts`: Per-asset signal verification
- `autopilot.ts`: One-shot topic-to-video self-healing pipeline
- `brain.ts`: Agent reasoning and planning
- `bridge.ts`: Cross-pipeline bridge utilities
- `config.ts`: Pipeline configuration, presets, profiles
- `export.ts`: Multi-aspect export, social metadata, branded thumbnails, karaoke, A/B variants
- `gate.ts`: Pre-render (X1–X6) and post-render (X7–X15) quality gates
- `gateway.ts`: API gateway for agentic operations
- `job.ts`: Job lifecycle management
- `localize.ts`: Localization utilities
- `orchestrate.ts`: Main pipeline orchestrator
- `plan.ts`: Script planning and scene structuring
- `publish.ts`: Publishing pipeline
- `render.test.ts`, `revision.ts`: Render and revision management
- `scene-edit.ts`: Scene editing API (reorder, delete, update, insert)
- `sfx-selector.ts`: Sound effect selection
- `style-engine.ts`: Per-scene transitions, grades, kinetic-text cues
- `tts.ts`: Text-to-speech voice synthesis
- `verify.ts`: Verification utilities
- `video-analyzer.ts`: Black frame detection, audio loudness, freeze detection

### `src/agentic/operations/`

```text
operations/
  audio-track.ts
  brand.ts
  captions.ts
  convert.ts
  demux.ts
  derivative.ts
  dispatch.ts
  download-media.ts
  edit.ts
  grade.ts
  image-video.ts
  integration.test.ts
  localize.ts
  motion.ts
  new-features.test.ts
  noise.ts
  operations.test.ts
  overlay.ts
  probe.ts
  reframe.ts
  retry.test.ts
  retry.ts
  route.test.ts
  route.ts
  scene.ts
  script.ts
  security.test.ts
  security.ts
  silence.ts
  social-dl.ts
  split.ts
  voiceover.ts
```

- Atomic ffmpeg/general operations used by the pipeline: audio track mixing, branding, captions, format conversion, demuxing, derivatives, dispatch, media download, scene editing, color grading, image-to-video, localization, motion effects, noise reduction, overlays, media probing, reframing, retry logic, routing, scene/script operations, security scanning, silence detection, social media downloads, video splitting, voiceover generation

### `src/agentic/orchestrate/`

```text
orchestrate/
  artifacts.ts
  captions.ts
  ffmpeg.ts
  index.ts
  pipeline.ts
  remotion.ts
  render.ts
  source.ts
  types.ts
```

- `pipeline.ts`: Pipeline orchestration engine
- `render.ts`: Render orchestration
- `ffmpeg.ts`: FFmpeg execution orchestration
- `remotion.ts`: Remotion rendering orchestration
- `captions.ts`: Caption orchestration
- `artifacts.ts`: Artifact management
- `source.ts`: Source resolution
- `types.ts`: Shared orchestration types

### `src/agentic/plugins/`

```text
plugins/
  audio/
    ambience-layer.ts
    audio-ducking.ts
    beat-sync.ts
    normalize-loudness.ts
  color/
    color-wheels.ts
    film-grain.ts
    halation.ts
    lut-loader.ts
  core/
    loader.ts
    registry.ts
    types.ts
  genres/
    genre-style.ts
  motion/
    ken-burns-pro.ts
    parallax.ts
    punch-in.ts
    shake.ts
    speed-ramp.ts
  overlays/
    dynamic-captions.ts
    lower-third.ts
    progress-bar.ts
    safe-zones.ts
    typewriter.ts
    watermark.ts
  platforms/
    platform-export.ts
  transitions/
    advanced-transitions.ts
    glitch.ts
    light-leak.ts
    morph-cut.ts
    whip-pan.ts
  index.ts
  integration-example.ts
  plugin-config.schema.json
  plugins.test.ts
  README.md
```

- Plugin system with categories: audio effects, color grading, core registry, genre styles, motion effects, overlays, platform exports, transitions

## `src/application/`

Shared use-case layer.

```text
application/
  ai-app.service.ts
  diagnostics.service.ts
  filesystem-app.service.ts
  free-video-app.service.ts
  media-app.service.ts
  pipeline-app.service.test.ts
  pipeline-app.service.ts
  portal-app.service.ts
  scene-app.service.ts
  setup.service.ts
  social-download-app.service.ts
  video-download-app.service.ts
```

- `pipeline-app.service.ts`: Main shared pipeline facade
- `portal-app.service.ts`: Portal page data composition
- `media-app.service.ts`: Published video and job response composition
- `filesystem-app.service.ts`: Application-level file management use cases
- `scene-app.service.ts`: Scene editing orchestration
- `setup.service.ts`: Setup/env orchestration
- `diagnostics.service.ts`: Cross-runtime diagnostics
- `ai-app.service.ts`: AI-oriented application use cases
- `free-video-app.service.ts`: Free video source use cases
- `social-download-app.service.ts`: Social media download use cases
- `video-download-app.service.ts`: Video download use cases

## `src/infrastructure/`

System-facing implementation modules.

```text
infrastructure/
  filesystem/
    local-filesystem.test.ts
    local-filesystem.ts
  persistence/
    job-store.ts
  pipeline/
    scene-editor.ts
```

- `local-filesystem.ts`: File browsing, file copy/delete, path-based file serving helpers
- `job-store.ts`: Tracked job persistence and lookup
- `scene-editor.ts`: Scene mutation and regeneration mechanics

## `src/lib/`

Core business logic modules.

```text
lib/
  api-tts-provider.test.ts
  api-tts-provider.ts
  asset-cache.test.ts
  asset-cache.ts
  audio-processor.ts
  captions.test.ts
  captions.ts
  cleaner.test.ts
  cleaner.ts
  errors.test.ts
  errors.ts
  ffmpeg-text.ts
  ffmpeg.test.ts
  ffmpeg.ts
  free-image.test.ts
  free-image/
    adapter.ts
    http-client.ts
    index.ts
    models.ts
    providers/
      archive.ts
      metmuseum.ts
      nasa.ts
      wikimedia.ts
    utils.ts
  free-media/
    index.ts
  free-music.test.ts
  free-music.ts
  free-sfx.test.ts
  free-sfx/
    generator.ts
    index.ts
    local-provider.ts
    models.ts
  free-video/
    adapter.test.ts
    adapter.ts
    download/
      downloader.test.ts
      downloader.ts
    http-client.ts
    index.ts
    models.ts
    providers/
      archive.ts
      wikimedia.ts
    utils.ts
  job-cancellation.test.ts
  job-cancellation.ts
  logger.test.ts
  logger.ts
  media-downloader.test.ts
  media-downloader.ts
  media-verifier.test.ts
  media-verifier.ts
  music-verifier.ts
  net-safety.test.ts
  net-safety.ts
  ollama-bootstrap.test.ts
  ollama-bootstrap.ts
  ollama-client.test.ts
  ollama-client.ts
  openverse-fetcher.test.ts
  openverse-fetcher.ts
  path-safety.test.ts
  path-safety.ts
  pexels.ts
  python-runtime.ts
  script-parser.test.ts
  script-parser.ts
  validation.test.ts
  validation.ts
  video-downloader-service.ts
  visual-fetcher.free-image.test.ts
  visual-fetcher.test.ts
  visual-fetcher.ts
  voice-data.ts
  voice-engine.test.ts
  voice-engine.ts
  voice-generator.ts
  voice-types.ts
  voicebox-lifecycle.ts
```

- `free-image/`: Free image source abstraction with providers (Internet Archive, Met Museum, NASA, Wikimedia)
- `free-video/`: Free video source abstraction with providers (Internet Archive, Wikimedia) and download utilities
- `free-sfx/`: Free sound effects generation (local provider, generator)
- `free-media/`: Free media barrel/index
- `captions.ts`: Caption generation for video overlay
- `ffmpeg.ts`, `ffmpeg-text.ts`: FFmpeg execution and text overlay helpers
- `visual-fetcher.ts`: Visual media fetching with multi-source fallback
- `script-parser.ts`: Script parsing for the legacy workflow
- `voice-engine.ts`, `voice-generator.ts`, `voice-types.ts`, `voice-data.ts`, `voicebox-lifecycle.ts`: Voice synthesis engine
- `asset-cache.ts`: Local asset caching
- `media-downloader.ts`, `media-verifier.ts`, `music-verifier.ts`: Download and verification
- `path-safety.ts`, `net-safety.ts`: Safety utilities
- `ollama-client.ts`, `ollama-bootstrap.ts`: Ollama AI integration
- `pexels.ts`: Pexels API client
- `openverse-fetcher.ts`: Openverse media fetcher
- `logger.ts`, `errors.ts`: Logging and error utilities
- `cleaner.ts`, `validation.ts`: Cleanup and validation utilities
- `job-cancellation.ts`: Job cancellation support
- `python-runtime.ts`: Python runtime integration
- `audio-processor.ts`: Audio processing utilities
- `sub-modules/video-downloader/`: Video download service
- `api-tts-provider.ts`: API-based TTS provider

## `src/shared/`

Cross-cutting utilities and contracts.

```text
shared/
  capabilities.ts
  contracts/
    job.contract.test.ts
    job.contract.ts
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
  home/
    index.ts
    helpers.ts
    components/
      browser-modal.component.ts
      hero.component.ts
      library.component.ts
      setup.component.ts
      tips.component.ts
      workspace.component.ts
    scripts/
      browser.ts
      dom.ts
      form.ts
      index.ts
      setup.ts
      utils.ts
      voices.ts
  job-status.view.ts
  layout.view.ts
  video-download.view.ts
  watch.view.ts
```

- `home/`: Home page directory with component-based architecture
- `video-download.view.ts`: Video download page
- `job-status.view.ts`: Job status page
- `layout.view.ts`: Common page layout
- `watch.view.ts`: Video watch page

## `src/middleware/`

```text
middleware/
  error-handler.ts
  local-only.ts
  rate-limit.test.ts
  rate-limit.ts
  request-context.ts
```

- request-local protections
- error shaping
- rate limiting
- request logging/context helpers

## `src/schemas/`

```text
schemas/
  api.schemas.ts
```

API request/response schema definitions.

## `src/types/`

```text
types/
  server.types.ts
```

Server-level TypeScript type definitions.

## `src/constants/`

```text
constants/
  config.ts
```

Application-wide configuration constants.

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
  app-logger.ts
  debug-runtime.ts
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
- application logging and debug runtime support

## Final Notes

The most important structural rule for this repository is:

`adapters -> application -> lib/infrastructure/shared`

The `services/` directory is the only major remaining transition area, but the current structure is already stable and production-usable.
