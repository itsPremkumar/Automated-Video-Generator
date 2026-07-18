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
| `REMOTION_BROWSER_EXECUTABLE` | No | Absolute path to a locally-installed Chrome/Chromium binary. When set, Remotion uses it for composition selection and rendering instead of downloading a browser. Useful on air-gapped or CI hosts. |

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

## Templates, Formats & Caption Themes (agentic pipeline)

The agentic pipeline (`npm run agentic`) accepts named presets so you don't have
to hand-tune every knob. All are free, deterministic, and offline.

### Video-type templates (`videoType`)
Selects the editorial voice (pacing, transitions, grade, caption style):
`facts`, `tutorial`, `news`, `story`, `product`, `motivational`, `nature`.

### Format presets (`format`)
Quick aspect/orientation for a target surface. Explicit `orientation`/`aspect`
still override the format when both are set.

| `format` | Orientation | Aspect |
|----------|-------------|--------|
| `shorts`, `reels`, `tiktok`, `promo` | portrait | 9:16 |
| `square` | portrait | 1:1 |
| `landscape`, `explainer` | landscape | 16:9 |

### Caption themes (`captionTheme`)
Controls the burned-in caption look (color, size, box, vertical position).
Leave unset for the historical default.

| `captionTheme` | Look |
|----------------|------|
| `minimal` | white, no box, bottom |
| `bold` | white, bold, bottom |
| `highContrast` | yellow on dark box, bottom |
| `softCard` | white on soft dark card, bottom |
| `centerPop` | large white, centered |
| `topTag` | small white on box, top |

Example config fragment:

```json
{ "topic": "How black holes bend light", "format": "shorts", "videoType": "facts", "captionTheme": "highContrast" }
```

## Voice Cloning (optional, GPU)

To narrate in your own cloned voice, run the Voicebox backend, then:

```bash
npm run voicebox:clone path/to/your-voice.wav "verbatim transcript of the clip"
```

This registers a cloned profile and writes `VOICEBOX_PROFILE_ID` to `.env`.
See [VOICE_CLONING_GUIDE.md](./VOICE_CLONING_GUIDE.md) for details.

## Next Steps

- [Usage Guide](usage) — Learn how to generate videos
- [Installation](installation) — Set up on a new machine
- [Troubleshooting](troubleshooting) — Fix common issues

See [SETUP.md](./SETUP.md) for full setup instructions.
