# Usage Guide

How to use Automated Video Generator to create AI-generated videos from text scripts.

## Generate a Video

```bash
npm run generate -- --script "Your video script here"
```

Or use the local web portal at `http://localhost:3001/`:

1. Enter your Pexels API key
2. Paste or write a script
3. Choose voice, orientation, music
4. Click Generate Video
5. Download the MP4 output

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

See [SETUP.md](./SETUP.md) for full details.
