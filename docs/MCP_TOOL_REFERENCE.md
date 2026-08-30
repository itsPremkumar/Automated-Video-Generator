# MCP Tool Reference — Automated Video Generator v1.2.0

> **Auto-generated reference for MCP clients** (Claude Desktop, Claude Code, OpenClaw, Hermes Agent, any MCP 1.0+ host).
>
> The MCP server (`bin/mcp.js` / `src/mcp-server.ts`) registers **7 tool families** covering
> the full video pipeline. Every tool name is `snake_case`; every input uses a Zod schema
> validated by the server before the underlying handler runs. All tools that mutate state
> call `assertSafeMutationAllowed('mcp', <op>)` — disabling that gate blocks writes.

## Quick orientation

| Family | File | Purpose | # tools |
|---|---|---|---|
| **Admin** | `register-admin-tools.ts` | System / config / diagnostics | 7 |
| **Input** | `register-input-tools.ts` | Scripts + local asset upload | 5 |
| **Job** | `register-job-tools.ts` | Generate / monitor / batch | 4 |
| **Output** | `register-output-tools.ts` | List / read / delete outputs | 3 |
| **Free video** | `register-free-video-tools.ts` | Search + download CC video | 2 |
| **Agentic** | `register-agentic-tools.ts` | Hermes-driven plan→acquire→gate→render | 13 |
| **Operations** | `register-operations-tools.ts` | Single-task video edits (merge, trim, …) | 24 |

**Total tools exposed:** 58.

---

## 1. Admin (`register-admin-tools.ts`)

| Tool | Title | Inputs |
|---|---|---|
| `read_env_config` | Read Env Config | `{ showSecrets?: boolean = false }` |
| `update_env_config` | Update Env Config | `{ key: string, value: string }` — gated |
| `get_system_info` | Get System Info | `{}` |
| `health_check` | Health Check | `{}` |
| `get_workspace_paths` | Get Workspace Paths | `{}` |
| `list_public_files` | List Public Files | `{ subdir?: string }` |
| `list_voices` | List TTS Voices | `{}` (returns 8 curated Edge-TTS voices) |
| `list_local_assets` | List Local Assets | `{}` (files under `input/visuals/`) |

---

## 2. Input (`register-input-tools.ts`)

| Tool | Title | Inputs |
|---|---|---|
| `write_input_script` | Write Input Script | `videoScriptSchema` (id, title, scenes, …) |
| `read_input_script` | Read Input Scripts | `{}` |
| `delete_input_script` | Delete Input Script | `{ id: string }` — gated |
| `validate_input_script` | Validate Script Format | `videoScriptSchema` |
| `upload_asset` | Upload Asset | `{ filename: string, base64Data: string }` ≤50MB |
| `delete_asset` | Delete Asset | `{ filename: string }` — gated |

---

## 3. Job (`register-job-tools.ts`)

| Tool | Title | Inputs |
|---|---|---|
| `generate_video` | Generate Video | `pipelineJobRequestSchema` + `{ id?, publicId?, skipReview=true }` |
| `get_video_status` | Get Video Status | `{ jobId: string }` |
| `run_pipeline_command` | Run Pipeline Command | `{ command: string, args?: string[] }` (whitelisted scripts only) — gated |
| `list_jobs` | List Jobs | `{}` |
| `get_batch_status` | Get Batch Status | `{}` (reads `output/batch-manifest.json`) |

`run_pipeline_command` only accepts commands in the allowlist (`generate`, `resume`, `segment`,
 `batch`, `remotion:render`, `agentic`, `agentic:plan`, `agentic:visuals`, `agentic:voice`,
 `agentic:render`, `agentic:post`). Anything else returns an error before spawn.

---

## 4. Output (`register-output-tools.ts`)

| Tool | Title | Inputs |
|---|---|---|
| `list_output_videos` | List Output Videos | `{}` |
| `read_output_file` | Read Output File | `{ videoId: string, filename?: string }` |
| `delete_output` | Delete Output | `{ videoId: string }` — gated |

---

## 5. Free Video (`register-free-video-tools.ts`)

| Tool | Title | Inputs |
|---|---|---|
| `search_free_video` | Search Free Video | `{ keyword, count?=5, source?='all'\|'wikimedia'\|'archive', maxDuration?, minResolution?, sortBy?='relevance'\|'newest'\|'resolution' }` |
| `download_free_video` | Download Free Video | `{ url, title, creator?, license?='CC', format?='mp4' }` |

No API key required; CC-licensed only.

---

## 6. Agentic — Hermes-driven pipeline (`register-agentic-tools.ts`)

The agentic family lets an MCP client run the entire `plan → acquire → verify → decide → render`
cycle with full control over each stage. State is held in-memory per `jobId`.

| Tool | Stage | Inputs |
|---|---|---|
| `agentic_plan` | STAGE 1 | `{ jobId, title, script (≥10 chars), orientation?='portrait'\|'landscape', voice?, musicQuery? }` |
| `agentic_acquire` | STAGE 2 | `{ jobId, candidatesPerAsset? =2 }` |
| `agentic_verify_all` | STAGE 3 | `{ jobId }` |
| `list_pending_assets` | review | `{ jobId }` — table of all candidates + verification scores |
| `get_asset_preview` | review | `{ jobId, assetId }` — returns base64 image/video (MIME from extension) |
| `approve_asset` | decide | `{ jobId, assetId, rationale? }` |
| `reject_asset` | decide | `{ jobId, assetId, rationale? }` |
| `agentic_gate` | STAGE 5 | `{ jobId }` — final holistic gate X1–X6 |
| `agentic_render` | STAGE 6 | `{ jobId }` — renders after gate passes |
| `agentic_run` | one-shot | `{ topic (≥5 chars), title, backend?='agent'\|'vision', orientation?, voice?, candidatesPerAsset?=2 }` |
| `agentic_revise` | feedback | `{ jobId, notes (≥3 chars), hints?: [{scope, scene?, detail}], autoCritique? }` |
| `agentic_critique` | QA | `{ jobId, mp4Path? }` — Director's Critique report |

**Backend selection:**
- `backend: 'agent'` → fully offline, Hermes / AgentBrain decides every asset
- `backend: 'vision'` → opt-in AI vision verification (Ollama moondream or Gemini)

**Asset IDs** use the format `<kind>_s<sceneIdx>_c<candidateIdx>` (e.g. `image_s0_c1`).

---

## 7. Operations — single-task tool layer (`register-operations-tools.ts`)

Each tool does exactly one thing. They wrap the project's `src/agentic/operations/*.ts`
single-task modules.

| Tool | Title | Inputs |
|---|---|---|
| `do_task` | Natural-language router | `{ prompt, files?, out?, voice?, orientation? }` (supports chains like "crop to 9:16 then add music") |
| `merge_videos` | Merge Videos | `{ files: string[] ≥2, out?, orientation?='portrait' }` |
| `trim_video` | Trim Video | `{ file, out?, start?=0, end? }` |
| `crop_video` | Crop Video | `{ file, out?, preset?='9:16'\|'16:9'\|'1:1' }` |
| `resize_video` | Resize Video | `{ file, out?, w?=720, h?=-2 }` |
| `rotate_video` | Rotate Video | `{ file, out?, deg?='90'\|'180'\|'270' }` |
| `extract_audio` | Extract Audio | `{ file, out? }` → mp3 |
| `split_video` | Split Video | `{ file, parts?, marks?: number[], out? }` |
| `add_captions` | Add Captions | `{ file, text?, srt?, out? }` (burn-in from text or SRT) |
| `add_music` | Add Music | `{ file, query?='ambient lofi', out? }` (free CC track, auto-ducked) |
| `add_audio_track` | Add Audio Track | `{ file, audio, volume?=1.0, out? }` |
| `localize_video` | Localize Video | `{ file?, text?, languages: string[], outDir? }` (es/fr/hi/ta/...) |
| `grade_video` | Grade Video | `{ file, preset?='cinematic'\|'vivid'\|'neon'\|'teal-orange'\|'bleach-bypass'\|'warm'\|'cool'\|'neutral', out? }` |
| `slow_motion` | Slow Motion | `{ file, factor?=2, out? }` |
| `speed_ramp` | Speed Ramp | `{ file, rampStart?=1, rampEnd?=3, slowFactor?=3, out? }` |
| `add_watermark` | Add Watermark | `{ file, label?='MyBrand', out? }` |
| `add_lower_third` | Add Lower-Third | `{ file, text?='Title', out? }` |
| `add_progress_bar` | Add Progress Bar | `{ file, out? }` |
| `derive_outputs` | Derive Multi-Aspect + Thumbnail | `{ file, aspects?=['9:16','16:9','1:1'], thumbnail?=true, outDir? }` |
| `make_voiceover` | Make Voiceover | `{ text (≥1 char), voice?, out? }` (Edge-TTS, free) |
| `download_image` | Download Image by Keyword | `{ keyword (≥1), out? }` |
| `download_video` | Download Video by Keyword | `{ keyword (≥1), out? }` |
| `remove_silence` | Remove Silence | `{ file, out?, noise?=-35, minDur?=0.5 }` |
| `detect_scenes` | Detect Scenes | `{ file, out? }` (chapter markers via ffmpeg) |
| `auto_reframe` | Auto Reframe | `{ file, out?, preset?='9:16'\|'1:1'\|'16:9' }` (active-region crop) |
| `reduce_noise` | Reduce Noise | `{ file, out?, audio?='off'\|'light'\|'medium'\|'heavy', video?=0 }` |
| `apply_brand_kit` | Apply Brand Kit | `{ file, out?, logo?, color?='#101010', name? }` |

---

## Response format

Every tool returns a content array. **Text tools** (the common case) return:

```ts
{ content: [{ type: 'text', text: 'Human-readable summary…' }] }
```

**Image tools** (`get_asset_preview`) return:

```ts
{ content: [{ type: 'image', data: '<base64>', mimeType: 'image/jpeg' | 'video/mp4' | … }] }
```

Successful text responses start with the operation verb (`->`, `Done`, `Listed`, `…`);
**error responses are wrapped with an `errorResponse` and surface as MCP tool errors**
that the client should treat as failures (they do NOT throw, per MCP semantics).

---

## Gating & safety

- All `update_env_config`, `delete_*`, `run_pipeline_command` tools check
  `assertSafeMutationAllowed('mcp', <op>)`. The gate can be locked globally by setting
  `HERMES_MUTATIONS_DISABLED=1` in `.env` — every gated tool then returns an error
  before the handler runs.
- `upload_asset` rejects payloads > 50 MB.
- `run_pipeline_command` rejects any command outside the explicit allowlist (no shell
  injection surface; `command` is matched as a literal string).
- All file paths returned by tools are absolute paths the host can resolve directly.

## Identity preservation

The MCP server boots from the project root (`process.cwd()` is anchored to the repo before
the server starts). Every tool reads/writes files under that anchored root only — there is
no path-traversal surface. See `docs/MCP_TOOL_REFERENCE.md` (this file) for the canonical
contract; the source of truth is `src/mcp-server.ts` + the seven `register-*-tools.ts`
files.

## Server lifecycle

```bash
# one-shot stdio server (use from any MCP client config)
npx tsx src/mcp-server.ts
# or
npm run mcp
```

The server reports its version on stderr at boot:

```
[MCP] Automated Video Generator server (v1.2.0) is running from /path/to/project.
```

---

**Maintaining this doc:** when you add or rename a tool, update the corresponding
`register-*-tools.ts` table here in the same commit. The doc is the canonical contract
that OpenClaw, Claude, and Hermes consumers read — keep it in lockstep with the source.