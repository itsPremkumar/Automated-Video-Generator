# 🎬 AVS Prompt Library

Agent system prompts for the **Automated-Video-Generator** pipeline.
Each is a self-contained, codebase-verified prompt for a specific production role.

## 📂 File Index (Workflow Order)

| # | File | Role | Use Case |
|---|------|------|----------|
| 01 | `01-system-prompt-master.txt` | **AI Video Editor** — full system prompt with strict execution laws, 9-phase workflow, JSON field reference | Give to any AI agent to autonomously produce videos end-to-end |
| 02 | `02-script-writing.txt` | **Scriptwriter** — hook/body/CTA structure, 17 inline tag types, video-type templates, pacing guidelines | Writing production-ready scripts with visual scene tags |
| 03 | `03-asset-acquisition.txt` | **Media Acquisition Specialist** — Pexels/Openverse/Pixabay sourcing, 5 acquisition methods, asset verification | Finding and verifying free stock media assets |
| 04 | `04-image-processing.txt` | **Graphic Designer** — 25 image CLI commands (convert, resize, crop, text, emoji, watermark, to-video, slideshow) | Transforming still images into video-ready assets |
| 05 | `05-audio-production.txt` | **Audio Engineer** — voiceover generation (edge-tts), 8 audio editing commands, multi-language tracks | Voiceover, music, and SFX production |
| 06 | `06-video-editing.txt` | **Video Editor** — 19 editor CLI commands (trim, speed, merge, overlay-text, blur, concat-scene) | Post-production editing of video clips |
| 07 | `07-end-to-end-production.txt` | **Production Orchestrator** — quick-start commands, per-stage reference table, error recovery guide | Running complete multi-phase video production |
| 08 | `08-batch-production.txt` | **Batch Manager** — wave scheduling, parallel jobs, job generation, preview mode, output structure | Orchestrating multi-video batch runs |
| 09 | `09-pipeline-configuration.txt` | **Configuration Specialist** — all 35+ JSON fields, 7 video-type templates, aiVerify setup, env vars | Customizing every aspect of the pipeline |
| 10 | `10-quality-assurance.txt` | **QA Engineer** — 5-level verification ladder (file→signal→frame→audio→AI), failure response procedures | Verifying output videos before delivery |
| 11 | `11-troubleshooting.txt` | **Diagnostic Engineer** — 11 failure patterns with fixes, diagnostic commands, escalation path | Debugging pipeline failures |

## 🔢 Numbering Convention

Files are numbered in **logical workflow order** — follow the sequence when running a full production:

```
Plan → Acquire → Process → Voice → Edit → Batch → Configure → QA → Deploy
 01      03        04        05     06      08        09        10       07
 (02 = Script Writing — done before acquisition)
 (11 = Troubleshooting — reactive, done after failure)
```

## ✅ Verification

Every prompt in this folder has been **cross-referenced against the actual source code**:
- All npm scripts verified against `package.json` (32 checked)
- All CLI commands verified against source files (`agentic-editor.ts`, `agentic-audio.ts`, `agentic-image.ts`, `agentic-batch.ts`)
- All config fields verified against `src/agentic/config.ts` (`AgenticConfig` interface)
- All transitions, grades, caption themes, and video types verified against type definitions
- All media providers verified against `src/lib/visual-fetcher/search.ts`

## 📝 Usage

Pass any prompt file to an AI agent as a **system prompt** to give it that role.
Combine multiple prompts for multi-agent workflows (e.g., scriptwriter → acquisition → editor → QA).
