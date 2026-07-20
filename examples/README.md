# Examples

This directory contains practical, ready-to-run examples for using Automated Video Generator at every skill level.

---

## Quick Reference

| Example | Skill Level | Focus | Script Lines |
|---------|-------------|-------|-------------|
| [youtube-shorts](./youtube-shorts/) | ★☆☆ Beginner | Portrait-mode Shorts generation | ~5 |
| [local-assets](./local-assets/) | ★☆☆ Beginner | Using your own images/videos | ~3 |
| [multi-language](./multi-language/) | ★☆☆ Beginner | Multi-language voiceovers | ~5 |
| [background-music](./background-music/) | ★★☆ Intermediate | Music with auto-ducking | ~5 |
| [custom-text-styles](./custom-text-styles/) | ★★☆ Intermediate | Text appearance customization | ~5 |
| [director-mode](./director-mode/) | ★★☆ Intermediate | Frame-perfect scene control | ~8 |
| [batch-processing](./batch-processing/) | ★★★ Advanced | Mass video generation | ~20 |
| [faceless-channel](./faceless-channel/) | ★★★ Advanced | Full channel automation | ~15 |
| [mcp-agent](./mcp-agent/) | ★★★ Advanced | AI agent integration | ~10 |

---

## How to Run Any Example

```bash
# 1. Navigate to the example directory
cd examples/youtube-shorts

# 2. Copy the example script to the project input
copy input-scripts.json ../../input/

# 3. From the project root, run
cd ../../
npm run generate

# 4. Find the output in output/<id>/final.mp4
```

---

## Example Details

### 🌟 Beginner Examples

#### [youtube-shorts](./youtube-shorts/)
Generate a vertical 9:16 video optimized for YouTube Shorts, TikTok, and Instagram Reels. Includes voiceover, stock footage, and automatic scene transitions.

**Expected output:** A 30-60 second portrait-mode video with voiceover and stock visuals.

#### [local-assets](./local-assets/)
Use your own images and videos instead of stock media. Place files in `input/input-assets/` and reference them directly in your script.

**Expected output:** A video composed entirely of your own media files with AI-generated voiceover.

#### [multi-language](./multi-language/)
Generate the same script in multiple languages (English, Tamil, Hindi, Spanish, French, German). Each language variant is a separate video.

**Expected output:** 6 separate video files, one per language, all with the same visual content but different voiceovers.

### 🚀 Intermediate Examples

#### [background-music](./background-music/)
Add background music with automatic volume ducking. Voiceover stays clear while music plays underneath.

**Expected output:** A video with background music that automatically lowers volume during voice segments.

#### [custom-text-styles](./custom-text-styles/)
Customize text appearance — font size, color, position, and animation style for subtitles and titles.

**Expected output:** A video with styled text overlays matching the specified configuration.

#### [director-mode](./director-mode/)
Use `[Visual: ...]` tags in your script to specify exact visuals for each scene. Gives you frame-perfect control over what appears on screen.

**Expected output:** A video where each scene's visuals match exactly what you specified in director mode tags.

### 🔥 Advanced Examples

#### [batch-processing](./batch-processing/)
Generate 10+ videos in a single run. Perfect for content calendars, channel automation, and A/B testing different scripts.

**Expected output:** Multiple complete videos, each with unique script, visuals, and voiceover, all generated in one command.

#### [faceless-channel](./faceless-channel/)
Complete workflow for running a faceless YouTube channel: topic research scripts, batch generation, and consistent branding across all videos.

**Expected output:** A branded video series with consistent intro/outro, style, and voice.

#### [mcp-agent](./mcp-agent/)
Use the MCP server to generate videos through Claude Desktop or Claude Code. Let AI agents create, configure, and manage video generation autonomously.

**Expected output:** Videos created entirely through natural language conversations with Claude.

---

## Directory Structure

```
examples/
├── README.md                    # This file
├── youtube-shorts/              # Beginner: Shorts automation
│   ├── README.md                # Example-specific instructions
│   └── input-scripts.json       # Ready-to-use job definition
├── faceless-channel/            # Advanced: Channel automation
│   ├── README.md
│   └── input-scripts.json
├── local-assets/                # Beginner: Custom media
│   ├── README.md
│   ├── input-scripts.json
│   └── assets/                  # Sample local media files
├── batch-processing/            # Advanced: Bulk generation
│   ├── README.md
│   └── input-scripts.json
├── director-mode/               # Intermediate: Scene control
│   ├── README.md
│   └── input-scripts.json
├── mcp-agent/                   # Advanced: AI agent workflows
│   ├── README.md
│   └── example-script.json
├── multi-language/              # Beginner: Multi-language
│   ├── README.md
│   └── input-scripts.json
├── background-music/            # Intermediate: Audio
│   ├── README.md
│   └── input-scripts.json
└── custom-text-styles/          # Intermediate: Text
    ├── README.md
    └── input-scripts.json
```

---

## Tips

- **Start with youtube-shorts** — it's the simplest end-to-end example
- **Check your .env** before running — at minimum, `PEXELS_API_KEY` should be set
- **No API key?** Set `OPENVERSE_ENABLED=true` in your `.env` — Openverse works without any key
- **Monitor output** in the `output/<job-id>/` directory
- **Watch the portal** at `http://localhost:3001/` for live progress
