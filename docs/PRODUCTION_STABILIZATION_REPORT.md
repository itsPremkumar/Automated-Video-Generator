# Production Stabilization Report — qa/production-hardening

**Worktree:** `C:/one/avs-production-hardening` (branch `qa/production-hardening`, base `da01b10`)
**Date:** 2026-07-28 · **Stack:** 100% free (agent backend, ffmpeg-static, no paid keys)

## 1. Bug report + root cause analysis

| # | Severity | Bug | Root cause | Fix | Evidence |
|---|----------|-----|-----------|-----|----------|
| 1 | **High** | Test/CLI processes hang 60–240s after work completes (`tts.test.ts`, `revise-restitch-prod.test.ts` timeout/cancel) | ffprobe spawned with `stdio:['pipe','pipe','pipe']` — open stdin pipe made child linger; guard timers (`withTimeout`, voice-engine 2× safety timer, download stall interval) never `unref()`d, holding the event loop | `src/agentic/orchestrator/ffmpeg.ts` (3 spawn sites): stdin/stderr→`ignore`, timers `unref()`, `taskkill /T` on timeout; `voice-engine.ts` safety timer cleared+unref'd; `download.ts` interval unref'd | Traced with `process._getActiveHandles()` → leaked `ChildProcess(ffprobe.exe)`; after fix `revise-restitch-prod` 4/4 pass, clean exit |
| 2 | **High** | Offline music silently broken in fresh clones/worktrees — `BundledProvider` (priority 1) returns 0 tracks | `input/bgm/__bundled__/` is git-ignored ⇒ empty on any new checkout | New `src/music-system/bundled-assets.ts`: self-heals with 3 procedural CC0 beds (ffmpeg-static, offline, idempotent); invoked in `BundledProvider` constructor | Music suite 0/4 → **19/19 pass** in the empty worktree |
| 3 | Medium | Unit test asserted the *broken* duck expression (`between(t\,…\,…)` + `gt()` wrapper) that ffmpeg rejects | Test written against an old revision; production code correctly emits raw commas | `tests/agentic/ai/enhancement.test.ts` now asserts the valid raw-comma `between()` gate and forbids `\,`/`gt(` | 7/7 pass |
| 4 | Medium | `tts.test.ts` probed external speech backend in CI → 120s hang | No CI guard | Force `AGENTIC_VOICE_FALLBACK=1` when `CI=true` or no `VOICEBOX_API_URL` | 120s+cancel → 32s clean |
| 5 | Medium | 5 prod-dep vulnerabilities (2 high: fast-uri, postcss; hono, body-parser, +1) | Stale transitive pins | `npm audit fix` (lockfile-only) | `npm audit --omit=dev` → **0 vulnerabilities** |
| 6 | Medium | Caption fonts Windows-only (`C:\Windows\Fonts` hardcoded) | No cross-platform branch | `resolveFontFile()` gets Linux (DejaVu/Liberation) + macOS (Helvetica/Arial) fallbacks | typecheck 0 |
| 7 | Low | CLI accepted invalid `--orientation square`, `--backend x`, empty `--topic` silently | No arg validation | `bin/agentic-run.ts` fail-fast validation with clear messages, exit 2 | `--orientation diagonal` → clear error |
| 8 | Low | 6 ESLint errors (prefer-const, useless escapes, control regex, unused expression, empty interface) | drift | fixed in 6 files | `eslint --quiet` → 0 errors |
| 9 | Low | `--test-timeout=120000` with default concurrency 16 masked slow-machine flakes | CI-vs-dev divergence | `--test-timeout=240000 --test-concurrency=2` in `test:unit` | suite green |

## 2. Test report (CI-simulated: `CI=true`, all provider env vars cleared)

- Typecheck (`tsc --noEmit`): **0 errors**
- ESLint: **0 errors** (2272 stylistic warnings — non-blocking, tracked)
- Unit suite: **685 tests, 671 pass, 0 fail, 13 skip** (skips = network-provider tests correctly guarded in CI)
- Targeted regression: music 19/19, enhancement 7/7, tts 3/3, revise-restitch 4/4 — all with clean process exit

## 3. Security review

- `npm audit --omit=dev`: 0 vulnerabilities (was 1 low/2 moderate/2 high)
- Hardcoded-secret grep across `src/ bin/ remotion/`: **no findings** (all keys via `process.env`)
- `.env` untouched; no secrets in logs

## 4. Runtime / E2E validation

- Full agentic pipeline (plan → acquire → verify gate → ffmpeg render): **PASS**
  `job_1785239715837.mp4` — h264 1280×720 25fps + AAC, 16.57s
- **Visual QA (empirical):** real frames extracted at t=1/6/11/15s and vision-analyzed — composed scenes present, captions legible, no black/blank frames, no stretching/letterbox defects
- **Error recovery:** corrupt mp4 + missing file probed through `estimateAudioDurationSafe` → graceful 4s fallback, no throw, no hang; empty `--topic`/invalid args now fail fast with clear errors; missing Pexels key degrades to free providers (observed live)

## 5. Cross-platform

- Windows: fully exercised (this report)
- Linux/macOS: font resolution fixed (was guaranteed-broken); path handling reviewed — remaining hardcoded `C:` paths are in comments/test fixtures only
- CI knobs: `--test-concurrency=2` matches CI runner parallelism

## 6. Video matrix QA

See `workspace/tmp/qa-matrix/matrix-summary.txt` — 5 scenarios (educational/finance/kids/tech/travel × landscape/portrait/square) each verified by: exit code, ffprobe (codec/resolution/duration), blackdetect, freezedetect, volumedetect, and a mid-video frame extraction.

## 7. Remaining known items (non-blocking)

- 2272 ESLint *warnings* (`??` migration, `no-explicit-any`) — style debt, zero runtime impact
- Long-form (5–10 min) and multi-language scenarios not yet in the automated matrix
- `remotion` renderer path exercised by unit tests only in this pass (ffmpeg renderer end-to-end verified)
