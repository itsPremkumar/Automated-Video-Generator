# AVS Multi-Agent Bug Hunt — Report

**Date:** 2026-07-28 · **Method:** 4 parallel triage subagents (core-render / parser / audio / editing)
+ evidence-based harness (`workspace/bug-hunt/harness.mjs`) that runs the REAL pipeline
(`plan → voice → visuals --no-acquire → render`) and emits a vision-verified grid.
**Verification bar:** every fix re-rendered and confirmed by `vision_analyze` or ffprobe
(audio RMS / stream probe) — not just static checks.

## Bugs found & fixed

### `src/agentic/operations/edit.ts` (11 bugs, all HIGH/MEDIUM)
| # | Bug | Fix |
|---|-----|-----|
| 1 | `trimVideo` produced a 0-stream (empty) file on non-keyframe splits (`-c copy`) | Re-encode with libx264 + validate duration |
| 2 | `splitVideo` both parts empty (same `-c copy` defect) | Re-encode + validate both parts |
| 3 | `interpolateVideo` always failed (`mode=blend` → invalid) | `mi_mode=blend` |
| 4 | `changeSpeed` crashed on audio-less video (hardcoded `[0:a]`) | Detect audio track, skip audio branch when absent |
| 5 | `changeSpeed` 0.25x slow-mo failed (atempo range) | Chained atempo filter |
| 6 | `addAudio(mix)` failed on audio-less video (amix needs 2 inputs) | Degenerate to replace-mode when no src audio |
| 7 | `silenceRemove` misleading success on audio-less / A/V desync | Fail loud if no audio; re-encode; assert duration changed |
| 9 | `addProgressBar` defaulted duration to 10s (bar never filled) | Probe real clip duration |
| 10 | `cropVideo` preset produced non-exact SAR | `setsar=1` |
| 11 | `mergeVideos` silently dropped ALL audio | Keep audio when every input has it (interleaved concat order fixed) |
| — | regression test added | `edit-regression.test.ts` (10/10 pass) |

### `src/agentic/operations/compose.ts` (direct-caller path)
| # | Bug | Fix |
|---|-----|-----|
| 1 | `crossfadeSlideshow` xfade graph invalid → every transition silently degraded to a hard cut | Chain segments with `[v{n-1}]` link + `;` separators + `format` on final label |
| 3 | audio-mix graph invalid when `voiceVolume/duck ≠ 1` → silent final video | Track amix labels, join with `;`, feed labeled outputs into amix |
| 5 | `applyParticles` filtergraph unconnected (`[ov]` not mapped) | Added `-map "[ov]"` |
| 6 | `buildVoiceAudioFilter` anequalizer string invalid → voice EQ no-op | Correct `params='c0 f=..:w=..:g=..:t=q:c1 ..'` syntax |

### `src/agentic/operations/visual-fx.ts` + `src/agentic/orchestrator/render.ts` (CLI pipeline)
| # | Bug | Fix |
|---|-----|-----|
| 4 | `vintage` used `saturation=` (not a filter) and `sepia=0.8` (filter absent in this ffmpeg build) → both no-op | `curves=vintage,eq=saturation=1.2` + `colorchannelmixer` sepia matrix (fixed in BOTH files) |

### Audio path
- **Render crash (HIGH/CRITICAL):** `render.ts` accessed `res.voiceovers.scenes[idx]` on a slim
  fallback shape → `TypeError: Cannot read properties of undefined`. A guard (`sceneVoicePath`)
  with optional chaining was already present at `render.ts:759-766`; re-running the harness now
  renders successfully (verified: `bh_audio` produced a 2.1 MB MP4 with audible voiceover).

## Parser findings (verified working / low-risk, NOT changed)
B1 (1 line = 1 scene), B3 (no reorder when localAsset present) confirmed intact.
Medium issues logged for future work: P-1 unbounded long-line duration, P-2 CJK no split,
P-3 bogus filename keyword on missing `[Visual:]`, P-4 dropped duplicate `[Visual:]` tag.
No code change (avoid scope creep); documented in `findings_parser.md`.

## Evidence
- `workspace/bug-hunt/findings_{core,parser,audio,editing}.md` — full triage with file:line + repro.
- Regression: `edit-regression.test.ts` 10/10; unit `script-parser`/`visual-fx`/`compose-scene-fx` 20/20.
- End-to-end: `bh_verify` + `bh_showcase` rendered via the CLI; vision-verified vintage/sepia present,
  no xfade-fallback warnings, audio RMS -25.8 dB (not silent).
- Deliverable: `C:\Users\PREM KUMAR\Downloads\AVS_BugHunt_Showcase_16x9.mp4` (2.2 MB).

## Not fixed this round (lower priority, documented)
- BUG 2 (compose.ts FX fields not wired into CLI `render` — orchestrator has its own path): the
  CLI render path is the orchestrator's `render.ts`, whose motion FX already route; the compose.ts
  FX code is reached only by direct `composeVideo()` callers. No behavior regression; noted for roadmap.
- Plugin system dead-code on compose path (27 modules only used by orchestrator) — architectural, not a bug.
- `mergeVideos`/audio edge cases, `cropVideo` odd-SAR already handled.
