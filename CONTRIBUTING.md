# Contributing to Automated Video Generator

Thank you for considering contributing! We welcome code, documentation, bug reports, feature ideas, translations, and community support.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Development Workflow](#development-workflow)
- [Project Structure](#project-structure)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Pull Request Guidelines](#pull-request-guidelines)
- [Issue Guidelines](#issue-guidelines)
- [Documentation](#documentation)
- [Labels Used in This Project](#labels-used-in-this-project)
- [Community](#community)
- [Getting Help](#getting-help)

---

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). Please be respectful, inclusive, and collaborative.

---

## Getting Started

1. **Read the [README](README.md)** — Understand the project's purpose and features
2. **Check the [Roadmap](ROADMAP.md)** — See what's planned and where help is needed
3. **Browse [open issues](https://github.com/itsPremkumar/Automated-Video-Generator/issues)** — Find something you'd like to work on
4. **Check [open pull requests](https://github.com/itsPremkumar/Automated-Video-Generator/pulls)** — Avoid duplicate work
5. **Read this guide** — Understand the development workflow

### Looking for a Starting Point?

Issues are labeled to help you find the right fit:

| Label | Description |
|-------|-------------|
| `good first issue` | Curated for first-time contributors; minimal codebase familiarity needed |
| `help wanted` | Open for anyone to pick up; may require more context |
| `documentation` | Docs improvements, guides, README updates |
| `enhancement` | New features or improvements |
| `bug` | Something that needs fixing |
| `testing` | Test coverage improvements |

---

## Development Setup

### Prerequisites

- Node.js 18+
- npm
- Python 3.8+ (for Edge-TTS voice engine)
- Git
- FFmpeg (optional — bundled `ffmpeg-static` is used by default)

### One-Time Setup

```bash
# 1. Fork and clone the repository
git clone https://github.com/your-username/Automated-Video-Generator.git
cd Automated-Video-Generator

# 2. Add upstream remote (stay synced with the main repo)
git remote add upstream https://github.com/itsPremkumar/Automated-Video-Generator.git

# 3. Install Node dependencies
npm install

# 4. Install Python voice dependencies
pip install -r requirements.txt

# 5. Configure environment
cp .env.example .env
# Edit .env — PEXELS_API_KEY is optional for development (Openverse fallback works without it)

# 6. Verify the setup
npm run typecheck
npm run test:unit

# 7. Start the dev server
npm run dev
# Open http://localhost:3001
```

---

## Development Workflow

```bash
# 1. Create a feature branch
git checkout -b feat/my-feature
# or: git checkout -b fix/my-bug

# 2. Make your changes
# Follow the coding standards below

# 3. Run checks
npm run typecheck     # TypeScript validation (must pass)
npm run test:unit     # Unit tests (must pass)
npm run lint          # ESLint (must pass)
npm run format        # Prettier formatting

# 4. Commit your changes
# Write clear, descriptive commit messages
git add <files>
git commit -m "feat: add support for custom subtitle colors"

# 5. Push and open a Pull Request
git push origin feat/my-feature
# Open a PR against the main branch on GitHub
```

### Staying Synced

```bash
git checkout main
git pull upstream main
git checkout feat/my-feature
git rebase main
# Resolve conflicts if any, then force-push
git push origin feat/my-feature --force-with-lease
```

---

## Project Structure

```
src/
├── adapters/           # Entry points (HTTP, CLI, MCP, Electron)
├── application/        # Shared orchestration services
├── infrastructure/     # Persistence and filesystem
├── lib/                # Core business logic (fetchers, parsers, verifiers)
├── middleware/         # Express middleware
├── services/          # Domain services
├── shared/            # Contracts, runtime safety, logging
├── views/             # Server-rendered HTML pages
├── app.ts             # Express app composition
├── server.ts          # HTTP entrypoint
├── cli.ts             # CLI entrypoint
├── mcp-server.ts      # MCP entrypoint
└── video-generator.ts # Pipeline generation implementation
remotion/              # React video compositions
electron/              # Desktop application
docs/                  # Documentation
examples/              # Usage examples
assets/                # Logos, banners, diagrams
input/                 # User scripts and local assets
output/                # Generated videos
```

---

## Coding Standards

- **Language:** TypeScript with strict mode enabled
- **Modules:** ES modules with `.js` extension in import paths
- **Indentation:** 4 spaces (see `.editorconfig`)
- **Line width:** 120 characters (see `.prettierrc`)
- **Naming:**
  - `PascalCase` — classes, interfaces, types, React components
  - `camelCase` — functions, variables, methods
  - `UPPER_CASE` — constants
- **Imports:** Group external → internal; sort alphabetically
- **Descriptive names:** Avoid abbreviations; prefer `videoRepository` over `vidRepo`
- **Public APIs:** Add JSDoc comments for exported functions and classes
- **No secrets:** Never commit API keys, tokens, or credentials

### TypeScript Guidelines

```typescript
// ✅ Good
interface VideoJobConfig {
    readonly id: string;
    readonly title: string;
    readonly script: string;
}

// ✅ Good — explicit types
function parseVideoScript(script: string): ParsedScene[] { ... }

// ❌ Avoid
function parse(s: string): any { ... }
```

---

## Testing

We use the Node.js built-in test runner (`node:test` + `node:assert/strict`).

```bash
# Run all tests
npm run test:unit

# Run with coverage report
npm run test:coverage

# Run a specific test file
npx tsx --test src/lib/errors.test.ts

# Run type checking + tests (CI equivalent)
npm test
```

**Guidelines:**

- New features should include tests
- Bug fixes should include a test that reproduces the issue
- Tests live next to the source file (e.g., `pipeline-app.service.test.ts`)
- Use descriptive test names: `it('should parse scene with visual tag')`

---

## Pull Request Guidelines

### Before Submitting

- [ ] PR is focused on a single feature, fix, or improvement
- [ ] `npm run typecheck` passes
- [ ] `npm run test:unit` passes
- [ ] `npm run lint` passes
- [ ] `npm run format` has been applied
- [ ] Documentation is updated if behavior changed
- [ ] CHANGELOG.md is updated with a summary of the change
- [ ] No API keys, secrets, or credentials are included
- [ ] PR targets the `main` branch

### PR Title Conventions

| Prefix | Use Case | Example |
|--------|----------|---------|
| `feat:` | New feature | `feat: add custom subtitle color support` |
| `fix:` | Bug fix | `fix: handle empty script gracefully` |
| `docs:` | Documentation | `docs: add installation guide for Arch Linux` |
| `test:` | Test improvements | `test: add coverage for scene parser` |
| `refactor:` | Code restructuring | `refactor: extract media fetcher interface` |
| `chore:` | Maintenance | `chore: update dependencies` |
| `perf:` | Performance | `perf: cache media search results` |
| `style:` | Formatting only | `style: format code with prettier` |

### What Makes a Great PR

- **Small and focused** — easier to review, faster to merge
- **Explains the why** — not just what changed, but why
- **Includes tests** — proves the change works and prevents regressions
- **Updates docs** — keeps the project maintainable

---

## Issue Guidelines

- **Search first** — Check if the issue already exists before creating a new one
- **Use templates** — Bug reports and feature requests have structured templates
- **Be specific** — Include steps to reproduce, expected vs actual behavior, and environment details
- **Remove secrets** — Never share API keys, tokens, or credentials in issues
- **One issue per problem** — Keep issues focused and actionable

---

## Documentation

Good documentation is as important as good code.

- Update relevant `docs/` files when behavior changes
- Update `README.md` if the change is user-facing
- Update `CHANGELOG.md` with a summary of the change
- Cross-link related documentation where appropriate

### Documentation locations

| Content | Location |
|---------|----------|
| User-facing features | `README.md` |
| Comprehensive guides | `docs/*.md` |
| Examples | `examples/*/` |
| Architecture | `docs/ARCHITECTURE.md` |
| API reference | `docs/api-reference.md` |
| CLI reference | `docs/cli-reference.md` |
| Configuration | `docs/configuration.md` |

---

## Labels Used in This Project

| Label | Purpose |
|-------|---------|
| `good first issue` | Perfect for new contributors |
| `help wanted` | Open for anyone to pick up |
| `bug` | Something isn't working |
| `enhancement` | New feature or improvement |
| `documentation` | Docs-related work |
| `testing` | Test coverage improvement |
| `question` | Needs clarification |
| `discussion` | Open for community input |
| `priority` | High-importance fixes |

---

## Community

- **Star the repo** — helps others discover the project
- **Share your work** — post videos you've created in GitHub Discussions
- **Help others** — answer questions in issues and discussions
- **Spread the word** — blog posts, tutorials, and social media mentions help grow the community
- **Report bugs** — use the bug report template for reproducible issues
- **Suggest features** — use the feature request template with clear use cases

---

## Getting Help

- Check the [FAQ](docs/faq.md)
- Search [existing issues](https://github.com/itsPremkumar/Automated-Video-Generator/issues)
- Open a [discussion](https://github.com/itsPremkumar/Automated-Video-Generator/discussions)
- Read the [documentation](docs/)

---

## Recognition

Contributors who make significant or repeated contributions will be:
- Listed in release notes and changelogs
- Acknowledged in the repository README
- Invited as collaborators (for consistent, high-quality contributions)

---

*Thank you for contributing to Automated Video Generator!*
