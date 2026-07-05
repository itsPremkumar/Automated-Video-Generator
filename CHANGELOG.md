# Changelog

All notable changes to the **Automated Video Generator** are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)  
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html)

---

## [Unreleased]

### Added

- ESLint + Prettier configuration for consistent code style
- EditorConfig for cross-editor consistency
- Improved GitHub Actions CI with linting and testing
- Comprehensive community health files (CONTRIBUTING.md, SECURITY.md, CODE_OF_CONDUCT.md)
- COMPARISON.md — objective comparison with similar tools
- AVS_ASSETS_GUIDE.md — visual asset specifications and creation instructions
- Enhanced examples/README.md with skill-level ratings and detailed descriptions
- Expanded package.json keywords for better npm discoverability

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
