# AVG Release Gate — Test Plan & Smoke Check

**Issue:** PRE-16 — AVG release gate: test plan + smoke check
**Owner:** Hermes QA (Paperclip)
**Applies to:** Automated-Video-Generator (AVG) v5.x
**Artifacts covered:** npm package, ghcr.io Docker image, Windows desktop installer (Electron), source GitHub Release.

---

## 1. Purpose

The release workflows (`release.yml`, `desktop-release.yml`) publish artifacts **on tag push without running the test gate first**. The CI workflow runs tests, but a release tag can ship even if `main` is red. This gate makes the release safe by:

1. Defining an explicit, human-readable **test plan** (this document).
2. Providing a single, automatable **smoke check** (`scripts/release-smoke-check.cjs`) that a release MUST pass before publish.
3. Wiring the gate into the release workflows so a release cannot ship unverified.

A release is **blocked** if any BLOCKER check fails. WARN checks are non-blocking but recorded.

---

## 2. Release channels & what "done" means per channel

| Channel | Trigger | Artifact | Gate must prove |
|---|---|---|---|
| npm publish | tag `v*` (no `-`) | `automated-video-generator` package | package installs, bin/MCP + HTTP server boot, core logic green |
| ghcr Docker image | tag `v*` (no `-`) | `ghcr.io/.../automated-video-generator` | image builds, container serves `/api/health` |
| Windows desktop | tag `desktop-v*` | Electron installer | desktop bundle verified (existing `electron:verify-release`) |
| GitHub Release | tag `v*` | draft release + notes | changelog generated, draft (human approval) |

---

## 3. Test plan (manual + automated matrix)

### 3.1 Blocking automated checks (BLOCKER)

| # | Check | Command / Method | Pass criteria |
|---|---|---|---|
| B1 | TypeScript compiles clean | `npm run typecheck` | exit 0, 0 errors (strict mode) |
| B2 | Unit tests green | `npm run test:unit` | all `*.test.ts` pass (current baseline: 16 tests) |
| B3 | Dependency audit clean | `npm audit --audit-level=high` | 0 high/critical |
| B4 | Package builds & is self-contained | `npm pack --dry-run` | version matches tag, `bin/`, `src/`, `remotion/` included; `npm pack` tarball `node --check` on `bin/mcp.js` |
| B5 | MCP server boots (stdio) | spawn `node bin/mcp.js` | process starts, writes MCP banner, responds to `initialize` |
| B6 | HTTP server boots & `/api/health` 200 | start `src/server.ts`, GET `/api/health` | status 200, `service:"video-generator"`, `status` present |
| B7 | Docker image serves health | `docker build` + `docker run` → GET `/api/health` | status 200 |
| B8 | Desktop bundle integrity (desktop only) | `npm run electron:verify-release` | 0 required-file errors |

### 3.2 Non-blocking smoke (WARN / recorded)

| # | Check | Why non-blocking |
|---|---|---|
| W1 | Render E2E (`npm run test:render`, `RUN_RENDER_E2E=0`) | heavy Chromium+ffmpeg render; CI runs in skip-mode by policy |
| W2 | Lint & format (`npm run lint`, `npm run format:check`) | style-only, enforced in CI; does not affect runtime |
| W3 | Free-media source reachability (Pexels/Pixabay/Openverse) | depends on third-party keys/network; pipeline has graceful fallbacks |

### 3.3 Manual acceptance (human, before flipping draft→published)

- [ ] `npm pack` tarball installed in a clean dir and `npx automated-video-generator --help` prints usage.
- [ ] CHANGELOG / release notes reflect user-facing changes since last tag.
- [ ] Version in `package.json` matches the release tag (B4 enforces this for npm; confirm for desktop).
- [ ] No secrets committed in the tarball (`npm pack --dry-run` file list reviewed).

---

## 4. Smoke check usage

```sh
# Full gate (typecheck + unit + audit + artifact + MCP + HTTP liveness)
node scripts/release-smoke-check.cjs

# Only the publishable-artifact + boot smoke (no dev server needed)
node scripts/release-smoke-check.cjs --artifact-only

# Point at a built Docker image
AVG_HEALTH_URL=http://localhost:3001 node scripts/release-smoke-check.cjs --artifact-only
```

Exit code `0` = gate passed; non-zero = **block the release**.

The script is a zero-dependency Node `*.cjs` (no tsx) so it runs in any Node 18+ CI and on the release runner even if the TS toolchain is flaky.

---

## 5. Wiring

- `release.yml`: a `release-gate` job runs B1–B6 before the `release`/`docker` jobs; the publish jobs depend on it (`needs: release-gate`).
- `desktop-release.yml`: a `release-gate` job runs B1–B6 + B8 before `build-windows`; `build-windows` depends on it.

Because the npm/docker jobs currently use `if: '!contains(github.ref_name, "-")'`, the gate job runs for every `v*` tag and blocks both publish paths.

---

## 6. Known limitations

- The tsx transform is occasionally flaky in constrained sandboxes; the smoke check therefore prefers `node`/`npm` over `tsx` for the runtime assertions and falls back to a guarded HTTP probe that never blocks the whole run on a single transient transform error.
- Media-source reachability (W3) is intentionally WARN: the product is designed to degrade to free sources.
- Real video render (W1) is validated separately and kept non-blocking per existing CI policy.
