# Setup Guide

This document explains how to set up the project for development, local rendering, and desktop packaging.

## System Requirements

- Windows, macOS, or Linux
- Node.js 18 or newer
- npm
- Python 3.8 or newer for development voice generation
- 8 GB RAM minimum, 16 GB recommended for larger renders
- Enough free disk space for cached assets, rendered segments, and output videos

## Runtime Overview

The project now supports four main runtime entrypoints that share one application core:

1. Browser portal and HTTP API with `npm run dev`
2. CLI generation with `npm run generate`
3. MCP server with `npm run mcp`
4. Windows desktop packaging with Electron

Current executable entry files:

- `src/server.ts`
- `src/cli.ts`
- `src/mcp-server.ts`
- `electron/electron-main.ts`

For the architectural layout behind these entrypoints, see [ARCHITECTURE.md](./ARCHITECTURE.md).

Voice generation now follows this order when possible:

1. `Edge-TTS`
2. Windows offline speech fallback in packaged desktop mode
3. Google TTS fallback when available

## Development Setup

### 1. Install Node.js

Install Node.js from [nodejs.org](https://nodejs.org/).

Verify:

```bash
node -v
npm -v
```

### 2. Install project dependencies

```bash
npm install
```

### 3. Install Python voice dependencies

Windows:

```bash
py -m pip install -r requirements.txt
```

If `py` is unavailable:

```bash
python -m pip install -r requirements.txt
```

macOS or Linux:

```bash
python3 -m pip install -r requirements.txt
```

This installs the `edge-tts` runtime used during normal development.

### 4. FFmpeg

The project prefers bundled `ffmpeg-static` and `ffprobe-static`, so many machines do not need a global FFmpeg install.

A system FFmpeg install is still useful as a fallback.

Verify if you have a global install:

```bash
ffmpeg -version
```

### 5. Configure environment variables

Copy `.env.example` to `.env`.

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

macOS or Linux:

```bash
cp .env.example .env
```

Set at least:

```env
PEXELS_API_KEY=your_key_here
PIXABAY_API_KEY=
GEMINI_API_KEY=
PUBLIC_BASE_URL=
PORT=3001
VIDEO_ORIENTATION=portrait
VIDEO_VOICE=en-US-GuyNeural
```

`PEXELS_API_KEY` is the main required key for the standard browser workflow.

## Running The Project

### Local browser portal

```bash
npm run dev
```

Open:

```text
http://localhost:3001/
```

### CLI generation

Create or update `input/input-scripts.json`, then run:

```bash
npm run generate
```

### MCP server

```bash
npm run mcp
```

Use this runtime when connecting Claude Desktop, Claude Code, or other MCP clients.

### Remotion Studio

```bash
npm run remotion:studio
```

## Verification Commands

### Backend and shared TypeScript

```bash
npx tsc -p tsconfig.json --noEmit
```

### Electron main process

```bash
cmd /c node_modules\.bin\tsc.cmd -p tsconfig.electron.json --noEmit
```

### Desktop bundle source check

```bash
npm run electron:verify-bundle
```

### Unpacked Windows release check

```bash
npm run electron:verify-release
```

### Health endpoint

Start the portal and open:

```text
http://localhost:3001/health
```

The health response helps verify:

- voice engine readiness
- FFmpeg availability
- Python runtime availability
- Node module availability

## Desktop-Specific Notes

### Setup wizard behavior

The Electron setup window is not just informational anymore.

- `Launch App` explicitly starts the backend and opens the portal
- `Skip` also launches the app instead of just closing the window
- closing the setup window before launch exits the app cleanly

### Voice engine behavior on Windows

Packaged desktop builds try:

1. bundled `edge-tts.exe`
2. bundled Python `-m edge_tts`
3. system `edge-tts`
4. Windows offline speech voices
5. Google TTS fallback if available

This makes fresh Windows installs much more resilient than before.

### Render security default

Chromium web security is now enabled by default during Remotion render.

Only disable it if you have a specific compatibility issue:

```bash
set REMOTION_DISABLE_WEB_SECURITY=1
```

Use this only for debugging or controlled environments.

## Troubleshooting

### Edge-TTS works on your laptop but not on a fresh machine

That usually means your dev machine already had Python or `edge-tts` installed globally.

The current desktop app now reduces that problem by:

- preferring bundled `Edge-TTS`
- repairing the bundled runtime through the setup wizard
- falling back to Windows offline speech on Windows

### Voice engine still not available on Windows

Check:

- the setup wizard
- bundled runtime verification with `npm run electron:verify-bundle`
- Windows speech voices in system settings
- the `/health` endpoint

### Packaged render behaves differently than dev

Run:

```bash
npm run electron:verify-release
```

That checks the unpacked desktop build for the expected bundled runtime files.

## Related Docs

- [../QUICKSTART.md](../QUICKSTART.md)
- [WINDOWS_INSTALLER.md](./WINDOWS_INSTALLER.md)
- [PRODUCTION_HARDENING.md](./PRODUCTION_HARDENING.md)
- [ARCHITECTURE.md](./ARCHITECTURE.md)
