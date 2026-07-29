# Release Notes — Production Hardening (qa/production-hardening)

## v5.0.0-hardening — 2026-07-28

Stabilization pass over the Automated Video Generator. All fixes are
execution-verified (real renders, frame extraction + AI vision review,
ffmpeg signal analysis) — not just green unit tests. Zero-cost stack
maintained throughout (agent backend, ffmpeg-static, free providers only).

### Critical fixes
- **Pipeline could hang forever on a stalled download** — the stall guard
  destroyed streams without an error, so the promise never settled
  (observed: 36-min silent hang). Stalls now reject into the retry/fallback
  ladder. `src/lib/visual-fetcher/download.ts`
- **Process leaks after completion** — ffprobe children spawned with open
  stdin pipes plus never-`unref()`d guard timers kept Node alive 60–240s
  after all work finished. All spawn sites fixed, timers unref'd, tree-kill
  on timeout. `src/agentic/orchestrator/ffmpeg.ts`, `src/lib/voice-engine.ts`
- **Overlapping captions at scene boundaries** — per-scene drawtext windows
  used `lte()`, so at boundary frames two captions rendered on top of each
  other (unreadable). Windows are now half-open `[start,end)`.
  `src/agentic/operations/compose.ts` (+ source-level regression test)

### Quality fixes
- **Image scenes receiving video files rendered as frozen stills** —
  candidates are reclassified by real extension (webm→video) so Ken Burns /
  trim handling applies correctly. `src/agentic/pipeline/acquire.ts`
- **Stopwords leaked into visual searches** — "The turtle who learned to
  fly" searched for `"the"` (timeouts, junk assets). Stopword filter added.
  `src/agentic/ai/agent.ts` (+ keyword-hygiene regression tests)
- **Wikimedia provider returned PDFs/DjVu/AV as "images"** — one run burned
  938 throttled requests downloading PDFs. Provider now requests mime and
  accepts only real images. `src/lib/free-image/providers/wikimedia.ts`
- **Offline music broken in fresh clones/worktrees** — the git-ignored
  bundled-music dir self-heals with procedural CC0 beds (0/4 → 19/19 tests).
  `src/music-system/bundled-assets.ts` (new)

### Robustness / DX
- CLI fail-fast validation for `--topic/--orientation/--backend/--format`
  (empty `--topic` no longer silently used the default topic).
- Cross-platform fonts: Linux (DejaVu/Liberation) and macOS (Helvetica)
  caption fallbacks — was hardcoded `C:\Windows\Fonts`.
- CI-safe tests: `AGENTIC_VOICE_FALLBACK` forced in offline CI (was a 120s
  hang), `--test-timeout=240000 --test-concurrency=2`.
- Security: `npm audit --omit=dev` 5 vulnerabilities → 0 (lockfile-only).
- Lint: 6 ESLint errors → 0.

### Verification summary
- typecheck 0 errors · lint 0 errors · unit suite 685 tests / 0 fail (CI-sim)
- E2E renders: landscape/portrait verified with blackdetect, freezedetect,
  volumedetect, silencedetect + per-frame AI vision QA
- Error recovery: corrupt/missing media, empty/invalid CLI input, missing
  API keys — all degrade gracefully (verified by execution)

### Known non-blocking debt
- 2273 ESLint style warnings (`??` migration, `no-explicit-any`)
- Long-form (5–10 min) & non-English matrix scenarios pending
- Linux/macOS statically verified only (recommend a Linux CI job)
