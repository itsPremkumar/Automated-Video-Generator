# Automated Video Generator

<div align="center">
  <a href="https://github.com/itsPremkumar/Automated-Video-Generator/stargazers">
    <img src="https://img.shields.io/github/stars/itsPremkumar/Automated-Video-Generator?style=for-the-badge" alt="GitHub stars">
  </a>
  <a href="https://github.com/itsPremkumar/Automated-Video-Generator/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/itsPremkumar/Automated-Video-Generator?style=for-the-badge" alt="MIT license">
  </a>
  <a href="https://github.com/itsPremkumar/Automated-Video-Generator/actions/workflows/ci.yml">
    <img src="https://img.shields.io/github/actions/workflow/status/itsPremkumar/Automated-Video-Generator/ci.yml?branch=main&style=for-the-badge&label=CI" alt="CI status">
  </a>
  <a href="https://github.com/itsPremkumar/Automated-Video-Generator/blob/main/CONTRIBUTING.md">
    <img src="https://img.shields.io/badge/Contributions-Welcome-1f8b4c?style=for-the-badge" alt="Contributions welcome">
  </a>
  <img src="https://img.shields.io/badge/Node.js-18%2B-2f7d32?style=for-the-badge" alt="Node.js 18+">
  <img src="https://img.shields.io/badge/Price-Free-0a7f5a?style=for-the-badge" alt="Free to use">
  <a href="https://www.npmjs.com/package/automated-video-generator">
    <img src="https://img.shields.io/npm/v/automated-video-generator?style=for-the-badge&color=cb0000" alt="NPM version">
  </a>
</div>

## Connect to Claude (one command)

### Claude Code
```bash
claude mcp add automated-video-generator -- npx automated-video-generator
```

### Claude Desktop
Add to your `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "automated-video-generator": {
      "command": "npx",
      "args": ["automated-video-generator"]
    }
  }
}
```

<div align="center">
  <p><strong>Free and open-source AI video generator</strong> for turning scripts into MP4 videos with Remotion, Edge-TTS, stock footage APIs, and a local web portal.</p>
  <p>🚀 <strong>Available on NPM:</strong> <a href="https://www.npmjs.com/package/automated-video-generator">automated-video-generator</a></p>
  <p>🦀 <strong>Listed on ClawHub:</strong> <a href="https://clawhub.ai/itspremkumar/video-gen-cli">automated-video-generator</a></p>
</div>

Automated Video Generator is a self-hosted text-to-video pipeline for developers, creators, and AI agents. Give it a script and it can fetch visuals, generate voiceovers, render scenes with Remotion, and export a ready-to-share video.

If you are searching for a free video generator, open-source AI video generator, Remotion video generator, YouTube Shorts generator, TikTok video generator, or self-hosted text-to-video tool, this repo is built for that workflow.

> This is not a fake "free trial" generator. The project itself is completely free and MIT-licensed. There is no paid plan, no subscription, and no watermark added by this codebase. Optional third-party services such as Pexels or Pixabay may still have their own quotas or terms.

## 🧊 The "Vibe Video" Philosophy

Inspired by the **Vibe Coding** movement, this project shifts you from a "manual editor" to a **Creative Director**. 

- **High-Level Intent**: Describe your story and the "vibe" you want.
- **Automated Performance**: The AI handles media fetching, voice synthesis, and frame-perfect audio-visual synchronization.
- **No Syntax, Just Story**: Stop worrying about keyframes and timelines. If you can describe it, you can generate it.

### 🦀 ClawHub AI Skills

The Automated Video Generator project is officially available on ClawHub. You can discover and use our native skills:

- **[Video Generator CLI](https://clawhub.ai/itspremkumar/video-gen-cli)**: High-performance command line tools for mass video production.
- **[Video Script Generator](https://clawhub.ai/itspremkumar/video-gen-script)**: Agentic skill to turn storytelling prompts into video-ready JSON scripts.

## Why this repo gets attention

- Free and open source under the MIT license
- Self-hosted video generation you control locally
-   Text-to-video pipeline with Remotion and React
-   **Multi-language support including Tamil, Hindi, Spanish, French, and German**
-   Edge-TTS voiceovers with multiple neural voice options

- Stock media fetching from Pexels and Pixabay
- Local asset support for your own images and videos
- **Configurable background music with volume control**
- Batch generation for multiple videos in one run
- Local web portal for generating, previewing, and sharing videos
- Built-in MCP server for Claude Desktop, Claude Code, and other MCP clients

## Best use cases

- YouTube Shorts automation
- TikTok and Reels content pipelines
- Faceless YouTube channels
- Marketing videos and product promos
- Explainer videos and tutorials
- Programmatic content generation for AI agents

## Core features

- Script-driven video generation from plain text or JSON
- Director mode with `[Visual: ...]` tags for exact visual control
- Automatic scene parsing and timeline generation
- Neural voice generation using `edge-tts`
- Portrait and landscape video output
- Resumable segmented rendering with Remotion
- Render thumbnails for completed videos
- Browser portal for generation, status tracking, playback, and downloads
- MCP tool interface for agentic workflows

## Quick start

### Prerequisites

- Node.js 18+
- npm
- Python 3.8+
- FFmpeg available on your `PATH`

### Install

#### Via NPM (Recommended for MCP)

You can run the MCP server directly without cloning:

```bash
npx automated-video-generator
```

Or install it globally:

```bash
npm install -g automated-video-generator
```

#### Via GitHub (Recommended for development)

```bash
git clone https://github.com/itsPremkumar/Automated-Video-Generator.git
cd Automated-Video-Generator
npm install
pip install -r requirements.txt
```

### Configure environment variables

Copy `.env.example` to `.env` and add your keys.

```env
# Free stock media API keys
PEXELS_API_KEY=your_key_here
PIXABAY_API_KEY=your_key_here

# Optional but recommended for public deployments
PUBLIC_BASE_URL=https://your-domain.example

# Optional defaults
PORT=3001
VIDEO_ORIENTATION=portrait
VIDEO_VOICE=en-US-GuyNeural
```

`PEXELS_API_KEY` is the main one to start with, and Pexels offers a free API key.

## Generate a video

Create `input/input-scripts.json` with one or more jobs:

```json
[
  {
    "id": "youtube-shorts-demo",
    "title": "3 Productivity Habits That Actually Work",
    "orientation": "portrait",
    "language": "tamil",
    "script": "வணக்கம்! செயற்கை நுண்ணறிவு தொழில்நுட்பம் உலகையே மாற்றிக்கொண்டிருக்கிறது."
  }
]

```

Run the pipeline:

```bash
npm run generate
```

The final video will be written to `output/<id>/`.

## Local web portal

Run the local portal:

```bash
npm run dev
```

Then open:

```text
http://localhost:3001/
```

The portal lets you:

- Start a render from the browser
- Track progress on a job page
- Watch completed videos
- Download the final MP4
- Expose SEO-ready pages if you deploy it publicly

## Remotion studio

Preview templates and compositions locally:

```bash
npm run remotion:studio
```

## MCP and AI agent support

This project ships with an MCP server, so AI tools can create and manage videos through chat-driven workflows.

Start the MCP server:

```bash
npm run mcp
```

Useful for:

- Claude Desktop
- Claude Code
- Other Model Context Protocol clients

## Project health

- CI runs on pushes and pull requests
- Dependabot keeps npm and GitHub Actions dependencies fresh
- Issue templates make bug reports and feature requests easier to review
- A pull request template helps contributors ship cleaner changes

## How it works

1. Parse a script into scenes and durations.
2. Fetch stock visuals or use local assets from `input/input-assests/`.
3. Generate voiceover audio with Edge-TTS.
4. Save scene data into `output/<job-id>/scene-data.json`.
5. Render scene segments with Remotion.
6. Stitch the final MP4 and thumbnail for playback and sharing.

## Available commands

```bash
npm run generate         # Generate videos from input/input-scripts.json
npm run resume           # Resume an interrupted generation run
npm run segment          # Rebuild from existing scene data
npm run remotion:studio  # Open Remotion studio
npm run remotion:render  # Render using the render pipeline
npm run dev              # Start the local web portal
npm run mcp              # Start the MCP server
npm run typecheck        # Validate TypeScript before opening a PR
```

## Project structure

```text
src/
  cli.ts                 Batch generation entry point
  server.ts              Local web portal and API
  mcp-server.ts          MCP server entry point
  video-generator.ts     Generation pipeline
  render.ts              Segmented Remotion renderer
  lib/
    script-parser.ts
    visual-fetcher.ts
    voice-generator.ts
    cleaner.ts
remotion/
  MainVideo.tsx
  SingleSceneVideo.tsx
  Root.tsx
input/
  input-scripts.json
  input-assests/         Local images and videos
output/                  Generated videos
public/                  Job assets served by the portal
```

## FAQ

### Is this a completely free video generator?

Yes. The project itself is completely free and open source under the MIT license. There is no paid plan attached to this repo. Optional external services may have their own rules or usage limits.

### Is this an open-source AI video generator?

Yes. It is an open-source text-to-video pipeline that uses AI voice generation plus deterministic media selection and Remotion rendering.

### Can I use this for YouTube Shorts, TikTok, and Reels?

Yes. Use `portrait` for 9:16 output and `landscape` for 16:9 videos.

### Does this add a watermark?

No watermark is added by this project.

### Can I use my own images and videos?

Yes. Put files in `input/input-assests/` and reference them with `[Visual: filename.mp4]` or `[Visual: filename.jpg]`.

### Can I self-host it?

Yes. You can run it locally, in Docker, or behind your own deployment setup.

## GEO and AI-friendly docs

These files make the project easier for AI tools and answer engines to understand:

- [`llms.txt`](./llms.txt)
- [`llms-full.txt`](./llms-full.txt)
- [`QUICKSTART.md`](./QUICKSTART.md)
- [`SETUP.md`](./docs/SETUP.md)
- [`CLAUDE_MCP_SETUP.md`](./docs/CLAUDE_MCP_SETUP.md)

## Roadmap and contributing

- [`ROADMAP.md`](./docs/ROADMAP.md)
- [`CONTRIBUTING.md`](./CONTRIBUTING.md)
- [`SECURITY.md`](./SECURITY.md)

## Growth assets

- [`REPOSITORY_GROWTH_CHECKLIST.md`](./docs/REPOSITORY_GROWTH_CHECKLIST.md)
- [`assets/github-social-preview.svg`](./assets/github-social-preview.svg)

## Suggested GitHub topics

If you want more GitHub discovery, set repo topics like:

`free-video-generator`, `open-source-video-generator`, `text-to-video`, `ai-video-generator`, `remotion`, `edge-tts`, `youtube-shorts`, `tiktok-video-generator`, `self-hosted`, `mcp-server`

## Contributing

Issues, feature requests, docs improvements, and pull requests are welcome.

If this repo helps you, please star it on GitHub:

<https://github.com/itsPremkumar/Automated-Video-Generator>
