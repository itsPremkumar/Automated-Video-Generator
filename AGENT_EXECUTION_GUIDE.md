# Advanced AI Video Generation System – Complete End-to-End Execution Plan

> **Corrected against the actual codebase** (`C:\one\Automated-Video-Generator`) on 2026-07-27.
> **Second-pass corrections** applied: Phase 12 color grading, Phase 17 motion/transition
> plugins, Phase 6 Wikimedia availability, and workspace path.

**Important — Strict AI Agent Execution Rule:**
The AI agent **MUST NOT use the existing pipeline** (`src/agentic/orchestrator/pipeline.ts` or
`npm run agentic:batch`). Every item below is done by the AI agent **one-by-one**, manually,
using its own built-in tools (LLM, `web_search`, `browser_*`, `vision_analyze`, code writing).
Each step is completed and **visually verified by the AI agent** before the next begins.
No bulk processing, no automated batch mode. This guarantees professional quality control
at every unit. The AI agent acts as a human video editor — thinking, deciding, verifying
each piece before moving forward.

---

# Agent-Only Phases (zero project code execution)

These phases are done **entirely by the AI agent** using its own capabilities — no
existing pipeline functions, no ffmpeg, no Remotion renderer, no Python scripts.

| # | Phase | How the agent does it | Verification |
|---|---|---|---|
| **1** | **Collect Requirements** | Agent asks follow-up questions in conversation to gather topic, audience, tone, style, platform, duration, CTA, branding, aspect ratio, voice/music preferences | Agent confirms everything is filled in `agentic-scripts.json` fields |
| **2** | **Research Topic** | Agent uses `web_search` for facts, stats, trends, competitor content. Uses `browser_*` to navigate reference sites, capture content | Agent reads back key findings and confirms with user |
| **3** | **Write Script** | Agent generates full narration script (hook → story arc → scenes → CTA) using its LLM. Optimized for retention and transitions | Agent reads through the script, checks for flow, hooks, and closing |
| **4** | **Scene Breakdown** | Agent splits script into numbered scenes, each with: `durationSec`, `voiceoverText`, `searchKeywords`, `visualPreference` (video/image/motion), inline tags `[Visual:]` `[Motion:]` `[Transition:]` | Agent reviews each scene for completeness |
| **5** | **Capture Website Screenshots** | Agent navigates to provided URLs via `browser_navigate`, takes screenshots via `browser_vision`, saves PNGs to `input/visuals/` | Agent inspects each screenshot with `vision_analyze` for readability |
| **7** | **Write Remotion Compositions** | Agent writes TSX code from scratch for any motion kind (infographic, HUD, kinetic typography, diagram, abstract, logo reveal, intro/outro). The code is valid Remotion `<AbsoluteFill>` + `<Text>` + `<TransitionSeries>` components | Agent reviews the written code for correctness before any rendering |
| **8** | **Asset Quality Verification** | Agent runs ffprobe (signal gate: resolution/codec/duration) + extracts ONE frame via ffmpeg → `vision_analyze` (content gate: subject match, no black/corrupt/watermark) | **Each asset verified individually** before the next is acquired. On failure: delete → re-acquire → re-verify |
| **14** | **Tag Visual Assets** | Agent writes search keywords, `visualPreference`, relevance scores per scene using its understanding of the script | Agent cross-references keywords against scene voiceover text |
| **15** | **Generate `agentic-scripts.json`** | Agent assembles the complete job spec JSON with: scene list, scene→asset mappings, transitions, text overlays, captions, CTA, music, voice settings, advanced FX config | Agent validates the JSON structure against `AGENTIC_SCRIPT_FORMAT.md` |
| **17** | **Configure Advanced FX** | Agent writes ONE config object at a time (camera shake, then speed-ramp, then parallax, then particles, etc.), verifies its values, then writes the next. All per-scene values set in the job spec | Agent verifies each FX config value is within valid ranges before writing the next config |
| **18/20** | **Quality Review** | Agent extracts 2 frames per scene via ffmpeg (30%/70% positions), then a 5–7 frame tile grid across final timeline → `vision_analyze` each for: black frames, corruption, wrong subject, audio-sync drift, artifacts, spelling/grammar in captions, branding consistency | **Each scene + final grid reviewed individually** before proceeding. On failure: go back to that scene's creation step |

**What the agent then commands the project code to execute** (these require ffmpeg /
Remotion Chrome / Python / TTS model — the agent directs but does not execute):
- Asset download (Pexels/Pixabay/Openverse)
- ffmpeg edits (merge, trim, crop, speed, reverse, GIF, etc.)
- Voice generation (speech backends)
- Music download + normalize
- Final video compose + encode
- 4K / multi-aspect export

For those, the agent still follows the **one-by-one rule**: command ONE operation,
`vision_analyze` the output, then command the next.

---

# ⭐ The Fully-Curated Local-Asset Path (recommended for highest quality)

When the agent has curated **every** asset itself (screenshots, one-by-one stock
downloads, agent-authored Remotion clips) and bound them with `[Visual: <file>]`
tags, do **NOT** run the network acquire stage. Use the local-asset path:

```bash
npx tsx src/adapters/cli/agentic-modular.ts plan    --file <job.json>
npx tsx src/adapters/cli/agentic-modular.ts voice   --file <job.json>
npx tsx src/adapters/cli/agentic-modular.ts visuals --no-acquire --file <job.json>   # ← key flag
npx tsx src/adapters/cli/agentic-modular.ts render  --file <job.json>
```

`--no-acquire` builds `render-manifest.json` directly from the plan's
`localAsset` bindings + resolved background music — zero network fetch, zero
gateway, no hand-written manifest. This is the path that produced the verified
AVS showcase video (see `docs/AVS_SHOWCASE_GENERATION_WALKTHROUGH.md`).

**Script-authoring rules that make this path work:**

1. **One narrative line = one scene.** The parser splits prose on sentence
   periods. A line that carries a `[Visual: <file>]` binding is kept as ONE
   scene even if it contains multiple sentences/clauses — but a line *without*
   a binding will be split. Author one line per scene, each ending with its
   `[Visual:]` tag.
2. **Author order is preserved when local assets are bound.** The planner's
   hook-first reorder (`applyProEdits`) is skipped when scenes carry
   `localAsset` bindings, so your CTA stays last. For pure-stock jobs the
   reorder MAY move the most intriguing scene first — review
   `workspace/jobs/<id>/plan.json` scene order before running voice/render.

---

# Phase 1 – Collect User Requirements (agent-assisted)

The agent collects requirements via the `clarify` tool / CLI flags before running the pipeline.

Collect: topic, audience, purpose, platform, duration, language, tone, visual/animation
style, color theme, branding, logo, website refs, CTA, aspect ratio (16:9 / 9:16 / 1:1),
preferred voice, music style, mandatory/avoided scenes.

If info is missing, the agent asks follow-ups (as it does in this session). These map to
fields in `input/scripts/agentic-scripts.json`

---

# Phase 2 – Research the Topic (fully handled by the AI agent)

The **agent** uses its own tools (`web_search`, `browser_*`) to research the topic
autonomously — finding facts, statistics, trends, competitor content, and reference
visuals. The pipeline does **not** contain a built-in research stage because it
consumes a finished script. The agent saves research links, notes, and screenshots
into `input/visuals/`, then passes the synthesized knowledge to the script stage.
This phase is 100% agent-driven and complete.

---

# Phase 3 – Generate the Script (fully handled by the AI agent)

The AI agent generates the full narration script using its LLM (hook → story arc →
scenes → CTA), optimized for retention, storytelling, and transitions. The agent
produces both a full narration and a scene list, then reviews for flow, hooks, and
closing before proceeding.

---

# Phase 4 – Scene Breakdown (fully handled by the AI agent)

The AI agent splits the script into numbered scenes, each with: durationSec,
voiceoverText, searchKeywords, visualPreference (`video` | `image` | `motion`),
and motion/transition hints. Camera movement & icon/logo overlays are declared via
inline tags (`[Visual:]`, `[Motion:]`, `[Transition:]`, `[Color:]`, …).

---

# Phase 5 – Website Capture (agent-assisted)

The **pipeline does not open a browser**. The agent captures screenshots with its browser
tool (`browser_navigate` + `browser_vision` → PNG in its cache), then copies them into
`input/visuals/` (e.g. `s0.png`, `s1.png`). The agent then treats them as
local assets for scene assembly. **Critical:** full-page screenshots are very tall — convert with a
scroll-pan ffmpeg recipe (scale 1920 wide, crop 1080 viewport, pan down) so they
stay readable inside the 1920×1080 frame. (See `docs/MIXED_MEDIA_WORKFLOW.md`.)

---

# Phase 6 – Asset Collection (corrected provider list)

> ⚡ Quick-start JSON: `input/scripts/agentic-script-examples/modes/01-download-images.json` | `02-download-videos.json` | `04-download-sfx.json`

Search/download entry point is `src/lib/visual-fetcher/search.ts` (`searchImages` / `searchVideos`). Underlying providers:
- **Pexels** (API key) — used directly in `search.ts` via REST API
- **Openverse** — `src/lib/openverse-fetcher.ts` (CC images, no API key)
- **Wikimedia** — `src/lib/free-{image,video}/providers/wikimedia.ts`
- **Pixabay** — video via `searchPixabayVideos` (`search.ts`), music via `PixabayProvider` (`src/music-system/providers/pixabay.ts`)
- **Internet Archive** — `src/lib/free-image/providers/archive.ts` + `src/lib/free-video/providers/archive.ts` (images + videos, no API key)
- **NASA** — `src/lib/free-image/providers/nasa.ts` (images only, gated to space-related queries)
- **MetMuseum** — `src/lib/free-image/providers/metmuseum.ts` (images only, gated to art-related queries)

NOT present in code: Unsplash, Freepik. Downloads land in **`input/visuals/`** (single
folder — not `input/images/`, `input/videos/`, etc.). Search uses one keyword at a time;
each returned candidate is verified individually (ffprobe + vision) before the next
download begins. No batch ranking, no bulk approval.

---

# Phase 7 – Generate Missing Visuals with Remotion

The **agent** writes a Remotion composition (TSX) from scratch — either from a
free-text description (`[GenMotion: ...]`) or a kind (`infographic` | `hud` |
`kinetic` | `diagram` | `abstract` | …). The agent then commands `runRemotionController`
(`src/agentic/media/hermes-remotion-controller.ts`) to bundle the TSX via
`@remotion/bundler` and render an MP4 via `@remotion/renderer` (Chrome → H.264).
`remotion-sequence.ts` also renders `<TransitionSeries>` timelines and
`renderStillClip` (PNG). The agent verifies every output with `vision_analyze`.

**Important:** The ffmpeg-based compose path (`compose.ts`) uses `xfade` transitions
(fade/slide/zoomblur/cut) — not CSS. Shader-based transitions (glitch, morph-cut, whip-pan)
are available as plugins in `src/agentic/plugins/transitions/`. **Write + render is real.**

Supported motion kinds (extend the list from the real `kinds` map, not the original
20-item wishlist): infographic charts, HUD/radar, kinetic typography, diagrams,
abstract backgrounds, logo reveal, intro/outro.

**⭐ For unlimited bespoke motion graphics use `[GenMotion: <free description>]` or
`autonomousMotion: true`** (see `input/scripts/AGENTIC_SCRIPT_FORMAT.md` §4.5.1).
Unlike preset `[Motion: comp]` kinds, GenMotion lets the agent author a NEW Remotion
`.tsx` from scratch for ANY concept — procedural art, timelines, UI demos, maps,
audio-reactive spectrum — then render → ffprobe-verify → vision-check → self-fix
(up to `motionMaxRetries`, default 5) → integrate into `input/visuals/` as a
`[Visual:]` asset. Generated code is safety-gated by `assertSafeImports()` (only
`remotion`/`react`/`@remotion/*` imports). This is the highest-leverage feature
for advanced videos — prefer it whenever a preset kind doesn't fit.

---

# Phase 8 – Asset Quality Verification (agent-driven)

The AI agent verifies every asset **individually** using its own tools — NOT the
project's `verify.ts` (which depends on a local Ollama server that may not be running).

For each single asset (image, video, Remotion clip, screenshot):

**1. Signal gate — check resolution, codec, duration via ffprobe:**
```powershell
$ffp = node -e "console.log(require('ffprobe-static').path)"
& $ffp -v quiet -print_format json -show_format -show_streams "<asset_path>"
```
Must show: valid resolution (match job spec), h264/h265, duration ≥ expected.

**2. Content gate — extract one frame, analyze via agent vision:**
```powershell
$ff = node -e "console.log(require('ffmpeg-static'))"
& $ff -y -i "<asset_path>" -ss 1 -frames:v 1 -vf scale=1280:-1 workspace/tmp_agent_run/check.jpg
```
Then agent runs `vision_analyze("workspace/tmp_agent_run/check.jpg")` asking:
- Does this show the expected subject?
- Any black frames, corruption, watermarks, wrong subject, bad lighting?

**3. If both pass → asset approved. If either fails → delete asset, re-download/re-generate, re-verify. No bulk batching.**

This replaces the project's `verify.ts` (Ollama-gated) path entirely. See Appendix A.5 for the copy-paste verify block.

---

# Phase 9 – Background Music Collection

> ⚡ Quick-start JSON: `input/scripts/agentic-script-examples/modes/03-download-music.json`

The agent downloads ONE background music track at a time via `src/lib/free-music.ts`
(procedural + ccMixter + Internet Archive sources), matched by mood/genre/energy.
Each track is verified individually (`music-verifier.ts` checks quality/length/
loudness/licensing) before the next download; audio can be looped to fit via
`loopAudioToDuration` (`src/agentic/operations/sfx.ts`). (No paid/freepik music.)

---

# Phase 10 – Voice Generation

> ⚡ Quick-start JSON: `input/scripts/agentic-script-examples/modes/07-voice-edgetts.json` | `08-voice-voicebox.json` | `09-clone-voice.json`

`src/speech/backends/` contains real models: `chatterbox`, `chatterbox_turbo`,
`kokoro`, `qwen_llm`, `qwen_custom_voice`, `luxtts`, `mlx`, `pytorch`, `base`.
Wired through `src/lib/voice-generator.ts` + `src/agentic/media/voice-controller.ts`
+ `src/lib/speech-backend.ts`. Supports multiple languages/accents/emotions; narration
is synced to scenes by the voice stage.

---

# Phase 11 – Image Editing

A full single-image editing toolbox exists at `src/adapters/cli/agentic-image.ts` (29 commands):
- `npm run agentic:image convert/resize/crop/rotate/adjust/blur/text/emoji/watermark/tint/vignette/border/enhance/flip/info/to-video/contact-sheet/gif/grayscale/sepia/pixelate/slideshow/remove-bg`
 (via ffmpeg-static + sharp — zero cost, no API keys).
- **Background removal** — `remove-bg` command via `tools/remove_bg.py` (rembg, on-device AI, offline).
- Programmatic API: `src/agentic/operations/remove-bg.ts:removeBackground()`.
- Slideshow/video conversion: `src/agentic/operations/image-video.ts` (`imagesToVideo`, `videoToImages`).
- Structural edits: `src/agentic/media/scene-edit.ts` (reorder/delete/insert).

NOT implemented: remove object, add shadow/light, match branding.

---

# Phase 12 – Video Editing (17 functions + grading)

`src/agentic/operations/edit.ts` exports exactly:
- `mergeVideos`
- `trimVideo`
- `cropVideo` (also does aspect-ratio conversion)
- `resizeVideo`
- `rotateVideo`
- `extractAudio`

Additionally, the **broader system** provides (via `compose.ts` + `advanced-fx.ts` +
`visual-fx.ts`):
- **Color correction** — per-scene contrast/saturation/brightness/gamma/colorTemp
 (`applyColorAdjustments`)
- **Color grading** — highlights/shadows/whites/blacks/color-wheels/tone-curve
 (`applyColorGradeDepth`)
- **Named palettes** — warm/cool/blue/teal/cyberpunk/vintage/cinematic
 (`buildPaletteFilter`)
- **Speed adjustment** — per-scene clip speed (`clipSpeedByScene` → `setpts`)
- **Blur** — per-scene boxblur (`blurScenes`)
- **Filters** — bw/vintage/sepia per scene (`filterByScene`)
- **Stabilization** — per-scene vidstab (`stabilizeScenes`)
- **Chroma key** — per-scene green-screen removal (`chromaKeyScenes`)
- **Opacity/blend modes** — per-scene (`applyOpacityBlend`)
- **Mirror/flip** — per-scene hflip/vflip (`applyMirror`)
- **Ken Burns** — zoompan on stills (`kenBurns`)

NOT present in `edit.ts`: stabilisation, object removal,
noise reduction, subtitle generation. The compose stage adds
transitions/zoompan/kinetic text via `advanced-fx.ts` + `compose.ts`.

Additionally, these operations added as standalone modules:
- `interpolateVideo` — motion interpolation (60/120 fps via `minterpolate`)
- `changeSpeed` — slow-mo 0.25x to 10x fast (`setpts` + `atempo`)
- `reverseVideo` — play backward (`reverse` + `areverse`)
- `addTextOverlay` — burn text onto video (`drawtext`)
- `extractThumbnail` — frame → PNG at timestamp
- `videoToGif` — animated GIF with palette optimization
- `loopVideo` — repeat N times via concat
- `splitVideo` — cut at timestamp → two files
- `addAudio` — replace or mix new audio track
- `silenceRemove` — auto-cut silent sections
- `addProgressBar` — animated bar overlay
- **Background removal** — `src/agentic/operations/remove-bg.ts` (Python `rembg`).

---

# Phase 13 – Asset Organization (corrected folder tree)

Real layout (single `input/visuals/` bucket + `input/scripts/`):
```
project/
├── input/
│   ├── visuals/         ← images, videos, screenshots, Remotion clips, logos
│   ├── bgm/             ← background music (user-curated + auto-downloaded)
│   │   └── __bundled__/ ← shipped stock tracks
│   ├── voiceover/       ← user voiceover audio
│   ├── voices/          ← voice samples/settings
│   └── scripts/
│       ├── agentic-scripts.json      ← job definitions (single source)
│       └── examples/
├── output/                           ← final + intermediate renders
└── workspace/jobs/<jobId>/           ← AVS git-ignored scratch
```
BGM files go in `input/bgm/` (resolved by `inputBgmPath()` in `src/lib/path-safety.ts:32`).
Visuals go in `input/visuals/` (`inputAssetPath()`). The `backgroundMusic` field in
`agentic-scripts.json` references a filename in `input/bgm/` (not `input/visuals/`).
There is no `input/images/`, `videos/`, `logos/`, `screenshots/`, `sfx/`, `speech/`,
`animations/`, `remotion/` split. Scratch workspace is at `workspace/jobs/<jobId>/`.

---

# Phase 14 – Visual Asset Tagging (fully handled by the AI agent)

The agent writes search keywords, `visualPreference`, and relevance scores per scene
based on the script content, then cross-references them against voiceover text to
ensure relevance. These tags are used later when the agent commands asset downloads
via the search functions.

---

# Phase 15 – Generate `agentic-scripts.json` (fully handled by the AI agent)

> ⚡ See complete reference examples: `input/scripts/agentic-script-examples/full-demos/` (8 ready-to-render jobs)
> ⚡ Feature-specific patterns: `input/scripts/agentic-script-examples/features/` (15 files — transitions, grading, captions, audio, persona, etc.)

The agent assembles the complete job spec JSON with: scene list, scene→asset mappings,
transitions, text overlays, captions, CTA, music, voice settings, advanced FX config.
The schema is documented in `input/scripts/AGENTIC_SCRIPT_FORMAT.md`. The agent
validates the JSON structure against that schema before proceeding.

---

# Phase 16 – Scene Assembly

> ⚡ Quick-start JSON: `input/scripts/agentic-script-examples/modes/11-compose-full.json`

`src/agentic/operations/compose.ts` assembles each scene from image/video/motion/
screenshot + voice + music + sfx + text overlays + captions, synced to narration.
Lower-thirds/progress bars are applied via `advanced-fx.ts` where declared. Uses
ffmpeg `xfade` transitions (fade/slide/zoomblur/cut) with per-scene duration and curve.

---

# Phase 17 – Advanced Editing (corrected — what is actually wired vs. present as module)

> ⚡ Quick-start JSON: `input/scripts/agentic-script-examples/features/06-motion-graphics.json` | `07-per-scene-filters.json` | `08-color-grading-advanced.json`

There are **two parallel effect systems** in this repo. They are NOT the same path,
and conflating them is the single biggest source of doc-vs-reality drift.

### A. The path `agentic-modular render` actually uses (compose.ts + advanced-fx.ts + overlays.js)

This is the render engine the agent invokes (`src/adapters/cli/agentic-modular.ts →
src/agentic/operations/compose.ts`). It is **standalone** — it imports NOTHING from
`src/agentic/plugins/`. The effects below are genuinely produced by this path:

- **Motion FX (per-scene, real):** `compose.ts` lines 324-328 call `applyParallax` +
  `applyParticles` (advanced-fx.ts) and `applyShake` + `applySpeedRamp` + `applyPunchIn`
  (advanced-fx.ts — wired this session). Set via `parallaxDepthByScene`, `particlesByScene`,
  `shakeByScene`, `speedRampByScene`, `punchInByScene`.
- **Color (per-scene, real):** `applyColorAdjustments`, `applyColorGradeDepth`, `buildPaletteFilter`
  (advanced-fx.ts), plus `applyMirror`, `applyOpacityBlend`, `applyLut`, `applyChromaKey`,
  `kenBurns` flag. Set via `colorAdjustmentsByScene`, `colorGradeDepthByScene`, `paletteFilter`,
  `filterByScene`, `blurScenes`, `chromaKeyScenes`, `kenBurns`.
- **Overlays (lower-third / progress-bar / captions / CTA / emoji / title):** burned by
  `compose.ts` via its OWN engine — `buildOverlayPlan(job)` from `./overlays.js` (line 361) +
  `txt()` drawtext. **NOT** the `plugins/overlays/*` files.
- **Transitions (glitch / morph-cut / whip-pan / light-leak):** `compose.ts` maps these
  names to native ffmpeg `xfade` types (lines 754-762): `glitch→pixelize`, `whippan→hblur`,
  `morphcut→smoothleft`, `lightleak→fadewhite`. The OUTPUT matches the name, but the
  **`plugins/transitions/*` files are NOT invoked** — ffmpeg's built-in xfade is.

So: every effect listed above WORKS in the `agentic-modular` path. But the
`src/agentic/plugins/*` module files are **not** what produces them.

### B. The plugin module system (`src/agentic/plugins/`)

The plugin files exist and are real, well-structured modules
(`lowerThirdPlugin`, `progressBarPlugin`, `dynamicCaptionsPlugin`, `typewriterPlugin`,
`glitchPlugin`, `lightLeakPlugin`, `kenBurnsPro`, `shakePlugin`, etc.). They are registered
in `src/agentic/plugins/index.ts` (`registerDefaultPlugins`) and consumed by the **legacy
orchestrator** (`src/agentic/orchestrator/pipeline.ts` / `render.ts`).

**Critical:** per the Strict AI Agent Execution Rule (top of this guide), the agent MUST
NOT use `src/agentic/orchestrator/pipeline.ts`. Therefore, for the agent's workflow, the
`plugins/` modules are **effectively dormant** — editing `plugins/overlays/lower-third.ts`
will NOT change the output of `agentic-modular render`. The compose path owns those effects.

### Bottom line for the agent
Set the per-scene FX config in the job spec (the field names above). The compose engine
applies them. Do NOT assume a change to a `plugins/*` file will affect the modular render —
it won't, unless/until compose is refactored to dispatch to the plugin registry.

NOT present anywhere (future work): motion blur, mask/shape transitions, animated callouts.

---

# Phase 18 – AI Quality Review (agent-driven)

The AI agent reviews every intermediate output **individually** — NOT the project's
`verify.ts` (Ollama-dependent and unreliable when the server is down).

**Per-scene review after render step:**
1. Extract frame at 30% and 70% of the scene timeline:
   ```powershell
   $ff = node -e "console.log(require('ffmpeg-static'))"
   & $ff -y -i "<rendered_scene.mp4>" -ss 0.3 -frames:v 1 workspace/tmp_agent_run/scene_a.jpg
   & $ff -y -i "<rendered_scene.mp4>" -ss 0.7 -frames:v 1 workspace/tmp_agent_run/scene_b.jpg
   ```
2. Agent runs `vision_analyze` on both frames checking:
   - Script accuracy (does the visual match the voiceover text?)
   - Visual relevance, no wrong subject
   - No black frames, corruption, artifacts
   - Subtitle/caption readability and spelling
   - Color/branding consistency
3. **Audio sync check** — use ffprobe to compare audio duration vs video duration:
   ```powershell
   $ffp = node -e "console.log(require('ffprobe-static').path)"
   $info = & $ffp -v quiet -print_format json -show_format -show_streams "<rendered_scene.mp4>" | ConvertFrom-Json
   $v = $info.streams | Where-Object { $_.codec_type -eq 'video' } | Select-Object -First 1
   $a = $info.streams | Where-Object { $_.codec_type -eq 'audio' } | Select-Object -First 1
   Write-Host "video:$($v.duration)s audio:$($a.duration)s diff:$([math]::Abs($v.duration - $a.duration))"
   ```
   Audio/video duration diff must be < 0.5s.

**On failure:** delete the faulty asset, re-run its creation step (re-download, re-generate, or re-render), re-verify. Keep repeating until quality passes.

---

# Phase 19 – Final Rendering (multi-aspect including 4K)

> ⚡ Quick-start JSON: `input/scripts/agentic-script-examples/full-demos/08-multi-aspect-4k.json` | `features/12-export-options.json`

`compose.ts` renders the final `final.mp4` at the job resolution first. Then,
if `exportAspects` is set (`9:16`, `16:9`, `1:1`, **`4K`**), the agent renders
ONE aspect variant at a time, verifies it (ffprobe + vision_analyze frame
extraction), then renders the next. **4K is now supported** — add `exportAspects: ["4K"]`
to the job spec and it renders a 3840×2160 variant after the primary is verified.
Note: 4K is an **upscale** of the base render (e.g. 1280×720 → 3840×2160), not native
4K source rendering. **For sharpest 4K results:** author Remotion clips at 3840×2160
native and set the job resolution to 1920×1080 minimum before upscaling; pure
720p→4K upscales look soft on large screens. Additional exports (thumbnail/poster,
contact sheet, captions, chapters) are rendered one per command, each verified
before the next.

---

# Phase 20 – Final Verification (agent-driven)

Final AI review by the agent using `vision_analyze` on a multi-frame grid — NOT
`verify.ts` (Ollama-gated, unreliable).

**1. Extract 6 frames spread across the final video timeline and tile into a 2×3 grid:**
```powershell
$ff  = node -e "console.log(require('ffmpeg-static'))"
$ffp = node -e "console.log(require('ffprobe-static').path)"

# get total duration in seconds
$info = & $ffp -v quiet -print_format json -show_format "final.mp4" | ConvertFrom-Json
$dur = [double]$info.format.duration

# extract 6 frames at 5%, 20%, 40%, 60%, 80%, 95% of timeline
$ts = @([math]::Round($dur*0.05,2), [math]::Round($dur*0.20,2), [math]::Round($dur*0.40,2),
        [math]::Round($dur*0.60,2), [math]::Round($dur*0.80,2), [math]::Round($dur*0.95,2))
0..5 | ForEach-Object { & $ff -y -i "final.mp4" -ss $ts[$_] -frames:v 1 -vf scale=640:-1 "workspace/tmp_agent_run/frame$_.jpg" }

# tile 6 frames into a 2-column × 3-row grid
& $ff -y -i workspace/tmp_agent_run/frame0.jpg -i workspace/tmp_agent_run/frame1.jpg `
      -i workspace/tmp_agent_run/frame2.jpg -i workspace/tmp_agent_run/frame3.jpg `
      -i workspace/tmp_agent_run/frame4.jpg -i workspace/tmp_agent_run/frame5.jpg `
      -filter_complex "[0:v][1:v][2:v][3:v][4:v][5:v]xstack=2x3" workspace/tmp_agent_run/final_grid.jpg
```

**2. Agent runs `vision_analyze` on the grid checking:**
- No missing assets or blank frames across the entire timeline
- No broken scene references (ordering correct, no duplicate scenes)
- No audio-sync drift (all scenes should be within 0.5s)
- No artifacts, corruption, black frames
- No spelling/grammar mistakes in on-screen text or captions
- Smooth playback: transitions are present, no hard jumps between unrelated content
- No watermark or wrong branding visible

**3. If the grid passes → video is production-ready.**
**If any frame fails → route back to the owning phase (re-download asset, re-render scene, re-compose), then re-run final verification from step 1.**
Only mark the job complete after a clean grid review.

Downscale frames if the output is ≥4K before passing to `vision_analyze` (full-res can time out).

---

# Final Objective (status vs. current code)

The completed system should function as a fully autonomous AI video production pipeline:

1. Understand requirements (agent + `agentic-scripts.json` fields)
2. Research topic (fully handled by the AI agent)
3. Write high-quality script (fully handled by the AI agent)
4. Break into scenes (fully handled by the AI agent)
5. Collect website screenshots + browser captures (agent captures → `input/visuals/`)
6. Download images/videos (Pexels, Pixabay, Openverse, Wikimedia)
7. Generate missing visuals via Remotion (`runRemotionController`)
8. Image pixel-editing toolbox (29 commands in `agentic-image.ts`; only object-removal/shadow/brand-match missing)
9. Select + sync realistic AI voice (`src/speech/backends/`)
10. Download + optimize background music (`free-music.ts`)
11. Organize assets (`input/visuals/` for visuals, `input/bgm/` for music, `input/voiceover/` for voice)
11b. Frame interpolation (`edit.ts:interpolateVideo`)
11c. Background removal (`remove-bg.ts` + Python `rembg`)
12. Tag visual assets (per-scene search keywords, visualPreference, relevance scores)
13. Generate `agentic-scripts.json` + manifests with scene→asset mappings
14. Pro transitions/motion/captions/cinematic fx (shake, speed-ramp, parallax,
     particles, glitch/morph-cut/whip-pan/light-leak transitions, color grading —
     all WORK in the compose path via per-scene config; see Phase 17 for the
     important caveat that the `src/agentic/plugins/*` module files are NOT the
     code path for `agentic-modular render`). Remaining future work: motion blur,
     mask/shape transitions, animated callouts.
15. Automated QA at every stage (`verify.ts`)
16. Auto-reject + regenerate low-quality assets (gateway loop)
17. Render polished multi-format video (multi-aspect + 4K via `exportAspects: ["4K"]`)
18. Repeat verify/correct cycles until professional standard

**Remaining gaps (to reach full):** object-removal/add-shadow/match-branding in `agentic-image.ts`,
stabilization/noise reduction/subtitle gen in `edit.ts`,
motion blur + mask/shape transitions in `advanced-fx.ts`.

---

# Appendix A — "One-by-One" Execution Rule (every unit built & verified alone)

The user's hard requirement: **do NOT batch.** Each asset is downloaded / generated,
then **verified on its own**, before the next one starts. Proven by a real run
(`proof_onebyone.mts` / `proof_offline.mts`) on 2026-07-27.

## A.1 Download ONE image → verify it → then next
```ts
// 1) fetch exactly ONE asset
const imgs = await searchImages('mountain landscape', 1, 1, 'landscape'); // limit=1 → ONE
const imgPath = 'input/visuals/proof_img.jpg';
await fetchToFile(imgs[0].url, imgPath);          // native fetch + UA header (proven, ~4.4 MB)
// 2) verify THAT ONE image alone
const r = await verifyOne(imgPath, ['mountain','landscape']);
// → only proceed to the video step after r passes
```
Real result: `proof_img.jpg` = 4,380,217 bytes (downloaded, real Pexels file).

## A.2 Download ONE video → verify it → then next
```ts
const vids = await searchVideos('city traffic timelapse', 1, 1, 'landscape'); // limit=1 → ONE
const vidPath = 'input/visuals/proof_vid.mp4';
await fetchToFile(vids[0].url, vidPath);            // ~15 MB real clip
const r2 = await verifyOne(vidPath, ['city','traffic','road']);
```
Real result: `proof_vid.mp4` = 15,078,443 bytes.

## A.3 Remotion — write code FROM SCRATCH, render ONE image → verify
```ts
const { renderStillClip } = await import('./src/agentic/media/remotion-sequence.ts');
await renderStillClip({                       // code is authored inline = "from scratch"
  compositionId: 'ProofStill', width: 1920, height: 1080, durationInFrames: 120,
  frameToRender: 60, chromeExecutable: process.env.CHROME_EXECUTABLE,
  code: `import {AbsoluteFill,Text} from 'remotion';
         export const ProofStill = () => (<AbsoluteFill style={{background:'linear-gradient(135deg,#0a0a14,#7c3aed)'}}>
           <AbsoluteFill style={{justifyContent:'center',alignItems:'center'}}>
             <Text style={{color:'white',fontSize:120,fontWeight:'bold'}}>PROOF IMAGE</Text>
           </AbsoluteFill></AbsoluteFill>);`,
  outPath: 'input/visuals/proof_remotion.png',
});
// verify THAT ONE generated image alone
```
## A.4 Remotion — write code FROM SCRATCH, render ONE video clip → verify
```ts
const { runRemotionController } = await import('./src/agentic/media/hermes-remotion-controller.ts');
const res = await runRemotionController(
  [{ index:0, kind:'infographic', text:'Proof Growth',
     data:[20,45,70,95], labels:['Q1','Q2','Q3','Q4'],
     palette:['#0a0a14','#7c3aed','#22d3ee'], durationInFrames:90 }],
  { jobId:'proof_remotion', maxRetries:3, fps:30 },
);
// res[0].status==='generated' → verify THAT ONE clip alone
```
Real: controller returns `status:'generated'`, file at `input/visuals/proof_remotion_s0.mp4`.

## A.5 How to "visually verify" each one (the honest, working path)
**Finding from the run:** the project's built-in `verifyMedia(img, keywords, {vision})`
routes its vision check to a **local Ollama** (`moondream:latest` @
`localhost:11434`). With Ollama NOT running it throws `ECONNREFUSED` and
the call returns `verdict=undefined` — the `{vision:{enabled:false}}` flag does
**not** disable the Ollama call. So the built-in verifier is **not** a reliable
standalone gate right now.

**Therefore the one-by-one visual check uses the agent's own `vision_analyze`
tool** (used successfully in every earlier turn of this session). For each single
asset, extract ONE frame and inspect it:
```powershell
$ff = node -e "console.log(require('ffmpeg-static'))"
& $ff -y -ss 1 -i input/visuals/proof_vid.mp4 -frames:v 1 workspace/tmp_agent_run/f.png
# then: vision_analyze(workspace/tmp_agent_run/f.png, "Does this show city traffic? Any black/corrupt?")
```
This is the **always-available** visual verify and is what proved the mixed-media
videos earlier (screenshots readable, Remotion charts correct, etc.).

Offline signal-level gate that DOES always work (no Ollama): `verifyMedia` still
runs `ffprobe` (resolution/aspect/duration) — pair that with the agent
`vision_analyze` for the content check. Recommended per-asset loop:
1. download/generate ONE asset → save
2. `ffprobe` (via `verifyMedia` offline) → must be 1920×1080 / valid h264
3. `vision_analyze` ONE extracted frame → subject must match, no black/corrupt
4. **only then** move to the next asset

**Copy-paste verify block (per single asset):**
```powershell
$ff  = node -e "console.log(require('ffmpeg-static'))"
$ffp = node -e "console.log(require('ffprobe-static').path)"
$A   = "input/visuals/<asset>"        # the ONE asset just created

# signal gate — resolution/codec/duration
$info = & $ffp -v quiet -print_format json -show_format -show_streams $A | ConvertFrom-Json
$v = $info.streams | Where-Object { $_.codec_type -eq 'video' } | Select-Object -First 1
Write-Host "$($v.width)x$($v.height), $($v.codec_name), $($info.format.duration)s"

# content gate — extract ONE frame (note: -ss AFTER -i for accuracy)
& $ff -y -i $A -ss 1 -frames:v 1 -vf scale=1280:-1 workspace/tmp_agent_run/check.jpg

# then: vision_analyze(workspace/tmp_agent_run/check.jpg,
#   "Does this show <expected subject>? Any black frames, corruption, watermarks, wrong subject?")
```
For the FINAL video, extract 5–7 frames spread across the timeline, tile them with
ffmpeg `xstack`, and vision-check the grid in ONE call (cheaper + catches ordering
errors). See `docs/AVS_SHOWCASE_GENERATION_WALKTHROUGH.md` §6 for the exact recipe.
Downscale frames ≥4K to ~1280 wide before vision analysis (full-res can time out).

## A.6 Why this matters
Doing it one-by-one (not `searchImages(..., 12, 2, ...)` + bulk verify) means a
bad asset is caught **at the moment it is made**, not after 9 others are already
queued. This is exactly the "verify every step, fix before continuing" discipline
the plan demands, and it is executable today with the functions above.
