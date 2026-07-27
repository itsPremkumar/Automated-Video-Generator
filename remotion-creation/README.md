# remotion-creation — Code-Only Motion Graphics Experiment

An experimental Remotion project that generates videos **100% from code** — no
external images, video, audio, or 3D assets. Every frame is drawn with React +
SVG + CSS + math. This validates (and demonstrates) the "what can Remotion do
without any assets" capability list.

Reuses the parent project's `node_modules` (Remotion 4.0.487, React 19) — no
separate install needed.

## Compositions (all 1920×1080, 30fps, verified-rendered)

| ID | Category | What it demonstrates |
|----|----------|----------------------|
| `KineticTypography` | Typography | Word-by-word spring reveal, gradient text, glow |
| `BarChartInfographic` | Data viz | Animated bars + count-up numbers |
| `ConfettiParticles` | Particle system | 140 deterministic confetti particles + burst |
| `NeuralNetwork` | AI / tech viz | Layered nodes, signal pulses along edges |
| `HudRadar` | Sci-fi HUD | Rotating sweep, range rings, contact blips, readouts |
| `AuroraLoop` | Animated background | Seamless mesh-gradient blob loop |
| `TerminalTyping` | Terminal / code | Typewriter deploy log with blinking cursor |
| `SpectrumVisualizer` | Audio-style visual | Procedural circular spectrum (math-driven, no audio file) |

## Run it

```bash
# from this folder — set Chrome for rendering
export CHROME_EXECUTABLE="/c/Program Files/Google/Chrome/Application/chrome.exe"

# interactive studio (preview + scrub all compositions)
npm run studio          # or: npx remotion studio index.ts

# list all compositions
npx remotion compositions index.ts

# render one to MP4
npx remotion render index.ts KineticTypography out/KineticTypography.mp4 --codec=h264

# render every composition
for c in KineticTypography BarChartInfographic ConfettiParticles NeuralNetwork \
         HudRadar AuroraLoop TerminalTyping SpectrumVisualizer; do
  npx remotion render index.ts $c out/$c.mp4 --codec=h264
done
```

Rendered MP4s land in `out/`.

## How it works (the pattern for adding more)

Each composition is a React component that reads the current frame via
`useCurrentFrame()` and drives every visual property from it:

- **Entrances**: `spring({ frame, fps })` for natural motion.
- **Interpolation**: `interpolate(frame, [inFrames], [outValues])`.
- **Determinism**: a seeded pseudo-random (`lib/theme.ts → seeded()`) so
  particle layouts are identical every render (no flicker).
- **Seamless loops**: map `frame/durationInFrames` to a full `2π` cycle
  (see `AuroraLoop`).

Add a new one: create `compositions/MyThing.tsx`, then register a
`<Composition>` in `Root.tsx`.

## Verified

- `npx tsc -p tsconfig.json --noEmit` → clean (exit 0).
- All 8 compositions rendered to real MP4 via headless Chrome.
- Each render frame-extracted and visually inspected (vision) — all correct,
  none corrupt/black.

## Remotion capability notes (from this experiment + research)

**Can do from code alone:** motion graphics, kinetic typography, infographics &
data viz, animated UI/dashboards/terminals, explainer diagrams, HUDs, particle
systems, procedural/generative art, geometric animation, audio-style visualizers
(math-driven or driven by a real audio file via `@remotion/media-utils`),
seamless background loops, timelines, maps/route drawing, loaders, lower-thirds.

**Cannot do from code alone (needs external AI/assets):** photorealistic humans,
real photographs, live-action footage, realistic 3D characters, original music,
human voice narration. Remotion's role is to **generate, animate, compose, and
render** — it assembles visuals, it doesn't invent photoreal media.

For the AVS pipeline, this is the ideal "custom visual" engine: when the planner
decides a scene is better as an animated diagram/infographic/HUD than stock
footage, it can emit a Remotion composition instead.
