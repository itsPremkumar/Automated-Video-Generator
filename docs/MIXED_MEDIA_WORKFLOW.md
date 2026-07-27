# Mixed-Media Video Workflow — Complete End-to-End Guide

**How to build one final video that mixes ALL four visual source types:**

| # | Source type | How it's obtained | Example |
|---|------------|-------------------|---------|
| 1 | **Downloaded video** | Pexels API (`searchVideos` + download) | city traffic timelapse |
| 2 | **Downloaded image** | Pexels API (`searchImages` + download) | mountain landscape |
| 3 | **Generated Remotion motion** | Autonomous codegen (`runRemotionController`) | infographic / HUD / kinetic text |
| 4 | **Website screenshot** | Live browser capture (agent browser / Puppeteer) | homepage hero, GitHub repo page |

This workflow was built and empirically verified (90+ segment frames ffprobe-checked,
15+ vision-verified) across 3 rounds of combination testing. Everything below is the
exact, proven procedure.

---

## 0. Prerequisites

- `PEXELS_API_KEY` set in `.env` (project root). **Important:** only `src/mcp-server.ts`
  auto-loads dotenv — standalone drivers MUST call `dotenv.config({ path: '.env' })`
  themselves or Pexels silently falls back to free sources.
- Chrome installed; export for Remotion renders:
  `export CHROME_EXECUTABLE="/c/Program Files/Google/Chrome/Application/chrome.exe"`
- `node_modules/ffmpeg-static/ffmpeg.exe` (bundled, no system install needed).
- All generated files stay inside project root (`input/visuals/`, `output/`,
  `workspace/`) — never system TEMP (AVS containment rule).

---

## 1. Acquire downloaded assets (Pexels)

Use the project's real fetchers from `src/lib/visual-fetcher/index.ts`:

```ts
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });                     // MANDATORY for standalone scripts
const { searchImages, searchVideos } = await import('./src/lib/visual-fetcher/index.ts');

// Search returns MediaAsset[] with DIRECT downloadable URLs
const vids = await searchVideos('city traffic timelapse', 3, 1, 'landscape');
const imgs = await searchImages('mountain landscape', 3, 1, 'landscape');
```

**Download via native `fetch`** (Node 22 global) — the built-in `downloadMedia` helper
failed with `undefined` errors in testing; direct fetch is proven reliable:

```ts
const res = await fetch(asset.url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
fs.writeFileSync('input/visuals/v0.mp4', Buffer.from(await res.arrayBuffer()));
```

Verify: file sizes should be MBs for videos (5–20MB typical), 1–5MB for photos.
A file under ~100KB usually means an error page was saved instead.

---

## 2. Generate Remotion motion clips (autonomous codegen)

```ts
const { runRemotionController } = await import('./src/agentic/media/hermes-remotion-controller.ts');

const results = await runRemotionController(
  [
    { index: 0, kind: 'infographic', text: 'Market Growth',
      data: [20, 45, 70, 95], labels: ['Q1', 'Q2', 'Q3', 'Q4'],
      palette: ['#0a0a14', '#7c3aed', '#22d3ee'], durationInFrames: 120 },
    // kinds: 'infographic' | 'hud' | 'kinetic' | 'diagram' | 'abstract' | ...
  ],
  { jobId: 'my_batch', maxRetries: 4, fps: 30 },
);
// -> input/visuals/<jobId>_s<index>.mp4  (status: 'generated')
```

Each clip is self-verified in the controller loop (ffprobe signal + optional vision
check via `remotion-verify.ts`). Renders take ~30–60s each headless.

**Headless pitfalls (all fixed in `remotion-sequence.ts`, keep in mind for new code):**
- `slide`/`wipe` must be imported from subpaths (`@remotion/transitions/slide`).
- Shader/canvas transitions (crossZoom, filmBurn, linearBlur, wipe, dissolve) HANG
  under headless Chrome without GPU — only `slide` (pure CSS) is safe by default;
  others require `allowShaderTransitions: true` on a GPU machine.
- `renderStill` needs the Composition `durationInFrames` > the frame you request.
- Multi-scene TransitionSeries renders take ~2–3 min — background runners with short
  kill windows will murder them mid-render and report bogus failures. Run foreground
  with `timeout 280`.

---

## 3. Capture website screenshots (browser)

Capture live pages with the agent browser (or Puppeteer/Playwright headless):

1. Navigate to the target page (e.g. `https://your-website.com`, a GitHub repo page).
2. Take a screenshot — the agent's `browser_vision` saves a PNG to its cache dir.
3. Copy into the project: `cp <cache>/browser_screenshot_*.png input/visuals/s0.png`

**CRITICAL — screenshots are NOT photos.** Full-page captures are extremely tall
(e.g. 1920×8000). If you fit-inside + pad them like photos, the result is an
unreadable thin vertical strip with giant black bars (this exact bug was caught by
vision verification). Use the dedicated scroll-pan treatment in step 4.

---

## 4. Convert every asset to a uniform segment (ffmpeg)

All segments must be 1920×1080 @ 30fps h264 yuv420p for lossless concat.
`FF = node_modules/ffmpeg-static/ffmpeg.exe`

**Downloaded/Remotion VIDEO — normalize + trim:**
```bash
$FF -y -i v0.mp4 -t 4 \
  -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2" \
  -r 30 -c:v libx264 -pix_fmt yuv420p -an seg.mp4
```

**PHOTO — ken-burns (slow zoom):**
```bash
$FF -y -loop 1 -i i0.jpg -t 3 \
  -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,zoompan=z='min(zoom+0.0008,1.25)':d=90:s=1920x1080:fps=30" \
  -r 30 -c:v libx264 -pix_fmt yuv420p seg.mp4
```

**WEBSITE SCREENSHOT — scroll-pan (looks like a screen recording):**
```bash
$FF -y -loop 1 -i s0.png -t 4 \
  -vf "scale=1920:-2,crop=1920:1080:0:'min(t*60,ih-1080)',fps=30" \
  -r 30 -c:v libx264 -pix_fmt yuv420p seg.mp4
```
(scale to full 1920 width, crop a 1080-high viewport, pan down 60px/sec — the page
fills the frame and stays readable.)

---

## 5. Concatenate into the final mixed video

```bash
# list.txt:  file 'C:/path/seg0.mp4'  (forward slashes, one per line)
$FF -y -f concat -safe 0 -i list.txt -c copy final_mixed.mp4
```

`-c copy` works because step 4 made every segment codec-identical. Any ordering of
the four source types is valid — video-led, remotion-led, screenshot-led, fully
interleaved — all were tested (10+ combination videos, every permutation clean).

For native Remotion transitions between generated scenes instead of hard cuts, use
`renderSequence()` from `src/agentic/media/remotion-sequence.ts` (one bundle,
`<TransitionSeries>`, headless-safe `slide` default).

---

## 6. Verify (MANDATORY — the quality gate)

Static checks are not enough. Every combo must pass:

1. **ffprobe gate** — duration, 1920×1080, h264:
   `$FF -i final.mp4 2>&1 | grep -E "Duration|Stream"`
2. **Per-segment frame extraction** — extract a frame from the MIDDLE of every
   segment (`-ss <segStart + dur/2>` BEFORE `-i` is fast-seek; put it AFTER `-i`
   for frame-accurate seeks on short files):
   `$FF -y -ss 6.5 -i final.mp4 -frames:v 1 frame.png`
   A frame under ~2KB, or missing, means a black/corrupt segment.
3. **Vision check** — run extracted frames through vision analysis and confirm the
   SUBJECT matches the expected segment (e.g. "bar chart Q1–Q4 20/45/70/95",
   "readable website hero", "real ocean footage"). This is what caught the
   screenshot-strip bug and a wrong-direction `wipe` crash that ffprobe missed.

Keep a per-segment report line: `round|combo|seg|tag|type|desc|frame=OK`.

---

## 7. Proven results (reference)

- **Rounds R1+R2**: 10 combos × 9 segments (3 vid + 3 img + 3 remotion), 90/90
  frames OK, Remotion clips verified clean in every position.
- **Round SHOT**: 3 combos mixing all FOUR types (20/20 frames OK); screenshots
  readable after scroll-pan fix.
- Output naming: `output/batch/round_<R>/combo_<name>.mp4`.

## Pitfall summary (hard-won)

| Pitfall | Fix |
|---|---|
| Pexels "No API key" despite `.env` | driver must call `dotenv.config()` itself |
| `downloadMedia` returns `undefined` error | download with native `fetch` + UA header |
| Screenshot renders as thin unreadable strip | scroll-pan treatment (scale width, crop, pan) |
| Shader transitions hang headless | default to `slide`; `allowShaderTransitions` for GPU |
| Background runner kills 2–3 min renders | run foreground with `timeout 280` |
| `wipe` direction `to-left` crashes | valid values are `from-*` (e.g. `from-right`) |
| `renderStill` "frame 30 invalid" | Composition `durationInFrames` must exceed target frame |
| Concat `-c copy` glitches | only concat codec-identical segments (step 4 first) |
