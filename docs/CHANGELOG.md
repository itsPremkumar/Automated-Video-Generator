# Changelog

All notable changes to the **Automated Video Generator** are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)  
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html)

---

## [Unreleased]

### Added
- **GPU acceleration** (`--gpu`): Hardware-accelerated rendering via `h264_amf`/`h264_nvenc`/`h264_qsv` depending on available GPU. Pass `--gpu` to `agentic-run.ts` or set `GPU_ACCEL=true` in `.env`.
- **Preview thumbnails:** Auto-generated per-scene preview images during rendering.
- **Dry-run mode** (`--dry-run`): Preview the full pipeline (script → plan → asset decisions) without downloading anything or rendering video.
- **Per-scene progress bar:** Real-time stage/percent/message progress callbacks during pipeline execution.
- **Unified workspace** (`workspaceFor`/`getAgenticWorkspace`): Single workspace layout shared across modular and batch pipelines, replacing two divergent implementations.
- **Subtitle/CC export:** SRT and VTT subtitle sidecars generated alongside rendered video. Chapter markers with `--chapters`.
- **Verbose ffmpeg logging** (`--verbose`): Full ffmpeg stderr visible during rendering (set `DEBUG_FF=1` in `.env`).
- **30-min global watchdog** (`AGENTIC_MAX_RUN_MS`): No pipeline run may wedge silently forever — default 30-min hard timeout, set `0` to disable.
- **Content gate for uniform placeholders** (`isUniformPlaceholderImage`): Solid-color/gradient images (placeholders that leaked into frames as real visuals) are now rejected at acquire time via ffmpeg signalstats analysis.
- **Honest source labeling** (`sourceFromUrl`): Media source attribution derived from actual URL host instead of hardcoded provider names — eliminates mislabeled "openverse/pexels" in rendered frames.
- **Human-readable placeholder labels:** Fallback placeholder images now burn the job title/keyword instead of raw filenames like `candidate_1.png`.
- **Download hardening:** Stalled downloads (stall timeout + unbounded connect/headers phases) are now bounded and guarded with unref'd interval timers — prevents pipeline hangs.
- **Per-scene visual filters** (`ScenePlan.filter`): Pipeline now propagates per-scene filter values (e.g. `vintage`, `noir`, `sunset`) all the way from plan → render.
- **Audio-less guards:** All editor operations (loop, reverse, transition, duck) handle audio-less inputs safely without crashing.
- **SFX decoupled from music:** Sound effects (cut effects) can play without a music bed.
- **Advanced fix tests:** Empirical verification of speed-ramp, punch-in, and other motion FX (M1/M2/M4).
- **CJK caption font support:** Drop unsupported drawtext `fontindex=0` for `.ttc` font files (fixes Chinese/Japanese/Korean caption rendering).
- **Chapter markers:** `--chapters` flag generates video chapter markers for timeline navigation.
- **agentic-clean command** (`npm run agentic:clean`): One-command temp workspace cleanup.
- **E2E test** for the full agentic pipeline (`tests/agentic/e2e/`): real ffmpeg render + vision frame analysis.
- **New modular CLI entrypoints:** `agentic:plan`, `agentic:visuals`, `agentic:voice`, `agentic:render`, `agentic:edit`, `agentic:revise`, `agentic:critique`, `agentic:reorder`, `agentic:audio`, `agentic:image`, `agentic:preview`, `agentic:generate` — each runs a single pipeline stage.
- **Batch mode presets:** `agentic:mode:plan`, `agentic:mode:images`, `agentic:mode:videos`, `agentic:mode:music`, `agentic:mode:voice-edgetts`, `agentic:mode:voice-voicebox`, `agentic:mode:clone`, `agentic:mode:sfx`, `agentic:mode:url`, `agentic:mode:advanced`, `agentic:mode:rerender`, `agentic:mode:compose` — fine-grained batch stage control.
- **New pipeline modules:** `asset-validators.ts` (content-level media validation), `source.ts` (URL-based provider resolution), `bundled-assets.ts` (offline CC0 music self-heal).
- **Input validation:** CLI flags (`--topic`, `--orientation`, `--backend`, `--format`) now fail fast with actionable error messages and exit code 2.

### Changed
- **Workspace layout:** All pipeline scratch files now live under `workspace/jobs/<jobId>/` (no system TEMP leaks). Agentic and batch pipelines share `workspaceFor()`/`getAgenticWorkspace()`.
- **Test resilience:** `--test-timeout=240000 --test-concurrency=2` for CI parity; network tests guarded by `skipIfUnreachable`; mock-module-once pattern replaces per-test `mock.module()` to avoid Node 22 "already mocked" errors.
- **Test suite growth:** Now ~700+ unit tests, ~0 fail, fewer than 10 gracefully skipped (network-dependent).
- **Font resolution:** Cross-platform fallbacks (Linux DejaVu/Liberation, macOS Helvetica/Arial) for fonts previously Windows-only (`C:\\Windows\\Fonts`).
- **Music system:** 5 procedural CC0 MP3s auto-generated in fresh clones (no more silent `__bundled__` bug); `ccmixter` provider retired in favour of bundled assets + Internet Archive free music.
- **Compose error propagation:** `compose.ts` audio-concat now throws on failure instead of silently producing truncated output.
- **Package.json scripts:** ~50 new npm scripts added; old `npm run generate` remains for backward compatibility.

### Fixed
- **Process leaks:** ffprobe/powershell child spawns now use `ignore`d stdin and `unref()`d timers with `tree-kill` on timeout — no more lingering processes after pipeline completion.
- **Offline music in fresh clones:** `BundledProvider` now self-heals with 3 procedural CC0 beds (ffmpeg-static, offline, idempotent) — fixes 0-music-bug on new checkout.
- **CLI arg validation:** Empty `--topic` with `--topic` flag present now fails validation instead of silently using fallback default.
- **Overlapping captions:** Close caption enable windows with `lt()` to prevent overlap at scene boundaries.
- **Image scenes receiving video files:** `fix(acquire)`: image scenes could receive video files (frozen 'stills') — fixed with proper kind filtering.
- **Stopwords leaking into search keywords:** Stopwords now removed from visual search queries to improve stock media relevance.
- **Wikimedia returning PDFs/DjVu:** Free-image Wikimedia provider now filters out non-image file extensions.
- **Duck expression test:** Test now asserts valid raw-comma `between()` gate and forbids `\\,`/`gt()` — ffmpeg rejects the old format.
- **Multiple audit fixes:** Brand bug (segment ordering + audio preservation), render palette filter not applied in modular path, plan filter not propagated to `ScenePlan`, types missing `filter` field, export script 4K aspect handling, SFX/music decoupling, audio-less ducking, emoji-per-scene forward, `+genpts` on all concat demuxer joins, sibling audio-less crashes (speed, silence), agentic-editor re-encode pipeline.
- **BuildDuckExpression test assertion:** Fixed `between/gt` format mismatch that tested the *broken* expression.
- **TTS test interaction:** Probed external speech backend in CI → 120s hang fixed by force-fallback when `CI=true`.



### Changed

- **README.md completely rewritten** as a product landing page with hero section, badges, 5-minute quick start, CLI reference, architecture diagram, use cases, comparison table, and cross-linked documentation
- CONTRIBUTING.md expanded with label descriptions, PR title conventions, and recognition section
- SECURITY.md enhanced with response timeline, best practices, and dependency management details
- ROADMAP.md updated with release cadence and how-to-influence section
- QUICKSTART.md rewritten with 5-minute format across all installation paths

---

## [5.0.0] — 2025-01-15

### Added

- Windows desktop app with setup wizard
- MCP server for Claude Desktop and Claude Code integration
- AI visual media verification (Ollama moondream / Gemini Vision)
- Openverse CC-licensed image search (no API key required)
- Free video sources (Wikimedia Commons, Internet Archive)
- Batch generation for multiple videos
- Remotion studio integration
- Local web portal with live status tracking
- Multi-language voice support (400+ voices)
- Background music with auto-ducking
- Resumable segmented rendering

### Changed

- Full architecture rewrite with hexagonal (ports & adapters) layers
- Migrated to TypeScript with strict mode
- Improved error handling and recovery
- Enhanced Windows launcher scripts

---

## [4.0.0] — 2024-09-20

### Added

- Python voice synthesis providers
- Configuration wizard
- Docker support

### Changed

- Upgraded Remotion to v4

---

## [3.0.0] — 2024-06-01

### Added

- CLI batch processing
- Input script JSON format
- Portrait/landscape orientation support

---

## [2.0.0] — 2024-03-15

### Added

- Stock media fetching (Pexels, Pixabay)
- Edge-TTS voice generation
- Scene parsing from text scripts

---

## [1.0.0] — 2024-01-01

### Added

- Initial release
- Basic Remotion rendering pipeline
- Text-to-video conversion
