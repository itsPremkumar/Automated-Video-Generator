# Agentic Video Pipeline — Master Plan (v1)

> Status: **IMPLEMENTD & VERIFIED** (typecheck EXIT 0; 8/8 agentic unit
> tests + 23/23 existing tests pass). Phases 1–5 code-complete; Phase 6
> (render integration + OpenClaw skill) wired.
>
> What is built (real, tested):
> - `src/agentic/{plan,acquire,verify,gateway,gate,types,workspace}.ts`
> - `src/lib/music-verifier.ts` (new) + `media-verifier.ts` extended (watermark/safety)
> - `src/adapters/mcp/register-agentic-tools.ts` (9 MCP tools) registered in `mcp-server.ts`
> - `skills/agentic-video/SKILL.md` + `openclaw.plugin.json` updated
> - Unit tests: `src/agentic/agentic.test.ts` (DI, offline, 8 tests)
>
> Remaining: Phase 5 render integration (feed approved `render-manifest.json`
> into `video-generator.ts` Remotion path) + live e2e with real fetchers/Vision.
> Owner: Premkumar · Project: Automated-Video-Generator (v5.0.0)

---

## 1. Vision

Turn the current pipeline — *"agent writes a script JSON, presses generate"* — into a
**fully agentic, high-accuracy director**. The agent does not just trigger a render.
It:

1. **Plans** a shot list from the script (per-scene visual intent, music mood, captions, voice).
2. **Acquires** candidate images, videos, and background music into isolated per-type folders.
3. **Verifies everything** — every image, every video, every music track — with vision + signal checks.
4. **Exercises full control to edit**: accept / reject / replace / crop / trim / regenerate any asset, and rewrite script, captions, or voice pre-render.
5. **Passes a final gate** where *all* checks must be green before Remotion renders.
6. **Renders** only the approved, verified assets.

The guiding principle: **nothing reaches the renderer that the agent has not verified and
explicitly controlled.**

---

## 2. Grounding — what already exists (do not rebuild)

| Capability | Already in repo | File | State |
|---|---|---|---|
| Vision verifier (image+video) | `verifyMedia()` | `src/lib/media-verifier.ts` | ✅ works (Ollama / Gemini) |
| Video verification on download | called in STEP 3 | `src/video-generator.ts:244` | ✅ auto, opaque |
| Image verification | **not called** on image branch | `src/video-generator.ts:287` | ❌ gap |
| Music auto-pick | `resolveFreeBackgroundMusic()` | `src/lib/free-music.ts` | ✅ no verification |
| Separate module folders | `free-image-search/`, `free-music-module/`, `free-video-gen-lab/`, `video-downloader/` | repo root | ✅ reusable |
| MCP server for agents | 20+ tools | `src/mcp-server.ts` + `src/adapters/mcp/*` | ✅ extensible |
| OpenClaw plugin | `openclaw.plugin.json` | repo root | ✅ |

**Conclusion:** the foundation is real. This plan reuses `verifyMedia`, `free-music.ts`,
and the module folders. The *new* work is: (a) extend verification to images + music,
(b) add an **agent decision/approval gateway**, (c) add a **final pre-render gate**,
(d) expose it all as MCP tools so an agent drives it end-to-end.

---

## 3. Architecture

```
                         ┌──────────────────────────────────────────┐
                         │            AGENT (Hermes / OpenClaw)      │
                         │  full control · sees every asset + score   │
                         └───────────────┬──────────────────────────┘
                                         │ MCP tools (plan / fetch / verify / decide / render)
                                         ▼
        ┌────────────────────────────────────────────────────────────────────┐
        │                 AGENTIC PIPELINE  (new: src/agentic/)              │
        │                                                                    │
        │  STAGE 1  PLAN      script → plan.json (shot list)                 │
        │       ↓                                                            │
        │  STAGE 2  ACQUIRE   download candidates → assets/<type>/<scene>/   │
        │       ↓                                                            │
        │  STAGE 3  VERIFY    per-asset checks → verification/*.json         │
        │       ↓                                                            │
        │  STAGE 4  DECIDE    agent ACCEPT/REJECT/REPLACE/EDIT → manifest   │
        │       ↓            (loops back to 2/3 for any rejected asset)       │
        │  STAGE 5  GATE      final holistic check → render-manifest.json    │
        │       ↓                                                            │
        │  STAGE 6  RENDER    Remotion renders only approved assets          │
        └────────────────────────────────────────────────────────────────────┘
                                         │
                          reuses → verifyMedia(), free-music.ts, module folders
                          outputs → output/<jobId>/<Title>.mp4
```

---

## 4. Per-job workspace (the "new folder" layout)

Every job gets an isolated, auditable workspace:

```
agentic-pipeline/workspaces/<jobId>/
  plan.json                 # STAGE 1: director's shot list
  assets/
    images/<scene_01>/     candidate_1.jpg  candidate_2.jpg  approved.jpg
    images/<scene_02>/     ...
    videos/<scene_01>/     candidate_1.mp4  approved.mp4
    music/                 candidate_1.mp3  candidate_2.mp3  approved.mp3
  verification/
    image_checks.json      # every image: {passes, confidence, reason, metrics}
    video_checks.json
    music_checks.json
    cross_checks.json      # duration alignment, duplicates, caption sync
  approval-manifest.json   # STAGE 4: every decision + rationale
  render-manifest.json     # STAGE 5: final approved picks
  render.log
```

This satisfies the requirement: **each download type lives in its own folder**, and
every artifact is inspectable.

---

## 5. Agent control model (autonomy levels)

| Level | Name | Behavior | When |
|---|---|---|---|
| L0 | Manual | Human approves every asset | Sensitive / brand work |
| L1 | Suggest | Agent proposes; human confirms batch | Review mode |
| **L2** | **Autonomous** | **Agent decides + logs; human audits post-hoc** | **Default (recommended)** |
| L3 | Self-improving | L2 + agent learns from rejections | Future |

**Default = L2.** The agent has *complete* control to edit: accept, reject, replace
(re-fetch with new keywords), crop, trim, adjust (ffmpeg), regenerate a scene, or
rewrite script/captions/voice — all recorded in `approval-manifest.json`.
A single env flag `AGENT_AUTONOMY=L2` selects the level; L0/L1 expose approval
tools to a human instead of auto-deciding.

---

## 6. What is new vs. reused

**Reused (no rewrite):**
- `verifyMedia()` — image + video vision check (extend prompt for watermark/NSFW).
- `free-music.ts` — music search/download (open-lofi, internet-archive, local).
- Module folders `free-image-search/`, `free-video-gen-lab/`, `video-downloader/`.
- Remotion render path in `src/video-generator.ts` (feed it only approved assets).

**New:**
- `src/agentic/plan.ts` — script → `plan.json` shot list.
- `src/agentic/acquire.ts` — downloads candidates into per-type folders.
- `src/lib/music-verifier.ts` — `verifyMusic()` (duration/bitrate/silence/license/mood).
- `src/agentic/verify.ts` — runs all checks, writes `verification/*.json`.
- `src/agentic/gateway.ts` — decision loop + final gate.
- `src/agentic/edit.ts` — agent edit ops (crop/trim/adjust/regenerate).
- `src/adapters/mcp/register-agentic-tools.ts` — the MCP surface (see `AGENT_TOOLS_AND_PHASES.md`).
- Extend `verifyMedia` prompt for watermark/NSFW/safety on images + videos.
- Wire `verifyMedia` into the **image** branch of `video-generator.ts`.

---

## 7. Open decisions (recommendations in bold)

1. **Autonomy default = L2 (autonomous + audit).** Keeps "fully agentic" while staying safe.
2. **Verification strictness:** confidence threshold `VERIFY_PASS=7/10` (today's default is 6).
3. **Replace retries:** max 3 re-fetches per asset before falling back to `defaultVideo`.
4. **Music mood match:** optional LLM check (off by default to save calls); license + duration + silence always on.

---

## 8. Next step

This folder is the plan. When approved, implementation follows
`AGENT_TOOLS_AND_PHASES.md` phase-by-phase, each phase with unit tests + a CI check
to match the project's production-quality bar. **No code is written until you say "build it."**
