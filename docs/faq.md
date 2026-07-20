# FAQ

## General

### Is this completely free?
Yes. MIT-licensed, no paid plans, no subscriptions, no watermarks. Optional third-party services (Pexels, Pixabay) may have their own terms and rate limits.

### Do I need an API key?
No. Openverse provides 600M+ CC-licensed images with no API key. For video stock, a free Pexels API key is recommended but not required.

### Is this an AI video generator?
Yes. It uses AI voice generation (Edge-TTS) with deterministic media selection and Remotion rendering. Optional AI visual verification uses Ollama or Gemini Vision.

### Does it add a watermark?
No watermark is added by this project.

## Usage

### Can I use my own images/videos?
Yes. Place files in `input/visuals/` and reference them with `[Visual: filename.mp4]` or `[Visual: filename.jpg]` in your script.

### Can I use this for YouTube Shorts / TikTok / Reels?
Yes. Use `portrait` orientation for 9:16 vertical video.

### Can I self-host it?
Yes. Run it locally, in Docker, or deploy behind your own infrastructure.

### Do I need to install FFmpeg?
The project bundles `ffmpeg-static` and `ffprobe-static`, so most users don't need a separate FFmpeg install. A global FFmpeg is only needed as a fallback on some machines.

## Technical

### What happens if Edge-TTS is missing?
The desktop app tries multiple voice paths: bundled Edge-TTS first, then Windows offline speech fallback.

### What Python version do I need?
Python 3.8 or later.

### What Node.js version do I need?
Node.js 18 or later.

### Can I run this headlessly?
Yes. Use the CLI (`npm run generate`) or the MCP server for headless operation.

### Is there an API?
Yes. The web portal exposes HTTP endpoints at `http://localhost:3001/`.
