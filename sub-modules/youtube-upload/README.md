# YouTube Upload Adapter (standalone)

A self-contained YouTube Data API v3 upload module for **Automated Video Generator**.
Built and verified in isolation under `youtube-upload/` before being wired into the
main project.

## Why separate?
The main project ends at a local MP4. Uploading to YouTube needs OAuth + the
Data API, which is a distinct concern. Keeping it isolated lets us verify it
works (dry-run, no credentials) before merging.

## What's included
- `src/auth.ts` — OAuth 2.0 (consent URL, code exchange, token refresh)
- `src/uploader.ts` — resumable video upload (live) + dry-run validation
- `src/token-store.ts` — JSON token persistence (mirrors main project's fs style)
- `src/cli.ts` — `auth` / `exchange` / `upload` commands
- `src/adapter.test.ts` — offline verification (no network/credentials)

## Modes
| Mode | Behavior |
|------|----------|
| `dry-run` (default) | Validates inputs, builds request shape, returns a mocked result. **No network, no credentials.** |
| `sandbox` | Same as dry-run (placeholder for future sandbox env). |
| `live` | Real upload via `googleapis`. Requires credentials + stored tokens. |

## Verify locally (no YouTube account needed)
```bash
cd youtube-upload
npm install
npm run typecheck
npm test            # 6 offline tests, all green
npm start auth --dry-run
npm start upload ./some-video.mp4 --title "Demo" --dry-run
```

## Go live (real uploads)
1. Create a Google Cloud project → enable **YouTube Data API v3**.
2. OAuth consent screen → add `youtube.upload` scope.
3. Credentials → OAuth client ID (type: Desktop / Web) → note client id/secret.
4. Run:
   ```bash
   npm start auth --client-id X --client-secret Y --redirect-uri http://localhost:3001/oauth/callback
   # open the printed URL, authorize, copy the ?code=... value
   npm start exchange <CODE> --client-id X --client-secret Y --redirect-uri http://localhost:3001/oauth/callback
   npm start upload ./output/my-video/final.mp4 --title "..." --live
   ```

## Merging into the main project
When verified, move these into the main repo:
- `auth.ts` + `uploader.ts` → `src/adapters/http/social-upload/`
- Token persistence → reuse `src/infrastructure/persistence/job-store.ts`
- CLI commands → `src/adapters/cli/cli-runner.ts`
- Add a "Publish to YouTube" button in `src/views/home/` wired to a new
  `POST /api/social/youtube` route guarded by `requireLocalAccess`.
- Gate behind `YOUTUBE_ENABLED` env flag (default off).

## Status
✅ Dry-run logic verified. ⏳ Live mode untested (needs real OAuth credentials).
