# One-Shot Autonomous Video Generation

> **One topic → one video, fully autonomous.**

`npm run onetake -- --topic "How volcanoes shape the Earth"` runs the entire pipeline:

```
Research → Script → Style → Plan → Acquire → Render → Critique → Self-fix → Publish
```

## Quick start

```bash
# Basic: one command, one video
npm run onetake -- --topic "How volcanoes shape the Earth" --orientation landscape

# With options
npm run onetake -- --topic "AI tools for creators" \
  --orientation portrait \
  --self-fix-attempts 3 \
  --force-grade cinematic \
  --title "Top AI Tools 2026"

# Review gate (pause before publish)
npm run onetake -- --topic "Cooking pasta" --review-gate

# Skip auto-publish
npm run onetake -- --topic "My hobby" --no-publish
```

## CLI flags

| Flag | Description | Default |
|---|---|---|
| `--topic`, `-t` | **Required.** The video topic | — |
| `--title` | Override auto-generated title | topic |
| `--orientation`, `-o` | `portrait` / `landscape` / `square` | portrait |
| `--voice` | Edge-TTS voice ID | en-US-AriaNeural |
| `--musicquery`, `--music` | Background music query | ambient lofi |
| `--backend` | `agent` or `vision` | agent |
| `--selffixattempts`, `-s` | Max self-fix retries after failed QA | 3 |
| `--forcegrade`, `--grade` | Force grade (cinematic/vivid/warm/cool/neutral/sunset/cyberpunk/noir) | auto |
| `--reviewgate`, `--review` | Pause before publish for human approval | false |
| `--publish`, `-p` | Auto-publish if upload-post is configured | true |
| `--nopublish` | Skip auto-publish | — |

## What happens under the hood

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        ONETAKE PIPELINE                                  │
│                                                                         │
│  1. RESEARCH                                                            │
│     └─ web_search("How volcanoes shape the Earth")                      │
│        → extract 3-5 key facts (URL, title, snippet, source)            │
│        → if offline, mark metadata and fall back to LLM-only            │
│                                                                         │
│  2. STYLE INTENT                                                        │
│     └─ pickStyleIntent(topic, facts, orientation)                       │
│        → ONE grade, ONE transition, ONE caption theme                   │
│        → orientation → kinetic (portrait=on, landscape=off)             │
│        → emits rationale for logging                                    │
│                                                                         │
│  3. SCRIPT                                                              │
│     └─ buildScript(topic, facts, offline)                               │
│        → hook (cited fact) → build (3 facts) → CTA                      │
│        → injected as [Grade: ...] [Transition: ...] tags                │
│                                                                         │
│  4. PIPELINE (reuses runAgenticPipeline)                                │
│     └─ plan → acquire → voiceover → render → gate                      │
│                                                                         │
│  5. CRITIQUE                                                            │
│     └─ critiqueRender(mp4)                                              │
│        → blackdetect (no black frames)                                  │
│        → freezedetect (no freeze frames)                                │
│        → astats (audio RMS not silent)                                  │
│        → cropdetect (correct aspect ratio)                              │
│                                                                         │
│  6. SELF-FIX LOOP (if critique failed)                                  │
│     └─ decideFix(verdict) → applyFix(request) → re-render              │
│        → up to N attempts (default 3)                                   │
│        → reuses workspace (no re-fetch of media)                        │
│                                                                         │
│  7. PUBLISH (if UPLOAD_POST_ENABLED=true)                               │
│     └─ uploadToAllPlatforms(mp4, title, description, hashtags)          │
│        → writes publish-manifest.json per job                           │
│        → failures never throw — MP4 still delivered                     │
│                                                                         │
│  8. RESULT                                                              │
│     └─ output/<jobId>/onetake-log.json (structured decisions + timing)  │
│     └─ output/<jobId>/<title>.mp4                                       │
│     └─ output/<jobId>/<title>.srt / .vtt / _metadata.txt                │
└─────────────────────────────────────────────────────────────────────────┘
```

## MCP tool

Exposed as `onetake_run` — the same contract as `agentic_run` with extra fields:

```json
{
  "topic": "How volcanoes shape the Earth",
  "title": "Volcano Power",
  "orientation": "landscape",
  "voice": "en-US-AriaNeural",
  "musicQuery": "ambient lofi",
  "backend": "agent",
  "selfFixAttempts": 3,
  "reviewGate": false,
  "maxResearchResults": 5,
  "forceGrade": "cinematic",
  "autoPublish": true
}
```

## QA gates

| Gate | Filter | Pass criteria |
|---|---|---|
| `blackdetect` | `blackdetect=d=0.1:pix_th=0.05` | < 10% black frames |
| `freezedetect` | `freezedetect=n=0.003:d=2` | Longest freeze < 2s |
| `astats` | `astats=metadata=1:reset=1` | RMS > -50 dBFS (or no audio stream) |
| `cropdetect` | `cropdetect=24:16:0` | Width×height matches orientation |

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Video delivered + critique passed |
| 1 | Video delivered + critique failed (best effort) |
| 2 | Fatal error (see log for detail) |

## File layout

```
src/agentic/onetake/
  index.ts          — exports runOnetake()
  research.ts       — web research + fact extraction
  style.ts          — coherent director's intent picker
  pipeline.ts       — main orchestrator
  critique.ts       — ffmpeg QA gates
  self-fix.ts       — root-cause analysis → targeted re-render
  types.ts          — OnetakeRequest, OnetakeResult, OnetakeProgress
  onetake.test.ts   — 17 tests

bin/
  onetake.ts        — CLI entrypoint

docs/
  ONETAKE.md        — this file
```