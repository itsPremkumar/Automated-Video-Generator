# Free Video Downloader — Sample Test Package

This directory contains sample scripts and metadata for testing the free
video downloader integration (Wikimedia Commons + Internet Archive).

## Sample `input/scripts/input-scripts.json`

The file `input/scripts/input-scripts.json` has been updated with 2 test jobs:

| Job ID | Title | Orientation | Keywords |
|--------|-------|-------------|----------|
| `free-video-test-space` | Space Exploration Free Sources | landscape | space, nebula, stars, galaxy, cosmos |
| `free-video-test-nature` | Nature & Wildlife Free Sources | portrait | cat, animal, nature, wildlife, forest |

## How to Run

```bash
# 1. Run the pipeline (uses free sources when Pexels/Pixabay unavailable)
npx tsx src/cli.ts

# 2. Or test the search API directly
#    (requires dev server running: npx tsx src/server.ts)
curl "http://localhost:3001/api/free-video/search?keyword=space&source=all&count=3"
curl "http://localhost:3001/api/free-video/search?keyword=cat&source=wikimedia&count=3"

# 3. Or test via the MCP tools
npx tsx src/mcp-server.ts
# Then use: search_free_video { "keyword": "space", "source": "all", "count": 3 }
```

## Verified Working Keywords (from E2E tests)

### Wikimedia Commons
| Keyword | Results | Example Title |
|---------|---------|---------------|
| `cat` | ✅ Works | "Cat body language..." by Shannon McGee |
| More keywords | Try: `bird`, `dog`, `house`, `car`, `city` |

### Internet Archive
| Keyword | Results | Example Title |
|---------|---------|---------------|
| `space` | ✅ Works | "Talking Business : BBCNEWS" (Public Domain) |
| `ocean` | ✅ Works | Various |
| More keywords | Try: `nasa`, `science`, `earth`, `nature`, `wildlife` |

## Expected Behavior

When you run `npx tsx src/cli.ts`:
1. The script is parsed into scenes with auto-generated search keywords
2. `fetchVisualsForScene()` runs: **Pexels** → **Pixabay** → **Free Sources** → **Openverse**
3. If no API keys are set for Pexels/Pixabay, they are skipped automatically
4. Free sources search Wikimedia Commons + Internet Archive in parallel
5. The first successful result is used as the scene's video
6. If all sources fail, Openverse images serve as ultimate fallback

## Output

Generated videos appear in:
```
output/
  └── free-video-test-space/
  │     ├── Space Exploration Free Sources.mp4
  │     ├── Space Exploration Free Sources details.txt
  │     ├── thumbnail.jpg
  │     ├── script.txt
  │     └── scene-data.json
  └── free-video-test-nature/
        └── ...
```

## Rate Limits

- **Wikimedia Commons**: ~8 requests per minute before 429
- **Internet Archive**: More generous, but still limited
- Wait 60 seconds between test runs if you hit rate limits
