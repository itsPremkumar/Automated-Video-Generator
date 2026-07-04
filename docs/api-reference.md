# API Reference

## HTTP Endpoints

All endpoints are available when the web portal is running (default: `http://localhost:3001`).

### Health Check

```
GET /health
```

Response:
```json
{ "status": "ok", "service": "video-generator" }
```

### Generate Video

```
POST /generate-video
```

Request body:
```json
{
  "id": "my-video",
  "title": "My Video",
  "script": "Your script text here...",
  "orientation": "portrait",
  "voice": "en-US-GuyNeural",
  "backgroundMusic": "music.mp3"
}
```

### Job Status

```
GET /jobs/:jobId
```

### Free Video Search

```
GET /api/free-video/search?keyword=nature&source=all&count=5
```

### API Routes

All API routes are prefixed with `/api/`.

## MCP Tools

When the MCP server is running, the following tools are available:

- `generate_video` — Create a video from a script
- `search_free_video` — Search free video sources
- `list_assets` — List input assets
- `upload_asset` — Upload a file to input assets
