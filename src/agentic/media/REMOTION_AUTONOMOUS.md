# Autonomous Remotion Codegen (Hermes-controlled)

**Full-capacity, unlimited motion-graphics generation inside the agentic pipeline.**
The Hermes agent authors brand-new Remotion `.tsx` per scene, renders it,
vision-verifies, self-fixes, and integrates the clip into the main video —
no preset caps, no category limits (within code-only Remotion).

## Flow

```
agentic script.json
  "scene … [GenMotion: neural network diagram]"
        │
   ┌────▼──────────────── Hermes controller ────────────────┐
   │ 1. DECIDE   parse [GenMotion:] tags (or autonomousMotion) │
   │ 2. CODEGEN  author new scene_<n>.tsx (full Remotion)      │
   │ 3. RENDER   bundle() + renderMedia() → MP4               │
   │ 4. VERIFY   signal (ffprobe) + VISION frame check         │
   │ 5. SELF-FIX retry loop (rewrite .tsx, re-render)          │
   │ 6. FALLBACK stock/user asset if retries exhausted         │
   │ 7. INTEGRATE → input/visuals/<job>_s<n>.mp4 + [Visual:]tag │
   └──────────────────────────────────────────────────────────┘
        │
   main pipeline composes mixed final video (generated + stock + user)
```

## Modules

| File | Role |
|------|------|
| `remotion-codegen.ts` | `authorRemotionComponent()` synthesizes a valid `.tsx` from a `SceneSpec` (or uses agent-provided `code` verbatim). `assertSafeImports()` enforces the import allowlist. |
| `hermes-remotion-controller.ts` | `runRemotionController()` — the autonomous loop. `extractMotionTags()` parses `[GenMotion:]`/`[Motion:]`. |
| `remotion-verify.ts` | `verifyClip()` — signal (ffprobe) + optional VISION frame check inside the self-fix loop. `extractFrame()` pulls a settled frame for vision. |
| `remotion-sequence.ts` | `renderSequence()` — ONE bundle, native `<TransitionSeries>` transitions between scenes. `renderStillClip()` — `renderStill` → PNG (generated images). |
| `motion-resolver.ts` | resolves `[Motion: comp@library]` → entry point (multi-location libraries). |
| `motion-render.ts` | `renderMotionClip()` — render a known composition id (preset path). |

## Full-capacity features (added)

1. **Vision-in-loop verification.** `verifyClip()` runs ffprobe (signal) AND,
   when a `visionCheck` callback is supplied, extracts a settled frame and
   confirms the subject matches the intended scene. The self-fix loop only
   passes a clip that is both valid AND visually correct.
2. **Native transitions.** `renderSequence()` stacks all scenes in one
   `<TransitionSeries>` with `crossZoom` / `filmBurn` / `linearBlur` / `slide` /
   `wipe` / `dissolve` between them — the headline Remotion feature, rendered
   in a single bundle (fast, no per-scene re-bundle).
   - Headless note: shader/canvas transitions (crossZoom, filmBurn,
     linearBlur, wipe, dissolve) use WebGL that **hangs under headless Chrome
     without a GPU**. By default they are mapped to `slide` (pure CSS,
     headless-safe). Pass `allowShaderTransitions: true` on a GPU machine to
     enable the richer shader transitions.
3. **Generated images.** `renderStillClip()` uses `renderStill` to emit a PNG
   (cover / lower-third / thumbnail) into `input/visuals/` — fulfilling
   "Remotion should also generate images," not just video.

## Config (`AgenticConfig`)

```json
{
  "autonomousMotion": true,
  "motionMaxRetries": 5,
  "motionAutoDecide": false,
  "motionLibrary": { "creation": "remotion-creation" },
  "motionByScene": { "0": "BarChartInfographic" }
}
```

## Script tags

```
[GenMotion: neural network diagram]              # agent authors new code
[Motion: BarChartInfographic]                     # use a preset composition
[Motion: NeuralNetwork@create]                    # preset from library "create"
```

## Safety

- Generated `.tsx` may only import `remotion`, `react`, `@remotion/*`,
  `./_lib` helpers (enforced by `assertSafeImports`).
- Generated code lives in `workspace/remotion-generation/<job>/` — project
  root only, gitignored, regenerable (AVS containment, no system TEMP).

## Verified (this build)

- `npx tsc -p tsconfig.json --noEmit` → clean.
- `hermes-remotion-controller.test.ts` → 6/6 pass (codegen synth, unsafe-import
  blocking, tag parsing).
- `remotion-sequence.test.ts` → pass (verifyClip signal gate, tag parsing).
- **E2E (vision-verified):**
  - 4-scene script with two `[GenMotion:]` tags → 2 clips codegen'd, rendered,
    ffprobe-verified, integrated to `input/visuals/e2e_demo_s1/s2.mp4`; frames
    vision-checked (gradient card + 4-bar infographic).
  - **Sequence**: 3 scenes (diagram→infographic→hud) rendered in ONE bundle
    with transitions → `seq.mp4` (1.29 MB); frames vision-checked (bar chart,
    HUD radar) confirming distinct scenes + transitions.
  - **Still**: `renderStillClip({logo NEXUS})` → `input/visuals/cover.png`
    (229 KB); vision-checked (gradient squircle + bold NEXUS text).
