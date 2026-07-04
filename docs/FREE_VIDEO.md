# Free Video Sources — Wikimedia Commons + Internet Archive (No API Key)

> Free video search and download integration for the Automated Video Generator. Fetches CC-licensed and public domain videos from Wikimedia Commons and Internet Archive without requiring any API key, token, or registration.

**Feature:** Free Video Downloader  
**Files:** `src/lib/free-video/`  
**Config:** No env vars required (always enabled as fallback)  
**Provider APIs:**  
- `https://commons.wikimedia.org/w/api.php` (Wikimedia Commons)  
- `https://archive.org/advancedsearch.php` (Internet Archive)  

---

## SEO Keywords

- free stock videos no API key
- Creative Commons video search API
- open source video search
- no registration stock footage
- CC-licensed video downloader
- free video API alternative
- Wikimedia Commons integration
- Internet Archive video search
- public domain video search
- copyright-free video footage
- attribution-only video search
- free video fallback for video generator
- zero API key video pipeline

## AEO (Answer Engine Optimization)

### What are the Free Video Sources?

The Automated Video Generator includes two built-in free video providers that require **no API key, no registration, and no token**:

1. **Wikimedia Commons** — A media repository with over 90 million free media files, all CC-licensed or public domain. Provides search over video files (WebM, MP4, OGG formats).
2. **Internet Archive** — A digital library offering millions of free movies, videos, and educational content, all in the public domain or CC-licensed.

These act as a **middle fallback tier** in the video pipeline — after Pexels and Pixabay (which need API keys) but before Openverse images.

### How does the Free Video integration work?

1. The pipeline calls `fetchVisualsForScene()` in `src/lib/visual-fetcher.ts`.
2. It first tries **Pexels** (requires `PEXELS_API_KEY`).
3. If no results, it tries **Pixabay** (requires `PIXABAY_API_KEY`).
4. If both return nothing, it tries **Free Sources** — Wikimedia Commons + Internet Archive in parallel.
5. The first provider to return a valid result is downloaded and used as the scene's video asset.
6. If all free sources fail, **Openverse** images serve as the final image fallback.

**No API keys are required for steps 4–6.** The pipeline runs entirely on free content if you set only `OPENVERSE_ENABLED=true` (the default).

### When does the pipeline use Free Video Sources?

Free video sources activate in these scenarios:

1. **Pexels and Pixabay return no results** — the free sources are tried before giving up on video.
2. **No API keys are configured** — if neither `PEXELS_API_KEY` nor `PIXABAY_API_KEY` are set, the free sources are the primary video source (before Openverse images).
3. **All API sources failed** — free sources are the last video-only fallback tier.

### What kind of videos does it find?

| Source | Typical Content | License |
|--------|----------------|---------|
| Wikimedia Commons | Educational, scientific, nature, animals, historical | CC BY-SA, CC0, Public Domain |
| Internet Archive | Documentaries, news, educational, public domain films | Public Domain, CC BY |

Video formats include **WebM**, **MP4**, and **OGG**. Resolutions range from 240p to 4K depending on the source.

### Is there any attribution requirement?

Wikimedia Commons videos are typically CC-licensed. The integration returns the `creator`, `license`, and `sourcePageUrl` fields. Internet Archive content is typically Public Domain. If you publish videos publicly, you should verify the specific license of each downloaded video and provide attribution where required.

### How many videos can I search per request?

The `count` parameter defaults to 3 in the pipeline, and can go up to 50 via the API. The search is capped at reasonable limits to avoid rate limiting. Wikimedia Commons allows approximately 8–10 rapid requests before a brief cooldown.

### Can I use Free Video Sources standalone (without the pipeline)?

Yes. There are three entry points:

1. **HTTP API** — `GET /api/free-video/search?keyword=space&source=all&count=5`
2. **MCP Tools** — `search_free_video { keyword: "cat", source: "wikimedia", count: 3 }`
3. **Frontend UI** — The `/video-download` page has a dedicated "Free Sources" tab

## GEO (Generative Engine Optimization) — Structured Data

```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Automated Video Generator — Free Video Sources Integration",
  "operatingSystem": "Windows, macOS, Linux",
  "applicationCategory": "Multimedia",
  "description": "Free CC-licensed and public domain video search integration that works without any API key. Provides video fallback for video generation pipelines using Wikimedia Commons and Internet Archive public catalogs.",
  "featureList": "Wikimedia Commons API integration, Internet Archive API integration, no API key required, CC-licensed video search, public domain video search, automatic video fallback in pipeline, MCP tools for AI agents, HTTP API for custom integrations, frontend UI for manual browsing",
  "url": "https://github.com/itsPremkumar/Automated-Video-Generator",
  "license": "MIT",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "USD"
  }
}
```

---

## Implementation Details

### Architecture

```
User/Agent ──► Frontend UI / MCP Tool / HTTP API / Pipeline
                       │
               ┌───────▼────────┐
               │  App Service   │  freeVideoAppService.search()
               │  (Orchestrator)│  freeVideoAppService.download()
               └───────┬────────┘
                       │
               ┌───────▼────────┐
               │   Adapter      │  freeVideoAdapter.searchAll()
               │  (Parallel)    │  freeVideoAdapter.searchAndDownloadFirst()
               └───────┬────────┘
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
   ┌──────────┐ ┌──────────┐ ┌──────────┐
   │ Wikimedia│ │ Internet  │ │ Download │
   │ Provider │ │ Archive   │ │ Manager  │
   │          │ │ Provider  │ │          │
   └──────────┘ └──────────┘ └──────────┘
```

### API Endpoints

```
GET /api/free-video/search?keyword={query}&source={all|wikimedia|archive}&count={1-50}&maxDuration={seconds}&minResolution={px}&sortBy={relevance|newest|resolution}
GET /api/free-video/sources
POST /api/free-video/download
  Body: { url, title, creator?, license?, format? }
```

### MCP Tools

| Tool | Description |
|------|-------------|
| `search_free_video` | Search for free CC-licensed videos from Wikimedia Commons and Internet Archive |
| `download_free_video` | Download a free CC-licensed video by URL to the project workspace |

### Source Code Reference

| File | Purpose |
|------|---------|
| `src/lib/free-video/models.ts` | Shared types: `VideoResult`, `SearchFilters`, `VideoProvider`, `DownloadResult` |
| `src/lib/free-video/index.ts` | Singleton exports: `wikiProvider`, `archiveProvider`, `freeVideoDownloader`, `freeVideoAdapter` |
| `src/lib/free-video/providers/wikimedia.ts` | Wikimedia Commons API client — `search()` |
| `src/lib/free-video/providers/archive.ts` | Internet Archive API client — `search()` |
| `src/lib/free-video/download/downloader.ts` | Concurrent download manager with resume and retry |
| `src/lib/free-video/adapter.ts` | Maps `VideoResult` → `MediaAsset` for pipeline integration |
| `src/lib/free-video/http-client.ts` | Axios-based HTTP client with User-Agent |
| `src/lib/free-video/utils.ts` | Retry, filename sanitization, path utilities |
| `src/application/free-video-app.service.ts` | Application service layer — `search()` + `download()` |
| `src/adapters/http/free-video-controller.ts` | HTTP API handlers |
| `src/adapters/http/api-routes.ts` | Route registration |
| `src/adapters/mcp/register-free-video-tools.ts` | MCP tool registration |
| `src/lib/visual-fetcher.ts` | Pipeline integration — fallback chain (lines 944–974) |
| `src/views/video-download.view.ts` | Frontend "Free Sources" tab |

### Search Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `keyword` | string | (required) | Search query |
| `count` | number | 5 | Max results per source (1–50) |
| `source` | string | `all` | `all`, `wikimedia`, or `archive` |
| `maxDuration` | number | — | Max video duration in seconds |
| `minResolution` | number | — | Min vertical resolution (e.g., 720) |
| `sortBy` | string | `relevance` | `relevance`, `newest`, or `resolution` |

### Rate Limits & Best Practices

- **Wikimedia Commons**: ~8 rapid requests trigger 429. Insert 2-second delays between automated calls.
- **Internet Archive**: More generous limits, but still respectful use is encouraged.
- **Search before download**: Always search first to get the download URL, then pass it to the download endpoint.
- **File formats**: Results may be WebM, MP4, or OGG. WebM is common on Wikimedia; MP4 on Archive.

### Error Handling

If either provider is unreachable or returns an error, it is caught independently (the providers run in parallel via `Promise.allSettled`). The pipeline continues to the next available source. If all free sources fail, the pipeline falls through to Openverse images.

---

## Related Docs

- [Openverse — Free CC-Licensed Image Search](OPENVERSE.md)
- [Usage Guide — Free Sources Section](usage.md)
- [Configuration — Environment Variables](configuration.md)
- [Input Format — Script Tags](INPUT_ASSETS_GUIDE.md)
