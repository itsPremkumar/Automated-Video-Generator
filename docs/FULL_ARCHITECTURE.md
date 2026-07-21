---
title: Full System Architecture — Automated Video Generator
description: Complete architecture, legacy system, agentic pipeline, music system, and all subsystems with data flow.
---

# Full System Architecture

> **Automated Video Generator** — version 5.0.0  
> A multi-runtime, multi-provider video generation system with agentic AI, legacy fallback, and modular music.

---

## 1. System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     RUNTIME ADAPTERS (Entry Points)              │
│                                                                   │
│  ┌─────────┐  ┌──────────┐  ┌───────────┐  ┌────────────────┐  │
│  │  CLI    │  │  HTTP    │  │    MCP    │  │   Desktop App  │  │
│  │ (bin/)  │  │ (server) │  │ (Claude)  │  │  (Electron)    │  │
│  └────┬────┘  └────┬─────┘  └─────┬─────┘  └───────┬────────┘  │
│       │            │              │                 │           │
│       ▼            ▼              ▼                 ▼           │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                APPLICATION CORE (src/)                     │ │
│  │                                                            │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐  │ │
│  │  │  Agentic     │  │   Legacy     │  │   Music        │  │ │
│  │  │  Pipeline    │  │   Pipeline   │  │   System       │  │ │
│  │  └──────┬───────┘  └──────┬───────┘  └───────┬────────┘  │ │
│  │         │                 │                  │           │ │
│  │         ▼                 ▼                  ▼           │ │
│  │  ┌────────────────────────────────────────────────────┐  │ │
│  │  │          SHARED SERVICES LAYER                     │  │ │
│  │  │  free-video  free-image  free-music  voice-engine  │  │ │
│  │  │  media-verifier  ffmpeg  captions  asset-cache...  │  │ │
│  │  └────────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 1.1 Runtime Adapters

| Adapter | Binary | Purpose |
|---------|--------|---------|
| **CLI** | `bin/agentic-run.ts` | One-shot video generation from terminal |
| **CLI (batch)** | `bin/agentic-batch.ts` | Queue multiple video jobs from JSON |
| **CLI (download)** | `bin/agentic-download.ts` | Download assets only, no render |
| **CLI (auto)** | `bin/agentic-auto.ts` | Auto-detect + generate from topic |
| **CLI (driver)** | `bin/driver-run.ts` | LLM-driven video generation with script-first flow |
| **MCP** | `bin/mcp.js` | Model Context Protocol server for Claude Desktop/Code |
| **HTTP** | `src/server.ts` | Web portal + REST API |
| **Desktop** | (Electron wrapper) | Native desktop app |

---

## 2. Video Generation Systems

The project has **three parallel video generation systems**, each designed for different use cases:

```
                        ┌────────────────────────────┐
                        │      VIDEO GENERATION       │
                        │           SYSTEMS            │
                        └────────────────────────────┘
                               │           │
                    ┌──────────▼─┐   ┌─────▼──────────┐
                    │            │   │                │
                    │  AGENTIC   │   │    LEGACY       │
                    │  PIPELINE  │   │  (free-video)   │
                    │  (Phase 5) │   │  (Phase 3/4)    │
                    └──────┬─────┘   └───────┬─────────┘
                           │                 │
                           └──────┬──────────┘
                                  │
                          ┌───────▼────────┐
                          │   RENDERERS    │
                          │  ffmpeg / MCP  │
                          │  Remotion      │
                          └────────────────┘
```

### 2.1 Agentic Pipeline (Primary — `src/agentic/`)

The main production pipeline. AI-driven, fully autonomous.

**6-Stage Flow:**

```
STAGE 1: PLAN ───→ STAGE 2: ACQUIRE ───→ STAGE 3: VERIFY ───→ STAGE 4: DECIDE ───→ STAGE 5: GATE ───→ STAGE 6: RENDER
   │                     │                      │                    │                    │                │
   │ AI writes script    │ Fetches N candidates │ AI verifies each    │ Agent approves     │ X1-X6 checks   │ ffmpeg or
   │ + builds scene plan │ per scene (image/    │ asset is on-topic   │ or rejects per     │ (duration,     │ Remotion
   │                     │ video/music)         │ + valid media       │ candidate          │ assets, etc)   │ compose
   ▼                     ▼                      ▼                    ▼                    ▼                ▼
script + plan          candidates/             verifications/       decisions/          gate report     final MP4
                       acquired files                               approved set        + manifest
```

**Stage Details:**

| Stage | File | What Happens | Output |
|-------|------|-------------|--------|
| **1. Plan** | `src/agentic/pipeline/plan.ts` | AI writes script from topic + title. Scenes get keywords, durations, visual preferences. Pro-edits applied (hook first, variable pacing). | `Plan` (script + scene metadata) |
| **2. Acquire** | `src/agentic/pipeline/acquire.ts` | For each scene, fetches N candidate visuals/images/videos from providers (Pexels, Pixabay, Wikimedia, Openverse, Internet Archive). Music resolved via `MusicEngine`. | `AssetCandidate[]` |
| **3. Verify** | `src/agentic/pipeline/verify.ts` | AI vision model checks each downloaded asset is on-topic and valid media. Confidence score 0-10. | `AssetVerification[]` |
| **4. Decide** | `src/agentic/pipeline/gateway.ts` | Agent approves/rejects each candidate. Falls back to next candidate if rejected. `pending` goes to human. | `AssetDecision[]` |
| **5. Gate** | `src/agentic/pipeline/gate.ts` | 6+ quality gates (X1-X6): duration drift, asset count, missing approvals, runtime cap, license check. Post-render X7-X15 checks. | `GateReport { pass: bool }` |
| **6. Render** | `src/agentic/orchestrator/render.ts` | ffmpeg slideshow composition: images/videos + voiceover + music + captions. Segmented render with scene-level MP4s + concat. | `final.mp4` |

**Key Types:**

```typescript
interface Plan {
    jobId: string;
    title: string;
    orientation: 'portrait' | 'landscape';
    voice: string;
    musicQuery: string;
    scenes: ScenePlan[];
    totalDurationSec: number;
}

interface ScenePlan {
    sceneNumber: number;
    voiceoverText: string;
    searchKeywords: string[];
    visualPreference: 'image' | 'video';
    durationSec: number;
    localAsset?: string;       // from input/visuals/
    personalAudio?: string;    // from input/audio/
}

interface AssetCandidate {
    kind: 'image' | 'video' | 'music';
    sceneIndex: number;
    candidateIndex: number;
    localPath: string;
    url: string;
    source: string;   // 'pexels' | 'pixabay' | 'wikimedia' | etc.
    license?: string;
    keywords: string[];
}

interface AssetDecision {
    decision: 'approved' | 'rejected' | 'pending' | 'fallback';
    rationale: string;
    decidedBy: 'agent' | 'human' | 'system';
}

interface RenderManifest {
    jobId: string;
    title: string;
    orientation: 'portrait' | 'landscape';
    assets: RenderManifestEntry[];  // per-scene: image/video path + audio + captions
    voiceoverDriven: boolean;
    generatedAt: string;
}

interface PipelineResult {
    backend: AgenticBackend;
    plan: Plan;
    workspace: AgenticWorkspace;
    candidates: AssetCandidate[];
    decisions: AssetDecision[];
    gate: { pass: boolean; checks: Array<{ id: string; pass: boolean }> };
    manifest: RenderManifest;
    voiceovers: VoiceoverResult | null;
    fullyAgentDriven: boolean;
    postRender?: PostRenderCheck;
}
```

**AI Backends (configurable):**

| Backend | Type | Key Required | Use Case |
|---------|------|-------------|----------|
| `agent` | LLM (via Ollama/OpenRouter) | No (local) | Full autonomous pipeline |
| `heuristic` | Rule-based | No | Fast, deterministic, no AI needed |
| `driver` | External LLM callback | No | Human-in-the-loop via MCP |

### 2.2 Legacy System (`src/lib/free-video/`)

Pre-agentic system, still functional via backward-compatible shims.

```
┌──────────────────────────────────────────────────────┐
│                 LEGACY SYSTEM (free-video)            │
│                                                        │
│  ┌────────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │  FreeVideo     │  │   Adapter    │  │ Downloader │ │
│  │  Integration   │  │   Layer      │  │            │ │
│  └───────┬────────┘  └──────┬───────┘  └─────┬──────┘ │
│          │                  │                 │        │
│          ▼                  ▼                 ▼        │
│  ┌────────────────────────────────────────────────┐    │
│  │          SHARED MEDIA PROVIDERS                 │    │
│  │  Pexels  Pixabay  Wikimedia  Openverse  IA     │    │
│  └────────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────┘
```

The legacy system is accessed via:
- `src/lib/free-video/` — video acquisition
- `src/lib/free-image/` — image acquisition  
- `src/lib/free-music.ts` — **backward-compatible shim** that routes to the new `src/music-system/` engine
- `src/lib/media-downloader.ts` — parallel multi-platform acquisition (agents + batch)
- `src/lib/visual-fetcher.ts` — original scene-based visual fetch

**Legacy is preserved, not deprecated.** It's used by:
- `bin/agentic-download.ts` — asset-only download
- `src/agentic/pipeline/acquire.ts` — fallback path
- External scripts and integrations

### 2.3 System Comparison

| Aspect | Agentic Pipeline (New) | Legacy System (Old) | MCP (Claude/Agent brokering) |
|--------|----------------------|--------------------|---------------------------|
| **Entry** | `runAgenticPipeline()` | `downloadTopicMedia()` | `agentic.generate` MCP tool |
| **AI** | LLM writes script + verifies | Heuristic/no AI | External (Claude) |
| **Music** | `MusicEngine` (priority 1-99) | `resolveFreeBackgroundMusic()` | Same engine |
| **Voiceover** | Edge-TTS / Voicebox | Edge-TTS | Same |
| **Gates** | 6 pre-render + 9 post-render | None | None |
| **Configurability** | 20+ CLI flags | Simpler options | LLM-decided |
| **Use when** | Full autonomous video | Quick asset grab + render | Claude Desktop integration |

---

## 3. Music System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    MUSIC SYSTEM (src/music-system/)           │
│                                                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐ │
│  │  Engine  │→ │  Cache   │→ │ Registry │→ │  Processing  │ │
│  └────┬─────┘  └──────────┘  └────┬──────┘  └──────┬───────┘ │
│       │                            │                │         │
│       ▼                            ▼                ▼         │
│  ┌──────────────────────────────────────────────────────────┐│
│  │                    PROVIDERS (priority chain)             ││
│  │                                                          ││
│  │  priority 1:  Bundled      (offline, 5 ambient MP3s)     ││
│  │  priority 2:  Local         (offline, input/bgm/*.mp3)    ││
│  │  priority 3:  [reserved]                                   ││
│  │  priority 4:  CcMixter     (online, REAL music, no key)   ││
│  │  priority 6:  InternetArchive (online, public domain)     ││
│  │  priority 99: Procedural   (offline, ffmpeg tones)       ││
│  └──────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### 3.1 Provider Priority Chain

The engine searches providers in priority order (lowest first) and returns the first match:

```
                           ┌─────────────────────┐
  Topic/Mood Query ───────→│   MusicEngine        │
                           │  resolveBackground() │
                           └──────────┬──────────┘
                                      │
                          ┌───────────▼───────────┐
                          │  Try Priority 1:      │
                          │  BundledProvider      │ ←── input/bgm/__bundled__/
                          │  (offline, always)     │     (5 ambient tracks)
                          └───────────┬───────────┘
                                      │ no match?
                          ┌───────────▼───────────┐
                          │  Try Priority 2:      │
                          │  LocalProvider        │ ←── input/bgm/*.mp3
                          │  (offline, user files) │
                          └───────────┬───────────┘
                                      │ no match?
                          ┌───────────▼───────────┐
                          │  Try Priority 4:      │
                          │  CcMixterProvider     │ ←── api.ccmixter.org
                          │  (online, free API)   │     (REAL music, CC licensed)
                          └───────────┬───────────┘
                                      │ no match?
                          ┌───────────▼───────────┐
                          │  Try Priority 6:      │
                          │  InternetArchive      │ ←── archive.org
                          │  (online, public domain│
                          │   metadata-resolved)  │
                          └───────────┬───────────┘
                                      │ no match?
                          ┌───────────▼───────────┐
                          │  Try Priority 99:     │
                          │  ProceduralProvider    │ ←── ffmpeg synthesis
                          │  (offline, always)    │     (pink noise + tones)
                          └───────────┬───────────┘
                                      │
                          ┌───────────▼───────────┐
                          │     CACHE CHECK       │
                          │  workspace/cache/      │
                          │  free-music/           │
                          └───────────┬───────────┘
                                      │
                          ┌───────────▼───────────┐
                          │   PROCESSING PIPELINE  │
                          │  Trim → Fade → Norm   │
                          │  → Loop (optional)    │
                          │  Output: 192k MP3     │
                          └───────────┬───────────┘
                                      │
                          ┌───────────▼───────────┐
                          │  ResolvedMusic {       │
                          │    localPath: string,  │
                          │    track: MusicTrack,  │
                          │    provider: string    │
                          │  }                    │
                          └───────────────────────┘
```

### 3.2 Processing Pipeline

```
Downloaded/Cached File
        │
        ▼
┌───────────────────┐
│  TRIM             │  ─c copy  (stream copy — no re-encode)
│  to target        │  ffmpeg -t {duration} -c copy
│  duration         │
└───────┬───────────┘
        │
┌───────▼───────────┐
│  FADE             │  libmp3lame 192k (re-encode required)
│  intro/outro fade │  afade=t=in + afade=t=out
└───────┬───────────┘
        │
┌───────▼───────────┐
│  NORMALIZE        │  libmp3lame 192k
│  EBU R128         │  loudnorm=I=-23:LRA=7:TP=-2
│  (-23 LUFS)       │
└───────┬───────────┘
        │
┌───────▼───────────┐
│  LOOP (optional)  │  If track < 80% of target
│                   │  concat with self
└───────┬───────────┘
        │
┌───────▼───────────┐
│  FINAL            │  192k MP3 → processed cache
│  Output           │
└───────────────────┘
```

### 3.3 Key Files

| File | Purpose |
|------|---------|
| `src/music-system/engine.ts` | Core orchestrator — resolve, download, process, cache |
| `src/music-system/types.ts` | MusicTrack, MusicQuery, MusicProvider, ProcessingOptions |
| `src/music-system/config.ts` | Env-based configuration |
| `src/music-system/cache.ts` | Disk cache for downloaded + processed files |
| `src/music-system/query.ts` | Topic→MusicQuery builder (mood detection) |
| `src/music-system/events.ts` | Event bus for provider tracking |
| `src/music-system/errors.ts` | Typed error classes |
| `src/music-system/providers/bundled.ts` | Priority 1 — offline bundled MP3s |
| `src/music-system/providers/local.ts` | Priority 2 — user's local MP3s |
| `src/music-system/providers/ccmixter.ts` | Priority 4 — ccMixter API |
| `src/music-system/providers/internet-archive.ts` | Priority 6 — Archive.org |
| `src/music-system/providers/procedural.ts` | Priority 99 — ffmpeg synthesis |
| `src/music-system/providers/base.ts` | BaseMusicProvider, withSignal, probeDuration |
| `src/music-system/providers/registry.ts` | Global provider registry |
| `src/music-system/processing/trim.ts` | Trim to target duration |
| `src/music-system/processing/fade.ts` | Intro/outro audio fade |
| `src/music-system/processing/normalize.ts` | Loudness normalization |
| `src/music-system/processing/looper.ts` | Loop short tracks |

---

## 4. Media Provider Ecosystem

```
┌───────────────────────────────────────────────────────────────┐
│                  MEDIA PROVIDER ECOSYSTEM                     │
│                                                               │
│  ┌──────────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │  IMAGES          │  │  VIDEO        │  │  MUSIC         │  │
│  │                  │  │               │  │                │  │
│  │ ● Pexels (API)   │  │ ● Pexels (API)│  │ ● Bundled      │  │
│  │ ● Pixabay (key)  │  │ ● Pixabay     │  │ ● Local files  │  │
│  │ ● Wikimedia (free)│  │ ● Wikimedia  │  │ ● CcMixter     │  │
│  │ ● Openverse (free)│  │ ● IA (free)  │  │ ● IA           │  │
│  │ ● IA (free)      │  │               │  │ ● Procedural   │  │
│  │ ● NASA (space)   │  │               │  │                │  │
│  │ ● Met (art)      │  │               │  │                │  │
│  └──────────────────┘  └──────────────┘  └────────────────┘  │
│                                                               │
│  Each provider is ISOLATED: failure (429/timeout/DNS) never    │
│  breaks other providers or the pipeline                       │
└───────────────────────────────────────────────────────────────┘
```

### 4.1 Images

| Provider | Key | URL | Config |
|----------|-----|-----|--------|
| **Pexels** | `PEXELS_API_KEY` | api.pexels.com | Primary, high quality |
| **Pixabay** | `PIXABAY_API_KEY` | pixabay.com/api/ | Image/video fallback |
| **Wikimedia** | None | commons.wikimedia.org | CC-licensed, public domain |
| **Openverse** | None | api.openverse.engineering | CC-licensed |
| **Internet Archive** | None | archive.org | Public domain |
| **NASA** | None | images-api.nasa.gov | Space topics only |
| **Met Museum** | None | collectionapi.metmuseum.org | Art topics only |

### 4.2 Videos

| Provider | Key | URL | Notes |
|----------|-----|-----|-------|
| **Pexels** | `PEXELS_API_KEY` | api.pexels.com | **Primary** — reliable, HD |
| **Pixabay** | `PIXABAY_API_KEY` | pixabay.com/api/videos | Fallback |
| **Wikimedia** | None | commons.wikimedia.org | Often archived footage |
| **Internet Archive** | None | archive.org/details | Public domain video |

### 4.3 Music (Detailed)

| Priority | Provider | Type | Key | Latency | Quality |
|----------|----------|------|-----|---------|---------|
| 1 | **Bundled** | offline MP3s | None | 1ms | Good (5 ambient tracks) |
| 2 | **Local** | user files | None | 1ms | User-defined |
| 4 | **CcMixter** | CC-licensed | None | ~11s | Excellent (real music) |
| 6 | **Internet Archive** | Public domain | None | ~3-5s | Variable |
| 99 | **Procedural** | Synthesized | None | ~2s | Functional (pink noise) |

---

## 5. Video Rendering Pipeline

### 5.1 Agentic ffmpeg Render (Default)

```
Manifest (scenes + assets + voiceover + music)
        │
        ▼
┌───────────────────┐
│  Calculate per-   │  Distribute total duration across
│  scene durations  │  scenes based on voiceover audio length.
│  (alignDurations) │  Adjust all to match total runtime.
└───────┬───────────┘
        │
┌───────▼───────────┐
│  For EACH scene:   │  Parallel with bounded concurrency
│                    │
│  ┌───────────────┐ │
│  │  Prepare input │ │  Resize image/video to orientation
│  │  asset        │ │  Scale, pad, loop video if too short
│  └───────┬───────┘ │
│          ▼         │
│  ┌───────────────┐ │
│  │  Compose scene │ │  image/video + voiceover audio
│  │  MP4          │ │  Duration = scene_duration
│  │  + voiceover  │ │  ffmpeg concat with audio stream
│  └───────┬───────┘ │
│          ▼         │
│  ┌───────────────┐ │
│  │  Add captions  │ │  Burn subtitle SRT into frame
│  │  (optional)    │ │  (ass filter for styled text)
│  └───────┬───────┘ │
└──────────┼─────────┘
           │
┌──────────▼──────────┐
│  Concat all scenes  │  ffmpeg concat demuxer
│  = raw video        │  (no re-encode)
└──────────┬──────────┘
           │
┌──────────▼──────────┐
│  Add background     │  MusicEngine resolves track
│  music track        │  Mix: voiceover 70% + music 30%
│  (audio mix)        │  ffmpeg amix filter
└──────────┬──────────┘
           │
┌──────────▼──────────┐
│  Final encode       │  h264 (NVIDIA encoder if available)
│  + metadata         │  + cover art + MP4 metadata
└──────────┬──────────┘
           │
┌──────────▼──────────┐
│  Post-render gates  │  X7-X15: resolution, bitrate,
│  (X7-X15)           │  audio track, duration, black frames,
│                     │  corruption, silent audio
└──────────┬──────────┘
           │
┌──────────▼──────────┐
│  Done: final.mp4    │  output/{job_id}_{title}_final.mp4
└─────────────────────┘
```

### 5.2 Remotion Render (Alternative)

For high-quality renders with React-based composition:

```
Plan → React Components → @remotion/renderer → MP4

Used when:
- Complex animations required
- Programmatic text overlays
- Frame-perfect timing
```

### 5.3 Quality Gates (X-Checks)

**Pre-render (X1-X6):**

| Check | What It Verifies | Pass Condition |
|-------|-----------------|----------------|
| **X1** | Scene durations match plan | Each scene within 10% of planned duration |
| **X2** | Every scene has approved visual | No scene has 0 approved candidates |
| **X3** | All assets have decision | No asset is still `pending` |
| **X4** | Render manifest is complete | Manifest non-null with all entries |
| **X5** | Runtime within platform cap | Total ≤ 180s (Shorts) or ≤ 600s (long-form) |
| **X6** | Every approved asset has license | License URL present for each asset |

**Post-render (X7-X15):**

| Check | What It Verifies | Pass Condition |
|-------|-----------------|----------------|
| **X7** | File size is reasonable | 100KB - 500MB |
| **X8** | Duration matches plan | Within 10% of planned total |
| **X9** | Resolution meets spec | portrait/landscape correct |
| **X10** | No long black frames | All black segments < 0.5s |
| **X11** | Has at least one audio track | ffprobe detects audio stream |
| **X12** | Audio is non-silent | RMS > -50dB |
| **X13** | Not corrupt / unreadable | ffprobe reads without error |
| **X14** | Aspect ratio matches request | 16:9 or 9:16 |
| **X15** | Video codec is h264 | Codec string contains 'h264' or 'avc1' |

---

## 6. Batch System (src/adapters/cli/)

```
┌─────────────────────────────────────────────────────────────┐
│                    BATCH QUEUE SYSTEM                        │
│                                                              │
│  ┌──────────────────┐     ┌─────────────────────────────┐   │
│  │  batch-queue.ts  │────→│  cli-runner.ts              │   │
│  │  JSON task list  │     │  Runs sequentially or       │   │
│  │  per-job config  │     │  in parallel with concurrency│   │
│  └──────────────────┘     └─────────────┬───────────────┘   │
│                                          │                   │
│                              ┌───────────▼───────────┐      │
│                              │  runAgenticPipeline    │      │
│                              │  per job               │      │
│                              └───────────────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

Batch features:
- `--resume` — retry only failed/pending jobs
- `--fail-fast` — stop after first failure
- JSON input: `[{ "topic": "...", "title": "...", "orientation": "..." }]`

---

## 7. Plugin System (src/agentic/plugins/)

```
┌──────────────────────────────────────────────────────────────┐
│                     PLUGIN SYSTEM                             │
│                                                               │
│  Plugin Registry → loads plugins → enriches pipeline:        │
│                                                               │
│  ● prePlan       — before script generation                 │
│  ● postPlan      — after plan built                         │
│  ● preAcquire    — before asset fetching                     │
│  ● postAcquire   — after assets acquired                     │
│  ● preVerify     — before AI verification                    │
│  ● postDecide    — after decisions made                      │
│  ● preRender     — before ffmpeg composition                 │
│  ● postRender    — after MP4 generated                       │
│  ● postGate      — after quality gates                       │
│                                                               │
│  20+ built-in plugins: color LUT, burn captions, brand, etc. │
└──────────────────────────────────────────────────────────────┘
```

---

## 8. Configuration & Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `PEXELS_API_KEY` | — | Required for Pexels video/image |
| `PIXABAY_API_KEY` | — | Fallback for images/video only |
| `GEMINI_API_KEY` | — | AI agent brain (alternative to Ollama) |
| `AI_PROVIDER` | `ollama` | LLM backend: `ollama`, `gemini`, `openrouter` |
| `OLLAMA_MODEL` | `moondream:latest` | Local vision + text model |
| `AUTO_FREE_MUSIC` | `true` | Auto-resolve background music |
| `MUSIC_ENABLED` | `true` | Enable music system |
| `MUSIC_PROVIDER_TIMEOUT` | `15000` | ms per provider API call |
| `TTS_PROVIDER` | `edge-tts` | Voiceover engine |
| `VIDEO_ORIENTATION` | `landscape` | `landscape` (16:9) or `portrait` (9:16) |
| `AGENTIC_FFMPEG_TIMEOUT_MS` | `30000` | Per ffmpeg call timeout |

---

## 9. Directory Structure

```
Automated-Video-Generator/
│
├── bin/                        # CLI entry points
│   ├── agentic-run.ts          # Single video generation
│   ├── agentic-batch.ts        # Batch queue processing
│   ├── agentic-auto.ts         # Auto-detect + generate
│   ├── driver-run.ts           # LLM-driven generation
│   └── mcp.js                  # MCP server for Claude
│
├── src/
│   ├── adapters/               # Runtime adapters
│   │   ├── cli/                # CLI runner, batch queue
│   │   ├── http/               # REST API + web portal
│   │   └── mcp/                # MCP tool registration
│   │
│   ├── agentic/                # Agentic pipeline (PRIMARY)
│   │   ├── ai/                 # LLM agents, brain, verification
│   │   ├── pipeline/           # Stages: plan, acquire, verify, gate, gateway
│   │   ├── orchestrator/       # Orchestration: pipeline, render, ffmpeg, captions
│   │   ├── management/         # Job, workspace, autopilot
│   │   ├── media/              # TTS, video analysis, export, localization
│   │   ├── operations/         # Video operations (edit, overlay, grade, etc.)
│   │   ├── delivery/           # Publish, archive, revision
│   │   └── plugins/            # Plugin system
│   │
│   ├── music-system/           # Modular music system
│   │   ├── providers/          # 5 providers (bundled → procedural)
│   │   ├── processing/         # Trim, fade, normalize, loop
│   │   ├── engine.ts           # Core orchestrator
│   │   ├── cache.ts            # Disk cache
│   │   ├── config.ts           # Env-based configuration
│   │   └── types.ts            # Shared music types
│   │
│   ├── lib/                    # Shared libraries (legacy + shims)
│   │   ├── free-video/         # Video fetch/download (legacy)
│   │   ├── free-image/         # Image fetch (legacy)
│   │   ├── free-music.ts       # Backward-compatible shim → music-system
│   │   ├── media-downloader.ts # Parallel multi-platform acquisition
│   │   ├── visual-fetcher.ts   # Scene-based visual search
│   │   ├── media-verifier.ts   # File validation
│   │   └── pexels.ts           # Pexels API wrapper
│   │
│   ├── services/               # HTTP services
│   └── views/                  # Web UI
│
├── input/                      # User input
│   ├── bgm/                    # Background music
│   │   └── __bundled__/        # 5 shipped ambient MP3s
│   ├── visuals/                # Local images/videos
│   └── audio/                  # Local voiceovers
│
├── output/                     # Rendered videos
├── workspace/                  # Job caches, processed music
│   └── cache/
│       └── free-music/         # Downloaded + processed music
│
└── docs/                       # Documentation
    └── ARCHITECTURE.md         # This file
```

---

## 10. Data Flow: End-to-End Example

```
Topic: "aurora borealis"
Title: "Northern Lights"
                       │
                       ▼
  ┌──────────────────────────────────────┐
  │ 1. SCRIPT GENERATION                 │
  │    AI writes: "The northern lights   │
  │    paint the arctic sky..."          │
  │    → 3-5 scene plan                  │
  └──────────────┬───────────────────────┘
                 ▼
  ┌──────────────────────────────────────┐
  │ 2. ASSET ACQUISITION                 │
  │    Scene 1: "aurora green sky"       │
  │      → Pexels video (primary)        │
  │      → Trim black frames (P6 fix)    │
  │    Scene 2: "stars night landscape"  │
  │      → Pexels image (fallback video) │
  │    Music: "aurora borealis"          │
  │      → Bundled ambient_piano.mp3     │
  │        (priority 1, offline)         │
  └──────────────┬───────────────────────┘
                 ▼
  ┌──────────────────────────────────────┐
  │ 3. AI VERIFICATION                   │
  │    Each image/video checked against  │
  │    scene keywords (Ollama/Gemini)     │
  └──────────────┬───────────────────────┘
                 ▼
  ┌──────────────────────────────────────┐
  │ 4. AGENT DECISION                    │
  │    Approve best candidate per scene  │
  │    Reject off-topic → fallback       │
  └──────────────┬───────────────────────┘
                 ▼
  ┌──────────────────────────────────────┐
  │ 5. QUALITY GATES (X1-X6)             │
  │    ✓ Durations match plan            │
  │    ✓ All scenes approved             │
  │    ✓ Runtime within 180s cap         │
  │    ✓ Licenses present                │
  │    → PASS: build RenderManifest      │
  └──────────────┬───────────────────────┘
                 ▼
  ┌──────────────────────────────────────┐
  │ 6. RENDER                            │
  │    ffmpeg segmented slideshow:       │
  │    Scene 1: video 15s + voiceover    │
  │    Scene 2: image 12s + voiceover    │
  │    Scene 3: video 14s + voiceover    │
  │    → concat all scenes               │
  │    → mix background music (30%)      │
  │    → add captions (SRT burn-in)      │
  │    → encode: h264, 1920×1080, 30fps │
  └──────────────┬───────────────────────┘
                 ▼
  ┌──────────────────────────────────────┐
  │ 7. POST-RENDER GATES (X7-X15)        │
  │    ✓ Size: 12MB (OK)                 │
  │    ✓ Duration: 41s (matches plan)    │
  │    ✓ Black frames: 0.2s (< 0.5s)    │
  │    ✓ Audio track present             │
  │    ✓ Codec: h264                     │
  │    → PASS: final MP4 generated       │
  └──────────────┬───────────────────────┘
                 ▼
        output/aurora_12345_final.mp4
```

---

## 11. Legacy System (src/lib/)

The legacy system remains fully functional and is used as a fallback by the agentic pipeline.

```
src/lib/
├── free-video/             # Video adapter + downloader
│   ├── adapter.ts          # FreeVideoAdapter (acquisition)
│   ├── download/           # Download verification, resume
│   └── index.ts            # Public API
│
├── free-image/             # Image adapter
│   └── adapter.ts          # FreeImageAdapter
│
├── free-sfx/               # Sound effects (stub)
│
├── free-music.ts           # 💡 BACKWARD-COMPATIBLE SHIM
│                           #    Routes to new src/music-system/
│                           #    Kept untouched per user mandate
│
├── media-downloader.ts     # ADVANCED parallel multi-platform
│                           # acquisition (retries, failover, trim)
│
├── media-verifier.ts       # Video/image integrity check
├── music-verifier.ts       # Audio integrity check (ffprobe)
├── visual-fetcher.ts       # Scene-based visual fetch + download
├── pexels.ts               # Pexels API (video + image search)
├── asset-cache.ts          # Dedup cache for shared assets
└── voice-*.ts              # TTS / voiceover stack
```

### 11.1 How the Shim Works

```
resolveFreeBackgroundMusic(opts)
        │
        ▼
┌───────────────────┐
│ ensureEngine()     │ ← Creates + caches MusicEngine singleton
│ (first call only)  │ ← Registers all default providers
└───────┬───────────┘
        │
┌───────▼───────────┐
│ engine.resolve    │ ← MusicEngine handles all providers
│ Background(opts)  │ ← Priority chain: bundled → local → ccMixter → IA → procedural
└───────┬───────────┘
        │
┌───────▼───────────┐
│ If engine fails:   │ ← Legacy fallback (backward compat)
│ try old axios-     │ ← Uses preferProviders filter
│ based download     │ ← Uses input/bgm/ files
└───────┬───────────┘
        │
┌───────▼───────────┐
│ Return Resolved   │ ← { localPath, track, provider }
│ Music or null     │
└───────────────────┘
```

---

## 12. Plugin System Architecture

```
agentic-plugins.config.json     # Plugin manifest
        │
        ▼
┌──────────────────┐
│ PluginRegistry    │ ← Creates + validates plugins
│ (singleton)       │
└───────┬──────────┘
        │
        ▼
┌───────────────────────────────────────────────────────┐
│ Registration per-hook:                                │
│ prePlan, postPlan, preAcquire, postAcquire,           │
│ preVerify, postDecide, preRender, postRender,         │
│ postGate                                              │
└───────────────────────────────────────────────────────┘
```

**Built-in plugins (20+):**

| Plugin | Category | Hook | Effect |
|--------|----------|------|--------|
| lut-loader | COLOR | preRender | Apply LUT to all clips |
| burn-captions | CAPTIONS | postRender | Burn SRT into video |
| brand-watermark | BRAND | postRender | Logo overlay |
| scene-transition | EDIT | preRender | Crossfade between scenes |
| speed-ramp | MOTION | postDecide | Variable speed effects |
| ... | ... | ... | ... |

---

## 13. Key Design Decisions

### 13.1 Why Three Systems?

| System | When to Use |
|--------|------------|
| **Agentic Pipeline** | Full autonomous video — AI writes script, fetches assets, renders, verifies |
| **Legacy (free-video)** | Simple asset download without AI; backward compat for existing scripts |
| **MCP** | When Claude Desktop/Code is the orchestrator; LLM decides each step |

### 13.2 Why ccMixter over Pixabay Audio?

- **Pixabay Audio API returns 403** — they have no public audio endpoint (images/video only)
- **ccMixter** is free (no API key), serves real CC-licensed music, has 50k+ tracks
- **Bundled** provides instant offline fallback

### 13.3 Why WAV→MP3?

Processing pipeline outputs **192k MP3** via `libmp3lame` instead of WAV:
- ~80% smaller cache (1MB MP3 vs 5.3MB WAV)
- Same quality at 192k for background music
- Faster network transfers for remote pipelines

### 13.4 Why Backward-Compatible Shim?

The `free-music.ts` shim ensures:
- **Zero breaking changes** — old importers continue working
- **Gradual migration** — no need to update all callers at once
- **Dual fallback** — if the new engine fails, the old download logic still runs

---

## 14. Future Directions

| Area | Target | Plan |
|------|--------|------|
| **Music** | More offline tracks | Grow bundled library to 25-50 MP3s |
| **Video** | AI-driven shot selection | Scene-by-scene clip matching |
| **Audio** | Multi-track | Music + SFX + voiceover independently |
| **Render** | GPU acceleration | CUDA NVENC + tone mapping |
| **Delivery** | Auto-upload | YouTube Shorts, TikTok, IG Reels |
| **Testing** | 90%+ coverage | Unit tests for every provider |

---

*Last updated: 2026-07-21*
