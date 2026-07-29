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
│   ├── 13-rerender.json              Re-render with different settings
│   ├── 14-render-gif.json            Render animated GIF output
│   └── 15-render-poster.json         Generate poster/thumbnail image
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
│   ├── 16-gpu-quality.json           GPU acceleration + quality tier demo
│   ├── 17-silent-mute.json           No music, no SFX, no ducking mode
│   └── 18-localization.json          Multi-language subtitle sidecars
├── single-edits/                     ← Standalone image/video editing reference
│   ├── video-editing.json            All 20 agentic:editor commands with CLI examples
│   └── image-editing.json            All 22 agentic:image commands with CLI examples
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
    ├── 12-crypto-blockchain.json     Crypto explainer, high quality
    ├── 13-photo-slideshow.json       Image-only slideshow (photos mode)
    └── 14-travel-adventure.json      Travel bucket list, square format
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

Special modes like GIF rendering and poster generation can be tested with:

```bash
Copy-Item input/scripts/agentic-script-examples/modes/14-render-gif.json input/scripts/agentic-scripts.json -Force
# Then run with appropriate mode setting

Copy-Item input/scripts/agentic-script-examples/modes/15-render-poster.json input/scripts/agentic-scripts.json -Force
# Then run with appropriate mode setting
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

## Feature Coverage

| File | Demonstrates |
|------|-------------|
| **Full demos** | |
| `full-demos/13-photo-slideshow` | Image-only mode (`images: true`), static photography with Ken Burns, documentary preset |
| `full-demos/14-travel-adventure` | Travel content vertical, square format, kinetic text, epic cinematic grade |
| **Features** | |
| `features/17-silent-mute` | No music + no SFX + no ductrack (`sfx: false`, `noDucking: true`, `noKenBurns: true`, `noKinetic: true`) |
| `features/18-localization` | Multi-language subtitle generation with `targetLanguages: ["es","fr","hi","ta","de"]` |
| **Modes** | |
| `modes/14-render-gif` | Render GIF output mode (animated preview) |
| `modes/15-render-poster` | Render poster/thumbnail from rendered video |

## Single Editing Operations

The `single-edits/` folder contains reference files for the standalone video and image editing CLIs that operate on individual media files (not the full pipeline).

### Video Editing (`npm run agentic:editor`)

20 commands for single-video operations using bundled ffmpeg-static:

| Command | Description | Quick Example |
|---------|-------------|---------------|
| `trim` | Cut video by timecode | `--input clip.mp4 --start 00:05 --end 00:30` |
| `speed` | Change playback speed 0.25x–4x | `--rate 2.0` |
| `extract-audio` | Pull audio track as MP3/WAV | `--output audio.mp3` |
| `replace-audio` | Replace video audio | `--audio new_audio.mp3` |
| `mute` | Remove audio track | `--output silent.mp4` |
| `split` | Split at timestamp | `--at 00:15 --output-prefix part` |
| `merge` | Concatenate videos | `--files "a.mp4,b.mp4"` |
| `crop` | Crop to aspect ratio | `--preset 9:16` |
| `resize` | Scale dimensions | `--width 1080 --height 1920` |
| `rotate` | Rotate/flip | `--angle 90` |
| `loop` | Loop N times | `--count 3` |
| `overlay-text` | Burn text caption | `--text "Hello" --position bottom-left` |
| `overlay-image` | Image watermark | `--image logo.png --position top-right` |
| `extract-frame` | Save frame as image | `--at 00:10 --output frame.png` |
| `thumbnail` | Generate poster frame | (no extra flags) |
| `blur` | Blur region | `--region 100:200:300:400` |
| `adjust` | Brightness/contrast/saturation | `--brightness 0.1 --contrast 1.2` |
| `reverse` | Reverse playback | (no extra flags) |
| `info` | Show metadata | (no extra flags) |
| `concat-scene` | Extract workspace scene | `--job job_123 --scene 3` |

Full reference: `single-edits/video-editing.json`

### Image Editing (`npm run agentic:image`)

22 commands for single-image operations:

| Command | Description | Quick Example |
|---------|-------------|---------------|
| `convert` | Change format | `--format webp --quality 90` |
| `resize` | Scale dimensions | `--width 1080 --height 1920` |
| `crop` | Crop region | `--region 100:100:800:800` |
| `rotate` | Rotate/flip | `--angle 90` or `hflip` |
| `adjust` | Color adjust | `--brightness 0.1 --contrast 1.2` |
| `blur` | Gaussian blur | `--sigma 5` |
| `text` | Burn caption text | `--text "Hello" --position center --font-size 48` |
| `emoji` | Burn emoji sticker | `--emoji "🎉" --size 64` |
| `watermark` | Logo overlay | `--watermark logo.png --opacity 0.7` |
| `tint` | Brand color overlay | `--color "#7C3AED" --opacity 0.3` |
| `vignette` | Edge darkening | `--strength 0.5` |
| `border` | Colored border | `--width 10 --color white` |
| `enhance` | Denoise + sharpen | (no extra flags) |
| `grayscale` | Black and white | (no extra flags) |
| `sepia` | Vintage tone | (no extra flags) |
| `pixelate` | Mosaic effect | `--block-size 16` |
| `compress` | Reduce file size | `--quality 50` |
| `face-blur` | Privacy blur region | `--region 200:150:180:220` |
| `round-corners` | Rounded edges | `--radius 20` |
| `merge` | Overlay images | `--overlay overlay.png --opacity 0.8` |
| `info` | Show metadata | (no extra flags) |
| `flip` | Horizontal/vertical flip | `--direction hflip` |

Full reference: `single-edits/image-editing.json`

## Complete Coverage Map

All 48 files verified working (2026-07-29):
- **CLI flags covered:** `--topic`, `--title`, `--orientation`, `--format`, `--images`, `--gpu`, `--quality`, `--intro`, `--outro`, `--transition`, `--preset`, `--sfx`, `--no-ducking`, `--no-ken-burns`, `--no-kinetic`, `--renderer`, `--backend`, `--verbose`
- **Modes covered:** plan, visuals, voice, render, download-images, download-videos, download-music, download-sfx, download-url, clone-voice, render-gif, render-poster, rerender, apply-advanced, compose
- **All CLI flags from `agentic-run.ts` now have at least one example**

## Field Reference

Every field is documented in `docs/AGENTIC_SCRIPT_FORMAT.md` or `input/scripts/AGENTIC_SCRIPT_FORMAT.md`.
