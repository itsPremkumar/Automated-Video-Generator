---
title: Usage Guide — Automated Video Generator
description: How to use Automated Video Generator to create AI-generated videos from text scripts. Covers CLI, agentic pipeline, web portal, batch generation, MCP integration, GPU acceleration, and dry-run mode.
---

# Usage Guide

How to use Automated Video Generator to create AI-generated videos from text scripts.

## Generate a Video (Agentic Pipeline — Recommended)

The agentic pipeline is fully self-contained and requires no API keys:

```bash
# Single video from topic (all-in-one)
npm run agentic -- --topic "5 benefits of drinking water" --title "Hydration" --orientation portrait

# With GPU acceleration
npm run agentic -- --topic "AI in healthcare" --gpu

# Square format for Instagram
npm run agentic -- --topic "Morning routine tips" --format square

# Dry-run: preview plan without downloading or rendering
npm run agentic -- --topic "Space exploration" --dry-run

# Landscape video with images (photo slideshow)
npm run agentic -- --topic "Top 10 coding tools" --orientation landscape --images

# High quality, cinematic preset
npm run agentic -- --topic "Deep sea creatures" --quality high --preset cinematic

# Disable background music
npm run agentic -- --topic "Silent film history" --no-sfx

# Remotion renderer (instead of ffmpeg)
npm run agentic -- --topic "Web development trends" --renderer remotion

# With chapters and verbose ffmpeg logging
npm run agentic -- --topic "JavaScript basics" --chapters --verbose
```

### Step-by-Step Pipeline

You can also run individual stages of the pipeline:

```bash
# 1. Plan — generate the script structure
npm run agentic:plan -- --topic "Climate change explained" --file input/scripts/agentic-scripts.json

# 2. Download visuals
npm run agentic:visuals -- --file input/scripts/agentic-scripts.json

# 3. Generate voiceover
npm run agentic:voice -- --file input/scripts/agentic-scripts.json

# 4. Render the final video
npm run agentic:render -- --file input/scripts/agentic-scripts.json

# 5. Apply edits (transitions, grades)
npm run agentic:edit -- --file input/scripts/agentic-scripts.json
```

## Generate a Video (Legacy CLI)

```bash
npm run generate -- --script "Your video script here"
```

## Generate a Video (Web Portal)

1. Start the portal: `npm run dev`
2. Open `http://localhost:3001/`
3. Enter your Pexels API key (or skip — free sources work without any key)
4. Paste or write a script
5. Choose voice, orientation, music
6. Click Generate Video
7. Download the MP4 output

## Free Video Sources (No API Key)

Access CC-licensed videos from **Wikimedia Commons** and **Internet Archive** without any registration.

**Via HTTP API:**
```bash
# Search
curl "http://localhost:3001/api/free-video/search?keyword=nature&source=all&count=5"

# Download
curl -X POST http://localhost:3001/api/free-video/download \
  -H "Content-Type: application/json" \
  -d '{"url":"https://...", "title":"nature-clip"}'
```

**Via Frontend:**
1. Open `http://localhost:3001/video-download`
2. Navigate to the **Free Sources** tab
3. Enter a keyword, optionally filter by source/duration/resolution
4. Browse results and click **Download** on any clip

**Via MCP:**
```json
search_free_video { "keyword": "space", "source": "all", "count": 3 }
download_free_video { "url": "https://...", "title": "clip" }
```

**Pipeline fallback:** Free sources activate automatically when Pexels/Pixabay return no results. No config needed.

**Docs:** [FREE_VIDEO.md](FREE_VIDEO.md) — SEO/AEO/GEO-optimized reference

## Director Mode

Use `[Visual: description]` tags in your script for exact visual control over each scene.

## Batch Generation

Generate multiple videos from a topic list:

```bash
# Batch generate from topics
npm run agentic:generate -- --topics "AI coding,Video editing,Photography,Web development"

# Batch with preview (plan-only for each)
npm run agentic:generate:preview -- --topics "AI coding,Video editing"

# Run specific batch stage
npm run agentic:mode:plan
npm run agentic:mode:images
npm run agentic:mode:voice-edgetts
npm run agentic:mode:compose
```

## GPU Acceleration

Enable hardware-accelerated rendering with the `--gpu` flag or `GPU_ACCEL=true` in `.env`:

```bash
# CLI flag (auto-selects best encoder)
npm run agentic -- --topic "Space" --gpu

# Environment variable
echo "GPU_ACCEL=true" >> .env
```

Supports AMD (AMF), NVIDIA (NVENC), and Intel (QSV) GPUs. Falls back to software encoding if no compatible GPU is found.

## Dry-Run Mode

Preview the full pipeline without downloading or rendering:

```bash
npm run agentic -- --topic "Quantum computing" --dry-run
```

Outputs: title, scene count, orientation, duration, per-scene keywords and voiceover text, and asset decisions — without touching any external service or disk.

## MCP Integration

Connect Claude Code or Claude Desktop:

```bash
claude mcp add automated-video-generator -- npx automated-video-generator
```

## Output

Generated videos are saved as MP4 files in `workspace/jobs/<jobId>/render/` with:
- Optional SRT/VTT subtitles
- Background music with auto-ducking
- Chapter markers (if `--chapters` is set)
- Preview thumbnails
- Contact sheet PNG showing all approved assets
- Decision report text file

Supports portrait (9:16), landscape (16:9), and square (1:1) orientations.

## Next Steps

- [Configuration](configuration.md) — Set up voices, API keys, and output settings
- [Installation](installation.md) — Reinstall or set up on a new machine
- [Troubleshooting](troubleshooting.md) — Fix common issues
