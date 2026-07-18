# Changelog

All notable changes to the **Automated Video Generator** are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)  
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html)

---

## [Unreleased]

### Added
- **CI/CD (GitHub Actions):** lint + format-check, TypeScript typecheck (Node 18/20/22 matrix), `node:test` unit suite, Gitleaks secret scan, and a Docker build/push to GHCR (`linux/amd64`, GitHub cache) on every push to `main`.
- **Docker image published to GHCR** (`ghcr.io/itspremkumar/automated-video-generator`) — pinned `node:20-bookworm`, full `npm ci`, Python venv for `edge-tts` (PEP 668 compliant), platform `linux/amd64`, `/api/health` healthcheck.
- **5 new single-task agentic ops:** silence removal, scene-cut detection, auto-reframe (9:16/16:9/1:1), noise reduction, brand-kit overlay — all wired through `route.ts` + `dispatch.ts` + MCP tools.

### Changed
- **Correctness:** media duration/width/height now probed with the bundled `ffprobe-static` (`probe.ts`) instead of a non-existent `DURATION:` ffmpeg hint — fixes silence-removal no-op and empty scene chapters in production.
- **Error handling:** every op returns structured `{ ok, detail }` and never throws uncaught (dispatch `runOne` wrapped in try/catch); bounded retry+backoff (`retry.ts`) on transient asset-fetch and TTS calls.
- **Security:** output paths sanitized against `../` traversal (`security.ts` `safeOutputPath`); secrets redacted in crash logs (`redactSecrets`).
- **Tests:** filter-dependent integration tests (drawtext/xfade/zoompan/vignette) probe ffmpeg at runtime and skip gracefully on minimal builds, keeping CI green while still exercising real renders on full builds.

### Fixed
- CI workflow never executed (invalid `docker/build-push-action@v6`, `gitleaks/gitleaks-action@v2`, and an unsupported `toLower()` expression) — all jobs now run and pass.



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
