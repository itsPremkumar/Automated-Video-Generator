# QA BASELINE — Automated-Video-Generator (before fixes)

Captured: 2026-07-22, before production-readiness pass.

## Baseline numbers
- `npm run typecheck`: EXIT 0 (green)
- `npm test` (full suite): tests 507 | pass 484 | fail 16 | skipped 8
  (The 16th failure was a FLAKE in the voice integration test — FIXED during
  PHASE 3; re-run after fix: tests 507 | pass 484 | fail 15.)

## Failure classification (from /tmp/full.log)
### Network / offline-sandbox (acceptable → convert to clean SKIP)
- `searchFreeImages maps ImageResult -> MediaAsset and is network-safe` (host unreachable: commons.wikimedia.org)
- `searchFreeImages returns [] on adapter failure` (host unreachable)
- `listFreeMusicProviders includes the music sources` (host unreachable: metmuseum.org / wikimedia)
- (several `searchFreeImages` subtests, host unreachable)

### REAL logic bugs (must fix)
- `getQualityRank orders PREFERRED_QUALITIES` (visual-fetcher/media-utils.ts)
- `selectBestVideoFile prefers preferred quality` (media-utils.ts)
- `selectBestVideoFile ignores sub-MIN_WIDTH` (media-utils.ts)
- `selectBestVideoFile returns first when none meet MIN_WIDTH` (media-utils.ts)
- `selectBestVideoFile handles empty input` (media-utils.ts)
- `sortVideoAssets prefers duration closest to TARGET` (media-utils.ts)
- `normalizeKeywordList dedupes/trims/caps` (keyword-utils.ts)
- `parseGeminiKeywordResponse extracts array / returns []` (keyword-utils.ts)
- `BundledProvider` (music-system, 3 subtests)
- `generateFallbackVisual produces a real offline image fallback` (acquire.ts)
- `generateFallbackVisual produces a real offline video fallback` (acquire.ts)

## Code-quality inventory
- `strict: true` in tsconfig (already on)
- ESLint config present (eslint.config.mjs)
- CI workflows present (.github/workflows: ci.yml, codeql.yml, etc.)
- `: any` occurrences: 323 (type-safety debt — targeted pass planned)
- `console.log` in src: 28 (some may be debug leftovers)
- Open TODO: voice-controller.ts:111 (transcribe clip for clone quality)

## Known flake (FIXED)
- `ensureBackend()` had a hardcoded 40s startup deadline; under RAM pressure
  (full `npm test` after other heavy tests) the PyTorch/CUDA backend cold-start
  exceeded 40s → voice test failed. Fixed: deadline now 120s (configurable via
  VOICEBOX_STARTUP_TIMEOUT_MS) + readiness probe also accepts /health.
  Source: src/lib/speech-backend.ts:88-99. Re-run confirms voice test `ok 70`.
