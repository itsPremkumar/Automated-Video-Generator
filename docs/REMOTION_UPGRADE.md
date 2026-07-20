# Remotion Capability Analysis & Upgrade Roadmap

> Deep-dive into how this project currently uses Remotion, what Remotion 4.x is
> actually capable of, and exactly where advanced features should be wired in.
> Goal: move the renderer from "basic crossfade + burned text" to a full
> motion-graphics / templated editing engine — without losing the free,
> no-API-key, single-binary production constraint.

---

## 1. What the project does with Remotion TODAY (basic level)

### Two parallel render paths
| Path | Entry | Engine | Default? | Status |
|------|-------|--------|----------|--------|
| **ffmpeg** (`renderAgenticSlideshow`) | `bin/agentic-run.ts --renderer ffmpeg` | ffmpeg-static drawtext | **YES (default)** | Full, production, visually verified |
| **Remotion** (`renderAgenticWithRemotion`) | `--renderer remotion` | `@remotion/renderer` + headless Chrome | Opt-in | Builds, computes style plan, but **needs Chrome** (unavailable on this box) |

There are **two independent Remotion codebases** in the repo:
1. **Legacy segmented renderer** — `src/render.ts` + `remotion/{SingleSceneVideo,MainVideo,SubtitleOverlay,Root}.tsx`.
   Renders `scene-data.json` scene-by-scene (one `SingleScene` composition per
   scene → segment MP4 → ffmpeg concat). Uses `@remotion/renderer` `renderMedia`
   + `selectComposition` + `renderStill`. Driven by `npm run remotion:render`.
2. **Agentic composition** — `remotion/AgenticVideo.tsx` (composition `AgenticVideo`)
   driven by `renderAgenticWithRemotion()` in `src/agentic/orchestrate.ts`.
   This is the modern path; it already imports a `style-engine` (`computeStylePlan`)
   that emits `transitionIn`, `grade`, `kinetic` per scene.

### Capabilities currently USED (both paths)
- Ken Burns zoom/pan on images (`interpolate` scale 1.05→1.18) — `AgenticVideo.tsx:135`.
- Manual crossfade/slide between scenes via overlapping `<Sequence>` + opacity (`TransitionedScene`).
- Per-scene **color grade** via CSS `filter` (`gradeToFilter`) — warm/cool/cinematic/vivid/neutral.
- **Kinetic text**: lower-third + word-pop cues (`KineticLayer`) driven by `stylePlan.kinetic`.
- Burned **subtitles** via `SubtitleOverlay` (custom, `drawtext`-style, NOT `@remotion/captions`).
- Intro/outro cards (`IntroScene`/`OutroScene`).
- Music **ducking** under voiceover (`MusicDuck`).
- Aspect-aware dimensions (portrait/landscape/square) via `calculateMetadata`.
- Multi-aspect render (9:16 + 16:9 + 1:1) in `renderAgenticWithRemotion`.

### What is installed but UNUSED (dead potential)
- **`@remotion/captions`** (^4.0.487) — word-level karaoke, `TokenizeText`,
  `useCurrentTranscript`, subtitle positioning, `loadFont`. Not imported anywhere.
- **`@remotion/media-utils`** — `mediaInSeconds`, `getVideoMetadata`, audio
  waveform extraction. Not imported.
- **`spring()`** from `remotion` core — available, only `Easing.elastic` is used.
- **`Series`** component — not imported (manual `Sequence` math instead).
- **`@remotion/cli`** `Config` (`remotion.config.ts`) only sets image format + overwrite.

**Verdict:** The project uses maybe **~15%** of Remotion's real capability. It treats
Remotion as "a way to composite images/videos with fades." It is NOT using
Remotion as a **motion-graphics / templated animation engine** — which is its
entire reason for existing.

---

## 2. Remotion 4.x FULL capability (what we are NOT using)

These are all free & open-source (MIT), bundled by Webpack at build time, run in
headless Chrome — no per-render API cost.

### A. Motion & animation primitives (core `remotion`)
- **`spring()`** — physically-based entrance/exit springs (bounce, overshoot).
  Far richer than `interpolate`+`Easing`. Used by every pro template.
- **`Series` / `<Sequence>`** — timeline composition. `Series` auto-stacks
  sequentials so you never hand-compute `from` frames (removes the brittle
  `let t = introDur; t += dur` math in `AgenticVideo.tsx:396`).
- **`random()`, `delayRender()`, `continueRender()`** — for generative / async-safe animation.
- **`Loop`, `Bezier`, `measureText`, `Easing.bezier`** — custom curves.

### B. Typography & captions (`@remotion/captions`) — THE big missed win
- `TokenizeText` → splits a caption into **words with timing**.
- `useCurrentTranscript` / `getCurrentWord` → **true karaoke** (highlight the
  spoken word in real time, synced to TTS word-boundaries we already capture).
- `Caption` component → auto-wraps, positions, and **reflows** captions
  (solves the truncation bug we fixed by hand in the ffmpeg path).
- `loadFont` (FontfaceObserver) → reliable custom-font loading (no FOUT/blank).
- This replaces our hand-rolled `SubtitleOverlay` + the `wrapCaptionLines` hack
  with a battle-tested, accessible caption engine.

### C. Motion graphics & design system
- **`@remotion/shapes`** — `Circle`, `Square`, `Triangle`, `Path`, `Stroke`,
  `Line` with spring-driven draw-on (SVG path animation = "write-on" titles).
- **`@remotion/gradient`** — animated mesh/conic/linear gradients (vs the static
  `linear-gradient` we hardcode in `IntroScene`).
- **`@remotion/paths`**, **`@remotion/motion-blur`** (directional blur on fast
  moves), **`@remotion/transitions`** (prebuilt `linearTiming`, `fade`,
  `slide`, `wipe`, `flip`, `clockWipe` — production-grade scene transitions
  instead of our manual opacity overlap).
- **`@remotion/three`** / **`@remotion/rive`** — 3D & Lottie (optional, heavier).

### D. Audio & media (`@remotion/media-utils`)
- `getVideoMetadata`, `mediaInSeconds`, `audioWaveform` (visualize the
  voiceover as a waveform behind the kinetic text — a hallmark of "pro" shorts).
- `OffthreadVideo` already used; `Audio` volume keyframing (already used for ducking).

### E. Composition & DX
- **`calculateMetadata`** (already used) — can also return `defaultProps` and
  `props` so the composition self-configures from the agentic manifest.
- **`<Composition>` `schema`** — zod-style prop validation (mirror of our
  `safeFilenameSchema` discipline).
- **`still` + `renderStill`** (used) for thumbnails.
- **`@remotion/studio`** + `remotion studio` (npm script exists) for live preview.

---

## 3. WHERE advanced features should be wired (file-by-file)

### 3.1 Upgrade `AgenticVideo.tsx` → motion-graphics composition
- Replace manual `Sequence` frame math (lines 396–426) with **`<Series>`** of
  `<Transition>` from `@remotion/transitions` (fade/slide/wipe/flip) keyed by
  `asset.transitionIn`. Removes the overlap-frame arithmetic that already bit us.
- Add **`spring()`** entrances to kinetic text, intro/outro titles, and scene
  labels (replace `Easing.out(Easing.cubic)` everywhere).
- Add **`@remotion/shapes`** draw-on title underline + **`@remotion/gradient`**
  animated background in `IntroScene`/`OutroScene`.
- Add **`@remotion/motion-blur`** on slide transitions.

### 3.2 Replace `SubtitleOverlay.tsx` with `@remotion/captions`
- Use `TokenizeText` + `useCurrentTranscript` + `Caption` for **word-level
  karaoke** driven by `asset.captionSegments` (we already capture TTS
  word-boundaries in `scene.captionSegments`). This is the single highest-impact
  upgrade: it makes captions auto-wrap, auto-position, and visually pop like
  MrBeast/Google-style shorts — with zero hand-rolled wrapping code.
- Keep a `captionStyle` prop so ffmpeg-path parity is preserved (burned vs
  karaoke vs none).

### 3.3 `renderAgenticWithRemotion` (`src/agentic/orchestrate.ts:2103`)
- Pass `kinetic`, `grade`, `transitionIn` (already passed ✓) AND add
  `waveform: true` so `@remotion/media-utils` draws a voiceover waveform.
- Add `springPreset` + `captionEngine: 'remotion-captions'` to `inputProps`.
- Keep multi-aspect (✓) but gate Remotion behind a Chrome-availability check
  (`process.env.CHROME_EXECUTABLE` or `puppeteer` browser) and **auto-fall-back
  to ffmpeg** when absent — today the Remotion path just hangs (we hit this).

### 3.4 Legacy `src/render.ts` / `SingleSceneVideo.tsx`
- Either **delete** (it is the old segmented pipeline; the agentic path
  supersedes it) OR upgrade `SingleSceneVideo` to use `@remotion/captions` too.
- Recommendation: deprecate `npm run remotion:render` (points at `src/render.ts`)
  and make `AgenticVideo` the single Remotion entry; this removes a whole class
  of dual-maintenance bugs (the B7 silent-music fix had to be applied to BOTH
  `SingleSceneVideo` audio wiring and `AgenticVideo`).

### 3.5 `remotion.config.ts`
- Add `Config.setConcurrency`, `Config.setOverwriteOutput(true)` (✓), and a
  `overwrite` guard; consider `Config.registerRoot` parity. Minor.

### 3.6 Tests (`src/render.e2e.test.ts`, `src/integration.pipeline.test.ts`)
- The Remotion path is currently **untested for output** (no Chrome). Add a
  CI job that, **only when Chrome is present**, renders a 2-scene draft and
  asserts X7–X15 gates. Otherwise the Remotion path rots (exactly what happened
  this session — it silently broke and we only caught it visually).

---

## 4. Research findings (deep)

1. **Remotion is MIT, fully local, Webpack-bundled.** No API key, no network at
   render time (except fetching remote assets, which the agentic pipeline already
   downloads to disk first). Upgrading is **free** — satisfies the project's
   zero-cost constraint. ✅
2. **`@remotion/captions` is already a dependency** (`^4.0.487`) but never
   imported. The hardest part (karaoke timing) is already solved by our TTS
   word-boundary capture (`scene.captionSegments`). We are 1 import away from
   pro-grade captions. ✅ Highest ROI.
3. **The current Remotion path is architecturally sound but UX-broken**: it
   computes a real style plan (`computeStylePlan` → transitionIn/grade/kinetic)
   and passes it to `AgenticVideo`, which *does* implement them — BUT only when
   Chrome exists. On this box it hangs. The fix is a **capability gate + ffmpeg
   fallback** (the same pattern as the legacy path's own fallback comment).
4. **Two Remotion codebases = double the bug surface.** `src/render.ts` +
   `SingleSceneVideo` is the legacy one; `AgenticVideo` is the modern one. They
   duplicate subtitle/audio logic. Consolidation to one composition is the
   cleanest long-term move.
5. **Manual `Sequence` frame math is the fragility source.** `Series` +
   `@remotion/transitions` removes it and gives GPU-quality scene wipes for free.
6. **No `@remotion/captions` = the caption truncation bug will keep recurring**
   in the Remotion path. The ffmpeg path got `wrapCaptionLines`; the Remotion
   path should use `Caption`'s built-in reflow. One engine, no hand-wrapping.

---

## 5. Recommended implementation order (incremental, each verifiable)

| # | Change | File(s) | Effort | Risk | Why first |
|---|--------|---------|--------|------|-----------|
| 1 | **Capability gate + ffmpeg fallback** for Remotion path | `orchestrate.ts:2103` | S | Low | Stops the hang; makes Remotion safe to develop | ✅ DONE |
| 2 | **`@remotion/captions` karaoke** in `AgenticVideo` (replace `SubtitleOverlay`) | `AgenticVideo.tsx`, new `Captions.tsx` | M | Med | Highest visual ROI; kills truncation | ✅ DONE (new `KaraokeCaptions.tsx`) |
| 3 | **`Series` + `@remotion/transitions`** for scene transitions | `AgenticVideo.tsx` | M | Med | Removes brittle frame math; pro wipes | ⬜ TODO |
| 4 | **`spring()`** entrances on text/intro/outro | `AgenticVideo.tsx` | S | Low | Cheap polish, big feel | ⬜ TODO |
| 5 | **`@remotion/shapes` + `@remotion/gradient`** in intro/outro | `AgenticVideo.tsx` | S | Low | "Designed" look | ⬜ TODO |
| 6 | **Voiceover waveform** via `@remotion/media-utils` | `AgenticVideo.tsx` | M | Med | Shorts hallmark | ⬜ TODO |
| 7 | **Consolidate** legacy `src/render.ts` into `AgenticVideo` | `src/render.ts`, `Root.tsx` | M | Med | Cuts dual-maintenance bugs | ⬜ TODO |
| 8 | **CI guard** for Remotion e2e (Chrome-present only) | `.github/workflows/ci.yml` | S | Low | Prevents silent rot | ⬜ TODO |

Items 1–2 alone take the renderer from "basic" to "clearly professional."
Items 3–6 are the "full capability" the user is asking for.

---

## 7. Fix log (round-2 + Remotion work)

- **buildDuckExpression backslash regression (REAL bug, not a harness artifact):**
  a global backslash-normalization script (`fix_escape.cjs`) over-corrected
  `buildDuckExpression`'s `between(t\,...\,...)` output from **2 backslashes** to
  **0**, breaking 3 ducking-expression unit tests
  (`enhancement.test.ts` #3, `orchestrate.pure.test.ts` #4/#5). Restored to the
  correct 2-backslash form via `` String.raw`between(t\,${...}\,${...})` `` so the
  template produces exactly `between(t\,0.000\,1.500)` at runtime — the value
  ffmpeg's `volume='...'` expression requires and the tests expect. Full suite:
  **469 / 461 pass / 0 fail / 8 skipped** (green).

---

## 6. Open questions for the user (blocking nothing, but shape scope)
- **Chrome availability**: the agentic Remotion path needs a Chromium binary.
  Do you want me to (a) wire `CHROME_EXECUTABLE` + auto-fallback only, or
  (b) also add a GitHub Actions self-hosted/Chrome step so CI can actually
  exercise Remotion? (a) is free & local; (b) needs a runner with Chrome.
- **Legacy `src/render.ts`**: keep (dual support) or delete (consolidate)?
- **Caption engine**: switch Remotion captions to `@remotion/captions` karaoke
  while keeping the ffmpeg path's current `wrapCaptionLines` burned style?

*This document is the analysis deliverable. Implementation begins at item 1 once
you confirm scope.*
