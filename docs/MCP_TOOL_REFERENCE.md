# MCP Tool Reference — Automated Video Generator v1.2.0

> **Auto-generated reference for MCP clients** (Claude Desktop, Claude Code, OpenClaw, Hermes Agent, any MCP 1.0+ host).
>
> Regenerate with `npx tsx scripts/gen-mcp-doc.mjs`. The doc is the canonical contract
> that consumers (Claude/OpenClaw/Hermes) read — keep `register-*.ts` and this doc in lockstep.

## Tool families

| Family | File | # tools |
|---|---|---|
| **Admin** | `register-admin-tools.ts` | 7 |
| **Input** | `register-input-tools.ts` | 6 |
| **Job** | `register-job-tools.ts` | 5 |
| **Output** | `register-output-tools.ts` | 3 |
| **Free video** | `register-free-video-tools.ts` | 2 |
| **Agentic** | `register-agentic-tools.ts` | 11 |
| **Operations** | `register-operations-tools.ts` | 27 |

**Total tools exposed:** 61.

Every tool name is `snake_case`; every input uses a Zod schema validated by the server before the handler runs. Mutating tools call `assertSafeMutationAllowed('mcp', <op>)` — disabling that gate blocks writes.

## Admin — `register-admin-tools.ts`

_System / config / diagnostics._

| Tool | Description | Input shape |
| :--- | :--- | :--- |
| `read_env_config` | Read the current .env configuration (masked by default) | — |
| `update_env_config` | Update a specific variable in the .env file | `z.object({ key: z.string()` |
| `get_system_info` | Get project system information | — |
| `health_check` | Verify system dependencies and directory state | — |
| `get_workspace_paths` | Return the absolute project paths Claude should use. | — |
| `list_public_files` | List files under the public directory or a public subdirectory. | — |
| `list_voices` | List all available AI voice options for the video generator TTS engine. | — |

## Input — `register-input-tools.ts`

_Scripts + local asset upload._

| Tool | Description | Input shape |
| :--- | :--- | :--- |
| `write_input_script` | Write or update a script in input/scripts/input-scripts.json | — |
| `read_input_script` | Read all scripts from input/scripts/input-scripts.json | — |
| `delete_input_script` | Delete a script from input/scripts/input-scripts.json by its ID | — |
| `validate_input_script` | Validate a script format before saving | — |
| `upload_asset` | Upload a base64 encoded file to ${INPUT_ASSETS_DIR}/ | `z.object({ filename: z.string()` |
| `delete_asset` | Delete a file from ${INPUT_ASSETS_DIR}/ | — |

## Job — `register-job-tools.ts`

_Generate / monitor / batch._

| Tool | Description | Input shape |
| :--- | :--- | :--- |
| `generate_video` | Starts a background job to generate a professional video. | `pipelineJobRequestSchema.partial({ language: true }).extend({ id: z.string().opt` |
| `get_video_status` | Check the current progress and status of a video generation job. | — |
| `run_pipeline_command` | Execute whitelisted npm scripts (generate, resume, segment, etc.) | `z.object({ command: z.string()` |
| `list_jobs` | List all recent video generation jobs and their current status. | — |
| `get_batch_status` | Read the latest batch run summary from output/batch-manifest.json (Batch Queue Manager, PRE-15-B). | — |

## Output — `register-output-tools.ts`

_List / read / delete outputs._

| Tool | Description | Input shape |
| :--- | :--- | :--- |
| `list_output_videos` | List all completed videos in the output directory | — |
| `read_output_file` | Read a specific file from a video output directory | `z.object({ videoId: z.string()` |
| `delete_output` | Delete an entire video output directory | — |

## Free video — `register-free-video-tools.ts`

_Search + download CC video._

| Tool | Description | Input shape |
| :--- | :--- | :--- |
| `search_free_video` | Search for free CC-licensed videos from Wikimedia Commons and Internet Archive. No API key needed. | `z.object({ keyword: z.string().describe('Search keyword or phrase')` |
| `download_free_video` | Download a free CC-licensed video by URL to the project workspace for use in video generation. | `z.object({ url: z.string().describe('The download URL of the video')` |

## Agentic — `register-agentic-tools.ts`

_Hermes-driven plan→acquire→gate→render._

| Tool | Description | Input shape |
| :--- | :--- | :--- |
| `agentic_plan` | STAGE 1: turn a script into a director plan (scenes + music query). | `z.object({ jobId: z.string()` |
| `agentic_acquire` | STAGE 2: download candidate images/videos/music into per-type folders. | `z.object({ jobId: z.string()` |
| `agentic_verify_all` | STAGE 3: run the full verification matrix on all candidates. | — |
| `list_pending_assets` | Show every candidate + its verification score for agent review. | — |
| `get_asset_preview` | Return a base64 thumbnail/frame so the agent can SEE the asset. | `z.object({ jobId: z.string()` |
| `approve_asset` | Agent approves a candidate (full control). | `z.object({ jobId: z.string()` |
| `reject_asset` | Agent rejects a candidate; triggers re-fetch (gateway handles retries). | `z.object({ jobId: z.string()` |
| `agentic_gate` | STAGE 5: run final holistic gate (X1-X6). Blocks render if anything unverified. | — |
| `agentic_run` | One-shot: Hermes writes the script, expands keywords, acquires, verifies and DECIDES every asset — no external AI needed when backend=agent. | `z.object({ topic: z.string().min(5)` |
| `agentic_revise` | Re-edit a delivered job from a change request. Opens a revision round on the review thread, re-renders a NEW jobId (non-destructive), and binds it back. Use after agentic_run / agentic_render. | `z.object({ jobId: z.string()` |
| `agentic_critique` | Watch the rendered MP4 and return structured edit suggestions (black frames, clipping, aspect, caption overlaps). Offline; opt-in vision model when configured. | `z.object({ jobId: z.string()` |

## Operations — `register-operations-tools.ts`

_Single-task video edits (merge, trim, …)._

| Tool | Description | Input shape |
| :--- | :--- | :--- |
| `do_task` | Classify a plain request and run ONLY the matching single task (merge, trim, crop, resize, rotate, extract-audio, split, add-captions, add-music, localize, grade, slow-motion, speed-ramp, watermark, l | `z.object({ prompt: z.string().describe('What the user wants, in plain language')` |
| `merge_videos` | Concatenate two or more video files into one. | `z.object({ files: z.array(z.string()).min(2)` |
| `trim_video` | Cut a clip to [start,end] seconds. | `z.object({ file: z.string()` |
| `crop_video` | Crop to a target aspect (9:16 / 16:9 / 1:1). | `z.object({ file: z.string()` |
| `resize_video` | Scale a video to WxH. | `z.object({ file: z.string()` |
| `rotate_video` | Rotate 90/180/270 degrees. | `z.object({ file: z.string()` |
| `extract_audio` | Pull the audio track out of a video as mp3. | `z.object({ file: z.string()` |
| `split_video` | Split into N equal parts, or at explicit time marks (seconds). | `z.object({ file: z.string()` |
| `add_captions` | Burn captions onto a video (from text or an existing .srt). | `z.object({ file: z.string()` |
| `add_music` | Add a free background music track under a video (auto-ducked). | `z.object({ file: z.string()` |
| `add_audio_track` | Mux a user-supplied audio (voiceover/narration) onto a video. | `z.object({ file: z.string()` |
| `localize_video` | Produce translated subtitle sidecars (es/fr/hi/ta/...). Reuses free-model translation, offline-safe. | `z.object({ file: z.string().optional()` |
| `grade_video` | Apply a cinematic color grade (cinematic/vivid/neon/teal-orange/bleach-bypass/warm/cool/neutral). | `z.object({ file: z.string()` |
| `slow_motion` | Slow the whole clip by a factor (2 = half speed). | `z.object({ file: z.string()` |
| `speed_ramp` | Slow a middle window of the clip, normal elsewhere. | `z.object({ file: z.string()` |
| `add_watermark` | Burn a corner watermark/logo text onto a video. | `z.object({ file: z.string()` |
| `add_lower_third` | Burn a lower-third name/title bar. | `z.object({ file: z.string()` |
| `add_progress_bar` | Burn a progress bar at the bottom of a video. | `z.object({ file: z.string()` |
| `derive_outputs` | Produce 9:16 / 16:9 / 1:1 versions + thumbnail from an existing video. | `z.object({ file: z.string()` |
| `make_voiceover` | Generate an mp3 voiceover from text using Edge-TTS (free). | `z.object({ text: z.string().min(1)` |
| `download_image` | Fetch a free CC image for a keyword. | `z.object({ keyword: z.string().min(1)` |
| `download_video` | Fetch a free CC video for a keyword. | `z.object({ keyword: z.string().min(1)` |
| `remove_silence` | Cut silent gaps from a video/audio using ffmpeg silencedetect (free, CPU-only). | `z.object({ file: z.string()` |
| `detect_scenes` | Detect scene cuts / build chapters from a video (free, CPU-only). | `z.object({ file: z.string()` |
| `auto_reframe` | Crop/reframe to a target aspect (9:16 / 1:1 / 16:9) focusing on the active region (free, CPU-only). | `z.object({ file: z.string()` |
| `reduce_noise` | Light denoise / smoothing for audio+video (free, CPU-only). | `z.object({ file: z.string()` |
| `apply_brand_kit` | Burn-in a brand kit (logo + color + name/handle) onto a video (free, CPU-only). | `z.object({ file: z.string()` |

---

**Maintaining this doc:** run `npx tsx scripts/gen-mcp-doc.mjs` after every change to `src/adapters/mcp/register-*.ts`. CI mode (`--check`) exits non-zero if the doc is out of date.
