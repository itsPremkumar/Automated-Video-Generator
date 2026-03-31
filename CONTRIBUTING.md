# Contributing

Thanks for helping improve Automated Video Generator.

This project grows faster when contributions are small, clear, and easy to review. Docs fixes, bug reports, testing, and focused code changes are all valuable.

## Good ways to contribute

- Fix a bug
- Improve docs or setup instructions
- Add tests or type-safety improvements
- Improve the local portal UX
- Expand examples, templates, or MCP workflows

## Before you start

1. Read the [README](README.md).
2. Check the [ROADMAP](ROADMAP.md).
3. Search existing issues and pull requests to avoid duplicate work.

## Local setup

```bash
git clone https://github.com/itsPremkumar/Automated-Video-Generator.git
cd Automated-Video-Generator
npm install
pip install -r requirements.txt
```

Copy `.env.example` to `.env` and add the keys you need.

## Development commands

```bash
npm run dev
npm run generate
npm run remotion:studio
npm run mcp
npm run typecheck
```

## Pull request guidelines

- Keep PRs focused on one main improvement
- Update docs when behavior changes
- Prefer small, reviewable commits
- Include screenshots or terminal output when the change affects UX or pipeline output
- Run `npm run typecheck` before opening the PR

## Issues

Use the GitHub issue templates when possible:

- Bug report for reproducible problems
- Feature request for product or workflow ideas
- Usage question for setup or workflow help

Security issues should follow the process in [SECURITY.md](SECURITY.md).

## Best first contributions

- Docs clarity
- Better error messages
- Safer defaults
- Test coverage
- UI polish

## Code of conduct

Please be respectful and collaborative. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
