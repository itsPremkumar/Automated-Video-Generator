# Claude MCP Setup And Latest Process

This document explains the current Claude/Desktop/Claude Code integration for the latest version of the Automated Video Generator.

It covers:
- how to connect Claude to the MCP server
- the current end-to-end generation process
- the latest folder layout
- the live tool, resource, and prompt surface
- the important current limitations

## Overview

The project now supports two main entry points that share the same pipeline:

- CLI: `npm run generate`
- MCP for Claude Desktop / Claude Code: `npx automated-video-generator` (or `npx -y tsx src/mcp-server.ts` for local development)

Both paths ultimately use the same generation and rendering flow:

1. Parse the script into scenes.
2. Fetch or reuse visuals.
3. Generate voiceovers.
4. Save `scene-data.json`.
5. Render segmented scene videos with Remotion.
6. Concatenate the segments into the final MP4 with FFmpeg.

The MCP path adds:
- async job tracking in `.mcp-jobs.json`
- per-job asset workspaces under `public/jobs/<outputId>/`
- Claude-readable resources for `input`, `output`, `public`, and config state

## Latest End-To-End Process

### 1. Request Entry

Claude calls the `generate_video` MCP tool with:
- `id` optional stable output ID
- `title`
- `script`
- `orientation`
- `voice`
- `showText`
- `defaultVideo`

The MCP server creates:
- a job ID in `.mcp-jobs.json`
- an output folder under `output/<outputId>/`
- a public asset namespace under `public/jobs/<outputId>/`

### 2. Script Parsing

The parser:
- breaks narration into scenes
- extracts `[Visual: ...]` tags
- supports local assets from `input/input-assests/`
- merges standalone `[Visual: ...]` lines into the following narration scene

This matters for Claude-generated scripts, because agents often place `[Visual: ...]` tags on their own lines.

### 3. Visual Fetching And Caching

For each scene the pipeline:
- searches Pexels first
- falls back to Pixabay video if needed
- falls back to images if video is unavailable or rejected
- caches the chosen visual in `.video-cache.json`

When a remote video is downloaded, the pipeline now computes conservative metadata:
- `videoDuration`
- `videoTrimAfterFrames`

This is used to avoid Remotion seeking into the unsafe tail end of stock clips.

### 4. Per-Job Workspace Layout

Each MCP run gets isolated assets here:

```text
public/
  jobs/
    <outputId>/
      audio/
      videos/
      visuals/
```

This prevents one Claude job from overwriting another Claude job's temporary media.

### 5. Voice Generation

Voiceovers are generated scene-by-scene into:

```text
public/jobs/<outputId>/audio/
```

The generator now tolerates truly silent scenes instead of treating them as hard failures.

### 6. Scene Data Save

The pipeline writes:

```text
output/<outputId>/scene-data.json
```

This file is the source of truth for rendering. It contains:
- resolved scene durations
- selected visuals
- audio paths
- title
- orientation
- `assetNamespace`

### 7. Segmented Remotion Rendering

Rendering uses the `SingleScene` Remotion composition scene-by-scene.

Important current behavior:
- local video scenes use `trimAfter`
- short videos are looped only across the safe usable range
- remote images are rendered directly
- missing local media falls back to gradients or image/video fallback logic

This is the key change that fixed the old `No frame found at position X` failures.

### 8. Final Concatenation

After all scene segments are rendered:
- FFmpeg concatenates them
- if lossless concat fails, the pipeline retries with re-encode

The final output is saved to:

```text
output/<outputId>/<title>.mp4
```

### 9. Cleanup And Persistence

On successful completion:
- segment files are removed
- the job-specific temporary public workspace may be cleaned

Persistent state remains in:
- `output/<outputId>/`
- `.mcp-jobs.json`
- `.video-cache.json`

## Current Folder Map

```text
input/
  input-scripts.json
  input-assests/
  INPUT_FORMAT.md

output/
  <outputId>/
    scene-data.json
    thumbnail.jpg
    <final-video>.mp4

public/
  jobs/
    <outputId>/
      audio/
      videos/
      visuals/

.mcp-jobs.json
.video-cache.json
```

## Current MCP Resources

The latest server exposes these resources:

- `project://overview`
- `input://scripts`
- `input://assets`
- `input://format`
- `output://videos`
- `output://video/{id}`
- `public://tree`
- `config://env`
- `config://pipeline`

Use resources when Claude needs project context without mutating anything.

## Current MCP Tools

The current server exposes these tools:

### Input Tools
- `write_input_script`
- `read_input_script`
- `delete_input_script`
- `validate_input_script`

### Output Tools
- `list_output_videos`
- `read_output_file`
- `delete_output`

### Asset Tools
- `upload_asset`
- `delete_asset`

### Pipeline Tools
- `generate_video`
- `get_video_status`
- `run_pipeline_command`

### Environment / Diagnostics Tools
- `read_env_config`
- `update_env_config`
- `get_system_info`
- `health_check`

### Workspace Inspection Tools
- `get_workspace_paths`
- `list_public_files`

## Current MCP Prompts

The latest prompt templates are:

- `create-marketing-video`
- `create-youtube-short`
- `batch-generate`
- `debug-pipeline`

These prompts are convenience templates. The tools and resources above are the authoritative interface.

## Claude Desktop Setup

Open your Claude Desktop MCP config and add a server entry similar to this:

```json
{
  "mcpServers": {
    "automated-video-generator": {
      "command": "npx",
      "args": [
        "-y",
        "automated-video-generator"
      ],
      "env": {
        "PEXELS_API_KEY": "YOUR_API_KEY_HERE"
      }
    }
  }
}
```

Notes:
- Use an absolute path to `src/mcp-server.ts`.
- Keep `cwd` set to the project root.
- Restart Claude Desktop after changing the config.

## Claude Code Setup

Register the MCP server in Claude Code:

```bash
claude mcp add automated-video-generator -- npx -y automated-video-generator
```

After adding it:
- restart Claude Code if needed
- verify the tool list appears
- run a simple `generate_video` request

## Recommended Claude Workflow

For best results, Claude should do this:

1. Read `project://overview` and `input://format`.
2. Optionally inspect `input://assets` if local visuals are needed.
3. Call `generate_video`.
4. Poll with `get_video_status`.
5. Read `output://video/{id}` or `read_output_file` after completion.

## Practical Example

Example request:

```text
Generate a portrait reels video about India with subtitles and an Indian English voice.
```

Claude should translate that into a `generate_video` call with:
- a concise script
- `[Visual: ...]` tags
- `orientation: portrait`
- `showText: true`
- a voice such as `en-IN-PrabhatNeural`

## Verification Commands

Useful local commands:

```bash
npx tsc -p tsconfig.json --noEmit
npm run generate
npm run mcp
```

## Current Known Limitations

These are important and current:

- There is no hard `durationSeconds` parameter in `generate_video` yet.
  The final video length is still driven by the script and the generated voice durations.
- Smart punctuation from Claude can still show up as mojibake in some saved titles or captions.
  For safest results, use plain ASCII punctuation in titles for now.
- `.mcp-jobs.json` keeps historical failed and successful attempts for debugging.
- The best validation is still a real end-to-end run with the target prompt shape.

## Troubleshooting

### Tools do not appear in Claude

- confirm `npm install` was run
- confirm the MCP config points to the correct absolute path
- restart Claude Desktop or reload Claude Code

### Video generation starts but does not finish

- check `.mcp-jobs.json`
- inspect `output/<outputId>/scene-data.json`
- inspect `public/jobs/<outputId>/`
- run `health_check`
- run `get_system_info`

### Old Remotion `No frame found at position X` errors

This was the main historical failure mode for short stock clips.

The current pipeline mitigates this by:
- storing conservative clip metadata
- trimming video playback before risky tail frames
- looping only the safe usable range

### Output path confusion

Use:
- `get_video_status`
- `read_output_file`
- `get_workspace_paths`

to understand exactly where the current job wrote files.

## Summary

The latest Claude integration is no longer just a thin wrapper around `npm run generate`.

It is now a structured MCP workflow with:
- async job tracking
- per-job public workspaces
- Claude-readable resources
- segmented rendering
- safer stock clip handling
- output folders that map cleanly to each Claude request

For top-level project documentation, see [README.md](README.md).
