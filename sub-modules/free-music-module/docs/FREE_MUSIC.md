# Free Music Module — Complete Reference

## Architecture

```
User Code
    │
    ├── openLofiProvider.search("ambient", 5)
    │     └── https://raw.githubusercontent.com/.../catalog.json
    │
    ├── ncsProvider.search("", 3)
    │     └── nocopyrightsounds-api (npm) → ncs.io
    │
    ├── fmaProvider.search("jazz", 5)
    │     └── https://freemusicarchive.org/search?q=jazz
    │
    ├── everythingIsFreeProvider.search("", 2)
    │     └── @ichbinsoftware/everything-is-free (npm)
    │
    ├── archiveAudioProvider.search("ambient music", 3)
    │     └── https://archive.org/advancedsearch.php
    │
    └── freeMusicLabProvider.search("lofi", 5)
          └── https://api.freemusiclab.ai/api/v1 (needs key)
```

## All Providers

### 1. open-lofi
- **URL**: https://github.com/btahir/open-lofi
- **Tracks**: 166 lo-fi tracks across 10 categories
- **License**: CC0 1.0 Universal (Public Domain)
- **Access**: `catalog.json` from GitHub raw, MP3s from raw GitHub URLs
- **API Key**: None
- **Genres**: Focus, Seasons, Ambient, Soul, Late Night, Funk, Jazz, Chillhop, Zen, Cinematic

### 2. everythingisfree
- **URL**: https://github.com/ichbinsoftware/everythingisfree
- **Tracks**: 7 electronic tracks with stems
- **License**: CC0 1.0 Universal (Public Domain)  
- **Access**: npm package `@ichbinsoftware/everything-is-free`
- **API Key**: None
- **Format**: WAV (lossless) + M4A (streaming)

### 3. NCS (NoCopyrightSounds)
- **URL**: https://ncs.io
- **Tracks**: 1000+ electronic music tracks
- **License**: Free for monetized content
- **Access**: npm package `nocopyrightsounds-api`
- **API Key**: None
- **Genres**: House, Dubstep, Trap, Drum & Bass, Future Bass, Pop, Rock, Garage

### 4. Free Music Archive
- **URL**: https://freemusicarchive.org
- **Tracks**: 150,000+ across all genres
- **License**: Various CC (filterable by commercial-use licenses)
- **Access**: HTML scraping (no official API available)
- **API Key**: None
- **Note**: Scrapes search + track pages to extract MP3 URLs

### 5. Internet Archive Audio
- **URL**: https://archive.org
- **Tracks**: Millions of public domain audio files
- **License**: Public Domain / CC
- **Access**: `advancedsearch.php` API
- **API Key**: None

### 6. FreeMusicLab.ai (optional)
- **URL**: https://freemusiclab.ai
- **Tracks**: 2,000+ AI-generated
- **License**: Google Lyria (commercial use)
- **Access**: REST API at `api.freemusiclab.ai/api/v1`
- **API Key**: Free registration at freemusiclab.ai

### 7. ACE-Step (generation, optional)
- **URL**: https://github.com/ACE-Step/ACE-Step-1.5
- **License**: MIT
- **Access**: Local REST API on port 8001
- **Requires**: Python 3.11+, GPU (RTX 3050 4GB works with 2B turbo + INT8)

## Integration Plan

When integrating into main project:

1. Copy `src/` → `src/lib/free-music/`
2. Create `src/application/free-music-app.service.ts`
3. Create `src/adapters/http/free-music-controller.ts`
4. Create `src/adapters/mcp/register-free-music-tools.ts`
5. Register routes in `api-routes.ts`
6. Register MCP tools in `mcp-server.ts`
