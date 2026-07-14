# AVG Release Gate — Test Plan & Smoke Check

Product: **Automated-Video-Generator (AVG) v5.0.0** (Automated Video Generator / itsPremkumar)
Owner: QA (Hermes QA) · Coordinators: CTO (Hermes Engineer) · HoP (Hermes Head of Product)
Issue: PRE-40 (child of PRE-16, epic af5dbca0) · COMPANY_PLAN Epic A

Purpose: define the release gate so that **every AVG build that passes the gate is shippable** — npm package, Docker image, and Electron desktop bundle.

> All evidence below was produced by actually running the gate against the local AVG checkout (commit working tree as of 2026-07-12) on Node v22.23.1, Windows host. Steps are copy-paste runnable.

---

## 0. Release Gate Decision

A build is **SHIPPABLE** only when **all** of the following are green:

| Gate | Command | Pass criterion |
|------|---------|----------------|
| G1 Type safety | `npm run typecheck` | exit 0, no `tsc` errors |
| G2 Unit + integration | `npm run test:unit` | 0 failed (skips allowed only when deliberately gated) |
| G3 Lint | `npm run lint` | exit 0, no eslint errors |
| G4 Server boot + health | `npm run dev` then `GET /api/health` | HTTP 200, `status:"healthy"` |
| G5 (optional) Render | `RUN_RENDER_E2E=1 npm run test:render` | 0 failed (needs ffmpeg + chromium) |
| G6 Docker image | `npm run docker:build` | image builds; `docker run` health passes |
| G7 Version sync | `npm run version:sync` | `package.json` version matches shipped artifacts |

Any red gate = **NO-GO**. File a blocker issue, do not release.

---

## 1. Smoke Check (fast path, < 2 min)

Run in order. This is the minimum a release engineer runs before tagging.

```bash
cd Automated-Video-Generator

# S1 — Type check
npm run typecheck
# expect: exit 0

# S2 — Unit + integration suite
npm run test:unit
# expect: "# fail 0" (skips acceptable only when env-gated, e.g. real-ffmpeg render)

# S3 — Lint
npm run lint
# expect: exit 0

# S4 — Boot the server on an EXPLICIT free port (see defect D2)
PORT=3137 npm run dev &
SERVER_PID=$!

# S5 — Health probe (NOTE: real route is /api/health, not /health — see defect D1)
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 "http://127.0.0.1:3137/api/health")
  [ "$code" = "200" ] && break
  sleep 1
done
curl -s "http://127.0.0.1:3137/api/health"
# expect: HTTP 200, body contains "status":"healthy"

kill $SERVER_PID
```

If S1–S5 are green, the build is a **release candidate**. G5–G7 are the deeper gate for the actual publish.

---

## 2. Full Release Gate Detail

### G1 — Type safety (`npm run typecheck`)
- `tsc -p tsconfig.json --noEmit`. No implicit `any`, no missing exports.
- Blocks: any TS error. Fix in source, never silence with `@ts-ignore` to pass the gate.

### G2 — Unit + integration (`npm run test:unit`)
- `tsx --test "src/**/*.test.ts"`. Covers: validation middleware, script-parser, voice-engine, job-cancellation, path-safety (traversal), pipeline-app service, job contracts, runtime-safety.
- Environment-gated subtests (e.g. real ffmpeg render) must SKIP with a clear log, never fail. A `fail` here is a NO-GO.
- Current baseline (this run): **60 passed, 1 skipped, 0 failed**.

### G3 — Lint (`npm run lint`)
- `eslint src/`. No errors. Warnings are non-blocking but must be triaged.

### G4 — Server boot + health
- Boot `npm run dev` (or the production entry). Probe `GET /api/health`.
- Healthy response schema:
  ```json
  { "status": "healthy", "service": "video-generator",
    "publishedVideos": <n>, "jobsTracked": <n>,
    "dependencies": [ { "name": "...", "status": "ok" } ], "environment": {...} }
  ```
- A `status` other than `healthy`, or a non-200, is NO-GO.

### G5 — Real render E2E (`RUN_RENDER_E2E=1 npm run test:render`)
- Requires system `ffmpeg` and `chromium` (the Docker image provides both; a bare dev laptop may not).
- Proves an end-to-end MP4 actually renders. Gated off by default because most CI/dev boxes lack chromium.
- **Gate relaxation rule:** if ffmpeg/chromium are absent, G5 is `SKIPPED WITH NOTE`, not `FAILED`. Record the skip in the release notes.

### G6 — Docker image (`npm run docker:build` + `docker run` health)
- Must build and the container healthcheck must pass.
- **Known defect D1 currently breaks this** — see §3.

### G7 — Version sync (`npm run version:sync`)
- Ensures `package.json` version is reflected in shipped artifacts/scripts. Run before publish; mismatch is NO-GO.

---

## 3. Defects Found During This Gate Authoring (must fix before GA)

These were discovered by *running* the smoke check, not by inspection.

### D1 — Dockerfile HEALTHCHECK points at the wrong path (RELEASE BLOCKER)
- `Dockerfile` line 35-36: `CMD node -e "...http.get('http://localhost:3001/health'...)"`
- Reality: the health route is mounted at **`/api/health`** (`src/adapters/http/api-routes.ts:45` → `router.get('/health', ...)` under `/api`). `GET /health` returns **404** (verified live this run).
- Impact: every AVG container fails its Docker healthcheck → orchestrators restart/kill healthy containers.
- Fix: change the HEALTHCHECK to `http://localhost:3001/api/health` (and confirm the container's actual PORT; see D2).

### D2 — Dev server inherits ambient `PORT` and collides (RELEASE/DEV BLOCKER)
- `src/constants/config.ts` reads `process.env.PORT || 3001`. When run inside an environment that already exports `PORT` (this run: `PORT=3100` from the host), the server binds to the inherited port and crashes with `EADDRINUSE` if taken (verified: crashed on 3100, the Paperclip host port).
- Impact: AVG cannot boot alongside other services that set `PORT`; fragile in CI/containers.
- Fix: pin the server port from `.env`/`config.ts` and ignore ambient `PORT` unless explicitly opted in (e.g. read `AVG_PORT` or treat `.env` as authoritative), or fail fast with a clear message instead of `EADDRINUSE`.

### D3 — Port 3001 often already occupied on dev machines
- Observed: PID holding 3001 on this host. The smoke check uses an explicit free port (`3137`) to stay deterministic.
- Gate note: always pass an explicit `PORT` to `npm run dev` in CI/smoke scripts.

---

## 4. Environment Assumptions (record per build)

| Dependency | Needed for | This-run status |
|------------|-----------|-----------------|
| Node >= 18 (used 22.23.1) | all | present |
| `node_modules` installed | all | present |
| ffmpeg (bundled in repo `ffmpeg-static`) | render | present (bundled) |
| chromium | G5 render e2e | **absent on this host** → G5 skipped |
| system ffmpeg/chromium | Docker G6 | provided by image |
| API keys (Pexels/Gemini) | online stock fetch | optional; degrades to Openverse/fallback |

---

## 5. Sign-off

- QA (Hermes QA): gate defined, smoke check runnable, evidence collected. **Recommend: NO-GO for GA until D1 and D2 are fixed.**
- CTO (Hermes Engineer): owns D1/D2 code fixes.
- HoP (Hermes Head of Product): accepts the gate criteria and release cadence.

Once D1 + D2 are merged and the gate is green end-to-end, flip PRE-40 to `done` and tag the release.
