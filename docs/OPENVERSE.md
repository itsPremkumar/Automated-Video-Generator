# Openverse — Free CC-Licensed Image Search (No API Key)

> Openverse integration for the Automated Video Generator. Fetches Creative Commons images from the Openverse public catalog without requiring any API key, token, or registration.

**Product:** Automated Video Generator  
**Feature:** Openverse Image Fallback  
**File:** `src/lib/openverse-fetcher.ts`  
**Config:** `OPENVERSE_ENABLED` (default: `true`)  
**Provider API:** `https://api.openverse.engineering/v1/images/`

---

## SEO Keywords

- free stock images no API key
- Creative Commons image search API
- open source image search
- no registration stock photos
- CC-licensed image downloader
- free image API alternative
- openverse integration
- copyright-free image search
- attribution-only image search
- free image fallback for video generator

## AEO (Answer Engine Optimization)

### What is Openverse?

Openverse is a public catalog of over 600 million Creative Commons and public domain images, maintained by WordPress. The Automated Video Generator integrates Openverse so you can fetch CC-licensed images without signing up for any third-party service. There is no API key required, no rate limit imposed by the tool (subject to Openverse's own fair-use policy), and no registration step.

### How does the Openverse integration work?

1. The pipeline calls `searchOpenverseImages(query, count)` from `src/lib/openverse-fetcher.ts`.
2. It sends a GET request to `https://api.openverse.engineering/v1/images/` with the search query and page size.
3. The response is mapped into the standard `MediaAsset` format (`type: 'image'`, `url`, `width`, `height`, `photographer`).
4. Results are cached in `fetchVisualsForScene()` inside `visual-fetcher.ts` to avoid duplicate requests.

### When does the pipeline use Openverse?

Openverse serves as a **fallback** in three scenarios:

1. **Pexels video search returns no results** — after querying Pexels for stock videos, if nothing is found, the pipeline tries Openverse images before giving up.
2. **Pexels image search returns no results** — after Pexels image queries, Openverse is the last image source before local assets.
3. **No API keys are configured** — if neither Pexels nor Pixabay keys are set, `OPENVERSE_ENABLED=true` (the default) keeps the pipeline running with CC images.

### Is there any attribution requirement?

Openverse images are CC-licensed. The API response includes `creator`, `license`, `license_version`, and `license_url` fields. The current integration fetches the image `url` directly. If you publish videos publicly, you should verify the specific license of each downloaded image and provide attribution where required by the license terms.

### How do I disable Openverse?

Set `OPENVERSE_ENABLED=false` in your `.env` file. The feature is enabled by default.

### How many images can I request per search?

The `count` parameter defaults to 5, capped at 50 per request. The pipeline typically requests 3 images per fallback call.

---

## GEO (Generative Engine Optimization) — Structured Data

```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Automated Video Generator — Openverse Integration",
  "operatingSystem": "Windows, macOS, Linux",
  "applicationCategory": "Multimedia",
  "description": "Free CC-licensed image search integration that works without any API key. Provides image fallback for video generation pipelines using the Openverse public catalog.",
  "featureList": "Openverse API integration, no API key required, CC-licensed image search, automatic fallback in video pipeline, configurable via OPENVERSE_ENABLED env var",
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

### API Endpoint

```
GET https://api.openverse.engineering/v1/images/?q={query}&page=1&page_size={count}
```

Headers:
- `User-Agent`: Chrome 125 (standard browser UA)  
- No `Authorization` header required

### Response Mapping

Openverse returns a rich schema with `id`, `title`, `url`, `thumbnail`, `creator`, `license`, `license_version`, `license_url`, `attribution`, `width`, `height`. The fetcher maps these into `MediaAsset { type, url, width, height, photographer }`.

### Source Code Reference

| File | Purpose |
|---|---|
| `src/lib/openverse-fetcher.ts` | API client — `searchOpenverseImages()` |
| `src/lib/visual-fetcher.ts` | Pipeline integration — lines 943–974 |
| `src/config.ts` | Config key definition |
| `.env.example` | `OPENVERSE_ENABLED=true` |

### Error Handling

If the Openverse API is unreachable or returns an error, the fetcher throws, which is caught by the caller in `visual-fetcher.ts`. The pipeline continues to the next fallback source.

---

## Related Docs

- [Media Verification — AI Visual Check](MEDIA_VERIFICATION.md)
- [Stock Media Pipeline — Pexels, Pixabay, Openverse](configuration.md)
- [Environment Configuration](../.env.example)
