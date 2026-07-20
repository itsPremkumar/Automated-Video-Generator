# HTTP API Reference

Base URL: `http://localhost:3001` (default when running `npm run dev`).

> **Note:** MCP tools are documented separately in [`API.md`](./API.md). This
> reference covers **all HTTP endpoints** only.

---

## Health & System

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Returns service health status (`{ status, service }`) |

---

## Video Management

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/videos` | List all published videos |
| `GET` | `/api/videos/:videoId` | Get a single published video by ID |
| `POST` | `/generate-video` | **(legacy)** Start a video generation job. Body: `{ id, title, script, orientation?, voice?, backgroundMusic? }` |
| `GET` | `/files/:videoId/video` | Stream a published video's MP4 file |
| `GET` | `/files/:videoId/thumbnail` | Serve a published video's thumbnail image (404 if none) |
| `GET` | `/download/:videoId` | Trigger a file download of a published video |

---

## Voice

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/voices` | List available TTS voices |

---

## Setup

| Method | Path | Description | Access |
|--------|------|-------------|--------|
| `GET` | `/api/setup/status` | Get setup/configuration status | Public |
| `POST` | `/api/setup/env` | Update environment variables | Local only |

---

## Job Management

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/jobs` | Start a new video generation job. Body: `startJobBodySchema` |
| `GET` | `/api/jobs/:jobId` | Get job status and progress |
| `GET` | `/api/jobs/:jobId/scenes` | Get all scenes for a job |
| `POST` | `/api/jobs/:jobId/scenes/reorder` | Reorder scenes. Body: `{ scenes: SceneOrder[] }` |
| `POST` | `/api/jobs/:jobId/scenes/:sceneIndex` | Update a scene at the given index. Body: `updateSceneBodySchema` |
| `DELETE` | `/api/jobs/:jobId/scenes/:sceneIndex` | Delete a scene at the given index |
| `POST` | `/api/jobs/:jobId/scenes/:sceneIndex/refine` | Refine a scene with AI. Body: `{ prompt: string }` |
| `POST` | `/api/jobs/:jobId/confirm` | Confirm a job and trigger render |
| `POST` | `/api/jobs/:jobId/cancel` | Cancel a running job |
| `POST` | `/api/jobs/:jobId/retry` | Retry a failed job |

---

## AI

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/ai/generate-script` | Generate a video script using AI. Body: `{ ... }` according to `generateScriptBodySchema` |

---

## Video / Social Download

| Method | Path | Description | Access |
|--------|------|-------------|--------|
| `POST` | `/api/video-download/process` | Process a video download request | Local only |
| `POST` | `/api/social-download/process` | Process a social-media video download request. Body: `socialDownloadBodySchema` | Local only |

---

## Free Video (CC)

| Method | Path | Description | Access |
|--------|------|-------------|--------|
| `GET` | `/api/free-video/sources` | List available free video sources | Local only |
| `GET` | `/api/free-video/search` | Search free CC videos. Query: `keyword`, `source?`, `count?`, `maxDuration?`, `minResolution?`, `sortBy?` | Local only |
| `POST` | `/api/free-video/download` | Download a free CC video by URL | Local only |

---

## File System

All file system endpoints require local-only access.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/fs/ls` | List files in a directory. Query: `path`, `hidden?` |
| `POST` | `/api/fs/pick` | Pick/select a file. Body: `{ path }` |
| `POST` | `/api/fs/save-to` | Save output to a chosen location. Body: `{ path }` |
| `GET` | `/api/fs/drives` | List available drives (Windows) |
| `GET` | `/api/fs/home` | Get user home directory paths |
| `GET` | `/api/fs/assets` | List gallery assets |
| `DELETE` | `/api/fs/assets/:filename` | Delete a specific asset by filename |
| `GET` | `/api/fs/view` | View a file's contents. Query: `path`, `encoding?` |

---

## Agentic Pipeline (REST)

Mounted under `/api/agentic`. These are additive — they do not touch the legacy `/api` routes.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/agentic/run` | Trigger a full agentic video generation. Body: `{ topic, title, orientation?, voice?, backend?, musicQuery?, preferVisual? }`. Returns `{ jobId, gate, voiceoverDriven, rendered, videoUrl }` |
| `GET` | `/api/agentic/jobs/:id` | Get agentic job status, gate result, decisions, and manifest |
| `GET` | `/api/agentic/jobs/:id/scenes` | Get scene audit trail (parsed `scene-data.json`) |
| `GET` | `/api/agentic/jobs/:id/video` | Stream the rendered MP4 video file |
| `GET` | `/api/agentic/jobs/:id/contact-sheet` | Serve the contact-sheet PNG showing every approved asset |
| `GET` | `/api/agentic/jobs/:id/decisions` | Read the plain-text decisions report |

---

## View Routes (HTML pages & static files)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Home page |
| `GET` | `/video-download` | Video download tool page |
| `GET` | `/videos/:videoId` | Watch a published video |
| `GET` | `/jobs/:jobId` | Job detail/review page |
| `GET` | `/robots.txt` | Robots exclusion file |
| `GET` | `/sitemap.xml` | XML sitemap |
| `GET` | `/og-image.svg` | Open Graph default image (SVG) |
| `GET` | `/llms.txt` | LLM-friendly summary (`llms.txt` standard) |
| `GET` | `/llms-full.txt` | Full LLM-friendly project context |

---

## Rate Limiting

- `POST /generate-video` and `POST /api/jobs` share a rate limit defined by `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS`.
- `POST /api/ai/generate-script` has a separate rate limiter.

## Validation

All endpoints that accept structured input are validated against Zod schemas defined in `src/schemas/api.schemas.ts`. Invalid requests receive a `400` error with details.

## Authentication

- Endpoints marked **Local only** require `requireLocalAccess` middleware (typically restricts to `localhost` / `127.0.0.1`).
- All other endpoints are publicly accessible when the server is reachable.
