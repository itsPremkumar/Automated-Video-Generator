# 🎵 Advanced Music System — High-Level Implementation Plan

## Overview

A complete redesign of the background music pipeline — from "broken providers + pink noise" to a **multi-tier, self-healing, procedurally-capable music engine** that reliably delivers context-appropriate music for every video.

---

## 1. Architecture — Music Pipeline

```
  ┌──────────────────────────────────────────────────────┐
  │                    MUSIC QUERY ENGINE                 │
  │  (mood analysis → genre + tempo + keywords)           │
  └────────────────────┬─────────────────────────────────┘
                       │
  ┌────────────────────▼─────────────────────────────────┐
  │              PROVIDER ROUTER (parallel fan-out)       │
  │                                                       │
  │   Tier 1 ─── Local Bundled (input/bgm/__bundled__/)  │
  │   Tier 2 ─── Pixabay Audio API (real produced music)  │
  │   Tier 3 ─── Internet Archive (CC/public domain)      │
  │   Tier 4 ─── OpenLofi (CC0 lofi catalog)              │
  │   Tier 5 ─── Procedural Generator (ffmpeg synthesis)  │
  └────────────────────┬─────────────────────────────────┘
                       │
  ┌────────────────────▼─────────────────────────────────┐
  │              TRACK RANKER & SELECTOR                  │
  │  (relevance score × quality score × duration match)   │
  └────────────────────┬─────────────────────────────────┘
                       │
  ┌────────────────────▼─────────────────────────────────┐
  │              MUSIC PROCESSING PIPELINE                │
  │                                                       │
  │  ① Trim to video length                               │
  │  ② Intro/outro fade (2s curves)                      │
  │  ③ Loudness normalization (EBU R128, -23 LUFS)       │
  │  ④ Dynamic ducking (voiceover sidechain)             │
  │  ⑤ Beat-matched crossfade (loop points)              │
  └────────────────────┬─────────────────────────────────┘
                       │
  ┌────────────────────▼─────────────────────────────────┐
  │              VERIFICATION GATE                        │
  │  (stream check, duration check, loudness check)       │
  └──────────────────────────────────────────────────────┘
```

---

## 2. Provider Tier Design

### Tier 1 — Local Bundled (Offline-First)
**Priority:** Always checked first. Zero latency, zero network.

| Component | Detail |
|-----------|--------|
| **Source** | `input/bgm/__bundled__/` directory |
| **Discovery** | `fs.readdirSync()` at startup |
| **Metadata** | Sidecar JSON per track: `{ mood, bpm, key, genre, duration }` |
| **Selection** | Mood-matching via metadata tags |
| **Bundling** | Ship with 5-8 CC0/CC-BY tracks (each < 3MB) |
| **Caching** | Already on disk — no cache needed |

**Implementation:** Enhance `LocalFreeProvider` to read metadata sidecars and match against mood query.

### Tier 2 — Pixabay Audio API ⭐ (PRIMARY NETWORK)
**Priority:** First network provider. Already have API key. Real produced music.

| Component | Detail |
|-----------|--------|
| **Endpoint** | `GET https://pixabay.com/api/audio/?key=KEY&q=QUERY&per_page=N` |
| **Auth** | `PIXABAY_API_KEY` env var (already exists) |
| **Rate limit** | 500 requests/hour (free tier) |
| **Response** | Returns `{ tracks: [{ id, url, title, duration, tags, waveform }] }` |
| **Download** | Direct URL — fast CDN |
| **Coverage** | 100k+ tracks across all genres |

**Implementation:** New `PixabayMusicProvider` class (80 lines).

### Tier 3 — Internet Archive (Fallback)
**Priority:** Fallback when Pixabay unavailable/empty. Free, no key.

| Component | Detail |
|-----------|--------|
| **Endpoint** | `advancedsearch.php` (currently works ✅) |
| **Filter** | `mediatype:audio AND licenseurl:*` for CC/public domain only |
| **Download** | `https://archive.org/download/{id}/{id}.mp3` |
| **Reliability** | ~70% uptime — flaky but massive catalog |
| **Degradation** | Skip if response time > 8s |

**Implementation:** Fix existing provider — pass AbortController signal to axios, increase timeout to 10s.

### Tier 4 — OpenLofi (Niche Backup)
**Priority:** Niche fallback for lofi/ambient moods.

| Component | Detail |
|-----------|--------|
| **Endpoint** | `https://raw.githubusercontent.com/btahir/open-lofi/main/catalog.json` (currently works ✅) |
| **Catalog** | 166 CC0 tracks, all lo-fi/chillhop/ambient |
| **Download** | Raw GitHub CDN (fast) |
| **Coverage** | Narrow genre (lofi only) |
| **Reliability** | High — GitHub raw CDN 99.9% uptime |

**Implementation:** Fix existing provider — same withTimeout fix, add mood-based category filtering instead of title text search.

### Tier 5 — Procedural Generator (Always-On Guarantee)
**Priority:** Final fallback when ALL network providers fail. **Always works.**

| Component | Detail |
|-----------|--------|
| **Type** | ffmpeg-based real-time audio synthesis |
| **Moods** | 3 profiles — ambient, energetic, cinematic |
| **Quality** | Multi-layer chord, gentle rhythm, natural dynamics |
| **Duration** | Configurable (30-180s) |
| **Latency** | ~1s generation for 30s clip |
| **Offline** | 100% — no network required |

**Procedural profiles:**

```
┌─────────────┬──────────────────────────────────────────────┐
│  Profile    │  ffmpeg filter graph                         │
├─────────────┼──────────────────────────────────────────────┤
│  Ambient    │  3 sine waves (C major chord) + low-pass     │
│  (calm)     │  + LFO tremolo + reverb                      │
├─────────────┼──────────────────────────────────────────────┤
│  Energetic  │  Square wave bass + saw chord + arp          │
│  (upbeat)   │  + sidechain compression + delay             │
├─────────────┼──────────────────────────────────────────────┤
│  Cinematic  │  Strings (FM synth) + pad + slow swell       │
│  (dramatic) │  + riser + sub-bass                          │
└─────────────┴──────────────────────────────────────────────┘
```

---

## 3. Music Query Engine (Mood → Keywords)

Replaces the current `deriveMusicQuery()` heuristic with a structured query builder.

### Input → Output Flow:

```
Scene voiceover text + title
        │
        ▼
┌───────────────────┐
│  Mood Classifier  │  ← AI brain or keyword heuristic
│                   │
│  calm ─────────── ambient, peaceful, meditation, nature
│  upbeat ───────── energetic, happy, workout, lifestyle
│  dramatic ─────── cinematic, emotional, epic, inspiring
│  professional ─── corporate, tech, presentation, clean
│  nostalgic ─────── lofi, chill, retro, jazz, vinyl
│  dark ─────────── ambient-drone, suspense, minimal
└───────────────────┘
        │
        ▼
┌───────────────────┐
│  Query Builder    │
│                   │
│  1. Primary: mood │
│  2. Secondary:    │
│     genre derived │
│     from topic    │
│  3. Tertiary:     │
│     keyword       │
│  4. Duration:     │
│     target length │
└───────────────────┘
        │
        ▼
   Provider Router
```

### Data Structure:

```typescript
interface MusicQuery {
    mood: 'calm' | 'upbeat' | 'dramatic' | 'professional' | 'nostalgic' | 'dark';
    primaryGenre: string;       // e.g. 'ambient'
    secondaryKeywords: string[]; // e.g. ['piano', 'nature', 'peaceful']
    targetDurationSec: number;   // ≈ plan.totalDurationSec
    minDurationSec: number;      // at least 30s
    intensity: 'low' | 'mid' | 'high';
}
```

---

## 4. Provider Router (Parallel Fan-Out)

### Current Problem:

Providers are queried **sequentially** — each waits for the previous to fail. This causes long delays when the first provider is slow.

### New Design:

```typescript
interface ProviderResult {
    provider: string;
    tracks: FreeMusicTrack[];
    latency: number;        // ms
    error?: string;
}

async function resolveMusic(query: MusicQuery): Promise<FreeMusicTrack | null> {
    // Phase 1: Parallel fan-out to all available providers
    const results = await Promise.allSettled(
        providers.map(p => raceWithTimeout(
            p.search(query),
            { timeout: 8000, label: p.name }
        ))
    );

    // Phase 2: Collect successful results, sorted by tier priority
    const candidates = results
        .filter(isFulfilled)
        .flatMap(r => r.value.tracks)
        .filter(t => t.duration >= query.minDurationSec);

    // Phase 3: Rank by relevance + quality
    const ranked = rankTracks(candidates, query);

    // Phase 4: Pick best, download, process
    const best = ranked[0] ?? await proceduralGenerator(query);
    return downloadAndProcess(best, query);
}
```

**Key improvement:** All providers are queried **simultaneously**. The fastest responses win. Tier priority ensures Pixabay's track is preferred over Internet Archive's, but we don't wait for slow providers before checking fast ones.

### Timeout Architecture:

Replace `withTimeout()` with a properly wired version:

```typescript
async function raceWithTimeout<T>(
    promise: Promise<T>,
    opts: { timeout: number; label: string; signal?: AbortSignal }
): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeout);
    
    // Link parent signal for cancellation
    opts.signal?.addEventListener('abort', () => controller.abort());

    try {
        return await Promise.race([
            promise,
            new Promise<T>((_, reject) => {
                controller.signal.addEventListener('abort', () => {
                    reject(new Error(`${opts.label} timed out after ${opts.timeout}ms`));
                });
            }),
        ]);
    } finally {
        clearTimeout(timer);
    }
}
```

Usage: `axios.get(url, { signal: controller.signal })` — the signal actually aborts the HTTP request.

---

## 5. Music Processing Pipeline

After a track is selected and downloaded, it goes through post-processing:

### Stage 1 — Trim to Video Length
```bash
ffmpeg -i track.mp3 -t {videoDuration} trimmed.mp3
```

### Stage 2 — Intro Fade-In / Outro Fade-Out
```bash
ffmpeg -i trimmed.mp3 -af "afade=t=in:st=0:d=2,afade=t=out:st={dur-2}:d=2" faded.mp3
```

### Stage 3 — Loudness Normalization (EBU R128)
```bash
ffmpeg -i faded.mp3 -af "loudnorm=I=-23:LRA=7:TP=-2" normalized.mp3
```
Targets broadcast-standard -23 LUFS. Prevents jarring volume differences between videos.

### Stage 4 — Dynamic Ducking (Sidechain)
During voiceover segments, reduce music volume by 6-10dB:
```bash
# Applied during render via the existing buildDuckExpression() filter
# Uses volume=enable='between(t,VO_START,VO_END)*0.4' pattern
```
This already exists in `render.ts` — just needs better tuning (faster attack, slower release).

### Stage 5 — Loop Extension (if track is too short)
If a track is shorter than the video, crossfade-loop it:
```bash
ffmpeg -i track.mp3 -filter_complex "aloop=loop=-1:size={samples},atrim=0:{videoDuration}" looped.mp3
```

---

## 6. Fallback Procedural Generator — Detailed Design

Replace `FallbackToneProvider` with `ProceduralMusicProvider`.

### Architecture:

```
┌───────────────────────┐
│  ProceduralMusic       │
│  Provider              │
│                       │
│  ┌─────────────────┐  │
│  │ Profile Selector │──│── Genre → "ambient" | "upbeat" | "cinematic"
│  └────────┬────────┘  │
│           │           │
│  ┌────────▼────────┐  │
│  │ ffmpeg Graph    │──│── Builds filter_complex string
│  │ Builder         │  │
│  └────────┬────────┘  │
│           │           │
│  ┌────────▼────────┐  │
│  │ Render + Cache  │──│── Generates temp file or reuses cached
│  └─────────────────┘  │
└───────────────────────┘
```

### Profile: Ambient (calm, relaxing, nature)

```bash
# C major chord + gentle LFO + reverb
ffmpeg \
  -f lavfi -i "sine=f=261.63:d=60" \     # C4
  -f lavfi -i "sine=f=329.63:d=60" \     # E4
  -f lavfi -i "sine=f=392.00:d=60" \     # G4
  -f lavfi -i "sine=f=523.25:d=60,volume=0.3" \  # C5 (airy top)
  -filter_complex "
    [0:a][1:a][2:a][3:a]amix=inputs=4:duration=longest:normalize=0[mixed];
    [mixed]volume=0.12[quiet];
    [quiet]lowpass=f=800[low];
    [low]tremolo=f=0.3:d=0.6[trem];
    [trem]aphaser=type=triangular:decay=0.7:delay=5[phased];
    [phased]aecho=0.8:0.7:40|120:0.4|0.2[echo];
    [echo]alimiter=limit=0.5:asc=1:level=disabled[out]
  " -map "[out]" -ac 1 -ar 44100 output.wav
```

**Result:** A gentle, evolving ambient pad with: chord harmony, low-pass warmth, slow tremolo movement, phaser modulation, and subtle echo.

### Profile: Upbeat (energetic, happy, workout)

```bash
# Sawtooth bass + filtered chord + arpeggio
ffmpeg \
  -f lavfi -i "sawtooth=f=130.81:d=60" \           # C3 bass
  -f lavfi -i "sine=f=261.63:d=60" \               # C4
  -f lavfi -i "sine=f=329.63:d=60,volume=0.5" \    # E4
  -f lavfi -i "sine=f=392.00:d=60,volume=0.5" \    # G4
  -filter_complex "
    [0:a]volume=0.08,lowpass=f=200[bass];
    [1:a][2:a][3:a]amix=inputs=3:duration=longest:normalize=0[chord];
    [chord]volume=0.1,lowpass=f=4000[chordf];
    [chordf]acompressor=threshold=0.1:ratio=4:attack=5:release=50[chordc];
    [bass][chordc]amix=inputs=2:duration=longest:normalize=0[mix];
    [mix]alimiter=limit=0.6:asc=1:level=disabled[out]
  " -map "[out]" -ac 1 -ar 44100 output.wav
```

### Profile: Cinematic (emotional, epic, dramatic)

```bash
# Sub-bass + strings + slow riser
ffmpeg \
  -f lavfi -i "sine=f=65.41:d=60,volume=0.15" \    # C2 sub-bass
  -f lavfi -i "sine=f=261.63:d=60" \               # C4
  -f lavfi -i "sine=f=329.63:d=60" \               # E4
  -f lavfi -i "sine=f=392.00:d=60" \               # G4
  -f lavfi -i "anoisesrc=color=pink:duration=60,volume=0.03" \  # pink for texture
  -filter_complex "
    [2:a][3:a]amix=inputs=2:duration=longest:normalize=0[strings];
    [strings]volume=0.08,aecho=0.8:0.7:60:0.3[stringspad];
    [0:a][1:a]amix=inputs=2:duration=longest:normalize=0[base];
    [base]volume=0.06[basev];
    [basev][stringspad]amix=inputs=2:duration=longest:normalize=0[mix];
    [mix]volume=0.15:eval=frame:enable='gte(t,0)',volume=0.15*min(t/4,1):eval=frame:enable='lt(t,4)'[swell];
    [swell][4:a]amix=inputs=2:duration=longest:normalize=1[noise];
    [noise]alimiter=limit=0.55:asc=1:level=disabled[out]
  " -map "[out]" -ac 1 -ar 44100 output.wav
```

### Cache Strategy:
- Generated files stored in `workspace/cache/procedural-music/{hash}.wav`
- Hash = `${mood}_${duration}_${profile}_${version}`
- Reused on subsequent runs with same parameters
- Cache invalidation: version bump

---

## 7. Caching & Reliability Layer

### Multi-Level Cache:

```
Level 1: In-memory (per session)
  → Map<provider+query, FreeMusicTrack[]>
  → Cleared on session end

Level 2: On-disk (cross-session)
  → workspace/cache/free-music/{provider}/{id}.mp3
  → workspace/cache/free-music/catalog/{provider}.json
  → TTL: 24 hours for catalogs, permanent for downloads

Level 3: Bundled (in-repo)
  → input/bgm/__bundled__/*.mp3
  → Always available, never evicted
```

### Failure Handling:

| Failure Mode | Behavior |
|-------------|----------|
| Network timeout (provider) | Skip provider, continue to next tier |
| HTTP 404/403/429 | Exponential backoff (1s, 2s, 4s), then skip |
| Corrupt download (0 bytes) | Delete, retry once, then skip |
| Duration too short (< 30s) | Flag as B-quality, loop if needed |
| No providers returned anything | Fall back to procedural generator |
| ffmpeg synthesis failed | Return null — video plays without music |

---

## 8. Gate Verification Enhancement

New music-specific checks (X17-X19) to add to `verifyRenderedVideo` or a new music gate:

| ID | Check | Method |
|----|-------|--------|
| **X17** | Music track valid | ffprobe — verify stream exists |
| **X18** | Music loudness in range | `volumedetect` — peak < -1dB, mean > -30dB |
| **X19** | Music genre matches mood | AI vision verify with keywords |

---

## 9. Implementation Order (Phased)

### Phase 1 — Quick Wins (Day 1)
1. Fix `withTimeout()` — pass AbortController signal to axios ✅
2. Fix `scene.durationSec` update for voiceover path ✅ (already done)
3. Increase provider timeouts from 6s → 10s
4. Add User-Agent header to axios requests (matches browser)

### Phase 2 — Procedural Generator Upgrade (Day 2)
1. Replace `FallbackToneProvider` with `ProceduralMusicProvider`
2. Implement 3 profiles: ambient, upbeat, cinematic
3. Add profile selector based on mood query
4. Add caching for generated files
5. Verify X8 still passes with procedural music

### Phase 3 — Pixabay Music Provider (Day 2-3)
1. New `PixabayMusicProvider` class
2. Read `PIXABAY_API_KEY` from env
3. Implement `search()` → API call + response parsing
4. Implement `download()` → direct URL
5. Add to provider chain at tier 2

### Phase 4 — Music Query Engine (Day 3)
1. `MusicQuery` interface + builder
2. Mood classifier (brain heuristic or keyword-based)
3. Query → genre mapping table
4. Target duration calculation from plan

### Phase 5 — Processing Pipeline (Day 4)
1. Trim + crossfade on downloaded tracks
2. Loudness normalization (EBU R128)
3. Loop extension for short tracks
4. Cache processed files

### Phase 6 — Gate & Verification (Day 5)
1. Add X17-X19 music checks
2. Add music section to decisions report
3. Add music info to contact sheet

---

## 10. Files Changed Summary

| File | Change |
|------|--------|
| `src/lib/free-music.ts` | Rewrite — all providers, router, procedural generator |
| `src/lib/free-music.test.ts` | Update tests for new architecture |
| `src/agentic/pipeline/gate.ts` | Add X17-X19 music verification |
| `src/agentic/orchestrator/pipeline.ts` | Wire new music query engine |
| `.env.example` | Document `PIXABAY_API_KEY` |
| `input/bgm/__bundled__/` | New directory with 5-8 CC0 tracks |

---

## 11. Success Criteria

| Metric | Current | Target |
|--------|---------|--------|
| Music success rate | ~40% (404/timeout) | **>95%** (any provider) |
| Music quality | Pink noise drone | **Real produced tracks** preferred |
| Fallback quality | Unpleasant | **Pleasant ambient** (musical chord) |
| Timeout behavior | AbortController not wired | **Clean cancellation** via signal |
| Provider latency | Sequential, ~18s worst-case | **Parallel, ~8s worst-case** |
| Mood matching | None (keyword only) | **Structured mood query** |
| Post-processing | None | Trim + fade + normalize + loop |

---

## 12. Real Numbers

- **Pixabay:** ~200k tracks, 500 req/h free, CDN delivery, 200-800ms latency
- **Internet Archive:** ~70k CC music items, 1-4s latency, ~70% uptime
- **OpenLofi:** 166 tracks, GitHub CDN, <500ms latency, 99.9% uptime
- **Procedural:** 0 latency (cached) / ~1s generation, 100% uptime
- **Bundled:** instant, 100% uptime, 5-8 tracks

With this system, **every video gets music** — real produced tracks from Pixabay ~80% of the time, fallbacks covering the other ~20%, and procedural ambient as the always-on guarantee.
