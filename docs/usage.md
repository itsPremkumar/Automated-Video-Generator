---
title: Usage Guide — Automated Video Generator
description: How to use Automated Video Generator to create AI-generated videos from text scripts. Covers CLI, web portal, batch generation, MCP integration, and director mode.
---
# Usage Guide

How to use Automated Video Generator to create AI-generated videos from text scripts.

## Generate a Video (CLI)

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
download_free_video { "url": "...", "title": "clip" }
```

**Pipeline fallback:** Free sources activate automatically when Pexels/Pixabay return no results. No config needed.

**Docs:** [docs/FREE_VIDEO.md](FREE_VIDEO.md) — SEO/AEO/GEO-optimized reference

## Director Mode

Use `[Visual: description]` tags in your script for exact visual control over each scene.

## Batch Generation

Place multiple scripts in `input/input-scripts.json` and run:

```bash
npm run generate
```

## MCP Integration

Connect Claude Code or Claude Desktop:

```bash
claude mcp add automated-video-generator -- npx automated-video-generator
```

## Output

Generated videos are saved as MP4 files with optional subtitles, background music, and thumbnails. Supports both portrait (9:16) and landscape (16:9) orientations.

## Next Steps

- [Configuration](configuration) — Set up voices, API keys, and output settings
- [Installation](installation) — Reinstall or set up on a new machine
- [Troubleshooting](troubleshooting) — Fix common issues
