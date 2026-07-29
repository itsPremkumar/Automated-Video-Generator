# Agentic Script Examples

Complete, working JSON examples for every mode and feature of the Automated Video Generator pipeline.

## Structure

```
agentic-script-examples/
├── README.md                         ← This file
├── batch-topics.json                 ← Batch topic generation reference
├── modes/                            ← Single-stage execution modes
│   ├── 01-download-images.json       Fetch only image assets
│   ├── 02-download-videos.json       Fetch only video assets
│   ├── 03-download-music.json        Fetch background music
│   ├── 04-download-sfx.json          Fetch sound effects
│   ├── 05-download-url.json          Download from direct URL
│   ├── 06-plan-only.json             Build plan only (dry run)
│   ├── 07-voice-edgetts.json         Generate voice via Edge-TTS
│   ├── 08-voice-voicebox.json        Generate voice via Voicebox/Kokoro
│   ├── 09-clone-voice.json           Clone a voice from reference audio
│   ├── 10-render-only.json           Render MP4 from existing workspace
│   ├── 11-compose-full.json          Full compose: fetch + voice + render
│   ├── 12-apply-advanced.json        Apply advanced FX config only
│   └── 13-rerender.json              Re-render with different settings
├── features/                         ← Feature-specific demos
│   ├── 01-intro-outro.json           Title card + outro CTA
│   ├── 02-caption-themes.json        All 7 caption styles
│   ├── 03-presets-video-types.json   Visual presets + video type profiles
│   ├── 04-platform-tailoring.json    TikTok / Instagram / YouTube
│   ├── 05-transitions-grades.json    Transition + color grade combos
│   ├── 06-motion-graphics.json       Zoom, pan, parallax, particles
│   ├── 07-per-scene-filters.json     BW, sepia, stabilize, chroma key
│   ├── 08-color-grading-advanced.json LUTs, tone curves, color wheels
│   ├── 09-audio-processing.json      EQ, compressor, reverb, noise reduction
│   ├── 10-multi-persona.json         Multi-speaker dialogue
│   ├── 11-local-assets.json          Use own images/videos
│   ├── 12-export-options.json        Multi-aspect, quality, poster
│   ├── 13-brand-kit.json             Watermark, font, accent color
│   ├── 14-ai-verify.json             Vision-based quality gates
│   ├── 15-emoji-overlays.json        Emoji, text overlays, CTA buttons
│   └── 16-gpu-quality.json           GPU acceleration + quality tier demo
└── full-demos/                       ← Complete ready-to-render jobs
    ├── 01-minimal.json               Shortest possible config
    ├── 02-motivational-reel.json     Inspirational Instagram Reel
    ├── 03-facts-educational.json     Educational landscape video
    ├── 04-product-promo.json         Product showcase
    ├── 05-tutorial-howto.json        Step-by-step tutorial
    ├── 06-storytelling.json          Narrative with voice cast
    ├── 07-kitchen-sink.json          Every feature enabled
    ├── 08-multi-aspect-4k.json       Export 4K + all aspect ratios
    ├── 09-ai-tech-explainer.json     AI/Tech with GPU, chapters, subtitles
    ├── 10-health-wellness.json       Health habits, square format
    ├── 11-business-news.json         Business trends with chapters
    └── 12-crypto-blockchain.json     Crypto explainer, high quality
```

## How to Run

### Full pipeline (plan → visuals → voice → render)
All files in `features/` and `full-demos/` support `--file`:

```bash
npm run agentic:modular pipeline --file input/scripts/agentic-script-examples/full-demos/02-motivational-reel.json
```

### Individual stages (with --file support)

```bash
npm run agentic:modular plan     --file input/scripts/agentic-script-examples/full-demos/02-motivational-reel.json
npm run agentic:modular visuals  --file input/scripts/agentic-script-examples/full-demos/02-motivational-reel.json
npm run agentic:modular voice    --file input/scripts/agentic-script-examples/full-demos/02-motivational-reel.json
npm run agentic:modular render   --file input/scripts/agentic-script-examples/full-demos/02-motivational-reel.json
```

### Single-stage mode execution (modes/ folder)

Mode files must be copied into `input/scripts/agentic-scripts.json` first,
then run with the batch runner:

```bash
# Copy a mode example into the main file
Copy-Item input/scripts/agentic-script-examples/modes/01-download-images.json input/scripts/agentic-scripts.json -Force

# Then execute
npm run agentic:mode:images
npm run agentic:mode:videos
npm run agentic:mode:music
npm run agentic:mode:sfx
npm run agentic:plan
npm run agentic:mode:voice-edgetts
npm run agentic:mode:voice-voicebox
npm run agentic:mode:advanced
```

### Batch topic generation

```bash
# From a list of topics (no JSON file needed)
npm run agentic:generate -- --topics "AI in healthcare,Space exploration,Climate change"

# With GPU and preview mode
npm run agentic:generate:preview -- --gpu --topics "Topic A,Topic B"

# Parallel batch (3 concurrent jobs)
npm run agentic:batch:parallel -- --topics "Topic 1,Topic 2,Topic 3,Topic 4"
```

### Quick test (plan only, no network)

Verify any example file parses correctly:

```bash
npm run agentic:modular plan --file input/scripts/agentic-script-examples/full-demos/01-minimal.json
```

### New in latest examples (v5.x)

| File | What it demonstrates |
|------|---------------------|
| `full-demos/09-ai-tech-explainer` | GPU-accelerated rendering with `gpu: true`, chapters, subtitle sidecars, high quality |
| `full-demos/10-health-wellness` | Square format (1:1), medium quality, square format field |
| `full-demos/11-business-news` | Chapter markers, subtitle export, authoritative documentary style |
| `full-demos/12-crypto-blockchain` | GPU, high quality, vivid grade, kinetic text, TikTok platform |
| `features/16-gpu-quality` | GPU flag, quality tiers (draft/medium/high), verbose mode, no-ducking |
| `batch-topics.json` | Batch topic generation reference with command examples |

All 42 files verified working (2026-07-29):
- 16 feature files → all parse correctly (2–7 scenes each)
- 12 full demo files → all parse correctly (3–8 scenes each)
- 13 mode files → plan stage passes; download modes confirmed working
- 1 batch topics reference → command examples for batch generation

## Field Reference

Every field is documented in `docs/AGENTIC_SCRIPT_FORMAT.md` or `input/scripts/AGENTIC_SCRIPT_FORMAT.md`.
