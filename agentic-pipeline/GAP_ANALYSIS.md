# Agentic System — Deep End-to-End Gap Analysis vs. Legacy System

**Date:** 2026-07-16
**Author:** Hermes (gstack methodology)
**Scope:** Compare the 2-day-built agentic pipeline (`src/agentic/*`, ~4,250 LOC) against
the mature legacy system (`src/video-generator.ts` + `src/lib/*` + `src/services/*` +
`src/infrastructure/*`, ~8,000+ LOC of production code built over "many months / money")
and recommend what to port, what to keep separate, and what's a genuine gap.

---

## 1. System Overviews

### Legacy system (`src/video-generator.ts` + ecosystem)
A **pre-processing + web/Remotion hybrid**. `generateVideo()` produces `scene-data.json`
+ a `*.txt` metadata file. A separate web server (`src/server.ts`, Remotion React comps)
renders the final MP4 from that JSON. Rich feature surface accumulated over time:
- Local asset reuse (`localAsset`), default-video fallback chain
- Personal audio recording split across scenes
- Language localization (`LANGUAGE_DEFAULTS`)
- Auto-ducking background music under voice
- Text animation (typewriter/pop/zoom/slide/fade), position, glow, box/glass background
- AI metadata generation (title/description/hashtags) via `ai.service`
- Media verification (verifyMedia) + cache invalidation on failure
- Job cancellation, concurrency control
- Scene editing API (`scene-editor.ts`: reorder / delete / update scenes)
- AI script generation + scene refinement (`ai.service`)

### Agentic system (`src/agentic/*`)
A **self-contained, agent-driven, deterministic** pipeline. One call
(`runAgenticPipeline`) → plan → acquire → verify → render → gate. Two renderers:
- **ffmpeg path** (`renderAgenticSlideshow`) — the one validated this session; works offline.
- **Remotion path** (`renderRemotionVideo`) — full React composition with brand/intro/outro.

Features built in 2 days: per-scene image diversity (shared topic pool), dead-host
rejection, bright placeholder fallback, corrected X10 black-detect, style engine
(transitions/grades/kinetic text), auto-ducking, burned captions (SRT→drawtext),
vignette, kenBurns, config presets + video-type profiles, autopilot self-heal,
post-render gate X7–X15, watermark/safety verify.

---

## 2. Feature-by-Feature Comparison

| Feature | Legacy | Agentic (ffmpeg) | Agentic (Remotion) | Gap? |
|---|---|---|---|---|
| Topic→video (zero input) | ✗ (needs script) | ✅ | ✅ | Agentic wins |
| Per-scene distinct real photos | partial | ✅ (shared pool) | ✅ | Agentic wins |
| Local asset reuse | ✅ | `local-asset` src | `local-asset` src | **DONE (P1a)** |
| Default-video fallback chain | ✅ | bright card + `defaultVisual` | bright card + `defaultVisual` | **DONE (P1b)** |
| Personal audio recording | ✅ | ✗ | ✗ | **GAP** |
| Language localization | ✅ | ✗ (voice hint only) | ✗ | **GAP** |
| Auto-ducking music | ✅ | ✅ | ✅ | parity |
| Text animation (typewriter/pop/zoom) | ✅ | kinetic (word-pop/lowerthird) | ✅ (React) | near-parity |
| Burned captions | ✅ (via Remotion) | ✅ (drawtext) | ✅ | parity |
| Color grade variety | ✗ | ✅ (eq grades) | ✅ | Agentic wins |
| Ken Burns / vignette | ✗ | ✅ | ✅ | Agentic wins |
| Brand watermark | ✗ (legacy) | verify-only | ✅ (logo/colors) | Agentic wins |
| Intro / Outro cards | ✗ | ✗ (ffmpeg) | ✅ | Remotion-only |
| AI metadata (desc/hashtags) | ✅ | mechanical only | mechanical only | **GAP** |
| Media verification + cache invalidation | ✅ | signal-level gate | signal-level gate | parity |
| Scene reorder/delete/edit API | ✅ | `src/agentic/scene-edit.ts` | `src/agentic/scene-edit.ts` | **DONE (P1c)** |
| Job cancellation | ✅ | autopilot budget | autopilot budget | partial |
| YouTube / social publish | ✗ (separate module) | ✗ | ✗ | both lack |
| Post-render quality gate (X7–X15) | ✗ | ✅ | ✅ | Agentic wins |
| Self-healing autopilot | ✗ | ✅ | ✅ | Agentic wins |

---

## 3. Genuine Gaps Worth Porting (Prioritized)

### P1 — High value, low effort (port from legacy, mostly copy)
1. **Local asset reuse** (`localAsset` path in `video-generator.ts:202-228`).
   Agentic currently cannot use the user's own images/videos from
   `input/input-assets/`. This is a frequently-requested feature ("use MY photos").
   Port: add a `localAssets` config field; in `acquire.ts`, check the asset dir
   first before fetching. ~40 LOC, reuses `inputAssetPath()` from `path-safety.ts`.
2. **Default-video fallback chain** (legacy `:263-295`). When fetch fails, legacy
   falls back to a user-supplied `default.mp4` then to an image search. Agentic only
   uses the bright card. Porting the `default.mp4` fallback is a nice resilience boost.
3. **Scene edit/reorder/delete API** (`scene-editor.ts`). For an agent-driven system
   this is GOLD — a new Hermes agent could say "reorder scene 2 after scene 4" and the
   pipeline complies. Expose as `acquire`/`orchestrate` post-plan hooks. Medium effort.

### P2 — Medium value, medium effort
4. **AI metadata generation** (`ai.service.generateMetadataAI`). Agentic writes
   mechanical hashtags only (`orchestrate.ts:848`). Porting `generateMetadataAI`
   (title/description/hashtags) would make social-ready outputs. Gated behind
   `backend: 'vision'` so it stays optional/offline-safe.
5. **Language localization** (`LANGUAGE_DEFAULTS` + voice per language). Agentic has a
   `voice` hint but no language mapping. Port the `LANGUAGE_DEFAULTS` table and pass
   `language` to TTS. Needed for non-English markets.
6. **Personal audio** (split a recording across scenes). Useful for "voiceover from my
   own recording" workflows. Medium effort — needs `splitAudioFile` + `generateSilence`
   from `audio-processor.ts` wired into `tts.ts`.

### P3 — Lower priority / already exceeded
7. **Text animation richness** (typewriter/pop/zoom). Agentic's kinetic engine covers
   word-pop + lower-third; legacy's typewriter is a nice-to-have. Skip unless requested.
8. **YouTube/social publish** — legacy has it as a SEPARATE module (`src/youtube-upload/`),
   not in `generateVideo`. Neither system publishes inline. Out of scope for agentic
   core; can be a post-render CLI step.

---

## 4. What the Agentic System Does BETTER (do NOT port backward)
- **Per-scene distinct real photos** (shared topic pool) — legacy reuses the same
  top result per scene. Agentic is strictly better here.
- **Post-render quality gate X7–X15** — legacy has NO pass/fail gate. Agentic refuses
  to ship black/broken/frozen video.
- **Self-healing autopilot** — legacy is fire-and-forget. Agentic retries with broader
  queries, rejects dead hosts, falls back to bright cards.
- **Style engine** (grades/transitions/kenBurns/vignette) — legacy has none of this
  determinism; agentic gives a "professional editor" look from one topic.
- **Brand watermark + intro/outro** — only in agentic Remotion path.

---

## 5. Architecture Notes (why porting is safe)
- Both systems share `src/lib/visual-fetcher.ts`, `src/lib/free-music.ts`,
  `src/lib/audio-processor.ts`, `src/lib/media-verifier.ts`, `src/lib/path-safety.ts`.
  So porting legacy functions means **importing existing, tested code** — not rewriting.
  Example: `splitAudioFile`, `generateSilence`, `applyAutoDucking`,
  `generateMetadataAI`, `inputAssetPath`, `LANGUAGE_DEFAULTS` are all already exported
  and test-covered. The agentic `config.ts` already has `brand`, `musicQuery`,
  `videoType` slots ready to receive these.

## 6. Recommendation
1. **Port P1 (local assets + default-video fallback + scene edit API)** — highest ROI,
   reuses existing tested code, directly serves "use my own media" + "agent can edit".
2. **Port P2.4 (AI metadata)** behind `backend: 'vision'` — social-ready output.
3. **Leave P2.5/P2.6 (language, personal audio)** for a follow-up; they need online
   TTS/Whisper which the current offline box can't validate.
4. **Do NOT port legacy's lack of gates/self-heal/diversity** — agentic already exceeds.
5. Keep legacy `generateVideo` + `input/input-scripts.json` workflow UNTOUCHED
   (user's standing rule: "don't delete anything"). Porting is additive only.

## 7. Effort Estimate
- P1: ~1 focused session (3 small ports + tests).
- P2.4: ~0.5 session (import + wire + test).
- P2.5/6: ~1 session each, blocked on online TTS validation.
