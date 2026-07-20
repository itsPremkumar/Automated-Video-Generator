## Contributing

Thanks for helping! This project is MIT and welcomes contributions.

### Good first issues
See [GOOD_FIRST_ISSUES.md](GOOD_FIRST_ISSUES.md) for scoped, low-risk tasks.

### Dev setup (all platforms)
```bash
git clone https://github.com/itsPremkumar/Automated-Video-Generator.git
cd Automated-Video-Generator
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
npm install
npm run dev          # opens web portal at http://localhost:3001
```

### Before opening a PR
- `npm run typecheck` passes
- `npm run test:unit` passes
- `npm run lint` shows no errors (warnings are OK)
- `npm run format:check` passes (run `npm run format` to auto-fix)

### Run the same checks CI runs
CI (`ci.yml`) runs typecheck across Node 18/20/22, lint + format on Node 20,
unit tests on Node 22, a Docker build, `npm audit --audit-level=high`, and a
non-blocking render e2e (skipped). Reproduce the green baseline locally with:

```bash
npm run typecheck        # B1: tsc -p tsconfig.json --noEmit
npm run lint             # lint only (warnings OK)
npm run format:check     # must be clean (Prettier, endOfLine: lf)
npm run test:unit        # 60+ unit tests
npm run test             # typecheck + unit tests (PR gate)
```

> Line endings: this repo ships a `.gitattributes` pinning `eol=lf` so the local
> working tree matches CI. If `npm run format:check` fails on a Windows checkout,
> run `git add --renormalize .` once, then commit — the CRLF/LF mismatch clears.

### Release gate (optional, pre-publish)
Before publishing to npm / cutting a desktop release, run the blocking smoke gate:

```bash
node scripts/release-smoke-check.cjs --artifact-only   # local artifact checks (B1-B5)
node scripts/release-smoke-check.cjs                   # also boots the server + probes /api/health (B6)
```

It validates typecheck, unit tests, `npm audit`, package self-containment,
MCP server boot, and (in full mode) the HTTP health endpoint.

### Code style
TypeScript, ESLint (flat config). Match the surrounding code; keep it KISS/DRY.
