# Contributing to Automated Video Generator

Thank you for considering contributing to this project! We welcome all kinds of contributions — code, documentation, bug reports, feature ideas, and community support.

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
- [Community](#community)

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). Please be respectful, inclusive, and collaborative.

## Getting Started

1. **Read the [README](README.md)** — Understand what the project does and how it works.
2. **Check the [Roadmap](ROADMAP.md)** — See what's planned and where you can help.
3. **Browse [open issues](https://github.com/itsPremkumar/Automated-Video-Generator/issues)** — Find something that interests you.
4. **Check [open pull requests](https://github.com/itsPremkumar/Automated-Video-Generator/pulls)** — Avoid duplicate work.

### Good First Issues

Look for issues labeled `good-first-issue` or `help-wanted`. These are specifically curated for new contributors.

## Development Setup

### Prerequisites

- Node.js 18+
- npm
- Python 3.8+ (for Edge-TTS)
- Git

### Setup

```bash
# Fork and clone the repository
git clone https://github.com/your-username/Automated-Video-Generator.git
cd Automated-Video-Generator

# Add upstream remote
git remote add upstream https://github.com/itsPremkumar/Automated-Video-Generator.git

# Install dependencies
npm install
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env to add PEXELS_API_KEY (optional for development)

# Verify setup
npm run typecheck
npm run test:unit
```

## Development Workflow

1. **Create a branch**: `git checkout -b feat/my-feature` or `fix/my-bug`
2. **Make changes**: Follow coding standards
3. **Test**: `npm run typecheck && npm run test:unit`
4. **Format**: `npm run format`
5. **Lint**: `npm run lint`
6. **Commit**: Write clear commit messages
7. **Push**: `git push origin my-branch`
8. **Open a PR**: Against the `main` branch

## Project Structure

```
src/
├── adapters/           # Entry points (HTTP, CLI, MCP)
├── application/        # Orchestration services
├── infrastructure/     # Persistence & pipeline
├── lib/                # Core business logic
├── middleware/         # Express middleware
├── services/          # Domain services
├── shared/            # Contracts, runtime, logging
├── views/             # Server-rendered HTML
remotion/              # Video compositions
electron/              # Desktop app
docs/                  # Documentation
examples/              # Usage examples
```

## Coding Standards

- **TypeScript** with strict mode enabled
- **ES modules** with `.js` extension in import paths
- **4-space indentation** (config in `.editorconfig`)
- **120 character line width** (config in `.prettierrc`)
- **PascalCase** for classes, interfaces, and types
- **camelCase** for functions, variables, and methods
- Descriptive variable names — avoid abbreviations
- Add JSDoc comments for public APIs

## Testing

We use Node.js built-in test runner:

```bash
# Run all tests
npm run test:unit

# Run with coverage
npm run test:coverage

# Run a specific test file
npx tsx --test src/lib/errors.test.ts
```

When adding new features, include tests. When fixing bugs, add a test that reproduces the issue.

## Pull Request Guidelines

1. **Keep PRs focused** — One feature or fix per PR
2. **Small is beautiful** — Small PRs are reviewed faster
3. **Update docs** — When behavior changes
4. **Add tests** — Cover your changes
5. **Pass CI** — Ensure `npm run typecheck && npm run test:unit` passes
6. **No secrets** — Never commit API keys or credentials
7. **Descriptive title** — Clear summary of the change

### PR Title Conventions

- `feat: add support for...`
- `fix: resolve issue with...`
- `docs: update README...`
- `test: add tests for...`
- `refactor: simplify...`
- `chore: update dependencies...`

## Issue Guidelines

- **Search first** — Check if the issue already exists
- **Use templates** — Bug reports and feature requests have templates
- **Be specific** — Include steps, environment, expected vs actual behavior
- **Remove secrets** — Never share API keys in issues

## Documentation

Good documentation is as important as good code. When you change behavior:

- Update the relevant `docs/` files
- Update `README.md` if the change is user-facing
- Update `CHANGELOG.md` with a summary of the change

## Community

- **Star the repo** — It helps others discover the project
- **Share your work** — Show what you've built in GitHub Discussions
- **Help others** — Answer questions in issues and discussions
- **Spread the word** — Blog posts, tutorials, and social media help

## Getting Help

- Check the [FAQ](docs/faq.md)
- Search [existing issues](https://github.com/itsPremkumar/Automated-Video-Generator/issues)
- Open a [discussion](https://github.com/itsPremkumar/Automated-Video-Generator/discussions)

---

_Thank you for contributing to Automated Video Generator! 🎬_
