# AGENTS.md

This file helps AI coding agents work effectively with this project.

## Project Overview

Automated Video Generator is a free, open-source, self-hosted AI text-to-video pipeline. It converts text scripts into MP4 videos using Remotion for rendering, Edge-TTS for voice synthesis, and multiple stock media sources for visuals.

## Tech Stack

- **Runtime**: Node.js 18+, TypeScript 5+
- **Framework**: Express.js for web server, Remotion for video rendering
- **TTS**: Edge-TTS (Python), with Voicebox, XTTS, Kokoro fallbacks
- **Media**: Pexels, Pixabay, Openverse, Wikimedia Commons, Internet Archive
- **Desktop**: Electron
- **AI**: Ollama (moondream), Gemini Vision for media verification

## Architecture Pattern

Hexagonal architecture with layers:
- `src/adapters/` — Entry points (HTTP, CLI, MCP)
- `src/application/` — Orchestration
- `src/lib/` — Core business logic
- `src/infrastructure/` — Persistence, filesystem
- `src/shared/` — Contracts, runtime utilities, logging

## Key Conventions

- **Naming**: PascalCase for classes/interfaces, camelCase for functions/variables
- **Imports**: ES module imports with `.js` extension in import paths
- **Testing**: Node.js built-in test runner (node:test + node:assert/strict)
- **Formatting**: Prettier with 120 char width, 4-space indent
- **TypeScript**: Strict mode enabled

## Important Directories

- `input/visuals/` — User's local images/videos
- `input/scripts/input-scripts.json` — Job definitions for CLI batch mode
- `output/` — Generated videos
- `public/` — Served by web portal
- `remotion/` — React video compositions
- `src/agentic/` — **Agentic video pipeline** (fully agent-controlled)
- `bin/agentic-run.ts` — one-shot CLI to generate a video from a topic
- `bin/agentic-batch.ts` — generate + verify multiple videos
- `skills/agentic-video/SKILL.md` — canonical agent-driving doc
- `agentic-pipeline/` — planning docs (`README.md`, `VERIFICATION_MATRIX.md`, `AGENT_TOOLS_AND_PHASES.md`)

## Agentic Video Generation (fully agent-controlled, no external AI needed)

The `src/agentic/` pipeline lets **any AI coding agent** (Claude Code, Cursor,
Antigravity/Gemini, OpenCode, Codex, Windsurf, GitHub Copilot, or the in-repo
Hermes/OpenClaw skill) produce a real MP4 from just a topic — with the agent
making every decision (script, keywords, asset fetch, per-asset verify,
approve/reject, and the final render gate).

**Backends**
- `backend=agent` (DEFAULT) — Hermes/OpenClaw is the AI. NO Google Gemini, NO
  Ollama, NO API key required. Signal-level verification only.
- `backend=vision` (opt-in) — adds Gemini/Ollama semantic relevance scoring.

**How an agent generates a video (pick one):**
1. CLI (simplest, works in any terminal):
   ```bash
   npm run agentic -- --topic "5 home workout exercises" --title "Home Workout" --backend agent --orientation landscape --images
   npm run agentic:batch        # generate + verify 3 sample videos
   ```
2. MCP tools (when the repo's MCP server is connected):
   `agentic_run` (one-shot), or granular `agentic_plan` → `agentic_acquire` →
   `agentic_verify_all` → `agentic_list_pending` → `agentic_approve` /
   `agentic_reject` → `agentic_gate`.
3. Library import:
   ```ts
   import { runAgenticPipeline, renderAgenticSlideshow } from './src/agentic/orchestrate.js';
   const res = await runAgenticPipeline({ topic, title, backend: 'agent' });
   const mp4 = await renderAgenticSlideshow(res);
   ```

**Verification & safety (the agent refuses to ship bad output):**
- Every asset is signal-verified (dimensions, duration, license, silence,
  caption sync, etc.).
- The pipeline runs **two** gates:
  - **Pre-render holistic gate (X1–X6)** blocks render unless planning is
    sound: X1 Duration alignment, X2 Every scene has an approved visual,
    X3 No unresolved decisions, X4 Caption sync, X5 Runtime within limit,
    X6 Attribution completeness.
  - **Post-render gate (X7–X15)** blocks ship if ANY check fails: X7 Output
    file valid, X8 Duration matches plan, X9 Audio track present, X10 No long
    black frames, X11 No frozen frames, X12 Audio loudness in range, X13 No
    audio clipping, X14 Output dimensions valid, X15 Web-compatible codec.
  - **X16 (opt-in, `aiVerify.verifyOnRender`)** — AI content verification of
    the final MP4; with `finalMode: 'vision'` it samples multiple frames and
    fails closed when the AI backend is unavailable.
- `agentic-pipeline/workspaces/` (runtime artifacts) is git-ignored.

**The legacy `npm run generate` workflow (`src/video-generator.ts`,
`src/lib/script-parser.ts`, `input/scripts/input-scripts.json`) is UNCHANGED** — the
agentic system is purely additive.

## Common Commands

- `npm run dev` — Start web portal
- `npm run generate` — Run batch generation from CLI (LEGACY workflow)
- `npm run agentic` — Generate one video from a topic (AGENTIC workflow)
- `npm run agentic:batch` — Generate + verify multiple videos (AGENTIC)
- `npm run typecheck` — TypeScript validation
- `npm run test:unit` — Run tests
- `npm run lint` — ESLint
- `npm run format` — Prettier

## Common Pitfalls

1. The directory is `input/visuals/` defined in `INPUT_ASSETS_DIR` constant in `src/lib/path-safety.ts`.
2. FFmpeg is bundled via `ffmpeg-static` but may fail on some architectures. A global FFmpeg install is the fallback.
3. For Windows desktop builds, verify bundle integrity with `npm run electron:verify-bundle`.
4. The agentic pipeline uses NodeNext module resolution — ALL relative imports
   need the `.js` extension (e.g. `from './plan.js'`).
5. With `backend=agent` and no network, asset fetching gracefully falls back to
   ffmpeg-generated placeholder cards/music, so the pipeline still yields a

## Production Status (verified 2026-07-20)

The agentic pipeline is **end-to-end production-functional**: a topic in → a
verified MP4 out, with all 10 post-render checks (X7–X15) passing on every
generated video. 487+ unit tests pass across 75 test files; typecheck and lint are clean.

**Editing-style surface (all real, no stubs):**
- `src/agentic/style-engine.ts` — `computeStylePlan()` picks per-scene
  transition (`fade` | `slide`), grade (`cinematic`/`warm`/`cool`/`vivid`/
  `neutral` via ffmpeg `eq`), and kinetic-text cues. `xfadeName()` safely
  downgrades unsupported `zoomblur`/`cut` → `fade` (this ffmpeg build lacks
  zoomblur). `gradeFilter()` approximates looks with `eq` (no LUT files needed).
- `src/agentic/config.ts` — full customization: `PRESETS` (cinematic/reels/
  documentary/neutral/...) and `VIDEO_TYPE_PROFILES` (facts/tutorial/story/
  news/motivational/nature/product). `resolveConfig()` merges presets + flags.
- CLI: `bin/agentic-auto.ts` is the **autopilot** (topic → self-healing render).
  Flags: `--topic`, `--title`, `--preset`, `--images`/`--videos`,
  `--no-sfx`, `--max-attempts N`, `--renderer ffmpeg|remotion`.

**Self-healing fixes applied (why renders never black out):**
1. **Per-scene keyword diversity** — `writeScriptHeuristic()` now assigns a
   DISTINCT visual keyword per scene (e.g. "coffee cup" / "espresso machine" /
   "barista cafe") so every scene fetches a different on-topic image instead of
   the same top result. (Previously all 3 scenes reused one keyword → identical
   image → looked AI-generated.)
2. **Dead-host rejection** — `orchestrate.ts` `fetchVisual()` rejects
   `flickr.com`/`staticflickr.com` URLs (they 502 in this environment) and
   retries with a broader query before falling back. Keeps every scene on a
   real, downloadable Pexels image.
3. **Bright placeholder card** — `makePlaceholder()` paints a BRIGHT colored
   card (not navy/black). Navy previously fell under blackdetect's threshold
   and falsely failed X10. Now a missing image is a visible branded card, never
   a false black-frame failure.
4. **X10 black-detection corrected** — `video-analyzer.ts` `detectBlackFrames()`
   uses `pix_th=0.15` (the only valid blackdetect option on this build). The
   prior `pic_th` option mis-parsed and falsely flagged the ENTIRE clip black.
5. **Shared topic image pool (per-scene visual diversity)** — `orchestrate.ts`
   fetches ONE pool of ~12 real Pexels photos for the topic once, then assigns
   scene `i` → `pool[i]`. This guarantees every scene shows a DIFFERENT real
   photo (professional B-roll cut) instead of the identical top search result.
   The topic noun is extracted by stripping numbers/stopwords ("5 fascinating
   facts about coffee" → "coffee") so the pool query is on-topic.
6. **Cache-poisoning fix** — the last-resort fallback query was hardcoded to
   `'coffee'`, so non-coffee videos (e.g. "walking") were served stale cached
   coffee photos. Now the last resort uses the topic noun, so a missing image
   falls back to a bright card, never an off-topic cached photo.

**Image-acquisition behavior (verified):**
- When Pexels has results for the topic → each scene gets a DISTINCT real photo
  (proven: coffee video rendered 3 different photos, all gates X7–X15 PASS).
- When Pexels is rate-limited / sparse for a query (e.g. "walking") → scenes
  fall back to bright branded cards. No black frames, no broken videos, ever.
  This is a Pexels data/rate-limit limit, not a code defect.

**Run + verify a video (single attempt avoids offline-TTS 25s×3 retry budget):**
```bash
export PEXELS_API_KEY="<key>"
export OPENVERSE_ENABLED=false   # skip dead Flickr-sourced Openverse URLs
npx tsx bin/agentic-auto.ts --topic "5 fascinating facts about coffee" \
  --title "Coffee Facts" --images --preset cinematic --no-sfx --max-attempts 1
```
**Visual verification:** extract frames and run blackdetect (same check as X10):
```bash
FFMPEG=$(node -e "console.log(require('ffmpeg-static'))")
"$FFMPEG" -i render/<job>.mp4 -vf "blackdetect=d=0.3:pix_th=0.15" -f null -
# no "black_start" output == non-black == visually valid
```

**Known environment limits (not code bugs):**
- Edge-TTS is unreachable on this box → voice falls back to tone beeps (the
  25s timeout in `tts.ts` prevents hangs). Online, real narration works.
- Free-music providers (open-lofi, internet-archive) 404 → often no soundtrack
  offline. Use `--no-sfx` for deterministic offline runs.
- `OPENVERSE_ENABLED=false` is recommended here because Openverse returns
  Flickr URLs that 502 on download.
- `fontconfig` is broken on this box; all drawtext calls pin a real font file
  (`C:/Windows/Fonts/arial.ttf`) so captions/karaoke/thumbnail never hang.

---

## 8. FREE advanced features (offline, $0) — `src/agentic/export.ts`

All of these run with **no API keys, no paid services, no network**. Implemented
the 120-day-plan "advanced" items that need no external dependency:

- **Multi-aspect export** — every render also emits `_16x9.mp4`, `_1x1.mp4`,
  `_9x16.mp4` (ffmpeg scale+pad, no crop/distortion). Push one video everywhere.
- **Free social metadata** — `generateFreeMetadata(plan)` writes `_metadata.txt`
  with a YouTube/TikTok-ready TITLE, DESCRIPTION, HASHTAGS, TAGS. No LLM call
  (legacy `generateMetadataAI` is NOT used → stays free + offline).
- **Branded thumbnail** — `renderThumbnail()` burns the title onto frame 1.
- **Karaoke / word-level captions (B1)** — `--karaoke` highlights each word in
  turn (yellow on dark box). Word timing is generated FREE from the script
  (`wordTimingsFromScript`); when real TTS word-timings exist they can replace it.
  Verified: a karaoke render produced a valid video with all X7–X15 gates passing.
- **A/B variant** — `renderVariant(res, preset, tag)` re-renders the same approved
  plan with an alternate preset (e.g. `reels` vs `cinematic`) for comparison.

**CLI:**
```bash
npx tsx bin/agentic-auto.ts --topic "..." --karaoke --aspect 16:9 --no-sfx
# outputs: <job>.mp4 + _16x9/_1x1/_9x16 + _thumbnail.jpg + _metadata.txt
```

## 7. Agent-editable + user-media features (P1, ported from legacy)

These three were ported from the mature legacy system (`video-generator.ts` +
`scene-editor.ts`) into the agentic pipeline, all additive.

**P1a — Local asset reuse.** A user (or agent) can supply their OWN photos/videos
in `input/visuals/` and bind them per scene. Files are distributed
round-robin across scenes; scenes beyond the file count fall back to stock fetch.
- CLI: `--local-assets "my_photo.jpg,my_clip.mp4"`
- Config: `localAssets: ["my_photo.jpg","my_clip.mp4"]`
- Verified: a run with `--local-assets "local_test_a.jpg,local_test_b.jpg"`
  produced scene candidates sourced `local-asset` / `local://local_test_a.jpg`
  etc. — zero Pexels fetches for those scenes.

**P1b — Default-visual fallback.** A user-supplied `default.jpg`/`default.mp4`
in `input/visuals/` is used as the LAST-RESORT visual when both the Pexels
pool and the fetch ladder fail (legacy `default.mp4` behavior). Reuses
`inputAssetPath()` + `makePlaceholder` machinery.
- CLI: `--default-visual "default.jpg"`
- Config: `defaultVisual: "default.jpg"`

**P1c — Scene edit API (`src/agentic/scene-edit.ts`).** Lets a NEW Hermes agent
reshape a generated video WITHOUT re-running the whole pipeline. The plan is
persisted to `<workspace>/plan.json` on every run. Functions:
- `reorderScenes(ws, from, to)` — move a scene.
- `deleteScene(ws, index)` — remove a scene (+ its candidates).
- `updateScene(ws, index, {voiceoverText, searchKeywords, durationSec, localAsset, visualPreference})` — patch a scene.
- `insertScene(ws, {voiceoverText, ...}, index?)` — add a scene (e.g. a CTA).
All renumber `sceneNumber` and recompute `totalDurationSec`. Covered by
`scene-edit.test.ts` (5 tests, all passing).

**How an agent edits an existing video:**
```ts
import { reorderScenes, deleteScene } from './src/agentic/scene-edit.js';
const ws = { jobId, root: 'agentic-pipeline/workspaces/<jobId>', /* ... */ };
reorderScenes(ws, 0, 2);           // move opening scene to the end
deleteScene(ws, 4);                // drop a weak scene
// then re-render with renderAgenticSlideshow(ws, {...}) or re-run autopilot
```
