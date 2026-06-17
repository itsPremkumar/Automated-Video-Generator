# Configuration Guide

How to configure Automated Video Generator for your workflow.

## Environment Variables

Copy `.env.example` to `.env` and configure:

| Variable | Required | Description |
|----------|----------|-------------|
| `PEXELS_API_KEY` | Yes | API key for stock video/images |
| `PIXABAY_API_KEY` | No | Alternative stock media source |
| `PORT` | No | Web portal port (default: 3001) |
| `OUTPUT_DIR` | No | Custom output directory |

## Voice Settings

400+ voices available across all major languages including English, Tamil, Hindi, Spanish, French, German, and more. Voices are fetched via Edge-TTS with Windows offline speech fallback.

## Video Output

| Setting | Options |
|---------|---------|
| Orientation | Portrait (9:16) / Landscape (16:9) |
| Background Music | Configurable with volume control |
| Subtitles | Auto-generated subtitle overlays |
| Thumbnails | Auto-generated for completed videos |

See [SETUP.md](./SETUP.md) for full setup instructions.
