---
title: API Reference — Agentic MCP Tools
description: Documentation of the MCP tools exposed by src/agentic/operations and src/adapters/mcp. Purpose, inputs, outputs, and an example for each.
---

# Agentic MCP Tools API

Every tool in this document is registered by `src/mcp-server.ts` via the
`@modelcontextprotocol/sdk` `McpServer`. Tools are grouped by their registration file
under `src/adapters/mcp/`. All tools return an MCP `text`/`image` content object; the
`errorResponse` helper is used for failures (except where a tool intentionally returns a
"blocked" text message, e.g. the gate).

> **Convention:** `out` is always optional. When omitted, the tool writes into
> `output/…` (or the job workspace) and returns the produced path. Successful tools return
> `textResponse("-> <path>\n<detail>")`; mutating tools are guarded by
> `assertSafeMutationAllowed('mcp', …)`.

---

## 1. Operations Tools — `register-operations-tools.ts`

These expose the single-task operations layer (`src/agentic/operations/*`). Each does
exactly one thing and is re-verified post-render.

### `do_task`
Natural-language router. Classifies a plain request and runs only the matching single task
(or a 2–3 step chain split on "then"/"after that"). No paid key needed.

- **Inputs:** `prompt: string` (required), `files?: string[]`, `out?: string`,
  `voice?: string`, `orientation?: 'portrait' | 'landscape'`
- **Output:** text result (`{summary}\n{detail}`) + primary output path.
- **Example:**
  ```json
  { "prompt": "crop to 9:16 then add music ambient lofi", "files": ["input/clip.mp4"] }
  ```

### `merge_videos`
Concatenate two or more videos into one.
- **Inputs:** `files: string[]` (min 2), `out?: string`, `orientation?: 'portrait'|'landscape'` (default `portrait`)
- **Output:** `EditResult` → text `-> <output>\n<detail>`
- **Example:** `{ "files": ["a.mp4","b.mp4"], "out": "merged.mp4" }`

### `trim_video`
Cut a clip to `[start, end]` seconds.
- **Inputs:** `file: string`, `out?: string`, `start: number` (default 0), `end?: number`
- **Example:** `{ "file": "a.mp4", "start": 2, "end": 10 }`

### `crop_video`
Crop to a target aspect.
- **Inputs:** `file: string`, `out?: string`, `preset?: '9:16'|'16:9'|'1:1'`
- **Example:** `{ "file": "a.mp4", "preset": "9:16" }`

### `resize_video`
Scale to W×H (h = -2 keeps aspect ratio).
- **Inputs:** `file: string`, `out?: string`, `w: number` (default 720), `h: number` (default -2)
- **Example:** `{ "file": "a.mp4", "w": 1080, "h": 1080 }`

### `rotate_video`
Rotate 90/180/270 degrees.
- **Inputs:** `file: string`, `out?: string`, `deg: '90'|'180'|'270'` (default `'90'`)
- **Example:** `{ "file": "a.mp4", "deg": "90" }`

### `extract_audio`
Pull the audio track out of a video as mp3.
- **Inputs:** `file: string`, `out?: string`
- **Example:** `{ "file": "a.mp4", "out": "a.mp3" }`

### `split_video`
Split into N equal parts, or at explicit marks (seconds).
- **Inputs:** `file: string`, `parts?: number`, `marks?: number[]`, `out?: string`
- **Example:** `{ "file": "a.mp4", "parts": 3 }` or `{ "file": "a.mp4", "marks": [5, 12] }`

### `add_captions`
Burn captions from text or an existing `.srt`.
- **Inputs:** `file: string`, `text?: string`, `srt?: string`, `out?: string`
- **Example:** `{ "file": "a.mp4", "text": "Hello world" }`

### `add_music`
Add a free background music track under the video (auto-ducked).
- **Inputs:** `file: string`, `query?: string` (default `'ambient lofi'`), `out?: string`
- **Example:** `{ "file": "a.mp4", "query": "cinematic epic" }`

### `add_audio_track`
Mux a user-supplied audio (voiceover/narration) onto a video.
- **Inputs:** `file: string`, `audio: string`, `volume: number` (default 1.0), `out?: string`
- **Example:** `{ "file": "a.mp4", "audio": "vo.mp3", "volume": 1.0 }`

### `localize_video`
Produce translated subtitle sidecars (`es/fr/hi/ta/…`). Uses free-model translation with
offline fallback to original text.
- **Inputs:** `file?: string`, `text?: string`, `languages: string[]`, `outDir?: string`
- **Example:** `{ "text": "Welcome to the channel", "languages": ["es","hi"] }`

### `grade_video`
Apply a cinematic color grade.
- **Inputs:** `file: string`, `preset: 'cinematic'|'vivid'|'neon'|'teal-orange'|'bleach-bypass'|'neutral'|'warm'|'cool'` (default `'cinematic'`), `out?: string`
- **Example:** `{ "file": "a.mp4", "preset": "neon" }`

### `slow_motion`
Slow the whole clip by a factor (2 = half speed).
- **Inputs:** `file: string`, `factor: number` (default 2), `out?: string`
- **Example:** `{ "file": "a.mp4", "factor": 2 }`

### `speed_ramp`
Slow a middle window of the clip, normal elsewhere.
- **Inputs:** `file: string`, `rampStart: number` (default 1), `rampEnd: number` (default 3), `slowFactor: number` (default 3), `out?: string`
- **Example:** `{ "file": "a.mp4", "rampStart": 1, "rampEnd": 3, "slowFactor": 3 }`

### `add_watermark`
Burn a corner watermark/logo text.
- **Inputs:** `file: string`, `label: string` (default `'MyBrand'`), `out?: string`
- **Example:** `{ "file": "a.mp4", "label": "MyBrand" }`

### `add_lower_third`
Burn a lower-third name/title bar.
- **Inputs:** `file: string`, `text: string` (default `'Title'`), `out?: string`
- **Example:** `{ "file": "a.mp4", "text": "Host Name" }`

### `add_progress_bar`
Burn a progress bar at the bottom of a video.
- **Inputs:** `file: string`, `out?: string`
- **Example:** `{ "file": "a.mp4" }`

### `derive_outputs`
Produce 9:16 / 16:9 / 1:1 versions + a thumbnail from an existing video.
- **Inputs:** `file: string`, `aspects: ('9:16'|'16:9'|'1:1')[]` (default all three), `thumbnail: boolean` (default true), `outDir?: string`
- **Example:** `{ "file": "a.mp4", "aspects": ["9:16","1:1"], "thumbnail": true }`

### `make_voiceover`
Generate an mp3 voiceover from text using Edge-TTS (free).
- **Inputs:** `text: string` (min 1, `;` or newline splits lines), `voice?: string`, `out?: string`
- **Example:** `{ "text": "Hello world; Welcome to my video", "voice": "en-US-AriaNeural" }`

### `download_image`
Fetch a free CC image for a keyword.
- **Inputs:** `keyword: string` (min 1), `out?: string`
- **Example:** `{ "keyword": "coffee cup" }`

### `download_video`
Fetch a free CC video for a keyword.
- **Inputs:** `keyword: string` (min 1), `out?: string`
- **Example:** `{ "keyword": "city timelapse" }`

---

## 2. Agentic Pipeline Tools — `register-agentic-tools.ts`

The "agent has complete control" surface over the six stages. `agentic_run` is the
one-shot end-to-end path.

### `agentic_plan`  (STAGE 1)
Turn a script into a director plan (scenes + music query).
- **Inputs:** `jobId: string`, `title: string`, `script: string` (min 10),
  `orientation?: 'portrait'|'landscape'` (default `portrait`), `voice?: string`, `musicQuery?: string`
- **Output:** text `Planned N scenes. Music query: "…". orientation=…`
- **Example:** `{ "jobId": "job_1", "title": "Coffee Facts", "script": "Did you know coffee… [Visual: espresso machine]" }`

### `agentic_acquire`  (STAGE 2)
Download candidate images/videos/music into per-type folders.
- **Inputs:** `jobId: string`, `candidatesPerAsset: number` (1–5, default 2)
- **Output:** text `Acquired N candidates into <workspace>.`
- **Example:** `{ "jobId": "job_1", "candidatesPerAsset": 2 }`

### `agentic_verify_all`  (STAGE 3)
Run the full verification matrix on all candidates.
- **Inputs:** `jobId: string`
- **Output:** text `<pass> pass, <fail> fail. Details in verification/*.json.`
- **Example:** `{ "jobId": "job_1" }`

### `list_pending_assets`
Show every candidate + its verification score for agent review (markdown table).
- **Inputs:** `jobId: string`
- **Example:** `{ "jobId": "job_1" }`

### `get_asset_preview`
Return a base64 thumbnail/frame so the agent can *see* the asset.
- **Inputs:** `jobId: string`, `assetId: string` (e.g. `image_s0_c1`)
- **Output:** MCP `image` content (`data` base64, `mimeType: image/jpeg`)
- **Example:** `{ "jobId": "job_1", "assetId": "image_s0_c1" }`

### `approve_asset` / `reject_asset`
Agent approves/rejects a candidate (full control). `reject_asset` triggers a re-fetch via
the gateway.
- **Inputs:** `jobId: string`, `assetId: string`, `rationale?: string`
- **Example:** `{ "jobId": "job_1", "assetId": "image_s0_c1", "rationale": "good composition" }`

### `agentic_gate`  (STAGE 5)
Run the final holistic gate (X1–X6). Blocks render if anything unverified.
- **Inputs:** `jobId: string`
- **Output:** `GATE PASS. Render manifest ready (N assets).` or `errorResponse` listing
  failed checks `X<id> <label>: <detail>`.
- **Example:** `{ "jobId": "job_1" }`

### `agentic_run`  (ONE-SHOT)
Hermes writes the script, expands keywords, acquires, verifies and **decides** every asset
— no external AI needed when `backend='agent'`.
- **Inputs:** `topic: string` (min 5), `title: string`, `backend?: 'agent'|'vision'` (default `agent`),
  `orientation?: 'portrait'|'landscape'` (default `portrait`), `voice?: string`, `candidatesPerAsset: number` (1–5, default 2)
- **Output:** `DONE (backend=agent, fullyAgentDriven=true). N assets approved. GATE PASS — ready to render M assets.`
  or a `GATE BLOCKED` error listing failures.
- **Example:**
  ```json
  { "topic": "5 fascinating facts about coffee", "title": "Coffee Facts", "backend": "agent" }
  ```

---

## 3. Input Tools — `register-input-tools.ts`

> All mutating tools require `assertSafeMutationAllowed('mcp', …)`.

### `write_input_script`
Write/update a script in `input/scripts/input-scripts.json`. Schema = `videoScriptSchema`.
### `read_input_script`
Read all scripts from `input/scripts/input-scripts.json`. (No inputs.)
### `delete_input_script`
Delete a script by ID. **Inputs:** `id: string`.
### `validate_input_script`
Validate a script format before saving. Schema = `videoScriptSchema`.
### `upload_asset`
Upload a base64 file to `input/visuals/` (max 50 MB).
- **Inputs:** `filename: string`, `base64Data: string`
- **Example:** `{ "filename": "logo.png", "base64Data": "<base64>" }`
### `delete_asset`
Delete a file from `input/visuals/`. **Inputs:** `filename: string`.

---

## 4. Output Tools — `register-output-tools.ts`

### `list_output_videos`
List all completed videos in the output directory. (No inputs.)
### `read_output_file`
Read a file from a video output directory.
- **Inputs:** `videoId: string`, `filename?: string`
### `delete_output`
Delete an entire video output directory. Requires `assertSafeMutationAllowed`.
- **Inputs:** `videoId: string`

---

## 5. Job Tools — `register-job-tools.ts`

### `generate_video`
Start a background job to generate a professional video.
- **Inputs:** `pipelineJobRequestSchema.partial({language})` extended with
  `id?: string`, `publicId?: string`, `skipReview: boolean` (default true)
- **Output:** text with `Job ID`, `Output ID`, and a `get_video_status` reminder.
- **Example:**
  ```json
  { "scripts": [{ "id": "s1", "title": "Coffee", "scenes": [] }], "skipReview": true }
  ```

### `get_video_status`
Check progress/status of a job. **Inputs:** `jobId: string`.
- **Output:** text `Status / Progress / Message / Output Path / File Size / Error`.

### `run_pipeline_command`
Execute a whitelisted npm script (`generate`, `resume`, `segment`, `batch`, …). Requires
`assertSafeMutationAllowed`.
- **Inputs:** `command: string`, `args?: string[]`
- **Example:** `{ "command": "batch" }`

### `list_jobs`
List recent jobs and their status (markdown table). (No inputs.)
### `get_batch_status`
Read `output/batch-manifest.json` summary (Batch Queue Manager). (No inputs.)

---

## 6. Admin Tools — `register-admin-tools.ts`

### `read_env_config`
Read `.env` (masked by default). **Inputs:** `showSecrets?: boolean`.
### `update_env_config`
Update a `.env` variable. Requires `assertSafeMutationAllowed`. **Inputs:** `key: string`, `value: string`.
### `get_system_info`
Project system information. (No inputs.)
### `health_check`
Verify dependencies + directory state (`pipelineAppService.getDiagnostics()`). (No inputs.)
### `get_workspace_paths`
Return absolute project paths (input/output/public dirs). (No inputs.)
### `list_public_files`
List files under `public/` (or a subdir; `..` rejected). **Inputs:** `subdir?: string`.
### `list_voices`
List available TTS voices (8 built-in Neural voices). (No inputs.)
### `list_local_assets`
List media files in `input/visuals/`. (No inputs.)

---

## 7. Free-Video Tools — `register-free-video-tools.ts`

### `search_free_video`
Search free CC videos from Wikimedia Commons and Internet Archive. No API key.
- **Inputs:** `keyword: string`, `count?: number` (default 5), `source?: 'all'|'wikimedia'|'archive'`,
  `maxDuration?: number`, `minResolution?: number`, `sortBy?: 'relevance'|'newest'|'resolution'`
- **Output:** text listing titles, creators, licenses, durations, resolutions, URLs.
- **Example:** `{ "keyword": "ocean waves", "source": "wikimedia", "maxDuration": 30 }`

### `download_free_video`
Download a free CC video by URL into the workspace.
- **Inputs:** `url: string`, `title: string`, `creator?: string`, `license?: string`, `format?: string`
- **Output:** text with `Title / Creator / License / File / Size / Local Path / Public URL`.
- **Example:**
  ```json
  { "url": "https://upload.wikimedia.org/…/ocean.webm", "title": "Ocean Waves", "license": "CC BY" }
  ```

---

## 8. Error Handling & Capabilities

- **`assertSafeMutationAllowed('mcp', …)`** guards all write/delete/env/command tools.
  If the MCP mutation capability is disabled, these tools return an error rather than
  executing.
- **Post-render verification** — single-task video tools re-run `verifyRenderedVideo`
  (X7–X9) and attach `gate` to the result; a broken edit is reported, not silently shipped.
- **Offline safety** — every network-dependent tool has a free fallback (placeholder card,
  tone audio, cached music). A tool never throws a hard failure on missing network; it
  returns a descriptive `detail`.
