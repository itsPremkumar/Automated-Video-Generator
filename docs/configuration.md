---
title: Configuration Guide — Automated Video Generator
description: Configure Automated Video Generator environment variables, voices, video output, API keys, and background music settings.
---
# Configuration Guide

How to configure Automated Video Generator for your workflow.

## Environment Variables

Copy `.env.example` to `.env` and configure:

| Variable | Required | Description |
|----------|----------|-------------|
| `PEXELS_API_KEY` | No* | API key for stock video/images |
| `PIXABAY_API_KEY` | No | Alternative stock media source |
| `OPENVERSE_ENABLED` | No | CC-licensed image fallback (default: `true`) |
| `PORT` | No | Web portal port (default: 3001) |
| `OUTPUT_DIR` | No | Custom output directory |

*`PEXELS_API_KEY` is recommended but not required. Without any API keys, the pipeline falls back to **free video sources** (Wikimedia Commons + Internet Archive) and **Openverse images** — both work with zero registration.

## Free Sources (Zero API Keys)

| Source | Content | License | Config |
|--------|---------|---------|--------|
| Wikimedia Commons | 90M+ videos (educational, nature, science) | CC BY-SA, CC0, Public Domain | None needed |
| Internet Archive | Documentaries, news, public domain films | Public Domain, CC BY | None needed |
| Openverse | 600M+ CC images | Various CC | `OPENVERSE_ENABLED=true` |

These sources are always available and require no environment variables. They activate automatically in the pipeline fallback chain.

**Docs:** [docs/FREE_VIDEO.md](FREE_VIDEO.md) — full reference

## Voice Settings

400+ voices available across all major languages including English, Tamil, Hindi, Spanish, French, German, and more. Voices are fetched via Edge-TTS with Windows offline speech fallback.

## Video Output

| Setting | Options |
|---------|---------|
| Orientation | Portrait (9:16) / Landscape (16:9) |
| Background Music | Configurable with volume control |
| Subtitles | Auto-generated subtitle overlays |
| Thumbnails | Auto-generated for completed videos |

## Next Steps

- [Usage Guide](usage) — Learn how to generate videos
- [Installation](installation) — Set up on a new machine
- [Troubleshooting](troubleshooting) — Fix common issues

See [SETUP.md](./SETUP.md) for full setup instructions.
