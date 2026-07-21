# 🎵 Music System — Advanced Reusable Architecture

## Table of Contents
1. [Architecture Overview](#1-architecture-overview)
2. [Core Module Design (`src/music-system/`)](#2-core-module-design)
3. [Provider Registry Pattern](#3-provider-registry-pattern)
4. [Music Role System](#4-music-role-system)
5. [Configuration System](#5-configuration-system)
6. [Processing Pipeline](#6-processing-pipeline)
7. [Integration Points](#7-integration-points)
8. [Implementation Phases](#8-implementation-phases)
9. [API Reference](#9-api-reference)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        MUSIC SYSTEM MODULE                           │
│                     src/music-system/index.ts                        │
│                                                                      │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌──────────────┐  │
│  │   Core     │  │  Provider  │  │ Processing │  │    Config    │  │
│  │  Engine    │──│  Registry  │──│  Pipeline  │──│   Loader     │  │
│  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘  └──────┬───────┘  │
│        │               │               │                │          │
│  ┌─────▼───────────────▼───────────────▼────────────────▼───────┐  │
│  │                   Public API Exports                          │  │
│  │  MusicEngine  │  MusicProvider  │  MusicQuery  │  MusicTrack │  │
│  └──────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
                    │                      ▲
                    │  used by             │
                    ▼                      │
  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐ ┌──────────┐
  │ Agentic  │ │  Legacy  │ │  Batch   │ │  MCP Tools   │ │  Future  │
  │ Pipeline │ │ normal-  │ │ agentic- │ │  (OpenAI     │ │ Systems  │
  │          │ │ gen.ts   │ │ batch.ts │ │   protocol)  │ │          │
  └──────────┘ └──────────┘ └──────────┘ └──────────────┘ └──────────┘
```

### Design Principles

| Principle | Rationale |
|-----------|-----------|
| **Standalone** | Zero dependency on pipeline types. Importable by ANY system. |
| **Provider Plugin Architecture** | Add new music sources without modifying core. |
| **Role-Aware** | Same engine serves background, intro, outro, transition music. |
| **Hierarchical Config** | Defaults → config file → runtime overrides. |
| **Event-Driven** | Emit hooks for logging, metrics, UI progress. |
| **Lazy + Cached** | Download once, reuse across runs. Never re-fetch. |

---

## 2. Core Module Design (`src/music-system/`)

### Directory Structure

```
src/music-system/
├── index.ts                    # Public API — re-exports everything
├── types.ts                    # All interfaces & types
├── engine.ts                   # MusicEngine class (orchestrator)
│
├── providers/
│   ├── registry.ts             # Provider registry (add/get/list)
│   ├── local.ts                # LocalFreeProvider (input/bgm/)
│   ├── bundled.ts              # Bundled tracks provider
│   ├── pixabay.ts              # NEW: Pixabay Audio API provider
│   ├── open-lofi.ts            # OpenLofiProvider (from current free-music.ts)
│   ├── internet-archive.ts     # InternetArchiveProvider
│   ├── procedural.ts           # NEW: Procedural generator (3 profiles)
│   └── base.ts                 # Abstract base class for all providers
│
├── processing/
│   ├── pipeline.ts             # Trim → fade → normalize → loop
│   ├── trim.ts                 # ffmpeg-based trim to target length
│   ├── fade.ts                 # Intro/outro fade curves
│   ├── normalize.ts            # EBU R128 loudness normalization
│   └── looper.ts               # Seamless loop extension
│
├── config.ts                   # Configuration loading & defaults
├── cache.ts                    # Multi-level cache (memory + disk)
├── events.ts                   # Event system (typed hooks)
├── query.ts                    # MusicQuery builder (mood → keywords)
└── errors.ts                   # Typed errors (ProviderError, etc.)
```

### Core Type System (`types.ts`)

```typescript
// ─── Music Track (immutable data) ──────────────────────────────────
interface MusicTrack {
    id: string;
    title: string;
    creator: string;
    license: string;
    licenseUrl: string;
    provider: string;           // e.g. 'pixabay', 'open-lofi'
    downloadUrl: string;
    genre: string;
    format: string;             // 'mp3', 'wav', 'ogg', etc.
    tags: string[];
    durationSec: number;        // known track duration (0 if unknown)
    bpm?: number;               // optional BPM for beat-matching
    mood?: string[];            // optional mood tags from source
    waveformUrl?: string;       // preview URL (Pixabay provides this)
}

// ─── Music Query (what we want) ────────────────────────────────────
interface MusicQuery {
    /** Primary mood category */
    mood: 'calm' | 'upbeat' | 'dramatic' | 'professional' | 'nostalgic' | 'dark' | 'any';
    /** User-facing topic (for keyword extraction) */
    topic?: string;
    /** Voiceover text (for context-aware matching) */
    voiceoverText?: string;
    /** Target duration in seconds */
    targetDurationSec: number;
    /** Minimum acceptable duration */
    minDurationSec: number;     // default: 30
    /** Desired intensity */
    intensity?: 'low' | 'mid' | 'high';
    /** Preferred genres (ordered) */
    preferredGenres?: string[];
    /** Avoid these genres */
    excludedGenres?: string[];
}

// ─── Music Role (WHAT is this music for?) ──────────────────────────
type MusicRole = 'background' | 'intro' | 'outro' | 'transition' | 'stinger';

// ─── Resolved Music (output) ───────────────────────────────────────
interface ResolvedMusic {
    /** Absolute path to the downloaded/generated audio file */
    localPath: string;
    /** Source track metadata (including provider info) */
    track: MusicTrack;
    /** How this music will be used */
    role: MusicRole;
    /** Processing applied to the raw file */
    processing: {
        trimmed: boolean;
        faded: boolean;
        normalized: boolean;
        looped: boolean;
        originalDurationSec: number;
        finalDurationSec: number;
    };
    /** Provider latency (for diagnostics) */
    latencyMs: number;
}

// ─── Provider Interface (anyone can implement) ──────────────────────
interface MusicProvider {
    /** Unique provider identifier */
    readonly name: string;
    /** Human-readable label */
    readonly label: string;
    /** Provider priority (1=highest) */
    readonly priority: number;
    /** Whether this provider requires network */
    readonly requiresNetwork: boolean;
    /** Search for matching tracks */
    search(query: MusicQuery): Promise<MusicTrack[]>;
    /** Download a specific track to local path. Returns local path. */
    download(track: MusicTrack, destPath: string): Promise<string>;
    /** Optional: verify track integrity after download */
    verify?(localPath: string): Promise<boolean>;
}

// ─── Engine Configuration ──────────────────────────────────────────
interface MusicEngineConfig {
    /** Enable/disable music entirely */
    enabled: boolean;
    /** Cache directory (default: workspace/cache/free-music) */
    cacheDir: string;
    /** Provider timeout in ms */
    providerTimeout: number;
    /** Processing pipeline options */
    processing: ProcessingOptions;
    /** Provider-specific config overrides */
    providerOptions: Record<string, unknown>;
    /** Event callbacks */
    onEvent?: (event: MusicSystemEvent) => void;
}

interface ProcessingOptions {
    /** Whether to trim to target duration */
    trimToDuration: boolean;
    /** Whether to apply intro/outro fade */
    applyFade: boolean;
    /** Fade-in duration in seconds */
    fadeInSec: number;
    /** Fade-out duration in seconds */
    fadeOutSec: number;
    /** Whether to normalize loudness to EBU R128 */
    normalizeLoudness: boolean;
    /** Target LUFS level (default: -23) */
    targetLufs: number;
    /** Whether to loop short tracks */
    enableLooping: boolean;
}

// ─── Events ────────────────────────────────────────────────────────
type MusicSystemEventType =
    | 'provider:search:start'
    | 'provider:search:success'
    | 'provider:search:fail'
    | 'track:selected'
    | 'track:downloading'
    | 'track:downloaded'
    | 'track:processing'
    | 'track:processed'
    | 'track:cached'
    | 'engine:fallback'
    | 'engine:complete'
    | 'engine:error';

interface MusicSystemEvent {
    type: MusicSystemEventType;
    timestamp: number;
    provider?: string;
    track?: MusicTrack;
    error?: string;
    latencyMs?: number;
}
```

---

## 3. Provider Registry Pattern

### How it Works

Providers are **registered at startup**, not hardcoded. The registry maintains an ordered list by priority.

```typescript
class ProviderRegistry {
    private providers: MusicProvider[] = [];

    register(provider: MusicProvider): void {
        this.providers.push(provider);
        this.providers.sort((a, b) => a.priority - b.priority);
    }

    /** All providers (in priority order) */
    getAll(): MusicProvider[] { return [...this.providers]; }

    /** Only network providers */
    getNetworkProviders(): MusicProvider[] {
        return this.providers.filter(p => p.requiresNetwork);
    }

    /** Only offline providers */
    getOfflineProviders(): MusicProvider[] {
        return this.providers.filter(p => !p.requiresNetwork);
    }

    /** Get a specific provider by name */
    get(name: string): MusicProvider | undefined {
        return this.providers.find(p => p.name === name);
    }

    /** Reset (for testing) */
    clear(): void { this.providers = []; }
}

// Singleton registry
export const registry = new ProviderRegistry();
```

### Default Provider Registration

Priority order (1 = highest):

| Priority | Provider | Offline? | Source | 
|----------|----------|----------|--------|
| **1** | `bundled` | ✅ Yes | `input/bgm/__bundled__/` with metadata |
| **2** | `local` | ✅ Yes | `input/bgm/*` user tracks |
| **3** | `ccmixter` | ❌ No | ccMixter.org CC-licensed music (no key) |
| **4** | `open-lofi` | ❌ No | GitHub CC0 lofi catalog |
| **5** | `internet-archive` | ❌ No | Public domain archive.org |
| **6** (fallback) | `procedural` | ✅ Yes | ffmpeg-generated ambient (always works) |

Registration code:

```typescript
// src/music-system/providers/index.ts
import { registry } from './registry';
import { BundledProvider } from './bundled';
import { LocalProvider } from './local';
import { PixabayProvider } from './pixabay';
import { OpenLofiProvider } from './open-lofi';
import { InternetArchiveProvider } from './internet-archive';
import { ProceduralProvider } from './procedural';

export function registerDefaultProviders(): void {
    registry.register(new BundledProvider());     // priority 1
    registry.register(new LocalProvider());        // priority 2
    registry.register(new PixabayProvider());      // priority 3
    registry.register(new OpenLofiProvider());     // priority 4
    registry.register(new InternetArchiveProvider()); // priority 5
    registry.register(new ProceduralProvider());   // priority 6 (always works)
}
```

### Adding a New Provider (Third-Party Example)

```typescript
// External code — no changes to music-system/ needed
import { registry, type MusicProvider, type MusicTrack, type MusicQuery } from '../music-system';

class FreesoundProvider implements MusicProvider {
    name = 'freesound';
    label = 'Freesound.org';
    priority = 4;  // between pixabay and internet-archive
    requiresNetwork = true;

    async search(query: MusicQuery): Promise<MusicTrack[]> { /* ... */ }
    async download(track: MusicTrack, destPath: string): Promise<string> { /* ... */ }
}

// Register anywhere before engine.run()
registry.register(new FreesoundProvider());
```

---

## 4. Music Role System

The same engine handles **different roles** — each role has different requirements:

| Role | Duration | Fade? | Ducking? | Selection Criteria |
|------|----------|-------|----------|-------------------|
| `background` | Full video length | Yes (2s) | Yes (auto-duck during voiceover) | Calm, non-distracting |
| `intro` | 3-5 seconds | Yes (short) | No | Energetic, attention-grabbing |
| `outro` | 4-8 seconds | Yes (outro-only) | No | Conclusive, uplifting |
| `transition` | 0.5-2 seconds | No | No | Dynamic, impactful |
| `stinger` | 1-3 seconds | No | No | Short accent |

```typescript
class MusicEngine {
    async resolveForRole(
        query: MusicQuery,
        role: MusicRole,
        config?: Partial<MusicEngineConfig>
    ): Promise<ResolvedMusic | null> {
        // 1. Auto-adjust query based on role
        const adjustedQuery = this.adjustForRole(query, role);
        
        // 2. Search all providers in parallel
        const results = await this.fanOutSearch(adjustedQuery);
        
        // 3. Rank candidates
        const best = this.rankTracks(results, adjustedQuery, role);
        
        if (!best) return null;
        
        // 4. Download
        const localPath = await this.downloadTrack(best);
        
        // 5. Process (trim, fade, normalize)
        const processed = await this.processPipeline(localPath, {
            role,
            targetDurationSec: query.targetDurationSec,
            config: config?.processing,
        });
        
        return processed;
    }

    /** High-level: resolve background music (most common use) */
    async resolveBackground(
        query: Partial<MusicQuery>,
        config?: Partial<MusicEngineConfig>
    ): Promise<ResolvedMusic | null> {
        return this.resolveForRole(
            this.buildDefaultQuery(query, 'calm'),
            'background',
            config
        );
    }
    
    /** Resolve intro music */
    async resolveIntro(
        query: Partial<MusicQuery>,
        config?: Partial<MusicEngineConfig>
    ): Promise<ResolvedMusic | null> {
        return this.resolveForRole(
            this.buildDefaultQuery(query, 'upbeat'),
            'intro',
            config
        );
    }
}
```

---

## 5. Configuration System

### Hierarchical Config Flow

```
                    ┌───────────────────────┐
                    │  Hardcoded Defaults    │
                    │  (src/music-system/    │
                    │   config.ts)           │
                    └──────────┬────────────┘
                               │
                    ┌──────────▼────────────┐
                    │  Environment Variables │
                    │  (PIXABAY_API_KEY,     │
                    │   MUSIC_ENABLED, etc.) │
                    └──────────┬────────────┘
                               │
                    ┌──────────▼────────────┐
                    │  Config File           │
                    │  (music-config.json)   │
                    └──────────┬────────────┘
                               │
                    ┌──────────▼────────────┐
                    │  Runtime Override      │
                    │  (passed to engine)    │
                    └───────────────────────┘
```

### Config Object Shape

```typescript
interface MusicConfig {
    enabled: boolean;               // default: true
    cacheDir: string;               // default: workspace/cache/free-music
    providerTimeoutMs: number;      // default: 10000
    parallelSearch: boolean;        // default: true (fan-out to all providers)
    
    // Provider-specific overrides
    providers: {
        pixabay?: {
            apiKey?: string;        // fallback to PIXABAY_API_KEY env
            maxResults?: number;    // default: 5
        };
        'internet-archive'?: {
            requestDelayMs?: number; // default: 500 (avoid rate limit)
        };
        procedural?: {
            profile?: 'ambient' | 'upbeat' | 'cinematic'; // auto-detect by default
        };
    };
    
    // Processing defaults
    processing: ProcessingOptions;  // (see types above)
    
    // Role-specific overrides
    roles: {
        background: Partial<ResolvedMusic>;
        intro: Partial<ResolvedMusic>;
        outro: Partial<ResolvedMusic>;
        transition: Partial<ResolvedMusic>;
    };
}
```

---

## 6. Processing Pipeline

After download, every track goes through configurable processing:

```
Raw track ─▶ ┌──────────┐ ─▶ ┌──────┐ ─▶ ┌───────────┐ ─▶ ┌───────┐ ─▶ Processed
(download)   │  TRIM    │    │ FADE │    │ NORMALIZE │    │ LOOP  │    track
             │ (to      │    │(in/  │    │ (EBU R128 │    │(extend│
             │ target   │    │ out) │    │  -23 LUFS)│    │ short │
             │ duration)│    │      │    │           │    │ tracks│
             └──────────┘    └──────┘    └───────────┘    └───────┘
```

Each stage is a **standalone module** that can be used independently:

```typescript
// processing/pipeline.ts
class ProcessingPipeline {
    constructor(private config: ProcessingOptions) {}

    async run(inputPath: string, outputPath: string, opts: {
        role: MusicRole;
        targetDurationSec: number;
    }): Promise<ProcessingResult> {
        let current = inputPath;
        const result: ProcessingResult = {
            trimmed: false, faded: false,
            normalized: false, looped: false,
            originalDurationSec: 0, finalDurationSec: 0,
        };

        // Stage 1: Probe original duration
        result.originalDurationSec = await probeDuration(current);

        // Stage 2: Trim
        if (this.config.trimToDuration) {
            const trimmed = path.join(path.dirname(outputPath), `__trim_${path.basename(outputPath)}`);
            await trimAudio(current, trimmed, opts.targetDurationSec);
            current = trimmed;
            result.trimmed = true;
        }

        // Stage 3: Fade
        if (this.config.applyFade) {
            const faded = path.join(path.dirname(outputPath), `__fade_${path.basename(outputPath)}`);
            await applyFade(current, faded, {
                fadeInSec: opts.role === 'intro' ? 0.2 : this.config.fadeInSec,
                fadeOutSec: this.config.fadeOutSec,
                totalDurationSec: opts.targetDurationSec,
            });
            current = faded;
            result.faded = true;
        }

        // Stage 4: Normalize loudness
        if (this.config.normalizeLoudness) {
            const normalized = path.join(path.dirname(outputPath), `__norm_${path.basename(outputPath)}`);
            await normalizeLoudness(current, normalized, this.config.targetLufs);
            current = normalized;
            result.normalized = true;
        }

        // Stage 5: Loop extension (if track too short)
        if (this.config.enableLooping && result.originalDurationSec < opts.targetDurationSec * 0.8) {
            const looped = path.join(path.dirname(outputPath), `__loop_${path.basename(outputPath)}`);
            await loopAudio(current, looped, opts.targetDurationSec);
            current = looped;
            result.looped = true;
        }

        // Finalize
        fs.renameSync(current, outputPath);
        result.finalDurationSec = await probeDuration(outputPath);
        return result;
    }
}
```

---

## 7. Integration Points

### Current Consumers → New API Migration

| Current File | Current Call | New API Call |
|-------------|-------------|-------------|
| `src/agentic/orchestrator/pipeline.ts:366` | `resolveFreeBackgroundMusic({ query })` | `engine.resolveBackground({ topic })` |
| `src/video-generator.ts:362` | `resolveFreeBackgroundMusic({ query })` | `engine.resolveBackground({ topic })` |
| `src/agentic/operations/audio-track.ts:32` | `resolveFreeBackgroundMusic({ query })` | `engine.resolveBackground({ topic })` |
| `src/adapters/mcp/register-agentic-tools.ts:67` | `resolveFreeBackgroundMusic({ query })` | `engine.resolveBackground({ topic })` |
| `bin/archive/normal-gen.ts:100` | `resolveFreeBackgroundMusic({ query:'calm lofi' })` | `engine.resolveBackground({ mood:'calm' })` |

### Migration Path (Backward Compatible)

The old `free-music.ts` becomes a thin wrapper:

```typescript
// src/lib/free-music.ts — LEGACY SHIM
// Re-exports from the new music-system module for backward compatibility.
// All new code should import from src/music-system directly.
import { MusicEngine, registry, registerDefaultProviders } from '../music-system';

const engine = new MusicEngine();
registerDefaultProviders();

export async function resolveFreeBackgroundMusic(
    opts: ResolveFreeMusicOptions
): Promise<ResolvedFreeMusic | null> {
    const result = await engine.resolveBackground({
        topic: opts.query,
    }, {
        enabled: opts.enabled,
        cacheDir: opts.cacheDir,
    });
    if (!result) return null;
    return {
        localPath: result.localPath,
        track: result.track as any,  // backward-compatible cast
    };
}

// Old types preserved for backward compatibility
export { ResolveFreeMusicOptions, ResolvedFreeMusic };
export { listFreeMusicProviders };
```

### Plugin System Integration

The music system registers itself as a plugin that other plugins can extend:

```typescript
// src/agentic/plugins/music/index.ts
import { Plugin } from '../core/types';
import { registry } from '../../music-system/providers/registry';
import { PixabayProvider } from './providers/pixabay-plugin';

export const musicPlugin: Plugin = {
    name: 'music',
    hooks: {
        onStartup: async () => {
            registry.register(new PixabayProvider());
            // ... other providers
        },
    },
};
```

---

## 8. Implementation Phases

### Phase 1 — Core Infrastructure (Day 1)
- Create `src/music-system/` directory structure
- Define all types in `types.ts`
- Implement `ProviderRegistry`, `cache.ts`, `events.ts`, `errors.ts`, `config.ts`
- Write unit tests for registry + cache + config

### Phase 2 — Provider Migration (Day 2)
- Move `LocalFreeProvider` → `src/music-system/providers/local.ts`
- Move `OpenLofiProvider` → `src/music-system/providers/open-lofi.ts`
- Move `InternetArchiveProvider` → `src/music-system/providers/internet-archive.ts`
- Move `FallbackToneProvider` → `src/music-system/providers/procedural.ts` (upgrade to 3 profiles)
- Wire all into `registerDefaultProviders()`

### Phase 3 — New Pixabay Provider (Day 3)
- Implement `PixabayProvider` using existing `PIXABAY_API_KEY`
- API: `GET https://pixabay.com/api/audio/?key=KEY&q=QUERY&per_page=N`
- Parse response, map to `MusicTrack[]`
- Add download via direct URL
- Add to default providers at priority 3

### Phase 4 — Engine + Processing (Day 4)
- Implement `MusicEngine.resolveForRole()`
- Implement parallel fan-out search
- Implement track ranking (by relevance, quality, duration match)
- Implement `ProcessingPipeline` (trim, fade, normalize, loop)
- Wire event system

### Phase 5 — Query Builder (Day 5)
- Implement `MusicQueryBuilder` — mood classifier from topic + voiceover text
- Mood → genre mapping table (15+ mood-to-genre mappings)
- Keyword extraction from topic text
- Duration calculation from scene plan

### Phase 6 — Migration + Backward Compat (Day 6)
- Rewrite `src/lib/free-music.ts` as backward-compatible shim
- Update all 5 callers to use new API
- Verify all systems still work (typecheck, pipeline test, legacy test)

### Phase 7 — Procedural Generator Upgrade (Day 7)
- Replace single pink noise with 3 profiles: ambient, upbeat, cinematic
- Implement profile auto-selection based on MusicQuery.mood
- Add caching for generated files
- Add ffmpeg probe verification

---

## 9. API Reference

### Simple Usage (Most Common)

```typescript
import { MusicEngine } from '../music-system';

const engine = new MusicEngine();
await engine.init();  // registers default providers, loads cache

// Resolve background music — ONE call
const music = await engine.resolveBackground({ topic: 'nature meditation' });

console.log(music?.localPath);   // → workspace/cache/free-music/pixabay_abc123.mp3
console.log(music?.track.title); // → "Peaceful Piano"
console.log(music?.track.provider); // → "pixabay"
```

### Advanced Usage (All Roles)

```typescript
// Resolve background music with full control
const bg = await engine.resolveForRole(
    {
        mood: 'calm',
        topic: 'yoga for beginners',
        targetDurationSec: 90,
        intensity: 'low',
    },
    'background',
    {
        processing: {
            trimToDuration: true,
            applyFade: true,
            normalizeLoudness: true,
            enableLooping: true,
        },
        onEvent: (e) => {
            if (e.type === 'track:downloading') {
                console.log(`Downloading ${e.track?.title}...`);
            }
        },
    }
);

// Resolve intro + outro together (parallel)
const [intro, outro] = await Promise.all([
    engine.resolveForRole({ mood: 'upbeat', targetDurationSec: 4 }, 'intro'),
    engine.resolveForRole({ mood: 'dramatic', targetDurationSec: 6 }, 'outro'),
]);
```

### Custom Provider Registration

```typescript
// Register a custom provider (e.g., for a client-specific source)
engine.registerProvider(new MyCorporateMusicProvider());

// Disable a specific provider
engine.disableProvider('internet-archive');
```

### Minimal Backward-Compatible Import

Existing code that uses `resolveFreeBackgroundMusic` continues working **unchanged**:

```typescript
// OLD — still works via shim
import { resolveFreeBackgroundMusic } from '../../lib/free-music';
const music = await resolveFreeBackgroundMusic({ query: 'ambient' });
```

---

## A. Current System Evaluation

### Before → After Comparison

| Metric | Current System | New Architecture |
|--------|---------------|-----------------|
| **Module location** | Single file `free-music.ts` | `src/music-system/` (10+ modules) |
| **Provider count** | 4 (local, open-lofi, internet-archive, fallback) | 6+ (bundled, local, pixabay, open-lofi, internet-archive, procedural) |
| **Provider registration** | Hardcoded in `defaultProviders()` | Plugin registry (anyone can add) |
| **Music roles** | Only background | background, intro, outro, transition, stinger |
| **Processing** | None | Trim ➜ Fade ➜ Normalize ➜ Loop |
| **Parallel search** | Sequential (one-at-a-time) | Parallel (all at once) |
| **Query engine** | Keyword text search | Structured mood + genre + topic |
| **Fallback quality** | Pink noise drone 🚫 | Musical chord pad (3 profiles) 🎵 |
| **Caching** | Simple asset cache | Multi-level (memory + disk + bundled) |
| **Event system** | console.log | Typed events (logging, metrics, UI) |
| **Config** | CLI flags only | Hierarchical: defaults ➜ env ➜ file ➜ runtime |
| **Testability** | Hard (axios mocks needed) | Easy (provider registry mockable) |
| **Backward compat** | — | Shim maintains old API |
| **System types supported** | Agentic only | All (agentic, legacy, batch, MCP, video-gen) |

## B. Files Changed Summary

| File | Action | Purpose |
|------|--------|---------|
| `src/music-system/` (10+ files) | **NEW** | Core architecture |
| `src/lib/free-music.ts` | **REWRITE** | Backward-compatible shim |
| `src/lib/free-music.test.ts` | **UPDATE** | Test shim + new types |
| `src/agentic/orchestrator/pipeline.ts` | **UPDATE** | Use `engine.resolveBackground()` |
| `src/video-generator.ts` | **UPDATE** | Use `engine.resolveBackground()` |
| `src/agentic/operations/audio-track.ts` | **UPDATE** | Use `engine.resolveBackground()` |
| `src/adapters/mcp/register-agentic-tools.ts` | **UPDATE** | Use `engine.resolveBackground()` |
| `bin/archive/normal-gen.ts` | **UPDATE** | Use `engine.resolveBackground()` |
| `input/bgm/__bundled__/` | **NEW** | 5-8 bundled CC0 tracks with metadata |

---

## C. Success Criteria

| Criterion | Measurement |
|-----------|------------|
| All 5 existing callers work unchanged | Typecheck ✓, pipeline test ✓ |
| New Pixabay provider returns real tracks | Integration test ✓ |
| Procedural generator produces musical output | Manual listen test ✓ |
| Parallel search faster than sequential | Benchmark: <8s vs >18s |
| Provider registry accepts new providers | Unit test: register + search ✓ |
| Processing pipeline produces clean audio | ffprobe verify: LUFS, duration, peaks ✓ |
| Backward compat maintained | `npm test` — all existing tests pass ✓ |
| All music roles resolvable | `resolveBackground`, `resolveIntro`, etc. ✓ |
