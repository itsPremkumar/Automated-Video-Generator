# Advanced AI Video System — Code-Verified Plan & Review

> Author: AI agent (Hermes), 2026-07-27.
> This document is a **corrected, code-audited** version of the user's
> `ADVANCED_AI_VIDEO_SYSTEM_PLAN.md`. Every claim below was checked against the
> real repo (`C:\one\Automated-Video-Generator`) with `grep`/`ls`/`read_file` on
> 2026-07-27. Status markers: ✅ verified real · ⚠️ partially real / imprecise ·
> ❌ not in code.

---

## 1. Detailed Review of the user's plan

### What the plan gets RIGHT (strong points)

1. **"Agent-only, one-by-one, no pipeline" rule is the single most useful idea.**
   The previous system (and the project's own `npm run agentic:batch`) optimizes for
   *throughput*: it downloads 12 assets, generates 3 clips, then bulk-verifies. A bad
   asset is only caught after 9 others are queued. The user's rule flips this to
   *quality-per-unit*: build ONE asset → `vision_analyze` it → only then the next.
   This is strictly better for production quality and is **executable today** with the
   functions already present (`searchImages`, `runRemotionController`, `verifyMedia`,
   `generateVoiceovers`, `resolveFreeBackgroundMusic`). I proved it end-to-end this
   session: a 22s, 1920×1080 demo built stage-by-stage and vision-verified per scene,
   delivered to `Downloads/onebyone_agentic_demo.mp4`.

2. **Honest split of "agent does" vs "agent commands code to do".** Phases 1–5, 7,
   14–15, 17, 18/20 are correctly marked as pure-agent (LLM / `web_search` /
   `browser_*` / `vision_analyze` / code authoring). This matches reality: the project
   has no research stage, no script-writer stage, no browser-capture stage — those are
   the agent's job. The doc correctly says "the pipeline does not open a browser."

3. **Provider list corrected to Pexels/Openverse/Pixabay (no Unsplash/Freepik).** ✅
   `src/lib/visual-fetcher/search.ts` imports `searchOpenverseImages` and uses the
   Pexels REST API; `searchPixabayVideos` exists for video. Unsplash/Freepik are absent.

4. **Folder tree corrected to `input/visuals/` + `input/scripts/`.** ✅ No
   `input/images/`, `input/videos/` split exists. BGM resolves via `inputBgmPath()`.

5. **Remotion autonomous codegen is real.** ✅ `runRemotionController`
   (`src/agentic/media/hermes-remotion-controller.ts`) bundles + renders; I used it
   this session for kinetic/infographic/HUD clips.

6. **Plugin effects are real.** ✅ `src/agentic/plugins/` contains shake, speed-ramp,
   parallax, ken-burns-pro, punch-in, dynamic-captions, lower-third, progress-bar,
   typewriter, color grading, and transitions/ (glitch, light-leak, morph-cut,
   whip-pan). `applyParticles` exists in `advanced-fx.ts:228`. `applyColorGradeDepth`
   at `advanced-fx.ts:187`.

7. **`exportAspects: ['4K']` is a real label.** ✅ `resolveAspectSizes`
   (`advanced-fx.ts:369`) maps `'4K'`→`3840×2160`. (Caveat: it is an *upscale* of the
   base render, not a native 4K source render — see §3.)

8. **Appendix A proven runs.** ✅ The one-by-one download/Remotion loops were executed
   this session; numbers quoted (4.38 MB image, 15.07 MB video) match real outputs.

### What the plan gets WRONG (must fix)

**A. Phase 12 — `edit.ts` is badly understated.**
The doc says `edit.ts` "exports exactly" 6 functions
(`mergeVideos, trimVideo, cropVideo, resizeVideo, rotateVideo, extractAudio`).
Reality: `edit.ts` exports **17** functions (runFfmpeg helper + 16 ops:
mergeVideos, trimVideo, cropVideo, resizeVideo, rotateVideo, interpolateVideo,
extractAudio, changeSpeed, reverseVideo, addTextOverlay, extractThumbnail,
videoToGif, loopVideo, splitVideo, addAudio, silenceRemove, addProgressBar).
The "standalone modules" subsection then *re-lists* most of those as if they were
separate — but they are **already inside `edit.ts`**. Only `removeBackground` is
genuinely separate (`remove-bg.ts`). The current doc double-counts and
under-counts simultaneously.

**B. Phase 6 — Wikimedia overstated as a visual-search provider.**
`src/lib/free-image/providers/wikimedia.ts` and `free-video/providers/wikimedia.ts`
exist, but `search.ts` (the actual `searchImages`/`searchVideos` entry) does **NOT**
call them. It calls Openverse + Pexels (+ Pixabay for video). So Wikimedia is a
*dormant* provider, not a wired one. The doc should say "Pexels + Openverse (wired);
Wikimedia provider file exists but is not queried by the search entry."

**C. Phase 7/16 — transition names mismatch.**
Doc says compose uses "xfade transitions (fade/slide/zoomIn)". The real
`buildSlideshow` (`compose.ts:662`) supports `'fade'`, `'slide'`, `'zoomblur'`,
`'cut'` — not `zoomIn`. Call it crossfade/xfade with those 4 values (not "zoomIn").

**D. Phase 19 — "4K render" is an upscale, not native.**
`resolveAspectSizes` scales the base W×H to 3840×2160. If the base job is 1280×720,
the "4K" output is upscaled 720p → 4K, not a true 4K source. The doc should state this
so users don't expect native 4K sharpness.

**E. Minor: Appendix A.5 Ollama finding is correct** — built-in `verifyMedia` vision
routes to local Ollama and fails without it; the agent's `vision_analyze` is the
reliable path. Keep this; it is accurate and important.

**F. Phase 12 color — "Color correction (applyColorAdjustments)" does NOT exist.**
The doc lists a `applyColorAdjustments` function for per-scene
contrast/saturation/brightness/gamma/colorTemp. That symbol is **absent** from
`advanced-fx.ts`. What actually exists: `applyColorGradeDepth` (wheels/tone-curve
style grading, `advanced-fx.ts:187`) and `buildPaletteFilter` (named presets
warm/cool/blue/teal/cyberpunk/vintage — but it lives in `compose.ts:209`, **not**
`advanced-fx.ts` as the doc states). So: simple per-scene contrast/saturation
correction is **not available**; only depth-grading + preset palettes are.

---

## 2. Is this plan more useful than the BEFORE system?

**Yes — decisively — for the user's stated goal (high-quality, agent-controlled video).**

| Dimension | BEFORE (project pipeline `npm run agentic:batch`) | THIS PLAN (agent one-by-one) |
|---|---|---|
| Quality gate | Bulk: verify after all assets queued | Per-unit: verify each asset before next |
| Failure catch point | Late (after 9 others downloaded) | Immediate (at creation) |
| Agent control | Pipeline picks providers/assets automatically | Agent decides every unit, inspects it |
| Reproducibility of a "good" video | Depends on gateway luck | Deterministic: each step proven + logged |
| Tooling used | Internal orchestrator only | Full agent toolkit (research, browser, vision) |
| Cost of a mistake | Re-run whole batch | Re-do one scene |

The trade-off: one-by-one is **slower** (6 scenes = 6 verification round-trips vs 1
batch). For a production-quality deliverable that trade-off is correct. The plan is
the right call for "high-quality video." It is NOT better if the goal were "100 videos
per hour" — but the user explicitly wants quality, not volume.

One caveat: the plan says the agent "MUST NOT use the existing pipeline" but then lists
many pipeline functions the agent *commands* (download, voice, music, compose). That is
consistent — the agent directs those functions one-at-a-time rather than invoking the
end-to-end `pipeline.ts`. Good. The only risk: if the agent fully avoids
`compose.ts` and hand-rolls ffmpeg (as I did this session for the demo), it must
re-implement the concat/normalize logic correctly — which I had to debug (the concat
list path bug). The plan should note: prefer calling the project's real functions
(`generateVoiceovers`, `resolveFreeBackgroundMusic`, `runRemotionController`,
`compose.ts` per-scene) one-by-one rather than re-inventing ffmpeg glue.

---

## 3. Corrected plan (my own, code-audited)

### Hard rule (unchanged, keep it)
Build ONE unit → verify it alone (`ffprobe` + `vision_analyze` ONE frame) → only then
the next. No `searchImages(..., 12, 2)` bulk; no `npm run agentic:batch`.

### Phase map with real code references

| # | Phase | Real code | One-by-one agent action |
|---|---|---|---|
| 1 | Requirements | `input/scripts/agentic-scripts.json` fields | `clarify` → fill spec |
| 2 | Research | (no pipeline stage) | `web_search` + `browser_*` → notes in `input/visuals/` |
| 3 | Script | (no pipeline stage) | LLM writes narration + scene list |
| 4 | Scene breakdown | `plan.ts` `Plan.scenes` shape | split; tag `visualPreference`, keywords, `[Visual:]/[Motion:]/[Transition:]` |
| 5 | Screenshots | agent captures → `input/visuals/` | `browser_navigate`+`browser_vision`; **tall shots need scroll-pan** (`scale=1920:-2,crop=1920:1080:0:'min((ih-oh)*t/4,ih-oh)'`) |
| 6 | Asset download | `searchImages`/`searchVideos` (`visual-fetcher/search.ts`) → Pexels + Openverse (+ Pixabay video); Wikimedia file exists but **not wired** | fetch `limit=1` → save → `vision_analyze` |
| 7 | Remotion | `runRemotionController` (`hermes-remotion-controller.ts`); `renderStillClip` (`remotion-sequence.ts`) | write TSX from scratch → render ONE clip → verify |
| 8 | Verify | `verify.ts` Stage 3 (reuses `verifyMedia`+`verifyMusic`); `remotion-verify.ts:verifyClip` | per-asset; on fail → regenerate that asset |
| 9 | Music | `free-music.ts` `resolveFreeBackgroundMusic` (ccMixter/IA); `loopAudioToDuration` (`sfx.ts`) | resolve ONE track → loop → `vision_analyze`/listen |
| 10 | Voice | `generateVoiceovers` (`voice-generator.ts`) → `voice-controller.ts`; backends in `speech/backends/` (chatterbox, kokoro, qwen, luxtts, mlx, pytorch) | generate per scene → check each .wav duration |
| 11 | Image edit | `agentic-image.ts` (**29 commands**: convert, resize, crop, rotate, adjust, blur, text, emoji, watermark, tint, vignette, border, enhance, flip, info, to-video, contact-sheet, gif, grayscale, sepia, pixelate, compress, face-blur, round-corners, merge, background-replace, focus, remove-bg, slideshow); `removeBackground` (`remove-bg.ts`, rembg) | edit ONE image → verify |
| 12 | Video edit | `edit.ts` (**17 functions**: runFfmpeg(helper) + mergeVideos, trimVideo, cropVideo, resizeVideo, rotateVideo, interpolateVideo, extractAudio, changeSpeed, reverseVideo, addTextOverlay, extractThumbnail, videoToGif, loopVideo, splitVideo, addAudio, silenceRemove, addProgressBar). `advanced-fx.ts` provides grading only: `applyColorGradeDepth` (wheels/tone-curve) + `buildPaletteFilter` lives in `compose.ts:209` (warm/cool/blue/teal/cyberpunk/vintage). **NO** simple per-scene contrast/saturation/brightness correction fn, **NO** stabilize/chromaKey/blurScenes (those names do not exist). | edit ONE clip → verify frame |
| 13 | Organize | `input/visuals/` (visuals), `input/bgm/` (music), `input/voiceover/` (voice) | move files |
| 14 | Tag assets | per-scene keywords in spec | cross-ref vs voiceover text |
| 15 | `agentic-scripts.json` | `input/scripts/agentic-scripts.json` + `AGENTIC_SCRIPT_FORMAT.md` | assemble + validate |
| 16 | Assemble | `compose.ts` `buildSlideshow` — transitions: **fade / slide / zoomblur / cut** (xfade-style) | assemble ONE scene → verify frame |
| 17 | Advanced FX | `plugins/`: shake, speed-ramp, parallax, ken-burns-pro, punch-in, dynamic-captions, lower-third, progress-bar, typewriter, color; transitions/: glitch, light-leak, morph-cut, whip-pan; `applyParticles` (`advanced-fx.ts:228`) | config per scene → verify |
| 18 | QA | `verify.ts` + `remotion-verify.ts` | per-asset vision review |
| 19 | Render | `compose.ts` `exportAspects` (`9:16`,`16:9`,`1:1`,**`4K`=upscale to 3840×2160**); `exportPoster`, contact sheet | render → verify |
| 20 | Final verify | `verify.ts` + vision | full playback check |

### Known gaps (verified against code)
- `edit.ts` / `advanced-fx.ts` have **NO** `stabilizeScenes`, `chromaKeyScenes`,
  `blurScenes`, `clipSpeedByScene`, `parallaxDepthByScene` symbols. The doc lists
  these as present — they are **not** (speed is `changeSpeed` in edit.ts; parallax is
  `applyParallax` in advanced-fx.ts; but the `-Scenes` batch variants do not exist).
- **Simple color correction is absent.** No `applyColorAdjustments`; only
  `applyColorGradeDepth` (grading) + `buildPaletteFilter` presets (compose.ts:209).
- Wikimedia visual search not wired (dormant provider; only Openverse + Pexels +
  Pixabay-video are queried by `search.ts`).
- "4K" is an upscale of the base render, not a native 4K source.
- Built-in `verifyMedia` vision needs Ollama; use agent `vision_analyze`.

### Recommended execution pattern (proven this session)
For each scene: pick asset type → call the REAL project function (not hand-rolled
ffmpeg) → `vision_analyze` one frame → fix if needed → next. This reuses tested code
and avoids the concat-path bugs I hit when re-implementing ffmpeg glue by hand.

---

## 4. Bottom line
The user's plan is **conceptually superior** to the before-system for quality work, and
most of its code references are accurate. It needs three factual corrections (edit.ts
function count, Wikimedia wiring, transition names) and one precision note (4K = upscale).
With those fixes it is an accurate, executable spec — and I have already proven the
one-by-one discipline produces a verified, deliverable video.
