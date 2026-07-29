# Production Readiness Checklist — Automated Video Generator

Verified on branch `qa/production-hardening` (worktree `C:/one/avs-production-hardening`).
✅ = verified by real execution · ⚠ = acceptable with caveat · ❌ = gap

## Configuration & environment
- ✅ `.env.example` present; all secrets read via `process.env` (214 reads, zero hardcoded keys — grep-verified)
- ✅ Graceful degradation without ANY key: Pexels→free providers (observed live), Voicebox→Edge-TTS→tone fallback, agent backend needs no AI key
- ✅ `engines: node >=18` declared; runs on Node 22.23.1
- ✅ Invalid CLI input fails fast with actionable messages (`--topic`/`--orientation`/`--backend`/`--format` validated, exit 2)

## Reliability
- ✅ No process leaks: ffprobe/powershell child spawns use ignored stdin, unref'd timers, tree-kill on timeout (verified via `process._getActiveHandles()`)
- ✅ Corrupt/missing media → graceful fallback (probe test: no throw, no hang, 4s default)
- ✅ Download stall detection (interval, unref'd); retry/backoff in pipeline (600ms × attempt)
- ✅ Workspace hygiene: `pruneWorkspaces(maxKeep=2)` bounds disk growth; all scratch under `workspace/` (no system TEMP)
- ✅ Offline music self-heals in fresh clones (bundled-assets generator, CC0, ffmpeg-static)

## Testing
- ✅ 685 unit tests, 0 fail under CI simulation (`CI=true`, provider env cleared)
- ✅ `--test-timeout=240000 --test-concurrency=2` — CI parity flags
- ✅ Network tests guarded by `skipIfUnreachable` + CI skip
- ✅ Typecheck 0 errors; ESLint 0 errors (2273 style warnings tracked as debt)

## Security
- ✅ `npm audit --omit=dev`: 0 vulnerabilities (fixed hono/body-parser/fast-uri/postcss)
- ✅ No secrets in source or logs; `.env` git-ignored

## Rendering quality gates (empirical)
- ✅ E2E renders verified with ffprobe (codec/resolution/duration) + blackdetect + freezedetect + volumedetect + frame extraction + AI vision review
- ✅ Built-in X-checks in pipeline output (web-compatible h264 verified at render time)
- ✅ Landscape (1280×720) verified end-to-end; portrait/square in matrix run

## Cross-platform
- ✅ Windows fully exercised
- ✅ Font resolution now has Linux/macOS fallbacks (was Windows-only — fixed)
- ⚠ Linux/macOS not physically exercised in this pass (static verification only). Docker build target exists (Dockerfile) — recommend a Linux CI job as follow-up.

## Observability
- ✅ Staged progress logging (`[stage] %` callbacks), decision reports + contact sheets per job
- ⚠ No centralized crash reporter/metrics endpoint — logs are per-job files. Adequate for CLI/self-hosted use; add monitoring hooks if deployed as a service.

## Known non-blocking debt
- 2273 ESLint style warnings (`??` migration, `no-explicit-any`)
- Long-form (5–10 min) and non-English scenarios not in automated matrix yet
- Remotion renderer covered by unit tests; ffmpeg renderer covered end-to-end
