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
| **14** | **Tag Visual Assets** | Agent writes search keywords, `visualPreference`, relevance scores per scene using its understanding of the script | Agent cross-references keywords against scene voiceover text |
| **15** | **Generate `agentic-scripts.json`** | Agent assembles the complete job spec JSON with: scene list, scene→asset mappings, transitions, text overlays, captions, CTA, music, voice settings, advanced FX config | Agent validates the JSON structure against `AGENTIC_SCRIPT_FORMAT.md` |
| **17** | **Configure Advanced FX** | Agent writes the config objects for: camera shake, speed-ramp, parallax depth, particle effects, light leaks, color grade, watermarks, brand tints. Sets per-scene values in the job spec | Agent verifies each FX config value is within valid ranges |
| **18/20** | **Quality Review** | Agent extracts ONE frame per video asset via `browser_*` or `vision_analyze`, inspects for: black frames, corruption, wrong subject, bad lighting, artifacts, sync issues, spelling/grammar in captions | **Each asset reviewed individually** before proceeding. On failure: go back to that asset's creation step |

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

# Phase 3 – Generate the Script

Driven by `src/agentic/pipeline/plan.ts` (the `plan` stage). Produces title, hook,
intro, scene-by-scene narration, ending, CTA. Optimized for retention/storytelling/
transitions. Emits both a full narration and a scene list.

---

# Phase 4 – Scene Breakdown

`plan.ts` outputs structured `Plan.scenes`, each with: sceneNumber, durationSec,
voiceoverText, searchKeywords, visualPreference (`video` | `image` | `motion`),
and motion/transition hints. Camera movement & icon/logo overlays are declared in the
script via inline tags (`[Visual:]`, `[Motion:]`, `[Transition:]`, `[Color:]`, …).

---

# Phase 5 – Website Capture (agent-assisted)

The **pipeline does not open a browser**. The agent captures screenshots with its browser
tool (`browser_navigate` + `browser_vision` → PNG in its cache), then copies them into
`input/visuals/` (e.g. `s0.png`, `s1.png`). The acquire stage then treats them as
local assets. **Critical:** full-page screenshots are very tall — convert with a
scroll-pan ffmpeg recipe (scale 1920 wide, crop 1080 viewport, pan down) so they
stay readable inside the 1920×1080 frame. (See `docs/MIXED_MEDIA_WORKFLOW.md`.)

---

# Phase 6 – Asset Collection (corrected provider list)

Real providers in `src/lib/visual-fetcher/` are:
- **Pexels** (`searchImages` / `searchVideos`) — requires `PEXELS_API_KEY` in `.env`
- **Pixabay** (video fallback)
- **Openverse** (free image fallback)
- **Wikimedia** (via `freeImageAdapter`)

NOT present in code: Unsplash, Freepik. Downloads land in **`input/visuals/`** (single
folder — not `input/images/`, `input/videos/`, etc.). Search uses multiple keywords;
candidates are ranked by relevance and verified (ffprobe + vision) before approval
(gateway stage).

---

# Phase 7 – Generate Missing Visuals with Remotion

`src/agentic/media/hermes-remotion-controller.ts` (`runRemotionController`) does
**autonomous codegen**: it writes a Remotion composition from a free-text description
(`[GenMotion: ...]`) or a kind (`infographic` | `hud` | `kinetic` | `diagram` |
`abstract` | …), bundles it (`@remotion/bundler`), and renders an MP4 into
`input/visuals/`. `remotion-sequence.ts` also renders `<TransitionSeries>` timelines
and `renderStillClip` (PNG).

**Important:** The ffmpeg-based compose path (`compose.ts`) uses `xfade` transitions
(fade/slide/zoomIn) — not CSS. Shader-based transitions (glitch, morph-cut, whip-pan)
are available as plugins in `src/agentic/plugins/transitions/`. **Write + render is real.**

Supported motion kinds (extend the list from the real `kinds` map, not the original
20-item wishlist): infographic charts, HUD/radar, kinetic typography, diagrams,
abstract backgrounds, logo reveal, intro/outro.

---

# Phase 8 – Asset Quality Verification

`src/agentic/pipeline/verify.ts` (Stage 3) runs a full matrix reusing
`verifyMedia` (ffprobe + optional vision) and `verifyMusic`. `asset-checks.ts` and
`probeAsset` gate every asset on resolution/blur/crop/watermark/aspect/licensing/
relevance. Failed assets are regenerated or re-fetched (gateway loop). This is wired in.

---

# Phase 9 – Background Music Collection

`src/lib/free-music.ts` selects royalty-free tracks (procedural + ccMixter + Internet
Archive sources), matched by mood/genre/energy. `music-verifier.ts` checks
quality/length/loudness/licensing; `loopAudioToDuration` loops to fit.
(No paid/freepik music.)

---

# Phase 10 – Voice Generation

`src/speech/backends/` contains real models: `chatterbox`, `chatterbox_turbo`,
`kokoro`, `qwen_llm`, `qwen_custom_voice`, `luxtts`, `mlx`, `pytorch`, `base`.
Wired through `src/lib/voice-generator.ts` + `src/agentic/media/voice-controller.ts`
+ `src/lib/speech-backend.ts`. Supports multiple languages/accents/emotions; narration
is synced to scenes by the voice stage.

---

# Phase 11 – Image Editing

A full single-image editing toolbox exists at `src/adapters/cli/agentic-image.ts` (22 commands):
- `npm run agentic:image convert/resize/crop/rotate/adjust/blur/text/emoji/watermark/tint/vignette/border/enhance/flip/info/to-video/contact-sheet/gif/grayscale/sepia/pixelate/slideshow/remove-bg`
 (19 via ffmpeg-static, 3 via sharp — zero cost, no API keys).
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

# Phase 14 – Visual Asset Tagging

Scenes carry `visualPreference` + search keywords + inline tags; the planner/gateway rank
candidates by relevance. There is no separate auto-tagging service, but the mechanism
(tag → asset match) exists inside acquire/gateway. Partial.

---

# Phase 15 – Generate `agentic-scripts.json` (naming corrected)

The job spec is **`input/scripts/agentic-scripts.json`** (plural `scripts`, not
`script.json`). At render time the orchestrator also writes `render-manifest.json`
and `scene-data.json` into the job workspace, each scene referencing the resolved asset
paths (image/video/screenshot/animation/voice/music), transition, text overlays,
caption timing, and motion instructions. The schema is documented in
`input/scripts/AGENTIC_SCRIPT_FORMAT.md`.

---

# Phase 16 – Scene Assembly

`src/agentic/operations/compose.ts` assembles each scene from image/video/motion/
screenshot + voice + music + sfx + text overlays + captions, synced to narration.
Lower-thirds/progress bars are applied via `advanced-fx.ts` where declared. Uses
ffmpeg `xfade` transitions (fade/slide/zoomIn) with per-scene duration and curve.

---

# Phase 17 – Advanced Editing (corrected — many plugins are present)

`src/agentic/plugins/` provides plugin-based effects activated by config:

- **Camera shake** — `plugins/motion/shake.ts` (handheld simulation)
- **Speed ramps** — `plugins/motion/speed-ramp.ts` (bezier-interpolated variable speed)
- **Parallax** — `plugins/motion/parallax.ts` + `advanced-fx.ts:applyParallax` (2.5D depth)
- **Particles** — `advanced-fx.ts:applyParticles` (snow/rain/sparkles via ffmpeg `geq`)
- **Light leaks** — `plugins/transitions/light-leak.ts`
- **Glitch transitions** — `plugins/transitions/glitch.ts`
- **Morph cut** — `plugins/transitions/morph-cut.ts`
- **Whip pan** — `plugins/transitions/whip-pan.ts`
- **Ken Burns pro** — `plugins/motion/ken-burns-pro.ts`
- **Punch-in zoom** — `plugins/motion/punch-in.ts`
- **Dynamic captions** — `plugins/overlays/dynamic-captions.ts`
- **Lower thirds** — `plugins/overlays/lower-third.ts`
- **Progress bar** — `plugins/overlays/progress-bar.ts`
- **Typewriter** — `plugins/overlays/typewriter.ts`
- **Color grading** — `advanced-fx.ts` (wheels, tone-curve, LUT)
- **All wired** into `compose.ts` lines 279-328

NOT present (future work): motion blur, mask/shape transitions, animated callouts.

---

# Phase 18 – AI Quality Review

`verify.ts` (Stage 3) + the vision-in-loop `remotion-verify.ts` (`verifyClip`)
re-check script accuracy, visual relevance, audio sync, subtitle timing, transition/
image/video/voice quality, music balance, scene timing, color & branding consistency.
Issues auto-route back to the responsible stage (regenerate/re-fetch/re-render).

---

# Phase 19 – Final Rendering (multi-aspect including 4K)

`compose.ts` renders the final `final.mp4` at the job resolution (landscape 1280×720
or per `orientation`) and can emit **multi-aspect** variants via `exportAspects`
(`9:16`, `16:9`, `1:1`, **`4K`**). **4K is now supported** — add `exportAspects: ["4K"]`
to the job spec and it renders a 3840×2160 variant alongside the primary output.
Real outputs: primary MP4 + requested aspect variants + thumbnail/poster (`exportPoster`) +
contact sheet + captions + chapters where declared.

---

# Phase 20 – Final Verification

Final AI review via `verify.ts` + vision checks: no missing assets, no broken scene
refs, no audio issues, no artifacts, no blank frames, no sync issues, no duplicate
scenes, no spelling/grammar mistakes, smooth playback. On failure, the pipeline
returns to the owning stage and re-renders until production quality is met.

---

# Final Objective (status vs. current code)

The completed system should function as a fully autonomous AI video production pipeline:

1. Understand requirements (agent + `agentic-scripts.json` fields)
2. Research topic (fully handled by the AI agent)
3. Write high-quality script (`plan.ts`)
4. Break into scenes (`Plan.scenes`)
5. Collect website screenshots + browser captures (agent captures → `input/visuals/`)
6. Download images/videos (Pexels, Pixabay, Openverse, Wikimedia)
7. Generate missing visuals via Remotion (`runRemotionController`)
8. Image pixel-editing toolbox (22 commands in `agentic-image.ts`; only object-removal/shadow/brand-match missing)
9. Select + sync realistic AI voice (`src/speech/backends/`)
10. Download + optimize background music (`free-music.ts`)
11. Organize assets (`input/visuals/` for visuals, `input/bgm/` for music, `input/voiceover/` for voice)
11b. Frame interpolation (`edit.ts:interpolateVideo`)
11c. Background removal (`remove-bg.ts` + Python `rembg`)
12. Tag visual assets (per-scene search keywords, visualPreference, relevance scores)
13. Generate `agentic-scripts.json` + manifests with scene→asset mappings
14. Pro transitions/motion/captions/cinematic fx (shake, speed-ramp, parallax,
     particles, light-leak, glitch, morph-cut, whip-pan, color grading — all present;
     only motion blur, mask/shape transitions, animated callouts are future)
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
```bash
FF=./node_modules/ffmpeg-static/ffmpeg.exe
$FF -y -ss 1 -i input/visuals/proof_vid.mp4 -frames:v 1 /tmp/f.png
# then: vision_analyze(/tmp/f.png, "Does this show city traffic? Any black/corrupt?")
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

## A.6 Why this matters
Doing it one-by-one (not `searchImages(..., 12, 2, ...)` + bulk verify) means a
bad asset is caught **at the moment it is made**, not after 9 others are already
queued. This is exactly the "verify every step, fix before continuing" discipline
the plan demands, and it is executable today with the functions above.
