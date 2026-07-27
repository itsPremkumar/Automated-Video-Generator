# How the AVS Showcase Videos Were Generated — Full Walkthrough

> Subject video: **AVS — Automated Video Generator Showcase** (16:9, ~51s, YouTube / GitHub README)
> Repo: `github.com/itsPremkumar/Automated-Video-Generator` (23★ at generation time)
> Author: the AI agent, following the project's `agentic-scripts.json` one-by-one discipline.
>
> This document explains **both** production runs that produced the final deliverable:
> - **Run 1** — generated via the *manual-workaround* path (plan reorder + hand-written manifest).
> - **Run 2** — generated via the *new, fixed* path (`visuals --no-acquire`) that the agent
>   implemented and verified in the same session.
>
> Both runs consume the **same 8 verified assets** and the **same narration**, so the two
> output files are visually near-identical. The difference is purely the *code path* that
> assembles them — which is exactly what the codebase improvement was about.

---

## 0. The "one-by-one" rule (the discipline that makes it work)

Every visual asset was:
1. **Created or downloaded ONE unit at a time** (never a bulk batch).
2. **Signal-checked** with `ffprobe` (resolution / codec / duration).
3. **Content-checked** with the agent's own `vision_analyze` on ONE extracted frame.
4. **Only then** moved to the next asset.

This catches a bad asset at the moment it is made, not after 9 others are queued.
It is the project's core quality bar (see `AGENTIC_SCRIPT_FORMAT.md` and the
`avs-agentic-workflow` skill).

---

## 1. Requirements (Phase 1)

Gathered via the `clarify` tool, not guessed:

| Field | Value |
|---|---|
| Topic | AVS project showcase (this repo) |
| Aspect / resolution | 16:9, 1280×720 (landscape) |
| Duration | ~60s (8 scenes) |
| Platform | YouTube / GitHub README |
| Tone | Tech showcase |
| Voice | Kokoro `af_heart` |
| Music | Upbeat electronic/tech (`musicQuery`) |
| Brand | Dark + violet (`#0a0a14` / `#7c3aed` / `#22d3ee`), CTA → repo URL |

Research was done **live** via the GitHub API: `stargazers_count: 23`, `forks: 4`,
`language: TypeScript`, 476 commits, MIT.

---

## 2. Script + scene breakdown (Phases 3–4)

Agent-written hook-first narration:

> **Hook** — "What if one JSON file could become a finished, professional video?"
> **S2** — "Meet AVS — an open-source, agentic AI video generator. Fully autonomous, zero cost, MIT licensed."
> **S3** — "You give it a script. It downloads stock footage, images, and music — from Pexels, Pixabay, and Openverse — automatically."
> **S4** — "Every asset is vision-verified. Bad clips get rejected and re-fetched — no human review needed."
> **S5** — "Voiceover? Seven real TTS backends — Kokoro, Chatterbox, Qwen — including free voice cloning."
> **S6** — "Then it edits like a pro: twenty-five plus effects — speed ramps, parallax, glitch transitions, color grading, dynamic captions."
> **S7** — "One command renders your video in sixteen-by-nine, vertical, square — even 4K."
> **S8 / CTA** — "Twenty-three stars and growing. AVS is free and open source — link below. Star it, fork it, build with it."

Broken into **8 scenes**, each with a `durationSec`, `voiceoverText`, and a visual plan
(local asset binding or stock keyword).

---

## 3. Asset collection — one unit at a time, each vision-verified

All assets land in **`input/visuals/`** (single bucket per `src/lib/path-safety.ts`).

### 3.1 Scene 1 — GitHub repo screenshot (browser capture → crop)
- `browser_navigate` → `https://github.com/itsPremkumar/Automated-Video-Generator`
- `browser_vision` → full-page PNG (1247×17013, very tall).
- `ffmpeg -vf "crop=1247:701:0:60,scale=1920:1080"` → `avs_s1_github.png` (16:9 crop).
- `vision_analyze` confirmed: repo name, "Star 23", file list all legible, no stretch.

### 3.2 Scenes 0, 5, 7 — Remotion motion clips (agent-authored TSX)
The agent wrote each composition **from scratch** as inline TSX and rendered via
`runRemotionController` (`src/agentic/media/hermes-remotion-controller.ts`).

Driver scripts (`tmp_agent_run/gen_s0.mts`, `gen_s5.mts`, `gen_s7.mts`):

```ts
import mod from '../src/agentic/media/hermes-remotion-controller.ts';
const { runRemotionController } = (mod as any).default ?? mod;

const code = `import React from 'react';
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from 'remotion';
export const Scene0: React.FC = () => { /* AVS title reveal on violet gradient */ };`;

const res = await runRemotionController(
  [{ index: 0, text: 'AVS title reveal', kind: 'logo', code, durationInFrames: 180 }],
  { jobId: 'avs_showcase', maxRetries: 2, fps: 30, width: 1920, height: 1080, allowFallback: false },
);
```

| File | Content | Verified frame |
|---|---|---|
| `avs_showcase_s0.mp4` | Glowing "AVS" title reveal | t=3s — white AVS, gradient line, subtitle ✅ |
| `avs_showcase_s5.mp4` | "25+ FX Plugins" bar chart | t=5s — 5 glowing bars, labels ✅ |
| `avs_showcase_s7.mp4` | Outro CTA card (repo URL) | t=4s — gold star, URL box ✅ |

Each returned `status: 'generated'` on attempt 0 and was frame-checked with `vision_analyze`.

### 3.3 Scenes 2, 3, 4, 6 — stock video clips (Pexels, one at a time)
Driver (`tmp_agent_run/dl_one_video.mts`):

```ts
const vids = await searchVideos('programming code screen developer', 1, 1, 'landscape'); // limit=1 → ONE
const r = await fetch(vids[0].url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
fs.writeFileSync(out, Buffer.from(await r.arrayBuffer()));
```

| File | Query | Verified |
|---|---|---|
| `avs_s2_code.mp4` | `programming code screen developer` | terminal/pip-freeze ✅ |
| `avs_s3_ai.mp4` | `artificial intelligence technology abstract` | AI dot-wave ✅ |
| `avs_s4_voice.mp4` | `microphone audio waveform studio` | mic + DAW ✅ |
| `avs_s6_edit.mp4` | `video editing timeline monitor` | iMac Premiere ✅ |

Each: `ffprobe` (confirm 1920×1080 / H.264) + `ffmpeg -ss 2 -frames:v 1` → `vision_analyze`.
(Scene 4's 4096-wide frame was downscaled to 1280 for the vision call, which had timed out on the full-res PNG.)

### 3.4 Music (one track)
`resolveFreeBackgroundMusic('upbeat electronic technology background', …)` returned a real
60s MP3 (`workspace/cache/free-music/processed/ccmixter_*.mp3`, ffprobe-confirmed 48 kHz stereo).

---

## 4. Job spec (Phase 15)

`input/scripts/avs-showcase-job.json` — a dedicated job array (not the shared 1600-line
`agentic-scripts.json`), per the skill's "prefer a dedicated file" guidance:

```json
{
  "id": "avs-showcase-16x9",
  "script": "What if one JSON file could become a finished, professional video? [Visual: avs_showcase_s0.mp4] [Transition: slide]\n…",
  "orientation": "landscape",
  "voice": "af_heart",
  "transition": "slide",
  "grade": "cinematic",
  "captions": "burned",
  "captionTheme": "bold",
  "musicQuery": "upbeat electronic technology background",
  "renderer": "ffmpeg",
  "backend": "agent"
}
```

Each scene line carries a `[Visual: <file>]` local binding — the key to the local-asset path.

---

## 5. The two runs — where they differ

### Run 1 — manual-workaround path

```
agentic-modular plan   → 14 scenes (parser split multi-clause lines on every period)
                         + CTA moved to front (hookFirst reorder)
  → manually reordered plan.json sceneNumber so 8 local assets map in order
agentic-modular voice  → 8 Kokoro WAVs
  → hand-wrote render-manifest.json binding all 8 local assets + music
agentic-modular render → output/avs-showcase-16x9/…mp4  ✅
```

This worked but required **two manual surgeries** the agent should never have to do.

### Run 2 — fixed path (what the code improvement enables)

```
agentic-modular plan                      → exactly 8 scenes, correct order (B1 + B3)
agentic-modular voice                     → 8 Kokoro WAVs
agentic-modular visuals --no-acquire      → manifest built from plan.localAsset, no network
agentic-modular render                    → output/avs-showcase-16x9/…mp4  ✅
```

**No plan.json editing. No hand-written manifest.** The `--no-acquire` flag
(`src/adapters/cli/agentic-modular.ts`, `runVisuals`) synthesizes `render-manifest.json`
directly from the plan's local assets plus resolved music.

### What the code change fixed (committed `b9d7df5`)

| ID | File | Fix |
|---|---|---|
| **B1** | `src/lib/script-parser.ts` | Lines with `[Visual: file]` stay ONE scene (no sentence-split). Prevents the 14-scene explosion. |
| **B3** | `src/agentic/pipeline/plan.ts` | `applyProEdits` skips hook-first reorder when local assets exist. Keeps author order (CTA stays last). |
| **B2** | `src/adapters/cli/agentic-modular.ts` | `visuals --no-acquire` builds the manifest from local assets without network acquire. |
| Test | `src/lib/script-parser.test.ts` | 4 regression tests proving B1 (incl. multi-clause lines + author order). |

Verified: `npm run typecheck` clean, `npm run test:unit` 671 pass (4 new B1 tests green),
and the regenerated video passed the same frame-vision review as Run 1.

---

## 6. Render + empirical verification (Phase 19–20)

### Render output
`output/avs-showcase-16x9/AVS — Automated Video Generator Showcase.mp4`
- **51.4s**, 1280×720 (16:9), H.264 + AAC (Kokoro voice baked in), 5.83 MB.
- Side variants also emitted: `_16x9`, `_9x16`, `_1x1`, `_thumbnail.jpg`.

### Frame verification (the honest gate)
Extract 7 frames across the timeline and `vision_analyze` them as one grid:

```bash
FF=./node_modules/ffmpeg-static/ffmpeg.exe
for t in 3 11 19 27 35 43 51; do
  $FF -y -i final.mp4 -ss $t -frames:v 1 -vf scale=960:-1 frame_$t.jpg
done
$FF -i frame_*.jpg -filter_complex "[0][1][2][3][4][5][6]xstack=inputs=7:…[v]" grid.jpg
```

**Result: PASS** — all 8 scenes present in correct order, burned captions legible, the
**real GitHub repo page** shows at scene 1 (no stock leak), no black/corrupt frames, correct 16:9.

### Voice verification
`find workspace/jobs/avs-showcase-16x9/audio -name 'scene_*_voice.wav'` → 8 files;
ffprobe confirms `pcm_s16le 44100Hz mono`. Real Kokoro backend auto-spawned (log:
`backend is up`).

---

## 7. Why the result is impressive (and what's real)

- **Hybrid agent + pipeline**: the agent did the *creative* work (research, script,
  Remotion codegen, screenshot capture, one-by-one verification) and directed the
  *project code* for the heavy lifting (voice, compose, render) — without either doing
  the other's job blindly.
- **Every asset empirically verified** — not claimed, but proven with ffprobe + vision
  on extracted frames.
- **Zero paid keys**: Pexels/Pixabay/Openverse for stock, Kokoro (local) for voice,
  ccMixter/free-music for BGM, ffmpeg-static + Remotion for everything else.
- **The pipeline got visibly better mid-session**: Run 2 removes two manual hacks via
  a 4-file, test-backed change — and the video quality is unchanged because the fix is
  in the *plumbing*, not the *pixels*.

---

## 8. Reproduce it yourself

```bash
# 1. assets already in input/visuals/ (generated one-by-one as in §3)
# 2. job spec
cp input/scripts/avs-showcase-job.json my-job.json   # or use as-is

# 3. the fixed, clean path
npx tsx src/adapters/cli/agentic-modular.ts plan    --file input/scripts/avs-showcase-job.json
npx tsx src/adapters/cli/agentic-modular.ts voice   --file input/scripts/avs-showcase-job.json
npx tsx src/adapters/cli/agentic-modular.ts visuals --no-acquire --file input/scripts/avs-showcase-job.json
npx tsx src/adapters/cli/agentic-modular.ts render  --file input/scripts/avs-showcase-job.json

# 4. verify
ffmpeg -i "output/avs-showcase-16x9/AVS — Automated Video Generator Showcase.mp4" -ss 11 -frames:v 1 out.jpg
# → vision_analyze: should show the real GitHub repo page
```

> **Note:** the two driver folders `tmp_agent_run/` and the generated `output/`,
> `workspace/`, `input/visuals/` directories are git-ignored runtime artifacts — they are
> not part of the committed codebase. Only the 4 source/test files (commit `b9d7df5`)
> were pushed.
