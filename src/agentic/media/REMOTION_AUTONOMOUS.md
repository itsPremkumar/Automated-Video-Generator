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
   │ 4. VERIFY   ffprobe + vision frame                        │
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
| `src/agentic/media/remotion-codegen.ts` | `authorRemotionComponent()` synthesizes a valid `.tsx` from a `SceneSpec` (or uses agent-provided `code` verbatim). `assertSafeImports()` enforces the import allowlist. `writeSceneProject()` emits the scene + Root + index. |
| `src/agentic/media/hermes-remotion-controller.ts` | `runRemotionController()` — the autonomous loop. `extractMotionTags()` parses `[GenMotion:]`/`[Motion:]` per scene. |
| `src/agentic/media/motion-resolver.ts` | resolves `[Motion: comp@library]` → entry point (multi-location libraries). |
| `src/agentic/operations/motion-render.ts` | `renderMotionClip()` — render a known composition id (preset path). |

## Config (`AgenticConfig`)

```json
{
  "autonomousMotion": true,     // enable [GenMotion:] autonomous codegen
  "motionMaxRetries": 5,        // self-fix attempts per scene
  "motionAutoDecide": false,    // auto-classify scenes as motion (else tag-only)
  "motionLibrary": { "creation": "remotion-creation" },  // [Motion:@lib] folders
  "motionByScene": { "0": "BarChartInfographic" }         // pin a preset per scene
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
- `src/agentic/media/hermes-remotion-controller.test.ts` → 6/6 pass (codegen
  synth, unsafe-import blocking, tag parsing).
- **End-to-end**: a 4-scene script with two `[GenMotion:]` tags was run; both
  scenes were codegen'd, rendered, ffprobe-verified, and integrated into
  `input/visuals/e2e_demo_s1.mp4` + `s2.mp4`. Frames vision-checked: s1 =
  gradient/title card, s2 = 4-bar infographic (Q1–Q4: 42/68/55/91).

## Not yet wired into the 6-stage pipeline

The controller + resolver + renderer are **built, tested, and e2e-proven**, but
the pipeline's tag parser / scene loop does not yet *automatically* call
`runRemotionController`. Today you drive it manually (or via the e2e driver).
Next step: hook `extractMotionTags` + `runRemotionController` into the planner
→ scene loop, and consume `Scene.visual.motion` in `compose.ts`.
