# Automated Video Generator

<div align="center">
  <img src="assets/logo-automation.png" alt="Automated Video Generator Logo" width="200" style="border-radius: 20px;">
  <p align="center">
    <strong>Turn text into frame-perfect videos with AI, Automation, and Remotion.</strong>
  </p>
</div>

---

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

<br/>
<div align="center">
  <h2>📥 Download the Windows App (Easiest)</h2>
  <a href="https://github.com/itsPremkumar/Automated-Video-Generator/releases/latest">
    <img src="https://img.shields.io/badge/⬇️_Download_Windows_.exe_Installer-0D1117?style=for-the-badge&logo=windows&logoColor=blue" alt="Download Windows App" height="56">
  </a>
  <p><strong>No Manual Runtime Setup • No Separate Python Install • No Separate Node.js Install</strong></p>
  <p>Just download the latest <code>.exe</code> file, double-click, and start generating videos locally!</p>
</div>
<br/>

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

<div align="center">
  <h2>🎬 See it in Action</h2>
  <a href="https://youtu.be/ryNhQd_M2G8?si=MfGNsJ_8jGvV2r8T">
    <img src="https://img.youtube.com/vi/ryNhQd_M2G8/maxresdefault.jpg" alt="Automated Video Generator Demo" width="800" style="border-radius: 10px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
  </a>
  <br/>
  <p><em>Example video fully generated using Automated Video Generator. Click to watch on YouTube.</em></p>
</div>

---


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

- **Worldwide support for 400+ voices across all major languages with a searchable interface**
- Text-to-video pipeline with Remotion and React
- **Multi-language support including Tamil, Hindi, Spanish, French, and German**
- Edge-TTS voiceovers with Windows desktop fallback support for fresh installs
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
- Neural voice generation with `edge-tts`, Windows offline speech fallback, and recovery-friendly desktop setup
- Portrait and landscape video output
- Resumable segmented rendering with Remotion
- Cancel, retry, and restart-aware job recovery
- Render thumbnails for completed videos
- Browser portal for generation, status tracking, playback, and downloads
- Windows desktop installer with setup wizard, bundled runtime checks, and release verification
- MCP tool interface for agentic workflows

## Quick start

### 🚀 Standalone Windows Desktop App (Easiest)

For non-technical users, we provide a **completely standalone Windows desktop app**. No terminal, no Node.js, and no Python installation required.

[**👉 Click here to download the latest Windows `.exe` Installer**](https://github.com/itsPremkumar/Automated-Video-Generator/releases/latest)

- **No Manual Runtime Setup**: Most users do not need to install Node.js or Python themselves.
- **Natively Bundled**: The desktop app ships with its own runtime and bundled voice engine resources.
- **Fallback Friendly**: If bundled `Edge-TTS` is unavailable, Windows builds can fall back to offline Windows speech.
- **Auto-Open**: The video generator portal launches automatically on startup.
- **Repair Friendly**: The setup wizard can repair missing runtime pieces and launch the app directly.

If you are shipping or testing the Windows app, read [`docs/WINDOWS_INSTALLER.md`](./docs/WINDOWS_INSTALLER.md) and [`docs/PRODUCTION_HARDENING.md`](./docs/PRODUCTION_HARDENING.md).

---

### One-click Windows launcher (PowerShell/Batch)

For non-technical users on Windows, the easiest option is:

```text
Start-Automated-Video-Generator.bat
```

If you are already inside PowerShell, use:

```powershell
.\Start-Automated-Video-Generator.bat
```

There is also a native PowerShell launcher:

```powershell
.\Start-Automated-Video-Generator.ps1
```

It can:

- install Node.js and Python with `winget` if missing
- create `.env` from `.env.example`
- install Node dependencies
- install Python voice dependencies if needed
- start the local portal
- open the browser automatically

After the browser opens:

1. Save your `PEXELS_API_KEY`
2. Paste or edit your script
3. Click `Generate Video`
4. Wait on the live status page
5. Watch or download the final MP4

### End-to-end simple installation workflows

#### Workflow 1: Windows one-click setup for common users

1. Clone the repository:

```bash
git clone https://github.com/itsPremkumar/Automated-Video-Generator.git
cd Automated-Video-Generator
```

2. Double-click:

```text
Start-Automated-Video-Generator.bat
```

If you are launching from PowerShell instead of File Explorer, use:

```powershell
.\Start-Automated-Video-Generator.bat
```

3. The launcher handles the first-time setup and opens the browser portal.

4. In the portal:

- save your API key
- paste the script
- choose voice, orientation, and music if needed
- start the render
- watch or download the result

#### Workflow 2: Manual setup for Windows, macOS, or Linux

1. Clone the repository:

```bash
git clone https://github.com/itsPremkumar/Automated-Video-Generator.git
cd Automated-Video-Generator
```

2. Install Node dependencies:

```bash
npm install
```

3. Install Python voice dependencies:

Windows:

```bash
py -m pip install -r requirements.txt
```

If `py` does not work:

```bash
python -m pip install -r requirements.txt
```

macOS or Linux:

```bash
python3 -m pip install -r requirements.txt
```

4. Copy `.env.example` to `.env`

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

macOS or Linux:

```bash
cp .env.example .env
```

5. Add `PEXELS_API_KEY` to `.env`

6. Start the browser portal:

```bash
npm run dev
```

7. Open:

```text
http://localhost:3001/
```

### Quick verification commands

Check Node.js:

```bash
node -v
```

Check npm:

```bash
npm -v
```

Check Python:

Windows:

```bash
py --version
```

or:

```bash
python --version
```

macOS or Linux:

```bash
python3 --version
```

Check Edge-TTS:

Windows:

```bash
py -m edge_tts --help
```

or:

```bash
python -m edge_tts --help
```

macOS or Linux:

```bash
python3 -m edge_tts --help
```

Portal health check:

```bash
npm run dev
```

Then open:

```text
http://localhost:3001/health
```

You should see JSON similar to:

```json
{"status":"ok","service":"video-generator"}
```

### Prerequisites

- Node.js 18+
- npm
- Python 3.8+
- FFmpeg available on your `PATH`

Note: the renderer tries to use bundled `ffmpeg-static` and `ffprobe-static` first, so many users will not need a separate FFmpeg install. A global FFmpeg install is still useful as a fallback on some machines.

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
- Save API keys from the browser setup form
- Fill a sample script without touching `input/input-scripts.json`
- Track progress on a job page
- Watch completed videos
- Download the final MP4
- Expose SEO-ready pages if you deploy it publicly

### Example end-to-end common user flow

1. Clone the repo
2. Run the launcher or complete the manual install
3. Open `http://localhost:3001/`
4. Save `PEXELS_API_KEY`
5. Paste the script
6. Click `Generate Video`
7. Wait for the render page to finish
8. Watch or download the MP4

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
3. Generate voiceover audio with Edge-TTS and supported fallbacks when needed.
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
npm run electron:verify-bundle   # Check desktop bundle inputs before building
npm run electron:verify-release  # Check the unpacked Windows release
```

## Project structure

```text
src/
  adapters/
    http/                Express controllers, routes, and server bootstrap
    cli/                 CLI adapter and batch runner
    mcp/                 MCP tool registrars and MCP-specific stores/helpers
  application/           Shared application services and orchestration
  infrastructure/
    persistence/         Persistent job tracking
  shared/
    contracts/           Shared runtime-safe request/status contracts
    runtime/             Path and runtime helpers
    logging/             Runtime-aware logging helpers
  app.ts                 Express app composition
  server.ts              Thin HTTP executable entrypoint
  cli.ts                 Thin CLI executable entrypoint
  mcp-server.ts          Thin MCP executable entrypoint
  video-generator.ts     Pipeline generation implementation
  render.ts              Segmented Remotion renderer
electron/
  electron-main.ts       Desktop composition root
  dependency-service.ts  Desktop dependency checks and repair
  server-manager.ts      Desktop backend process manager
  window-manager.ts      Desktop window and tray manager
  ipc.ts                 Electron IPC wiring
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

For the full architecture reference, see [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).

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

### Do I need to install FFmpeg manually?

Not always. The project tries bundled `ffmpeg-static` first. A global FFmpeg install is mainly a fallback for machines where the bundled binary cannot be used.

### What happens if Edge-TTS is missing on Windows?

The desktop app now tries multiple voice paths instead of failing immediately.

It prefers bundled `Edge-TTS`, can repair the bundled runtime from the setup wizard, and can fall back to Windows offline speech if needed.

### What should a normal user do first?

Clone the repo, run `Start-Automated-Video-Generator.bat`, save the `PEXELS_API_KEY` in the browser portal, and generate from the UI.

### What if `py` exists but is broken on Windows?

Try:

```bash
python -m pip install -r requirements.txt
```

If Python itself is broken, reinstall Python 3 or use:

```powershell
winget install --id Python.Python.3.12 --exact --accept-package-agreements --accept-source-agreements --silent
```

### Why does PowerShell say the batch file is not recognized?

PowerShell does not run files from the current folder by name alone.

Use:

```powershell
.\Start-Automated-Video-Generator.bat
```

or:

```powershell
.\Start-Automated-Video-Generator.ps1
```

## GEO and AI-friendly docs

These files make the project easier for AI tools and answer engines to understand:

- [`llms.txt`](./llms.txt)
- [`llms-full.txt`](./llms-full.txt)
- [`QUICKSTART.md`](./QUICKSTART.md)
- [`WINDOWS_INSTALLER.md`](./docs/WINDOWS_INSTALLER.md)
- [`SETUP.md`](./docs/SETUP.md)
- [`PRODUCTION_HARDENING.md`](./docs/PRODUCTION_HARDENING.md)
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
